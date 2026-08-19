// Dependency-free Node server. No npm install, no build step: `node app/server.js`.
// A scan streams progress over SSE because the price fetch is slow enough that a
// silent 60-second wait would read as a broken page.
import './lib/env.js';   // must stay first: loads .env before anything reads it

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isValidAddress, getSignatures, getTransactions } from './lib/rpc.js';
import { extractSwaps } from './lib/swaps.js';
import { buildPositions } from './lib/positions.js';
import { getSolPrices, getTokenPrices } from './lib/prices.js';
import { analyze } from './lib/analyze.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const PORT = process.env.PORT || 3000;

const MAX_SIGNATURES = Number(process.env.MAX_SIGNATURES || 400);  // deepest history per scan
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 30);           // priced by capital committed
const MAX_CONCURRENT_SCANS = Number(process.env.MAX_CONCURRENT_SCANS || 2);

let activeScans = 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  return (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

async function runScan(address, send) {
  send('status', { step: 'history', message: 'Reading transaction history' });
  const sigs = await getSignatures(address, MAX_SIGNATURES, n =>
    send('status', { step: 'history', message: `Reading transaction history (${n})` }));

  const ok = sigs.filter(s => !s.err).map(s => s.signature);
  if (!ok.length) {
    send('done', { empty: true, message: 'No transactions found for this address.' });
    return;
  }

  send('status', { step: 'transactions', message: `Fetching ${ok.length} transactions`, total: ok.length });
  const txs = await getTransactions(ok, (done, total) =>
    send('status', { step: 'transactions', message: `Fetching transactions`, done, total }));

  send('status', { step: 'swaps', message: 'Reconstructing trades' });
  const { swaps } = extractSwaps(txs, address);
  if (!swaps.length) {
    send('done', { empty: true, message: 'No swaps found. This address does not look like a trading wallet.' });
    return;
  }

  const times = swaps.map(s => s.time);
  const from = Math.min(...times);
  const to = Math.max(...times);

  send('status', { step: 'sol', message: 'Pricing SOL-quoted trades' });
  const solPriceAt = await getSolPrices(from, to);

  const positions = buildPositions(swaps, solPriceAt);
  send('status', { step: 'positions', message: `Built ${positions.length} positions`, positions: positions.length });

  // price the tokens that actually carried money, biggest first
  const weight = new Map();
  for (const p of positions) weight.set(p.token, (weight.get(p.token) || 0) + p.costUsd);
  const mints = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TOKENS).map(e => e[0]);

  send('status', { step: 'prices', message: 'Pulling price history', done: 0, total: mints.length });
  const tokenPrices = await getTokenPrices(mints, from - 2 * 86400, (done, total) =>
    send('status', { step: 'prices', message: 'Pulling price history', done, total }));

  send('status', { step: 'analyse', message: 'Running the numbers' });
  const result = analyze(positions, tokenPrices);
  result.address = address;
  result.truncated = sigs.length >= MAX_SIGNATURES;
  result.tokensPriced = mints.length;
  result.tokensTotal = weight.size;

  send('done', { result });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/scan') {
    const address = (url.searchParams.get('address') || '').trim();
    if (!isValidAddress(address)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'That does not look like a Solana address.' }));
    }
    if (activeScans >= MAX_CONCURRENT_SCANS) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Another scan is running. The free price API only allows so much at once. Try again in a minute.' }));
    }

    const send = sse(res);
    activeScans++;
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    let closed = false;
    req.on('close', () => { closed = true; });

    try {
      await runScan(address, (e, d) => { if (!closed) send(e, d); });
    } catch (err) {
      console.error('scan failed:', err);
      if (!closed) send('failed', { error: 'The scan broke partway through. The public RPC rate-limits hard, so trying again often just works.' });
    } finally {
      clearInterval(keepAlive);
      activeScans--;
      res.end();
    }
    return;
  }

  // static files
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const path = join(PUBLIC, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }

  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`scanner running on http://localhost:${PORT}`);
  if (!process.env.SOLANA_RPC) console.log('using the public Solana RPC. set SOLANA_RPC for anything beyond light use.');
});
