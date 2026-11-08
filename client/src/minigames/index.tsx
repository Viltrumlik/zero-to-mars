import type { JSX } from 'react';
import { ChangeGame } from './Change.tsx';
import { CodeGame } from './Code.tsx';
import { MemoryGame } from './Memory.tsx';
import { ScrubGame } from './Scrub.tsx';
import type { MiniGameProps } from './types.ts';
import './minigames.css';

export type { MiniGameKind, MiniGameProps } from './types.ts';
export { MINIGAME_DURATION } from './types.ts';

/** Full-screen job mini-game. Ends only when its timer runs out (score via onDone) or the player quits. */
export function MiniGame(props: MiniGameProps): JSX.Element {
  const difficulty = Math.max(1, Math.min(6, Math.round(Number(props.difficulty) || 1)));
  const p = { ...props, difficulty, seed: props.seed >>> 0 };
  const key = `${p.kind}:${difficulty}:${p.seed}`;
  switch (p.kind) {
    case 'memory':
      return <MemoryGame key={key} {...p} />;
    case 'code':
      return <CodeGame key={key} {...p} />;
    case 'scrub':
      return <ScrubGame key={key} {...p} />;
    case 'change':
    default:
      return <ChangeGame key={key} {...p} />;
  }
}
