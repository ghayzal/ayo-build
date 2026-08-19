// Benchmark Solana RPC endpoints against the workload that actually breaks:
// batched getTransaction over months-old signatures.
//
// Marketing pages will not tell you whether an endpoint keeps May transactions
// or dies at a batch of 20. This does.
//
//   node tools/bench-rpc.mjs            tests SOLANA_RPC from .env, or the
//                                       public endpoints if none is set
//   node tools/bench-rpc.mjs --public   always tests the public endpoints
//
// Prefer putting your endpoint in .env over passing it as an argument: the URL
// contains your API token in its path, and arguments end up in shell history.
// Printed output masks it either way.
import '../app/lib/env.js';
import { readFileSync, existsSync } from 'node:fs';

const SIGS_FILE = 'v0/data/signatures.json';
if (!existsSync(SIGS_FILE)) {
  console.error(`need ${SIGS_FILE} — run v0/fetch-signatures.mjs first`);
  process.exit(1);
}

const all = JSON.parse(readFileSync(SIGS_FILE, 'utf8')).filter(s => !s.err);
all.sort((a, b) => a.blockTime - b.blockTime);
const oldest = all[0];
const sample = all.slice(0, 20).map(s => s.signature);   // oldest 20: the hardest case

const PUBLIC = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
  'https://rpc.ankr.com/solana',
  'https://1rpc.io/solana',
  'https://solana.api.onfinality.io/public',
  'https://endpoints.omniatech.io/v1/sol/mainnet/public',
  'https://solana.leorpc.com/?api_key=FREE',
];

const arg = process.argv[2];
const ENDPOINTS =
  arg && arg !== '--public' ? [arg]
  : arg === '--public' ? PUBLIC
  : process.env.SOLANA_RPC ? [process.env.SOLANA_RPC]
  : PUBLIC;

// The token lives in the URL path or query, so never print a URL whole.
function mask(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/[^/]{8,}/g, '/***');
    return u.host + (path === '/' ? '' : path) + (u.search ? '?***' : '');
  } catch {
    return 'invalid url';
  }
}

const TX_OPTS = { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const ms = Date.now() - t0;
    if (res.status === 429) return { ms, throttled: true };
    if (!res.ok) return { ms, error: `http ${res.status}` };
    return { ms, json: await res.json() };
  } catch (e) {
    return { ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function tally(json, n) {
  const rows = Array.isArray(json) ? json : [json];
  let ok = 0, throttled = 0, err = 0, empty = 0;
  for (const r of rows) {
    if (!r) { err++; continue; }
    if (r.result) ok++;
    else if (r.error && r.error.code === 429) throttled++;
    else if (r.error) err++;
    else empty++;
  }
  return { ok, throttled, err, empty, returned: rows.length, asked: n };
}

console.log(`sample: ${sample.length} signatures, oldest ${new Date(oldest.blockTime * 1000).toISOString().slice(0, 10)}\n`);

const results = [];

for (const url of ENDPOINTS) {
  const label = mask(url);
  const row = { label, url };

  // 1. reachable + archival: can it still see the oldest transaction?
  const single = await post(url, { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [oldest.signature, TX_OPTS] });
  if (single.error) { row.status = single.error; results.push(row); console.log(`${label.padEnd(38)} ${single.error}`); continue; }
  if (single.throttled) { row.status = 'throttled on first call'; results.push(row); console.log(`${label.padEnd(38)} throttled immediately`); continue; }
  row.archival = !!(single.json && single.json.result);
  row.singleMs = single.ms;
  if (single.json && single.json.error) row.singleErr = String(single.json.error.message || single.json.error.code).slice(0, 60);

  await sleep(400);

  // 2. batch of 20 in one request
  const body = sample.map((s, i) => ({ jsonrpc: '2.0', id: i, method: 'getTransaction', params: [s, TX_OPTS] }));
  const batch = await post(url, body, 30000);
  if (batch.error) row.batch = { fail: batch.error };
  else if (batch.throttled) row.batch = { fail: 'http 429' };
  else row.batch = { ...tally(batch.json, sample.length), ms: batch.ms };

  await sleep(600);

  // 3. sustained: three more batches back to back
  let sustainedOk = 0, sustainedMs = 0, sustainedFail = 0;
  for (let i = 0; i < 3; i++) {
    const r = await post(url, body, 30000);
    if (r.error || r.throttled) { sustainedFail++; }
    else { const t = tally(r.json, sample.length); sustainedOk += t.ok; sustainedMs += r.ms; }
    await sleep(250);
  }
  row.sustained = { ok: sustainedOk, of: sample.length * 3, ms: sustainedMs, failedRequests: sustainedFail };

  results.push(row);

  const b = row.batch;
  const bs = b.fail ? b.fail : `${b.ok}/${b.asked} in ${b.ms}ms`;
  console.log(
    `${label.padEnd(38)} archival:${row.archival ? 'yes' : 'NO '}  batch20: ${bs.padEnd(22)} sustained: ${row.sustained.ok}/${row.sustained.of}`
  );
}

console.log('\n--- verdict ---');
const usable = results.filter(r => r.archival && r.batch && !r.batch.fail && r.batch.ok >= 18);
if (!usable.length) {
  console.log('none of these handled a batch of 20 over old signatures.');
} else {
  usable.sort((a, b) => (b.sustained.ok - a.sustained.ok) || (a.batch.ms - b.batch.ms));
  for (const r of usable) {
    const perTx = r.sustained.ok ? Math.round(r.sustained.ms / r.sustained.ok) : 0;
    const scanMs = perTx * 400;
    console.log(`${r.label.padEnd(38)} ${r.sustained.ok}/${r.sustained.of} sustained, ~${perTx}ms/tx  -> a 400-tx cold scan takes ~${(scanMs / 1000).toFixed(0)}s`);
  }
  console.log('\nput the winner in .env as SOLANA_RPC and set RPC_BATCH=100');
}
