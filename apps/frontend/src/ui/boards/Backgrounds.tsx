import { Icon, Upload } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query'
import { useId, useRef, type ReactElement } from 'react'

import { PictureGrid, PictureTile } from '@/ds/Pictures'
import { BACKGROUNDS, type Background, type BoardSummary } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { shrinkPicture } from '@/ui/boards/shrinkPicture'
import { useI18n } from '@/ui/i18n/useI18n'

type Shown = Pick<
  BoardSummary,
  'id' | 'background' | 'backgroundImage' | 'project'
>

const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// `space` stands behind a space's board, `breeze` on the card of a board
// without background in the list.
export const backgroundSrc = (
  background: Background | 'space' | 'breeze'
): string => `/backgrounds/${background}.jpg`

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
      queryKey: ['boards', boardId, 'background', imageId],
      queryFn: imageId
        ? async () => dataUrlOf(await api.backgroundImage(boardId, imageId))
        : skipToken,
      // Each picture has its own id: it never changes.
      staleTime: Infinity
    }).data ?? null
  )
}

/**
 * The board's picture: the one picked, else a space's for a space's board,
 * else none, for white.
 */
export function useBoardBackground(board: Shown): string | null {
  const sent = useSentPicture(
    board.id,
    board.background === 'custom' ? board.backgroundImage : null
  )
  if (board.background === 'custom') return sent
  if (board.background) return backgroundSrc(board.background)
  return board.project.managed ? backgroundSrc('space') : null
}

type Change = { background: Background | null } | { picture: File }

function useSetBackground(
  boardId: string
): UseMutationResult<void, Error, Change> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (change: Change) => {
      if ('background' in change) {
        await api.setBackground(boardId, change.background)
      } else {
        await api.setBackgroundImage(
          boardId,
          await shrinkPicture(change.picture)
        )
      }
    },
    // The board and the list of boards both show it.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['boards'] })
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
  // What was just clicked shows picked until the board says so.
  const picked = set.isPending
    ? 'background' in set.variables
      ? set.variables.background
      : 'custom'
    : board.background

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{t('background.title')}</DialogTitle>
      <DialogContent>
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
        {set.isError && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('background.failed')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {t('background.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
