import { useEffect, useState } from 'react';
import { BUSINESSES } from '../../../shared/src/content/businesses.ts';
import { ERAS } from '../../../shared/src/content/eras.ts';
import { SKILLS } from '../../../shared/src/content/skills.ts';
import { SHOP } from '../../../shared/src/content/city.ts';
import { age, bizCost, bizIncome, daysToBirthday, energyMax, incomePerHour, levelMult, xpNeeded } from '../../../shared/src/engine.ts';
import { api, type FriendsResponse, type LeaderboardResponse } from '../api.ts';
import { shareLink } from '../telegram.ts';
import type { StrKey } from '../i18n.ts';
import { fmt, setTab, showToast, simpleAct, useGame, useT } from '../store.ts';

function Sheet({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sheet-sub">{sub}</div>}
        </div>
        <button className="icon-btn" onClick={() => setTab('city')} aria-label="close">
          ✕
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

function MePanel() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  const items = SHOP.filter((x) => x.item);
  return (
    <Sheet
      title={s.name}
      sub={
        <>
          {t('age', { n: age(s) })} · {ERAS[s.era].title[lang]} · {t('nextBirthday', { n: daysToBirthday(s) })}
        </>
      }
    >
      <h3 className="section">🎓 {t('skills')}</h3>
      {SKILLS.map((sk) => {
        const lv = s.skills[sk.id];
        const need = xpNeeded(lv);
        return (
          <div key={sk.id} className="row">
            <div className="tile skill-tile">{sk.icon}</div>
            <div className="row-main">
              <b>
                {sk.name[lang]} <span className="lvl">{t('level', { n: lv })}</span>
              </b>
              <small>{sk.desc[lang]}</small>
              <div className="bar thin">
                <div className="bar-fill cyan" style={{ width: `${(s.xp[sk.id] / need) * 100}%` }} />
              </div>
              <small>
                {Math.floor(s.xp[sk.id])}/{need}
              </small>
            </div>
          </div>
        );
      })}
      <h3 className="section">🎒 {t('items')}</h3>
      <div className="items-grid">
        {items.map((x) => (
          <div key={x.id} className={`item ${s.items.includes(x.item!) ? 'have' : ''}`}>
            <span>{x.icon}</span>
            <small>{t(`item_${x.item}` as StrKey)}</small>
          </div>
        ))}
      </div>
      <h3 className="section">📊 {t('stats')}</h3>
      <div className="stat-grid">
        <div><small>{t('reputation')}</small><b>⭐ {Math.round(s.reputation)}/100</b></div>
        <div><small>{t('energy')}</small><b>⚡ {Math.round(s.energy)}/{energyMax(s)}</b></div>
        <div><small>{t('statJobs')}</small><b>💼 {s.stats.jobs}</b></div>
        <div><small>{t('statStudies')}</small><b>📚 {s.stats.studies}</b></div>
        <div><small>{t('statSleeps')}</small><b>📅 {s.day}</b></div>
        <div><small>{t('statHospital')}</small><b>🏥 {s.stats.hospital}</b></div>
        <div><small>{t('statEarned')}</small><b>{fmt(s.totalEarned)}</b></div>
        <div><small>{t('statLaunches')}</small><b>🚀 {s.launchOk}/{s.launches}</b></div>
      </div>
    </Sheet>
  );
}

const NEXT_MILESTONE = [25, 50, 100, 200, 400];

function BusinessPanel() {
  const t = useT();
  const s = useGame((st) => st.s);
  const lang = useGame((st) => st.lang);
  if (s.era < 2) {
    return (
      <Sheet title={t('tabBiz')}>
        <div className="empty">🔒 {t('bizLocked')}</div>
      </Sheet>
    );
  }
  const rank = (era: number) => (era > s.era ? -1 : era);
  const visible = BUSINESSES.filter((b) => b.era <= s.era + 1).sort((a, b) => rank(b.era) - rank(a.era) || a.baseCost - b.baseCost);
  return (
    <Sheet
      title={t('tabBiz')}
      sub={
        <>
          {t('incomeTotal')}: <b className="gold-text">{fmt(incomePerHour(s))}{t('perHour')}</b>
        </>
      }
    >
      <p className="hint">{t('bizHint')}</p>
      {visible.map((b) => {
        const level = s.biz[b.id] ?? 0;
        const locked = b.era > s.era;
        const cost = bizCost(b.id, level);
        const gain = bizIncome(b.id, level + 1) - bizIncome(b.id, level);
        const nextMs = NEXT_MILESTONE.find((m) => m > level);
        const afford = s.cash >= cost;
        return (
          <div key={b.id} className={`row ${locked ? 'locked' : ''}`}>
            <div className="tile" style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color}55)` }}>
              {locked ? '🔒' : b.icon}
            </div>
            <div className="row-main">
              <b>{b.name[lang]}</b>
              {locked ? (
                <small>{t('lockedEra', { era: ERAS[b.era].title[lang] })}</small>
              ) : (
                <small>
                  {level > 0 && <span className="lvl">{t('level', { n: level })}</span>}
                  {fmt(level > 0 ? bizIncome(b.id, level) : gain)}
                  {t('perHour')}
                  {level > 0 && nextMs && <span className="ms"> · x2 @{nextMs} ({levelMult(level)}x)</span>}
                </small>
              )}
            </div>
            {!locked && (
              <button className={`buy-btn ${afford ? '' : 'poor'}`} disabled={!afford} onClick={() => simpleAct({ t: 'invest', id: b.id })}>
                <small>+{fmt(gain)}</small>
                <b>{fmt(cost)}</b>
              </button>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

function useRemote<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    load()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, retry: () => setN((x) => x + 1) };
}

const MEDALS = ['🥇', '🥈', '🥉'];

function LeaderboardPanel() {
  const t = useT();
  const online = useGame((st) => st.online);
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const { data, error, retry } = useRemote<LeaderboardResponse>(() => api.leaderboard(scope), [scope, online]);
  return (
    <Sheet title={t('tabTop')}>
      <div className="seg">
        <button className={scope === 'global' ? 'on' : ''} onClick={() => setScope('global')}>
          🌍 {t('global')}
        </button>
        <button className={scope === 'friends' ? 'on' : ''} onClick={() => setScope('friends')}>
          👥 {t('friendsScope')}
        </button>
      </div>
      {!online ? (
        <div className="empty">📡 {t('needOnline')}</div>
      ) : error ? (
        <div className="empty">
          {t('loadError')} <button className="link" onClick={retry}>{t('retry')}</button>
        </div>
      ) : !data ? (
        <div className="empty">{t('loading')}</div>
      ) : (
        <>
          <div className="my-rank">
            {t('yourRank')}: <b>#{data.me.rank}</b> · {fmt(data.me.netWorth)}
          </div>
          {data.top.map((r) => (
            <div key={`${r.rank}-${r.name}`} className={`rank-row ${r.me ? 'me' : ''}`}>
              <span className="rank">{MEDALS[r.rank - 1] ?? `#${r.rank}`}</span>
              <span className="rank-era">{ERAS[r.era]?.icon}</span>
              <span className="rank-name">
                {r.name}
                {r.me && <em> ({t('you')})</em>}
              </span>
              <b>{fmt(r.netWorth)}</b>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

function FriendsPanel() {
  const t = useT();
  const online = useGame((st) => st.online);
  const fallbackLink = useGame((st) => st.inviteLink);
  const { data, error, retry } = useRemote<FriendsResponse>(() => api.friends(), [online]);
  const link = data?.inviteLink || fallbackLink;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast(t('copied'));
    } catch {
      showToast(link);
    }
  };
  return (
    <Sheet title={t('tabFriends')}>
      <div className="invite-card">
        <div className="invite-emoji">🤝</div>
        <h3>{t('inviteTitle')}</h3>
        <p>{t('inviteText')}</p>
        <button className="primary" disabled={!online || !link} onClick={() => shareLink(link, t('shareText'))}>
          {t('inviteButton')}
        </button>
        {online && link && (
          <button className="ghost" onClick={copy}>
            🔗 {t('copyLink')}
          </button>
        )}
      </div>
      {!online ? (
        <div className="empty">📡 {t('needOnline')}</div>
      ) : error ? (
        <div className="empty">
          {t('loadError')} <button className="link" onClick={retry}>{t('retry')}</button>
        </div>
      ) : !data ? (
        <div className="empty">{t('loading')}</div>
      ) : (
        <>
          <h3 className="list-title">{t('invitedCount', { n: data.count })}</h3>
          {data.invited.length === 0 && <div className="empty">{t('noFriends')}</div>}
          {data.invited.map((f, i) => (
            <div key={i} className="rank-row">
              <span className="rank-era">{ERAS[f.era]?.icon}</span>
              <span className="rank-name">{f.name}</span>
              <b>{fmt(f.netWorth)}</b>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

export function Panels() {
  const tab = useGame((st) => st.tab);
  if (tab === 'me') return <MePanel />;
  if (tab === 'biz') return <BusinessPanel />;
  if (tab === 'top') return <LeaderboardPanel />;
  if (tab === 'friends') return <FriendsPanel />;
  return null;
}
