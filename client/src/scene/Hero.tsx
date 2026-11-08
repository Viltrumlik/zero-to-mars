import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../store.ts';

const SKIN = '#f1c7a5';
const HAIR = '#3b2a20';
const OUTFIT: { shirt: string; pants: string; scale: number }[] = [
  { shirt: '#e63946', pants: '#3d5a80', scale: 0.72 },
  { shirt: '#2a9d8f', pants: '#264653', scale: 0.88 },
  { shirt: '#457b9d', pants: '#1d3557', scale: 1 },
  { shirt: '#22223b', pants: '#22223b', scale: 1 },
  { shirt: '#111111', pants: '#2b2d42', scale: 1 },
  { shirt: '#1b1b1f', pants: '#1b1b1f', scale: 1 },
  { shirt: '#f1f1f1', pants: '#e0e0e0', scale: 1 },
];

export type Ride = 'walk' | 'bike' | 'scooter' | 'car';

/** Low-poly hero. `speed` (0..1) drives the walk cycle. */
export function Hero({ era, speed, ride }: { era: number; speed: React.MutableRefObject<number>; ride: Ride }) {
  const root = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const arms = useRef<(THREE.Mesh | null)[]>([]);
  const o = OUTFIT[era] ?? OUTFIT[0];
  const astronaut = era === 6;
  const seated = ride !== 'walk';

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const v = speed.current;
    const swing = seated ? 0 : Math.sin(t * 11) * 0.7 * v;
    legs.current.forEach((m, i) => m && (m.rotation.x = seated ? -1.2 : i ? swing : -swing));
    arms.current.forEach((m, i) => m && (m.rotation.x = seated ? -1 : (i ? -swing : swing) * 0.8));
    if (root.current) root.current.position.y = seated ? 0.45 : Math.abs(Math.sin(t * 11)) * 0.06 * v + Math.sin(t * 2) * 0.01;
  });

  if (ride === 'car') return <Car color={era >= 4 ? '#e11d48' : '#2563eb'} />;

  return (
    <group>
      {ride === 'bike' && <Bike />}
      {ride === 'scooter' && <Scooter />}
      <group ref={root} scale={o.scale}>
        {[-0.17, 0.17].map((x, i) => (
          <mesh key={x} ref={(el) => (legs.current[i] = el)} position={[x, 0.38, 0]} castShadow>
            <boxGeometry args={[0.24, 0.76, 0.28]} />
            <meshStandardMaterial color={o.pants} flatShading />
          </mesh>
        ))}
        {/* legs pivot from the hip: geometry is offset inside a group below */}
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[0.74, 0.82, 0.42]} />
          <meshStandardMaterial color={o.shirt} flatShading />
        </mesh>
        {era === 3 && (
          <mesh position={[0, 1.2, 0.215]}>
            <boxGeometry args={[0.1, 0.55, 0.02]} />
            <meshStandardMaterial color="#d62828" />
          </mesh>
        )}
        {astronaut && (
          <mesh position={[0, 1.2, -0.32]} castShadow>
            <boxGeometry args={[0.6, 0.7, 0.25]} />
            <meshStandardMaterial color="#cfd8dc" flatShading />
          </mesh>
        )}
        {[-0.47, 0.47].map((x, i) => (
          <mesh key={x} ref={(el) => (arms.current[i] = el)} position={[x, 1.22, 0]} castShadow>
            <boxGeometry args={[0.18, 0.72, 0.22]} />
            <meshStandardMaterial color={o.shirt} flatShading />
          </mesh>
        ))}
        <mesh position={[0, 1.86, 0]} castShadow>
          <icosahedronGeometry args={[0.34, 1]} />
          <meshStandardMaterial color={SKIN} flatShading />
        </mesh>
        <mesh position={[0, 1.99, -0.03]} scale={[1.05, 0.7, 1.05]}>
          <sphereGeometry args={[0.35, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={HAIR} flatShading />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 1.9, 0.3]}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        {astronaut && (
          <mesh position={[0, 1.88, 0]}>
            <sphereGeometry args={[0.52, 18, 14]} />
            <meshStandardMaterial color="#cfefff" transparent opacity={0.28} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Wheel({ z, r = 0.32 }: { z: number; r?: number }) {
  return (
    <mesh position={[0, r, z]} rotation-y={Math.PI / 2}>
      <torusGeometry args={[r, 0.05, 6, 16]} />
      <meshStandardMaterial color="#111" />
    </mesh>
  );
}

function Bike() {
  return (
    <group>
      <Wheel z={0.55} />
      <Wheel z={-0.55} />
      <mesh position={[0, 0.5, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
        <meshStandardMaterial color="#e63946" />
      </mesh>
      <mesh position={[0, 0.8, 0.45]}>
        <boxGeometry args={[0.5, 0.05, 0.05]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function Scooter() {
  return (
    <group>
      <Wheel z={0.6} r={0.25} />
      <Wheel z={-0.6} r={0.25} />
      <mesh position={[0, 0.42, -0.1]}>
        <boxGeometry args={[0.45, 0.25, 1.1]} />
        <meshStandardMaterial color="#06d6a0" metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.85, 0.55]}>
        <boxGeometry args={[0.55, 0.06, 0.06]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

export function Car({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.2, 0.5, 2.2]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.85, -0.15]} castShadow>
        <boxGeometry args={[1.05, 0.4, 1.2]} />
        <meshStandardMaterial color="#bfe0ff" metalness={0.5} roughness={0.1} />
      </mesh>
      {[-0.55, 0.55].map((x) =>
        [-0.7, 0.7].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.22, 0.22, 0.14, 10]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        )),
      )}
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, 0.5, 1.11]}>
          <boxGeometry args={[0.22, 0.1, 0.02]} />
          <meshStandardMaterial color="#fff7c2" emissive="#fff7c2" emissiveIntensity={2} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------- confetti ---

const CONFETTI = 70;
const COLORS = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#9b5de5', '#ffffff'];

/** Burst of confetti around the hero whenever `eraFx` increments. */
export function Confetti({ at }: { at: React.MutableRefObject<THREE.Vector3> }) {
  const fx = useGame((st) => st.eraFx);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const data = useMemo(() => Array.from({ length: CONFETTI }, () => ({ life: 0, v: new THREE.Vector3(), p: new THREE.Vector3(), r: Math.random() })), []);
  useEffect(() => {
    if (!fx) return;
    data.forEach((d) => {
      d.life = 1.6 + Math.random() * 0.8;
      d.p.copy(at.current).add(new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2));
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      d.v.set(Math.cos(a) * sp, 6 + Math.random() * 6, Math.sin(a) * sp);
    });
  }, [fx, data, at]);
  useFrame((_, dt) => {
    data.forEach((d, i) => {
      const m = meshes.current[i];
      if (!m) return;
      if (d.life <= 0) {
        m.visible = false;
        return;
      }
      d.life -= dt;
      d.v.y -= 9 * dt;
      d.v.multiplyScalar(1 - dt * 0.6);
      d.p.addScaledVector(d.v, dt);
      m.visible = true;
      m.position.copy(d.p);
      m.rotation.set(d.p.y * 2 + d.r * 6, d.p.x, d.p.z * 2);
    });
  });
  return (
    <group>
      {data.map((_, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} visible={false}>
          <planeGeometry args={[0.22, 0.32]} />
          <meshStandardMaterial color={COLORS[i % COLORS.length]} emissive={COLORS[i % COLORS.length]} emissiveIntensity={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
