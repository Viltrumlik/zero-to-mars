/* DEV-ONLY standalone harness: http://localhost:5173/minigame.html (not part of the production build). */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { MINIGAME_DURATION, MiniGame, type MiniGameKind } from './index.tsx';

type Lang = 'uz' | 'ru' | 'en';
const KINDS: MiniGameKind[] = ['change', 'memory', 'code', 'scrub'];
const LANGS: Lang[] = ['uz', 'ru', 'en'];

const TITLES: Record<MiniGameKind, Record<Lang, string>> = {
  change: { uz: 'Supermarket kassiri', ru: 'Кассир в супермаркете', en: 'Supermarket cashier' },
  memory: { uz: "Kompyuter ta'miri", ru: 'Ремонт компьютеров', en: 'PC repair' },
  code: { uz: 'Frilans veb-dasturchi', ru: 'Фриланс веб-разработчик', en: 'Freelance web dev' },
  scrub: { uz: 'Avtomoyka', ru: 'Автомойка', en: 'Car wash' },
};

const BOILER: Record<Lang, string> = { uz: 'Qozonxona tozalash', ru: 'Чистка котельной', en: 'Boiler cleaning' };

interface LogRow {
  kind: MiniGameKind;
  d: number;
  lang: Lang;
  seed: number;
  result: string;
}

const qs = new URLSearchParams(location.search);

function Seg<T extends string | number>({ items, value, onPick }: { items: T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <button
          key={String(it)}
          onClick={() => onPick(it)}
          style={{
            padding: '9px 13px',
            borderRadius: 12,
            fontWeight: 800,
            background: it === value ? 'linear-gradient(90deg,#ffd166,#ff8c42)' : 'rgba(255,255,255,0.08)',
            color: it === value ? '#1c1300' : '#f4f6ff',
          }}
        >
          {String(it)}
        </button>
      ))}
    </div>
  );
}

function Harness() {
  const [kind, setKind] = useState<MiniGameKind>((qs.get('kind') as MiniGameKind) || 'change');
  const [d, setD] = useState(Number(qs.get('d')) || 1);
  const [lang, setLang] = useState<Lang>((qs.get('lang') as Lang) || 'en');
  const [seed, setSeed] = useState(Number(qs.get('seed')) || 12345);
  const [running, setRunning] = useState(qs.get('autostart') === '1');
  const [log, setLog] = useState<LogRow[]>([]);

  const finish = (result: string, score?: number) => {
    setRunning(false);
    setLog((l) => [{ kind, d, lang, seed, result }, ...l].slice(0, 12));
    (window as unknown as Record<string, unknown>).__mgResult = { kind, d, lang, seed, result, score };
  };

  const box: CSSProperties = {
    padding: 14,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18 }}>🎮 Mini-game harness</h2>
      <div style={box}>
        <b>Kind</b>
        <Seg items={KINDS} value={kind} onPick={setKind} />
        <b>Difficulty</b>
        <Seg items={[1, 2, 3, 4, 5, 6]} value={d} onPick={setD} />
        <b>Language</b>
        <Seg items={LANGS} value={lang} onPick={setLang} />
        <b>Seed</b>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={seed}
            inputMode="numeric"
            onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '')) >>> 0)}
            style={{ flex: 1, padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: '#12162b', color: '#f4f6ff' }}
          />
          <button
            onClick={() => setSeed((Math.random() * 2 ** 32) >>> 0)}
            style={{ padding: '0 14px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', fontWeight: 800 }}
          >
            🎲
          </button>
        </div>
        <button className="primary big" onClick={() => setRunning(true)}>
          ▶ Play ({MINIGAME_DURATION(d)}s)
        </button>
      </div>
      <div style={box}>
        <b>Results</b>
        {log.length === 0 && <small style={{ color: '#9aa3c7' }}>No runs yet.</small>}
        {log.map((r, i) => (
          <div key={i} id={i === 0 ? 'mg-last-result' : undefined} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span>
              {r.kind} · d{r.d} · {r.lang} · #{r.seed}
            </span>
            <b>{r.result}</b>
          </div>
        ))}
      </div>
      {running && (
        <MiniGame
          kind={kind}
          difficulty={d}
          lang={lang}
          seed={seed}
          title={kind === 'scrub' && d >= 3 ? BOILER[lang] : TITLES[kind][lang]}
          onDone={(s) => finish(`score ${s.toFixed(3)}`, s)}
          onQuit={() => finish('quit')}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
