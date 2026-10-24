import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

interface NewTaskHighlight {
  key: string | null
  highlight: (key: string | null) => void
}

const NewTaskHighlightContext = createContext<NewTaskHighlight | null>(null)

/**
 * As Twake Drive does with an uploaded file, the task just created stands out
 * in its board until another is created or a task is opened from the board.
 */
export function NewTaskHighlightProvider({
  children
}: {
  children: ReactNode
}): ReactElement {
  const [key, highlight] = useState<string | null>(null)
  // Stable, or each render of the shell would render every task again.
  const value = useMemo(() => ({ key, highlight }), [key])
  return (
    <NewTaskHighlightContext value={value}>{children}</NewTaskHighlightContext>
  )
}

export function useHighlightNewTask(): (key: string) => void {
  const context = useContext(NewTaskHighlightContext)
  return key => {
    context?.highlight(key)
  }
}

/**
 * Whether the task `key` is the one just created, scrolled to once it shows,
 * and what ends its highlight.
 */
export function useNewTaskHighlight(key: string): {
  isNew: boolean
  clear: () => void
} {
  const context = useContext(NewTaskHighlightContext)
  const isNew = context?.key === key

  useEffect(() => {
    if (!isNew) return
    document.querySelector('[data-new-task]')?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth'
    })
  }, [isNew])

  return {
    isNew,
    clear: () => {
      context?.highlight(null)
    }
  }
}
