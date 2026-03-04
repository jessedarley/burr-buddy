import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import qrcode from 'qrcode-generator'
import circleSvgRaw from '../assets/Burr Buddy Shapes_Circle.svg?raw'
import coneSvgRaw from '../assets/Burr Buddy Shapes - Ice Cream.svg?raw'
import bubbleSvgRaw from '../assets/Burr Buddy Shapes_Bubble.svg?raw'
import giftSvgRaw from '../assets/Burr Buddy Shapes_Gift.svg?raw'
import heartSvgRaw from '../assets/Burr Buddy Shapes_Heart.svg?raw'
import starSvgRaw from '../assets/Burr Buddy Shapes_Star.svg?raw'

const SVG_UNITS_PER_INCH = 72
const MM_PER_SVG_UNIT = 25.4 / SVG_UNITS_PER_INCH
const BASE_THICKNESS_MM = 3.175
const EMBOSS_HEIGHT_MM = 0.7
const QR_SIDE_MM = 25.4
const QR_QUIET_ZONE_MODULES = 2
const OVERLAY_HEIGHT_MM = 0.01
const OVERLAY_Z_OFFSET_MM = 0.005
const CURVE_SEGMENTS = 24
const STL_CACHE_MAX = 24
const QR_CACHE_MAX = 128

const SHAPE_SVG_RAW = {
  circle: circleSvgRaw,
  cone: coneSvgRaw,
  bubble: bubbleSvgRaw,
  gift: giftSvgRaw,
  heart: heartSvgRaw,
  star: starSvgRaw,
}

const layoutCache = new Map()
const stlCache = new Map()
const qrCache = new Map()

function styleValue(path, key) {
  const raw = path?.userData?.style?.[key]
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

function nodeAttr(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return ''
  const value = node.getAttribute(name)
  return typeof value === 'string' ? value.trim() : ''
}

function valueIsYellow(value) {
  if (!value) return false
  const normalized = value.replace(/\s+/g, '').toLowerCase()
  return (
    normalized === 'yellow' ||
    normalized === '#ff0' ||
    normalized === '#ffff00' ||
    normalized === 'rgb(255,255,0)'
  )
}

function pathColorIsBlack(path) {
  const color = path?.color
  if (!color) return false
  return color.r <= 0.02 && color.g <= 0.02 && color.b <= 0.02
}

function valueIsBlack(value) {
  if (!value) return false
  if (value === '#000' || value === '#000000' || value === 'black') return true
  if (value.replace(/\s+/g, '') === 'rgb(0,0,0)') return true
  return false
}

function valueIsNone(value) {
  if (!value) return false
  return value === 'none'
}

function normalizeShape(printShape = 'circle') {
  return SHAPE_SVG_RAW[printShape] ? printShape : 'circle'
}

function getShapeBounds(shapes) {
  const points = []
  shapes.forEach((shape) => {
    const extracted = shape.extractPoints(80)
    points.push(...extracted.shape)
    extracted.holes.forEach((hole) => points.push(...hole))
  })
  if (points.length === 0) return null
  return new THREE.Box2().setFromPoints(points)
}

function parseRectBoundsFromNode(node) {
  if (!node || node.nodeName !== 'rect') return null
  const x = Number.parseFloat(node.getAttribute('x') || '0')
  const y = Number.parseFloat(node.getAttribute('y') || '0')
  const width = Number.parseFloat(node.getAttribute('width') || '0')
  const height = Number.parseFloat(node.getAttribute('height') || '0')
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }
  return new THREE.Box2(new THREE.Vector2(x, y), new THREE.Vector2(x + width, y + height))
}

function transformGeometryToBaseSpace(geometry, baseBox, mmPerSvgUnit) {
  const centerX = (baseBox.min.x + baseBox.max.x) / 2
  const centerY = (baseBox.min.y + baseBox.max.y) / 2
  geometry.translate(-centerX, -centerY, 0)
  geometry.scale(mmPerSvgUnit, -mmPerSvgUnit, 1)
}

function parseShapeLayout(printShape = 'circle') {
  const shapeKey = normalizeShape(printShape)
  const cachedLayout = layoutCache.get(shapeKey)
  if (cachedLayout) return cachedLayout

  const loader = new SVGLoader()
  const data = loader.parse(SHAPE_SVG_RAW[shapeKey])

  const entries = data.paths
    .map((path) => {
      const node = path?.userData?.node || null
      const rectBounds = parseRectBoundsFromNode(node)
      const shapes = SVGLoader.createShapes(path)
      const shapeBounds = getShapeBounds(shapes)
      const bounds = rectBounds || shapeBounds
      if (!bounds) return null

      const width = bounds.max.x - bounds.min.x
      const height = bounds.max.y - bounds.min.y
      const area = width * height
      const fill = styleValue(path, 'fill')
      const stroke = styleValue(path, 'stroke')
      const hasFill = !valueIsNone(fill)
      const hasStroke = !valueIsNone(stroke)

      return {
        path,
        node,
        shapes,
        bounds,
        area,
        nodeName: node?.nodeName || '',
        hasGeometryShapes: shapes.length > 0,
        hasFill,
        hasStroke,
        isBlackFill: hasFill && (valueIsBlack(fill) || (fill === '' && pathColorIsBlack(path))),
        isBlackStroke: hasStroke && (valueIsBlack(stroke) || pathColorIsBlack(path)),
        className: nodeAttr(node, 'class').toLowerCase(),
        nodeId: nodeAttr(node, 'id').toLowerCase(),
        fillColor: fill,
        strokeColor: stroke,
      }
    })
    .filter(Boolean)

  const isLikelyBase = (entry) =>
    entry.hasGeometryShapes &&
    entry.nodeName !== 'rect' &&
    (entry.className === 'st0' || (entry.hasFill && !entry.isBlackFill))

  const baseEntry =
    entries.filter((entry) => entry.hasGeometryShapes && entry.className === 'st0').sort((a, b) => b.area - a.area)[0] ||
    entries.filter(isLikelyBase).sort((a, b) => b.area - a.area)[0] ||
    entries.filter((entry) => entry.hasGeometryShapes).sort((a, b) => b.area - a.area)[0]

  if (!baseEntry) throw new Error(`${shapeKey} SVG base shape unavailable`)

  const squareEntry =
    entries.find((entry) => entry.nodeName === 'rect' && entry.nodeId === 'qr-box') ||
    entries.find(
      (entry) =>
        entry.nodeName === 'rect' &&
        (entry.className.includes('qr') ||
          entry.nodeId.includes('qr') ||
          valueIsYellow(entry.fillColor) ||
          valueIsYellow(entry.strokeColor)),
    ) ||
    entries.find((entry) => entry.nodeName === 'rect' && (entry.className === 'st1' || entry.isBlackStroke)) ||
    entries.find((entry) => entry.nodeName === 'rect') ||
    entries.find((entry) => entry.isBlackStroke && !entry.hasFill)

  if (!squareEntry) throw new Error(`${shapeKey} SVG QR square unavailable`)

  const textEntries = entries.filter(
    (entry) =>
      entry !== baseEntry &&
      entry !== squareEntry &&
      entry.hasGeometryShapes &&
      entry.nodeName === 'path',
  )

  const baseBox = baseEntry.bounds
  const baseWidthSvg = baseBox.max.x - baseBox.min.x
  const baseHeightSvg = baseBox.max.y - baseBox.min.y
  const mmPerSvgUnit = MM_PER_SVG_UNIT

  const squareBox = squareEntry.bounds
  const baseCenterX = (baseBox.min.x + baseBox.max.x) / 2
  const baseCenterY = (baseBox.min.y + baseBox.max.y) / 2
  const qrCenter = {
    x: (squareBox.min.x + squareBox.max.x) / 2,
    y: (squareBox.min.y + squareBox.max.y) / 2,
  }

  const layout = {
    baseShapes: baseEntry.shapes,
    textShapes: textEntries.flatMap((entry) => entry.shapes),
    baseBox,
    mmPerSvgUnit,
    widthMm: baseWidthSvg * mmPerSvgUnit,
    heightMm: baseHeightSvg * mmPerSvgUnit,
    qrCenterMm: {
      x: (qrCenter.x - baseCenterX) * mmPerSvgUnit,
      y: (baseCenterY - qrCenter.y) * mmPerSvgUnit,
    },
  }

  layoutCache.set(shapeKey, layout)
  return layout
}

function mergeGeometryList(geometries) {
  if (!geometries || geometries.length === 0) return null
  const normalized = geometries.map((geometry) => {
    // mergeGeometries requires all inputs to have matching index mode/attributes.
    const candidate = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (!candidate.getAttribute('normal')) candidate.computeVertexNormals()
    return candidate
  })
  const merged = mergeGeometries(normalized, false)
  geometries.forEach((geometry) => geometry.dispose())
  normalized.forEach((geometry) => geometry.dispose())
  return merged
}

function buildQrMatrix(payload) {
  const key = `${payload || ''}`
  const cached = qrCache.get(key)
  if (cached) return cached

  const qr = qrcode(0, 'L')
  qr.addData(key)
  qr.make()
  const size = qr.getModuleCount()
  const matrix = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  )

  const entry = { matrix, size }
  qrCache.set(key, entry)
  if (qrCache.size > QR_CACHE_MAX) {
    const oldestKey = qrCache.keys().next().value
    qrCache.delete(oldestKey)
  }
  return entry
}

function createQrEmbossGeometry(payload, zBase, depth, center = { x: 0, y: 0 }) {
  const { matrix, size } = buildQrMatrix(payload)
  const totalModules = size + QR_QUIET_ZONE_MODULES * 2
  const moduleSize = QR_SIDE_MM / totalModules
  const left = center.x - QR_SIDE_MM / 2
  const bottom = center.y - QR_SIDE_MM / 2

  const moduleGeometries = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!matrix[row][col]) continue
      const x = left + (col + QR_QUIET_ZONE_MODULES) * moduleSize
      const y = bottom + (size - 1 - row + QR_QUIET_ZONE_MODULES) * moduleSize
      const module = new THREE.BoxGeometry(moduleSize, moduleSize, depth)
      module.translate(x + moduleSize / 2, y + moduleSize / 2, zBase + depth / 2)
      moduleGeometries.push(module)
    }
  }

  return mergeGeometryList(moduleGeometries)
}

function createTextEmbossGeometry(printShape, depth, zBase) {
  const { textShapes, baseBox, mmPerSvgUnit } = parseShapeLayout(printShape)
  if (textShapes.length === 0) return null

  const textGeometries = []
  for (const shape of textShapes) {
    try {
      const geometry = new THREE.ExtrudeGeometry([shape], {
        depth,
        bevelEnabled: false,
        curveSegments: CURVE_SEGMENTS,
      })
      transformGeometryToBaseSpace(geometry, baseBox, mmPerSvgUnit)
      geometry.translate(0, 0, zBase)
      textGeometries.push(geometry)
    } catch {
      // Ignore invalid glyph paths from SVG; keep rendering remaining text paths.
    }
  }

  return mergeGeometryList(textGeometries)
}

function createFallbackBaseGeometry() {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, 25.4, 0, Math.PI * 2, false)
  return new THREE.ExtrudeGeometry(shape, {
    depth: BASE_THICKNESS_MM,
    bevelEnabled: false,
    curveSegments: CURVE_SEGMENTS,
  })
}

function createBaseGeometry(printShape) {
  const { baseShapes, baseBox, mmPerSvgUnit } = parseShapeLayout(printShape)
  const geometry = new THREE.ExtrudeGeometry(baseShapes, {
    depth: BASE_THICKNESS_MM,
    bevelEnabled: false,
    curveSegments: CURVE_SEGMENTS,
  })
  transformGeometryToBaseSpace(geometry, baseBox, mmPerSvgUnit)
  return geometry
}

function meshToAsciiStl(mesh) {
  const exporter = new STLExporter()
  return exporter.parse(mesh, { binary: false })
}

function generateFallbackStl(payload) {
  const baseGeometry = createFallbackBaseGeometry()
  const qrGeometry = createQrEmbossGeometry(payload, BASE_THICKNESS_MM, EMBOSS_HEIGHT_MM, { x: 0, y: 0 })
  const mergedGeometry = mergeGeometryList([baseGeometry, qrGeometry].filter(Boolean))
  if (!mergedGeometry) throw new Error('Fallback STL generation failed')
  mergedGeometry.computeVertexNormals()
  const mesh = new THREE.Mesh(mergedGeometry, new THREE.MeshStandardMaterial())
  const stl = meshToAsciiStl(mesh)
  mergedGeometry.dispose()
  return stl
}

export function getPrintSizeInches(printShape = 'circle') {
  try {
    const { widthMm, heightMm } = parseShapeLayout(printShape)
    const mmToIn = 1 / 25.4
    return {
      widthIn: Number((widthMm * mmToIn).toFixed(2)),
      heightIn: Number((heightMm * mmToIn).toFixed(2)),
      thicknessIn: Number((BASE_THICKNESS_MM * mmToIn).toFixed(3)),
    }
  } catch {
    return { widthIn: 2.0, heightIn: 2.0, thicknessIn: 0.125 }
  }
}

export function createQrOverlayGeometry(payload, printShape = 'circle') {
  try {
    const { qrCenterMm } = parseShapeLayout(printShape)
    return createQrEmbossGeometry(
      payload,
      BASE_THICKNESS_MM + EMBOSS_HEIGHT_MM + OVERLAY_Z_OFFSET_MM,
      OVERLAY_HEIGHT_MM,
      qrCenterMm,
    )
  } catch {
    return createQrEmbossGeometry(
      payload,
      BASE_THICKNESS_MM + EMBOSS_HEIGHT_MM + OVERLAY_Z_OFFSET_MM,
      OVERLAY_HEIGHT_MM,
      { x: 0, y: 0 },
    )
  }
}

export function createTextOverlayGeometry(printShape = 'circle') {
  try {
    return createTextEmbossGeometry(
      printShape,
      OVERLAY_HEIGHT_MM,
      BASE_THICKNESS_MM + EMBOSS_HEIGHT_MM + OVERLAY_Z_OFFSET_MM,
    )
  } catch {
    return null
  }
}

export function generateTokenPlaqueStl(token, printShape = 'circle', qrPayload) {
  const shapeKey = normalizeShape(printShape)
  const payload = qrPayload || token
  const cacheKey = `${shapeKey}|${token}|${payload}`
  const cached = stlCache.get(cacheKey)
  if (cached) return cached

  let stl
  try {
    const { qrCenterMm } = parseShapeLayout(shapeKey)
    const baseGeometry = createBaseGeometry(shapeKey)
    const qrGeometry = createQrEmbossGeometry(payload, BASE_THICKNESS_MM, EMBOSS_HEIGHT_MM, qrCenterMm)
    const textGeometry = createTextEmbossGeometry(shapeKey, EMBOSS_HEIGHT_MM, BASE_THICKNESS_MM)

    const mergedGeometry = mergeGeometryList([baseGeometry, qrGeometry, textGeometry].filter(Boolean))
    if (!mergedGeometry) throw new Error('Primary STL merge failed')

    mergedGeometry.computeVertexNormals()
    const mesh = new THREE.Mesh(mergedGeometry, new THREE.MeshStandardMaterial())
    stl = meshToAsciiStl(mesh)
    mergedGeometry.dispose()
  } catch {
    stl = generateFallbackStl(payload)
  }

  stlCache.set(cacheKey, stl)
  if (stlCache.size > STL_CACHE_MAX) {
    const oldestKey = stlCache.keys().next().value
    stlCache.delete(oldestKey)
  }

  return stl
}

export function downloadTokenPlaqueStl(token, printShape = 'circle', qrPayload) {
  const shapeKey = normalizeShape(printShape)
  const stl = generateTokenPlaqueStl(token, shapeKey, qrPayload)
  const blob = new Blob([stl], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `burr-buddy-${shapeKey}-${token}.stl`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
