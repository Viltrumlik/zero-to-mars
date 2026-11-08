export type MiniGameKind = 'change' | 'memory' | 'code' | 'scrub';

export interface MiniGameProps {
  kind: MiniGameKind;
  difficulty: number; // 1..6
  lang: 'uz' | 'ru' | 'en';
  seed: number; // uint32, use for deterministic generation
  title: string; // job name already localized by the caller, shown in the header
  onDone: (score: number) => void; // 0..1, called once after the result screen's Continue button
  onQuit: () => void; // player gave up (shows a confirm first)
}

export const MINIGAME_DURATION = (difficulty: number) => 30 + 4 * difficulty; // seconds
