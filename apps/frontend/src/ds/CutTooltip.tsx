import { Tooltip } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

/**
 * A tooltip with the whole text of its child when the ellipsis cuts it short,
 * else with `title`, if any.
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
      title={shown ?? title ?? ''}
      open={shown !== null}
      onOpen={() => {
        const child = node.current
        setShown(
          child && child.scrollWidth > child.clientWidth
            ? child.textContent
            : (title ?? null)
        )
      }}
      onClose={() => {
        setShown(null)
      }}
    >
      {children}
    </Tooltip>
  )
}
