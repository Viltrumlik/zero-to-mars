import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildingAvailable, currentQuest } from '../../../shared/src/engine.ts';
import { input } from '../input.ts';
import { useGame } from '../store.ts';
import { LOT_BY_ID } from './cityLayout.ts';

function Beacon({ x, z, color, strong }: { x: number; z: number; color: string; strong?: boolean }) {
  const arrow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (arrow.current) {
      arrow.current.position.y = 4 + Math.sin(t * 3) * 0.35;
      arrow.current.rotation.y = t * 2;
    }
    if (ring.current) {
      const s = 1 + ((t * 0.8) % 1) * 0.8;
      ring.current.scale.set(s, s, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - ((t * 0.8) % 1));
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[strong ? 0.55 : 0.4, strong ? 0.55 : 0.4, 24, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={strong ? 0.28 : 0.2} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={arrow} rotation-x={Math.PI}>
        <coneGeometry args={[0.55, 1.1, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.15, 0]}>
        <ringGeometry args={[0.8, 1.1, 32]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Arrow at the hero's feet pointing to the current goal. */
function GroundArrow() {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const st = useGame.getState();
    const target = goalPoint(st);
    if (!g.current) return;
    if (!target) {
      g.current.visible = false;
      return;
    }
    const dx = target[0] - input.player.x;
    const dz = target[1] - input.player.z;
    const d = Math.hypot(dx, dz);
    g.current.visible = d > 5;
    g.current.position.set(input.player.x, 0.2, input.player.z);
    g.current.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0, 1.9]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.5, 3]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

type St = ReturnType<typeof useGame.getState>;

/** Current navigation goal: next delivery stop, else the quest building. */
export function goalPoint(st: St): [number, number] | null {
  if (st.route) return st.route.stops[st.route.done] ?? null;
  const q = currentQuest(st.s);
  if (q?.target && buildingAvailable(st.s, q.target) && st.building !== q.target) return LOT_BY_ID[q.target].door;
  return null;
}

export function Markers() {
  const route = useGame((st) => st.route);
  const quest = useGame((st) => currentQuest(st.s));
  const era = useGame((st) => st.s.era);
  const qTarget = quest?.target && buildingAvailable(useGame.getState().s, quest.target) ? LOT_BY_ID[quest.target].door : null;
  void era;
  return (
    <group>
      {route
        ? route.stops.slice(route.done).map(([x, z], i) => <Beacon key={`${x}${z}`} x={x} z={z} color="#4cc9f0" strong={i === 0} />)
        : qTarget && <Beacon x={qTarget[0]} z={qTarget[1]} color="#ffd166" strong />}
      <GroundArrow />
    </group>
  );
}
