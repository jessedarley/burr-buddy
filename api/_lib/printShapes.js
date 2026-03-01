export const PRINT_SHAPE_VALUES = ['circle', 'heart', 'hexagon', 'star', 'gift', 'icecream']

export function isValidPrintShape(value) {
  return PRINT_SHAPE_VALUES.includes(value)
}
