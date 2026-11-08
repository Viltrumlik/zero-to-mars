/**
 * The city is generated procedurally and merged into a handful of big meshes
 * per block (one per material). That keeps draw calls tiny on phones while
 * still letting the camera frustum-cull blocks that are off screen.
 */
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDING_BY_ID } from '../../../shared/src/content/city.ts';
import { ERAS } from '../../../shared/src/content/eras.ts';
import type { BuildingId } from '../../../shared/src/types.ts';
import { goTo, useGame } from '../store.ts';
import { BLOCKS, BLOCK_HALF, CITY_HALF, LOTS, ROADS, ROAD_W, TREE_POINTS, lotPresent, type Lot } from './cityLayout.ts';

/** Shared materials: World dims/brightens the emissive ones with the time of day. */
export const WINDOW_MAT = new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffcf6b', emissiveIntensity: 0.4 });
export const LAMP_MAT = new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#ffd27a', emissiveIntensity: 0 });
const SOLID_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const GLASS_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.1, depthWrite: false });
const WATER_MAT = new THREE.MeshStandardMaterial({ color: '#3a9ad9', metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.9 });
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

// ------------------------------------------------------------- builder ---

type Layer = 'solid' | 'window' | 'glow' | 'glass' | 'water';
const LAYERS: Layer[] = ['solid', 'window', 'glow', 'glass', 'water'];
type V3 = [number, number, number];

const baseCache = new Map<string, THREE.BufferGeometry>();
function base(key: string, make: () => THREE.BufferGeometry) {
  let g = baseCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    baseCache.set(key, g);
  }
  return g;
}
const G = {
  box: () => base('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (rt: number, rb: number, seg: number) => base(`cyl${rt}/${rb}/${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg)),
  cone: (seg: number) => base(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  dome: (seg: number) => base(`dome${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2)),
  ball: (seg: number) => base(`ball${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1))),
  plane: () => base('plane', () => new THREE.PlaneGeometry(1, 1)),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Builder {
  parts: Record<Layer, THREE.BufferGeometry[]> = { solid: [], window: [], glow: [], glass: [], water: [] };
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  push(x: number, z: number, ry = 0) {
    _q.setFromEuler(_e.set(0, ry, 0));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(_m.compose(_p.set(x, 0, z), _q, _s.set(1, 1, 1))));
  }
  pop() {
    this.stack.pop();
  }
  add(g: THREE.BufferGeometry, layer: Layer, color: string, pos: V3, scale: V3, rot?: V3) {
    _q.setFromEuler(_e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
    const m = this.stack[this.stack.length - 1].clone().multiply(_m.compose(_p.set(...pos), _q, _s.set(...scale)));
    const geo = g.clone();
    geo.applyMatrix4(m);
    _c.set(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts[layer].push(geo);
  }
  box(c: string, p: V3, s: V3, layer: Layer = 'solid', rot?: V3) {
    this.add(G.box(), layer, c, p, s, rot);
  }
  win(p: V3, s: [number, number]) {
    this.add(G.plane(), 'window', '#ffffff', p, [s[0], s[1], 1]);
  }
  build(): Partial<Record<Layer, THREE.BufferGeometry>> {
    const out: Partial<Record<Layer, THREE.BufferGeometry>> = {};
    for (const l of LAYERS) {
      if (!this.parts[l].length) continue;
      const merged = mergeGeometries(this.parts[l], false);
      if (merged) {
        merged.computeBoundingSphere();
        out[l] = merged;
      }
      this.parts[l].forEach((g) => g.dispose());
    }
    return out;
  }
}

// ------------------------------------------------------------- models ---
// All models are built facing +z in local space.

function shop(b: Builder, w: number, d: number, h: number, body: string, accent: string, awning = true) {
  b.box(body, [0, h / 2, 0], [w - 0.4, h, d - 0.4]);
  b.box(accent, [0, h + 0.12, 0], [w - 0.2, 0.24, d - 0.2]);
  if (awning) b.box(accent, [0, h * 0.62, d / 2 - 0.05], [w - 0.6, 0.08, 0.9], 'solid', [0.45, 0, 0]);
  b.box(accent, [0, h * 0.86, d / 2 - 0.15], [w * 0.5, 0.5, 0.08], 'glow');
  b.win([-w * 0.25, h * 0.38, d / 2 - 0.19], [w * 0.3, h * 0.35]);
  b.win([w * 0.25, h * 0.38, d / 2 - 0.19], [w * 0.3, h * 0.35]);
  b.box('#3a2a20', [0, 0.65, d / 2 - 0.18], [0.9, 1.3, 0.05]);
}

function tower(b: Builder, w: number, d: number, h: number, body: string, glass = false) {
  b.box(body, [0, h / 2, 0], [w - 0.6, h, d - 0.6], glass ? 'glass' : 'solid');
  if (glass) b.box('#2b2f3a', [0, h / 2, 0], [w - 1.2, h - 0.2, d - 1.2]);
  const floors = Math.max(2, Math.floor(h / 1.6));
  for (let i = 0; i < floors; i++) b.add(G.box(), 'window', '#fff', [0, 0.9 + i * 1.6, 0], [w - 0.5, 0.35, d - 0.5]);
  b.box('#e9ecef', [0, h + 0.2, 0], [w * 0.5, 0.4, d * 0.5]);
}

function house(b: Builder, w: number, d: number, body: string, roof: string) {
  b.box(body, [0, 1.3, 0], [w - 1, 2.6, d - 1]);
  b.add(G.cone(4), 'solid', roof, [0, 3.3, 0], [(w - 0.6) * 0.75, 1.5, (w - 0.6) * 0.75], [0, Math.PI / 4, 0]);
  b.win([-1.2, 1.5, (d - 1) / 2 + 0.01], [0.9, 0.8]);
  b.win([1.2, 1.5, (d - 1) / 2 + 0.01], [0.9, 0.8]);
  b.box('#6b4226', [0, 0.7, (d - 1) / 2 + 0.02], [0.9, 1.4, 0.05]);
}

function classic(b: Builder, w: number, d: number, h: number, body: string, accent: string, dome = false) {
  b.box('#ced4da', [0, 0.2, 0.3], [w, 0.4, d - 0.2]);
  b.box(body, [0, h / 2 + 0.4, -0.4], [w - 0.8, h, d - 1.8]);
  for (const x of [-2, -0.7, 0.7, 2]) b.add(G.cyl(0.22, 0.25, 8), 'solid', '#f8f9fa', [x * (w / 6), h / 2 + 0.4, d / 2 - 0.9], [1, h, 1]);
  b.box(accent, [0, h + 0.65, 0], [w - 0.2, 0.5, d - 0.6]);
  if (dome) b.add(G.dome(14), 'solid', accent, [0, h + 0.9, -0.3], [1.6, 1.6, 1.6]);
  b.win([0, h * 0.45 + 0.4, d / 2 - 1.29], [w * 0.5, h * 0.4]);
}

function construction(b: Builder) {
  b.box('#8d6e63', [0, 0.05, 0], [6.5, 0.1, 6.5]);
  for (const [x, z, w, d] of [[0, 3.2, 6.6, 0.1], [0, -3.2, 6.6, 0.1], [3.2, 0, 0.1, 6.6], [-3.2, 0, 0.1, 6.6]]) b.box('#f4a261', [x, 0.6, z], [w, 1.2, d]);
  b.box('#ffb703', [-2, 4, -2], [0.4, 8, 0.4]);
  b.box('#ffb703', [0.2, 7.8, -2], [4.8, 0.3, 0.3]);
  b.box('#adb5bd', [1.5, 0.8, 1], [1.6, 1.6, 1.6]);
}

function warehouse(b: Builder, w: number, d: number, c: string) {
  b.box(c, [0, 1.8, 0], [w - 0.4, 3.6, d - 0.4]);
  b.add(G.cyl(1, 1, 10), 'solid', '#adb5bd', [0, 3.6, 0], [(w - 0.6) / 2, d - 0.5, 0.9], [Math.PI / 2, 0, 0]);
  b.box('#495057', [0, 1.1, d / 2 - 0.18], [2.4, 2.2, 0.06]);
}

function marsDome(b: Builder, big = false) {
  const r = big ? 5 : 3;
  b.add(G.dome(18), 'glass', '#c7ecff', [0, 0, 0], [r, r, r]);
  b.box('#d6d3d1', [0, 0.05, 0], [r * 2, 0.1, r * 2]);
  b.box('#f1f5f9', [-1, 1, 0], [1.2, 2, 1.2]);
  b.box('#fbbf24', [1.2, 0.8, 0.5], [1, 1.6, 1], 'glow');
}

const PALETTE = ['#f4a261', '#e9c46a', '#a8dadc', '#ffafcc', '#cdb4db', '#90be6d', '#f28482', '#84a59d', '#bde0fe', '#ffc8dd'];

function decor(b: Builder, l: Lot, era: number) {
  const c = PALETTE[l.seed % PALETTE.length];
  const r = (l.seed * 9301 + 49297) % 233280 / 233280;
  switch (l.decor) {
    case 'house':
      if (era >= 4) tower(b, l.w, l.d, 4 + r * 4, c);
      else house(b, l.w, l.d, ['#fff3e0', '#f1faee', '#fefae0'][l.seed % 3], c);
      break;
    case 'apartment':
      tower(b, l.w, l.d, 4.5 + r * 4 + era * 0.8, c);
      break;
    case 'tower':
      tower(b, l.w, l.d, 7 + era * 3 + r * 4, era >= 5 ? '#1e293b' : '#5b8def', era >= 3);
      break;
    case 'shop':
      shop(b, l.w, l.d, 3 + r, '#f8f9fa', c);
      break;
    case 'warehouse':
      warehouse(b, l.w, l.d, ['#adb5bd', '#8d99ae', '#b08968'][l.seed % 3]);
      break;
    case 'park':
      b.add(G.cyl(2.4, 2.6, 16), 'solid', '#ced4da', [0, 0.2, 0], [1, 0.4, 1]);
      b.add(G.cyl(2.1, 2.1, 16), 'water', '#fff', [0, 0.42, 0], [1, 0.05, 1]);
      b.add(G.cyl(0.2, 0.35, 8), 'solid', '#e9ecef', [0, 1.2, 0], [1, 1.6, 1]);
      for (let i = 0; i < 4; i++) b.box('#8d6e63', [Math.cos((i * Math.PI) / 2) * 5, 0.4, Math.sin((i * Math.PI) / 2) * 5], [1.8, 0.2, 0.6], 'solid', [0, (i * Math.PI) / 2, 0]);
      break;
    case 'pond':
      b.add(G.cyl(1, 1, 24), 'solid', '#c9ada7', [0, 0.1, 0], [l.w / 2 + 0.6, 0.2, l.d / 2 + 0.6]);
      b.add(G.cyl(1, 1, 24), 'water', '#fff', [0, 0.22, 0], [l.w / 2, 0.05, l.d / 2]);
      b.box('#8d6e63', [l.w / 2 + 1.6, 0.35, 0], [0.6, 0.2, 3]);
      break;
    case 'forest':
      break;
  }
}

function homeModel(b: Builder, era: number) {
  if (era === 0) house(b, 7, 7, '#f4e4c1', '#d1495b');
  else if (era === 1) tower(b, 7, 7, 5.5, '#c8553d');
  else if (era <= 3) tower(b, 7, 7, 8, '#2a9d8f');
  else if (era === 4) house(b, 7, 7, '#ffffff', '#264653');
  else if (era === 5) tower(b, 7, 7, 16, '#0f172a', true);
  else marsDome(b);
}

function companyModel(b: Builder, era: number) {
  if (era === 2) {
    b.box('#9aa5b1', [0, 1.6, 0], [8, 3.2, 7]);
    b.box('#1f2937', [0, 1.2, 3.52], [4, 2.4, 0.05]);
    for (const x of [-1.2, 0, 1.2]) b.box('#22d3ee', [x, 0.8, 3.56], [0.6, 1.4, 0.05], 'glow');
    b.add(G.ball(12), 'glow', '#ef4444', [0, 4.4, 0], [0.6, 0.6, 0.6]);
  } else if (era === 3) tower(b, 9, 9, 14, '#5b8def', true);
  else if (era === 4) {
    b.box('#f5f5f5', [0, 2, 0], [12, 4, 9.5]);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) b.box('#d0d7de', [x, 4.4, 0], [1.1, 1.1, 9.5], 'solid', [0, 0, Math.PI / 4]);
    b.box('#e11d48', [-0.5, 2.2, 4.8], [0.35, 2.4, 0.05], 'glow', [0, 0, 0.35]);
    b.box('#e11d48', [0.5, 2.2, 4.8], [0.35, 2.4, 0.05], 'glow', [0, 0, -0.35]);
  } else if (era === 5) tower(b, 10, 10, 26, '#111827', true);
  else marsDome(b, true);
}

function buildingModel(b: Builder, id: BuildingId, era: number) {
  switch (id) {
    case 'home': return homeModel(b, era);
    case 'library': return classic(b, 7, 7, 3.6, '#e9d8a6', '#9b2226');
    case 'gym': return shop(b, 7, 7, 3.6, '#adb5bd', '#ef476f', false);
    case 'hospital':
      shop(b, 7, 7, 4.2, '#f8f9fa', '#e63946', false);
      b.box('#ef233c', [0, 4.9, 3.1], [1.6, 0.45, 0.1], 'glow');
      b.box('#ef233c', [0, 4.9, 3.1], [0.45, 1.6, 0.1], 'glow');
      return;
    case 'market': return shop(b, 7, 7, 3.2, '#f1faee', '#2a9d8f');
    case 'cafe': return shop(b, 7, 7, 3.2, '#ffe8d6', '#e63946');
    case 'kiosk':
      b.box('#1d3557', [0, 1.2, 0], [3.2, 2.4, 2.6]);
      b.box('#e63946', [0, 2.55, 0.2], [3.6, 0.3, 3.2]);
      b.win([0, 1.4, 1.31], [2.4, 1]);
      return;
    case 'bikeshop': return shop(b, 7, 7, 3.2, '#dee2e6', '#f77f00');
    case 'electronics': return shop(b, 7, 7, 3.8, '#343a40', '#00b4d8', false);
    case 'netcafe': return shop(b, 7, 7, 3.8, '#3c096c', '#c77dff', false);
    case 'post': return shop(b, 7, 7, 3.6, '#ffd166', '#118ab2');
    case 'carwash':
      for (const x of [-2.8, 2.8]) for (const z of [-2.3, 2.3]) b.box('#adb5bd', [x, 1.5, z], [0.3, 3, 0.3]);
      b.box('#0077b6', [0, 3.1, 0], [6.4, 0.3, 5.4]);
      b.box('#48cae4', [0, 3.6, 2.7], [3.5, 0.8, 0.1], 'glow');
      b.box('#e63946', [0, 0.5, 0], [1.3, 0.6, 2.3]);
      return;
    case 'airport':
      b.box('#90e0ef', [0, 1.8, -1], [13, 3.6, 5.5], 'glass');
      b.box('#e9ecef', [0, 3.8, -1], [13.4, 0.4, 5.9]);
      b.box('#e9ecef', [5.5, 4, -3], [1, 8, 1]);
      b.box('#48cae4', [5.5, 8.4, -3], [2, 1, 2], 'glow');
      b.box('#ffffff', [-2, 0.8, 3.2], [0.9, 0.9, 5], 'solid', [0, 0.3, 0]);
      b.box('#e5e5e5', [-2, 0.8, 3.4], [6, 0.15, 1.2], 'solid', [0, 0.3, 0]);
      return;
    case 'university': return classic(b, 13, 10, 5, '#ced4da', '#1d3557', true);
    case 'boiler':
      b.box('#6c757d', [0, 2, 0], [6.4, 4, 6]);
      for (const x of [-1.6, 1.6]) b.add(G.cyl(0.45, 0.6, 8), 'solid', '#9d0208', [x, 5.5, -1.5], [1, 7, 1]);
      b.win([0, 1.6, 3.01], [4.5, 1.2]);
      return;
    case 'pizzeria': return shop(b, 7, 7, 3.2, '#fff3b0', '#d62828');
    case 'bizcenter': return tower(b, 7, 7, 12, '#4cc9f0', true);
    case 'bank': return classic(b, 7, 7, 4, '#f8f9fa', '#e9c46a');
    case 'company': return companyModel(b, era);
    case 'launchpad': return;
  }
}

function lotState(l: Lot, era: number): 'open' | 'future' | 'past' {
  if (!l.id) return 'open';
  const b = BUILDING_BY_ID[l.id];
  if (l.id === 'launchpad') return era >= 4 ? 'open' : 'future';
  if (era < b.minEra) return 'future';
  if (era > b.maxEra) return 'past';
  return 'open';
}

export function modelHeight(id: BuildingId, era: number): number {
  if (id === 'bizcenter') return 13;
  if (id === 'company') return [5, 5, 5, 15, 6, 27, 6][era];
  if (id === 'home') return [4, 6, 9, 9, 4, 17, 4][era];
  if (id === 'boiler') return 9;
  if (id === 'university') return 8;
  return 5;
}

/** One block = one chunk of merged meshes. */
function buildBlock(bx: number, bz: number, era: number) {
  const b = new Builder();
  for (const l of LOTS) {
    if (l.bx !== bx || l.bz !== bz || !lotPresent(l, era)) continue;
    b.push(l.x, l.z, l.face === 1 ? 0 : Math.PI);
    const st = lotState(l, era);
    if (!l.id) decor(b, l, era);
    else if (st === 'future') construction(b);
    else if (st === 'past') tower(b, l.w, l.d, 5, '#8d99ae');
    else buildingModel(b, l.id, era);
    b.pop();
  }
  return b.build();
}

function buildRoads(mars: boolean) {
  const b = new Builder();
  const asphalt = mars ? '#5c2d22' : '#3b3f4a';
  const span = CITY_HALF * 2 + 6;
  for (const c of ROADS) {
    b.box(asphalt, [c, 0.01, 0], [ROAD_W, 0.02, span]);
    b.box(asphalt, [0, 0.012, c], [span, 0.02, ROAD_W]);
    for (let t = -CITY_HALF + 2; t < CITY_HALF; t += 4) {
      if (ROADS.some((r) => Math.abs(r - t) < ROAD_W / 2 + 0.5)) continue;
      b.box('#f1f3f5', [c, 0.03, t], [0.18, 0.02, 1.6]);
      b.box('#f1f3f5', [t, 0.03, c], [1.6, 0.02, 0.18]);
    }
  }
  for (const bx of BLOCKS) for (const bz of BLOCKS) b.box(mars ? '#b9846f' : '#cfd3d8', [bx, 0.06, bz], [BLOCK_HALF * 2, 0.12, BLOCK_HALF * 2]);
  return b.build();
}

// ---------------------------------------------------------- rendering ---

function Chunk({ geos, shadows, cast = true }: { geos: Partial<Record<Layer, THREE.BufferGeometry>>; shadows: boolean; cast?: boolean }) {
  return (
    <>
      {geos.solid && <mesh geometry={geos.solid} material={SOLID_MAT} castShadow={shadows && cast} receiveShadow={shadows} />}
      {geos.window && <mesh geometry={geos.window} material={WINDOW_MAT} />}
      {geos.glow && <mesh geometry={geos.glow} material={GLOW_MAT} />}
      {geos.water && <mesh geometry={geos.water} material={WATER_MAT} />}
      {geos.glass && <mesh geometry={geos.glass} material={GLASS_MAT} />}
    </>
  );
}

const textureCache = new Map<string, THREE.CanvasTexture>();
function emojiTexture(emoji: string): THREE.CanvasTexture {
  let tex = textureCache.get(emoji);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(48, 48, 44, 0, Math.PI * 2);
    g.fill();
    g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 48, 53);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(emoji, tex);
  }
  return tex;
}

/** Floating emoji signs above every open building (one sprite each, gently bobbing together). */
function Signs({ era }: { era: number }) {
  const group = useRef<THREE.Group>(null);
  const signs = useMemo(
    () =>
      LOTS.filter((l) => l.id && lotPresent(l, era) && lotState(l, era) === 'open' && l.id !== 'launchpad').map((l) => ({
        l,
        emoji: l.id === 'company' ? ERAS[era].icon : BUILDING_BY_ID[l.id!].icon,
        y: modelHeight(l.id!, era) + 1.8,
      })),
    [era],
  );
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => (c.position.y = signs[i].y + Math.sin(clock.elapsedTime * 2 + i) * 0.15));
  });
  return (
    <group ref={group}>
      {signs.map(({ l, emoji, y }) => (
        <sprite key={l.seed} position={[l.x, y, l.z]} scale={[1.8, 1.8, 1.8]}>
          <spriteMaterial map={emojiTexture(emoji)} depthWrite={false} transparent fog={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}

/** Invisible boxes so tapping a building walks the hero to its door. */
function HitBoxes({ era }: { era: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const lots = useMemo(() => LOTS.filter((l) => l.id && lotPresent(l, era) && lotState(l, era) === 'open'), [era]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    lots.forEach((l, i) => {
      const h = modelHeight(l.id!, era);
      o.position.set(l.x, h / 2, l.z);
      o.scale.set(l.w, h, l.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [lots, era]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const l = e.instanceId !== undefined ? lots[e.instanceId] : null;
    if (l?.id && e.delta < 10) goTo(l.id);
  };
  return (
    <instancedMesh key={lots.length} ref={ref} args={[G.box(), HIT_MAT, lots.length]} onClick={onClick} />
  );
}

function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: { p: V3; s?: number }[]) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.setScalar(it.s ?? 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ref, items]);
}

function Lamps() {
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    for (const bx of BLOCKS) for (const bz of BLOCKS) for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([bx + sx * 9.6, bz + sz * 9.6]);
    return out;
  }, []);
  useInstances(poles, useMemo(() => pts.map(([x, z]) => ({ p: [x, 1.6, z] as V3 })), [pts]));
  useInstances(heads, useMemo(() => pts.map(([x, z]) => ({ p: [x, 3.3, z] as V3 })), [pts]));
  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, pts.length]}>
        <cylinderGeometry args={[0.08, 0.1, 3.2, 5]} />
        <meshStandardMaterial color="#495057" />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, pts.length]} material={LAMP_MAT}>
        <sphereGeometry args={[0.28, 8, 6]} />
      </instancedMesh>
    </group>
  );
}

function Trees({ mars, shadows }: { mars: boolean; shadows: boolean }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const tops = useRef<THREE.InstancedMesh>(null);
  useInstances(trunks, useMemo(() => TREE_POINTS.map(([x, z, s]) => ({ p: [x, 0.4 * s, z] as V3, s })), []));
  useInstances(tops, useMemo(() => TREE_POINTS.map(([x, z, s]) => ({ p: [x, (mars ? 0.5 : 1.5) * s, z] as V3, s })), [mars]));
  return (
    <group>
      {!mars && (
        <instancedMesh ref={trunks} args={[undefined, undefined, TREE_POINTS.length]}>
          <cylinderGeometry args={[0.14, 0.18, 0.8, 5]} />
          <meshStandardMaterial color="#6b4a2f" flatShading />
        </instancedMesh>
      )}
      <instancedMesh key={String(mars)} ref={tops} args={[undefined, undefined, TREE_POINTS.length]} castShadow={shadows}>
        {mars ? <dodecahedronGeometry args={[0.8, 0]} /> : <coneGeometry args={[0.85, 1.9, 6]} />}
        <meshStandardMaterial color={mars ? '#7d3420' : '#3f9b4f'} flatShading />
      </instancedMesh>
    </group>
  );
}

const Blocks = memo(function Blocks({ era, shadows }: { era: number; shadows: boolean }) {
  const chunks = useMemo(() => BLOCKS.flatMap((bx) => BLOCKS.map((bz) => ({ key: `${bx},${bz}`, geos: buildBlock(bx, bz, era) }))), [era]);
  const roads = useMemo(() => buildRoads(era === 6), [era]);
  useLayoutEffect(
    () => () => {
      for (const c of chunks) for (const g of Object.values(c.geos)) g?.dispose();
      for (const g of Object.values(roads)) g?.dispose();
    },
    [chunks, roads],
  );
  return (
    <>
      <Chunk geos={roads} shadows={shadows} cast={false} />
      {chunks.map((c) => (
        <Chunk key={c.key} geos={c.geos} shadows={shadows} />
      ))}
    </>
  );
});

export function City({ era, shadows }: { era: number; shadows: boolean }) {
  const mars = era === 6;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow={shadows}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={ERAS[era].ground} roughness={1} />
      </mesh>
      <Blocks era={era} shadows={shadows} />
      <Lamps />
      <Trees mars={mars} shadows={shadows} />
      <Signs era={era} />
      <HitBoxes era={era} />
    </group>
  );
}

export const useEra = () => useGame((st) => st.s.era);
