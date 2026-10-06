import type { RichTextLabels } from '@/ds/RichText'
import { useI18n } from '@/ui/i18n/useI18n'

export function useRichTextLabels(): RichTextLabels {
  const { t } = useI18n()
  return {
    toolbar: t('editor.toolbar'),
    bold: t('editor.bold'),
    italic: t('editor.italic'),
    strike: t('editor.strike'),
    code: t('editor.code'),
    bulletList: t('editor.bulletList'),
    orderedList: t('editor.orderedList'),
    taskList: t('editor.taskList'),
    link: t('editor.link'),
    linkUrl: t('editor.linkUrl'),
    apply: t('editor.apply')
  }
}
