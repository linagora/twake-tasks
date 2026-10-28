import { Pen } from '@linagora/twake-icons'
import { IconButton } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

import { ApiError } from '@/application/boards'
import { leastUsedColor } from '@/ds/ColorPicker'
import { LabelChip } from '@/ds/Columns'
import { Icon } from '@/ds/Icon'
import {
  PickerCreate,
  PickerEmpty,
  PickerError,
  PickerOption,
  PickerPopover
} from '@/ds/Picker'
import { labelName, type Label } from '@/domain/board'
import { LabelDialog } from '@/ui/boards/LabelDialog'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * The board's labels to check, with a way to create and edit them; saving
 * the checked ones is the caller's. A name typed in the search field is
 * created in the menu, in the color the board uses the least; with nothing
 * typed, a dialog asks for the name and color, as it edits a label.
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
  // A label to edit, or none to create one from a blank name.
  const [editing, setEditing] = useState<{ label?: Label } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const create = useBoardChange(
    boardId,
    (api, draft: Pick<Label, 'name' | 'color'>) =>
      api.createLabel(boardId, draft)
  )
  const name = labelName(search)
  const query = name.toLowerCase()
  const folded = (each: Label) => labelName(each.name).toLowerCase()
  const shown = labels.filter(each => folded(each).includes(query))
  const creatable = name !== '' && !labels.some(each => folded(each) === query)
  const taken =
    create.error instanceof ApiError && create.error.code === 'label_taken'
  const createNamed = () => {
    create.mutate(
      { name, color: leastUsedColor(labels.map(each => each.color)) },
      {
        onSuccess: created => {
          setSearch('')
          onCreated((created as Label).id)
          searchRef.current?.focus()
        }
      }
    )
  }

  return (
    <>
      <PickerPopover
        label={label}
        anchor={anchor}
        onClose={onClose}
        searchLabel={t('board.searchLabels')}
        searchRef={searchRef}
        countLabel={count => t('picker.count', { smart_count: count })}
        search={search}
        onSearch={value => {
          setSearch(value)
          if (create.isError) create.reset()
        }}
        footer={
          create.isError ? (
            <>
              <PickerError
                retryLabel={t('board.retryAssign')}
                onRetry={createNamed}
              >
                {taken
                  ? t('board.labelTaken', { name })
                  : t('board.labelFailed')}
              </PickerError>
              {footer}
            </>
          ) : (
            footer
          )
        }
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
            if (creatable) {
              if (!create.isPending) createNamed()
            } else setEditing({})
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
          onClose={() => {
            setEditing(null)
          }}
          onSaved={saved => {
            setEditing(null)
            if (!editing.label) onCreated(saved.id)
          }}
        />
      )}
    </>
  )
}
