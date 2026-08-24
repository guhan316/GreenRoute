import { Canvas, useFrame } from '@react-three/fiber'
import { Float, OrbitControls, Stars } from '@react-three/drei'
import { useRef } from 'react'

function MiniTruck() {
  const truck = useRef()

  useFrame(({ clock }) => {
    if (!truck.current) return
    const t = clock.getElapsedTime()
    truck.current.position.x = ((t * 0.65) % 8) - 4
    truck.current.position.z = Math.sin(t * 0.8) * 0.18
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

function Scene() {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[4, 7, 4]} intensity={3.2} color="#d8fff0" castShadow />
      <pointLight position={[-4, 2, 2]} intensity={9} color="#20e58b" distance={9} />

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
      <Stars radius={40} depth={18} count={420} factor={2.1} saturation={0} fade speed={0.25} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.02} maxPolarAngle={1.28} autoRotate autoRotateSpeed={0.18} />
    </>
  )
}

export default function HeroScene() {
  return (
    <div className="hero-canvas" aria-label="Animated 3D logistics scene">
      <Canvas shadows camera={{ position: [0, 3.3, 7.8], fov: 42 }} dpr={[1, 1.6]}>
        <Scene />
      </Canvas>
    </div>
  )
}
