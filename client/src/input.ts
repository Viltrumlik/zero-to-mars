/**
 * Mutable, non-reactive input state shared between the DOM joystick,
 * the keyboard and the 3D player controller (read every frame).
 */
import type { BuildingId } from '../../shared/src/types.ts';
import { SPAWN } from './scene/cityLayout.ts';

export const input = {
  joy: { x: 0, y: 0 },
  keys: new Set<string>(),
  /** Remaining waypoints of a tap-to-walk path. */
  path: [] as [number, number][],
  /** Building to open when the path finishes. */
  arriveAt: null as BuildingId | null,
  /** Live player position (written by the player controller). */
  player: { x: SPAWN[0], z: SPAWN[1], heading: Math.PI },
  zoom: 1,
};

const KEYMAP: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

let attached = false;
export function attachKeyboard() {
  if (attached) return;
  attached = true;
  const isTyping = () => document.activeElement?.tagName === 'INPUT';
  window.addEventListener('keydown', (e) => {
    if (!isTyping() && KEYMAP[e.code]) {
      input.keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  window.addEventListener(
    'wheel',
    (e) => {
      input.zoom = Math.min(2.4, Math.max(0.55, input.zoom * (e.deltaY > 0 ? 1.08 : 0.92)));
    },
    { passive: true },
  );
}

/** Desired movement in world space (x right, z down-screen), length ≤ 1. */
export function moveVector(): { x: number; z: number } {
  let x = input.joy.x;
  let z = input.joy.y;
  for (const k of input.keys) {
    x += KEYMAP[k][0];
    z += KEYMAP[k][1];
  }
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
}
