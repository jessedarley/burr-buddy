import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import qrcode from 'qrcode-generator'
import { CSG } from 'three-csg-ts'
import droidSansBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json'
import heartSvgRaw from '../assets/heart.svg?raw'
import giftSvgRaw from '../assets/giftbox.svg?raw'
import iceCreamConeSvgRaw from '../assets/ice-cream-cone.svg?raw'
import speechBubbleSvgRaw from '../assets/speechbubble.svg?raw'

const TARGET_DIAMETER_MM = 50.8
const MIN_QR_SIDE_MM = 0
const QR_EDGE_CLEARANCE_MM = 3
const HOLE_DIAMETER_MM = 3.175
const HOLE_RADIUS_MM = HOLE_DIAMETER_MM / 2
const HOLE_EDGE_CLEARANCE_MM = HOLE_DIAMETER_MM
export const BASE_THICKNESS_MM = 3.175
export const DEBOSS_DEPTH_MM = 0.7
const FRONT_LOGO_DEBOSS_DEPTH_MM = 0.5
const FRONT_LOGO_WIDTH_RATIO_OF_QR = 0.82
const FRONT_LOGO_WIDTH_RATIO_OF_QR_GIFT = 0.72
const FRONT_LOGO_GAP_MM = 1.2
const FRONT_LOGO_EDGE_MARGIN_MM = 1.5
const FRONT_LOGO_MAX_HEIGHT_RATIO = 0.16
const FRONT_LOGO_MAX_HEIGHT_RATIO_GIFT = 0.13
const FRONT_LOGO_TEXT = 'burr buddy'
const FRONT_LOGO_CURVE_SEGMENTS = 10
const CURVE_SEGMENTS = 48
const HEART_SVG_SAMPLE_POINTS = 220
const LAYOUT_SAMPLE_POINTS = 220
const QR_MATRIX_CACHE_MAX = 64
const STL_CACHE_MAX = 24
let cachedHeartUnitWidthPoints = null
let cachedGiftUnitContours = null
let cachedIceCreamUnitContours = null
let cachedSpeechBubbleUnitContours = null
let cachedAppFont = null
let cachedFrontLogoBaseSize = null
const centeredLayoutCache = new Map()
const qrMatrixCache = new Map()
const stlCache = new Map()

function regularPolygon(sides, radius, rotation = 0) {
  const points = []
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (Math.PI * 2 * i) / sides
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
  }
  return points
}

function starPolygon(points, outerRadius, innerRadius, rotation = Math.PI / 2) {
  const verts = []
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const angle = rotation + (Math.PI * i) / points
    verts.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
  }
  return verts
}

function polygonArea(points) {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].y - points[i].x * points[j].y
  }
  return Math.abs(area / 2)
}

function simplifyContour(points, duplicateEpsilon = 1e-4, collinearEpsilon = 1e-5) {
  if (!points || points.length < 3) return points || []

  const deduped = []
  for (const p of points) {
    const prev = deduped[deduped.length - 1]
    if (!prev || p.distanceToSquared(prev) > duplicateEpsilon * duplicateEpsilon) {
      deduped.push(new THREE.Vector2(p.x, p.y))
    }
  }

  if (deduped.length > 2) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (first.distanceToSquared(last) <= duplicateEpsilon * duplicateEpsilon) {
      deduped.pop()
    }
  }

  if (deduped.length < 3) return deduped

  const simplified = []
  for (let i = 0; i < deduped.length; i += 1) {
    const prev = deduped[(i - 1 + deduped.length) % deduped.length]
    const curr = deduped[i]
    const next = deduped[(i + 1) % deduped.length]
    const ax = curr.x - prev.x
    const ay = curr.y - prev.y
    const bx = next.x - curr.x
    const by = next.y - curr.y
    const cross = Math.abs(ax * by - ay * bx)
    if (cross > collinearEpsilon) simplified.push(curr)
  }

  return simplified.length >= 3 ? simplified : deduped
}

function polygonCentroid(points) {
  if (points.length === 0) return new THREE.Vector2(0, 0)
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return new THREE.Vector2(x / points.length, y / points.length)
}

function insetPolygon(points, scale = 0.96) {
  const center = polygonCentroid(points)
  return points.map(
    (p) => new THREE.Vector2(center.x + (p.x - center.x) * scale, center.y + (p.y - center.y) * scale),
  )
}

function parseLargestSvgShapeUnitWidthPoints(svgRaw, samplePoints) {
  const loader = new SVGLoader()
  const data = loader.parse(svgRaw)
  let bestPoints = null
  let bestArea = -1

  data.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path)
    shapes.forEach((shape) => {
      const points = shape.extractPoints(samplePoints).shape
      if (points.length < 3) return
      const area = polygonArea(points)
      if (area > bestArea) {
        bestArea = area
        bestPoints = points
      }
    })
  })

  if (!bestPoints) return null

  const box = new THREE.Box2().setFromPoints(bestPoints)
  const width = box.max.x - box.min.x
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2
  return bestPoints.map(
    (point) => new THREE.Vector2((point.x - centerX) / width, (centerY - point.y) / width),
  )
}

function parseLargestSvgShapeUnitWidthContours(svgRaw, samplePoints) {
  const loader = new SVGLoader()
  const data = loader.parse(svgRaw)
  let bestExtracted = null
  let bestArea = -1

  data.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path)
    shapes.forEach((shape) => {
      const extracted = shape.extractPoints(samplePoints)
      const points = extracted.shape
      if (points.length < 3) return
      const area = polygonArea(points)
      if (area > bestArea) {
        bestArea = area
        bestExtracted = extracted
      }
    })
  })

  if (!bestExtracted) return null

  const outer = simplifyContour(bestExtracted.shape)
  if (outer.length < 3) return null
  const box = new THREE.Box2().setFromPoints(outer)
  const width = box.max.x - box.min.x
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2

  const normalize = (points) =>
    points.map((point) => new THREE.Vector2((point.x - centerX) / width, (centerY - point.y) / width))

  return {
    outer: normalize(outer),
    holes: bestExtracted.holes
      .map((hole) => simplifyContour(hole))
      .filter((hole) => hole.length >= 3)
      .map((hole) => normalize(hole)),
  }
}

function parseAllSvgShapesUnitWidthContours(svgRaw, samplePoints) {
  const loader = new SVGLoader()
  const data = loader.parse(svgRaw)
  const contours = []
  const allOuterPoints = []

  data.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path)
    shapes.forEach((shape) => {
      const extracted = shape.extractPoints(samplePoints)
      const outer = simplifyContour(extracted.shape, 3e-4, 3e-4)
      if (outer.length < 3) return
      if (polygonArea(outer) < 0.03) return
      const holes = extracted.holes
        .map((hole) => simplifyContour(hole, 3e-4, 3e-4))
        .filter((hole) => hole.length >= 3 && polygonArea(hole) >= 0.02)
      contours.push({ outer, holes })
      allOuterPoints.push(...outer)
    })
  })

  if (contours.length === 0 || allOuterPoints.length < 3) return null

  const box = new THREE.Box2().setFromPoints(allOuterPoints)
  const width = box.max.x - box.min.x
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2

  const normalize = (points) =>
    points.map((point) => new THREE.Vector2((point.x - centerX) / width, (centerY - point.y) / width))

  const normalized = contours.map((entry) => ({
    outer: normalize(entry.outer),
    holes: entry.holes.map((hole) => normalize(hole)),
  }))
  const normalizedOuterPoints = normalized.flatMap((entry) => entry.outer)
  const normalizedBox = new THREE.Box2().setFromPoints(normalizedOuterPoints)
  return { contours: normalized, box: normalizedBox }
}

function getAppFont() {
  if (!cachedAppFont) {
    const loader = new FontLoader()
    cachedAppFont = loader.parse(droidSansBold)
  }
  return cachedAppFont
}

function getFrontLogoBaseSize() {
  if (!cachedFrontLogoBaseSize) {
    const geometry = new TextGeometry(FRONT_LOGO_TEXT, {
      font: getAppFont(),
      size: 1,
      depth: 0.01,
      curveSegments: FRONT_LOGO_CURVE_SEGMENTS,
      bevelEnabled: false,
    })
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) {
      cachedFrontLogoBaseSize = { width: 1, height: 1 }
    } else {
      const width = Math.max(1e-6, box.max.x - box.min.x)
      const height = Math.max(1e-6, box.max.y - box.min.y)
      cachedFrontLogoBaseSize = { width, height }
    }
    geometry.dispose()
  }
  return cachedFrontLogoBaseSize
}

function getFrontLogoLayoutMetrics(qrSideMm, shapeHeightMm, printShape = 'circle') {
  const base = getFrontLogoBaseSize()
  const widthRatio =
    printShape === 'gift' ? FRONT_LOGO_WIDTH_RATIO_OF_QR_GIFT : FRONT_LOGO_WIDTH_RATIO_OF_QR
  const heightRatio =
    printShape === 'gift' ? FRONT_LOGO_MAX_HEIGHT_RATIO_GIFT : FRONT_LOGO_MAX_HEIGHT_RATIO
  const targetWidth = qrSideMm * widthRatio
  const targetHeight = shapeHeightMm * heightRatio
  const uniformScale = Math.min(targetWidth / base.width, targetHeight / base.height)
  return {
    scale: uniformScale,
    logoHeight: base.height * uniformScale,
  }
}

function getHeartSvgShape(targetWidthMm) {
  if (!cachedHeartUnitWidthPoints) {
    cachedHeartUnitWidthPoints = parseLargestSvgShapeUnitWidthPoints(heartSvgRaw, HEART_SVG_SAMPLE_POINTS)
    if (!cachedHeartUnitWidthPoints) {
      throw new Error('Could not parse a closed heart path from src/assets/heart.svg')
    }
  }

  const scaled = cachedHeartUnitWidthPoints.map(
    (point) => new THREE.Vector2(point.x * targetWidthMm * 1.25, point.y * targetWidthMm),
  )
  return new THREE.Shape(scaled)
}

function getGiftSvgShape(targetWidthMm) {
  if (!cachedGiftUnitContours) {
    cachedGiftUnitContours = parseLargestSvgShapeUnitWidthContours(giftSvgRaw, 200)
    if (!cachedGiftUnitContours) {
      throw new Error('Could not parse a closed gift path from src/assets/giftbox.svg')
    }
  }

  const scaledOuter = cachedGiftUnitContours.outer.map(
    (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
  )
  const shape = new THREE.Shape(scaledOuter)
  cachedGiftUnitContours.holes.forEach((holePoints) => {
    // Slight inset avoids near-touching edges that can create non-manifold bow geometry after extrusion.
    const insetHolePoints = insetPolygon(holePoints, 0.95)
    if (polygonArea(insetHolePoints) < 0.0008) return
    const scaledHole = insetHolePoints.map(
      (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
    )
    if (polygonArea(scaledHole) < 0.3) return
    shape.holes.push(new THREE.Path(scaledHole))
  })
  return shape
}

function getIceCreamSvgShape(targetWidthMm) {
  if (!cachedIceCreamUnitContours) {
    cachedIceCreamUnitContours = parseLargestSvgShapeUnitWidthContours(iceCreamConeSvgRaw, 180)
    if (!cachedIceCreamUnitContours) {
      throw new Error('Could not parse a closed ice cream cone path from src/assets/ice-cream-cone.svg')
    }
  }

  const scaledOuter = cachedIceCreamUnitContours.outer.map(
    (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
  )
  const shape = new THREE.Shape(scaledOuter)
  cachedIceCreamUnitContours.holes.forEach((holePoints) => {
    const scaledHole = holePoints.map(
      (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
    )
    shape.holes.push(new THREE.Path(scaledHole))
  })
  return shape
}

function getSpeechBubbleSvgShape(targetWidthMm) {
  if (!cachedSpeechBubbleUnitContours) {
    cachedSpeechBubbleUnitContours = parseLargestSvgShapeUnitWidthContours(speechBubbleSvgRaw, 180)
    if (!cachedSpeechBubbleUnitContours) {
      throw new Error('Could not parse a closed speech bubble path from src/assets/speechbubble.svg')
    }
  }

  const scaledOuter = cachedSpeechBubbleUnitContours.outer.map(
    (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
  )
  const shape = new THREE.Shape(scaledOuter)
  cachedSpeechBubbleUnitContours.holes.forEach((holePoints) => {
    const scaledHole = holePoints.map(
      (point) => new THREE.Vector2(point.x * targetWidthMm, point.y * targetWidthMm),
    )
    shape.holes.push(new THREE.Path(scaledHole))
  })
  return shape
}

function smoothStarShape(radius) {
  const control = starPolygon(5, radius, radius * 0.6, Math.PI / 2)
  const shape = new THREE.Shape()
  const count = control.length

  const midpoint = (a, b) => new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2)
  const firstStart = midpoint(control[count - 1], control[0])
  shape.moveTo(firstStart.x, firstStart.y)

  for (let i = 0; i < count; i += 1) {
    const prev = control[(i - 1 + count) % count]
    const current = control[i]
    const next = control[(i + 1) % count]
    const start = midpoint(prev, current)
    const end = midpoint(current, next)
    shape.lineTo(start.x, start.y)
    shape.quadraticCurveTo(current.x, current.y, end.x, end.y)
  }

  shape.closePath()
  return shape
}

function buildShape(printShape, radius) {
  if (printShape === 'circle') {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false)
    return shape
  }

  if (printShape === 'heart') {
    return getHeartSvgShape(radius * 2 * 0.95)
  }

  if (printShape === 'hexagon') {
    return new THREE.Shape(regularPolygon(6, radius * 0.95, Math.PI / 6))
  }

  if (printShape === 'star') {
    return smoothStarShape(radius * 0.96)
  }

  if (printShape === 'gift') {
    return getGiftSvgShape(radius * 2 * 1.5)
  }

  if (printShape === 'icecream') {
    return getIceCreamSvgShape(radius * 2 * 0.94)
  }

  if (printShape === 'speechbubble') {
    return getSpeechBubbleSvgShape(radius * 2 * 0.94)
  }

  const fallback = new THREE.Shape()
  fallback.absarc(0, 0, radius, 0, Math.PI * 2, false)
  return fallback
}

function pointInPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby
  const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq)) : 0
  const cx = ax + abx * t
  const cy = ay + aby * t
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

function distanceToPolygonEdges(x, y, polygon) {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = pointToSegmentDistance(x, y, polygon[j].x, polygon[j].y, polygon[i].x, polygon[i].y)
    if (d < min) min = d
  }
  return min
}

function findHoleCenter(polygon, qrSideMm, qrCenter, forceSymmetric = false) {
  const box = new THREE.Box2().setFromPoints(polygon)
  const qrHalf = qrSideMm / 2
  const exclusionMargin = 1.6

  const maxY = box.max.y - HOLE_RADIUS_MM - HOLE_EDGE_CLEARANCE_MM
  const minY = box.min.y + HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM
  const maxX = box.max.x - HOLE_RADIUS_MM - HOLE_EDGE_CLEARANCE_MM
  const minX = box.min.x + HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM

  let bestCandidate = null

  for (let y = maxY; y >= minY; y -= 0.35) {
    for (let x = 0; x <= maxX; x += 0.35) {
      if (forceSymmetric && x !== 0) continue
      const candidates = x === 0 ? [[0, y]] : [[x, y], [-x, y]]
      for (const [cx, cy] of candidates) {
        if (cx < minX || cx > maxX) continue
        if (!pointInPolygon(cx, cy, polygon)) continue
        const edgeDist = distanceToPolygonEdges(cx, cy, polygon)
        if (edgeDist < HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM) continue
        if (
          Math.abs(cx - qrCenter.x) < qrHalf + exclusionMargin &&
          Math.abs(cy - qrCenter.y) < qrHalf + exclusionMargin
        ) {
          continue
        }
        return { x: cx, y: cy }
      }
    }
  }

  for (let y = maxY; y >= minY; y -= 0.35) {
    const cx = 0
    const cy = y
    if (!pointInPolygon(cx, cy, polygon)) continue
    const edgeDist = distanceToPolygonEdges(cx, cy, polygon)
    if (
      Math.abs(cx - qrCenter.x) < qrHalf + exclusionMargin &&
      Math.abs(cy - qrCenter.y) < qrHalf + exclusionMargin
    ) {
      continue
    }
    if (!bestCandidate || edgeDist > bestCandidate.edgeDist) {
      bestCandidate = { x: cx, y: cy, edgeDist }
    }
  }

  if (bestCandidate) {
    return { x: bestCandidate.x, y: bestCandidate.y }
  }

  return { x: 0, y: 0 }
}

function findStarPointHoleCenter(polygon, qrSideMm, qrCenter) {
  const qrHalf = qrSideMm / 2
  const exclusionMargin = 1.6
  const tip = polygon.reduce(
    (best, p) => {
      const r = Math.sqrt(p.x * p.x + p.y * p.y)
      if (r > best.r || (Math.abs(r - best.r) < 0.001 && p.y > best.y)) {
        return { x: p.x, y: p.y, r }
      }
      return best
    },
    { x: 0, y: -Infinity, r: -Infinity },
  )

  const insetStart = HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM + 0.8
  const insetEnd = tip.r * 0.78
  for (let inset = insetStart; inset <= insetEnd; inset += 0.25) {
    const scale = Math.max(0.01, (tip.r - inset) / tip.r)
    const x = tip.x * scale
    const y = tip.y * scale
    if (!pointInPolygon(x, y, polygon)) continue
    const edgeDist = distanceToPolygonEdges(x, y, polygon)
    if (edgeDist < HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM) continue
    if (
      Math.abs(x - qrCenter.x) < qrHalf + exclusionMargin &&
      Math.abs(y - qrCenter.y) < qrHalf + exclusionMargin
    ) {
      continue
    }
    if (y > qrCenter.y + qrHalf + exclusionMargin) {
      return { x, y }
    }
  }

  return findHoleCenter(polygon, qrSideMm, qrCenter, true)
}

function findHeartUpperLeftHoleCenter(polygon, qrSideMm, qrCenter) {
  const box = new THREE.Box2().setFromPoints(polygon)
  const qrHalf = qrSideMm / 2
  const exclusionMargin = 1.6
  const targetX = box.min.x * 0.58
  const targetY = box.max.y * 0.54
  const targetCenterToEdgeDist = HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM

  let best = null
  for (let dy = -4; dy <= 4; dy += 0.3) {
    for (let dx = -4; dx <= 4; dx += 0.3) {
      const x = targetX + dx
      const y = targetY + dy
      if (x >= -0.25) continue
      if (y <= 0) continue
      if (!pointInPolygon(x, y, polygon)) continue
      const edgeDist = distanceToPolygonEdges(x, y, polygon)
      if (edgeDist < HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM) continue
      if (
        Math.abs(x - qrCenter.x) < qrHalf + exclusionMargin &&
        Math.abs(y - qrCenter.y) < qrHalf + exclusionMargin
      ) {
        continue
      }
      const edgeDelta = Math.abs(edgeDist - targetCenterToEdgeDist)
      const anchorDelta = Math.abs(dx) + Math.abs(dy)
      const score = edgeDelta * 4 + anchorDelta
      if (!best || score < best.score) {
        best = { x, y, score }
      }
    }
  }

  if (best) return { x: best.x, y: best.y }
  return findHoleCenter(polygon, qrSideMm, qrCenter, false)
}

function findSpeechBubbleTopHoleCenter(polygon, qrSideMm, qrCenter) {
  const box = new THREE.Box2().setFromPoints(polygon)
  const qrHalf = qrSideMm / 2
  const exclusionMargin = 1.6
  const targetCenterToEdgeDist = HOLE_RADIUS_MM + HOLE_EDGE_CLEARANCE_MM

  let best = null
  for (let y = box.max.y - 0.1; y >= box.min.y; y -= 0.2) {
    const x = 0
    if (!pointInPolygon(x, y, polygon)) continue
    const edgeDist = distanceToPolygonEdges(x, y, polygon)
    if (edgeDist < targetCenterToEdgeDist) continue
    if (
      Math.abs(x - qrCenter.x) < qrHalf + exclusionMargin &&
      Math.abs(y - qrCenter.y) < qrHalf + exclusionMargin
    ) {
      continue
    }

    const edgeDelta = Math.abs(edgeDist - targetCenterToEdgeDist)
    const topDelta = Math.abs(box.max.y - y)
    const score = edgeDelta * 3 + topDelta
    if (!best || score < best.score) {
      best = { x, y, score }
    }
  }

  if (best) return { x: best.x, y: best.y }
  return findHoleCenter(polygon, qrSideMm, qrCenter, true)
}

function chooseQrCenter(printShape, polygon, radius) {
  if (printShape === 'star') {
    return { x: 0, y: radius * 0.06 }
  }
  if (printShape === 'heart') {
    const box = new THREE.Box2().setFromPoints(polygon)
    let bestCenter = { x: 0, y: -radius * 0.16 }
    let bestSide = 0
    const yMin = box.min.y * 0.25
    const yMax = box.max.y * 0.12
    for (let y = yMin; y <= yMax; y += 0.4) {
      const side = maxCenteredSquareSideAt(polygon, QR_EDGE_CLEARANCE_MM, 0, y)
      if (side > bestSide) {
        bestSide = side
        bestCenter = { x: 0, y }
      }
    }
    return bestCenter
  }
  if (printShape === 'gift') {
    const box = new THREE.Box2().setFromPoints(polygon)
    const height = box.max.y - box.min.y
    let bestCenter = { x: 0, y: box.min.y + height * 0.42 }
    let bestSide = 0
    const yMin = box.min.y + height * 0.22
    const yMax = box.min.y + height * 0.64
    for (let y = yMin; y <= yMax; y += 0.35) {
      const side = maxCenteredSquareSideAt(polygon, 2.2, 0, y)
      if (side > bestSide) {
        bestSide = side
        bestCenter = { x: 0, y }
      }
    }
    return bestCenter
  }
  if (printShape === 'icecream') {
    const box = new THREE.Box2().setFromPoints(polygon)
    const height = box.max.y - box.min.y
    let bestCenter = { x: 0, y: box.min.y + height * 0.62 }
    let bestSide = 0
    // Keep QR in the large upper body and away from the narrow cone tip.
    const yMin = box.min.y + height * 0.45
    const yMax = box.min.y + height * 0.84
    for (let y = yMin; y <= yMax; y += 0.35) {
      const side = maxCenteredSquareSideAt(polygon, 2.2, 0, y)
      if (side > bestSide) {
        bestSide = side
        bestCenter = { x: 0, y }
      }
    }
    return bestCenter
  }
  return { x: 0, y: 0 }
}

function maxCenteredSquareSideAt(polygon, edgeClearanceMm, centerX, centerY) {
  const box = new THREE.Box2().setFromPoints(polygon)
  let low = 6
  let high = Math.min(box.max.x - box.min.x, box.max.y - box.min.y) * 0.99
  const samples = 17

  const fits = (side) => {
    for (let iy = 0; iy <= samples; iy += 1) {
      for (let ix = 0; ix <= samples; ix += 1) {
        const x = centerX - side / 2 + (side * ix) / samples
        const y = centerY - side / 2 + (side * iy) / samples
        if (!pointInPolygon(x, y, polygon)) return false
        if (distanceToPolygonEdges(x, y, polygon) < edgeClearanceMm) return false
      }
    }
    return true
  }

  for (let i = 0; i < 22; i += 1) {
    const mid = (low + high) / 2
    if (fits(mid)) {
      low = mid
    } else {
      high = mid
    }
  }

  return low
}

function getShapePlan(printShape) {
  const radius = TARGET_DIAMETER_MM / 2
  const shape = buildShape(printShape, radius)
  const polygon = shape.extractPoints(300).shape
  const qrCenter = chooseQrCenter(printShape, polygon, radius)
  const qrEdgeClearanceMm =
    printShape === 'gift' || printShape === 'icecream' ? 2.2 : QR_EDGE_CLEARANCE_MM
  const qrScale =
    printShape === 'gift' ? 0.88 : printShape === 'icecream' ? 0.96 : 0.9
  const maxSquare = maxCenteredSquareSideAt(polygon, qrEdgeClearanceMm, qrCenter.x, qrCenter.y)
  const qrSideMm = Math.max(MIN_QR_SIDE_MM, maxSquare * qrScale)
  if (printShape === 'gift') {
    const box = new THREE.Box2().setFromPoints(polygon)
    const { logoHeight } = getFrontLogoLayoutMetrics(qrSideMm, box.max.y - box.min.y, printShape)
    const minLogoBottomY = box.min.y + FRONT_LOGO_EDGE_MARGIN_MM
    const minQrCenterY =
      minLogoBottomY + logoHeight + FRONT_LOGO_GAP_MM + qrSideMm / 2
    if (qrCenter.y < minQrCenterY) {
      qrCenter.y = minQrCenterY
    }
  }
  let holeCenter
  if (printShape === 'gift') {
    holeCenter = { x: 0, y: 0 }
  } else if (printShape === 'speechbubble') {
    holeCenter = findSpeechBubbleTopHoleCenter(polygon, qrSideMm, qrCenter)
  } else if (printShape === 'star') {
    holeCenter = findStarPointHoleCenter(polygon, qrSideMm, qrCenter)
  } else if (printShape === 'heart') {
    holeCenter = findHeartUpperLeftHoleCenter(polygon, qrSideMm, qrCenter)
  } else {
    holeCenter = findHoleCenter(polygon, qrSideMm, qrCenter, false)
  }
  return {
    shape,
    qrSideMm,
    qrCenter,
    holeCenter,
  }
}

function getCenteredShapeLayout(printShape) {
  const cached = centeredLayoutCache.get(printShape)
  if (cached) {
    return {
      ...cached,
      qrCenter: { ...cached.qrCenter },
      holeCenter: { ...cached.holeCenter },
    }
  }

  const { shape, qrSideMm, qrCenter, holeCenter } = getShapePlan(printShape)
  const points = shape.extractPoints(LAYOUT_SAMPLE_POINTS).shape
  const box = new THREE.Box2().setFromPoints(points)
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2
  const widthMm = box.max.x - box.min.x
  const heightMm = box.max.y - box.min.y
  const layout = {
    shape,
    qrSideMm,
    qrCenter: { x: qrCenter.x - centerX, y: qrCenter.y - centerY },
    holeCenter: { x: holeCenter.x - centerX, y: holeCenter.y - centerY },
    widthMm,
    heightMm,
    centerX,
    centerY,
  }
  centeredLayoutCache.set(printShape, layout)
  return {
    ...layout,
    qrCenter: { ...layout.qrCenter },
    holeCenter: { ...layout.holeCenter },
  }
}

function createBaseGeometry(printShape) {
  const { shape, qrSideMm, qrCenter, holeCenter, widthMm, heightMm, centerX, centerY } =
    getCenteredShapeLayout(printShape)
  const shapeWithHole = shape.clone()
  if (printShape !== 'gift') {
    const hole = new THREE.Path()
    hole.absarc(holeCenter.x, holeCenter.y, HOLE_RADIUS_MM, 0, Math.PI * 2, false)
    shapeWithHole.holes.push(hole)
  }

  const geometry = new THREE.ExtrudeGeometry(shapeWithHole, {
    depth: BASE_THICKNESS_MM,
    bevelEnabled: false,
    curveSegments: CURVE_SEGMENTS,
  })
  geometry.translate(-centerX, -centerY, 0)
  return { geometry, qrSideMm, holeCenter, qrCenter, widthMm, heightMm }
}

function buildQrMatrix(payload) {
  const cacheKey = `${payload || ''}`
  const cached = qrMatrixCache.get(cacheKey)
  if (cached) return cached

  const qr = qrcode(0, 'L')
  qr.addData(cacheKey)
  qr.make()
  const size = qr.getModuleCount()
  const matrix = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => qr.isDark(y, x)),
  )
  const entry = { matrix, size }
  qrMatrixCache.set(cacheKey, entry)
  if (qrMatrixCache.size > QR_MATRIX_CACHE_MAX) {
    const oldestKey = qrMatrixCache.keys().next().value
    qrMatrixCache.delete(oldestKey)
  }
  return entry
}

function mergeGeometryList(geoms) {
  if (!geoms || geoms.length === 0) return null
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((geom) => geom.dispose())
  return merged
}

function signedPolygonArea(points) {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].y - points[i].x * points[j].y
  }
  return area / 2
}

function key2(x, y) {
  return `${x},${y}`
}

function extractDarkComponents(matrix, size) {
  const visited = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const components = []

  const isDark = (x, yBottom) => matrix[size - 1 - yBottom][x]
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (visited[y][x] || !isDark(x, y)) continue

      const stack = [[x, y]]
      const cells = []
      visited[y][x] = true

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()
        cells.push([cx, cy])

        for (const [dx, dy] of directions) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          if (visited[ny][nx]) continue
          if (!isDark(nx, ny)) continue
          visited[ny][nx] = true
          stack.push([nx, ny])
        }
      }

      components.push(cells)
    }
  }

  return components
}

function edgeDir(edge) {
  const dx = edge.ex - edge.sx
  const dy = edge.ey - edge.sy
  if (dx === 1) return 0
  if (dy === -1) return 1
  if (dx === -1) return 2
  return 3
}

function traceBoundaryLoopsFromComponent(cells) {
  const cellSet = new Set(cells.map(([x, y]) => key2(x, y)))
  const edges = []
  const addEdge = (sx, sy, ex, ey) => edges.push({ sx, sy, ex, ey, used: false, dir: 0 })
  const hasCell = (x, y) => cellSet.has(key2(x, y))

  for (const [x, y] of cells) {
    if (!hasCell(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1)
    if (!hasCell(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y)
    if (!hasCell(x, y - 1)) addEdge(x + 1, y, x, y)
    if (!hasCell(x - 1, y)) addEdge(x, y, x, y + 1)
  }

  edges.forEach((edge) => {
    edge.dir = edgeDir(edge)
  })

  const adjacency = new Map()
  edges.forEach((edge, idx) => {
    const start = key2(edge.sx, edge.sy)
    if (!adjacency.has(start)) adjacency.set(start, [])
    adjacency.get(start).push(idx)
  })

  const loops = []

  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i].used) continue

    const startVertex = key2(edges[i].sx, edges[i].sy)
    const loop = [{ x: edges[i].sx, y: edges[i].sy }]
    let current = i
    let safety = 0

    while (safety < edges.length * 4) {
      safety += 1
      const edge = edges[current]
      edge.used = true
      loop.push({ x: edge.ex, y: edge.ey })

      const endVertex = key2(edge.ex, edge.ey)
      if (endVertex === startVertex) break

      const outgoing = (adjacency.get(endVertex) || []).filter((idx) => !edges[idx].used)
      if (outgoing.length === 0) break

      const preferences = [
        (edge.dir + 1) % 4,
        edge.dir,
        (edge.dir + 3) % 4,
        (edge.dir + 2) % 4,
      ]
      let next = outgoing[0]
      for (const dir of preferences) {
        const candidate = outgoing.find((idx) => edges[idx].dir === dir)
        if (candidate !== undefined) {
          next = candidate
          break
        }
      }
      current = next
    }

    if (loop.length > 3) {
      const first = loop[0]
      const last = loop[loop.length - 1]
      if (first.x === last.x && first.y === last.y) loop.pop()
      if (loop.length >= 3 && Math.abs(signedPolygonArea(loop)) > 0) loops.push(loop)
    }
  }

  return loops
}

function buildShapesFromLoops(loops) {
  if (loops.length === 0) return []
  const records = loops.map((points, idx) => {
    const area = Math.abs(signedPolygonArea(points))
    const centroid = points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 },
    )
    return { idx, points, area, centroid, parent: -1, depth: 0 }
  })

  const sortedByArea = [...records].sort((a, b) => b.area - a.area)
  for (const record of sortedByArea) {
    let parent = null
    for (const candidate of sortedByArea) {
      if (candidate.area <= record.area) continue
      if (pointInPolygon(record.centroid.x, record.centroid.y, candidate.points)) {
        if (!parent || candidate.area < parent.area) parent = candidate
      }
    }
    if (parent) {
      record.parent = parent.idx
      record.depth = parent.depth + 1
    }
  }

  const byIndex = new Map(records.map((record) => [record.idx, record]))
  const shapeEntries = []
  const shapeByLoopIndex = new Map()

  for (const record of records.filter((entry) => entry.depth % 2 === 0)) {
    const outerPoints = record.points.map((point) => new THREE.Vector2(point.x, point.y))
    if (THREE.ShapeUtils.isClockWise(outerPoints)) outerPoints.reverse()
    const shape = new THREE.Shape(outerPoints)
    const entry = { idx: record.idx, shape, area: record.area }
    shapeEntries.push(entry)
    shapeByLoopIndex.set(record.idx, entry)
  }

  for (const holeRecord of records.filter((entry) => entry.depth % 2 === 1)) {
    let ownerIdx = holeRecord.parent
    while (ownerIdx !== -1) {
      const ownerRecord = byIndex.get(ownerIdx)
      if (ownerRecord && ownerRecord.depth % 2 === 0) break
      ownerIdx = ownerRecord ? ownerRecord.parent : -1
    }
    const owner = shapeByLoopIndex.get(ownerIdx)
    if (!owner) continue

    const holePoints = holeRecord.points.map((point) => new THREE.Vector2(point.x, point.y))
    if (!THREE.ShapeUtils.isClockWise(holePoints)) holePoints.reverse()
    owner.shape.holes.push(new THREE.Path(holePoints))
  }

  return shapeEntries.map((entry) => entry.shape)
}

function createQrCutGeometry(payload, qrSideMm, depth, zCenter, centerX = 0, centerY = 0) {
  const { matrix, size } = buildQrMatrix(payload)
  const quietZone = 2
  const totalModules = size + quietZone * 2
  const moduleSize = qrSideMm / totalModules
  const components = extractDarkComponents(matrix, size)
  const geoms = []

  for (const component of components) {
    const loops = traceBoundaryLoopsFromComponent(component)
    if (loops.length === 0) continue

    const mmLoops = loops.map((loop) =>
      loop.map(
        (point) =>
          new THREE.Vector2(
            (point.x + quietZone) * moduleSize - qrSideMm / 2 + centerX,
            (point.y + quietZone) * moduleSize - qrSideMm / 2 + centerY,
          ),
      ),
    )
    const shapes = buildShapesFromLoops(mmLoops)

    for (const shape of shapes) {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 1,
      })
      geom.translate(0, 0, zCenter - depth / 2)
      geoms.push(geom)
    }
  }

  return mergeGeometryList(geoms)
}

function meshToAsciiStl(mesh) {
  const exporter = new STLExporter()
  return exporter.parse(mesh, { binary: false })
}

function normalizeCutGeometryForMerge(geometry) {
  const normalized = geometry.clone()
  ;['uv', 'uv1', 'uv2', 'tangent', 'color'].forEach((attr) => {
    if (normalized.getAttribute(attr)) normalized.deleteAttribute(attr)
  })
  if (!normalized.index) {
    const position = normalized.getAttribute('position')
    if (!position) return normalized
    const index = Array.from({ length: position.count }, (_, i) => i)
    normalized.setIndex(index)
  }
  if (!normalized.getAttribute('normal')) {
    normalized.computeVertexNormals()
  }
  return normalized
}

function ensureIndexedGeometryInPlace(geometry) {
  if (geometry.index) return geometry
  const position = geometry.getAttribute('position')
  if (!position) return geometry
  const index = Array.from({ length: position.count }, (_, i) => i)
  geometry.setIndex(index)
  return geometry
}

function createFrontLogoGeometry(qrCenter, qrSideMm, heightMm, depth, zTranslate, printShape) {
  const geometry = new TextGeometry(FRONT_LOGO_TEXT, {
    font: getAppFont(),
    size: 1,
    depth,
    curveSegments: FRONT_LOGO_CURVE_SEGMENTS,
    bevelEnabled: false,
  })

  geometry.computeBoundingBox()
  const baseBox = geometry.boundingBox
  if (!baseBox) return null

  const baseWidth = baseBox.max.x - baseBox.min.x
  const baseHeight = baseBox.max.y - baseBox.min.y
  if (baseWidth <= 0 || baseHeight <= 0) return null

  const { scale: uniformScale } = getFrontLogoLayoutMetrics(qrSideMm, heightMm, printShape)
  geometry.scale(uniformScale, uniformScale, 1)

  geometry.computeBoundingBox()
  const scaledBox = geometry.boundingBox
  if (!scaledBox) return null

  const logoHeight = scaledBox.max.y - scaledBox.min.y
  const targetBelowY = qrCenter.y - qrSideMm / 2 - FRONT_LOGO_GAP_MM - logoHeight / 2
  const centerY = targetBelowY

  const centerX = (scaledBox.min.x + scaledBox.max.x) / 2
  const centerTextY = (scaledBox.min.y + scaledBox.max.y) / 2
  geometry.translate(-centerX, centerY - centerTextY, zTranslate)
  return geometry
}

function createFrontLogoCutGeometry(qrCenter, qrSideMm, heightMm, printShape) {
  return createFrontLogoGeometry(
    qrCenter,
    qrSideMm,
    heightMm,
    FRONT_LOGO_DEBOSS_DEPTH_MM + 0.5,
    BASE_THICKNESS_MM - FRONT_LOGO_DEBOSS_DEPTH_MM,
    printShape,
  )
}

export function createFrontLogoOverlayGeometry(printShape = 'circle') {
  const { qrSideMm, qrCenter, heightMm } = getCenteredShapeLayout(printShape)
  return createFrontLogoGeometry(
    qrCenter,
    qrSideMm,
    heightMm,
    0.01,
    BASE_THICKNESS_MM - FRONT_LOGO_DEBOSS_DEPTH_MM + 0.005,
    printShape,
  )
}

export function getQrSideForShape(printShape = 'circle') {
  return getCenteredShapeLayout(printShape).qrSideMm
}

export function getPrintSizeInches(printShape = 'circle') {
  try {
    const radius = TARGET_DIAMETER_MM / 2
    const shape = buildShape(printShape, radius)
    const points = shape.extractPoints(320).shape
    const box = new THREE.Box2().setFromPoints(points)
    const mmToIn = 1 / 25.4
    const widthIn = (box.max.x - box.min.x) * mmToIn
    const heightIn = (box.max.y - box.min.y) * mmToIn
    const thicknessIn = BASE_THICKNESS_MM * mmToIn
    return {
      widthIn: Number(widthIn.toFixed(2)),
      heightIn: Number(heightIn.toFixed(2)),
      thicknessIn: Number(thicknessIn.toFixed(3)),
    }
  } catch {
    return { widthIn: 2.0, heightIn: 2.0, thicknessIn: 0.125 }
  }
}

export function createQrOverlayGeometry(payload, printShape = 'circle') {
  const { qrSideMm, qrCenter } = getCenteredShapeLayout(printShape)
  const floorZ = BASE_THICKNESS_MM - DEBOSS_DEPTH_MM
  return createQrCutGeometry(
    payload,
    qrSideMm,
    0.01,
    floorZ + 0.005,
    qrCenter.x,
    qrCenter.y,
  )
}

export function generateTokenPlaqueStl(token, printShape = 'circle', qrPayload, options = {}) {
  const includeFrontLogoDeboss = options.includeFrontLogoDeboss ?? true
  const payload = qrPayload || token
  const cacheKey = `${printShape}|${token}|${payload}|logo:${includeFrontLogoDeboss ? '1' : '0'}`
  const cachedStl = stlCache.get(cacheKey)
  if (cachedStl) return cachedStl

  const { geometry: baseGeometry, qrSideMm, qrCenter, heightMm } =
    createBaseGeometry(printShape)
  ensureIndexedGeometryInPlace(baseGeometry)
  const material = new THREE.MeshStandardMaterial()
  const baseMesh = new THREE.Mesh(baseGeometry, material)

  const qrCut = createQrCutGeometry(
    payload,
    qrSideMm,
    DEBOSS_DEPTH_MM + 0.6,
    BASE_THICKNESS_MM - DEBOSS_DEPTH_MM / 2,
    qrCenter.x,
    qrCenter.y,
  )

  const cuts = []
  if (qrCut) cuts.push(qrCut)
  if (includeFrontLogoDeboss) {
    const frontLogoCut = createFrontLogoCutGeometry(qrCenter, qrSideMm, heightMm, printShape)
    if (frontLogoCut) {
      cuts.push(frontLogoCut)
    }
  }

  let finalMesh = baseMesh
  if (cuts.length > 0) {
    for (const cutGeometry of cuts) {
      const cutReady = normalizeCutGeometryForMerge(cutGeometry)
      if (!cutReady.getAttribute('normal')) {
        cutReady.computeVertexNormals()
      }
      ensureIndexedGeometryInPlace(cutReady)
      ensureIndexedGeometryInPlace(finalMesh.geometry)
      if (!finalMesh.geometry.getAttribute('normal')) {
        finalMesh.geometry.computeVertexNormals()
      }

      const cutMesh = new THREE.Mesh(cutReady, material)
      const nextMesh = CSG.subtract(finalMesh, cutMesh)

      cutMesh.geometry.dispose()
      cutGeometry.dispose()
      if (finalMesh !== baseMesh) {
        finalMesh.geometry.dispose()
      }
      finalMesh = nextMesh
    }
  }

  finalMesh.geometry.computeVertexNormals()
  const stl = meshToAsciiStl(finalMesh)

  baseGeometry.dispose()
  material.dispose()
  if (finalMesh !== baseMesh) {
    finalMesh.geometry.dispose()
  }

  stlCache.set(cacheKey, stl)
  if (stlCache.size > STL_CACHE_MAX) {
    const oldestKey = stlCache.keys().next().value
    stlCache.delete(oldestKey)
  }

  return stl
}

export function downloadTokenPlaqueStl(token, printShape = 'circle', qrPayload) {
  const stl = generateTokenPlaqueStl(token, printShape, qrPayload)
  const blob = new Blob([stl], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `burr-buddy-${printShape}-${token}.stl`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
