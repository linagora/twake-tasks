import {
  CheckSquare,
  Drive,
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
import { find } from 'linkifyjs'

const SCHEME_OR_PATH = /^(?:[a-z][a-z\d+.-]*:|[/#?])/i

// A link without a scheme would open a path inside the app. linkify, which
// tiptap pastes with, goes first: it reads "example.org:8080" as a host, where
// the scheme test alone sees an "example.org:" scheme, and "bob@example.org"
// as a mail address.
const hrefOf = (typed: string): string =>
  find(typed, { defaultProtocol: 'https' }).find(
    link => link.isLink && link.value === typed
  )?.href ?? (!typed || SCHEME_OR_PATH.test(typed) ? typed : `https://${typed}`)

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

/** Picks links from elsewhere (Twake Drive); none when the user cancels. */
export interface LinkPicker {
  label: string
  pick: () => Promise<readonly { name: string; url: string }[]>
}

export function Toolbar({
  editor,
  labels,
  linkPicker
}: {
  editor: Editor
  labels: RichTextLabels
  linkPicker?: LinkPicker | undefined
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
          sx={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            whiteSpace: 'nowrap'
          }}
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
      {linkPicker && (
        <Tool
          label={linkPicker.label}
          onClick={() => {
            void linkPicker.pick().then(links => {
              const fits = links.every(link =>
                editor.can().setLink({ href: link.url })
              )
              if (links.length === 0 || !fits) return
              chain()
                .insertContent(
                  links.flatMap((link, index) => [
                    ...(index > 0 ? [{ type: 'text', text: ' ' }] : []),
                    {
                      type: 'text',
                      text: link.name,
                      marks: [{ type: 'link', attrs: { href: link.url } }]
                    }
                  ])
                )
                .unsetMark('link')
                .run()
            })
          }}
        >
          <Icon icon={Drive} size={16} />
        </Tool>
      )}
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
            event.stopPropagation()
            const href = hrefOf(url.trim())
            setLinkAnchor(null)
            // setLink checks the protocol and that a link fits where the caret is
            if (!href || !editor.can().setLink({ href })) return
            if (editor.state.selection.empty) {
              // The link mark is inclusive, so drop it or the next typed text joins the link.
              chain()
                .insertContent({
                  type: 'text',
                  text: href,
                  marks: [{ type: 'link', attrs: { href } }]
                })
                .unsetMark('link')
                .run()
            } else {
              chain().extendMarkRange('link').setLink({ href }).run()
            }
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
  pressed?: boolean
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
