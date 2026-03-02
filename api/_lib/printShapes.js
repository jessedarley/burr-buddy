export const PRINT_SHAPE_VALUES = ['circle']

export function isValidPrintShape(value) {
  return PRINT_SHAPE_VALUES.includes(value)
}
