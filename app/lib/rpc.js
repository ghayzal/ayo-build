// Solana RPC access.
//
// Defaults to the public endpoint, which rate-limits getTransaction hard: batches
// above about five calls come back entirely 429. So the fetcher below batches
// small and adapts its pacing to whatever the endpoint actually tolerates,
// retrying only the items that got throttled.
//
// Point SOLANA_RPC at a paid indexer and raise RPC_BATCH to 100 and this stops
// being the bottleneck. That is the single highest-value config change here.
import * as txcache from './txcache.js';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const BATCH = Number(process.env.RPC_BATCH || 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function isValidAddress(a) {
  return typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}

async function post(body) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) return { throttled: true };
  if (!res.ok) return { throttled: false, error: `http ${res.status}` };
  try { return { throttled: false, json: await res.json() }; }
  catch { return { throttled: false, error: 'bad json' }; }
}

export async function rpc(method, params, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await post({ jsonrpc: '2.0', id: 1, method, params });
      if (r.throttled) { await sleep(700 * (i + 1)); continue; }
      if (r.json && !r.json.error) return r.json.result;
      await sleep(400 * (i + 1));
    } catch { await sleep(400 * (i + 1)); }
  }
  return null;
}

export async function getSignatures(wallet, max = 400, onProgress = () => {}) {
  const all = [];
  let before;
  while (all.length < max) {
    const params = [wallet, before ? { limit: 1000, before } : { limit: 1000 }];
    const batch = await rpc('getSignaturesForAddress', params);
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    before = batch[batch.length - 1].signature;
    onProgress(all.length);
    if (batch.length < 1000) break;
    await sleep(150);
  }
  return all.slice(0, max);
}

const TX_OPTS = { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 };

export async function getTransactions(signatures, onProgress = () => {}) {
  const out = {};
  const total = signatures.length;

  // confirmed transactions are immutable, so anything cached is done
  let pending = [];
  for (const sig of signatures) {
    if (txcache.has(sig)) {
      const hit = txcache.get(sig);
      if (hit) out[sig] = hit;
    } else {
      pending.push(sig);
    }
  }
  onProgress(Object.keys(out).length, total);
  if (!pending.length) return out;

  let delay = 120;          // adapts up on throttling, down on clean batches
  let round = 0;

  while (pending.length && round < 12) {
    round++;
    const retry = [];

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const body = chunk.map((sig, n) => ({
        jsonrpc: '2.0', id: n, method: 'getTransaction', params: [sig, TX_OPTS],
      }));

      let r;
      try { r = await post(body); } catch { r = { throttled: true }; }

      if (r.throttled || r.error) {
        retry.push(...chunk);
        delay = Math.min(2000, Math.round(delay * 1.7) + 100);
      } else {
        const rows = Array.isArray(r.json) ? r.json : [r.json];
        let throttledInBatch = false;
        for (const row of rows) {
          const sig = chunk[row && row.id != null ? row.id : 0];
          if (row && row.result) {
            const pruned = txcache.prune(row.result);
            if (pruned) { out[sig] = pruned; txcache.set(sig, pruned); }
          } else if (row && row.error && row.error.code === 429) {
            retry.push(sig);
            throttledInBatch = true;
          }
          // a null result with no error means the tx is genuinely unavailable; drop it
        }
        delay = throttledInBatch
          ? Math.min(2000, Math.round(delay * 1.5) + 80)
          : Math.max(60, Math.round(delay * 0.85));
      }

      onProgress(Object.keys(out).length, total);
      await sleep(delay);
    }

    pending = retry;
    if (pending.length) await sleep(600);
  }

  txcache.flush();
  return out;
}
