import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Line, OrbitControls, Stars } from '@react-three/drei'
import { useRef } from 'react'

const ROUTE_STREAMS = [
  { color: '#55a7ff', speed: 0.16, offset: 0.02, points: [[-4.2, 0.12, 0.2], [-2.3, 0.45, -0.15], [-0.4, 0.2, 0.18], [1.7, 0.55, -0.08], [4.2, 0.16, 0.12]] },
  { color: '#ffbf5b', speed: 0.13, offset: 0.35, points: [[-4.2, 0.08, 0.55], [-2.2, 0.7, 0.8], [0.1, 0.34, 0.5], [2.2, 0.62, 0.72], [4.2, 0.12, 0.48]] },
  { color: '#35df8a', speed: 0.11, offset: 0.68, points: [[-4.2, 0.1, -0.55], [-2.5, 0.9, -0.82], [-0.2, 0.46, -0.55], [2.0, 0.78, -0.76], [4.2, 0.14, -0.5]] },
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
      <Line points={points} color={color} lineWidth={1.35} transparent opacity={0.62} />
      <mesh ref={pulse}>
        <sphereGeometry args={[0.085, 18, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={points[points.length - 1]}>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

function MiniTruck() {
  const truck = useRef()

  useFrame(({ clock }) => {
    if (!truck.current) return
    const t = clock.getElapsedTime()
    truck.current.position.x = ((t * 0.65) % 8) - 4
    truck.current.position.z = Math.sin(t * 0.8) * 0.18
    truck.current.rotation.y = Math.sin(t * 0.45) * 0.025
  })

  return (
    <group ref={truck} position={[-4, -0.35, 0]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.05, 0.55, 0.7]} />
        <meshStandardMaterial color="#29d17d" metalness={0.25} roughness={0.35} />
      </mesh>
      <mesh position={[-0.68, 0.16, 0]} castShadow>
        <boxGeometry args={[0.38, 0.38, 0.68]} />
        <meshStandardMaterial color="#d8fff0" metalness={0.1} roughness={0.3} />
      </mesh>
      <mesh position={[-0.78, 0.26, -0.35]}>
        <boxGeometry args={[0.18, 0.16, 0.025]} />
        <meshBasicMaterial color="#55a7ff" />
      </mesh>
      {[-0.65, 0.33].map((x) =>
        [-0.36, 0.36].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, -0.02, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.11, 16]} />
            <meshStandardMaterial color="#07110d" roughness={0.8} />
          </mesh>
        )),
      )}
    </group>
  )
}

function CityBlocks() {
  const blocks = [
    [-3.3, 0.4, -1.8, 0.7, 1.5],
    [-2.2, 0.6, -2.0, 0.8, 2.0],
    [-1.1, 0.35, -2.2, 0.7, 1.3],
    [1.6, 0.5, -2.0, 0.8, 1.7],
    [2.8, 0.75, -1.7, 0.9, 2.2],
    [3.6, 0.35, -2.3, 0.65, 1.25],
  ]

  return blocks.map(([x, y, z, width, height], index) => (
    <Float key={index} speed={0.6} rotationIntensity={0.05} floatIntensity={0.12}>
      <mesh position={[x, y, z]} castShadow>
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial color={index % 2 ? '#163c2b' : '#102a20'} roughness={0.45} metalness={0.15} />
      </mesh>
    </Float>
  ))
}

function RouteHub({ position, color, labelOffset = 0 }) {
  return (
    <Float speed={1.2 + labelOffset} rotationIntensity={0.12} floatIntensity={0.3}>
      <group position={position}>
        <mesh>
          <octahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.015, 8, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} />
        </mesh>
      </group>
    </Float>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[4, 7, 4]} intensity={3.2} color="#d8fff0" castShadow />
      <pointLight position={[-4, 2, 2]} intensity={9} color="#20e58b" distance={9} />
      <pointLight position={[3.5, 2.5, -2]} intensity={6} color="#55a7ff" distance={8} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[12, 7]} />
        <meshStandardMaterial color="#081510" roughness={0.82} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.505, 0]}>
        <planeGeometry args={[10, 1.15]} />
        <meshStandardMaterial color="#183027" roughness={0.65} />
      </mesh>

      {[-3, -1.5, 0, 1.5, 3].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.49, 0]}>
          <planeGeometry args={[0.58, 0.045]} />
          <meshBasicMaterial color="#8affc5" />
        </mesh>
      ))}

      <CityBlocks />
      <MiniTruck />
      {ROUTE_STREAMS.map((stream) => <RouteStream key={stream.color} {...stream} />)}
      <RouteHub position={[-4.2, 0.1, 0]} color="#d8fff0" />
      <RouteHub position={[4.2, 0.14, 0]} color="#35df8a" labelOffset={0.2} />
      <Stars radius={40} depth={18} count={420} factor={2.1} saturation={0} fade speed={0.25} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.02} maxPolarAngle={1.28} autoRotate autoRotateSpeed={0.16} />
    </>
  )
}

export default function HeroScene() {
  return (
    <div className="hero-canvas" aria-label="Interactive 3D logistics scene with route streams">
      <Canvas shadows camera={{ position: [0, 3.3, 7.8], fov: 42 }} dpr={[1, 1.6]}>
        <Scene />
      </Canvas>
      <div className="hero-scene-legend" aria-hidden="true">
        <span className="fast">Fast</span><span className="balanced">Balanced</span><span className="green">Green</span>
      </div>
    </div>
  )
}
