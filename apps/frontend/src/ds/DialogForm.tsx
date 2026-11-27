import { Box, DialogContent } from '@linagora/twake-mui'
import type { ReactElement, ReactNode, SubmitEvent } from 'react'

/**
 * The form around the title, content and actions of a dialog. In a full screen
 * one (`fullScreen`) it takes no box of its own (`display: contents`): the
 * paper, a flex column, lays the three parts out itself, so the content scrolls
 * and the actions stay in view. Used by: `NewTaskDialog`.
 */
export function DialogForm({
  fullScreen,
  onSubmit,
  children
}: {
  fullScreen: boolean
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="form"
      noValidate
      onSubmit={onSubmit}
      sx={fullScreen ? { display: 'contents' } : {}}
    >
      {children}
    </Box>
  )
}

/**
 * A message that stays in view between the content of a dialog and its actions:
 * a second content that never grows nor scrolls away, so it keeps the side
 * padding of the first. Used by: `NewTaskDialog`.
 */
export function DialogNotice({
  children
}: {
  children: ReactNode
}): ReactElement {
  return <DialogContent sx={{ flex: 'none', py: 1 }}>{children}</DialogContent>
}
