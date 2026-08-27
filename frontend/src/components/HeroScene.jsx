import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Line, Stars } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import './HeroScene.css'

const ROUTE_STREAMS = [
  { color: '#55a7ff', speed: 0.18, offset: 0.04, points: [[-4.8, 0.16, 0.05], [-2.6, 0.34, -0.12], [-0.4, 0.26, 0.08], [2.1, 0.42, -0.09], [4.8, 0.2, 0.04]] },
  { color: '#ffbf5b', speed: 0.145, offset: 0.34, points: [[-4.8, 0.13, 0.58], [-2.6, 0.58, 0.72], [-0.2, 0.34, 0.5], [2.5, 0.6, 0.7], [4.8, 0.18, 0.54]] },
  { color: '#35df8a', speed: 0.12, offset: 0.69, points: [[-4.8, 0.14, -0.58], [-2.9, 0.74, -0.8], [-0.15, 0.42, -0.58], [2.2, 0.72, -0.76], [4.8, 0.2, -0.54]] },
]

function interpolate(points, t) {
  const scaled = t * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(scaled))
  const local = scaled - index
  const start = points[index]
  const end = points[index + 1]
  return [
    start[0] + ((end[0] - start[0]) * local),
    start[1] + ((end[1] - start[1]) * local),
    start[2] + ((end[2] - start[2]) * local),
  ]
}

function RouteStream({ color, speed, offset, points }) {
  const pulse = useRef()
  useFrame(({ clock }) => {
    if (!pulse.current) return
    const t = ((clock.getElapsedTime() * speed) + offset) % 1
    const [x, y, z] = interpolate(points, t)
    pulse.current.position.set(x, y, z)
  })
  return (
    <group>
      <Line points={points} color={color} lineWidth={1.55} transparent opacity={0.76} />
      <mesh ref={pulse}>
        <sphereGeometry args={[0.095, 18, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

function Truck() {
  const truck = useRef()
  useFrame(({ clock }) => {
    if (!truck.current) return
    const t = (clock.getElapsedTime() * 0.105) % 1
    const [x, y, z] = interpolate(ROUTE_STREAMS[2].points, t)
    truck.current.position.set(x, y - 0.2, z)
    truck.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.03
  })
  return (
    <group ref={truck} scale={1.18}>
      <mesh position={[0.2, 0.34, 0]} castShadow>
        <boxGeometry args={[1.28, 0.68, 0.82]} />
        <meshStandardMaterial color="#2fe18c" metalness={0.28} roughness={0.32} />
      </mesh>
      <mesh position={[-0.74, 0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.45, 0.8]} />
        <meshStandardMaterial color="#d8fff0" metalness={0.12} roughness={0.25} />
      </mesh>
      <mesh position={[-0.82, 0.3, -0.41]}>
        <boxGeometry args={[0.24, 0.2, 0.03]} />
        <meshBasicMaterial color="#55a7ff" />
      </mesh>
      {[-0.62, 0.5].map((x) => [-0.43, 0.43].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.08, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 18]} />
          <meshStandardMaterial color="#050b08" roughness={0.86} />
        </mesh>
      )))}
    </group>
  )
}

function CityBlocks() {
  const blocks = useMemo(() => [
    [-4.4, 0.3, -2.25, 0.85, 1.4], [-3.45, 0.52, -2.35, 0.95, 2.1], [-2.35, 0.38, -2.5, 0.8, 1.55], [-1.35, 0.68, -2.38, 0.9, 2.45],
    [1.25, 0.5, -2.42, 0.9, 1.9], [2.35, 0.72, -2.35, 0.95, 2.55], [3.55, 0.46, -2.3, 0.9, 1.8], [4.55, 0.28, -2.2, 0.76, 1.25],
    [-4.0, 0.22, 2.35, 0.75, 1.1], [-2.85, 0.34, 2.5, 0.82, 1.5], [2.95, 0.32, 2.45, 0.82, 1.42], [4.15, 0.25, 2.28, 0.75, 1.18],
  ], [])
  return blocks.map(([x, y, z, width, height], index) => (
    <Float key={index} speed={0.45} rotationIntensity={0.035} floatIntensity={0.07}>
      <mesh position={[x, y, z]} castShadow>
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial color={index % 2 ? '#163c2b' : '#102a20'} roughness={0.44} metalness={0.14} />
      </mesh>
    </Float>
  ))
}

function RouteHub({ position, color }) {
  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.18}>
      <group position={position}>
        <mesh>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.9} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.018, 8, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} />
        </mesh>
      </group>
    </Float>
  )
}

function CameraRig() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime()
    camera.position.x = Math.sin(t * 0.18) * 0.22
    camera.position.y = 4.45 + Math.sin(t * 0.15) * 0.08
    camera.position.z = 8.75 + Math.cos(t * 0.16) * 0.12
    camera.lookAt(0, 0.15, 0)
  })
  return null
}

function Scene() {
  return (
    <>
      <CameraRig />
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 8, 5]} intensity={3.1} color="#e7fff5" castShadow />
      <pointLight position={[-4, 3, 2]} intensity={8} color="#20e58b" distance={10} />
      <pointLight position={[4, 3, -2]} intensity={5.5} color="#55a7ff" distance={9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.58, 0]} receiveShadow>
        <circleGeometry args={[6.15, 96]} />
        <meshStandardMaterial color="#07130f" roughness={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.555, 0]}>
        <planeGeometry args={[11.6, 1.5]} />
        <meshStandardMaterial color="#1b372d" roughness={0.62} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.548, 0]}>
        <planeGeometry args={[11.4, 1.14]} />
        <meshStandardMaterial color="#223f35" roughness={0.58} />
      </mesh>
      {[-4.25, -2.55, -0.85, 0.85, 2.55, 4.25].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.538, 0]}>
          <planeGeometry args={[0.62, 0.05]} />
          <meshBasicMaterial color="#c9ffe1" transparent opacity={0.78} />
        </mesh>
      ))}
      <CityBlocks />
      <Truck />
      {ROUTE_STREAMS.map((stream) => <RouteStream key={stream.color} {...stream} />)}
      <RouteHub position={[-4.8, 0.16, 0.05]} color="#d8fff0" />
      <RouteHub position={[4.8, 0.2, 0.04]} color="#35df8a" />
      <Stars radius={38} depth={16} count={350} factor={1.8} saturation={0} fade speed={0.18} />
    </>
  )
}

function FallbackLogisticsScene() {
  return (
    <div className="hero-fallback-stage" aria-hidden="true">
      <div className="fallback-city left"><i /><i /><i /><i /></div>
      <div className="fallback-city right"><i /><i /><i /><i /></div>
      <div className="fallback-road">
        <span className="fallback-lane one" /><span className="fallback-lane two" /><span className="fallback-lane three" />
        <span className="fallback-stream fast" /><span className="fallback-stream balanced" /><span className="fallback-stream green" />
        <div className="fallback-truck"><b className="truck-cab" /><b className="truck-box" /><i className="wheel front" /><i className="wheel rear" /></div>
      </div>
      <div className="fallback-hub start" /><div className="fallback-hub end" />
    </div>
  )
}

export default function HeroScene() {
  return (
    <div className="hero-canvas" aria-label="Interactive 3D logistics scene with route streams">
      <FallbackLogisticsScene />
      <Canvas shadows camera={{ position: [0, 4.45, 8.75], fov: 38 }} dpr={[1, 1.5]}>
        <Scene />
      </Canvas>
      <div className="hero-scene-legend" aria-hidden="true">
        <span className="fast">Fast</span><span className="balanced">Balanced</span><span className="green">Green</span>
      </div>
    </div>
  )
}
