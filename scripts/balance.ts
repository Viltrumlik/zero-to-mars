/**
 * Economy balance report: a scripted player follows the story and we print
 * how many in-game days and real hours each life chapter takes.
 * Run: npm run balance
 */
import { runBot } from '../shared/test/bot.ts';
import { ERAS } from '../shared/src/content/eras.ts';
import { age, netWorth } from '../shared/src/engine.ts';

for (const score of [0.55, 0.8, 1]) {
  const r = runBot({ score, maxDays: 600 });
  console.log(`\nmini-game score ${score}${r.stuck ? '  (STUCK)' : ''}`);
  for (const e of r.eras) {
    console.log(
      `  → ${ERAS[e.era].key.padEnd(9)} game day ${String(e.day).padStart(4)} · ${e.realHours.toFixed(1)} h active · ${e.calendarDays.toFixed(1)} real days (20 min every 4 h)`,
    );
  }
  console.log(
    `  end: era ${r.s.era}, day ${r.s.day}, age ${age(r.s)}, cash $${Math.round(r.s.cash)}, net worth $${Math.round(netWorth(r.s))}, ` +
      `hospital ${r.hospital}, quest #${r.s.quest}, skills ${JSON.stringify(r.s.skills)}`,
  );
}
