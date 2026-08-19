// Dev convenience: reuse the data already pulled during V0 so the app starts
// with a warm cache instead of re-paying the public RPC and GeckoTerminal rate
// limits during testing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { prune } from '../app/lib/txcache.js';

mkdirSync('app/cache', { recursive: true });

// ---- token OHLCV ----
if (existsSync('v0/data/token-prices.json')) {
  const src = JSON.parse(readFileSync('v0/data/token-prices.json', 'utf8'));
  const dest = 'app/cache/tokens.json';
  const out = existsSync(dest) ? JSON.parse(readFileSync(dest, 'utf8')) : {};
  let n = 0;
  for (const [mint, rec] of Object.entries(src)) {
    // v0 stores [ts,o,h,l,c,v]; the app only needs [ts, close]
    out[mint] = {
      symbol: rec.symbol,
      candles: (rec.candles || []).map(c => [c[0], c[4]]),
      fetchedAt: Date.now(),
    };
    n++;
  }
  writeFileSync(dest, JSON.stringify(out));
  console.log(`seeded ${n} tokens -> ${dest}`);
}

// ---- transactions ----
if (existsSync('v0/data/transactions.json')) {
  const src = JSON.parse(readFileSync('v0/data/transactions.json', 'utf8'));
  const dest = 'app/cache/txs.json';
  const out = existsSync(dest) ? JSON.parse(readFileSync(dest, 'utf8')) : {};
  let n = 0;
  for (const [sig, tx] of Object.entries(src)) {
    const p = prune(tx);
    if (p) { out[sig] = p; n++; }
  }
  writeFileSync(dest, JSON.stringify(out));
  const kb = (JSON.stringify(out).length / 1024).toFixed(0);
  console.log(`seeded ${n} transactions -> ${dest} (${kb} KB)`);
}
