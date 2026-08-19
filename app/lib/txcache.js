// Confirmed transactions never change, so caching them is always correct and a
// re-scan of the same wallet costs nothing. We store a pruned form: only the
// fields swap reconstruction actually reads, which is roughly a tenth the size
// of the raw jsonParsed payload.
//
// This is a flat file, which is fine at demo scale and is the first thing to
// replace with a real store if this ever sees traffic.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', 'cache');
const FILE = join(CACHE_DIR, 'txs.json');

let store = {};
try { if (existsSync(FILE)) store = JSON.parse(readFileSync(FILE, 'utf8')); } catch { store = {}; }

let dirty = false;
let flushTimer = null;

export function prune(tx) {
  if (!tx || !tx.transaction) return null;
  const msg = tx.transaction.message || {};
  const meta = tx.meta || {};

  const programIds = new Set();
  const walk = ins => { for (const i of ins || []) if (i.programId) programIds.add(i.programId); };
  walk(msg.instructions);
  for (const inner of meta.innerInstructions || []) walk(inner.instructions);

  return {
    blockTime: tx.blockTime,
    accountKeys: (msg.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey)),
    loadedAddresses: meta.loadedAddresses
      ? { writable: meta.loadedAddresses.writable || [], readonly: meta.loadedAddresses.readonly || [] }
      : null,
    programIds: [...programIds],
    meta: {
      err: meta.err || null,
      fee: meta.fee || 0,
      preBalances: meta.preBalances || [],
      postBalances: meta.postBalances || [],
      preTokenBalances: (meta.preTokenBalances || []).map(b => ({
        mint: b.mint, owner: b.owner, amount: b.uiTokenAmount.uiAmountString || '0',
      })),
      postTokenBalances: (meta.postTokenBalances || []).map(b => ({
        mint: b.mint, owner: b.owner, amount: b.uiTokenAmount.uiAmountString || '0',
      })),
    },
  };
}

export function get(sig) { return store[sig]; }
export function has(sig) { return Object.prototype.hasOwnProperty.call(store, sig); }

export function set(sig, pruned) {
  store[sig] = pruned;
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(flush, 2000);
}

export function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!dirty) return;
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store));
    dirty = false;
  } catch { /* cache is an optimisation, never fatal */ }
}

export function size() { return Object.keys(store).length; }
