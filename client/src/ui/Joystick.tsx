import { useRef, useState } from 'react';
import { input } from '../input.ts';

const RADIUS = 46;

/** Virtual thumb-stick (bottom-left). Writes straight into the shared input state. */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const r = base.current!.getBoundingClientRect();
    let x = clientX - (r.left + r.width / 2);
    let y = clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > RADIUS) {
      x = (x / len) * RADIUS;
      y = (y / len) * RADIUS;
    }
    setKnob({ x, y });
    const m = Math.min(1, len / RADIUS);
    const dead = m < 0.15 ? 0 : 1;
    input.joy.x = (x / RADIUS) * dead;
    input.joy.y = (y / RADIUS) * dead;
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.joy.x = 0;
    input.joy.y = 0;
  };

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
