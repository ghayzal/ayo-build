// The analysis layer. Everything here is measured against the trader's own
// history rather than universal thresholds, and any metric without enough data
// behind it returns null instead of a confident-looking guess.
const H24 = 24 * 3600;
const MIN_CANDLES_FOR_CONTROL = 48;
const GREEN_THRESHOLD = 25;   // "was meaningfully up at some point"

const median = a => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const sum = a => a.reduce((x, y) => x + y, 0);
const round = (n, d = 2) => (n == null ? null : +n.toFixed(d));

export function analyze(positions, tokenPrices) {
  const closed = positions.filter(p => p.closed && p.pnlUsd != null);
  const series = {};
  for (const mint of Object.keys(tokenPrices)) {
    const rec = tokenPrices[mint];
    series[mint] = { symbol: rec.symbol, map: new Map(rec.candles || []) };
  }
  const symbolOf = m => (series[m] && series[m].symbol) || m.slice(0, 4) + '…' + m.slice(-4);
  const priceAt = (mint, ts) => {
    const s = series[mint];
    if (!s) return null;
    return s.map.get(Math.floor(ts / 3600) * 3600);
  };

  // ---------- giveback: how much of the peak did they keep? ----------
  const giveback = [];
  for (const p of closed) {
    const entry = priceAt(p.token, p.entryTime);
    if (!entry) continue;
    const s = series[p.token];
    let peak = entry;
    let peakT = p.entryTime;
    for (const [t, v] of s.map) {
      if (t >= p.entryTime && t <= p.exitTime && v > peak) { peak = v; peakT = t; }
    }
    const peakGainPct = ((peak - entry) / entry) * 100;
    if (peakGainPct < 1) continue;
    giveback.push({
      token: p.token,
      symbol: symbolOf(p.token),
      costUsd: p.costUsd,
      pnlUsd: p.pnlUsd,
      pnlPct: p.pnlPct,
      peakGainPct: round(peakGainPct, 1),
      peakAtHours: round((peakT - p.entryTime) / 3600, 1),
      holdHours: p.holdHours,
      keptFraction: round(p.pnlPct / peakGainPct),
      peakValueUsd: round(p.costUsd * (peakGainPct / 100)),
    });
  }

  const wentGreen = giveback.filter(g => g.peakGainPct > GREEN_THRESHOLD);
  const gaveItBack = wentGreen.filter(g => g.pnlUsd < 0);
  const handedBack = sum(gaveItBack.map(g => g.peakValueUsd - g.pnlUsd));

  // ---------- entry timing vs a random hour of the same token ----------
  const entryRanks = [];
  const chased = [];
  const notChased = [];
  for (const p of closed) {
    const s = series[p.token];
    if (!s || s.map.size < MIN_CANDLES_FOR_CONTROL) continue;
    const fwd = ts => {
      const a = priceAt(p.token, ts);
      const b = priceAt(p.token, ts + H24);
      return a == null || b == null || a === 0 ? null : ((b - a) / a) * 100;
    };
    const all = [...s.map.keys()].map(fwd).filter(x => x != null);
    const atEntry = fwd(p.entryTime);
    if (atEntry == null || all.length < MIN_CANDLES_FOR_CONTROL) continue;
    entryRanks.push(all.filter(x => x < atEntry).length / all.length);

    const now = priceAt(p.token, p.entryTime);
    const before = priceAt(p.token, p.entryTime - H24);
    if (now != null && before != null && before !== 0) {
      const runup = ((now - before) / before) * 100;
      (runup > 50 ? chased : notChased).push({ pnlUsd: p.pnlUsd, runup: round(runup, 1) });
    }
  }
  const bucket = arr => (arr.length ? {
    n: arr.length,
    netUsd: round(sum(arr.map(x => x.pnlUsd))),
    winRate: round((arr.filter(x => x.pnlUsd > 0).length / arr.length) * 100, 0),
  } : null);

  // ---------- headline stats ----------
  const wins = closed.filter(p => p.pnlUsd > 0);
  const invested = sum(closed.map(p => p.costUsd));
  const realised = sum(closed.map(p => p.pnlUsd));
  const times = positions.map(p => p.entryTime).filter(Boolean).sort((a, b) => a - b);

  const medianPeakHours = median(wentGreen.map(g => g.peakAtHours));
  const medianHoldOfGreen = median(wentGreen.map(g => g.holdHours));

  const result = {
    window: times.length ? {
      from: new Date(times[0] * 1000).toISOString(),
      to: new Date(times[times.length - 1] * 1000).toISOString(),
      days: round((times[times.length - 1] - times[0]) / 86400, 1),
    } : null,
    counts: {
      positions: positions.length,
      closed: closed.length,
      open: positions.length - closed.length,
      tokens: new Set(positions.map(p => p.token)).size,
      priced: Object.values(tokenPrices).filter(t => (t.candles || []).length).length,
    },
    pnl: {
      investedUsd: round(invested),
      realisedUsd: round(realised),
      winRate: closed.length ? round((wins.length / closed.length) * 100, 1) : null,
      wins: wins.length,
      losses: closed.length - wins.length,
      medianPositionUsd: round(median(closed.map(p => p.costUsd))),
      biggestLossUsd: closed.length ? round(Math.min(...closed.map(p => p.pnlUsd))) : null,
    },
    timing: {
      medianHoldHours: round(median(closed.map(p => p.holdHours)), 1),
      medianPeakHours: round(medianPeakHours, 1),
      medianHoldOfGreenHours: round(medianHoldOfGreen, 1),
      analysed: wentGreen.length,
    },
    giveback: {
      analysed: giveback.length,
      wentGreen: wentGreen.length,
      closedRed: gaveItBack.length,
      handedBackUsd: round(handedBack),
      medianPeakGainPct: round(median(wentGreen.map(g => g.peakGainPct)), 1),
      medianRealisedPct: round(median(wentGreen.map(g => g.pnlPct)), 1),
      worst: gaveItBack
        .slice()
        .sort((a, b) => (b.peakValueUsd - b.pnlUsd) - (a.peakValueUsd - a.pnlUsd))
        .slice(0, 6),
    },
    entries: {
      analysed: entryRanks.length,
      medianPercentile: round(median(entryRanks)),
      chased: bucket(chased),
      notChased: bucket(notChased),
    },
  };

  result.verdict = buildVerdict(result);
  result.limits = buildLimits(result);
  return result;
}

// The tool has to be able to say "nothing conclusive here" rather than
// manufacturing a leak for every wallet that walks in.
function buildVerdict(r) {
  const g = r.giveback;
  const t = r.timing;

  if (r.counts.closed < 5) {
    return {
      confidence: 'none',
      headline: 'Not enough closed trades to read anything',
      detail: `Found ${r.counts.closed} completed round trips. Come back after 20 or so.`,
    };
  }

  const holdsPastPeak = t.medianPeakHours != null && t.medianHoldOfGreenHours != null
    && t.medianHoldOfGreenHours > t.medianPeakHours * 2;
  const givesBack = g.wentGreen >= 3 && g.closedRed / g.wentGreen >= 0.5;

  if (givesBack && holdsPastPeak) {
    return {
      confidence: g.wentGreen >= 8 ? 'good' : 'thin',
      headline: `You handed back $${Math.round(g.handedBackUsd).toLocaleString()}`,
      detail: `${g.closedRed} of your ${g.wentGreen} winners turned red before you sold. Your positions peak around hour ${t.medianPeakHours} and you hold them to hour ${t.medianHoldOfGreenHours}.`,
      leak: 'holding winners too long',
    };
  }
  if (givesBack) {
    return {
      confidence: 'thin',
      headline: `You handed back $${Math.round(g.handedBackUsd).toLocaleString()}`,
      detail: `${g.closedRed} of your ${g.wentGreen} winners turned red before you sold, though your hold times are not obviously the cause.`,
      leak: 'giving back winners',
    };
  }
  if (g.wentGreen >= 3) {
    return {
      confidence: 'good',
      headline: 'You mostly keep your winners',
      detail: `${g.wentGreen - g.closedRed} of ${g.wentGreen} positions that went green closed green. Whatever is costing you, it is not exit timing.`,
      leak: null,
    };
  }
  return {
    confidence: 'none',
    headline: 'No clear behavioural leak found',
    detail: `Only ${g.wentGreen} of your positions ever went meaningfully green, so there is not much exit behaviour to measure.`,
    leak: null,
  };
}

function buildLimits(r) {
  const out = [];
  if (r.counts.closed < 20) out.push(`Only ${r.counts.closed} closed positions. Treat everything here as directional.`);
  if (r.counts.priced < r.counts.tokens) out.push(`Price history was unavailable for ${r.counts.tokens - r.counts.priced} of ${r.counts.tokens} tokens, which are excluded.`);
  out.push('Prices are hourly closes, so entries and exits inside the same hour are approximate.');
  out.push('Peak-to-exit is a ceiling, not forgone profit. Nobody sells the exact top.');
  return out;
}
