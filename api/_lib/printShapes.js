export const PRINT_SHAPE_VALUES = ['square', 'circle', 'cone', 'bubble', 'gift', 'heart', 'star']

export function isValidPrintShape(value) {
  return PRINT_SHAPE_VALUES.includes(value)
}
