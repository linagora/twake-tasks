// The swatches of Twake Mail's label dialog, in its order, so a label looks
// the same in both apps.
export const LABEL_COLORS = [
  { name: 'navyBlue', value: '#273891' },
  { name: 'purple', value: '#7E57E3' },
  { name: 'lavender', value: '#9E83E8' },
  { name: 'indigo', value: '#617ADB' },
  { name: 'blue', value: '#4896E5' },
  { name: 'petrolBlue', value: '#038199' },
  { name: 'darkGreen', value: '#457D6C' },
  { name: 'turquoise', value: '#1EBBCC' },
  { name: 'green', value: '#51B588' },
  { name: 'red', value: '#E0465C' },
  { name: 'magenta', value: '#ED20A4' },
  { name: 'pink', value: '#ED768D' },
  { name: 'brown', value: '#B85B17' },
  { name: 'lightBrown', value: '#BA8144' },
  { name: 'salmon', value: '#ED916B' },
  { name: 'orange', value: '#EDA91D' },
  { name: 'yellow', value: '#EDC661' },
  { name: 'black', value: '#131326' },
  { name: 'darkGrey', value: '#2C2C42' },
  { name: 'grey', value: '#646580' }
] as const

/**
 * The color a new label starts with: the first swatch the board's labels use
 * the least, so labels made one after another each get their own.
 */
export function defaultLabelColor(used: readonly (string | null)[]): string {
  const count = (value: string) =>
    used.filter(color => color?.toLowerCase() === value.toLowerCase()).length
  let best: string = LABEL_COLORS[0].value
  for (const swatch of LABEL_COLORS) {
    if (count(swatch.value) < count(best)) best = swatch.value
  }
  return best
}
