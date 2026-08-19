// A position opens when the token balance leaves zero and closes when it returns,
// absorbing scale-ins and partial exits along the way. Memecoin sells leave dust,
// so anything under 1% of peak size counts as flat.
const DUST_FRACTION = 0.01;

export function buildPositions(swaps, solPriceAt) {
  const usdOf = s => {
    if (s.quoteSym === 'USDC' || s.quoteSym === 'USDT') return s.quoteAmt;
    if (s.quoteSym === 'SOL') {
      const p = solPriceAt(s.time);
      return p == null ? null : s.quoteAmt * p;
    }
    return null;
  };

  const byToken = new Map();
  for (const s of swaps) {
    if (!byToken.has(s.token)) byToken.set(s.token, []);
    byToken.get(s.token).push(s);
  }

  const raw = [];
  for (const [token, list] of byToken) {
    list.sort((a, b) => a.time - b.time);
    let cur = null;

    for (const s of list) {
      const usd = usdOf(s);

      if (s.kind === 'buy') {
        if (!cur) {
          cur = { token, entryTime: s.time, exitTime: null, buys: [], sells: [],
                  tokensHeld: 0, peakTokens: 0, costUsd: 0, proceedsUsd: 0, closed: false };
        }
        cur.buys.push({ time: s.time, usd });
        cur.tokensHeld += s.tokenAmt;
        if (cur.tokensHeld > cur.peakTokens) cur.peakTokens = cur.tokensHeld;
        if (usd != null) cur.costUsd += usd;
      } else if (cur) {
        cur.sells.push({ time: s.time, usd });
        cur.tokensHeld -= s.tokenAmt;
        if (usd != null) cur.proceedsUsd += usd;
        cur.exitTime = s.time;
        if (cur.tokensHeld <= cur.peakTokens * DUST_FRACTION) {
          cur.closed = true;
          raw.push(cur);
          cur = null;
        }
      }
    }
    if (cur) raw.push(cur);
  }

  raw.sort((a, b) => a.entryTime - b.entryTime);

  return raw.map(p => {
    const end = p.closed ? p.exitTime : Math.floor(Date.now() / 1000);
    const pnlUsd = p.closed && p.costUsd > 0 ? p.proceedsUsd - p.costUsd : null;
    return {
      token: p.token,
      entryTime: p.entryTime,
      exitTime: p.exitTime,
      closed: p.closed,
      holdHours: +((end - p.entryTime) / 3600).toFixed(2),
      numBuys: p.buys.length,
      numSells: p.sells.length,
      costUsd: +p.costUsd.toFixed(2),
      proceedsUsd: +p.proceedsUsd.toFixed(2),
      pnlUsd: pnlUsd == null ? null : +pnlUsd.toFixed(2),
      pnlPct: pnlUsd == null ? null : +((pnlUsd / p.costUsd) * 100).toFixed(2),
    };
  });
}
