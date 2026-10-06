import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import {
  PickerCreate,
  PickerEmpty,
  PickerOption,
  PickerPopover
} from '@/ds/Picker'
import { ApiError } from '@/application/boards'
import type { Label, Task } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
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
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState(
    () => new Set(task.labels.map(label => label.id))
  )
  const create = useBoardChange(boardId, (api, labelName: string) =>
    api.createLabel(boardId, labelName)
  )
  const save = useBoardChange(boardId, (api, labelIds: string[]) =>
    api.setLabels(boardId, task.id, labelIds)
  )
  const name = search.trim()
  const query = name.toLowerCase()
  const shown = labels.filter(label => label.name.toLowerCase().includes(query))
  const creatable =
    name !== '' && !labels.some(label => label.name.toLowerCase() === query)
  const taken =
    create.error instanceof ApiError && create.error.code === 'label_taken'

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
    <PickerPopover
      label={t('board.labelsTitle', { key: task.key })}
      anchor={anchor}
      onClose={onClose}
      searchLabel={t('board.searchLabels')}
      search={search}
      onSearch={value => {
        setSearch(value)
        create.reset()
      }}
      footer={
        (create.isError || save.isError) && (
          <Typography role="alert" variant="caption" color="error">
            {create.isError
              ? taken
                ? t('board.labelTaken', { name })
                : t('board.labelFailed')
              : t('board.labelsFailed')}
          </Typography>
        )
      }
    >
      {shown.map(label => (
        <PickerOption
          key={label.id}
          checked={chosen.has(label.id)}
          onToggle={() => {
            toggle(label.id)
          }}
        >
          <LabelChip name={label.name} />
        </PickerOption>
      ))}
      {creatable && (
        <PickerCreate
          disabled={create.isPending}
          onCreate={() => {
            create.mutate(name, {
              onSuccess: label => {
                setSearch('')
                apply(new Set(chosen).add((label as Label).id))
              }
            })
          }}
        >
          {t('board.createLabel', { name })}
        </PickerCreate>
      )}
      {shown.length === 0 && !creatable && (
        <PickerEmpty>
          {name ? t('board.noMatches') : t('board.labelsHint')}
        </PickerEmpty>
      )}
    </PickerPopover>
  )
}
