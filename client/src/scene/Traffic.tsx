import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { input } from '../input.ts';
import { CITY_HALF, LANES, SIDEWALKS } from './cityLayout.ts';

const COLORS = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#ffd166', '#6d597a', '#f8f9fa', '#118ab2', '#06d6a0', '#ef476f', '#343a40'];
const o = new THREE.Object3D();
const tmpColor = new THREE.Color();

function wheelsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.55, 0.55])
    for (const z of [-0.7, 0.7]) {
      const g = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8);
      g.rotateZ(Math.PI / 2);
      g.translate(x, 0.22, z);
      parts.push(g);
    }
  return mergeGeometries(parts)!;
}

function lightsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.35, 0.35]) {
    const g = new THREE.BoxGeometry(0.22, 0.1, 0.04);
    g.translate(x, 0.5, 1.11);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

/** Cars on every lane, drawn with four instanced meshes. They brake for the hero and for the car ahead. */
export function Traffic({ count, mars }: { count: number; mars: boolean }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      body: new THREE.BoxGeometry(1.2, 0.5, 2.2).translate(0, 0.45, 0),
      cabin: new THREE.BoxGeometry(1.05, 0.4, 1.2).translate(0, 0.85, -0.15),
      wheels: wheelsGeometry(),
      lights: lightsGeometry(),
    }),
    [],
  );
  const cars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const lane = (i * 7) % LANES.length;
        return { lane, t: -CITY_HALF + ((i * 53) % (CITY_HALF * 2)), speed: 6 + (lane % 3) * 1.5, cur: 6 };
      }),
    [count],
  );
  const colored = useRef(-1);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = body.current;
    if (!b) return;
    if (colored.current !== count) {
      colored.current = count;
      cars.forEach((_, i) => b.setColorAt(i, tmpColor.set(mars ? '#f1f5f9' : COLORS[i % COLORS.length])));
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    const px = input.player.x;
    const pz = input.player.z;
    cars.forEach((c, i) => {
      const { axis, c: lc, dir } = LANES[c.lane];
      const x = axis === 'z' ? lc : c.t;
      const z = axis === 'z' ? c.t : lc;
      const ahead = axis === 'z' ? (pz - z) * dir : (px - x) * dir;
      const side = axis === 'z' ? Math.abs(px - x) : Math.abs(pz - z);
      let target = ahead > 0 && ahead < 4.5 && side < 1.7 ? 0 : c.speed;
      for (const other of cars) {
        if (other === c || other.lane !== c.lane) continue;
        const gap = (other.t - c.t) * dir;
        if (gap > 0 && gap < 4) target = Math.min(target, other.cur * 0.8);
      }
      c.cur += (target - c.cur) * Math.min(1, dt * (target ? 2 : 8));
      c.t += dir * c.cur * dt;
      if (c.t > CITY_HALF + 6) c.t = -CITY_HALF - 6;
      if (c.t < -CITY_HALF - 6) c.t = CITY_HALF + 6;
      o.position.set(axis === 'z' ? lc : c.t, 0, axis === 'z' ? c.t : lc);
      o.rotation.set(0, axis === 'z' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      o.updateMatrix();
      b.setMatrixAt(i, o.matrix);
      cabin.current!.setMatrixAt(i, o.matrix);
      wheels.current!.setMatrixAt(i, o.matrix);
      lights.current!.setMatrixAt(i, o.matrix);
    });
    for (const m of [b, cabin.current!, wheels.current!, lights.current!]) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group key={count}>
      <instancedMesh ref={body} args={[geo.body, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial metalness={0.35} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[geo.cabin, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#bfe0ff" metalness={0.5} roughness={0.1} />
      </instancedMesh>
      <instancedMesh ref={wheels} args={[geo.wheels, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#111" />
      </instancedMesh>
      <instancedMesh ref={lights} args={[geo.lights, undefined, count]} frustumCulled={false}>
        <meshBasicMaterial color="#fff7c2" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const SHIRTS = ['#e76f51', '#2a9d8f', '#264653', '#e9c46a', '#8338ec', '#3a86ff', '#ff006e', '#fb5607'];
const P = 9.3;

/** People strolling around blocks on the sidewalks (two instanced meshes). */
export function Pedestrians({ count }: { count: number }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        block: SIDEWALKS[(i * 11) % SIDEWALKS.length],
        s: (i * 13.7) % (P * 8),
        speed: (1.1 + ((i * 7) % 5) * 0.15) * (i % 2 ? 1 : -1),
      })),
    [count],
  );
  const colored = useRef(-1);
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = bodies.current;
    const h = heads.current;
    if (!b || !h) return;
    if (colored.current !== count) {
      colored.current = count;
      people.forEach((_, i) => b.setColorAt(i, tmpColor.set(SHIRTS[i % SHIRTS.length])));
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    const perim = P * 8;
    people.forEach((p, i) => {
      p.s = (((p.s + p.speed * dt) % perim) + perim) % perim;
      const side = Math.floor(p.s / (P * 2));
      const f = p.s % (P * 2);
      let x = 0;
      let z = 0;
      let ry = 0;
      if (side === 0) [x, z, ry] = [-P + f, -P, Math.PI / 2];
      else if (side === 1) [x, z, ry] = [P, -P + f, 0];
      else if (side === 2) [x, z, ry] = [P - f, P, -Math.PI / 2];
      else [x, z, ry] = [-P, P - f, Math.PI];
      if (p.speed < 0) ry += Math.PI;
      const bob = Math.abs(Math.sin(clock.elapsedTime * 8 + i)) * 0.06;
      o.position.set(p.block[0] + x, bob, p.block[1] + z);
      o.rotation.set(0, ry, 0);
      o.updateMatrix();
      b.setMatrixAt(i, o.matrix);
      h.setMatrixAt(i, o.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });
  const geo = useMemo(
    () => ({ body: new THREE.BoxGeometry(0.5, 1.1, 0.32).translate(0, 0.75, 0), head: new THREE.SphereGeometry(0.22, 8, 6).translate(0, 1.5, 0) }),
    [],
  );
  if (!count) return null;
  return (
    <group key={count}>
      <instancedMesh ref={bodies} args={[geo.body, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geo.head, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#e0ac69" flatShading />
      </instancedMesh>
    </group>
  );
}
