import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { Label, Task } from '@/domain/board'
import { LabelsMenu } from '@/ui/boards/LabelsMenu'
import { useBoardChange } from '@/ui/queries/boards'
import { useI18n } from '@/ui/i18n/useI18n'

export function LabelsPicker({
  task,
  boardId,
  labels,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  labels: Label[]
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [chosen, setChosen] = useState(
    () => new Set(task.labels.map(label => label.id))
  )
  const save = useBoardChange(boardId, (api, labelIds: string[]) =>
    api.setLabels(boardId, task.id, labelIds)
  )

  const apply = (next: Set<string>) => {
    setChosen(next)
    save.mutate([...next], {
      onError: () => {
        setChosen(new Set(task.labels.map(label => label.id)))
      }
    })
  }
  const toggle = (labelId: string) => {
    const next = new Set(chosen)
    if (!next.delete(labelId)) next.add(labelId)
    apply(next)
  }

  return (
    <LabelsMenu
      label={t('board.labelsTitle', { key: task.key })}
      boardId={boardId}
      labels={labels}
      chosen={chosen}
      onToggle={toggle}
      onCreated={labelId => {
        apply(new Set(chosen).add(labelId))
      }}
      anchor={anchor}
      onClose={onClose}
      footer={
        save.isError && (
          <Typography role="alert" variant="caption" color="error">
            {t('board.labelsFailed')}
          </Typography>
        )
      }
    />
  )
}
