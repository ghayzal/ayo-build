// Reconstruct swaps from net balance deltas rather than DEX instruction parsing.
// One code path covers Jupiter, PumpSwap, Pump.fun, Raydium, Meteora and Orca,
// plus whatever launches next year, because we only ask what the balances did.
//
// Input is the pruned transaction shape from txcache.js, not raw jsonParsed.
const LAMPORTS = 1e9;
const DUST_SOL = 0.0005;
const DUST_USD = 0.01;

export const NATIVE = 'So11111111111111111111111111111111111111112';

// Assets the trader pays WITH rather than speculates ON. Without this split,
// every USDC-funded buy looks like a token-to-token rotation and the numbers
// fill with false positives.
export const QUOTES = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

const VENUES = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
  'JUP4Fb2cqiRUcaTNcntAdRrEuFhV5PP1Kn8FUjHnpvi': 'Jupiter',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora',
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'Meteora',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca',
};

function allKeys(tx) {
  const l = tx.loadedAddresses;
  return l ? tx.accountKeys.concat(l.writable || [], l.readonly || []) : tx.accountKeys;
}

function venueOf(tx) {
  for (const p of tx.programIds || []) if (VENUES[p]) return VENUES[p];
  return 'unknown';
}

export function extractSwaps(txs, wallet) {
  const swaps = [];
  let skipped = 0;

  for (const sig of Object.keys(txs)) {
    const tx = txs[sig];
    if (!tx || !tx.meta || tx.meta.err) { skipped++; continue; }

    const keys = allKeys(tx);
    const idx = keys.indexOf(wallet);
    const fee = (tx.meta.fee || 0) / LAMPORTS;
    let solDelta = idx >= 0
      ? (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / LAMPORTS + fee
      : 0;

    const pre = new Map();
    const post = new Map();
    for (const b of tx.meta.preTokenBalances || []) {
      if (b.owner !== wallet) continue;
      pre.set(b.mint, (pre.get(b.mint) || 0) + Number(b.amount || 0));
    }
    for (const b of tx.meta.postTokenBalances || []) {
      if (b.owner !== wallet) continue;
      post.set(b.mint, (post.get(b.mint) || 0) + Number(b.amount || 0));
    }

    const deltas = new Map();
    for (const m of new Set([...pre.keys(), ...post.keys()])) {
      const d = (post.get(m) || 0) - (pre.get(m) || 0);
      if (d !== 0) deltas.set(m, d);
    }
    if (deltas.has(NATIVE)) { solDelta += deltas.get(NATIVE); deltas.delete(NATIVE); }

    const base = [];
    const quote = [];
    for (const [mint, amt] of deltas) {
      if (QUOTES[mint]) {
        if (Math.abs(amt) > DUST_USD) quote.push({ mint, sym: QUOTES[mint], amt });
      } else {
        base.push({ mint, amt });
      }
    }
    if (Math.abs(solDelta) > DUST_SOL) quote.push({ mint: NATIVE, sym: 'SOL', amt: solDelta });

    const baseIn = base.filter(b => b.amt > 0);
    const baseOut = base.filter(b => b.amt < 0);
    const quoteIn = quote.filter(q => q.amt > 0);
    const quoteOut = quote.filter(q => q.amt < 0);
    const biggest = arr => arr.slice().sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt))[0];

    const rec = { sig, time: tx.blockTime, venue: venueOf(tx), fee };

    if (baseIn.length === 1 && baseOut.length === 0 && quoteOut.length > 0) {
      const q = biggest(quoteOut);
      swaps.push({ ...rec, kind: 'buy', token: baseIn[0].mint, tokenAmt: baseIn[0].amt,
        quoteSym: q.sym, quoteAmt: Math.abs(q.amt) });
    } else if (baseOut.length === 1 && baseIn.length === 0 && quoteIn.length > 0) {
      const q = biggest(quoteIn);
      swaps.push({ ...rec, kind: 'sell', token: baseOut[0].mint, tokenAmt: Math.abs(baseOut[0].amt),
        quoteSym: q.sym, quoteAmt: Math.abs(q.amt) });
    } else {
      skipped++;
    }
  }

  swaps.sort((a, b) => a.time - b.time);
  return { swaps, skipped };
}
