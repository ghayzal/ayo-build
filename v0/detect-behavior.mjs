// Rule-based behavioural detection, measured against the trader's OWN baseline
// rather than universal thresholds. No thesis data exists for historical trades,
// so "premature" here means "fast relative to how this trader normally holds".
import { readFileSync, writeFileSync } from 'node:fs';

const pos = JSON.parse(readFileSync('v0/data/positions.json', 'utf8'));
const closed = pos.filter(p => p.closed && p.pnlUsd != null);

const ROTATION_WINDOW = 30 * 60; // seconds between an exit and the next entry
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const median = a => pct(a, 0.5);
const sum = a => a.reduce((x, y) => x + y, 0);

// ---- the trader's own baseline ----
const holds = closed.map(p => p.holdHours);
const sizes = closed.map(p => p.costUsd);
const base = {
  medianHoldHours: median(holds),
  p25HoldHours: pct(holds, 0.25),
  medianSizeUsd: median(sizes),
  p75SizeUsd: pct(sizes, 0.75),
};

// ---- rotations: exit one token, enter another almost immediately ----
const events = [];
for (const p of closed) events.push({ t: p.exitTime, type: 'exit', pos: p });
for (const p of pos) events.push({ t: p.entryTime, type: 'entry', pos: p });
events.sort((a, b) => a.t - b.t);

const rotations = [];
for (let i = 0; i < events.length; i++) {
  if (events[i].type !== 'exit') continue;
  for (let j = i + 1; j < events.length; j++) {
    const gap = events[j].t - events[i].t;
    if (gap > ROTATION_WINDOW) break;
    if (events[j].type === 'entry' && events[j].pos.token !== events[i].pos.token) {
      rotations.push({
        gapSec: gap, gapMin: +(gap / 60).toFixed(1),
        from: events[i].pos.token, to: events[j].pos.token,
        fromExitTime: events[i].t, toEntryTime: events[j].t,
        fromPnlUsd: events[i].pos.pnlUsd, fromPnlPct: events[i].pos.pnlPct,
        fromHoldHours: events[i].pos.holdHours,
        toPnlUsd: events[j].pos.pnlUsd, toPnlPct: events[j].pos.pnlPct,
        toCostUsd: events[j].pos.costUsd, fromProceedsUsd: events[i].pos.proceedsUsd,
      });
      break;
    }
  }
}

// ---- fast exits relative to own baseline ----
const fastExits = closed.filter(p => p.holdHours < base.p25HoldHours);

// ---- oversized positions relative to own baseline ----
const oversized = closed.filter(p => p.costUsd > base.p75SizeUsd * 1.5);

// ---- behaviour after a loss: does the trader speed up or size up? ----
const chron = [...closed].sort((a, b) => a.entryTime - b.entryTime);
const afterLoss = [], afterWin = [];
for (let i = 1; i < chron.length; i++) {
  const prev = chron[i - 1], cur = chron[i];
  const gapMin = (cur.entryTime - prev.exitTime) / 60;
  const rec = { gapMin, sizeUsd: cur.costUsd, pnlUsd: cur.pnlUsd, holdHours: cur.holdHours };
  (prev.pnlUsd <= 0 ? afterLoss : afterWin).push(rec);
}

// ---- trading intensity per day ----
const byDay = {};
for (const p of closed) { const d = p.entryIso.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
const dayCounts = Object.values(byDay);
const busiest = Object.entries(byDay).sort((a, b) => b[1] - a[1]).slice(0, 5);

writeFileSync('v0/data/behavior.json', JSON.stringify({ base, rotations, fastExits, oversized, byDay }, null, 2));

const f = n => (n == null ? 'n/a' : n.toFixed(2));
console.log('=== BASELINE (this trader vs themselves) ===');
console.log(`median hold:        ${f(base.medianHoldHours)}h`);
console.log(`fast-exit line p25: ${f(base.p25HoldHours)}h`);
console.log(`median size:        $${f(base.medianSizeUsd)}`);
console.log(`large-size line p75:$${f(base.p75SizeUsd)}`);

console.log(`\n=== ROTATIONS (exit -> new entry within ${ROTATION_WINDOW / 60}min) ===`);
console.log(`count: ${rotations.length} of ${closed.length} closed positions`);
if (rotations.length) {
  console.log(`median gap: ${f(median(rotations.map(r => r.gapMin)))} min`);
  const withBoth = rotations.filter(r => r.fromPnlPct != null && r.toPnlPct != null);
  const destWorse = withBoth.filter(r => r.toPnlPct < r.fromPnlPct);
  console.log(`rotations where the NEW position did worse than the one exited: ${destWorse.length}/${withBoth.length}`);
  console.log(`avg P&L of positions exited in a rotation: $${f(sum(rotations.map(r => r.fromPnlUsd || 0)) / rotations.length)}`);
  console.log(`avg P&L of positions rotated INTO:         $${f(sum(rotations.map(r => r.toPnlUsd || 0)) / rotations.length)}`);
}

console.log(`\n=== FAST EXITS (below own p25 hold) ===`);
console.log(`count: ${fastExits.length}`);
if (fastExits.length) {
  console.log(`their win rate: ${((fastExits.filter(p => p.pnlUsd > 0).length / fastExits.length) * 100).toFixed(1)}%`);
  console.log(`their net P&L:  $${f(sum(fastExits.map(p => p.pnlUsd)))}`);
}

console.log(`\n=== POSITION SIZE TILT ===`);
console.log(`oversized positions: ${oversized.length}`);
if (oversized.length) console.log(`their net P&L: $${f(sum(oversized.map(p => p.pnlUsd)))} on $${f(sum(oversized.map(p => p.costUsd)))} invested`);

console.log(`\n=== AFTER A LOSS vs AFTER A WIN ===`);
const avg = (a, k) => (a.length ? sum(a.map(x => x[k])) / a.length : 0);
console.log(`n after loss: ${afterLoss.length} | n after win: ${afterWin.length}`);
console.log(`median gap to next entry:  loss ${f(median(afterLoss.map(x => x.gapMin)))}min  vs  win ${f(median(afterWin.map(x => x.gapMin)))}min`);
console.log(`avg next position size:    loss $${f(avg(afterLoss, 'sizeUsd'))}  vs  win $${f(avg(afterWin, 'sizeUsd'))}`);
console.log(`avg next position P&L:     loss $${f(avg(afterLoss, 'pnlUsd'))}  vs  win $${f(avg(afterWin, 'pnlUsd'))}`);

console.log(`\n=== INTENSITY ===`);
console.log(`active days: ${dayCounts.length}, median trades/active day: ${f(median(dayCounts))}, max: ${Math.max(...dayCounts)}`);
console.log(`busiest days: ${busiest.map(([d, n]) => `${d}(${n})`).join(', ')}`);
