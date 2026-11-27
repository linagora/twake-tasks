import { WarningCircle } from '@linagora/twake-icons'
import type { Sdk } from '@linagora/twake-sdk'
import { skipToken, useIsMutating, useQuery } from '@tanstack/react-query'
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode
} from 'react'

import type { SessionService } from '@/application/session'
import type { IntentService, SavedTask } from '@/application/taskIntent'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { useI18n } from '@/ui/i18n/useI18n'
import {
  intentIdOf,
  parseTaskRequest,
  type TaskRequest
} from '@/ui/intents/intentRequest'
import { useBoards } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'
import { useReporting } from '@/ui/reporting/ReportingProvider'
import { useSession } from '@/ui/session/SessionGate'
import { NewTaskDialog } from '@/ui/shell/NewTaskDialog'

/** Starts the service of an intent on the user's platform. */
export type ConnectIntent = (
  sdk: Sdk,
  idToken: string,
  intentId: string
) => Promise<IntentService>

interface IntentPageProps {
  connect: ConnectIntent
  onSessionEnded: SessionService['onEndedElsewhere']
}

async function startIntent(connect: () => Promise<IntentService>) {
  try {
    const service = await connect()
    // Read once: later data of the client never replaces the form
    return { service, data: service.getData() }
  } catch (error) {
    console.error('The intent could not start:', error)
    throw error
  }
}

// The service of the intent and the data the client sent, null when this page
// cannot serve one. Started once, as a TanStack Query that never goes stale:
// the client takes a single handshake.
function useTaskIntent(connect: ConnectIntent) {
  const { sdk, user } = useSession()
  const { idToken } = user
  const intentId = intentIdOf(window.location)
  // Out of a frame there is no client to answer
  const start =
    window.parent !== window && sdk && idToken && intentId
      ? () => startIntent(() => connect(sdk, idToken, intentId))
      : null
  const intent = useQuery({
    queryKey: keys.intent(intentId ?? ''),
    queryFn: start ?? skipToken,
    staleTime: Infinity,
    retry: false
  })
  return start && !intent.isError ? { served: intent.data } : null
}

function useSessionEnded(
  onSessionEnded: SessionService['onEndedElsewhere']
): boolean {
  const [ended, setEnded] = useState(false)
  useEffect(
    () =>
      onSessionEnded(() => {
        setEnded(true)
      }),
    [onSessionEnded]
  )
  return ended
}

/**
 * The service of the intent `CREATE io.cozy.tasks`: a new task form, filled
 * by the app framing the page, which gets the task once saved, or nothing when
 * the form is closed. Used by: `IntentsApp`.
 */
export function IntentPage({
  connect,
  onSessionEnded
}: IntentPageProps): ReactElement {
  const { t } = useI18n()
  const intent = useTaskIntent(connect)
  const { reportCrash } = useReporting()
  // Listened to before the service is there, so that no end is missed
  const sessionEnded = useSessionEnded(onSessionEnded)

  if (!intent) return <IntentProblem />
  if (!intent.served) return <ListSkeleton label={t('intent.loading')} />
  const { service, data } = intent.served
  return (
    <IntentBoundary
      onCrash={(error, componentStack) => {
        reportCrash(error, componentStack)
        // Nothing of the error leaves the app
        service.throw(new Error('The new task form of Twake Project failed'))
      }}
    >
      <ServedIntent service={service} data={data} sessionEnded={sessionEnded} />
    </IntentBoundary>
  )
}

/**
 * Catches a crash of the served intent, so that the client gets an error
 * rather than waiting on an empty frame. A React error boundary, which only a
 * class can be: when a child throws while rendering, it shows why the page
 * cannot serve in its place and calls `onCrash`. It stands outside
 * `ServedIntent`, whose effects then never talk to a service already answered.
 * Known limit: what `ServedIntent` knew is lost with it, so a crash after a
 * task was saved, without its details or still saving, gives the client the
 * error, not the task. Used by: `IntentPage`.
 */
class IntentBoundary extends Component<
  {
    onCrash: (error: unknown, componentStack: string | null) => void
    children: ReactNode
  },
  { crashed: boolean }
> {
  override state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  override componentDidCatch(error: unknown, { componentStack }: ErrorInfo) {
    this.props.onCrash(error, componentStack ?? null)
  }

  override render() {
    return this.state.crashed ? <IntentProblem /> : this.props.children
  }
}

/** Why the page cannot serve: it is all the frame shows. */
function IntentProblem(): ReactElement {
  const { t } = useI18n()
  return (
    <main className="u-p-2">
      <EmptyState
        heading
        tone="error"
        icon={WarningCircle}
        title={t('intent.failed')}
        text={t('intent.failedHint')}
      />
    </main>
  )
}

interface Facts {
  attributes: { action: string; type: string }
  request: TaskRequest | null
  boardsFailed: boolean
  /** And no save is in flight, whose outcome comes first. */
  sessionOver: boolean
}

// What the client is told when its intent cannot be served, null when it can
function failureOf({
  attributes: { action, type },
  request,
  boardsFailed,
  sessionOver
}: Facts): string | null {
  if (action !== 'CREATE' || type !== 'io.cozy.tasks') {
    return `Twake Project does not handle ${action} ${type}`
  }
  if (!request) return 'The data of the intent has another shape'
  if (boardsFailed) return 'Twake Project could not load the boards'
  return sessionOver ? 'The session has ended' : null
}

const resultOf = ({ boardId, id, key, title }: SavedTask) => ({
  id,
  key,
  title,
  url: `${window.location.origin}/boards/${boardId}?task=${key}`
})

// The service takes one answer: the task if there is one, else the failure,
// else a cancel. A ref, as StrictMode runs effects twice.
function useAnswer(service: IntentService) {
  const answered = useRef(false)
  return useCallback(
    (task: SavedTask | undefined, failure: string | null) => {
      if (answered.current) return
      answered.current = true
      if (task) service.terminate(resultOf(task))
      else if (failure === null) service.cancel()
      else service.throw(new Error(failure))
    },
    [service]
  )
}

// Tells the client once that the form is shown, which has its own close button
function useReadyToUse(service: IntentService, shown: boolean): void {
  const told = useRef(false)
  useEffect(() => {
    if (!shown || told.current) return
    told.current = true
    service.hideCross()
    service.notifyReadyToUse()
  }, [service, shown])
}

function ServedIntent({
  service,
  data,
  sessionEnded
}: {
  service: IntentService
  data: unknown
  sessionEnded: boolean
}): ReactElement | null {
  const boards = useBoards()
  const saving = useIsMutating() > 0
  // Saved without all its details: still the task the client gets, as telling
  // it nothing was created would make it create another one
  const [unfinished, setUnfinished] = useState<SavedTask>()
  const [closed, setClosed] = useState(false)
  const request = parseTaskRequest(data)
  const failure = failureOf({
    attributes: service.getIntent().attributes,
    request,
    boardsFailed: boards.isLoadingError,
    sessionOver: sessionEnded && !saving
  })
  const answer = useAnswer(service)
  useReadyToUse(service, failure === null)
  useEffect(() => {
    if (failure !== null) answer(unfinished, failure)
  }, [failure, unfinished, answer])

  const close = (task: SavedTask | undefined) => {
    answer(task, null)
    setClosed(true)
  }

  if (closed || (failure !== null && unfinished)) return null
  if (failure !== null || !request) return <IntentProblem />
  return (
    <NewTaskDialog
      preset={{}}
      request={{ ...request, onUnfinished: setUnfinished }}
      onClose={() => {
        close(unfinished)
      }}
      onCreated={close}
    />
  )
}
