const $ = id => document.getElementById(id);
const form = $('form');
const addressInput = $('address');
const goBtn = $('go');
const errorBox = $('error');
const progress = $('progress');
const stepsEl = $('steps');
const resultEl = $('result');

const STEPS = [
  ['history', 'Reading transaction history'],
  ['transactions', 'Fetching transactions'],
  ['swaps', 'Reconstructing trades'],
  ['sol', 'Pricing SOL-quoted trades'],
  ['positions', 'Building positions'],
  ['prices', 'Pulling price history'],
  ['analyse', 'Running the numbers'],
];

const usd = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const usd2 = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const pct = n => (n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(0) + '%');
const hrs = n => (n == null ? '—' : n < 1 ? Math.round(n * 60) + 'm' : n < 48 ? n.toFixed(1) + 'h' : (n / 24).toFixed(1) + 'd');
const short = a => a.slice(0, 4) + '…' + a.slice(-4);

let source = null;

function renderSteps(activeKey, detail) {
  const activeIdx = STEPS.findIndex(s => s[0] === activeKey);
  stepsEl.innerHTML = STEPS.map(([key, label], i) => {
    const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : '';
    const mark = i < activeIdx ? '<span class="mark">done</span>' : i === activeIdx ? `<span>${detail || ''}</span>` : '';
    return `<li class="${state}"><span>${label}</span>${mark}</li>`;
  }).join('');
}

function fail(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  goBtn.disabled = false;
  goBtn.textContent = 'Scan';
  progress.hidden = true;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const address = addressInput.value.trim();
  if (!address) return;

  if (source) source.close();
  errorBox.hidden = true;
  resultEl.hidden = true;
  progress.hidden = false;
  goBtn.disabled = true;
  goBtn.textContent = 'Scanning';
  renderSteps('history');

  source = new EventSource(`/api/scan?address=${encodeURIComponent(address)}`);

  source.addEventListener('status', ev => {
    const d = JSON.parse(ev.data);
    let detail = '';
    if (d.done != null && d.total != null) detail = `${d.done}/${d.total}`;
    else if (d.positions != null) detail = `${d.positions}`;
    else if (/\((\d+)\)/.test(d.message)) detail = d.message.match(/\((\d+)\)/)[1];
    renderSteps(d.step, detail);
  });

  source.addEventListener('done', ev => {
    const d = JSON.parse(ev.data);
    source.close();
    goBtn.disabled = false;
    goBtn.textContent = 'Scan';
    if (d.empty) return fail(d.message);
    progress.hidden = true;
    render(d.result);
  });

  source.addEventListener('failed', ev => {
    source.close();
    fail(JSON.parse(ev.data).error);
  });

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    source.close();
    fail('Lost the connection to the scanner. The public RPC rate-limits hard, so trying again often just works.');
  };
});

$('reset').addEventListener('click', () => {
  resultEl.hidden = true;
  addressInput.value = '';
  addressInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function render(r) {
  const v = r.verdict;
  const g = r.giveback;

  $('heroAddr').textContent = short(r.address);
  const numEl = $('heroNum');

  if (v.leak && g.handedBackUsd > 0) {
    numEl.textContent = usd(g.handedBackUsd);
    numEl.className = 'hero-num';
  } else {
    numEl.textContent = v.headline;
    numEl.className = 'hero-num flat';
  }
  $('heroSub').textContent = v.leak && g.handedBackUsd > 0 ? v.detail : v.detail;
  $('heroConf').textContent = {
    good: 'Read with reasonable confidence',
    thin: 'Thin sample — directional only',
    none: 'Not enough data for a verdict',
  }[v.confidence] || '';

  // ---- timing ----
  const t = r.timing;
  const timingPanel = $('timingPanel');
  if (t.medianPeakHours != null && t.medianHoldOfGreenHours != null && g.wentGreen >= 3) {
    timingPanel.hidden = false;
    $('timingLede').innerHTML =
      `Across the <b>${g.wentGreen}</b> positions that went meaningfully green, the high came at hour ` +
      `<b>${t.medianPeakHours}</b>. You sold at hour <b>${t.medianHoldOfGreenHours}</b>. ` +
      `The median position peaked <b>${pct(g.medianPeakGainPct)}</b> up and closed <b>${pct(g.medianRealisedPct)}</b>.`;

    const span = Math.max(t.medianHoldOfGreenHours, t.medianPeakHours) * 1.05;
    const peakW = Math.max(2, (t.medianPeakHours / span) * 100);
    const holdW = Math.max(2, (t.medianHoldOfGreenHours / span) * 100);
    $('timeline').innerHTML = `
      <div class="tl-row">
        <div class="tl-label">Time to peak</div>
        <div class="tl-track"><div class="tl-fill peak" style="width:${peakW}%"></div></div>
        <div class="tl-note">${hrs(t.medianPeakHours)} — the best price you were ever offered</div>
      </div>
      <div class="tl-row">
        <div class="tl-label">Time you actually held</div>
        <div class="tl-track"><div class="tl-fill hold" style="width:${holdW}%"></div></div>
        <div class="tl-note">${hrs(t.medianHoldOfGreenHours)} — ${(t.medianHoldOfGreenHours / t.medianPeakHours).toFixed(1)}× longer than it took to top out</div>
      </div>`;
  } else {
    timingPanel.hidden = true;
  }

  // ---- worst offenders ----
  const worstPanel = $('worstPanel');
  const rows = g.worst || [];
  if (rows.length) {
    worstPanel.hidden = false;
    worstPanel.querySelector('tbody').innerHTML = rows.map(w => `
      <tr>
        <td class="sym">${escape(w.symbol)}</td>
        <td class="n">${usd(w.costUsd)}</td>
        <td class="n up">${pct(w.peakGainPct)}</td>
        <td class="n">${hrs(w.peakAtHours)}</td>
        <td class="n">${hrs(w.holdHours)}</td>
        <td class="n down">${usd2(w.pnlUsd)}</td>
      </tr>`).join('');
  } else {
    worstPanel.hidden = true;
  }

  // ---- entries ----
  const e = r.entries;
  const entryPanel = $('entryPanel');
  if (e.chased && e.notChased && e.chased.n >= 2 && e.notChased.n >= 2) {
    entryPanel.hidden = false;
    $('entryLede').innerHTML =
      `Splitting your buys by whether the token had already run more than 50% in the previous 24 hours.`;
    $('entryCards').innerHTML = `
      ${card('Chased a run-up', usd2(e.chased.netUsd), `${e.chased.n} trades · ${e.chased.winRate}% won`, e.chased.netUsd < 0 ? 'down' : 'up')}
      ${card('Bought quietly', usd2(e.notChased.netUsd), `${e.notChased.n} trades · ${e.notChased.winRate}% won`, e.notChased.netUsd < 0 ? 'down' : 'up')}`;
  } else {
    entryPanel.hidden = true;
  }

  // ---- account stats ----
  const p = r.pnl;
  $('statCards').innerHTML = [
    card('Realised P&L', usd2(p.realisedUsd), `on ${usd(p.investedUsd)} deployed`, p.realisedUsd < 0 ? 'down' : 'up'),
    card('Win rate', p.winRate == null ? '—' : p.winRate.toFixed(0) + '%', `${p.wins}W / ${p.losses}L`),
    card('Positions', String(r.counts.closed), `${r.counts.tokens} tokens · ${r.window ? r.window.days + ' days' : ''}`),
    card('Median size', usd(p.medianPositionUsd), `median hold ${hrs(r.timing.medianHoldHours)}`),
  ].join('');

  // ---- limits ----
  const limits = (r.limits || []).slice();
  if (r.truncated) limits.unshift('Only the most recent 400 transactions were read, so older history is not included.');
  if (r.tokensPriced < r.tokensTotal) limits.unshift(`Priced the ${r.tokensPriced} tokens that carried the most money, out of ${r.tokensTotal} traded.`);
  $('limits').innerHTML = limits.map(l => `<li>${escape(l)}</li>`).join('');

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function card(k, v, note, cls) {
  return `<div class="card"><div class="k">${escape(k)}</div><div class="v ${cls || ''}">${escape(v)}</div><div class="note">${escape(note || '')}</div></div>`;
}

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
