# Giveback — the scanner

Paste a Solana address, find out how much of your peak paper gains you handed
back. No wallet connection, nothing signed, no accounts, no journaling.

## Running it

```bash
node app/server.js
```

Then open http://localhost:3000. No install step and no dependencies: it is
plain Node 20+ and three static files.

## Set a real RPC before you show anyone

The public Solana RPC will not carry this. It rate-limits `getTransaction`
hard enough that a cold scan of a 107-transaction wallet stalls partway through
and never finishes. Batches above about five calls come back entirely 429.

```bash
SOLANA_RPC="https://your-endpoint" RPC_BATCH=100 node app/server.js
```

With a paid or free-tier indexer and a batch size of 100, a cold scan drops from
minutes to seconds. This is the single highest-value change to make here, and
the code already handles it: `RPC_BATCH` is the only knob.

| Variable | Default | Notes |
|---|---|---|
| `SOLANA_RPC` | public endpoint | Point at a real indexer. |
| `RPC_BATCH` | `5` | Raise to 100 on a paid endpoint. |
| `PORT` | `3000` | |

## How a scan works

```
signatures -> transactions -> swaps -> positions -> prices -> analysis
```

Progress streams to the browser over SSE, because a silent sixty-second wait
reads as a broken page.

Trades are reconstructed from **balance deltas**, not DEX instruction parsing.
We diff the wallet's token balances before and after each transaction and ask
what actually moved. One code path covers Jupiter, PumpSwap, Pump.fun, Raydium,
Meteora and Orca, including venues we never named, and it keeps working when a
new DEX launches.

SOL, USDC and USDT are treated as **quote** assets rather than positions. Without
that split every USDC-funded buy looks like a token-to-token rotation.

## Caching

Two flat files under `app/cache/`, both safe to delete:

- `txs.json` — confirmed transactions, which are immutable, so this never goes
  stale. A repeat scan of the same wallet is close to instant.
- `tokens.json` — hourly OHLCV per token, one hour TTL. Shared across every
  scan, which matters more than it sounds: degens pile into the same coins, so
  the second person to scan a popular token pays nothing.

Both are flat JSON, which is fine at demo scale and is the first thing to replace
with a real store if this sees traffic.

To warm the cache from the V0 research data:

```bash
node v0/seed-app-cache.mjs
```

## Limits worth knowing

- Reads at most the 400 most recent transactions per wallet.
- Prices at most the 30 tokens that carried the most capital.
- Two concurrent scans, because the free price API allows about 30 calls a minute.
- Hourly candles, so entries and exits inside the same hour are approximate.
- The verdict is allowed to say **nothing conclusive**. A wallet with fewer than
  five closed positions, or one that genuinely keeps its winners, gets told that
  rather than having a leak invented for it.
