import { TextField, Typography } from '@linagora/twake-mui'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { CutTooltip } from '@/ds/CutTooltip'
import { PageTitle } from '@/ds/PageHeader'
import { TitleButton } from '@/ds/TitleButton'
import { isRenamable, type Board } from '@/domain/board'
import { useBoardName } from '@/ui/boards/BoardsScreen'
import { useRenameBoard } from '@/ui/queries/boards'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

export function BoardTitle({
  board,
  renaming,
  onRename,
  bare = false
}: {
  board: Board
  renaming: boolean
  onRename: (renaming: boolean) => void
  /** Without its heading, for a breadcrumb that is one. */
  bare?: boolean
}): ReactElement {
  const { t } = useI18n()
  const shownName = useBoardName()(board)
  const renamable = isRenamable(board)
  // The title takes the focus back from an editor that just closed, and on a
  // board just created, whose dialog took the focus with it
  const location = useLocation()
  const navigate = useNavigate()
  const created =
    (location.state as { created?: boolean } | null)?.created === true
  const [returned, setReturned] = useState(created)
  // Once: back, forward or a reload to this entry must not take the focus again
  useEffect(() => {
    if (created) void navigate(location, { replace: true, state: null })
  }, [created, location, navigate])

  if (renaming && renamable) {
    return (
      <TitleEditor
        board={board}
        onDone={() => {
          setReturned(true)
          onRename(false)
        }}
      />
    )
  }
  const name = renamable ? (
    <CutTooltip title={t('board.rename')}>
      <TitleButton
        focusOnMount={returned}
        onClick={() => {
          setReturned(false)
          onRename(true)
        }}
      >
        {shownName}
      </TitleButton>
    </CutTooltip>
  ) : (
    shownName
  )
  return bare ? (
    <>{name}</>
  ) : (
    <PageTitle variant="h3" component="h1" noWrap>
      {name}
    </PageTitle>
  )
}

// Mounted for one edit: its draft and its guard start afresh each time
function TitleEditor({
  board,
  onDone
}: {
  board: Board
  onDone: () => void
}): ReactElement {
  const { t } = useI18n()
  const rename = useRenameBoard(board.id)
  const [name, setName] = useState(board.name)
  // A blur follows Enter or Escape: save once
  const settled = useRef(false)

  const stop = (): void => {
    settled.current = true
    onDone()
  }
  const save = (): void => {
    if (settled.current || rename.isPending) return
    const next = name.trim()
    if (!next || next === board.name) {
      stop()
      return
    }
    rename.mutate(next, { onSuccess: stop })
  }

  return (
    <>
      <TextField
        label={t('board.renameName')}
        value={name}
        onChange={event => {
          setName(event.target.value)
        }}
        onKeyDown={event => {
          if (rename.isPending || event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          } else if (event.key === 'Escape') {
            stop()
          }
        }}
        onBlur={save}
        size="small"
        fullWidth
        inputRef={focusOnMount}
        slotProps={{
          htmlInput: { maxLength: 100, readOnly: rename.isPending }
        }}
      />
      {rename.isError && (
        <Typography role="alert" variant="caption">
          {t('board.renameFailed')}
        </Typography>
      )}
    </>
  )
}
