export const PRINT_SHAPE_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'heart', label: 'Heart' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'star', label: 'Star' },
  { value: 'gift', label: 'Gift' },
  { value: 'icecream', label: 'Ice Cream Cone' },
  { value: 'speechbubble', label: 'Speech Bubble' },
]

export const PRINT_SHAPE_VALUES = PRINT_SHAPE_OPTIONS.map((option) => option.value)

export function getPrintShapeLabel(value) {
  const match = PRINT_SHAPE_OPTIONS.find((option) => option.value === value)
  return match ? match.label : value
}
