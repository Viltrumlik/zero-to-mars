import { useEffect, useState } from 'react';
import { ERAS } from '../../../shared/src/content/eras.ts';
import { EVENT_BY_ID } from '../../../shared/src/content/events.ts';
import { JOB_BY_ID } from '../../../shared/src/content/city.ts';
import { DAILY_UNITS, currentQuest, dailyReward, unit } from '../../../shared/src/engine.ts';
import type { EffectSummary, Effects, GameState, Lang } from '../../../shared/src/types.ts';
import type { StrKey } from '../i18n.ts';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import {
  act,
  claimMilestone,
  closeModal,
  finishIntro,
  fmt,
  goTo,
  now,
  pushModal,
  setGfx,
  setPrefs,
  useGame,
  useT,
  type Modal,
  type Preset,
  type TipId,
} from '../store.ts';

type Chip = { text: string; good: boolean };
type TFn = ReturnType<typeof useT>;

function previewChips(e: Effects, s: GameState): Chip[] {
  const out: Chip[] = [];
  if (e.money) out.push({ text: `${e.money > 0 ? '+' : '−'}${fmt(Math.abs(e.money * unit(s)))}`, good: e.money > 0 });
  if (e.cashPct) out.push({ text: `${e.cashPct > 0 ? '+' : '−'}${Math.round(Math.abs(e.cashPct) * 100)}% $`, good: e.cashPct > 0 });
  if (e.rep) out.push({ text: `⭐ ${e.rep > 0 ? '+' : ''}${e.rep}`, good: e.rep > 0 });
  if (e.energy) out.push({ text: `⚡ ${e.energy > 0 ? '+' : ''}${e.energy}`, good: e.energy > 0 });
  if (e.health) out.push({ text: `❤️ ${e.health > 0 ? '+' : ''}${e.health}`, good: e.health > 0 });
  if (e.rd) out.push({ text: `🧪 +${e.rd}`, good: true });
  if (e.boost) out.push({ text: `🔥 x${e.boost.mult} · ${e.boost.minutes}m`, good: true });
  return out;
}

function summaryChips(sm: EffectSummary, t: TFn): Chip[] {
  const out: Chip[] = [];
  if (sm.cash) out.push({ text: `${sm.cash > 0 ? '+' : '−'}${fmt(Math.abs(sm.cash))}`, good: sm.cash > 0 });
  if (Math.round(sm.energy)) out.push({ text: `⚡ ${sm.energy > 0 ? '+' : ''}${Math.round(sm.energy)}`, good: sm.energy > 0 });
  if (Math.round(sm.hunger)) out.push({ text: `🍔 ${sm.hunger > 0 ? '+' : ''}${Math.round(sm.hunger)}`, good: sm.hunger > 0 });
  if (Math.round(sm.health)) out.push({ text: `❤️ ${sm.health > 0 ? '+' : ''}${Math.round(sm.health)}`, good: sm.health > 0 });
  if (sm.rep) out.push({ text: `⭐ ${sm.rep > 0 ? '+' : ''}${Math.round(sm.rep)}`, good: sm.rep > 0 });
  for (const [k, v] of Object.entries(sm.xp)) if (v) out.push({ text: `${t(`skill_${k}` as StrKey)} +${v}`, good: true });
  if (sm.rd) out.push({ text: `🧪 +${sm.rd}`, good: true });
  if (sm.boost) out.push({ text: `🔥 x${sm.boost.mult} · ${sm.boost.minutes}m`, good: true });
  return out;
}

function Chips({ chips }: { chips: Chip[] }) {
  return (
    <div className="chips">
      {chips.map((c, i) => (
        <span key={i} className={`fx ${c.good ? 'good' : 'bad'}`}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

function Card({ icon, children, wide }: { icon?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal ${wide ? 'wide' : ''}`}>
        {icon && <div className="modal-icon">{icon}</div>}
        {children}
      </div>
    </div>
  );
}

const LANG_LABEL: Record<Lang, string> = { uz: "🇺🇿 O'zbek", ru: '🇷🇺 Русский', en: '🇬🇧 English' };

function LangPicker() {
  const lang = useGame((st) => st.lang);
  return (
    <div className="seg">
      {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setPrefs({ lang: l })}>
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- story ---

const INTRO: { icon: string; title: StrKey; text: StrKey }[] = [
  { icon: '🏘️', title: 'introTitle1', text: 'introText1' },
  { icon: '🖥️', title: 'introTitle2', text: 'introText2' },
  { icon: '🚀', title: 'introTitle3', text: 'introText3' },
  { icon: '🔥', title: 'introTitle4', text: 'introText4' },
];

function useTypewriter(text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 2)), 22);
    return () => clearInterval(id);
  }, [text]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

function Intro() {
  const t = useT();
  const s = useGame((st) => st.s);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.name === 'Founder' ? '' : s.name);
  const slide = INTRO[step];
  const tw = useTypewriter(slide ? t(slide.text) : '');
  if (!slide) {
    return (
      <div className="story-backdrop">
        <div className="story-card">
          <div className="story-icon">🧒</div>
          <h1 className="title-xl">{t('appName')}</h1>
          <LangPicker />
          <div className="chip difficulty">{t('difficulty')}</div>
          <label className="field">
            <span>{t('yourName')}</span>
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Elon" />
          </label>
          <button
            className="primary big"
            onClick={() => {
              sfx.success();
              haptic('success');
              finishIntro(name);
            }}
          >
            {t('start')} ✨
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="story-backdrop" onClick={() => !tw.done && tw.finish()}>
      <div className="story-card">
        <div className="story-dots">
          {INTRO.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div className="story-icon">{slide.icon}</div>
        <h2>{t(slide.title)}</h2>
        <p className="story">{tw.shown}</p>
        <div className="story-actions">
          <button className="ghost" onClick={() => setStep(INTRO.length)}>
            {t('skip')}
          </button>
          <button
            className="primary"
            onClick={(e) => {
              e.stopPropagation();
              haptic('select');
              setStep(step + 1);
            }}
          >
            {t('next')} →
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestDialog() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const q = currentQuest(s);
  const tw = useTypewriter(q ? q.story[lang] : '');
  useEffect(() => {
    if (!q) closeModal();
  }, [q]);
  if (!q) return null;
  return (
    <Card icon={q.icon} wide>
      <div className="eyebrow">{t('newQuest')}</div>
      <h2>{q.title[lang]}</h2>
      <p className="story" onClick={tw.finish}>
        {tw.shown}
      </p>
      <div className="row-actions">
        {q.target && (
          <button
            className="ghost"
            onClick={() => {
              closeModal();
              goTo(q.target!);
            }}
          >
            📍 {t('showWay')}
          </button>
        )}
        <button className="primary" onClick={closeModal}>
          {t('gotIt')}
        </button>
      </div>
    </Card>
  );
}

function Milestone() {
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const ms = ERAS[s.era].milestone;
  if (!ms) return null;
  return (
    <Card icon="📖" wide>
      <h2>{ms.title[lang]}</h2>
      <p className="story">{ms.text[lang]}</p>
      {ms.cashBonus > 0 && <div className="big-money">+{fmt(ms.cashBonus)}</div>}
      <button className="primary big" onClick={claimMilestone}>
        {ms.button[lang]}
      </button>
    </Card>
  );
}

function EraIntro({ m }: { m: Extract<Modal, { kind: 'eraIntro' }> }) {
  const t = useT();
  const lang = useGame((st) => st.lang);
  const era = ERAS[m.era];
  return (
    <Card icon={era.icon}>
      <div className="eyebrow">
        {t('newChapter')} {m.era + 1}/{ERAS.length}
      </div>
      <h1 className="title-xl">{era.title[lang]}</h1>
      <p>{era.subtitle[lang]}</p>
      {era.rent > 0 && <div className="chip">🏠 {t('rentInfo', { m: fmt(era.rent) })}</div>}
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

// ------------------------------------------------------------- results ---

function JobResult({ m }: { m: Extract<Modal, { kind: 'jobResult' }> }) {
  const t = useT();
  const lang = useGame((st) => st.lang);
  const job = JOB_BY_ID[m.jobId];
  const pct = Math.round(m.score * 100);
  const verdict = m.score >= 0.8 ? 'verdictGreat' : m.score >= 0.3 ? 'verdictOk' : 'verdictBad';
  return (
    <Card icon={job.icon}>
      <div className="eyebrow">{t('jobDone')}</div>
      <h2>{job.name[lang]}</h2>
      <div className="score-ring" style={{ ['--p' as string]: pct }}>
        <b>{pct}%</b>
        <small>{t('score')}</small>
      </div>
      <p className={m.score >= 0.3 ? '' : 'bad-text'}>{t(verdict)}</p>
      <div className="big-money">+{fmt(m.summary.cash)}</div>
      <Chips chips={summaryChips({ ...m.summary, cash: 0 }, t)} />
      {m.summary.levelUps.map((sk, i) => (
        <div key={i} className="level-up">
          🎉 {t('levelUp', { skill: t(`skill_${sk}` as StrKey), n: '↑' })}
        </div>
      ))}
      <p className="hint">⏱ {t('timePassed', { h: Math.round(m.summary.minutes / 60) })}</p>
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

function SleepReport({ m }: { m: Extract<Modal, { kind: 'sleep' }> }) {
  const t = useT();
  const s = useGame((st) => st.s);
  return (
    <Card icon="🌅">
      <h2>{t('morning', { n: m.day })}</h2>
      <p>{t('morningText')}</p>
      <Chips chips={summaryChips(m.summary, t)} />
      {m.summary.cash < 0 && <p className="hint">{t('rentPaid')}</p>}
      {s.cash < 0 && <p className="bad-text">{t('tip_debt')}</p>}
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

function Hospital({ m }: { m: Extract<Modal, { kind: 'hospital' }> }) {
  const t = useT();
  return (
    <Card icon="🏥">
      <h2 className="bad-text">{t('hospitalTitle')}</h2>
      <p>{t('hospitalText')}</p>
      <div className="big-money bad-text">−{fmt(m.bill)}</div>
      <p className="hint">{t('hospitalHint')}</p>
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

function Offline({ m }: { m: Extract<Modal, { kind: 'offline' }> }) {
  const t = useT();
  return (
    <Card icon="💰">
      <h2>{t('offlineTitle')}</h2>
      <p>{t('offlineText')}</p>
      <div className="big-money">+{fmt(m.earned)}</div>
      <button
        className="primary big"
        onClick={() => {
          sfx.coins();
          closeModal();
        }}
      >
        {t('collect')}
      </button>
    </Card>
  );
}

function Daily() {
  const t = useT();
  const s = useGame((st) => st.s);
  const reward = dailyReward(s, now());
  useEffect(() => {
    if (!reward) closeModal();
  }, [reward]);
  if (!reward) return null;
  return (
    <Card icon="🎁">
      <h2>{t('dailyTitle')}</h2>
      <p>{t('dailyText')}</p>
      <div className="days">
        {DAILY_UNITS.map((_, i) => (
          <div key={i} className={`day ${i + 1 < reward.streak ? 'past' : i + 1 === reward.streak ? 'now' : ''}`}>
            <small>{t('dailyDay', { n: i + 1 })}</small>
            <span>{i + 1 < reward.streak ? '✅' : i === 6 ? '💎' : '🪙'}</span>
          </div>
        ))}
      </div>
      <div className="big-money">+{fmt(reward.amount)}</div>
      <button
        className="primary big"
        onClick={() => {
          if (act({ t: 'daily' }).ok) sfx.coins();
          closeModal();
        }}
      >
        {t('claim')}
      </button>
    </Card>
  );
}

function EventCard() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const ev = s.event ? EVENT_BY_ID[s.event] : null;
  useEffect(() => {
    if (!ev) closeModal();
  }, [ev]);
  if (!ev) return null;
  const choose = (c: number) => {
    const r = act({ t: 'choose', id: ev.id, c });
    closeModal();
    if (!r.ok) return;
    if (r.win === true) sfx.success();
    else if (r.win === false) sfx.error();
    pushModal({
      kind: 'outcome',
      icon: r.win === undefined ? ev.icon : r.win ? '🍀' : '🌧️',
      title: t(r.win === undefined ? 'outcomeDone' : r.win ? 'outcomeWin' : 'outcomeLose'),
      text: ev.choices[c].label[lang],
      win: r.win,
      summary: r.summary,
    });
  };
  return (
    <Card icon={ev.icon} wide>
      <h2>{ev.title[lang]}</h2>
      <p>{ev.text[lang]}</p>
      <div className="choices">
        {ev.choices.map((c, i) => (
          <button key={i} className="choice" onClick={() => choose(i)}>
            <b>{c.label[lang]}</b>
            {c.risk ? (
              <>
                <span className="risk">🎲 {t('riskChance', { p: Math.round(c.risk.chance * 100) })}</span>
                <Chips chips={[...previewChips(c.risk.win, s), ...previewChips(c.risk.lose, s).map((x) => ({ ...x, good: false }))]} />
              </>
            ) : (
              <Chips chips={previewChips(c.effects ?? {}, s)} />
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Outcome({ m }: { m: Extract<Modal, { kind: 'outcome' }> }) {
  const t = useT();
  return (
    <Card icon={m.icon}>
      <h2 className={m.win === false ? 'bad-text' : m.win ? 'good-text' : ''}>{m.title}</h2>
      {m.text && <p>{m.text}</p>}
      {m.summary && <Chips chips={summaryChips(m.summary, t)} />}
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

function Opt<V extends string | number | boolean>({ label, value, options, onChange }: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg">
        {options.map(([v, text]) => (
          <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphicsSettings() {
  const t = useT();
  const g = useGame((st) => st.gfx);
  const presets: Preset[] = ['low', 'medium', 'high', 'ultra'];
  return (
    <div className="gfx-box">
      <div className="field">
        <span>
          🎨 {t('graphics')} {g.preset === 'custom' && <em className="muted">· {t('gfxCustom')}</em>}
        </span>
        <div className="seg">
          {presets.map((p) => (
            <button key={p} className={g.preset === p ? 'on' : ''} onClick={() => setGfx({ preset: p })}>
              {t(`gfx_${p}` as StrKey)}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">{t('gfxHint')}</p>
      <Opt label={t('gfxShadows')} value={g.shadows} options={[[0, t('optOff')], [1, t('optLow')], [2, t('optHigh')]]} onChange={(v) => setGfx({ shadows: v })} />
      <Opt label={t('gfxEffects')} value={g.bloom} options={[[false, t('off')], [true, t('on')]]} onChange={(v) => setGfx({ bloom: v })} />
      <Opt label={t('gfxRes')} value={g.res} options={[[0.7, '70%'], [1, '100%'], [1.5, '150%'], [2, '200%']]} onChange={(v) => setGfx({ res: v })} />
      <Opt label={t('gfxDistance')} value={g.distance} options={[[0, t('optNear')], [1, t('optMid')], [2, t('optFar')]]} onChange={(v) => setGfx({ distance: v })} />
      <Opt label={t('gfxTraffic')} value={g.traffic} options={[[0, t('optFew')], [1, t('optNormal')], [2, t('optMany')]]} onChange={(v) => setGfx({ traffic: v })} />
      <Opt label={t('gfxAuto')} value={g.auto} options={[[true, t('on')], [false, t('off')]]} onChange={(v) => setGfx({ auto: v })} />
      <Opt label="FPS" value={g.fps} options={[[true, t('on')], [false, t('off')]]} onChange={(v) => setGfx({ fps: v })} />
    </div>
  );
}

function Settings() {
  const t = useT();
  const s = useGame((st) => st.s);
  const sound = useGame((st) => st.sound);
  const [name, setName] = useState(s.name);
  return (
    <Card icon="⚙️">
      <h2>{t('settings')}</h2>
      <label className="field">
        <span>{t('yourName')}</span>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>{t('language')}</span>
        <LangPicker />
      </div>
      <GraphicsSettings />
      <div className="field">
        <span>{t('sound')}</span>
        <div className="seg">
          <button className={sound ? 'on' : ''} onClick={() => setPrefs({ sound: true })}>
            🔊 {t('on')}
          </button>
          <button className={!sound ? 'on' : ''} onClick={() => setPrefs({ sound: false })}>
            🔇 {t('off')}
          </button>
        </div>
      </div>
      <button
        className="primary big"
        onClick={() => {
          if (name.trim() && name !== s.name) act({ t: 'name', name });
          closeModal();
        }}
      >
        {t('save')}
      </button>
    </Card>
  );
}

const HELP_TIPS: TipId[] = ['move', 'quest', 'enter', 'needs', 'route', 'hungry', 'tired', 'late', 'sick', 'debt', 'biz'];

function Help() {
  const t = useT();
  return (
    <Card icon="📘" wide>
      <h2>{t('helpTitle')}</h2>
      <div className="help-list">
        {HELP_TIPS.map((id) => (
          <p key={id}>{t(`tip_${id}` as StrKey)}</p>
        ))}
      </div>
      <button className="primary big" onClick={closeModal}>
        {t('gotIt')}
      </button>
    </Card>
  );
}

function Billionaire() {
  const t = useT();
  useEffect(() => {
    useGame.setState((st) => ({ eraFx: st.eraFx + 1 }));
    sfx.success();
  }, []);
  return (
    <Card icon="💎">
      <h1 className="title-xl gold-text">{t('billionaireTitle')}</h1>
      <p>{t('billionaireText')}</p>
      <button className="primary big" onClick={closeModal}>
        {t('continue')}
      </button>
    </Card>
  );
}

export function ModalHost() {
  const m = useGame((st) => st.modals[0]);
  if (!m) return null;
  switch (m.kind) {
    case 'intro': return <Intro />;
    case 'quest': return <QuestDialog />;
    case 'milestone': return <Milestone />;
    case 'eraIntro': return <EraIntro m={m} />;
    case 'event': return <EventCard />;
    case 'outcome': return <Outcome m={m} />;
    case 'jobResult': return <JobResult m={m} />;
    case 'sleep': return <SleepReport m={m} />;
    case 'hospital': return <Hospital m={m} />;
    case 'offline': return <Offline m={m} />;
    case 'daily': return <Daily />;
    case 'settings': return <Settings />;
    case 'help': return <Help />;
    case 'billionaire': return <Billionaire />;
  }
}
