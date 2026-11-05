import { Palette, Upload } from '@linagora/twake-icons'
import palette from '@linagora/twake-css/palette.json'
import { Dialog, DialogContent, Typography } from '@linagora/twake-mui'
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query'
import { useId, useRef, useState, type ReactElement } from 'react'

import { ClosableTitle } from '@/ds/ClosableTitle'
import { ColorPopover, swatchName } from '@/ds/ColorPicker'
import { Icon } from '@/ds/Icon'
import { PictureGrid, PictureTile } from '@/ds/Pictures'
import { BACKGROUNDS, type Background, type BoardSummary } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { shrinkPicture } from '@/ui/boards/shrinkPicture'
import { useI18n } from '@/ui/i18n/useI18n'
import { keys } from '@/ui/queries/keys'

type Shown = Pick<
  BoardSummary,
  'id' | 'background' | 'backgroundImage' | 'backgroundColor' | 'project'
>

const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// `space` stands behind a space's board without a cover of its own. Eclipse
// comes from the Home as a drawing.
export const backgroundSrc = (background: Background | 'space'): string =>
  `/backgrounds/${background}.${background === 'eclipse' ? 'svg' : 'jpg'}`

const WHITE = '#FFFFFF'

/** The card of a board without cover, in the boards list: pale blue. */
export const BLANK_CARD = palette.Primary[50]

const dataUrlOf = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('the picture could not be read'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('the picture could not be read'))
    }
    reader.readAsDataURL(blob)
  })

/** The picture an admin sent, as a URL the page can draw. */
function useSentPicture(boardId: string, imageId: string | null) {
  const api = useBoardsApi()
  return (
    useQuery({
      queryKey: keys.backgroundImage(boardId, imageId),
      queryFn: imageId
        ? async () => dataUrlOf(await api.backgroundImage(boardId, imageId))
        : skipToken,
      // Each picture has its own id: it never changes.
      staleTime: Infinity
    }).data ?? null
  )
}

/**
 * The board's picture, or its plain `#` color: the one picked, else a space's
 * for a space's board, else white.
 */
export function useBoardBackground(board: Shown): string {
  const sent = useSentPicture(
    board.id,
    board.background === 'custom' ? board.backgroundImage : null
  )
  if (board.background === 'custom') return sent ?? WHITE
  if (board.backgroundColor) return board.backgroundColor
  if (board.background) return backgroundSrc(board.background)
  return board.project.managed ? backgroundSrc('space') : WHITE
}

/**
 * Whether the board has no cover: white, with dark text on it and no picture
 * behind its header. Any other cover takes white text under a shade.
 */
export const isLightCover = (board: Shown): boolean =>
  !board.backgroundColor && !board.background && !board.project.managed

type Change =
  { background: Background | null } | { color: string } | { picture: File }

function useSetBackground(
  boardId: string
): UseMutationResult<void, Error, Change> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (change: Change) => {
      if ('background' in change) {
        await api.setBackground(boardId, change.background)
      } else if ('color' in change) {
        await api.setBackgroundColor(boardId, change.color)
      } else {
        await api.setBackgroundImage(
          boardId,
          await shrinkPicture(change.picture)
        )
      }
    },
    // The board and the list of boards both show it.
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function BackgroundDialog({
  board,
  onClose
}: {
  board: Shown
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const input = useRef<HTMLInputElement>(null)
  const set = useSetBackground(board.id)
  const sent = useSentPicture(board.id, board.backgroundImage)
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)
  // The swatch the arrows are on, saved only once kept: one save per arrow
  // would race and could leave an earlier color.
  const [swatch, setSwatch] = useState<string | null>(null)
  // What was just clicked shows picked until the board says so.
  const pending = set.isPending ? set.variables : null
  const color = pending
    ? 'color' in pending
      ? pending.color
      : null
    : board.backgroundColor
  const picked = pending
    ? 'background' in pending
      ? pending.background
      : 'picture' in pending
        ? 'custom'
        : undefined
    : color
      ? undefined
      : board.background

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <ClosableTitle
        id={titleId}
        title={t('background.title')}
        closeLabel={t('background.close')}
        onClose={onClose}
      />
      <DialogContent className="u-pb-1-half">
        <PictureGrid label={t('background.choices')}>
          <PictureTile
            label={
              board.project.managed
                ? t('background.space')
                : t('background.none')
            }
            src={board.project.managed ? backgroundSrc('space') : null}
            selected={picked === null}
            onClick={() => {
              set.mutate({ background: null })
            }}
          />
          <PictureTile
            label={t('background.color')}
            src={color}
            face={color ? undefined : <Icon icon={Palette} />}
            dashed={!color}
            selected={color !== null}
            onClick={event => {
              setColorAnchor(event.currentTarget)
            }}
          />
          {BACKGROUNDS.map(background => (
            <PictureTile
              key={background}
              label={t(`background.names.${background}`)}
              src={backgroundSrc(background)}
              selected={picked === background}
              onClick={() => {
                set.mutate({ background })
              }}
            />
          ))}
          {board.background === 'custom' && (
            <PictureTile
              label={t('background.mine')}
              src={sent}
              selected={picked === 'custom'}
              onClick={() => undefined}
            />
          )}
          <PictureTile
            label={t('background.import')}
            src={null}
            face={<Icon icon={Upload} />}
            dashed
            selected={false}
            onClick={() => {
              input.current?.click()
            }}
          />
        </PictureGrid>
        <input
          ref={input}
          type="file"
          hidden
          accept={PICTURE_TYPES.join(',')}
          aria-label={t('background.import')}
          onChange={event => {
            const picture = event.target.files?.[0]
            // The same file can be picked again.
            event.target.value = ''
            if (picture && PICTURE_TYPES.includes(picture.type)) {
              set.mutate({ picture })
            }
          }}
        />
        <ColorPopover
          anchor={colorAnchor}
          label={t('background.color')}
          customLabel={t('background.customColor')}
          cancelLabel={t('background.cancel')}
          saveLabel={t('background.save')}
          colorName={value => {
            const swatch = swatchName(value)
            return swatch
              ? t(`colors.${swatch}`)
              : t('colors.custom', { hex: value.toUpperCase() })
          }}
          value={swatch ?? color}
          onClose={() => {
            setColorAnchor(null)
            setSwatch(null)
          }}
          onSelect={setSwatch}
          onChange={next => {
            set.mutate({ color: next.toUpperCase() })
          }}
        />
        {set.isError && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('background.failed')}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  )
}
