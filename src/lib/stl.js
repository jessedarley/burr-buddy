import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import qrcode from 'qrcode-generator'
import { CSG } from 'three-csg-ts'
import heartSvgRaw from '../assets/heart.svg?raw'

const TARGET_DIAMETER_MM = 50.8
const MIN_QR_SIDE_MM = 0
const QR_EDGE_CLEARANCE_MM = 3
const HOLE_DIAMETER_MM = 3.175
const HOLE_RADIUS_MM = HOLE_DIAMETER_MM / 2
const HOLE_EDGE_CLEARANCE_MM = 5.08
const HEART_HOLE_EDGE_CLEARANCE_MM = HOLE_DIAMETER_MM
export const BASE_THICKNESS_MM = 3.175
export const DEBOSS_DEPTH_MM = 0.7
const BACK_TEXT_DEBOSS_DEPTH_MM = 0.8
const CURVE_SEGMENTS = 72
let cachedHeartUnitWidthPoints = null

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

function getHeartSvgShape(targetWidthMm) {
  if (!cachedHeartUnitWidthPoints) {
    const loader = new SVGLoader()
    const data = loader.parse(heartSvgRaw)
    let bestPoints = null
    let bestArea = -1

    data.paths.forEach((path) => {
      const shapes = SVGLoader.createShapes(path)
      shapes.forEach((shape) => {
        const points = shape.extractPoints(400).shape
        if (points.length < 3) return
        const area = polygonArea(points)
        if (area > bestArea) {
          bestArea = area
          bestPoints = points
        }
      })
    })

    if (!bestPoints) {
      throw new Error('Could not parse a closed heart path from src/assets/heart.svg')
    }

    const box = new THREE.Box2().setFromPoints(bestPoints)
    const width = box.max.x - box.min.x
    const centerX = (box.min.x + box.max.x) / 2
    const centerY = (box.min.y + box.max.y) / 2
    cachedHeartUnitWidthPoints = bestPoints.map(
      (point) => new THREE.Vector2((point.x - centerX) / width, (centerY - point.y) / width),
    )
  }

  const scaled = cachedHeartUnitWidthPoints.map(
    (point) => new THREE.Vector2(point.x * targetWidthMm * 1.25, point.y * targetWidthMm),
  )
  return new THREE.Shape(scaled)
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
  const maxSquare = maxCenteredSquareSideAt(polygon, QR_EDGE_CLEARANCE_MM, qrCenter.x, qrCenter.y)
  const qrSideMm = Math.max(MIN_QR_SIDE_MM, maxSquare * 0.9)
  let holeCenter
  if (printShape === 'star') {
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
  const { shape, qrSideMm, qrCenter, holeCenter } = getShapePlan(printShape)
  const points = shape.extractPoints(320).shape
  const box = new THREE.Box2().setFromPoints(points)
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2
  const widthMm = box.max.x - box.min.x
  const heightMm = box.max.y - box.min.y
  return {
    shape,
    qrSideMm,
    qrCenter: { x: qrCenter.x - centerX, y: qrCenter.y - centerY },
    holeCenter: { x: holeCenter.x - centerX, y: holeCenter.y - centerY },
    widthMm,
    heightMm,
    centerX,
    centerY,
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

function createBackTextCutGeometry(widthMm, heightMm) {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  const cols = 96
  const rows = 52
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, cols, rows)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1, Math.floor(rows * 0.06))
  ctx.font = `900 ${Math.floor(rows * 0.38)}px "Baloo 2", "Nunito", sans-serif`
  ctx.fillText('burr', cols / 2, rows * 0.33)
  ctx.fillText('buddy', cols / 2, rows * 0.68)
  ctx.strokeText('burr', cols / 2, rows * 0.33)
  ctx.strokeText('buddy', cols / 2, rows * 0.68)

  const image = ctx.getImageData(0, 0, cols, rows).data
  const geoms = []
  const textAreaW = widthMm * 0.7
  const textAreaH = heightMm * 0.34
  const cellW = textAreaW / cols
  const cellH = textAreaH / rows

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const alpha = image[(y * cols + x) * 4 + 3]
      if (alpha < 12) continue

      const px = textAreaW / 2 - (x + 0.5) * cellW
      const py = textAreaH / 2 - (y + 0.5) * cellH
      const box = new THREE.BoxGeometry(cellW * 1.02, cellH * 1.02, BACK_TEXT_DEBOSS_DEPTH_MM + 0.35)
      box.translate(px, py, BACK_TEXT_DEBOSS_DEPTH_MM / 2)
      geoms.push(box)
    }
  }

  if (geoms.length === 0) return null
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((g) => g.dispose())
  return merged
}

export function createBackTextOverlayGeometry(printShape = 'circle') {
  if (typeof document === 'undefined') return null

  const { widthMm, heightMm } = getCenteredShapeLayout(printShape)
  const canvas = document.createElement('canvas')
  const cols = 96
  const rows = 52
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, cols, rows)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1, Math.floor(rows * 0.06))
  ctx.font = `900 ${Math.floor(rows * 0.38)}px "Baloo 2", "Nunito", sans-serif`
  ctx.fillText('burr', cols / 2, rows * 0.33)
  ctx.fillText('buddy', cols / 2, rows * 0.68)
  ctx.strokeText('burr', cols / 2, rows * 0.33)
  ctx.strokeText('buddy', cols / 2, rows * 0.68)

  const image = ctx.getImageData(0, 0, cols, rows).data
  const geoms = []
  const textAreaW = widthMm * 0.7
  const textAreaH = heightMm * 0.34
  const cellW = textAreaW / cols
  const cellH = textAreaH / rows
  const overlayDepth = 0.01

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const alpha = image[(y * cols + x) * 4 + 3]
      if (alpha < 12) continue

      const px = textAreaW / 2 - (x + 0.5) * cellW
      const py = textAreaH / 2 - (y + 0.5) * cellH
      const box = new THREE.BoxGeometry(cellW * 1.02, cellH * 1.02, overlayDepth)
      box.translate(px, py, overlayDepth / 2 + 0.003)
      geoms.push(box)
    }
  }

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

export function generateTokenPlaqueStl(token, printShape = 'circle', qrPayload) {
  const { geometry: baseGeometry, qrSideMm, holeCenter, qrCenter, widthMm, heightMm } =
    createBaseGeometry(printShape)
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

  const holeGeometry = new THREE.CylinderGeometry(
    HOLE_RADIUS_MM,
    HOLE_RADIUS_MM,
    BASE_THICKNESS_MM + 2,
    48,
  )
  holeGeometry.rotateX(Math.PI / 2)
  holeGeometry.translate(holeCenter.x, holeCenter.y, BASE_THICKNESS_MM / 2)
  cuts.push(holeGeometry)

  const backTextCut = createBackTextCutGeometry(widthMm, heightMm)
  if (backTextCut) {
    cuts.push(backTextCut)
  }

  let finalMesh = baseMesh
  for (const cutGeometry of cuts) {
    const cutMesh = new THREE.Mesh(cutGeometry, material)
    finalMesh = CSG.subtract(finalMesh, cutMesh)
    cutGeometry.dispose()
    cutMesh.geometry.dispose()
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
