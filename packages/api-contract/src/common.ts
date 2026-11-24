import { z } from 'zod'

export const instant = z.iso.datetime({ offset: true })

// Canonical names only: an alias, `UTC` or another case still needs the
// formatter. Fixed, so a client cannot grow it with endless case variants.
const listedZones = new Set(Intl.supportedValuesOf('timeZone'))

export function isTimeZone(zone: string): boolean {
  if (listedZones.has(zone)) return true
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

// Two names that render alike are the same name: invisible format characters
// go, accents are composed, and compatibility forms such as full width letters
// and ligatures are folded. Kept, because they change what renders: the
// joiner of an emoji sequence, a joiner between letters of a script that
// shapes with it (Persian, Devanagari), the tags of a subdivision flag.
const emojiJoiner = String.raw`(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}])\u{200D}(?=\p{Extended_Pictographic})`
const scriptJoiner = String.raw`(?<=[\p{L}\p{M}])(?<![\p{sc=Latin}\p{sc=Inherited}])[\u{200C}\u{200D}](?=[\p{L}\p{M}])`
// The flag and the unbroken run of tags after it match as one, so a tag cut
// off from the flag goes and a stored name stays as is. Matching forward keeps
// a long run of tags linear, where a lookbehind over the run is quadratic.
const flagTag = String.raw`\u{1F3F4}[\u{E0020}-\u{E007E}]*\u{E007F}?`
const invisible = new RegExp(
  String.raw`(${emojiJoiner}|${scriptJoiner}|${flagTag})|\p{Cf}`,
  'gu'
)

const printable = /^[\x20-\x7e]*$/

export const uniqueName = (max: number) =>
  z
    .string()
    // Bounds the folding below by what a name may hold, not by the body size.
    // A name padded far past it with invisible characters is refused.
    .refine(name => name.length <= 16 * max, { abort: true })
    // Folded before the joiners are judged, since folding can turn a letter
    // into Latin (a mathematical A), and again to compose what removal joins.
    .overwrite(name => {
      if (printable.test(name)) return name
      const folded = name.normalize('NFKC')
      const cleaned = folded.replace(
        invisible,
        (_, kept: string | undefined) => kept ?? ''
      )
      return cleaned === folded ? cleaned : cleaned.normalize('NFKC')
    })
    .trim()
    .min(1)
    .max(max)
