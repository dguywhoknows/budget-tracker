const { $, $$, h, esc, busy, toast, store, md, download } = Kit;

/* ---------------- state ---------------- */
let S = store.get('state', null);
const save = () => store.set('state', S);
function freshState() {
  return { raw: sampleTransactions(), overrides: {}, aiCats: {}, rules: SAMPLE_RULES.slice(), budgets: {}, rollover: false, goals: SAMPLE_GOALS.slice(), meta: {} };
}
if (!S) { S = freshState(); save(); }
let txs = [], month = null;
const uid = () => Math.random().toString(36).slice(2, 9);
const money = (v, d = 0) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const monthLabel = (m) => new Date(m + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/* Re-derive categories for every transaction from raw data + user choices. */
function derive() {
  const ctx = { rules: S.rules, overrides: S.overrides, aiCats: S.aiCats };
  txs = S.raw.map((t) => { const m = S.meta[t.id] || {}; const x = { ...t, ...m }; return Object.assign(x, categorize(x, ctx)); });
  if (!Object.keys(S.budgets).length) { S.budgets = suggestBudgets(txs); save(); }
  const ms = monthsOf(txs);
  if (!month || !ms.includes(month)) month = ms[ms.length - 1];
  $('#month').innerHTML = ms.map((m) => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
}
$('#month').onchange = (e) => { month = e.target.value; rerender(); };
function rerender() { derive(); const p = Router.current; ({ dashboard: renderDashboard, transactions: renderTx, budgets: renderBudgets, goals: renderGoals, rules: renderRules, reports: renderReports })[p]?.(); }

/* ---------------- dashboard ---------------- */
function avgMonthlySavings() { const ms = monthsOf(txs).slice(-3); return ms.length ? ms.reduce((a, m) => a + monthSummary(txs, m).net, 0) / ms.length : 0; }
function renderDashboard() {
  const s = monthSummary(txs, month), ms = monthsOf(txs), prev = ms.filter((m) => m < month).slice(-3);
  const avgSpend = prev.length ? prev.reduce((a, m) => a + monthSummary(txs, m).spend, 0) / prev.length : s.spend;
  const subs = recurring(txs);
  $('#tiles').innerHTML = [['Income', money(s.income)], ['Spending', money(s.spend)], ['Savings rate', s.savingsRate == null ? '—' : Math.round(s.savingsRate * 100) + '%'], ['vs 3-month average', (s.spend >= avgSpend ? '+' : '−') + money(Math.abs(s.spend - avgSpend)).replace('−', '')], ['Recurring / month', money(subs.reduce((a, x) => a + x.perMonth, 0))], ['Uncategorized', txs.filter((t) => t.src === 'unknown').length]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  renderStack(ms);
  renderDonut(s.byCat);
  const st = budgetStatus(txs, S.budgets, month, S.rollover).slice(0, 6);
  $('#budgetMini').innerHTML = st.map((b) => `<div class="budget"><div class="top"><span><i class="sw" style="background:${CATS[b.cat]}"></i>${b.cat}</span><span class="amt">${money(b.spent)} / ${money(b.limit)}</span></div><div class="bar ${b.pct > 1 ? 'over' : ''}"><span style="width:${Math.min(100, b.pct * 100)}%;${b.pct <= 1 ? 'background:' + CATS[b.cat] : ''}"></span></div></div>`).join('') || '<div class="empty">No budgets set.</div>';
  $('#subs').innerHTML = subs.length ? subs.map((x) => `<div class="list-row"><span><b>${esc(x.merchant)}</b> <span class="tag">${x.freq}</span>${x.change ? ` <span class="tag ${x.change > 0 ? 'bad' : 'good'}">${x.change > 0 ? 'price up' : 'price down'} ${money(Math.abs(x.change), 2)}</span>` : ''}</span><span class="amt">${money(x.last, 2)} · <b>${money(x.annual)}/yr</b></span></div>`).join('') : '<div class="empty">No recurring charges detected.</div>';
  const an = anomalies(txs).slice(0, 8);
  $('#anoms').innerHTML = an.length ? an.map((a) => `<div class="list-row"><span><span class="tag ${a.sev}">${a.why}</span> ${esc(a.t.merchant)}<div class="small muted">${a.t.date} · ${a.t.cat}</div></span><span class="amt">${money(a.t.amount, 2)}</span></div>`).join('') : '<div class="empty">Nothing unusual.</div>';
}
function renderStack(ms) {
  const W = 560, H = 230, pb = 26, pl = 48;
  const data = ms.map((m) => ({ m, by: monthSummary(txs, m).byCat }));
  data.forEach((d) => { d.tot = Object.values(d.by).reduce((a, b) => a + b, 0); });
  const max = Math.max(...data.map((d) => d.tot), 1) * 1.08, bw = (W - pl) / data.length;
  let s = '';
  for (let g = 0; g <= 4; g++) { const y = H - pb - ((H - pb - 8) * g) / 4; s += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${money(Math.round(max * g / 4))}</text>`; }
  data.forEach((d, i) => {
    let y = H - pb; const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
    SPEND.forEach((c) => { const v = d.by[c] || 0; if (!v) return; const hh = ((H - pb - 8) * v) / max; y -= hh; s += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${CATS[c]}" ${d.m === month ? '' : 'opacity=".5"'}><title>${c}: ${money(v)}</title></rect>`; });
    s += `<text x="${x + w / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${d.m === month ? 'var(--text)' : 'var(--muted)'}" font-weight="${d.m === month ? 700 : 400}">${new Date(d.m + '-15').toLocaleDateString(undefined, { month: 'short' })}</text>`;
  });
  $('#stack').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly spending by category">${s}</svg>`;
  $('#legend').innerHTML = SPEND.filter((c) => txs.some((t) => t.cat === c)).map((c) => `<span><i style="background:${CATS[c]}"></i>${c}</span>`).join('');
}
function renderDonut(by) {
  const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1, R = 70, r = 46, C = 80;
  let a0 = -Math.PI / 2, s = '';
  Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
    const a1 = a0 + (2 * Math.PI * v) / tot, large = a1 - a0 > Math.PI ? 1 : 0, p = (rad, a) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    s += `<path d="M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1 - 0.001)} L${p(r, a1 - 0.001)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z" fill="${CATS[c]}"><title>${c}: ${money(v)} (${Math.round((100 * v) / tot)}%)</title></path>`;
    a0 = a1;
  });
  $('#donut').innerHTML = `<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Category share">${s}<text x="80" y="76" text-anchor="middle" font-size="11" fill="var(--muted)">spent</text><text x="80" y="94" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${money(tot)}</text></svg>`;
}
$('#coach').onclick = (e) => busy(e.currentTarget, async () => {
  const s = monthSummary(txs, month), prev = monthsOf(txs).filter((m) => m < month).slice(-3), prevAvg = {};
  prev.forEach((m) => Object.entries(monthSummary(txs, m).byCat).forEach(([c, v]) => (prevAvg[c] = Math.round((prevAvg[c] || 0) + v / prev.length))));
  const summary = { month, income: Math.round(s.income), spending_by_category: Object.fromEntries(Object.entries(s.byCat).map(([k, v]) => [k, Math.round(v)])), previous_3_month_avg: prevAvg, budgets: S.budgets, recurring: recurring(txs).map((r) => ({ merchant: r.merchant, per_year: Math.round(r.annual), price_change: +r.change.toFixed(2) })), anomalies: anomalies(txs).slice(0, 5).map((a) => ({ merchant: a.t.merchant, amount: -a.t.amount, why: a.why })), goals: S.goals.map((g) => ({ name: g.name, target: g.target, saved: g.saved, deadline: g.deadline })) };
  const text = await AI.chat([
    { role: 'system', content: 'You are a practical budgeting coach. From aggregated monthly data, give: a one-line headline; 3 specific insights with numbers (trend vs average, budget overruns, subscription costs or price increases, goal progress); 3 concrete next actions with an estimated monthly saving each. Budgeting only. No investment, tax or legal advice. Markdown, max 200 words.' },
    { role: 'user', content: JSON.stringify(summary) },
  ], { temperature: 0.4, demo: () => demoCoach(summary) });
  $('#coachOut').innerHTML = md(text);
});
function demoCoach(s) {
  const top = Object.entries(s.spending_by_category).sort((a, b) => b[1] - a[1]);
  const over = top.filter(([c, v]) => s.budgets[c] && v > s.budgets[c]);
  const subs = s.recurring.reduce((a, r) => a + r.per_year, 0);
  return `### ${over.length ? `${over.length} categor${over.length > 1 ? 'ies' : 'y'} over budget this month` : 'Every category is within budget'}\n\n- **${top[0][0]}** was the largest category at **$${top[0][1]}** (3-month average $${s.previous_3_month_avg[top[0][0]] ?? '—'}).\n- Recurring charges total **$${subs.toLocaleString()} per year**${s.recurring.find((r) => r.price_change > 0) ? `; **${s.recurring.find((r) => r.price_change > 0).merchant}** raised its price recently` : ''}.\n- ${s.anomalies.length ? `${s.anomalies.length} unusual charge(s), including **${s.anomalies[0].merchant}** ($${s.anomalies[0].amount.toFixed(2)}).` : 'No unusual charges.'}\n\n**Next actions**\n1. Set a weekly cap for ${over[0]?.[0] || 'Dining'} (about $${Math.round((over[0]?.[1] || 200) * 0.15)} per month saved).\n2. Cancel subscriptions you used fewer than twice last month.\n3. Dispute any duplicate charges listed under Anomalies.\n\n*Sample output. Add an API key in Settings for a live analysis.*`;
}

/* ---------------- transactions ---------------- */
function renderTx() {
  const ms = monthsOf(txs);
  const fm = $('#fMonth'), fc = $('#fCat');
  const cm = fm.value || month, cc = fc.value;
  fm.innerHTML = '<option value="*">All months</option>' + ms.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  fm.value = cm === '*' || ms.includes(cm) ? cm : month;
  fc.innerHTML = '<option value="">All categories</option>' + Object.keys(CATS).map((c) => `<option>${c}</option>`).join('');
  fc.value = cc;
  const q = $('#filter').value.toLowerCase(), src = $('#fSrc').value;
  const list = txs.filter((t) => (fm.value === '*' || t.date.startsWith(fm.value)) && (!fc.value || t.cat === fc.value) && (!src || t.src === src) && (!q || (t.desc + ' ' + t.merchant + ' ' + (t.note || '')).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  const net = list.reduce((a, t) => a + (t.excluded ? 0 : t.amount), 0);
  $('#txCount').textContent = `${list.length} transactions · net ${money(net, 2)}`;
  const tb = $('#txTable');
  tb.innerHTML = '<tr><th>Date</th><th>Description</th><th>Category</th><th>Source</th><th>Note</th><th style="text-align:right">Amount</th><th></th></tr>';
  list.slice(0, 400).forEach((t) => {
    const sel = h('select', { 'aria-label': 'Category', onchange: (e) => setCategory(t, e.target.value) }, Object.keys(CATS).map((c) => h('option', { value: c, selected: c === t.cat }, c)));
    const note = h('input', { class: 'input note', value: t.note || '', placeholder: 'add note', onchange: (e) => { (S.meta[t.id] ||= {}).note = e.target.value; save(); } });
    tb.append(h('tr', { class: t.excluded ? 'excluded' : '' },
      h('td', { class: 'mono small' }, t.date),
      h('td', {}, t.desc, h('div', { class: 'small muted' }, t.merchant)),
      h('td', {}, sel),
      h('td', {}, h('span', { class: 'tag ' + (t.src === 'unknown' ? 'warn' : t.src === 'ai' ? 'accent' : '') }, t.src)),
      h('td', {}, note),
      h('td', { class: 'amt ' + (t.amount > 0 ? 'in' : ''), style: 'text-align:right' }, money(t.amount, 2)),
      h('td', {}, h('button', { class: 'btn ghost sm', title: t.excluded ? 'Include in totals' : 'Exclude from totals', onclick: () => { (S.meta[t.id] ||= {}).excluded = !t.excluded; save(); rerender(); } }, t.excluded ? 'Include' : 'Exclude'))));
  });
}
/* Changing a category asks whether to apply it to the merchant or just this transaction. */
function setCategory(t, cat) {
  const all = txs.filter((x) => x.merchant === t.merchant).length;
  if (all > 1 && confirm(`Apply "${cat}" to all ${all} transactions from ${t.merchant}?\n\nOK = all of them (saved as a merchant rule) · Cancel = just this one`)) S.overrides[t.merchant] = cat;
  else (S.meta[t.id] ||= {}).catOverride = cat;
  save(); rerender(); toast('Category updated');
}
['#filter'].forEach((s) => $(s).addEventListener('input', renderTx));
['#fMonth', '#fCat', '#fSrc'].forEach((s) => ($(s).onchange = renderTx));
$('#csv').onchange = async (e) => {
  try {
    const list = importCSV(await e.target.files[0].text());
    if (!list.length) throw new Error('No transactions found in that file');
    const replace = confirm(`Imported ${list.length} transactions.\n\nOK = replace the current data · Cancel = add to it`);
    const stamp = Date.now().toString(36);
    const fresh = list.map((t, i) => ({ ...t, id: stamp + i }));
    S.raw = replace ? fresh : S.raw.concat(fresh);
    if (replace) { S.meta = {}; S.budgets = {}; }
    save(); month = null; rerender(); toast(`Imported ${list.length} transactions`);
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
};
$('#addTx').onclick = () => {
  const desc = prompt('Description'); if (!desc) return;
  const amount = parseAmount(prompt('Amount (negative for spending)', '-20') || '');
  if (!amount) return toast('Enter a non-zero amount', 'err');
  const date = parseDate(prompt('Date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)) || '');
  if (!date) return toast('Invalid date', 'err');
  S.raw.push({ id: 'm' + uid(), date, desc, amount });
  save(); rerender(); toast('Transaction added');
};
$('#exportTx').onclick = () => download('transactions.csv', toCSV(txs), 'text/csv');
$('#sample').onclick = () => { if (confirm('Replace all data with the sample dataset?')) { S = freshState(); save(); month = null; rerender(); } };
$('#aiCat').onclick = (e) => busy(e.currentTarget, async () => {
  const unknown = [...new Set(txs.filter((t) => t.src === 'unknown').map((t) => t.merchant))];
  if (!unknown.length) return toast('Everything is already categorized');
  const out = await AI.chat([
    { role: 'system', content: `Categorize bank merchants. Allowed categories: ${Object.keys(CATS).join(', ')}. Use knowledge of brands and naming patterns ("TST*" = restaurant POS, "SQ*" = small business). Return JSON {"map":{"MERCHANT":"Category"}}.` },
    { role: 'user', content: unknown.slice(0, 80).join('\n') },
  ], { json: true, temperature: 0, demo: () => ({ map: Object.fromEntries(unknown.map((m) => [m, /CAFE|DUMPLING|KITCHEN|TACO|NOODLE|BAKERY/.test(m) ? 'Dining' : /KOFI|PATREON|SUBSTACK/.test(m) ? 'Subscriptions' : /CRAFT|BOUTIQUE|MARKET/.test(m) ? 'Shopping' : /VET|PET/.test(m) ? 'Health' : 'Other'])) }) });
  let n = 0;
  Object.entries(out.map || {}).forEach(([m, c]) => { if (CATS[c] && c !== 'Other') { S.aiCats[m] = c; n++; } });
  save(); rerender(); toast(`Categorized ${n} merchant${n === 1 ? '' : 's'}`);
});

/* ---------------- budgets ---------------- */
function renderBudgets() {
  $('#rollover').checked = !!S.rollover;
  const st = budgetStatus(txs, S.budgets, month, S.rollover), ms = monthsOf(txs).slice(-6);
  const over = st.filter((b) => b.pct > 1);
  $('#budgetSummary').textContent = `${monthLabel(month)}: ${money(st.reduce((a, b) => a + b.spent, 0))} spent of ${money(st.reduce((a, b) => a + b.limit, 0))} budgeted${over.length ? ` · ${over.length} over budget` : ''}.`;
  const tb = $('#budgetTable');
  tb.innerHTML = `<tr><th>Category</th><th>Monthly budget</th>${S.rollover ? '<th>Carry-over</th>' : ''}<th>Spent</th><th>Left</th><th style="width:28%">Progress</th><th>Last 6 months</th></tr>`;
  const cats = SPEND.filter((c) => S.budgets[c] != null || txs.some((t) => t.cat === c && t.amount < 0));
  cats.forEach((c) => {
    const b = st.find((x) => x.cat === c) || { budget: S.budgets[c] || 0, carry: 0, limit: S.budgets[c] || 0, spent: monthSummary(txs, month).byCat[c] || 0 };
    b.left = b.limit - b.spent; b.pct = b.limit ? b.spent / b.limit : 0;
    const hist = ms.map((m) => monthSummary(txs, m).byCat[c] || 0), hmax = Math.max(1, ...hist, S.budgets[c] || 0);
    const input = h('input', { class: 'input', type: 'number', min: 0, step: 25, value: S.budgets[c] || 0, style: 'width:110px', 'aria-label': c + ' budget', onchange: (e) => { S.budgets[c] = Math.max(0, +e.target.value || 0); save(); renderBudgets(); } });
    tb.append(h('tr', {},
      h('td', {}, h('i', { class: 'sw', style: `background:${CATS[c]}` }), c), h('td', {}, input),
      S.rollover ? h('td', { class: 'amt ' + (b.carry >= 0 ? 'in' : '') }, money(b.carry)) : null,
      h('td', { class: 'amt' }, money(b.spent)), h('td', { class: 'amt', style: `color:${b.left < 0 ? 'var(--bad)' : 'inherit'}` }, money(b.left)),
      h('td', {}, h('div', { class: 'bar ' + (b.pct > 1 ? 'over' : '') }, h('span', { style: `width:${Math.min(100, b.pct * 100)}%` }))),
      h('td', { html: `<svg width="120" height="28" viewBox="0 0 120 28" aria-label="Spending history">${hist.map((v, i) => `<rect x="${i * 20 + 2}" y="${28 - (v / hmax) * 26}" width="14" height="${(v / hmax) * 26}" rx="2" fill="${S.budgets[c] && v > S.budgets[c] ? 'var(--bad)' : CATS[c]}" opacity=".85"><title>${ms[i]}: ${money(v)}</title></rect>`).join('')}${S.budgets[c] ? `<line x1="0" x2="120" y1="${28 - (S.budgets[c] / hmax) * 26}" y2="${28 - (S.budgets[c] / hmax) * 26}" stroke="var(--text)" stroke-dasharray="3 2" opacity=".5"/>` : ''}</svg>` })));
  });
}
$('#rollover').onchange = (e) => { S.rollover = e.target.checked; save(); renderBudgets(); };
$('#suggest').onclick = () => { S.budgets = suggestBudgets(txs); save(); renderBudgets(); toast('Budgets set from your 3-month average'); };

/* ---------------- goals ---------------- */
function renderGoals() {
  const monthly = Math.max(0, avgMonthlySavings());
  const shares = S.goals.length ? monthly / S.goals.length : 0;
  $('#goalSummary').textContent = `You saved about ${money(monthly)} per month over the last 3 months. Projections split that evenly across ${S.goals.length} goal${S.goals.length === 1 ? '' : 's'}.`;
  const box = $('#goalList');
  box.innerHTML = '';
  if (!S.goals.length) box.append(h('div', { class: 'empty' }, 'No goals yet.'));
  S.goals.forEach((g) => {
    const p = goalProjection(g, shares, Date.now());
    const C = 2 * Math.PI * 34;
    box.append(h('div', { class: 'card goal' },
      h('div', { class: 'row', style: 'gap:16px;align-items:center' },
        h('div', { html: `<svg width="90" height="90" viewBox="0 0 90 90" aria-label="${Math.round(p.pct * 100)}% saved"><circle cx="45" cy="45" r="34" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="45" cy="45" r="34" fill="none" stroke="${g.color || 'var(--accent)'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * p.pct} ${C}" transform="rotate(-90 45 45)"/><text x="45" y="50" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)">${Math.round(p.pct * 100)}%</text></svg>` }),
        h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, g.name), h('div', { class: 'small muted' }, `${money(g.saved)} of ${money(g.target)} · ${money(p.left)} to go`),
          h('div', { class: 'small', style: 'margin-top:6px' }, p.left === 0 ? 'Goal reached.' : p.eta ? `At ${money(shares)}/month: reached around ${new Date(p.eta).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'No savings to project from yet.'),
          g.deadline ? h('div', { class: 'small', style: `color:${p.onTrack ? 'var(--good)' : 'var(--bad)'}` }, `Deadline ${g.deadline}: needs ${money(p.needed)}/month · ${p.onTrack ? 'on track' : 'behind'}`) : null)),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn sm', onclick: () => { const v = parseAmount(prompt('Add to this goal', '100') || ''); if (v) { g.saved = Math.max(0, g.saved + v); save(); renderGoals(); } } }, 'Add money'),
        h('button', { class: 'btn sm ghost', onclick: () => editGoal(g) }, 'Edit'),
        h('button', { class: 'btn sm ghost danger', onclick: () => { if (confirm('Delete goal?')) { S.goals = S.goals.filter((x) => x !== g); save(); renderGoals(); } } }, 'Delete'))));
  });
}
function editGoal(g) {
  const name = prompt('Goal name', g?.name || ''); if (!name) return;
  const target = parseAmount(prompt('Target amount', g?.target || 1000) || ''); if (!target) return;
  const saved = parseAmount(prompt('Already saved', g?.saved || 0) || '0');
  const deadline = prompt('Deadline (YYYY-MM-DD, optional)', g?.deadline || '') || null;
  if (g) Object.assign(g, { name, target, saved, deadline: deadline && parseDate(deadline) });
  else S.goals.push({ id: uid(), name, target, saved, deadline: deadline && parseDate(deadline), color: Object.values(CATS)[S.goals.length % 8] });
  save(); renderGoals();
}
$('#addGoal').onclick = () => editGoal(null);

/* ---------------- rules ---------------- */
function renderRules() {
  const tb = $('#ruleTable');
  tb.innerHTML = '<tr><th>#</th><th>Match</th><th>Category</th><th>Amount range</th><th>Matches</th><th></th></tr>';
  if (!S.rules.length) tb.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'No rules yet.')));
  S.rules.forEach((r, i) => {
    const hits = S.raw.filter((t) => matchRule(r, t)).length;
    tb.append(h('tr', {},
      h('td', { class: 'mono' }, i + 1),
      h('td', {}, h('span', { class: 'small muted' }, `${r.field} ${r.op} `), h('code', {}, r.value)),
      h('td', {}, h('i', { class: 'sw', style: `background:${CATS[r.category]}` }), r.category),
      h('td', { class: 'small' }, r.min != null || r.max != null ? `${r.min != null ? '≥ $' + r.min : ''} ${r.max != null ? '≤ $' + r.max : ''}` : 'any'),
      h('td', {}, hits),
      h('td', {}, h('div', { class: 'row' },
        h('button', { class: 'btn ghost sm', disabled: i === 0, 'aria-label': 'Move up', onclick: () => { [S.rules[i - 1], S.rules[i]] = [S.rules[i], S.rules[i - 1]]; save(); rerender(); } }, '↑'),
        h('button', { class: 'btn ghost sm', onclick: () => ruleForm(r) }, 'Edit'),
        h('button', { class: 'btn ghost sm danger', onclick: () => { S.rules.splice(i, 1); save(); rerender(); } }, 'Delete')))));
  });
  const ov = Object.entries(S.overrides);
  $('#overrideList').innerHTML = ov.length ? ov.map(([m, c]) => `<div class="list-row"><span>${esc(m)} → <b>${c}</b></span><button class="btn ghost sm" data-m="${esc(m)}">Remove</button></div>`).join('') : '<div class="small muted">Choosing a category for all transactions from a merchant creates an override here.</div>';
  $$('#overrideList [data-m]').forEach((b) => (b.onclick = () => { delete S.overrides[b.dataset.m]; save(); rerender(); }));
  testRule();
}
function ruleForm(r) {
  const value = prompt('Text to match', r?.value || ''); if (!value) return;
  const field = (prompt('Match against "merchant" or "desc"?', r?.field || 'desc') || 'desc').trim() === 'merchant' ? 'merchant' : 'desc';
  const op = ({ equals: 'equals', regex: 'regex' })[(prompt('Operator: contains, equals or regex', r?.op || 'contains') || '').trim()] || 'contains';
  const category = prompt(`Category (${Object.keys(CATS).join(', ')})`, r?.category || 'Other');
  if (!CATS[category]) return toast('Unknown category', 'err');
  const min = prompt('Minimum amount (optional)', r?.min ?? ''), max = prompt('Maximum amount (optional)', r?.max ?? '');
  const rule = { id: r?.id || uid(), field, op, value, category, min: min === '' || min == null ? null : +min, max: max === '' || max == null ? null : +max };
  if (r) Object.assign(r, rule); else S.rules.push(rule);
  save(); rerender(); toast(`Rule saved. It matches ${S.raw.filter((t) => matchRule(rule, t)).length} transactions.`);
}
$('#addRule').onclick = () => ruleForm(null);
function testRule() {
  const desc = $('#ruleTest').value.trim();
  if (!desc) { $('#ruleTestOut').textContent = ''; return; }
  const t = { desc, amount: -(Math.abs(+$('#ruleTestAmt').value) || 10) };
  const r = categorize(t, { rules: S.rules, overrides: S.overrides, aiCats: S.aiCats });
  $('#ruleTestOut').innerHTML = `Merchant <code>${esc(r.merchant)}</code> → <b>${r.cat}</b> <span class="tag">${r.src}${r.ruleId ? ' #' + (S.rules.findIndex((x) => x.id === r.ruleId) + 1) : ''}</span>`;
}
['#ruleTest', '#ruleTestAmt'].forEach((s) => $(s).addEventListener('input', testRule));

/* ---------------- reports ---------------- */
function renderReports() {
  const ms = monthsOf(txs), sums = ms.map((m) => monthSummary(txs, m));
  const W = 640, H = 220, pl = 52, pb = 26, max = Math.max(1, ...sums.map((s) => Math.max(s.income, s.spend))) * 1.1;
  const x = (i) => pl + (i * (W - pl - 20)) / Math.max(1, ms.length - 1), y = (v) => H - pb - (v / max) * (H - pb - 10);
  let s = '';
  for (let g = 0; g <= 4; g++) { const v = (max * g) / 4; s += `<line x1="${pl}" x2="${W - 20}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${money(v)}</text>`; }
  sums.forEach((m, i) => { const bw = 18; s += `<rect x="${x(i) - bw / 2}" y="${y(Math.max(0, m.net))}" width="${bw}" height="${Math.abs(y(0) - y(Math.abs(m.net)))}" fill="${m.net >= 0 ? 'var(--good)' : 'var(--bad)'}" opacity=".25"><title>net ${money(m.net)}</title></rect><text x="${x(i)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="var(--muted)">${new Date(m.month + '-15').toLocaleDateString(undefined, { month: 'short' })}</text>`; });
  s += `<polyline fill="none" stroke="var(--good)" stroke-width="2.5" points="${sums.map((m, i) => x(i) + ',' + y(m.income)).join(' ')}"/><polyline fill="none" stroke="var(--bad)" stroke-width="2.5" points="${sums.map((m, i) => x(i) + ',' + y(m.spend)).join(' ')}"/>`;
  $('#cashflow').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cash flow">${s}</svg><div class="legend"><span><i style="background:var(--good)"></i>income</span><span><i style="background:var(--bad)"></i>spending</span><span><i style="background:var(--good);opacity:.3"></i>net</span></div>`;
  const f = forecast(txs, 3);
  $('#forecast').innerHTML = `<table><tr><th>Month</th><th>Income</th><th>Spending</th><th>Fixed costs</th><th>Net</th></tr>${f.map((m) => `<tr><td>${monthLabel(m.month)}</td><td class="amt in">${money(m.income)}</td><td class="amt">${money(m.spend)}</td><td class="amt">${money(m.fixed)}</td><td class="amt" style="color:${m.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(m.net)}</td></tr>`).join('')}</table><p class="small muted" style="margin-top:8px">Recurring charges are treated as fixed; everything else uses your 3-month average.</p>`;
  const last = sums[sums.length - 1], prev3 = sums.slice(-4, -1);
  $('#trends').innerHTML = `<table><tr><th>Category</th><th>3-month avg</th><th>${last ? monthLabel(last.month).split(' ')[0] : ''}</th><th>Change</th></tr>${SPEND.filter((c) => sums.some((m) => m.byCat[c])).map((c) => { const avg = prev3.reduce((a, m) => a + (m.byCat[c] || 0), 0) / Math.max(1, prev3.length), cur = last.byCat[c] || 0, ch = avg ? (cur - avg) / avg : 0; return `<tr><td><i class="sw" style="background:${CATS[c]}"></i>${c}</td><td class="amt">${money(avg)}</td><td class="amt">${money(cur)}</td><td class="amt" style="color:${ch > 0.1 ? 'var(--bad)' : ch < -0.1 ? 'var(--good)' : 'inherit'}">${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%</td></tr>`; }).join('')}</table>`;
}

/* ---------------- routing ---------------- */
Router.on('dashboard', renderDashboard);
Router.on('transactions', renderTx);
Router.on('budgets', renderBudgets);
Router.on('goals', renderGoals);
Router.on('rules', renderRules);
Router.on('reports', renderReports);
derive();

/* ================= AI command box ================= */
const catName = (c) => { const k = Object.keys(CATS).find((x) => x.toLowerCase() === String(c).toLowerCase()); if (!k) throw new Error(`Unknown category "${c}". Use: ${Object.keys(CATS).join(', ')}`); return k; };
const monthArg = (m) => { const ms = monthsOf(txs); if (!m || m === 'current' || m === 'latest') return month; if (m === 'last' || m === 'previous') return ms[ms.indexOf(month) - 1] || month; if (ms.includes(m)) return m; const hit = ms.find((x) => monthLabel(x).toLowerCase().startsWith(String(m).toLowerCase())); if (!hit) throw new Error(`No data for ${m}`); return hit; };
Copilot.register({
  context: () => `Selected month ${month}; months with data: ${monthsOf(txs).join(', ')}. Categories: ${Object.keys(CATS).join(', ')}. Budgets: ${JSON.stringify(S.budgets)}. ${S.rules.length} rules. Goals: ${S.goals.map((g) => `${g.name} ${g.saved}/${g.target}`).join(', ') || 'none'}. ${txs.filter((t) => t.src === 'unknown').length} uncategorized transactions.`,
  actions: [
    { name: 'set_budgets', description: 'Set monthly budgets for one or more categories', params: { budgets: 'object like {"Dining": 300, "Groceries": 450}' },
      run: ({ budgets }) => { const done = Object.entries(budgets || {}).map(([c, v]) => { const k = catName(c); S.budgets[k] = Math.max(0, +v || 0); return `${k} ${money(S.budgets[k])}`; }); save(); Router.go('budgets'); rerender(); return 'Budgets: ' + done.join(', '); } },
    { name: 'add_rule', description: 'Add a categorization rule (applies to all past and future transactions)', params: { match: 'text to look for', category: 'category', field: 'desc | merchant (default desc)', op: 'contains | equals | regex (default contains)', min: 'optional minimum amount', max: 'optional maximum amount' },
      run: ({ match, category, field, op, min, max }) => { const rule = { id: uid(), field: field === 'merchant' ? 'merchant' : 'desc', op: ['equals', 'regex'].includes(op) ? op : 'contains', value: String(match), category: catName(category), min: min == null || min === '' ? null : +min, max: max == null || max === '' ? null : +max }; S.rules.unshift(rule); save(); Router.go('rules'); rerender(); return `Rule added: ${rule.field} ${rule.op} "${rule.value}" -> ${rule.category}, matching ${S.raw.filter((t) => matchRule(rule, t)).length} transactions`; } },
    { name: 'recategorize_merchant', description: 'Put every transaction from a merchant into a category', params: { merchant: 'merchant name as shown', category: 'category' },
      run: ({ merchant, category }) => { const m = [...new Set(txs.map((t) => t.merchant))].find((x) => x.toLowerCase() === String(merchant).toLowerCase()) || [...new Set(txs.map((t) => t.merchant))].find((x) => x.toLowerCase().includes(String(merchant).toLowerCase())); if (!m) throw new Error(`No merchant like ${merchant}`); S.overrides[m] = catName(category); save(); rerender(); return `${m} is now ${S.overrides[m]}`; } },
    { name: 'add_transaction', description: 'Record a transaction (negative amount for spending)', params: { date: 'YYYY-MM-DD', description: 'text', amount: 'number, negative for spending' },
      run: ({ date, description, amount }) => { const d = parseDate(date || new Date().toISOString().slice(0, 10)); if (!d || !+amount) throw new Error('Need a date and non-zero amount'); S.raw.push({ id: 'm' + uid(), date: d, desc: description, amount: +amount }); save(); rerender(); const t = txs.find((x) => x.desc === description && x.date === d); return `Added ${description} ${money(+amount, 2)} as ${t ? t.cat : 'uncategorized'}`; } },
    { name: 'categorize_unknown', description: 'Let the AI categorize merchants no rule recognizes', params: {}, run: async () => { await $('#aiCat').onclick({ currentTarget: $('#aiCat') }); return `${txs.filter((t) => t.src === 'unknown').length} still uncategorized`; } },
    { name: 'add_goal', description: 'Create a savings goal', params: { name: 'goal', target: 'amount', saved: 'optional amount already saved', deadline: 'optional YYYY-MM-DD' },
      run: ({ name, target, saved, deadline }) => { S.goals.push({ id: uid(), name, target: +target, saved: +saved || 0, deadline: deadline ? parseDate(deadline) : null, color: Object.values(CATS)[S.goals.length % 8] }); save(); Router.go('goals'); renderGoals(); return `Goal ${name} for ${money(+target)}`; } },
    { name: 'contribute_to_goal', description: 'Add money to a goal', params: { goal: 'goal name', amount: 'number' }, run: ({ goal, amount }) => { const g = S.goals.find((x) => x.name.toLowerCase().includes(String(goal).toLowerCase())); if (!g) throw new Error('No goal ' + goal); g.saved = Math.max(0, g.saved + +amount); save(); Router.go('goals'); renderGoals(); return `${g.name}: ${money(g.saved)} of ${money(g.target)}`; } },
    { name: 'show_transactions', description: 'Filter the transactions table', params: { search: 'optional text', category: 'optional category', month: 'optional YYYY-MM, "all", or "last"' },
      run: ({ search, category, month: m }) => { Router.go('transactions'); $('#filter').value = search || ''; renderTx(); $('#fMonth').value = m === 'all' ? '*' : monthArg(m); $('#fCat').value = category ? catName(category) : ''; renderTx(); return $('#txCount').textContent; } },
    { name: 'select_month', description: 'Switch the dashboard to a month', params: { month: 'YYYY-MM, month name, or "last"' }, run: ({ month: m }) => { month = monthArg(m); rerender(); Router.go('dashboard'); return `Showing ${monthLabel(month)}`; } },
    { name: 'coach', description: 'Write the AI coaching summary for the selected month on the dashboard', params: {}, run: async () => { Router.go('dashboard'); await $('#coach').onclick({ currentTarget: $('#coach') }); return 'Coaching notes are on the dashboard'; } },
    { name: 'month_summary', query: true, description: 'Look up income, spending by category, budgets and top merchants for a month', params: { month: 'YYYY-MM, month name, "current" or "last"' },
      run: ({ month: m }) => { const k = monthArg(m), s = monthSummary(txs, k), list = txs.filter((t) => t.date.startsWith(k) && t.amount < 0 && !t.excluded), byM = {}; list.forEach((t) => (byM[t.merchant] = (byM[t.merchant] || 0) - t.amount)); return JSON.stringify({ month: monthLabel(k), income: Math.round(s.income), spend: Math.round(s.spend), savingsRate: s.savingsRate, byCategory: Object.fromEntries(Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, Math.round(v)])), budgets: budgetStatus(txs, S.budgets, k, S.rollover).map((b) => ({ cat: b.cat, spent: Math.round(b.spent), limit: Math.round(b.limit) })), topMerchants: Object.entries(byM).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x, v]) => `${x} ${Math.round(v)}`), recurring: recurring(txs).map((r) => `${r.merchant} ${r.freq}`) }); } },
  ],
});
