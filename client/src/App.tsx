import { Component, useEffect, type ReactNode } from 'react';
import { JOB_BY_ID } from '../../shared/src/content/city.ts';
import { World } from './scene/World.tsx';
import { Hud } from './ui/Hud.tsx';
import { Panels } from './ui/Panels.tsx';
import { BuildingPanel } from './ui/BuildingPanel.tsx';
import { ModalHost } from './ui/Modals.tsx';
import { MiniGame } from './minigames/index.tsx';
import { attachKeyboard } from './input.ts';
import { boot, finishMiniGame, quitMiniGame, useGame } from './store.ts';

/** If WebGL fails (very old phones), keep the game playable without the 3D scene. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="scene-fallback">🏙️</div> : this.props.children;
  }
}

function JobHost() {
  const job = useGame((st) => st.activeJob);
  const lang = useGame((st) => st.lang);
  if (!job) return null;
  return (
    <MiniGame
      kind={job.kind}
      difficulty={job.difficulty}
      lang={lang}
      seed={job.seed}
      title={JOB_BY_ID[job.id].name[lang]}
      onDone={finishMiniGame}
      onQuit={quitMiniGame}
    />
  );
}

export function App() {
  const ready = useGame((st) => st.ready);
  const cinematic = useGame((st) => st.cinematic);
  useEffect(() => {
    attachKeyboard();
    void boot();
  }, []);
  return (
    <div className="app">
      <div className="scene">
        <SceneBoundary>
          <World />
        </SceneBoundary>
      </div>
      {ready ? (
        <>
          {!cinematic && <Hud />}
          <BuildingPanel />
          <Panels />
          <JobHost />
          <ModalHost />
        </>
      ) : (
        <div className="splash">
          <div className="splash-planet" />
          <div className="splash-title">Noldan Marsgacha</div>
        </div>
      )}
    </div>
  );
}
