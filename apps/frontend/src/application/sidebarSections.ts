import type { SidebarItem, SidebarSection } from '@/application/boards'

export const sameItem = (a: SidebarItem, b: SidebarItem): boolean =>
  a.kind === b.kind && a.id === b.id

export const holds = (section: SidebarSection, item: SidebarItem): boolean =>
  section.items.some(each => sameItem(each, item))

const changing = (
  sections: SidebarSection[],
  sectionId: string,
  change: (items: SidebarItem[]) => SidebarItem[]
): SidebarSection[] =>
  sections.map(section =>
    section.id === sectionId
      ? { ...section, items: change(section.items) }
      : section
  )

/** The section the item is in, null when in Favorites or none. */
export const sectionOf = (
  sections: SidebarSection[],
  item: SidebarItem
): string | null => sections.find(section => holds(section, item))?.id ?? null

/** Takes the item out of the section it is in, back to Favorites. */
export function withoutItem(
  sections: SidebarSection[],
  item: SidebarItem
): SidebarSection[] {
  return sections.map(section =>
    holds(section, item)
      ? {
          ...section,
          items: section.items.filter(each => !sameItem(each, item))
        }
      : section
  )
}

/**
 * Moves the item to the end of the section, out of the one it was in, as it
 * is in one section at most; unless it is there already.
 */
export function withItem(
  sections: SidebarSection[],
  sectionId: string,
  item: SidebarItem
): SidebarSection[] {
  const target = sections.find(section => section.id === sectionId)
  if (!target || holds(target, item)) return sections
  return changing(withoutItem(sections, item), sectionId, items => [
    ...items,
    item
  ])
}

/** Moves a section up (-1) or down (+1) among the others. */
export function movedSection(
  sections: SidebarSection[],
  sectionId: string,
  offset: -1 | 1
): SidebarSection[] {
  const from = sections.findIndex(section => section.id === sectionId)
  const to = from + offset
  if (from < 0 || to < 0 || to >= sections.length) return sections
  const moved = [...sections]
  const [section] = moved.splice(from, 1)
  if (section) moved.splice(to, 0, section)
  return moved
}

/**
 * Where a dragged item lands: a section, at the place of one of its items,
 * or at its end when `index` is past them, as dnd-kit sorts.
 */
export interface SidebarDrop {
  sectionId: string
  index: number
}

/**
 * The sections once the item is dropped: sorted within its section, else
 * moved there out of the one it was in, as it is in one section at most.
 */
export function droppedItem(
  sections: SidebarSection[],
  item: SidebarItem,
  drop: SidebarDrop
): SidebarSection[] {
  const target = sections.find(section => section.id === drop.sectionId)
  if (!target) return sections
  if (holds(target, item)) {
    return changing(sections, drop.sectionId, items => {
      const from = items.findIndex(each => sameItem(each, item))
      const moved = items.filter((_, index) => index !== from)
      moved.splice(Math.min(drop.index, moved.length), 0, item)
      return moved
    })
  }
  return changing(withoutItem(sections, item), drop.sectionId, items => {
    const placed = [...items]
    placed.splice(Math.min(drop.index, placed.length), 0, item)
    return placed
  })
}
