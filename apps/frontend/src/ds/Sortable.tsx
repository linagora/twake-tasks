import { useDroppable } from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import { Card, Column, type CardProps, type ColumnProps } from '@/ds/Columns'
import { ListRow, ListSection } from '@/ds/ListView'

export function SortableCard({
  id,
  description,
  ...props
}: CardProps & { id: string; description: string }): ReactElement {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({
    id,
    attributes: { role: 'article', roleDescription: description }
  })
  return (
    <Card
      {...props}
      {...attributes}
      {...listeners}
      // With the card as its own activator, Space and Enter pick it up only when
      // the card itself has focus, so they still reach its title and menu.
      ref={node => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      drag={isDragging ? 'placeholder' : 'none'}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  )
}

export function SortableList({
  ids,
  children
}: {
  ids: string[]
  children: ReactNode
}): ReactElement {
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  )
}

export function DropColumn({
  id,
  ...props
}: ColumnProps & { id: string }): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <Column {...props} ref={setNodeRef} highlighted={isOver} />
}

export function SortableListRow({
  id,
  description,
  ...props
}: ComponentProps<typeof ListRow> & {
  id: string
  description: string
}): ReactElement {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isSorting
  } = useSortable({
    id,
    attributes: { role: 'listitem', roleDescription: description },
    // The rows stand where they were dropped, as in Twake Drive; sliding
    // them back would start from a place they have already left.
    animateLayoutChanges: () => false
  })
  return (
    <ListRow
      {...props}
      {...attributes}
      {...listeners}
      // As the activator, Space and Enter pick the row up only from the row
      // itself, and still tick its checkbox or open its title.
      ref={node => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      drag={isDragging ? 'placeholder' : 'none'}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isSorting ? transition : undefined
      }}
    />
  )
}

export function DropListSection({
  id,
  ...props
}: ComponentProps<typeof ListSection> & { id: string }): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <ListSection {...props} ref={setNodeRef} highlighted={isOver} />
}

/** Marks a column's sortable, so that a drag tells columns from cards. */
export const COLUMN = 'column'

export function SortableColumns({
  ids,
  children
}: {
  ids: string[]
  children: ReactNode
}): ReactElement {
  return (
    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
      {children}
    </SortableContext>
  )
}

// A column cards drop in, which its header also picks up to reorder it.
export function SortableColumn({
  id,
  sortId,
  description,
  ...props
}: ColumnProps & {
  /** Where cards drop. */
  id: string
  /** Where the column sits among the others. */
  sortId: string
  description: string
}): ReactElement {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: sortId,
    data: { type: COLUMN },
    attributes: { roleDescription: description }
  })
  return (
    <Column
      {...props}
      ref={node => {
        setNodeRef(node)
        setDropRef(node)
      }}
      highlighted={isOver}
      // As the activator, Space and Enter pick the column up only from its
      // header, and still open the section menu inside it.
      handle={{ ...attributes, ...listeners, ref: setActivatorNodeRef }}
      drag={isDragging ? 'placeholder' : 'none'}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  )
}
