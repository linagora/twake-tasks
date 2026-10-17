import { Dots, Icon, Pen, Trash } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import type { SavedFilter } from '@/application/boards'
import { useDeleteFilter } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * The actions of a view, open or in the list of views: to change its
 * settings, or delete it once a dialog has asked, after which the list of
 * views shows.
 */
export function ViewMenu({
  view,
  from = `/filters/${view.id}`
}: {
  view: SavedFilter
  /** Where its settings go back to. */
  from?: string
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const remove = useDeleteFilter()
  const titleId = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirming, setConfirming] = useState(false)
  const close = () => {
    setAnchor(null)
  }

  return (
    <>
      <IconButton
        aria-label={t('filters.menuOf', { name: view.name })}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            close()
            void navigate(`/filters/${view.id}/edit`, {
              state: { from }
            })
          }}
        >
          <ListItemIcon>
            <Icon icon={Pen} />
          </ListItemIcon>
          <ListItemText>{t('filters.edit')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            setConfirming(true)
          }}
        >
          <ListItemIcon>
            <Icon icon={Trash} />
          </ListItemIcon>
          <ListItemText>{t('filters.deleteView')}</ListItemText>
        </MenuItem>
      </Menu>
      {confirming && (
        <Dialog
          open
          onClose={() => {
            setConfirming(false)
          }}
          aria-labelledby={titleId}
        >
          <DialogTitle id={titleId}>
            {t('filters.deleteTitle', { name: view.name })}
          </DialogTitle>
          <DialogContent>
            <Typography>{t('filters.deleteText')}</Typography>
          </DialogContent>
          <DialogActions>
            {remove.isError && (
              <Typography role="alert" variant="caption" color="error">
                {t('filters.deleteFailed')}
              </Typography>
            )}
            <Button
              variant="text"
              onClick={() => {
                setConfirming(false)
              }}
            >
              {t('board.cancel')}
            </Button>
            <Button
              color="error"
              startIcon={<Icon icon={Trash} />}
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(view.id, {
                  onSuccess: () => {
                    void navigate('/filters', { replace: true })
                  }
                })
              }}
            >
              {t('filters.deleteConfirm')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}
