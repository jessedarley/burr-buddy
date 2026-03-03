export const PRINT_SHAPE_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'cone', label: 'Ice Cream Cone' },
  { value: 'bubble', label: 'Speech Bubble' },
  { value: 'gift', label: 'Gift Box' },
  { value: 'heart', label: 'Heart' },
  { value: 'star', label: 'Star' },
]

export const PRINT_SHAPE_VALUES = PRINT_SHAPE_OPTIONS.map((option) => option.value)

export function getPrintShapeLabel(value) {
  const match = PRINT_SHAPE_OPTIONS.find((option) => option.value === value)
  return match ? match.label : value
}
