import { Box, type Theme } from '@linagora/twake-mui'
import { Link } from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { Marked, type marked } from 'marked'
import {
  EditorContent,
  useEditor,
  type AnyExtension,
  type Editor
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import { mentionExtension } from '@/ds/Mention'
import { Toolbar, type RichTextLabels } from '@/ds/RichTextToolbar'
import {
  optionId,
  SuggestionList,
  suggestionsExtension,
  useEditorComboboxAttributes,
  type SuggestionBridge,
  type SuggestionOption,
  type SuggestionState,
  type Suggestions
} from '@/ds/Suggestions'

export type { RichTextLabels } from '@/ds/RichTextToolbar'

// @tiptap/markdown types the parser as the shared `marked`, but only calls
// `use`, `lexer`, `setOptions` and `defaults`, which every `Marked` has.
const ownMarked = (): typeof marked =>
  // @ts-expect-error: a Marked has every member tiptap calls, its generics differ from marked's
  new Marked()

const LINK_TARGET = '_blank'
const LINK_REL = 'noopener noreferrer nofollow'

// The markdown keeps raw <a> tags, whose attributes would otherwise win:
// rel="opener" lets the linked page navigate this tab, and a class can dress
// a link up as a mention.
const SafeLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: { default: LINK_TARGET, parseHTML: () => LINK_TARGET },
      rel: { default: LINK_REL, parseHTML: () => LINK_REL },
      class: { default: null, parseHTML: () => null }
    }
  }
})

// Tiptap reverts a click on the checkbox of a read-only editor, so show it as disabled.
const ReadOnlyTaskItem = TaskItem.extend({
  addNodeView() {
    const nodeView = this.parent?.()
    if (!nodeView) return null
    return props => {
      const view = nodeView(props)
      if (!props.editor.isEditable) {
        view.dom.querySelector('input')?.setAttribute('disabled', '')
      }
      return view
    }
  }
})

const extensions = (placeholder = '', more: AnyExtension[] = []) => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
  SafeLink.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: 'https'
  }),
  TaskList,
  ReadOnlyTaskItem.configure({ nested: true }),
  // One parser per editor: the shared one of marked would keep the tokenizer
  // of the mentions, and every other editor would drop the "@<email>" it reads
  Markdown.configure({ marked: ownMarked() }),
  Placeholder.configure({ placeholder }),
  ...more
]

// The markdown writer escapes the "_" of jean_dupont@example.com, and the
// backend does not read "@jean\_dupont@example.com" as a mention.
const MENTION_ESCAPES = /(^|\s)(@(?:[\w.%+-]|\\_)+@[\w.-]*\w)/g

const markdownOf = (editor: Editor): string =>
  editor
    .getMarkdown()
    .trim()
    .replace(
      MENTION_ESCAPES,
      (_all, before: string, mention: string) =>
        before + mention.replaceAll('\\_', '_')
    )

const prose = (theme: Theme) => ({
  ...theme.typography.body2,
  color: theme.vars.palette.text.primary,
  overflowWrap: 'anywhere' as const,
  '& .ProseMirror': { outline: 'none' },
  '& .ProseMirror > :first-of-type': { marginTop: 0 },
  '& .ProseMirror > :last-child': { marginBottom: 0 },
  '& p': { margin: theme.spacing(0, 0, 1) },
  '& h1, & h2, & h3': { margin: theme.spacing(2, 0, 1), lineHeight: 1.3 },
  '& h1': { fontSize: '1.375rem' },
  '& h2': { fontSize: '1.125rem' },
  '& h3': { fontSize: '1rem' },
  '& ul, & ol': {
    margin: theme.spacing(0, 0, 1),
    paddingLeft: theme.spacing(3)
  },
  '& li > p': { margin: 0 },
  '& ul[data-type="taskList"]': { listStyle: 'none', paddingLeft: 0 },
  '& ul[data-type="taskList"] li': {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-start'
  },
  '& ul[data-type="taskList"] li > label': { marginTop: '2px' },
  '& ul[data-type="taskList"] li > div': { flex: 1 },
  '& li[data-checked="true"] > div': {
    color: theme.vars.palette.text.secondary,
    textDecoration: 'line-through'
  },
  '& a': { color: theme.vars.palette.primary.main },
  '& .mention': {
    padding: '0.05em 0.35em',
    borderRadius: 4,
    fontWeight: 500,
    color: theme.vars.palette.primary.main,
    backgroundColor: theme.alpha(theme.vars.palette.primary.main, 0.12)
  },
  '& code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.85em',
    padding: '0.1em 0.35em',
    borderRadius: 4,
    backgroundColor: theme.vars.palette.action.hover
  },
  '& pre': {
    margin: theme.spacing(0, 0, 1),
    padding: theme.spacing(1.5),
    borderRadius: theme.spacing(1),
    backgroundColor: theme.vars.palette.action.hover,
    overflowX: 'auto' as const
  },
  '& pre code': { padding: 0, backgroundColor: 'transparent' },
  '& blockquote': {
    margin: theme.spacing(0, 0, 1),
    paddingLeft: theme.spacing(1.5),
    borderLeft: `3px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.secondary
  },
  '& p.is-editor-empty:first-of-type::before': {
    content: 'attr(data-placeholder)',
    color: theme.vars.palette.text.disabled,
    float: 'left' as const,
    height: 0,
    pointerEvents: 'none' as const
  }
})

export function RichText({
  markdown,
  mentions
}: {
  markdown: string
  /** Who "@<email>" stands for: the lowercase email, then the name to show. */
  mentions?: Record<string, string>
}): ReactElement {
  const editor = useEditor(
    {
      extensions: extensions('', mentions ? [mentionExtension(mentions)] : []),
      content: markdown,
      contentType: 'markdown',
      editable: false
    },
    [markdown, mentions]
  )
  return (
    <Box sx={prose}>
      <EditorContent editor={editor} />
    </Box>
  )
}

type OpenSuggestions = SuggestionState & { source: number }

interface SourcedHandlers {
  search: (source: number, query: string) => SuggestionOption[]
  show: (source: number, state: SuggestionState) => void
  hide: (source: number) => void
  keyDown: (event: KeyboardEvent) => boolean
}

export function RichTextEditor({
  label,
  initial,
  placeholder,
  labels,
  minHeight = 96,
  onChange,
  onSubmit,
  suggestions,
  footer
}: {
  label: string
  initial: string
  placeholder?: string
  labels: RichTextLabels
  minHeight?: number
  onChange: (markdown: string) => void
  onSubmit?: () => void
  /** Lists of options, each opening when the user types its trigger character. Read once, when the editor is created. */
  suggestions?: Suggestions[]
  footer?: ReactNode
}): ReactElement {
  // The editor keeps the callbacks it was created with, so it reads the latest ones here.
  const latest = useRef({ onChange, onSubmit })
  useEffect(() => {
    latest.current = { onChange, onSubmit }
  })
  const listId = useId()
  const [open, setOpen] = useState<OpenSuggestions | null>(null)
  const [active, setActive] = useState(0)
  const shown = useRef({ open, active })
  useEffect(() => {
    shown.current = { open, active }
  })
  const move = (index: number) => {
    shown.current.active = index
    setActive(index)
  }
  const handlers = useRef<SourcedHandlers>({
    search: () => [],
    show: () => undefined,
    hide: () => undefined,
    keyDown: () => false
  })
  // The editor is created once, so it talks to the latest handlers through these.
  const [bridges] = useState<SuggestionBridge[]>(() =>
    (suggestions ?? []).map(({ trigger }, source) => ({
      trigger,
      search: query => handlers.current.search(source, query),
      show: next => {
        handlers.current.show(source, next)
      },
      hide: () => {
        handlers.current.hide(source)
      },
      keyDown: event => handlers.current.keyDown(event)
    }))
  )
  useEffect(() => {
    handlers.current = {
      search: (source, query) => suggestions?.[source]?.search(query) ?? [],
      show: (source, next) => {
        if (next.items.length === 0) {
          if (shown.current.open?.source === source) {
            shown.current.open = null
            setOpen(null)
          }
          return
        }
        const previous = shown.current.open
        const sameQuery =
          previous?.source === source && previous.query === next.query
        move(
          sameQuery ? Math.min(shown.current.active, next.items.length - 1) : 0
        )
        const opened = { ...next, source }
        shown.current.open = opened
        setOpen(opened)
      },
      // Typing one trigger after another can close the first list after the second opened.
      hide: source => {
        if (shown.current.open?.source !== source) return
        shown.current.open = null
        setOpen(null)
      },
      keyDown: event => {
        const { open: current, active: index } = shown.current
        if (!current) return false
        const count = current.items.length
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          move((index + (event.key === 'ArrowDown' ? 1 : count - 1)) % count)
          return true
        }
        const chosen = current.items[index]
        if (
          chosen &&
          (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))
        ) {
          event.preventDefault()
          current.pick(chosen)
          return true
        }
        if (event.key === 'Escape') {
          // Closing the list must not also close the panel around the editor.
          event.stopPropagation()
          return true
        }
        return false
      }
    }
  })
  const editor = useEditor({
    extensions: extensions(placeholder, bridges.map(suggestionsExtension)),
    content: initial,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true'
      }
    },
    onUpdate: ({ editor: current }) => {
      latest.current.onChange(markdownOf(current))
    },
    onBlur: () => {
      for (const bridge of bridges) bridge.hide()
    }
  })
  useEditorComboboxAttributes(
    editor,
    bridges.length > 0
      ? {
          'aria-haspopup': 'listbox',
          'aria-autocomplete': 'list',
          'aria-controls': open ? listId : null,
          'aria-activedescendant': open ? optionId(listId, active) : null
        }
      : {}
  )

  return (
    <Box
      sx={theme => ({
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        transition: theme.transitions.create(['border-color', 'box-shadow']),
        '&:focus-within': {
          borderColor: 'primary.main',
          boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}`
        }
      })}
    >
      <Toolbar editor={editor} labels={labels} />
      <Box
        sx={theme => ({
          ...prose(theme),
          px: 1.5,
          py: 1,
          cursor: 'text',
          '& .ProseMirror': { outline: 'none', minHeight }
        })}
        onClick={() => editor.commands.focus()}
        onKeyDownCapture={event => {
          const submit = latest.current.onSubmit
          if (
            submit &&
            !shown.current.open &&
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey)
          ) {
            // ProseMirror drops Enter keydowns on Chrome for Android before its key handlers run.
            event.preventDefault()
            event.stopPropagation()
            submit()
          }
        }}
      >
        <EditorContent editor={editor} />
      </Box>
      {open && (
        <SuggestionList
          editor={editor}
          listId={listId}
          label={suggestions?.[open.source]?.label ?? ''}
          state={open}
          active={active}
        />
      )}
      {footer && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            px: 1,
            pb: 1
          }}
        >
          {footer}
        </Box>
      )}
    </Box>
  )
}
