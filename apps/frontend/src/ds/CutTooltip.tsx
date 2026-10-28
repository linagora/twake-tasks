import { Tooltip } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

// An ellipsis needs a box that hides its overflow. The search stops at the
// first such box, so that one nested in it keeps its own tooltip. An icon's
// svg hides its overflow too, but holds no text.
const isCut = (element: Element): boolean =>
  element instanceof HTMLElement &&
  (getComputedStyle(element).overflow === 'hidden'
    ? element.scrollWidth > element.clientWidth
    : Array.from(element.children).some(isCut))

/**
 * A tooltip with the whole text of its child when an ellipsis in it cuts it
 * short, else with `title`, if any.
 */
export function CutTooltip({
  title,
  children
}: {
  title?: string
  children: ReactElement
}): ReactElement {
  const node = useRef<HTMLElement>(null)
  const [shown, setShown] = useState<ReactNode>(null)
  return (
    <Tooltip
      ref={node}
      describeChild
      enterDelay={500}
      title={shown ?? title ?? ''}
      open={shown !== null}
      onOpen={() => {
        const child = node.current
        setShown(child && isCut(child) ? child.textContent : (title ?? null))
      }}
      onClose={() => {
        setShown(null)
      }}
    >
      {children}
    </Tooltip>
  )
}
