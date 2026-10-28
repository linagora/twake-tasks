import { Magnifier } from '@linagora/twake-icons'
import { SearchBar as TwakeSearchBar, styled } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement, SVGAttributes } from 'react'

// twake-mui's SearchBar draws its icon with twake-icons' Icon, which leaves
// it exposed to screen readers.
function HiddenMagnifier(props: SVGAttributes<SVGSVGElement>): ReactElement {
  return <Magnifier {...props} aria-hidden />
}

function MagnifierSearchBar(
  props: ComponentProps<typeof TwakeSearchBar>
): ReactElement {
  return <TwakeSearchBar icon={HiddenMagnifier} {...props} />
}

// twake-mui's SearchBar bakes in the light palette; the theme's CSS variables
// follow a color scheme switched at runtime.
export const SearchBar = styled(MagnifierSearchBar)(({ theme }) => ({
  '&&': {
    backgroundColor: theme.vars.palette.background.default,
    '&.SearchBar-focused': {
      backgroundColor: theme.vars.palette.background.paper,
      borderColor: theme.vars.palette.primary.main
    }
  },
  // A small, faded magnifier, as Twake Drive's search.
  '& .SearchBar-icon': {
    color: theme.vars.palette.text.primary,
    opacity: 0.42,
    margin: theme.spacing(0, 0.5, 0, 1),
    '& svg': { width: 16, height: 16 }
  },
  '& .SearchBar-focusHighlight': {
    backgroundColor: theme.vars.palette.action.hover
  }
}))
