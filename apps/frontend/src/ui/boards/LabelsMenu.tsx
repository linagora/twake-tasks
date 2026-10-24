import { Icon, Pen } from '@linagora/twake-icons'
import { IconButton } from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

import { LabelChip } from '@/ds/Columns'
import {
  PickerCreate,
  PickerEmpty,
  PickerOption,
  PickerPopover
} from '@/ds/Picker'
import { labelName, type Label } from '@/domain/board'
import { LabelDialog } from '@/ui/boards/LabelDialog'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * The board's labels to check, with a way to create and edit them; saving
 * the checked ones is the caller's.
 */
export function LabelsMenu({
  label,
  boardId,
  labels,
  chosen,
  onToggle,
  onCreated,
  anchor,
  onClose,
  footer
}: {
  label: string
  boardId: string
  labels: Label[]
  chosen: Set<string>
  onToggle: (labelId: string) => void
  onCreated: (labelId: string) => void
  anchor: HTMLElement
  onClose: () => void
  footer?: ReactNode
}): ReactElement {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ label?: Label } | null>(null)
  const name = labelName(search)
  const query = name.toLowerCase()
  const folded = (each: Label) => labelName(each.name).toLowerCase()
  const shown = labels.filter(each => folded(each).includes(query))
  const creatable = name !== '' && !labels.some(each => folded(each) === query)

  return (
    <>
      <PickerPopover
        label={label}
        anchor={anchor}
        onClose={onClose}
        searchLabel={t('board.searchLabels')}
        search={search}
        onSearch={setSearch}
        footer={footer}
      >
        {shown.map(each => (
          <PickerOption
            key={each.id}
            checked={chosen.has(each.id)}
            onToggle={() => {
              onToggle(each.id)
            }}
            action={
              <IconButton
                size="small"
                aria-label={t('board.editLabel', { name: each.name })}
                onClick={() => {
                  setEditing({ label: each })
                }}
              >
                <Icon icon={Pen} size={14} />
              </IconButton>
            }
          >
            <LabelChip name={each.name} color={each.color} highlight={name} />
          </PickerOption>
        ))}
        {shown.length === 0 && (
          <PickerEmpty>
            {name ? t('board.noMatches') : t('board.noLabels')}
          </PickerEmpty>
        )}
        <PickerCreate
          onCreate={() => {
            setEditing({})
          }}
        >
          {creatable ? t('board.createLabel', { name }) : t('board.newLabel')}
        </PickerCreate>
      </PickerPopover>
      {editing && (
        <LabelDialog
          boardId={boardId}
          label={editing.label}
          usedColors={labels.map(each => each.color)}
          initialName={creatable ? name : ''}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={saved => {
            setEditing(null)
            if (!editing.label) {
              setSearch('')
              onCreated(saved.id)
            }
          }}
        />
      )}
    </>
  )
}
