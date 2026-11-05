import { Bottom, Copy, Gear } from '@linagora/twake-icons'
import {
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import { Icon } from '@/ds/Icon'
import { Menu } from '@/ds/Menu'
import type { Template } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'

export function TemplatePicker({
  templates,
  projectName,
  manageable,
  onPick
}: {
  /** Those the board can use. */
  templates: Template[]
  projectName: string
  /** Whether the settings page is there to link to, as it is not in an embed. */
  manageable: boolean
  onPick: (template: Template) => void
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => {
    setAnchor(null)
  }

  return (
    <>
      <Button
        variant="text"
        size="small"
        startIcon={<Icon icon={Copy} size={14} />}
        endIcon={<Icon icon={Bottom} size={12} />}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        {t('newTask.useTemplate')}
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {templates.map(template => (
          <MenuItem
            key={template.id}
            onClick={() => {
              close()
              onPick(template)
            }}
          >
            <ListItemIcon>
              <Icon icon={Copy} />
            </ListItemIcon>
            <ListItemText primary={template.title} secondary={projectName} />
          </MenuItem>
        ))}
        {templates.length === 0 && (
          <MenuItem disabled>
            <ListItemText
              primary={t('newTask.noTemplates')}
              secondary={t('newTask.noTemplatesHint')}
            />
          </MenuItem>
        )}
        {manageable && <Divider component="li" />}
        {manageable && (
          // In a new tab, as leaving the page would drop the draft unasked.
          <MenuItem
            component={RouterLink}
            to="/settings"
            target="_blank"
            rel="noopener"
            onClick={close}
          >
            <ListItemIcon>
              <Icon icon={Gear} />
            </ListItemIcon>
            <ListItemText>{t('newTask.manageTemplates')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  )
}
