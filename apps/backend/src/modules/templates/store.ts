import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  boards,
  bumpBoards,
  labels,
  projectMembers,
  projects,
  roleIn,
  tasks,
  taskTemplateAssignees,
  taskTemplateLabels,
  taskTemplates
} from '../boards/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'

export interface TemplateFields {
  title: string
  description: string
  priority: number | null
  labelIds: string[]
  assigneeIds: string[]
}

const inProject = (projectId: string, templateId: string) =>
  and(eq(taskTemplates.id, templateId), eq(taskTemplates.projectId, projectId))

// The templates of every project the person is a member of.
async function templatesOf(tx: Tx, userId: string, templateId?: string) {
  const rows = await tx
    .select({
      id: taskTemplates.id,
      projectId: taskTemplates.projectId,
      title: taskTemplates.title,
      description: taskTemplates.description,
      priority: taskTemplates.priority
    })
    .from(taskTemplates)
    .innerJoin(
      projects,
      and(eq(projects.id, taskTemplates.projectId), isNull(projects.deletedAt))
    )
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, userId)
      )
    )
    .where(
      templateId === undefined ? undefined : eq(taskTemplates.id, templateId)
    )
    .orderBy(asc(taskTemplates.title), asc(taskTemplates.id))
  if (rows.length === 0) return []
  const ids = rows.map(row => row.id)
  const labelRows = await tx
    .select()
    .from(taskTemplateLabels)
    .where(inArray(taskTemplateLabels.templateId, ids))
  const assigneeRows = await tx
    .select()
    .from(taskTemplateAssignees)
    .where(inArray(taskTemplateAssignees.templateId, ids))
  return rows.map(row => ({
    ...row,
    priority: row.priority as 1 | 2 | 3 | 4 | null,
    labelIds: labelRows
      .filter(label => label.templateId === row.id)
      .map(label => label.labelId),
    assigneeIds: assigneeRows
      .filter(assignee => assignee.templateId === row.id)
      .map(assignee => assignee.userId)
  }))
}

// Their tasks show the template's title, or lose it with the template.
const bumpBoardsUsing = (tx: Tx, templateId: string) =>
  bumpBoards(
    tx,
    inArray(
      boards.id,
      tx
        .selectDistinct({ id: tasks.boardId })
        .from(tasks)
        .where(eq(tasks.templateId, templateId))
    )
  )

async function checkEditor(tx: Tx, identity: Identity, projectId: string) {
  const role = await roleIn(tx, identity.userId, projectId)
  if (!role) throw new Refused('not_found')
  if (role === 'viewer') throw new Refused('forbidden')
}

// Labels and assignees belong to the project, as on its tasks.
async function checkProjectFields(
  tx: Tx,
  projectId: string,
  fields: TemplateFields
) {
  const labelIds = [...new Set(fields.labelIds)]
  if (labelIds.length > 0) {
    const found = await tx
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), inArray(labels.id, labelIds)))
    if (found.length !== labelIds.length) throw new Refused('invalid_label')
  }
  const assigneeIds = [...new Set(fields.assigneeIds)]
  if (assigneeIds.length > 0) {
    const found = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          inArray(projectMembers.userId, assigneeIds)
        )
      )
    if (found.length !== assigneeIds.length) {
      throw new Refused('invalid_assignee')
    }
  }
  return { labelIds, assigneeIds }
}

export function createTemplateStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  async function save(
    tx: Tx,
    identity: Identity,
    projectId: string,
    fields: TemplateFields,
    templateId?: string
  ) {
    const values = {
      title: fields.title,
      description: fields.description,
      priority: fields.priority
    }
    const [saved] =
      templateId === undefined
        ? await tx
            .insert(taskTemplates)
            .values({
              ...values,
              projectId,
              organizationId: identity.organizationId,
              createdBy: identity.userId
            })
            .returning({ id: taskTemplates.id })
        : await tx
            .update(taskTemplates)
            .set(values)
            .where(inProject(projectId, templateId))
            .returning({ id: taskTemplates.id })
    if (!saved) throw new Refused('not_found')
    if (templateId !== undefined) await bumpBoardsUsing(tx, templateId)
    const { labelIds, assigneeIds } = await checkProjectFields(
      tx,
      projectId,
      fields
    )
    const { organizationId } = identity
    await tx
      .delete(taskTemplateLabels)
      .where(eq(taskTemplateLabels.templateId, saved.id))
    await tx
      .delete(taskTemplateAssignees)
      .where(eq(taskTemplateAssignees.templateId, saved.id))
    if (labelIds.length > 0) {
      await tx.insert(taskTemplateLabels).values(
        labelIds.map(labelId => ({
          templateId: saved.id,
          labelId,
          organizationId
        }))
      )
    }
    if (assigneeIds.length > 0) {
      await tx.insert(taskTemplateAssignees).values(
        assigneeIds.map(userId => ({
          templateId: saved.id,
          userId,
          organizationId
        }))
      )
    }
    const [template] = await templatesOf(tx, identity.userId, saved.id)
    if (!template) throw new Error('saved template is gone')
    return template
  }

  async function remove(tx: Tx, projectId: string, templateId: string) {
    await bumpBoardsUsing(tx, templateId)
    const deleted = await tx
      .delete(taskTemplates)
      .where(inProject(projectId, templateId))
      .returning({ id: taskTemplates.id })
    if (deleted.length === 0) throw new Refused('not_found')
    return null
  }

  return {
    listTemplates(identity: Identity) {
      return write(identity, tx => templatesOf(tx, identity.userId))
    },

    createProjectTemplate(
      identity: Identity,
      projectId: string,
      fields: TemplateFields
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return save(tx, identity, projectId, fields)
      })
    },

    editProjectTemplate(
      identity: Identity,
      projectId: string,
      templateId: string,
      fields: TemplateFields
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return save(tx, identity, projectId, fields, templateId)
      })
    },

    deleteProjectTemplate(
      identity: Identity,
      projectId: string,
      templateId: string
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return remove(tx, projectId, templateId)
      })
    }
  }
}
