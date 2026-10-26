import { and, asc, eq, inArray, max } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { accessibleBoards } from './access.ts'
import {
  boardFavorites,
  savedFilters,
  sidebarSectionItems,
  sidebarSections
} from './schema.ts'
import { Refused, writeOrRefuse } from './tasks.ts'

/** A board or a view, as a sidebar section holds it. */
export interface SidebarItem {
  kind: 'board' | 'view'
  id: string
}

/** The sections of a sidebar in their order, each with its items. */
export interface SidebarLayout {
  id: string
  items: SidebarItem[]
}

const sameItem = (a: SidebarItem, b: SidebarItem) =>
  a.kind === b.kind && a.id === b.id

/**
 * Takes a board or view the person no longer stars out of their sections, as
 * those only hold favorites.
 */
export async function leaveSections(tx: Tx, userId: string, item: SidebarItem) {
  await tx
    .delete(sidebarSectionItems)
    .where(
      and(
        eq(sidebarSectionItems.userId, userId),
        item.kind === 'board'
          ? eq(sidebarSectionItems.boardId, item.id)
          : eq(sidebarSectionItems.filterId, item.id)
      )
    )
}

export function createSidebarStore(db: Db) {
  return {
    listSections(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const sections = await tx
          .select({ id: sidebarSections.id, name: sidebarSections.name })
          .from(sidebarSections)
          .orderBy(asc(sidebarSections.position), asc(sidebarSections.id))
        const items = await tx
          .select({
            sectionId: sidebarSectionItems.sectionId,
            boardId: sidebarSectionItems.boardId,
            filterId: sidebarSectionItems.filterId
          })
          .from(sidebarSectionItems)
          .orderBy(asc(sidebarSectionItems.position))
        return sections.map(section => ({
          ...section,
          items: items
            .filter(item => item.sectionId === section.id)
            .map((item): SidebarItem =>
              item.boardId === null
                ? { kind: 'view', id: item.filterId ?? '' }
                : { kind: 'board', id: item.boardId }
            )
        }))
      })
    },

    createSection(identity: Identity, name: string) {
      return writeOrRefuse(db, identity, async tx => {
        const [last] = await tx
          .select({ position: max(sidebarSections.position) })
          .from(sidebarSections)
        const [row] = await tx
          .insert(sidebarSections)
          .values({
            organizationId: identity.organizationId,
            userId: identity.userId,
            name,
            position: (last?.position ?? -1) + 1
          })
          .returning({ id: sidebarSections.id })
        if (!row) throw new Error('sidebar section insert returned nothing')
        return row
      })
    },

    renameSection(identity: Identity, sectionId: string, name: string) {
      return writeOrRefuse(db, identity, async tx => {
        const renamed = await tx
          .update(sidebarSections)
          .set({ name })
          .where(eq(sidebarSections.id, sectionId))
          .returning({ id: sidebarSections.id })
        if (renamed.length === 0) throw new Refused('not_found')
      })
    },

    deleteSection(identity: Identity, sectionId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const deleted = await tx
          .delete(sidebarSections)
          .where(eq(sidebarSections.id, sectionId))
          .returning({ id: sidebarSections.id })
        if (deleted.length === 0) throw new Refused('not_found')
      })
    },

    /**
     * Sets the order of every section of the sidebar and what each holds, at
     * once, so that a drag from one section to another is one change. A
     * layout missing a section, or holding one since deleted, is stale. What
     * a section holds becomes a favorite, out of Favorites while there.
     */
    saveLayout(identity: Identity, layout: SidebarLayout[]) {
      return writeOrRefuse(db, identity, async tx => {
        const sections = await tx
          .select({ id: sidebarSections.id })
          .from(sidebarSections)
          .for('update')
        const given = new Set(layout.map(section => section.id))
        if (
          given.size !== layout.length ||
          sections.length !== layout.length ||
          sections.some(section => !given.has(section.id))
        ) {
          throw new Refused('stale_version')
        }
        const items = layout.flatMap(section => section.items)
        const idsOf = (kind: SidebarItem['kind']) => [
          ...new Set(
            items.filter(item => item.kind === kind).map(item => item.id)
          )
        ]
        // Only boards the person is a member of and views of their own.
        const accessible = accessibleBoards(tx, identity.userId)
        const boardIds = idsOf('board')
        const viewIds = idsOf('view')
        const seenBoards =
          boardIds.length === 0
            ? []
            : await tx
                .select({ id: accessible.boardId })
                .from(accessible)
                .where(inArray(accessible.boardId, boardIds))
        const seenViews =
          viewIds.length === 0
            ? []
            : await tx
                .select({ id: savedFilters.id })
                .from(savedFilters)
                .where(inArray(savedFilters.id, viewIds))
        if (
          seenBoards.length !== boardIds.length ||
          seenViews.length !== viewIds.length
        ) {
          throw new Refused('not_found')
        }

        await tx.delete(sidebarSectionItems).where(
          inArray(
            sidebarSectionItems.sectionId,
            sections.map(section => section.id)
          )
        )
        // An item in two sections stays in the first.
        const placed: SidebarItem[] = []
        for (const [position, section] of layout.entries()) {
          await tx
            .update(sidebarSections)
            .set({ position })
            .where(eq(sidebarSections.id, section.id))
          const unique = section.items.filter(item => {
            if (placed.some(each => sameItem(each, item))) return false
            placed.push(item)
            return true
          })
          if (unique.length === 0) continue
          await tx.insert(sidebarSectionItems).values(
            unique.map((item, itemPosition) => ({
              sectionId: section.id,
              organizationId: identity.organizationId,
              userId: identity.userId,
              boardId: item.kind === 'board' ? item.id : null,
              filterId: item.kind === 'view' ? item.id : null,
              position: itemPosition
            }))
          )
        }
        // Favorites being the first section, the others hold favorites too.
        if (boardIds.length > 0) {
          await tx
            .insert(boardFavorites)
            .values(
              boardIds.map(boardId => ({
                boardId,
                organizationId: identity.organizationId,
                userId: identity.userId
              }))
            )
            .onConflictDoNothing()
        }
        if (viewIds.length > 0) {
          await tx
            .update(savedFilters)
            .set({ favorite: true })
            .where(inArray(savedFilters.id, viewIds))
        }
      })
    }
  }
}
