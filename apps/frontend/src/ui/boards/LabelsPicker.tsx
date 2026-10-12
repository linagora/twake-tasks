import { Icon, Pen } from '@linagora/twake-icons'
import { IconButton, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import {
  PickerCreate,
  PickerEmpty,
  PickerOption,
  PickerPopover
} from '@/ds/Picker'
import type { Label, Task } from '@/domain/board'
import { LabelDialog } from '@/ui/boards/LabelDialog'
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
  const [editing, setEditing] = useState<{ label?: Label } | null>(null)
  const save = useBoardChange(boardId, (api, labelIds: string[]) =>
    api.setLabels(boardId, task.id, labelIds)
  )
  const name = search.trim()
  const query = name.toLowerCase()
  const shown = labels.filter(label => label.name.toLowerCase().includes(query))
  const creatable =
    name !== '' && !labels.some(label => label.name.toLowerCase() === query)

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
    <>
      <PickerPopover
        label={t('board.labelsTitle', { key: task.key })}
        anchor={anchor}
        onClose={onClose}
        searchLabel={t('board.searchLabels')}
        search={search}
        onSearch={setSearch}
        footer={
          save.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('board.labelsFailed')}
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
            action={
              <IconButton
                size="small"
                aria-label={t('board.editLabel', { name: label.name })}
                onClick={() => {
                  setEditing({ label })
                }}
              >
                <Icon icon={Pen} size={14} />
              </IconButton>
            }
          >
            <LabelChip name={label.name} color={label.color} highlight={name} />
          </PickerOption>
        ))}
        {creatable && (
          <PickerCreate
            onCreate={() => {
              setEditing({})
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
      {editing && (
        <LabelDialog
          boardId={boardId}
          label={editing.label}
          initialName={name}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={saved => {
            setEditing(null)
            if (!editing.label) {
              setSearch('')
              apply(new Set(chosen).add(saved.id))
            }
          }}
        />
      )}
    </>
  )
}
