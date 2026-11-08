import { BUILDING_BY_ID, JOBS, SHOP, STUDIES } from '../../../shared/src/content/city.ts';
import { ERAS } from '../../../shared/src/content/eras.ts';
import {
  currentQuest,
  isOpen,
  jobBlocker,
  jobPayMult,
  launchBlocker,
  launchChance,
  launchCost,
  shopBlocker,
  shopPrice,
  sleepBlocker,
  studyBlocker,
} from '../../../shared/src/engine.ts';
import { duration } from '../../../shared/src/format.ts';
import type { MiniGameKind } from '../../../shared/src/types.ts';
import type { StrKey } from '../i18n.ts';
import {
  closeBuilding,
  explain,
  fmt,
  launchRocket,
  now,
  setTab,
  simpleAct,
  sleep,
  startJob,
  useGame,
  useT,
} from '../store.ts';
import { buildingName } from './Hud.tsx';

const GAME_ICON: Record<MiniGameKind, string> = { route: '🏃', change: '🧮', memory: '🧠', code: '⌨️', scrub: '🧽' };

function Row({
  icon,
  title,
  sub,
  action,
  blocker,
  onClick,
  highlight,
}: {
  icon: string;
  title: string;
  sub: React.ReactNode;
  action: React.ReactNode;
  blocker?: string | null;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <div className={`row ${blocker ? 'locked' : ''} ${highlight ? 'highlight' : ''}`}>
      <div className="tile">{icon}</div>
      <div className="row-main">
        <b>{title}</b>
        <small>{sub}</small>
        {blocker && <small className="blocker">🔒 {blocker}</small>}
      </div>
      <button className={`buy-btn ${blocker ? 'poor' : ''}`} disabled={!!blocker} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

export function BuildingPanel() {
  const t = useT();
  const id = useGame((st) => st.building);
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  if (!id) return null;
  const b = BUILDING_BY_ID[id];
  const open = isOpen(b, s.minute);
  const inEra = (eras: [number, number]) => s.era >= eras[0] && s.era <= eras[1];
  const jobs = JOBS.filter((j) => j.building === id && inEra(j.eras));
  const shop = SHOP.filter((x) => x.building === id && inEra(x.eras));
  const studies = STUDIES.filter((x) => x.building === id && inEra(x.eras));
  const q = currentQuest(s);
  const blockerText = (err: string | null) => (err ? explain(err) : null);
  const empty = !jobs.length && !shop.length && !studies.length && !['home', 'launchpad', 'bizcenter', 'airport'].includes(id);

  return (
    <div className="sheet building-sheet">
      <div className="sheet-head">
        <div className="bld-title">
          <span className="bld-icon">{id === 'company' ? ERAS[s.era].icon : b.icon}</span>
          <div>
            <h2>{buildingName(id, s.era, lang)}</h2>
            <div className="sheet-sub">
              <span className={open ? 'good-text' : 'bad-text'}>{open ? t('open') : t('closed')}</span> ·{' '}
              {b.open[0] === 0 && b.open[1] === 24 ? '24/7' : t('hours', { from: b.open[0], to: b.open[1] })}
            </div>
          </div>
        </div>
        <button className="icon-btn" onClick={closeBuilding} aria-label={t('close')}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <p className="hint">{b.desc[lang]}</p>
        {q?.target === id && (
          <div className="quest-here">
            {t('questHere')}: <b>{q.title[lang]}</b>
          </div>
        )}

        {id === 'home' && (
          <>
            <Row
              icon="🛏️"
              title={t('sleepBtn')}
              sub={ERAS[s.era].rent ? t('rentInfo', { m: fmt(ERAS[s.era].rent) }) : t('sleepHint')}
              action={<b>{t('sleepBtn')}</b>}
              blocker={blockerText(sleepBlocker(s, now()))}
              onClick={sleep}
            />
            <Row icon="🛋️" title={t('restBtn')} sub="⚡ +12" action={<b>{t('restBtn').split(' ')[0]}</b>} onClick={() => simpleAct({ t: 'rest' })} />
          </>
        )}

        {jobs.length > 0 && <h3 className="section">💼 {t('jobs')}</h3>}
        {jobs.map((j) => (
          <Row
            key={j.id}
            icon={j.icon}
            title={j.name[lang]}
            highlight={q?.cond.job?.[0] === j.id}
            sub={
              <>
                {GAME_ICON[j.game]} {t('hoursShort', { n: j.hours })} · ⚡{j.energy} · 🍔{j.hunger}
              </>
            }
            action={
              <>
                <small>{t('work')}</small>
                <b>{t('payUpTo', { m: fmt(Math.round(j.pay * jobPayMult(s, j))) })}</b>
              </>
            }
            blocker={blockerText(jobBlocker(s, j))}
            onClick={() => startJob(j.id)}
          />
        ))}

        {studies.length > 0 && <h3 className="section">📚 {t('study')}</h3>}
        {studies.map((x) => (
          <Row
            key={x.id}
            icon={x.icon}
            title={x.name[lang]}
            highlight={!!q?.cond.skills?.[x.skill]}
            sub={
              <>
                {t('xpGain', { n: x.xp })} {t(`skill_${x.skill}` as StrKey)} · {t('hoursShort', { n: x.hours })} · ⚡{x.energy}
              </>
            }
            action={
              <>
                <small>{t('learn')}</small>
                <b>{x.price ? fmt(x.price) : t('free')}</b>
              </>
            }
            blocker={blockerText(studyBlocker(s, x.id))}
            onClick={() => simpleAct({ t: 'study', id: x.id })}
          />
        ))}

        {shop.length > 0 && <h3 className="section">🛒 {t('shop')}</h3>}
        {shop.map((x) => {
          const price = shopPrice(s, x.id);
          return (
            <Row
              key={x.id}
              icon={x.icon}
              title={x.name[lang]}
              highlight={q?.cond.item === x.item && !!x.item}
              sub={x.desc[lang]}
              action={
                <>
                  <small>{x.item ? t('buy') : t('eat')}</small>
                  <b>{price ? fmt(price) : t('free')}</b>
                </>
              }
              blocker={blockerText(shopBlocker(s, x.id))}
              onClick={() => simpleAct({ t: 'buy', id: x.id })}
            />
          );
        })}

        {id === 'launchpad' && (
          <Row
            icon="🚀"
            title={t('launch')}
            sub={`${fmt(launchCost(s))} · ${t('launchChance', { p: Math.round(launchChance(s) * 100) })}`}
            action={<b>{t('launch').split(' ')[0]}</b>}
            blocker={
              launchBlocker(s, now()) === 'cooldown'
                ? t('launchCooldown', { t: duration(s.nextLaunchAt - now()) })
                : blockerText(launchBlocker(s, now()))
            }
            onClick={launchRocket}
          />
        )}
        {id === 'bizcenter' && (
          <button className="primary big" onClick={() => setTab('biz')}>
            💼 {t('bizOpen')}
          </button>
        )}
        {id === 'airport' && <p className="hint">✈️ {t('airportInfo')}</p>}
        {empty && <p className="empty">{t('noActions')}</p>}
      </div>
    </div>
  );
}
