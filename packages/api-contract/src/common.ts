import { z } from 'zod'

export function isTimeZone(zone: string): boolean {
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
const flagTag = String.raw`(?<=[\u{1F3F4}\u{E0020}-\u{E007E}])[\u{E0020}-\u{E007F}]`
const invisible = new RegExp(
  String.raw`(${emojiJoiner}|${scriptJoiner}|${flagTag})|\p{Cf}`,
  'gu'
)

export const uniqueName = (max: number) =>
  z
    .string()
    .overwrite(name =>
      name
        .replace(invisible, (_, kept: string | undefined) => kept ?? '')
        .normalize('NFKC')
    )
    .trim()
    .min(1)
    .max(max)
