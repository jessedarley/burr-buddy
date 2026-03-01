import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import qrcode from 'qrcode-generator'
import { CSG } from 'three-csg-ts'
import heartSvgRaw from '../assets/heart.svg?raw'
import giftSvgRaw from '../assets/giftbox.svg?raw'
import iceCreamConeSvgRaw from '../assets/ice-cream-cone.svg?raw'
import burrBuddyDebossSvgRaw from '../assets/burr-buddy-deboss.svg?raw'

const TARGET_DIAMETER_MM = 50.8
const MIN_QR_SIDE_MM = 0
const QR_EDGE_CLEARANCE_MM = 3
const HOLE_DIAMETER_MM = 3.175
const HOLE_RADIUS_MM = HOLE_DIAMETER_MM / 2
const HOLE_EDGE_CLEARANCE_MM = 5.08
const HEART_HOLE_EDGE_CLEARANCE_MM = HOLE_DIAMETER_MM
export const BASE_THICKNESS_MM = 3.175
export const DEBOSS_DEPTH_MM = 0.7
const BACK_TEXT_DEBOSS_DEPTH_MM = 1.0
const BACK_DEBOSS_SAMPLE_POINTS = 120
const CURVE_SEGMENTS = 48
const HEART_SVG_SAMPLE_POINTS = 220
const LAYOUT_SAMPLE_POINTS = 220
let cachedHeartUnitWidthPoints = null
let cachedGiftUnitContours = null
let cachedIceCreamUnitContours = null
let cachedBackDebossUnitContours = null
const centeredLayoutCache = new Map()

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

function parseDebossUnitContours(svgRaw, samplePoints) {
  const loader = new SVGLoader()
  const data = loader.parse(svgRaw)
  const contours = []
  const allOuterPoints = []

  data.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path)
    let bestOuter = null
    let bestArea = -1

    shapes.forEach((shape) => {
      const extracted = shape.extractPoints(samplePoints)
      const outer = simplifyContour(extracted.shape, 2e-4, 2e-4)
      if (outer.length < 3) return
      const area = polygonArea(outer)
      if (area > bestArea) {
        bestArea = area
        bestOuter = outer
      }
    })

    if (bestOuter && bestArea >= 0.02) {
      contours.push({ outer: bestOuter, holes: [] })
      allOuterPoints.push(...bestOuter)
    }
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
    holes: entry.holes,
  }))
  const normalizedOuterPoints = normalized.flatMap((entry) => entry.outer)
  const normalizedBox = new THREE.Box2().setFromPoints(normalizedOuterPoints)
  return { contours: normalized, box: normalizedBox }
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
    return getGiftSvgShape(radius * 2 * 0.94)
  }

  if (printShape === 'icecream') {
    return getIceCreamSvgShape(radius * 2 * 0.94)
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
  const targetCenterToEdgeDist = HOLE_RADIUS_MM + HEART_HOLE_EDGE_CLEARANCE_MM

  let best = null
  for (let dy = -4; dy <= 4; dy += 0.3) {
    for (let dx = -4; dx <= 4; dx += 0.3) {
      const x = targetX + dx
      const y = targetY + dy
      if (x >= -0.25) continue
      if (y <= 0) continue
      if (!pointInPolygon(x, y, polygon)) continue
      const edgeDist = distanceToPolygonEdges(x, y, polygon)
      if (edgeDist < HOLE_RADIUS_MM + HEART_HOLE_EDGE_CLEARANCE_MM) continue
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

function chooseQrCenter(printShape, polygon, radius) {
  if (printShape === 'star') {
    return { x: 0, y: -radius * 0.16 }
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
    let bestCenter = { x: 0, y: box.min.y + height * 0.34 }
    let bestSide = 0
    const yMin = box.min.y + height * 0.14
    const yMax = box.min.y + height * 0.56
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
  const qrScale = printShape === 'gift' || printShape === 'icecream' ? 0.96 : 0.9
  const maxSquare = maxCenteredSquareSideAt(polygon, qrEdgeClearanceMm, qrCenter.x, qrCenter.y)
  const qrSideMm = Math.max(MIN_QR_SIDE_MM, maxSquare * qrScale)
  let holeCenter
  if (printShape === 'gift') {
    holeCenter = { x: 0, y: 0 }
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
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: BASE_THICKNESS_MM,
    bevelEnabled: false,
    curveSegments: CURVE_SEGMENTS,
  })
  geometry.translate(-centerX, -centerY, 0)
  return { geometry, qrSideMm, holeCenter, qrCenter, widthMm, heightMm }
}

function buildQrMatrix(payload) {
  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  const size = qr.getModuleCount()
  const matrix = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => qr.isDark(y, x)),
  )
  return { matrix, size }
}

function createQrModuleGeometry(payload, qrSideMm, depth, moduleScale, zCenter, centerX = 0, centerY = 0) {
  const { matrix, size } = buildQrMatrix(payload)
  const quietZone = 2
  const totalModules = size + quietZone * 2
  const moduleSize = qrSideMm / totalModules
  const geoms = []

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!matrix[y][x]) continue
      const px = (x + quietZone + 0.5) * moduleSize - qrSideMm / 2 + centerX
      const py = qrSideMm / 2 - (y + quietZone + 0.5) * moduleSize + centerY
      const box = new THREE.BoxGeometry(moduleSize * moduleScale, moduleSize * moduleScale, depth)
      box.translate(px, py, zCenter)
      geoms.push(box)
    }
  }

  if (geoms.length === 0) return null
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((geom) => geom.dispose())
  return merged
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

function createBackTextCutGeometry(widthMm, heightMm) {
  if (!cachedBackDebossUnitContours) {
    cachedBackDebossUnitContours = parseDebossUnitContours(burrBuddyDebossSvgRaw, BACK_DEBOSS_SAMPLE_POINTS)
    if (!cachedBackDebossUnitContours) return null
  }

  const { contours, box } = cachedBackDebossUnitContours
  const textAreaW = widthMm * 0.74
  const textAreaH = heightMm * 0.42
  const unitHeight = box.max.y - box.min.y
  const scale = Math.min(textAreaW, textAreaH / Math.max(unitHeight, 1e-6))
  const geoms = []

  contours.forEach(({ outer, holes }) => {
    // Mirror on X so back-face deboss reads correctly when viewed from the back.
    const scaledOuter = outer.map((point) => new THREE.Vector2(-point.x * scale, point.y * scale))
    if (polygonArea(scaledOuter) < 0.2) return

    const shape = new THREE.Shape(scaledOuter)
    holes.forEach((hole) => {
      const scaledHole = hole.map((point) => new THREE.Vector2(-point.x * scale, point.y * scale))
      if (polygonArea(scaledHole) < 0.05) return
      shape.holes.push(new THREE.Path(scaledHole))
    })

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: BACK_TEXT_DEBOSS_DEPTH_MM + 0.35,
      bevelEnabled: false,
      curveSegments: 12,
    })
    geom.translate(0, 0, BACK_TEXT_DEBOSS_DEPTH_MM / 2)
    geoms.push(geom)
  })

  if (geoms.length === 0) return null
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((g) => g.dispose())
  return merged
}

export function createBackTextOverlayGeometry(printShape = 'circle') {
  if (!cachedBackDebossUnitContours) {
    cachedBackDebossUnitContours = parseDebossUnitContours(burrBuddyDebossSvgRaw, BACK_DEBOSS_SAMPLE_POINTS)
    if (!cachedBackDebossUnitContours) return null
  }

  const { widthMm, heightMm } = getCenteredShapeLayout(printShape)
  const { contours, box } = cachedBackDebossUnitContours
  const textAreaW = widthMm * 0.74
  const textAreaH = heightMm * 0.42
  const unitHeight = box.max.y - box.min.y
  const scale = Math.min(textAreaW, textAreaH / Math.max(unitHeight, 1e-6))
  const overlayDepth = 0.01
  const geoms = []

  contours.forEach(({ outer, holes }) => {
    const scaledOuter = outer.map((point) => new THREE.Vector2(-point.x * scale, point.y * scale))
    if (polygonArea(scaledOuter) < 0.2) return
    const shape = new THREE.Shape(scaledOuter)

    holes.forEach((hole) => {
      const scaledHole = hole.map((point) => new THREE.Vector2(-point.x * scale, point.y * scale))
      if (polygonArea(scaledHole) < 0.05) return
      shape.holes.push(new THREE.Path(scaledHole))
    })

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: overlayDepth,
      bevelEnabled: false,
      curveSegments: 8,
    })
    geom.translate(0, 0, overlayDepth / 2 + 0.003)
    geoms.push(geom)
  })

  if (geoms.length === 0) return null
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((g) => g.dispose())
  return merged
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
  return createQrModuleGeometry(
    payload,
    qrSideMm,
    0.01,
    0.82,
    floorZ + 0.005,
    qrCenter.x,
    qrCenter.y,
  )
}

export function generateTokenPlaqueStl(token, printShape = 'circle', qrPayload, options = {}) {
  const includeBackDeboss = options.includeBackDeboss ?? false
  const { geometry: baseGeometry, qrSideMm, holeCenter, qrCenter, widthMm, heightMm } =
    createBaseGeometry(printShape)
  ensureIndexedGeometryInPlace(baseGeometry)
  const material = new THREE.MeshStandardMaterial()
  const baseMesh = new THREE.Mesh(baseGeometry, material)

  const payload = qrPayload || token
  const qrCut = createQrModuleGeometry(
    payload,
    qrSideMm,
    DEBOSS_DEPTH_MM + 0.6,
    0.9,
    BASE_THICKNESS_MM - DEBOSS_DEPTH_MM / 2,
    qrCenter.x,
    qrCenter.y,
  )

  const cuts = []
  if (qrCut) cuts.push(qrCut)

  if (printShape !== 'gift') {
    const holeGeometry = new THREE.CylinderGeometry(
      HOLE_RADIUS_MM,
      HOLE_RADIUS_MM,
      BASE_THICKNESS_MM + 4,
      96,
    )
    holeGeometry.rotateX(Math.PI / 2)
    holeGeometry.translate(holeCenter.x, holeCenter.y, BASE_THICKNESS_MM / 2)
    cuts.push(holeGeometry)
  }

  if (includeBackDeboss) {
    const backTextCut = createBackTextCutGeometry(widthMm, heightMm)
    if (backTextCut) {
      cuts.push(backTextCut)
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
