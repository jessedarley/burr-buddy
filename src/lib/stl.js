const BASE_PLATE_WIDTH = 80
const BASE_PLATE_HEIGHT = 50
const CELL_MM = 0.8
const BASE_THICKNESS_MM = 3.6
const DEBOSS_DEPTH_MM = 0.9

const FONT_5X7 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['11111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
}

function pushTriangle(lines, a, b, c) {
  lines.push('facet normal 0 0 0')
  lines.push('outer loop')
  lines.push(`vertex ${a[0]} ${a[1]} ${a[2]}`)
  lines.push(`vertex ${b[0]} ${b[1]} ${b[2]}`)
  lines.push(`vertex ${c[0]} ${c[1]} ${c[2]}`)
  lines.push('endloop')
  lines.push('endfacet')
}

function quad(lines, p1, p2, p3, p4) {
  pushTriangle(lines, p1, p2, p3)
  pushTriangle(lines, p1, p3, p4)
}

function normalizedTokenForDeboss(token) {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function renderTokenToGrid(token, cols, rows) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false))
  const sanitized = normalizedTokenForDeboss(token)
  if (!sanitized) return grid

  const chars = sanitized.split('').slice(0, 16)
  const charWidth = 5
  const charHeight = 7
  const spacing = 1
  const textWidth = chars.length * charWidth + (chars.length - 1) * spacing
  const offsetX = Math.max(2, Math.floor((cols - textWidth) / 2))
  const offsetY = Math.max(2, Math.floor((rows - charHeight) / 2))

  chars.forEach((char, index) => {
    const bitmap = FONT_5X7[char]
    if (!bitmap) return
    const xStart = offsetX + index * (charWidth + spacing)
    for (let y = 0; y < charHeight; y += 1) {
      const row = bitmap[y]
      for (let x = 0; x < charWidth; x += 1) {
        if (row[x] === '1') {
          const gx = xStart + x
          const gy = offsetY + y
          if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
            grid[gy][gx] = true
          }
        }
      }
    }
  })

  return grid
}

export function generateTokenPlaqueStl(token) {
  const cols = Math.floor(BASE_PLATE_WIDTH / CELL_MM)
  const rows = Math.floor(BASE_PLATE_HEIGHT / CELL_MM)
  const depressedCells = renderTokenToGrid(token, cols, rows)
  const hTop = BASE_THICKNESS_MM
  const hDeboss = BASE_THICKNESS_MM - DEBOSS_DEPTH_MM
  const lines = ['solid burr_buddy_plaque']

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const x0 = x * CELL_MM
      const x1 = (x + 1) * CELL_MM
      const y0 = y * CELL_MM
      const y1 = (y + 1) * CELL_MM
      const top = depressedCells[y][x] ? hDeboss : hTop

      quad(lines, [x0, y0, top], [x1, y0, top], [x1, y1, top], [x0, y1, top])
      quad(lines, [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0])

      if (x === 0) {
        quad(lines, [x0, y0, 0], [x0, y0, top], [x0, y1, top], [x0, y1, 0])
      }
      if (x === cols - 1) {
        quad(lines, [x1, y0, 0], [x1, y1, 0], [x1, y1, top], [x1, y0, top])
      }
      if (y === 0) {
        quad(lines, [x0, y0, 0], [x1, y0, 0], [x1, y0, top], [x0, y0, top])
      }
      if (y === rows - 1) {
        quad(lines, [x0, y1, 0], [x0, y1, top], [x1, y1, top], [x1, y1, 0])
      }

      if (x < cols - 1) {
        const rightTop = depressedCells[y][x + 1] ? hDeboss : hTop
        if (top !== rightTop) {
          const zLow = Math.min(top, rightTop)
          const zHigh = Math.max(top, rightTop)
          quad(lines, [x1, y0, zLow], [x1, y0, zHigh], [x1, y1, zHigh], [x1, y1, zLow])
        }
      }
      if (y < rows - 1) {
        const lowerTop = depressedCells[y + 1][x] ? hDeboss : hTop
        if (top !== lowerTop) {
          const zLow = Math.min(top, lowerTop)
          const zHigh = Math.max(top, lowerTop)
          quad(lines, [x0, y1, zLow], [x1, y1, zLow], [x1, y1, zHigh], [x0, y1, zHigh])
        }
      }
    }
  }

  lines.push('endsolid burr_buddy_plaque')
  return lines.join('\n')
}

export function downloadTokenPlaqueStl(token) {
  const stl = generateTokenPlaqueStl(token)
  const blob = new Blob([stl], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `burr-buddy-${token}.stl`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
