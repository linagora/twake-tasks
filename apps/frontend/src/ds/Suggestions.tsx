import { List, ListItemButton, Paper, Popper } from '@linagora/twake-mui'
import { Extension, type Editor } from '@tiptap/react'
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion'
import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'

export interface SuggestionOption {
  key: string
  /** The text that replaces the trigger and what was typed after it. */
  insert: string
  label: ReactNode
}

export interface Suggestions {
  /** The character that opens the list, such as "@". */
  trigger: string
  /** The listbox's accessible name. */
  label: string
  search: (query: string) => SuggestionOption[]
}

export interface SuggestionState {
  items: SuggestionOption[]
  pick: (option: SuggestionOption) => void
  clientRect: (() => DOMRect | null) | null
  query: string
}

export interface SuggestionHandlers {
  search: (query: string) => SuggestionOption[]
  show: (state: SuggestionState) => void
  hide: () => void
  keyDown: (event: KeyboardEvent) => boolean
}

// It runs before the keymaps that bind Enter and Tab, so choosing an option
// never splits the paragraph or indents a list item.
export interface SuggestionBridge extends SuggestionHandlers {
  trigger: string
}

export function suggestionsExtension(bridge: SuggestionBridge) {
  return Extension.create({
    name: 'suggestions',
    priority: 1000,
    addProseMirrorPlugins() {
      return [
        Suggestion<SuggestionOption, SuggestionOption>({
          editor: this.editor,
          char: bridge.trigger,
          dismissOnOutsideClick: false,
          items: ({ query }) => bridge.search(query),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, { type: 'text', text: props.insert })
              .setMeta('preventAutolink', true)
              .run()
          },
          render: () => {
            const show = (
              props: SuggestionProps<SuggestionOption, SuggestionOption>
            ) => {
              bridge.show({
                items: props.items,
                pick: props.command,
                clientRect: props.clientRect ?? null,
                query: props.query
              })
            }
            return {
              onStart: show,
              onUpdate: show,
              onExit: () => {
                bridge.hide()
              },
              onKeyDown: ({ event }) => bridge.keyDown(event)
            }
          }
        })
      ]
    }
  })
}

export const optionId = (listId: string, index: number): string =>
  `${listId}-option-${String(index)}`

/**
 * The listbox of an editor that keeps focus: the editor points at the active
 * option with aria-activedescendant. The popper follows the editor's own
 * document, which is not always the one this code runs in.
 */
export function SuggestionList({
  editor,
  listId,
  label,
  state,
  active
}: {
  editor: Editor
  listId: string
  label: string
  state: SuggestionState
  active: number
}): ReactElement {
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        state.clientRect?.() ?? editor.view.dom.getBoundingClientRect(),
      contextElement: editor.view.dom
    }),
    [editor, state]
  )
  return (
    <Popper
      open
      anchorEl={anchor}
      container={editor.view.dom.ownerDocument.body}
      placement="bottom-start"
      sx={theme => ({ zIndex: theme.zIndex.modal + 1 })}
    >
      <Paper
        elevation={8}
        sx={{ minWidth: 240, maxWidth: 'calc(100vw - 32px)' }}
      >
        <List
          id={listId}
          role="listbox"
          aria-label={label}
          dense
          sx={{ maxHeight: 280, overflowY: 'auto', py: 0.5 }}
        >
          {state.items.map((option, index) => (
            <SuggestionRow
              key={option.key}
              id={optionId(listId, index)}
              selected={index === active}
              onPick={() => {
                state.pick(option)
              }}
            >
              {option.label}
            </SuggestionRow>
          ))}
        </List>
      </Paper>
    </Popper>
  )
}

function SuggestionRow({
  id,
  selected,
  onPick,
  children
}: {
  id: string
  selected: boolean
  onPick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <ListItemButton
      component="li"
      role="option"
      id={id}
      aria-selected={selected}
      selected={selected}
      // The editor keeps its focus and caret while the pointer picks.
      onMouseDown={event => {
        event.preventDefault()
      }}
      onClick={onPick}
      ref={row => {
        if (selected) row?.scrollIntoView({ block: 'nearest' })
      }}
      sx={{ gap: 1.5 }}
    >
      {children}
    </ListItemButton>
  )
}

export function useEditorComboboxAttributes(
  editor: Editor,
  attributes: Record<string, string | null>
): void {
  const serialized = JSON.stringify(attributes)
  useEffect(() => {
    const dom = editor.view.dom
    const entries = Object.entries(JSON.parse(serialized) as typeof attributes)
    for (const [name, value] of entries) {
      if (value === null) dom.removeAttribute(name)
      else dom.setAttribute(name, value)
    }
  }, [editor, serialized])
}
