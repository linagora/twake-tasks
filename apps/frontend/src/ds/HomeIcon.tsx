import { Home } from '@linagora/twake-icons'
import { styled } from '@linagora/twake-mui'
import type { ReactElement, SVGAttributes } from 'react'

const OneColourHome = styled(Home)({ '& path': { fill: 'currentColor' } })

/**
 * twake-icons' Home is drawn in two fixed greys, the darker one lost on a dark
 * theme: one shape in the colour of the text instead. A function, as Icon
 * draws no other kind of component.
 */
export function HomeIcon(props: SVGAttributes<SVGSVGElement>): ReactElement {
  return <OneColourHome {...props} />
}
