import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactElement, ReactNode } from 'react'

import { Card, Column, type CardProps, type ColumnProps } from '@/ds/Columns'

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
