import { Box, type Theme } from '@linagora/twake-mui'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'

import { Toolbar, type RichTextLabels } from '@/ds/RichTextToolbar'

export type { RichTextLabels } from '@/ds/RichTextToolbar'

const extensions = (placeholder = '') => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown,
  Placeholder.configure({ placeholder })
]

const markdownOf = (editor: Editor): string => editor.getMarkdown().trim()

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
  '& ul[data-type="taskList"] li > label': { marginTop: 2 },
  '& ul[data-type="taskList"] li > div': { flex: 1 },
  '& li[data-checked="true"] > div': {
    color: theme.vars.palette.text.secondary,
    textDecoration: 'line-through'
  },
  '& a': { color: theme.vars.palette.primary.main },
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

export function RichText({ markdown }: { markdown: string }): ReactElement {
  const editor = useEditor(
    {
      extensions: extensions(),
      content: markdown,
      contentType: 'markdown',
      editable: false
    },
    [markdown]
  )
  return (
    <Box sx={prose}>
      <EditorContent editor={editor} />
    </Box>
  )
}

export function RichTextEditor({
  label,
  initial,
  placeholder,
  labels,
  minHeight = 96,
  onChange,
  onSubmit,
  footer
}: {
  label: string
  initial: string
  placeholder?: string
  labels: RichTextLabels
  minHeight?: number
  onChange: (markdown: string) => void
  onSubmit?: () => void
  footer?: ReactNode
}): ReactElement {
  // The editor keeps the callbacks it was created with, so it reads the latest ones here.
  const latest = useRef({ onChange, onSubmit })
  useEffect(() => {
    latest.current = { onChange, onSubmit }
  })
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: initial,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true'
      },
      handleKeyDown: (_view, event) => {
        const submit = latest.current.onSubmit
        if (
          submit &&
          event.key === 'Enter' &&
          (event.metaKey || event.ctrlKey)
        ) {
          submit()
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor: current }) => {
      latest.current.onChange(markdownOf(current))
    }
  })

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
      >
        <EditorContent editor={editor} />
      </Box>
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
