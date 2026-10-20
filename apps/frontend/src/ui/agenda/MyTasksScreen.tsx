import { Profile } from '@linagora/twake-icons'
import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { LAYOUTS, type Layout } from '@/domain/board'
import { TasksView } from '@/ui/agenda/TasksView'
import { LayoutToggle } from '@/ui/boards/Layouts'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const LAYOUT_KEY = 'twake-tasks.mine.layout'

// The browser remembers the layout; it may refuse its storage.
function storedLayout(): Layout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY)
    return LAYOUTS.find(layout => layout === stored) ?? 'list'
  } catch {
    return 'list'
  }
}

/** My tasks: a view of the tasks assigned to me, in the layout I pick. */
export function MyTasksScreen(): ReactElement {
  const { t } = useI18n()
  const [layout, setLayout] = useState(storedLayout)
  useDocumentTitle(t('agenda.mine'))

  return (
    <TasksView
      source="mine"
      criteria={{ assignees: ['me'] }}
      layout={layout}
      origin={{ icon: Profile, label: t('agenda.mine'), to: '/mine' }}
      title={
        <Typography variant="h3" component="h1">
          {t('agenda.mine')}
        </Typography>
      }
      empty={{
        icon: Profile,
        title: t('agenda.mineEmpty'),
        text: t('agenda.mineEmptyHint')
      }}
      actions={
        <LayoutToggle
          layouts={LAYOUTS}
          value={layout}
          onChange={chosen => {
            setLayout(chosen)
            try {
              localStorage.setItem(LAYOUT_KEY, chosen)
            } catch {
              // The layout is then kept until the page closes.
            }
          }}
        />
      }
    />
  )
}
