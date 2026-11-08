/**
 * Static city map: a 5×5 grid of blocks separated by roads. The inner 3×3 is
 * the old town where the story starts; the outer ring holds suburbs, a lake
 * park, a forest, an industrial zone, the university campus and the airport.
 * Every lot has a footprint (collisions), a door on the sidewalk (interaction)
 * and either a building id or a decor kind.
 */
import type { BuildingId } from '../../../shared/src/types.ts';

export const ROADS = [-65, -39, -13, 13, 39, 65];
export const ROAD_W = 6;
export const BLOCKS = [-52, -26, 0, 26, 52];
export const BLOCK_HALF = 10;
export const CITY_HALF = 74;

export type DecorKind = 'house' | 'apartment' | 'tower' | 'shop' | 'warehouse' | 'park' | 'pond' | 'forest';

export interface Lot {
  id: BuildingId | null;
  decor?: DecorKind;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Door faces +z (1) or -z (-1). */
  face: 1 | -1;
  door: [number, number];
  seed: number;
  /** Block centre this lot belongs to (used to chunk geometry). */
  bx: number;
  bz: number;
}

let seedCounter = 1;
function lot(id: BuildingId | null, bx: number, bz: number, ox: number, oz: number, w = 7, d = 7, decor?: DecorKind): Lot {
  const x = bx + ox;
  const z = bz + oz;
  const face: 1 | -1 = oz >= 0 ? 1 : -1;
  const door: [number, number] = [x, z + face * (d / 2 + 0.9)];
  return { id, decor, x, z, w, d, face, door, seed: seedCounter++, bx, bz };
}

const EXPLICIT: Lot[] = [
  // old town north-west: home life
  lot('home', -26, -26, -5, -5),
  lot('library', -26, -26, 5, -5),
  lot('gym', -26, -26, -5, 5),
  lot('hospital', -26, -26, 5, 5),
  // old town north: food and first jobs
  lot('market', 0, -26, -5, -5),
  lot('cafe', 0, -26, 5, -5),
  lot('kiosk', 0, -26, -5, 5, 4, 4),
  lot('bikeshop', 0, -26, 5, 5),
  // old town north-east: tech and couriers
  lot('electronics', 26, -26, -5, -5),
  lot('netcafe', 26, -26, 5, -5),
  lot('post', 26, -26, -5, 5),
  lot('carwash', 26, -26, 5, 5, 7, 6),
  // city park
  lot(null, -26, 0, 0, 0, 4, 4, 'park'),
  // downtown
  lot('bizcenter', 0, 0, -5, -5),
  lot('bank', 0, 0, 5, -5),
  lot(null, 0, 0, -5, 5, 6, 6, 'tower'),
  lot(null, 0, 0, 5, 5, 6, 6, 'tower'),
  // east high street
  lot('pizzeria', 26, 0, -5, -5),
  lot(null, 26, 0, 5, -5, 6, 6, 'shop'),
  lot(null, 26, 0, -5, 5, 6, 6, 'apartment'),
  lot(null, 26, 0, 5, 5, 6, 6, 'shop'),
  // your company
  lot('company', -26, 26, 0, 0, 13, 11),
  // outer ring
  lot('university', 52, 0, 0, 0, 14, 11),
  lot('boiler', 52, 26, -5, -5),
  lot(null, 52, 26, 5, -5, 7, 6, 'warehouse'),
  lot(null, 52, 26, -5, 5, 7, 6, 'warehouse'),
  lot(null, 52, 26, 5, 5, 7, 6, 'warehouse'),
  lot('airport', 52, 52, 0, 0, 15, 11),
  lot('launchpad', 52, 52, 0, 0, 8, 8),
  lot(null, -52, 0, 0, 0, 10, 8, 'pond'),
  lot(null, -52, 52, 0, 0, 2, 2, 'forest'),
];

function district(bx: number, bz: number): DecorKind {
  if (bx === 26 && bz === 26) return 'tower';
  if (bz === -52 || bx === -52) return 'house';
  if (bx === 52) return 'shop';
  return 'apartment';
}

export const LOTS: Lot[] = (() => {
  const used = new Set(EXPLICIT.map((l) => `${l.bx},${l.bz}`));
  const out = [...EXPLICIT];
  for (const bx of BLOCKS)
    for (const bz of BLOCKS) {
      if (used.has(`${bx},${bz}`)) continue;
      const kind = district(bx, bz);
      for (const [ox, oz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) out.push(lot(null, bx, bz, ox, oz, 6, 6, kind));
    }
  return out;
})();

export const LOT_BY_ID = Object.fromEntries(LOTS.filter((l) => l.id).map((l) => [l.id, l])) as Record<BuildingId, Lot>;
export const SPAWN: [number, number] = [LOT_BY_ID.home.door[0] + 1.5, LOT_BY_ID.home.door[1] - 1.5];
export const LAUNCH_POS: [number, number, number] = [LOT_BY_ID.launchpad.x, 0, LOT_BY_ID.launchpad.z];

/** Whether a lot is physically present in an era (airport and launch pad share a block). */
export function lotPresent(l: Lot, era: number): boolean {
  if (l.id === 'airport') return era <= 1;
  if (l.id === 'launchpad') return era >= 2;
  return l.decor !== 'forest';
}

// ------------------------------------------------------------ collisions ---

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const boxCache = new Map<number, Box[]>();
export function solidBoxes(era: number): Box[] {
  let boxes = boxCache.get(era);
  if (!boxes) {
    boxes = LOTS.filter((l) => lotPresent(l, era)).map((l) => ({ minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 }));
    boxCache.set(era, boxes);
  }
  return boxes;
}

export function blocked(boxes: Box[], x: number, z: number, r = 0.45): boolean {
  if (Math.abs(x) > CITY_HALF || Math.abs(z) > CITY_HALF) return true;
  for (const b of boxes) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
  return false;
}

// ----------------------------------------------------------- pathfinding ---

const N = CITY_HALF * 2 + 1;
const idx = (i: number, j: number) => j * N + i;
const toCell = (v: number) => Math.max(0, Math.min(N - 1, Math.round(v + CITY_HALF)));
const toWorld = (c: number) => c - CITY_HALF;

const gridCache = new Map<number, Uint8Array>();
function navGrid(era: number): Uint8Array {
  let grid = gridCache.get(era);
  if (!grid) {
    const boxes = solidBoxes(era);
    grid = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[idx(i, j)] = blocked(boxes, toWorld(i), toWorld(j), 0.6) ? 1 : 0;
    gridCache.set(era, grid);
  }
  return grid;
}

/** Binary min-heap of cell indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastKey = k.pop()!;
    if (a.length) {
      a[0] = lastItem;
      k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A* over a 1-unit grid; returns world-space waypoints (turning points only), or [] when unreachable. */
export function findPath(era: number, from: [number, number], to: [number, number]): [number, number][] {
  const grid = navGrid(era);
  const si = toCell(from[0]);
  const sj = toCell(from[1]);
  const gi = toCell(to[0]);
  const gj = toCell(to[1]);
  const start = idx(si, sj);
  const goal = idx(gi, gj);
  const g = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - gi);
    const dz = Math.abs(j - gj);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(si, sj));
  let found = false;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    closed[cur] = 1;
    const ci = cur % N;
    const cj = (cur - ci) / N;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = idx(ni, nj);
        if ((grid[n] && n !== goal) || closed[n]) continue;
        if (di && dj && (grid[idx(ci + di, cj)] || grid[idx(ci, cj + dj)])) continue;
        const cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          came[n] = cur;
          open.push(n, cost + h(ni, nj));
        }
      }
  }
  if (!found) return [];
  const cells: [number, number][] = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push([toWorld(c % N), toWorld(Math.floor(c / N))]);
  cells.reverse();
  const out: [number, number][] = [];
  for (let k = 1; k < cells.length; k++) {
    const prev = cells[k - 1];
    const cur = cells[k];
    const next = cells[k + 1];
    if (!next || cur[0] - prev[0] !== next[0] - cur[0] || cur[1] - prev[1] !== next[1] - cur[1]) out.push(cur);
  }
  if (out.length) out[out.length - 1] = to;
  return out;
}

// ------------------------------------------------- stops, lanes, walkers ---

/** Sidewalk points used as delivery addresses for route jobs. */
export const DROP_POINTS: [number, number][] = (() => {
  const pts: [number, number][] = LOTS.filter((l) => l.decor !== 'forest' && l.decor !== 'pond' && l.decor !== 'park').map((l) => l.door);
  for (const bx of BLOCKS) for (const bz of BLOCKS) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([bx + sx * 9.4, bz + sz * 9.4]);
  return pts;
})();

/** Traffic lanes along every road, both directions. */
export const LANES: { axis: 'x' | 'z'; c: number; dir: 1 | -1 }[] = ROADS.flatMap((c) => [
  { axis: 'z' as const, c: c - 1.5, dir: 1 as const },
  { axis: 'z' as const, c: c + 1.5, dir: -1 as const },
  { axis: 'x' as const, c: c - 1.5, dir: -1 as const },
  { axis: 'x' as const, c: c + 1.5, dir: 1 as const },
]);

/** Block centres; pedestrians walk around them on the sidewalk. */
export const SIDEWALKS: [number, number][] = BLOCKS.flatMap((bx) => BLOCKS.map((bz) => [bx, bz] as [number, number]));

/** Where trees grow (parks, forest, city edge, house gardens). */
export const TREE_POINTS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  const rnd = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    out.push([-26 + Math.cos(a) * (7 + (i % 3)), 0 + Math.sin(a) * (7 + (i % 3)), 1]);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    out.push([-52 + Math.cos(a) * 8.6, Math.sin(a) * 8.2, 1.1]);
  }
  for (let i = 0; i < 40; i++) out.push([-52 + (rnd(i) - 0.5) * 18, 52 + (rnd(i + 99) - 0.5) * 18, 0.9 + rnd(i + 7) * 0.6]);
  for (let t = -CITY_HALF; t <= CITY_HALF; t += 5) {
    for (const edge of [-CITY_HALF + 2, CITY_HALF - 2]) {
      if (ROADS.some((r) => Math.abs(r - t) < 5)) continue;
      out.push([t, edge, 1.2]);
      out.push([edge, t, 1.2]);
    }
  }
  for (const l of LOTS) if (l.decor === 'house') out.push([l.x + (l.seed % 2 ? 3.3 : -3.3), l.z - l.face * 2.5, 0.8]);
  return out;
})();
