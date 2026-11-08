import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { finishLaunch, useGame } from '../store.ts';
const PAD_POS: [number, number, number] = [0, 0, 0];

const SMOKE = 18;

function RocketModel({ starship }: { starship: boolean }) {
  const body = starship ? '#c9ced6' : '#f8fafc';
  return (
    <group>
      <mesh position={[0, 2.1, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 3.6, 16]} />
        <meshStandardMaterial color={body} metalness={starship ? 0.9 : 0.2} roughness={starship ? 0.28 : 0.5} />
      </mesh>
      <mesh position={[0, 4.4, 0]} castShadow>
        <coneGeometry args={[0.45, 1.0, 16]} />
        <meshStandardMaterial color={starship ? '#c9ced6' : '#111827'} metalness={starship ? 0.9 : 0.3} roughness={0.3} />
      </mesh>
      {!starship &&
        [1.2, 3.1].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.46, 0.46, 0.14, 16]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.5, 0.6, Math.sin((i * Math.PI) / 2) * 0.5]} rotation-y={(-i * Math.PI) / 2}>
          <boxGeometry args={[0.45, 0.8, 0.06]} />
          <meshStandardMaterial color={starship ? '#9aa3ad' : '#111827'} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.28, 0.4, 0.35, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Rocket({ era }: { era: number }) {
  const anim = useGame((st) => st.launchAnim);
  const rocket = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const boom = useRef<THREE.Mesh>(null);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smoke = useMemo(() => Array.from({ length: SMOKE }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() })), []);
  const start = useRef<number | null>(null);
  const done = useRef<number | null>(null);
  const respawn = useRef(1);
  const nextSmoke = useRef(0);

  useEffect(() => {
    if (anim) {
      start.current = null;
      done.current = null;
    }
  }, [anim]);

  useFrame(({ clock }, dt) => {
    const r = rocket.current;
    if (!r) return;
    const now = clock.elapsedTime;
    let y = 0;
    let flameOn = false;
    let visible = true;
    let boomScale = 0;

    if (anim) {
      if (start.current === null) start.current = now;
      const t = now - start.current;
      const ignite = 1.2;
      flameOn = true;
      if (t > ignite) y = 0.5 * 7 * (t - ignite) ** 2;
      if (!anim.win && t > 2.7) {
        visible = false;
        flameOn = false;
        const bt = t - 2.7;
        boomScale = bt < 1.4 ? Math.sin((bt / 1.4) * Math.PI) * 4.5 : 0;
        y = 0.5 * 7 * (2.7 - ignite) ** 2;
      }
      if (anim.win && t > 5) visible = false;
      // smoke spawning near the pad during ignition / lift-off
      if (t < 3.2 && Math.random() < dt * 30) {
        const s = smoke[nextSmoke.current];
        nextSmoke.current = (nextSmoke.current + 1) % SMOKE;
        s.life = 1;
        s.p.set((Math.random() - 0.5) * 0.6, Math.max(0, y) + 0.1, (Math.random() - 0.5) * 0.6);
        const a = Math.random() * Math.PI * 2;
        s.v.set(Math.cos(a) * 1.8, 0.6 + Math.random(), Math.sin(a) * 1.8);
      }
      const end = anim.win ? 5.3 : 4.4;
      if (t > end && done.current !== anim.id) {
        done.current = anim.id;
        respawn.current = 0;
        finishLaunch();
      }
      // jitter while igniting
      r.position.x = t < ignite ? (Math.random() - 0.5) * 0.05 : 0;
    } else {
      respawn.current = Math.min(1, respawn.current + dt * 0.8);
    }

    r.position.y = y;
    r.visible = visible;
    const sc = anim ? 1 : Math.max(0.01, respawn.current);
    r.scale.setScalar(sc);

    if (flame.current) {
      flame.current.visible = flameOn;
      const f = 0.8 + Math.random() * 0.4;
      flame.current.scale.set(f, f * (y > 0 ? 1.6 : 1), f);
    }
    if (light.current) {
      light.current.intensity = flameOn ? 25 + Math.random() * 15 : boomScale > 0 ? 80 * (boomScale / 4.5) : 0;
      light.current.position.y = y + 0.2;
    }
    if (boom.current) {
      boom.current.visible = boomScale > 0.01;
      boom.current.scale.setScalar(Math.max(0.01, boomScale));
      boom.current.position.y = y + 1.5;
    }
    smoke.forEach((s, i) => {
      const m = smokeRefs.current[i];
      if (!m) return;
      if (s.life <= 0) {
        m.visible = false;
        return;
      }
      s.life -= dt * 0.55;
      s.p.addScaledVector(s.v, dt);
      s.v.multiplyScalar(1 - dt * 1.5);
      m.visible = true;
      m.position.copy(s.p);
      m.scale.setScalar(0.4 + (1 - s.life) * 1.6);
      (m.material as THREE.MeshStandardMaterial).opacity = s.life * 0.7;
    });
  });

  const starship = era === 6;
  return (
    <group position={PAD_POS} onClick={(e) => e.stopPropagation()}>
      {/* pad */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.6, 1.8, 0.25, 20]} />
        <meshStandardMaterial color="#9ca3af" flatShading />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <ringGeometry args={[0.9, 1.05, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* tower */}
      <group position={[-1.15, 0, 0]}>
        <mesh position={[0, 2.6, 0]} castShadow>
          <boxGeometry args={[0.35, 5.2, 0.35]} />
          <meshStandardMaterial color="#ef4444" flatShading />
        </mesh>
        {[1.5, 3, 4.5].map((h) => (
          <mesh key={h} position={[0.45, h, 0]}>
            <boxGeometry args={[0.6, 0.1, 0.12]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
        ))}
        <mesh position={[0, 5.35, 0]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color="#ff4d4d" emissive="#ff0000" emissiveIntensity={3} />
        </mesh>
      </group>
      <group position={[0, 0.25, 0]}>
        <group ref={rocket}>
          <RocketModel starship={starship} />
          <mesh ref={flame} position={[0, -0.55, 0]} rotation-x={Math.PI} visible={false}>
            <coneGeometry args={[0.32, 1.3, 12]} />
            <meshBasicMaterial color="#ffb347" transparent opacity={0.9} />
          </mesh>
        </group>
        <pointLight ref={light} color="#ff8a3d" intensity={0} distance={14} decay={1.6} />
        <mesh ref={boom} visible={false}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#ff7b00" emissive="#ff4d00" emissiveIntensity={3} transparent opacity={0.85} flatShading />
        </mesh>
        {smoke.map((_, i) => (
          <mesh key={i} ref={(el) => (smokeRefs.current[i] = el)} visible={false}>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#e5e7eb" transparent opacity={0.6} flatShading depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
