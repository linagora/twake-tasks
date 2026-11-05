import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useMemo, useState, type ReactElement } from 'react'

import type { ImportResult } from '@/application/boards'
import { defaultSection } from '@/application/newTask'
import { DialogHeader } from '@/ds/DialogHeader'
import { FieldGrid, PreviewItem, PreviewList } from '@/ds/ImportPreview'
import { isAdmin, type Board } from '@/domain/board'
import {
  guessMapping,
  IMPORT_FIELDS,
  readRow,
  type ImportedRow,
  type ImportField,
  type Mapping
} from '@/domain/taskImport'
import {
  localizedHeaders,
  readCsvFile,
  writesDayFirst,
  type CsvFile,
  type CsvRefusal
} from '@/ui/boards/boardCsv'
import { dueLabel } from '@/ui/boards/dueLabel'
import { ImportDone, type Skipped } from '@/ui/boards/ImportDone'
import { useI18n } from '@/ui/i18n/useI18n'
import { useImportTasks } from '@/ui/queries/boards'

const PREVIEWED = 5

type Step =
  | { kind: 'pick'; refusal: CsvRefusal | null }
  | { kind: 'map'; file: CsvFile; mapping: Mapping }
  | { kind: 'done'; file: CsvFile; result: ImportResult; skipped: Skipped[] }

export function ImportDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [step, setStep] = useState<Step>({ kind: 'pick', refusal: null })

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <DialogHeader
        id={titleId}
        title={t('csv.importTitle')}
        close={{ label: t('csv.close'), onClick: onClose }}
      />
      {step.kind === 'pick' && (
        <PickStep
          refusal={step.refusal}
          onPicked={picked => {
            setStep(
              typeof picked === 'string'
                ? { kind: 'pick', refusal: picked }
                : {
                    kind: 'map',
                    file: picked,
                    mapping: guessMapping(picked.headers, localizedHeaders(t))
                  }
            )
          }}
          onClose={onClose}
        />
      )}
      {step.kind === 'map' && (
        <MapStep
          board={board}
          file={step.file}
          mapping={step.mapping}
          onMapping={mapping => {
            setStep({ ...step, mapping })
          }}
          onBack={() => {
            setStep({ kind: 'pick', refusal: null })
          }}
          onImported={(result, skipped) => {
            setStep({ kind: 'done', file: step.file, result, skipped })
          }}
        />
      )}
      {step.kind === 'done' && (
        <ImportDone
          board={board}
          file={step.file}
          result={step.result}
          skipped={step.skipped}
          onClose={onClose}
        />
      )}
    </Dialog>
  )
}

function PickStep({
  refusal,
  onPicked,
  onClose
}: {
  refusal: CsvRefusal | null
  onPicked: (picked: CsvFile | CsvRefusal) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <>
      <DialogContent>
        <Typography color="textSecondary">{t('csv.pickText')}</Typography>
        <Button variant="contained" component="label" className="u-mt-1-half">
          {t('csv.pick')}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void readCsvFile(file).then(onPicked)
            }}
          />
        </Button>
        {refusal && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t(`csv.refusals.${refusal}`)}
          </Typography>
        )}
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {t('csv.cancel')}
        </Button>
      </DialogActions>
    </>
  )
}

function MapStep({
  board,
  file,
  mapping,
  onMapping,
  onBack,
  onImported
}: {
  board: Board
  file: CsvFile
  mapping: Mapping
  onMapping: (mapping: Mapping) => void
  onBack: () => void
  onImported: (result: ImportResult, skipped: Skipped[]) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const importing = useImportTasks(board.id)
  const read = useMemo(() => {
    const dayFirst = writesDayFirst(lang)
    return file.rows.map(cells => ({
      cells,
      ...readRow(cells, mapping, dayFirst)
    }))
  }, [file, mapping, lang])
  const rows = read.flatMap(each => ('row' in each ? [each] : []))
  const skipped = read.flatMap(each =>
    'skipped' in each ? [{ cells: each.cells, reason: each.skipped }] : []
  )
  const fallback = defaultSection(board.sections)?.name ?? ''
  const known = new Set(board.sections.map(each => each.name.toLowerCase()))
  // Only an admin adds the sections a file names.
  const sectionOf = (name: string | undefined) =>
    name && (isAdmin(board.role) || known.has(name.toLowerCase()))
      ? name
      : fallback
  const columns = file.headers.map((header, index) =>
    header.trim() === '' ? t('csv.column', { number: index + 1 }) : header
  )
  const titled = mapping.title !== undefined

  return (
    <>
      <DialogContent>
        <Typography color="textSecondary" className="u-mb-1-half">
          {t('csv.columnsText', { file: file.name })}
        </Typography>
        <FieldGrid>
          {IMPORT_FIELDS.map(field => (
            <FieldSelect
              key={field}
              field={field}
              value={mapping[field]}
              columns={columns}
              onChange={column => {
                onMapping({ ...mapping, [field]: column })
              }}
            />
          ))}
        </FieldGrid>
        <Typography variant="h6" component="h3" className="u-mt-2 u-mb-1">
          {t('csv.preview')}
        </Typography>
        {titled ? (
          <PreviewList label={t('csv.preview')}>
            {rows.slice(0, PREVIEWED).map(({ row }, index) => (
              <PreviewItem
                key={index}
                title={row.title}
                meta={facts(row, sectionOf(row.section), lang)}
              />
            ))}
          </PreviewList>
        ) : (
          <Typography color="textSecondary">{t('csv.needTitle')}</Typography>
        )}
        {titled && rows.length > PREVIEWED && (
          <Typography
            variant="caption"
            color="textSecondary"
            component="p"
            className="u-mt-half"
          >
            {t('csv.previewMore', { smart_count: rows.length - PREVIEWED })}
          </Typography>
        )}
        {titled && skipped.length > 0 && (
          <Typography variant="caption" color="textSecondary" component="p">
            {t('csv.willSkip', { smart_count: skipped.length })}
          </Typography>
        )}
        {importing.isError && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('csv.failed')}
          </Typography>
        )}
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="text" className="u-mr-auto" onClick={onBack}>
          {t('csv.back')}
        </Button>
        <Button
          variant="contained"
          disabled={importing.isPending || !titled || rows.length === 0}
          onClick={() => {
            importing.mutate(
              rows.map(({ row }) => row),
              {
                onSuccess: result => {
                  onImported(result, [
                    ...skipped,
                    ...result.skipped.flatMap(({ row, reason }) => {
                      const cells = rows[row]?.cells
                      return cells ? [{ cells, reason }] : []
                    })
                  ])
                }
              }
            )
          }}
        >
          {t('csv.submit', { smart_count: rows.length })}
        </Button>
      </DialogActions>
    </>
  )
}

const facts = (row: ImportedRow, section: string, lang: string): string =>
  [
    section,
    row.priority ? `P${String(row.priority)}` : '',
    row.dueDate
      ? (dueLabel(
          { dueDate: row.dueDate, dueTime: row.dueTime ?? null, dueZone: null },
          lang
        ) ?? '')
      : '',
    ...(row.labels ?? []),
    ...(row.assignees ?? [])
  ]
    .filter(fact => fact !== '')
    .join(' · ')

function FieldSelect({
  field,
  value,
  columns,
  onChange
}: {
  field: ImportField
  value: number | undefined
  columns: string[]
  onChange: (column: number | undefined) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <TextField
      select
      size="small"
      fullWidth
      required={field === 'title'}
      label={t(`csv.columns.${field}`)}
      value={value === undefined ? '' : String(value)}
      onChange={event => {
        const { value: picked } = event.target
        onChange(picked === '' ? undefined : Number(picked))
      }}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      <option value="">{t('csv.notImported')}</option>
      {columns.map((name, index) => (
        <option key={index} value={String(index)}>
          {name}
        </option>
      ))}
    </TextField>
  )
}
