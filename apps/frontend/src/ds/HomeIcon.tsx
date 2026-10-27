import type { ReactElement, SVGAttributes } from 'react'

/**
 * twake-icons' home.svg, the outlined house of Twake Space's Home tab. Its
 * Home component still draws an older, filled house in two fixed greys. A
 * function, as Icon draws no other kind of component.
 */
export function HomeIcon(props: SVGAttributes<SVGSVGElement>): ReactElement {
  return (
    <svg viewBox="0 -1.5 20 20" fill="currentColor" {...props}>
      <path d="m10 2.69 5 4.5V15h-2V9H7v6H5V7.19l5-4.5ZM10 0 0 9h3v8h6v-6h2v6h6V9h3L10 0Z" />
    </svg>
  )
}
