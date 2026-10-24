import { ButtonBase, type ButtonBaseProps } from '@linagora/twake-mui'
import {
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'

/** A page title that opens its editor, drawn as the text it replaces. */
export function TitleButton({
  children,
  focusOnMount = false,
  ref,
  ...props
}: Omit<ButtonBaseProps, 'ref'> & {
  children: ReactNode
  focusOnMount?: boolean
  ref?: Ref<HTMLButtonElement>
}): ReactElement {
  const node = useRef<HTMLButtonElement | null>(null)
  const join = useCallback(
    (button: HTMLButtonElement | null) => {
      node.current = button
      if (typeof ref === 'function') ref(button)
      else if (ref) ref.current = button
    },
    [ref]
  )
  useEffect(() => {
    if (focusOnMount) node.current?.focus()
  }, [focusOnMount])

  return (
    <ButtonBase
      {...props}
      ref={join}
      sx={{
        font: 'inherit',
        color: 'inherit',
        // Not a flex box, which the ellipsis does not cut.
        display: 'inline-block',
        verticalAlign: 'bottom',
        maxWidth: '100%',
        textAlign: 'start',
        borderRadius: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        '&:hover': {
          backgroundColor: 'action.hover',
          textDecoration: 'underline dotted'
        },
        '&.Mui-focusVisible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2
        }
      }}
    >
      {children}
    </ButtonBase>
  )
}
