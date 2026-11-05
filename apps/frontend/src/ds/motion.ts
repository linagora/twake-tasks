import { useMediaQuery, type Theme } from '@linagora/twake-mui'

export const MOTION_MS = 200

/** A short transition of `properties`, none when motion is reduced. */
export const motion = (theme: Theme, properties: string[]) => ({
  transition: theme.transitions.create(properties, {
    duration: MOTION_MS,
    easing: theme.transitions.easing.easeInOut
  }),
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
})

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true })
}
