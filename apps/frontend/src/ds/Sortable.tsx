import { useDroppable } from '@dnd-kit/core'
import {
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
      ref={setNodeRef}
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
      ref={setNodeRef}
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
