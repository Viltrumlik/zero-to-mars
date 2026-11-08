import { useEffect, useRef, useState } from 'react';
import { BUILDING_BY_ID, JOB_BY_ID } from '../../../shared/src/content/city.ts';
import { ERAS } from '../../../shared/src/content/eras.ts';
import { BIZ_BY_ID } from '../../../shared/src/content/businesses.ts';
import { QUESTS } from '../../../shared/src/content/quests.ts';
import { age, boostMult, condParts, currentQuest, energyMax, incomePerHour } from '../../../shared/src/engine.ts';
import { duration } from '../../../shared/src/format.ts';
import type { BuildingId, GameState, Lang } from '../../../shared/src/types.ts';
import type { CondPart } from '../../../shared/src/engine.ts';
import { input } from '../input.ts';
import { LOT_BY_ID } from '../scene/cityLayout.ts';
import { dismissTip, finishRoute, fmt, now, openBuilding, pushModal, setTab, useGame, useT, type Tab } from '../store.ts';
import type { StrKey } from '../i18n.ts';
import { Joystick } from './Joystick.tsx';

function useAnimatedNumber(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const d = target - cur.current;
      if (Math.abs(d) < Math.max(0.5, Math.abs(target) * 1e-4)) {
        cur.current = target;
        setV(target);
        return;
      }
      cur.current += d * 0.2;
      setV(cur.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export function clock(s: GameState) {
  const h = Math.floor(s.minute / 60);
  const m = s.minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildingName(id: BuildingId, era: number, lang: Lang) {
  if (id === 'home') return ERAS[era].homeName[lang];
  if (id === 'company') return ERAS[era].companyName[lang];
  return BUILDING_BY_ID[id].name[lang];
}

function Need({ icon, value, max, color, label }: { icon: string; value: number; max: number; color: string; label: string }) {
  const p = Math.max(0, Math.min(1, value / max));
  return (
    <div className={`need ${p < 0.25 ? 'low' : ''}`} title={label}>
      <span>{icon}</span>
      <div className="need-bar">
        <div style={{ width: `${p * 100}%`, background: color }} />
      </div>
      <b>{Math.round(value)}</b>
    </div>
  );
}

function TopBar() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const online = useGame((st) => st.online);
  const era = ERAS[s.era];
  const cash = useAnimatedNumber(s.cash);
  const income = incomePerHour(s) * boostMult(s, now());
  const night = s.minute < 6 * 60 || s.minute >= 20 * 60;
  return (
    <div className="topbar">
      <div className="top-row">
        <button className="profile" onClick={() => setTab('me')}>
          <span className="avatar">{era.icon}</span>
          <span className="profile-text">
            <b>{s.name}</b>
            <small>
              {t('age', { n: age(s) })} · {era.title[lang]}
            </small>
          </span>
        </button>
        <div className="top-right">
          <div className={`cash-chip ${s.cash < 0 ? 'debt' : ''}`}>
            <b>{fmt(cash)}</b>
            {income > 0 && (
              <small>
                +{fmt(income)}
                {t('perHour')}
              </small>
            )}
          </div>
          <button className="icon-btn" aria-label={t('help')} onClick={() => pushModal({ kind: 'help' })}>
            ❓
          </button>
          <button className="icon-btn" aria-label={t('settings')} onClick={() => pushModal({ kind: 'settings' })}>
            ⚙️
          </button>
        </div>
      </div>
      <div className="needs-row">
        <div className="clock-chip">
          {night ? '🌙' : '☀️'} {t('day', { n: s.day })} · <b>{clock(s)}</b>
          {!online && <span title={t('offlineMode')}> 📡</span>}
        </div>
        <Need icon="⚡" value={s.energy} max={energyMax(s)} color="linear-gradient(90deg,#4361ee,#4cc9f0)" label={t('energy')} />
        <Need icon="🍔" value={s.hunger} max={100} color="linear-gradient(90deg,#f77f00,#fcbf49)" label={t('hunger')} />
        <Need icon="❤️" value={s.health} max={100} color="linear-gradient(90deg,#d00000,#ff5d8f)" label={t('health')} />
      </div>
      <QuestTracker />
    </div>
  );
}

function partText(p: CondPart, s: GameState, lang: Lang, t: ReturnType<typeof useT>): string {
  switch (p.key) {
    case 'cash':
    case 'netWorth':
      return `${t(`cond_${p.key}` as StrKey)} ${fmt(Math.max(0, p.have))}/${fmt(p.need)}`;
    case 'skill':
      return `${t(`skill_${p.label}` as StrKey)} ${p.have}/${p.need}`;
    case 'item':
      return `${p.have ? '✅' : '🛒'} ${t(`item_${p.label}` as StrKey)}`;
    case 'job':
      return `${JOB_BY_ID[p.label!].icon} ${JOB_BY_ID[p.label!].name[lang]} ${p.have}/${p.need}`;
    case 'flag':
      return `${p.have ? '✅' : '📍'} ${buildingName(p.label!.slice(2) as BuildingId, s.era, lang)}`;
    case 'bizId':
      return `${BIZ_BY_ID[p.label!].icon} ${BIZ_BY_ID[p.label!].name[lang]} ${p.have}/${p.need}`;
    default:
      return `${t(`cond_${p.key}` as StrKey)} ${Math.floor(p.have)}/${p.need}`;
  }
}

function QuestTracker() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  const q = currentQuest(s);
  if (!q) {
    return s.quest >= QUESTS.length ? <div className="quest-card done">🏆 {t('allDone')}</div> : null;
  }
  const parts = condParts(s, q.cond);
  const target = q.target ? LOT_BY_ID[q.target].door : null;
  const dist = target ? Math.round(Math.hypot(target[0] - input.player.x, target[1] - input.player.z)) : 0;
  return (
    <button className="quest-card" onClick={() => pushModal({ kind: 'quest' })}>
      <div className="quest-head">
        <span className="quest-icon">{q.icon}</span>
        <b>{q.title[lang]}</b>
      </div>
      <div className="quest-parts">
        {parts.map((p, i) => (
          <span key={i} className={p.have >= p.need ? 'ok' : ''}>
            {partText(p, s, lang, t)}
          </span>
        ))}
        {q.cost ? <span>{t('questCost', { m: fmt(q.cost) })}</span> : null}
      </div>
      {q.target && dist > 3 && (
        <div className="quest-dist">
          📍 {buildingName(q.target, s.era, lang)} · {t('distance', { n: dist })}
        </div>
      )}
    </button>
  );
}

function ActionArea() {
  const t = useT();
  const near = useGame((st) => st.near);
  const building = useGame((st) => st.building);
  const route = useGame((st) => st.route);
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const tip = useGame((st) => st.tip);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!route) return;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [route]);

  return (
    <div className="bottom-hud">
      {tip && (
        <div className="tip-bubble">
          <p>{t(`tip_${tip}` as StrKey)}</p>
          <button onClick={dismissTip}>{t('gotIt')}</button>
        </div>
      )}
      {route && (
        <div className="route-hud">
          <span>
            📦 {t('routeHud', { d: route.done, n: route.stops.length })} · ⏱ {duration(route.limitMs - (now() - route.startedAt))}
          </span>
          <button onClick={() => finishRoute()}>{t('routeCancel')}</button>
        </div>
      )}
      {s.event && !route && (
        <button className="event-bubble" onClick={() => pushModal({ kind: 'event' })}>
          <span className="pulse-dot" />📜 {t('eventBubble')}
        </button>
      )}
      {near && !building && !route && (
        <button className="enter-btn" onClick={() => openBuilding(near)}>
          <span>{near === 'company' ? ERAS[s.era].icon : BUILDING_BY_ID[near].icon}</span>
          <span>
            <small>{t('enter')}</small>
            <b>{buildingName(near, s.era, lang)}</b>
          </span>
        </button>
      )}
    </div>
  );
}

const TABS: { id: Tab; icon: string; key: StrKey }[] = [
  { id: 'city', icon: '🏙️', key: 'tabCity' },
  { id: 'me', icon: '🎒', key: 'tabMe' },
  { id: 'biz', icon: '💼', key: 'tabBiz' },
  { id: 'top', icon: '🏆', key: 'tabTop' },
  { id: 'friends', icon: '👥', key: 'tabFriends' },
];

function BottomNav() {
  const t = useT();
  const tab = useGame((st) => st.tab);
  return (
    <nav className="nav">
      {TABS.map((x) => (
        <button key={x.id} className={`nav-btn ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
          <span className="nav-icon">{x.icon}</span>
          <span>{t(x.key)}</span>
        </button>
      ))}
    </nav>
  );
}

function Toast() {
  const toast = useGame((st) => st.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className={`toast ${toast.kind}`}>
      {toast.text}
    </div>
  );
}

function FpsMeter() {
  const on = useGame((st) => st.gfx.fps);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (t: number) => {
      frames++;
      if (t - last >= 500) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  if (!on) return null;
  return <div className={`fps ${fps < 30 ? 'bad' : fps < 50 ? 'mid' : ''}`}>{fps} FPS</div>;
}

export function Hud() {
  const tab = useGame((st) => st.tab);
  const building = useGame((st) => st.building);
  const modal = useGame((st) => st.modals.length > 0);
  const job = useGame((st) => !!st.activeJob);
  const showStick = tab === 'city' && !building && !modal && !job;
  return (
    <>
      <TopBar />
      {tab === 'city' && !building && <ActionArea />}
      {showStick && <Joystick />}
      <BottomNav />
      <FpsMeter />
      <Toast />
    </>
  );
}

export function useBoostLabel() {
  const s = useGame((st) => st.s);
  return s.boost ? duration(s.boost.until - now()) : '';
}

export { input as _input };
