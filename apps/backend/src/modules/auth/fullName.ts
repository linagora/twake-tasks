/**
 * A person's given and family names as one, or null when both are blank.
 * Some directories already end the given name with the family name ("User
 * One" and "One"), which is then not added twice.
 */
export function fullName(
  given: string | null | undefined,
  family: string | null | undefined
): string | null {
  const first = given?.trim() ?? ''
  const last = family?.trim() ?? ''
  const repeats =
    last !== '' &&
    (first.toLowerCase() === last.toLowerCase() ||
      first.toLowerCase().endsWith(` ${last.toLowerCase()}`))
  return [first, repeats ? '' : last].filter(Boolean).join(' ') || null
}
