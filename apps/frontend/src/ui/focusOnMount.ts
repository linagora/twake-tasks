// A stable callback ref: an inline one is re-invoked on every render and steals focus.
export const focusOnMount = (element: HTMLElement | null): void => {
  element?.focus()
}

export const selectOnMount = (input: HTMLInputElement | null): void => {
  input?.focus()
  input?.select()
}
