import { Checkbox } from '@linagora/twake-mui'
import type { KeyboardEventHandler, ReactElement } from 'react'

import type { CompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useI18n } from '@/ui/i18n/useI18n'

export function CompleteCheckbox({
  title,
  completion,
  onKeyDown
}: {
  title: string
  completion: CompleteToggle
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
}): ReactElement {
  const { t } = useI18n()
  return (
    <Checkbox
      size="small"
      checked={completion.done}
      disabled={completion.disabled}
      slotProps={{
        input: { 'aria-label': t('layout.complete', { title }) }
      }}
      onChange={completion.toggle}
      {...(onKeyDown && { onKeyDown })}
    />
  )
}
