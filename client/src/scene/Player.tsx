import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildingAvailable, hasItem, moveSpeed } from '../../../shared/src/engine.ts';
import type { BuildingId } from '../../../shared/src/types.ts';
import { input, moveVector } from '../input.ts';
import { openBuilding, routeHit, setNear, useGame } from '../store.ts';
import { Confetti, Hero, type Ride } from './Hero.tsx';
import { LOTS, blocked, solidBoxes } from './cityLayout.ts';

const NEAR_DIST = 2.8;
const STOP_DIST = 2.2;
const CAM = new THREE.Vector3(0, 21, 16);
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _orbit = new THREE.Vector3();

export function Player() {
  const era = useGame((st) => st.s.era);
  const items = useGame((st) => st.s.items.join(','));
  const group = useRef<THREE.Group>(null);
  const speed01 = useRef(0);
  const pos = useRef(new THREE.Vector3(input.player.x, 0, input.player.z));
  const look = useRef(new THREE.Vector3(input.player.x, 0, input.player.z));
  const nearTimer = useRef(0);
  const { camera, size } = useThree();
  const boxes = useMemo(() => solidBoxes(era), [era]);

  const ride: Ride = useMemo(() => {
    const s = useGame.getState().s;
    if (s.era >= 2 && hasItem(s, 'car')) return 'car';
    if (hasItem(s, 'scooter')) return 'scooter';
    if (hasItem(s, 'bike')) return 'bike';
    return 'walk';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, era]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useGame.getState();
    const g = group.current;
    if (!g) return;

    if (st.cinematic) {
      const t = clock.elapsedTime * 0.08;
      camera.position.lerp(_orbit.set(Math.cos(t) * 80, 52, Math.sin(t) * 80), 0.05);
      camera.lookAt(0, 0, 0);
      return;
    }

    const frozen = st.modals.length > 0 || !!st.activeJob || !!st.building;
    let mv = frozen ? { x: 0, z: 0 } : moveVector();
    if (mv.x || mv.z) {
      input.path = [];
      input.arriveAt = null;
    } else if (!frozen && input.path.length) {
      const [tx, tz] = input.path[0];
      const dx = tx - pos.current.x;
      const dz = tz - pos.current.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) input.path.shift();
      else mv = { x: dx / d, z: dz / d };
      if (!input.path.length && input.arriveAt) {
        const id = input.arriveAt;
        input.arriveAt = null;
        openBuilding(id);
      }
    }

    const len = Math.hypot(mv.x, mv.z);
    const v = moveSpeed(st.s) * Math.min(1, len);
    speed01.current += ((len > 0.05 ? 1 : 0) - speed01.current) * Math.min(1, dt * 10);
    if (len > 0.05) {
      const nx = pos.current.x + mv.x * v * dt;
      const nz = pos.current.z + mv.z * v * dt;
      if (!blocked(boxes, nx, pos.current.z)) pos.current.x = nx;
      if (!blocked(boxes, pos.current.x, nz)) pos.current.z = nz;
      const target = Math.atan2(mv.x, mv.z);
      let diff = target - input.player.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      input.player.heading += diff * Math.min(1, dt * 12);
    }
    input.player.x = pos.current.x;
    input.player.z = pos.current.z;
    g.position.copy(pos.current);
    g.rotation.y = input.player.heading;

    // delivery stops
    if (st.route) {
      const stop = st.route.stops[st.route.done];
      if (stop && Math.hypot(stop[0] - pos.current.x, stop[1] - pos.current.z) < STOP_DIST) routeHit();
    }

    // which building door are we standing at?
    nearTimer.current -= dt;
    if (nearTimer.current <= 0) {
      nearTimer.current = 0.15;
      let near: BuildingId | null = null;
      let best = NEAR_DIST;
      for (const l of LOTS) {
        if (!l.id || !buildingAvailable(st.s, l.id)) continue;
        if (l.id === 'airport' && st.s.era > 1) continue;
        const d = Math.hypot(l.door[0] - pos.current.x, l.door[1] - pos.current.z);
        if (d < best) {
          best = d;
          near = l.id;
        }
      }
      if (near !== st.near) setNear(near);
    }

    // follow camera
    const aspect = size.width / Math.max(1, size.height);
    const zoom = input.zoom * (aspect < 0.7 ? 1.9 : aspect < 1 ? 1.4 : 1.05);
    const desired = _desired.set(pos.current.x + CAM.x * zoom, CAM.y * zoom, pos.current.z + CAM.z * zoom);
    camera.position.lerp(desired, Math.min(1, dt * 4));
    look.current.lerp(_look.set(pos.current.x, 0.8, pos.current.z - 1.5), Math.min(1, dt * 6));
    camera.lookAt(look.current);
  });

  return (
    <>
      <group ref={group} position={[input.player.x, 0, input.player.z]}>
        <Hero era={era} speed={speed01} ride={ride} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.14, 0]}>
          <circleGeometry args={[0.6, 20]} />
          <meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      </group>
      <Confetti at={pos} />
    </>
  );
}
