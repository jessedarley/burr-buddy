import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { createQrOverlayGeometry, generateTokenPlaqueStl } from '../lib/stl'

export function StlViewer({ token, printShape, qrPayload, onReady }) {
  const containerRef = useRef(null)
  const stlContent = useMemo(
    () => generateTokenPlaqueStl(token, printShape, qrPayload, { includeBackDeboss: false }),
    [token, printShape, qrPayload],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setSize(container.clientWidth, 320)
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / 320, 0.1, 1000)
    camera.position.set(0, -130, 0)
    camera.up.set(0, 0, 1)
    scene.add(camera)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controls.minDistance = 30
    controls.maxDistance = 220
    controls.update()

    const hemi = new THREE.HemisphereLight(0xffffff, 0x5b4631, 1.35)
    scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15)
    keyLight.position.set(80, -40, 120)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.75)
    fillLight.position.set(-70, 70, 80)
    scene.add(fillLight)

    const cameraHeadlight = new THREE.DirectionalLight(0xffffff, 1.25)
    cameraHeadlight.position.set(0, 0, 1)
    camera.add(cameraHeadlight)

    const loader = new STLLoader()
    const geometry = loader.parse(new TextEncoder().encode(stlContent).buffer)
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 0.04,
      roughness: 0.62,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = Math.PI / 2

    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (box) {
      const center = new THREE.Vector3()
      box.getCenter(center)
      mesh.position.set(-center.x, -center.y, -center.z)
    }

    scene.add(mesh)

    const qrOverlayGeometry = createQrOverlayGeometry(qrPayload || token, printShape)
    const qrOverlayMaterial = new THREE.MeshStandardMaterial({
      color: '#111111',
      roughness: 0.92,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const qrOverlay = new THREE.Mesh(qrOverlayGeometry, qrOverlayMaterial)
    qrOverlay.position.z = 0
    mesh.add(qrOverlay)

    onReady?.()

    let frameId = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      const width = container.clientWidth
      const height = 320
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      qrOverlayGeometry.dispose()
      qrOverlayMaterial.dispose()
      renderer.dispose()
    }
  }, [onReady, printShape, qrPayload, stlContent, token])

  return (
    <div>
      <p className="meta">STL Preview (drag to rotate, scroll to zoom):</p>
      <div className="stl-viewer" ref={containerRef} />
    </div>
  )
}
