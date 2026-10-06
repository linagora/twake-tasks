import {
  CheckSquare,
  Icon,
  Link as LinkIcon,
  List,
  Number as NumberIcon
} from '@linagora/twake-icons'
import {
  Box,
  Button,
  Divider,
  IconButton,
  InputBase,
  Popover
} from '@linagora/twake-mui'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'

export interface RichTextLabels {
  toolbar: string
  bold: string
  italic: string
  strike: string
  code: string
  bulletList: string
  orderedList: string
  taskList: string
  link: string
  linkUrl: string
  apply: string
}

export function Toolbar({
  editor,
  labels
}: {
  editor: Editor
  labels: RichTextLabels
}): ReactElement {
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null)
  const [url, setUrl] = useState('')
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      link: current.isActive('link')
    })
  })
  const chain = () => editor.chain().focus()

  return (
    <Box
      role="toolbar"
      aria-label={labels.toolbar}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.25,
        px: 0.5,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      <Tool
        label={labels.bold}
        pressed={active.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>
          B
        </Box>
      </Tool>
      <Tool
        label={labels.italic}
        pressed={active.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Box
          component="span"
          sx={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}
        >
          I
        </Box>
      </Tool>
      <Tool
        label={labels.strike}
        pressed={active.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Box component="span" sx={{ textDecoration: 'line-through' }}>
          S
        </Box>
      </Tool>
      <Tool
        label={labels.code}
        pressed={active.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Box
          component="span"
          sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        >
          {'</>'}
        </Box>
      </Tool>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <Tool
        label={labels.bulletList}
        pressed={active.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <Icon icon={List} size={16} />
      </Tool>
      <Tool
        label={labels.orderedList}
        pressed={active.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <Icon icon={NumberIcon} size={16} />
      </Tool>
      <Tool
        label={labels.taskList}
        pressed={active.taskList}
        onClick={() => chain().toggleTaskList().run()}
      >
        <Icon icon={CheckSquare} size={16} />
      </Tool>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <Tool
        label={labels.link}
        pressed={active.link}
        onClick={event => {
          if (active.link) {
            chain().extendMarkRange('link').unsetLink().run()
            return
          }
          setUrl('')
          setLinkAnchor(event.currentTarget)
        }}
      >
        <Icon icon={LinkIcon} size={16} />
      </Tool>
      <Popover
        open={linkAnchor !== null}
        anchorEl={linkAnchor}
        onClose={() => {
          setLinkAnchor(null)
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box
          component="form"
          sx={{ display: 'flex', gap: 1, p: 1, alignItems: 'center' }}
          onSubmit={event => {
            event.preventDefault()
            const href = url.trim()
            if (href) chain().extendMarkRange('link').setLink({ href }).run()
            setLinkAnchor(null)
          }}
        >
          <InputBase
            value={url}
            placeholder="https://"
            inputProps={{ 'aria-label': labels.linkUrl, maxLength: 2000 }}
            onChange={event => {
              setUrl(event.target.value)
            }}
            sx={{
              px: 1,
              minWidth: 240,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1
            }}
          />
          <Button type="submit" size="small">
            {labels.apply}
          </Button>
        </Box>
      </Popover>
    </Box>
  )
}

function Tool({
  label,
  pressed,
  onClick,
  children
}: {
  label: string
  pressed: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}): ReactElement {
  return (
    <IconButton
      size="small"
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={event => {
        event.preventDefault()
      }}
      onClick={onClick}
      sx={{
        width: 28,
        height: 28,
        borderRadius: 1,
        fontSize: 14,
        color: pressed ? 'primary.main' : 'text.secondary',
        bgcolor: pressed ? 'action.selected' : 'transparent'
      }}
    >
      {children}
    </IconButton>
  )
}
