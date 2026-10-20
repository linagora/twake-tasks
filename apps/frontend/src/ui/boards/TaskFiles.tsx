import {
  Drive as DriveIcon,
  Icon,
  Plus,
  Upload as UploadIcon
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography
} from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import type { DriveDestination } from '@/application/drive'
import { DrivePickerDialog } from '@/ds/DrivePickerDialog'
import { FileChip, FileChipList } from '@/ds/FileChip'
import { FileTransferDialog } from '@/ds/FileTransferDialog'
import { PanelSection } from '@/ds/SidePanel'
import { Toast } from '@/ds/Toast'
import type { Task } from '@/domain/board'
import { useAddFiles, useRemoveFile, useTaskFiles } from '@/ui/boards/queries'
import { useDrivePicker } from '@/ui/boards/useDrivePicker'
import {
  isSettled,
  useDriveUpload,
  type Upload
} from '@/ui/boards/useDriveUpload'
import { useDrive } from '@/ui/drive/DriveProvider'
import { useI18n } from '@/ui/i18n/useI18n'

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

export function formatSize(bytes: number, lang: string): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: UNITS[unit],
    // "500 B" rather than "500 byte", as Twake Mail writes it.
    unitDisplay: unit === 0 ? 'narrow' : 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1
  }).format(value)
}

export function TaskFiles({
  task,
  boardId,
  editable,
  teamDriveId
}: {
  task: Task
  boardId: string
  editable: boolean
  teamDriveId: string | null
}): ReactElement | null {
  const { t, lang } = useI18n()
  const drive = useDrive()
  const files = useTaskFiles(boardId, task.id)
  const add = useAddFiles(boardId, task.id)
  const remove = useRemoveFile(boardId, task.id)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const destination: DriveDestination = teamDriveId
    ? { kind: 'team', driveId: teamDriveId }
    : { kind: 'personal' }
  const upload = useDriveUpload({
    drive,
    destination,
    onLinked: linked => add.mutateAsync(linked)
  })
  const picker = useDrivePicker({
    drive,
    addLabel: t('files.pickerAdd'),
    onPicked: picked => {
      add.mutate(picked)
    }
  })
  const canAdd = editable && drive !== null
  const linked = files.data ?? []
  if (!canAdd && linked.length === 0 && !files.isError) return null

  const statusOf = (item: Upload) =>
    item.status === 'linked'
      ? t('files.done')
      : item.status === 'failed'
        ? t('files.failed')
        : item.status === 'cancelled'
          ? t('files.cancelled')
          : formatSize(item.file.size, lang)
  const tooMany =
    add.error instanceof ApiError && add.error.code === 'too_many_files'
  const problem = tooMany
    ? t('files.tooMany')
    : upload.failed || add.isError
      ? t('files.addFailed')
      : picker.failed
        ? t('files.pickFailed')
        : remove.isError
          ? t('files.removeFailed')
          : null

  return (
    <PanelSection
      title={t('files.title')}
      action={
        canAdd && (
          <>
            <Button
              variant="text"
              size="small"
              startIcon={<Icon icon={Plus} size={14} />}
              aria-haspopup="menu"
              aria-expanded={menuAnchor !== null}
              onClick={event => {
                setMenuAnchor(event.currentTarget)
              }}
            >
              {t('files.add')}
            </Button>
            <Menu
              anchorEl={menuAnchor}
              open={menuAnchor !== null}
              onClose={() => {
                setMenuAnchor(null)
              }}
            >
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  picker.show()
                }}
              >
                <ListItemIcon>
                  <Icon icon={DriveIcon} size={16} />
                </ListItemIcon>
                <ListItemText>{t('files.fromDrive')}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  input.current?.click()
                }}
              >
                <ListItemIcon>
                  <Icon icon={UploadIcon} size={16} />
                </ListItemIcon>
                <ListItemText>{t('files.fromComputer')}</ListItemText>
              </MenuItem>
            </Menu>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              aria-label={t('files.fromComputer')}
              onChange={event => {
                upload.start([...(event.target.files ?? [])])
                // The same file can be picked again after a failure.
                event.target.value = ''
              }}
            />
          </>
        )
      }
    >
      {files.isError && (
        <Typography role="alert" variant="body2">
          {t('files.loadFailed')}
        </Typography>
      )}
      {linked.length > 0 && (
        <FileChipList label={t('files.title')}>
          {linked.map(file => (
            <FileChip
              key={file.id}
              name={file.name}
              mimeType={file.mimeType}
              url={file.url}
              openLabel={t('files.open', { name: file.name })}
              remove={
                editable
                  ? {
                      label: t('files.remove', { name: file.name }),
                      onClick: () => {
                        remove.mutate(file.id)
                      }
                    }
                  : undefined
              }
            />
          ))}
        </FileChipList>
      )}
      <FileTransferDialog
        open={upload.uploads.length > 0}
        labels={{
          title: t('files.uploadTitle'),
          cancel: t('files.cancel'),
          cancelAll: t('files.cancelAll')
        }}
        description={
          <>
            {t(
              destination.kind === 'team'
                ? 'files.uploadToSpace'
                : 'files.uploadToDrive'
            )}{' '}
            <strong>{t('files.asLinks')}</strong>
          </>
        }
        rows={upload.uploads.map(item => ({
          id: item.id,
          name: item.file.name,
          mimeType: item.file.type || null,
          status: statusOf(item),
          progress: item.status === 'linked' ? 1 : null,
          settled: isSettled(item.status)
        }))}
        onCancel={upload.cancel}
        onCancelAll={upload.cancelAll}
      />
      <DrivePickerDialog
        open={picker.open}
        ready={picker.ready}
        label={t('files.pickerTitle')}
        closeLabel={t('files.close')}
        containerRef={picker.containerRef}
        onClose={picker.close}
      />
      <Toast
        open={problem !== null}
        autoHideDuration={6000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return
          upload.dismissFailure()
          picker.dismissFailure()
          add.reset()
          remove.reset()
        }}
      >
        <Alert severity="error">{problem}</Alert>
      </Toast>
    </PanelSection>
  )
}
