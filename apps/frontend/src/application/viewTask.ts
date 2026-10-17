import type { Section } from '@/domain/board'

/** A view shows open tasks: the first section a task is open in. */
export function openSection(sections: readonly Section[]): Section | null {
  return (
    sections.find(each => each.category === 'unstarted') ??
    sections.find(
      each => each.category !== 'completed' && each.category !== 'canceled'
    ) ??
    null
  )
}

/**
 * The status a task moved to another board takes there: the one of the same
 * name, whatever its case, else the board's first open one, as for a task
 * with no status.
 */
export function keptSection(
  from: readonly Pick<Section, 'id' | 'name'>[],
  sectionId: string | null,
  to: readonly Section[]
): Section | null {
  const name = from.find(each => each.id === sectionId)?.name
  const same =
    name === undefined
      ? undefined
      : to.find(
          each =>
            each.name.trim().toLocaleLowerCase() ===
            name.trim().toLocaleLowerCase()
        )
  return same ?? openSection(to)
}
