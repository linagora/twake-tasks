import { Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode, SubmitEvent } from 'react'

export function FormPanel({
  title,
  onSubmit,
  actions,
  children
}: {
  title: string
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  actions: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="form"
      onSubmit={onSubmit}
      sx={{
        mt: 4,
        p: 3,
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper'
      }}
    >
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ fontWeight: 600, mb: 2 }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))'
        }}
      >
        {children}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          mt: 2
        }}
      >
        {actions}
      </Box>
    </Box>
  )
}

/** A field of a form panel across the whole width. */
export function FullWidth({ children }: { children: ReactNode }): ReactElement {
  return <Box sx={{ gridColumn: '1 / -1' }}>{children}</Box>
}

/** Fields side by side, the last one taking the room left. */
export function FieldRow({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, '& > :last-child': { flex: 1 } }}>
      {children}
    </Box>
  )
}

/** A form laid on the page, with no frame: its fields stacked, then its actions. */
export function PlainForm({
  id,
  onSubmit,
  actions,
  children
}: {
  /** For a submit button outside it, as in the page's header. */
  id?: string
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  actions?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    // The page says what its fields lack, where the browser would not.
    <Box
      component="form"
      id={id}
      noValidate
      onSubmit={onSubmit}
      sx={{ mt: 3, maxWidth: 960, display: 'grid', gap: 3 }}
    >
      {children}
      {actions && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  )
}

/** Fields side by side as room allows. */
export function FieldGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        pt: 1,
        gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))'
      }}
    >
      {children}
    </Box>
  )
}
