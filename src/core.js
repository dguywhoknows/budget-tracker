/* core.js — parsing, categorization, recurring/anomaly detection, budgets, goals and forecasts (pure, unit-tested). */

var CATS = {
  Housing: '#5b5bd6', Groceries: '#1f9d63', Dining: '#e2703a', Transport: '#2f7de1', Shopping: '#d6457a', Subscriptions: '#7c5cd6',
  Utilities: '#0ea5a8', Health: '#c98a0b', Entertainment: '#e0b100', Travel: '#3fa7d6', Other: '#8a90a2', Income: '#16a34a', Transfers: '#64748b',
};
var SPEND = Object.keys(CATS).filter(function (c) { return c !== 'Income' && c !== 'Transfers'; });
var BUILTIN_RULES = [
  ['Income', /payroll|salary|direct dep|paycheque|paycheck|e-transfer received|interest paid/i],
  ['Transfers', /transfer to|credit card payment|payment - thank you|tfsa|rrsp contribution/i],
  ['Housing', /rent|mortgage|property mgmt|strata|condo fee/i],
  ['Groceries', /loblaws|no frills|costco|whole foods|metro|sobeys|walmart grocery|safeway|trader joe|kroger|aldi|freshco|farm boy/i],
  ['Dining', /starbucks|tim hortons|mcdonald|uber ?eats|doordash|skip ?the|restaurant|cafe|coffee|pizza|sushi|burger|chipotle|subway|bar & grill|bistro/i],
  ['Transport', /uber(?! ?eats)|lyft|shell|esso|petro|chevron|gas station|presto|transit|parking|go train/i],
  ['Subscriptions', /netflix|spotify|disney|apple\.com|icloud|youtube premium|adobe|chatgpt|openai|prime video|crave|patreon|gym|fitness|notion/i],
  ['Utilities', /hydro|electric|enbridge|water|rogers|bell canada|telus|fido|internet|wireless|comcast|verizon/i],
  ['Shopping', /amazon|best buy|ikea|winners|h&m|zara|uniqlo|etsy|ebay|apple store|indigo|canadian tire/i],
  ['Health', /pharma|shoppers drug|rexall|dental|clinic|physio|optometr/i],
  ['Entertainment', /cineplex|cinema|steam|playstation|xbox|nintendo|ticketmaster|concert|bowling/i],
  ['Travel', /air canada|westjet|airbnb|hotel|expedia|booking\.com|via rail/i],
];

/* ---------- parsing ---------- */
function parseCSV(text) {
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (c) { return c.trim(); })) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur);
  if (row.some(function (c) { return c.trim(); })) rows.push(row);
  return rows;
}
function parseDate(s, dayFirst) {
  s = String(s).trim();
  var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    var a = +m[1], b = +m[2], y = m[3].length === 2 ? '20' + m[3] : m[3];
    if (dayFirst || a > 12) { var t = a; a = b; b = t; }
    return y + '-' + String(a).padStart(2, '0') + '-' + String(b).padStart(2, '0');
  }
  var d = new Date(s);
  return isNaN(d) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}
function parseAmount(s) {
  if (s == null || String(s).trim() === '') return 0;
  var t = String(s).replace(/[$,\s]/g, '');
  var neg = /^\(.*\)$/.test(t) || /-$/.test(t) || t[0] === '-';
  var v = parseFloat(t.replace(/[()-]/g, '')) || 0;
  return neg ? -v : v;
}
/* Bank-agnostic CSV import: header detection, signed amount OR debit/credit columns, sign normalization. */
function importCSV(text) {
  var rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV looks empty');
  var head = rows[0].map(function (c) { return c.toLowerCase().trim(); });
  var hasHeader = head.some(function (c) { return /date|desc|amount|debit|credit|merchant|payee/.test(c); });
  var find = function (re) { return head.findIndex(function (c) { return re.test(c); }); };
  var iDate = hasHeader ? find(/date|posted/) : 0, iDesc = hasHeader ? find(/desc|merchant|payee|details|name|memo|narrative/) : 1;
  var iAmt = hasHeader ? find(/amount|value/) : 2, iDeb = hasHeader ? find(/debit|withdraw|out/) : -1, iCred = hasHeader ? find(/credit|deposit|\bin\b/) : -1;
  if (iDate < 0) iDate = 0;
  if (iDesc < 0) iDesc = 1;
  var data = rows.slice(hasHeader ? 1 : 0);
  var dayFirst = data.some(function (r) { var m = String(r[iDate]).match(/^(\d{1,2})[-/.](\d{1,2})/); return m && +m[1] > 12; });
  var out = data.map(function (r, i) {
    var amount = iAmt >= 0 ? parseAmount(r[iAmt]) : 0;
    if (iDeb >= 0 && iCred >= 0 && iAmt < 0) amount = parseAmount(r[iCred]) - Math.abs(parseAmount(r[iDeb]));
    return { id: 'c' + i, date: parseDate(r[iDate], dayFirst), desc: String(r[iDesc] || '').trim(), amount: amount };
  }).filter(function (t) { return t.date && t.desc && t.amount; });
  var isDeposit = function (t) { return /payroll|salary|deposit|refund/i.test(t.desc); };
  var nonDeposits = out.filter(function (t) { return !isDeposit(t); });
  var positives = nonDeposits.filter(function (t) { return t.amount > 0; }).length;
  if (nonDeposits.length && positives >= nonDeposits.length * 0.8) out.forEach(function (t) { if (!/payroll|salary|deposit|refund/i.test(t.desc)) t.amount = -t.amount; });
  return out;
}

/* ---------- categorization ---------- */
function merchantOf(desc) {
  return String(desc).toUpperCase()
    .replace(/^(POS|PURCHASE|DEBIT|VISA|INTERAC|PRE-?AUTH(ORIZED)?|RECURRING|CHECKCARD)\s+/g, '')
    .replace(/^(SQ|TST|SP|PAYPAL|PP|IC)\s*\*\s*/, '')
    .replace(/\*.*$/, '')
    .replace(/(\s#?|#)\d{3,}.*$/, '')
    .replace(/\b(?=[\w./-]*\d[\w./-]*\d)[\w./-]+/g, '')
    .replace(/\s+(ON|BC|QC|AB|CA|NY|TX|WA|USA|CAN)\b.*$/, '')
    .replace(/[^A-Z0-9&'. ]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 28) || String(desc).slice(0, 28);
}
/* User rule: {id, field:'merchant'|'desc', op:'contains'|'equals'|'regex', value, category, min?, max?} */
function matchRule(rule, t) {
  var hay = rule.field === 'merchant' ? merchantOf(t.desc) : t.desc;
  var v = String(rule.value || '');
  var ok = rule.op === 'equals' ? hay.toLowerCase() === v.toLowerCase()
    : rule.op === 'regex' ? (function () { try { return new RegExp(v, 'i').test(hay); } catch (e) { return false; } })()
      : hay.toLowerCase().indexOf(v.toLowerCase()) >= 0;
  if (ok && rule.min != null && Math.abs(t.amount) < rule.min) ok = false;
  if (ok && rule.max != null && Math.abs(t.amount) > rule.max) ok = false;
  return ok && !!v;
}
/* Priority: per-transaction override > user rules (in order) > per-merchant override > built-ins > AI guess > Other/Income. */
function categorize(t, ctx) {
  ctx = ctx || {};
  var m = merchantOf(t.desc);
  var out = { merchant: m };
  if (t.catOverride) return Object.assign(out, { cat: t.catOverride, src: 'manual' });
  var ur = (ctx.rules || []).find(function (r) { return matchRule(r, t); });
  if (ur) return Object.assign(out, { cat: ur.category, src: 'rule', ruleId: ur.id });
  if (ctx.overrides && ctx.overrides[m]) return Object.assign(out, { cat: ctx.overrides[m], src: 'you' });
  for (var i = 0; i < BUILTIN_RULES.length; i++) if (BUILTIN_RULES[i][1].test(t.desc)) return Object.assign(out, { cat: BUILTIN_RULES[i][0], src: 'built-in' });
  if (t.amount > 0) return Object.assign(out, { cat: 'Income', src: 'built-in' });
  if (ctx.aiCats && ctx.aiCats[m]) return Object.assign(out, { cat: ctx.aiCats[m], src: 'ai' });
  return Object.assign(out, { cat: 'Other', src: 'unknown' });
}

/* ---------- aggregation ---------- */
function monthsOf(txs) { return Array.from(new Set(txs.map(function (t) { return t.date.slice(0, 7); }))).sort(); }
function spendOf(list) { return list.filter(function (t) { return t.amount < 0 && SPEND.indexOf(t.cat) >= 0 && !t.excluded; }); }
function byCategory(list) { var o = {}; spendOf(list).forEach(function (t) { o[t.cat] = (o[t.cat] || 0) - t.amount; }); return o; }
function monthSummary(txs, month) {
  var cur = txs.filter(function (t) { return t.date.indexOf(month) === 0 && !t.excluded; });
  var income = cur.filter(function (t) { return t.cat === 'Income'; }).reduce(function (a, t) { return a + t.amount; }, 0);
  var spend = -spendOf(cur).reduce(function (a, t) { return a + t.amount; }, 0);
  return { month: month, income: income, spend: spend, net: income - spend, savingsRate: income ? (income - spend) / income : null, byCat: byCategory(cur) };
}

/* Recurring charges: >=3 charges, regular intervals (75% within ±20%), stable amounts (variable bills allowed for utilities). */
function recurring(txs) {
  var by = {};
  txs.filter(function (t) { return t.amount < 0 && t.cat !== 'Transfers' && t.cat !== 'Groceries'; }).forEach(function (t) { (by[t.merchant] = by[t.merchant] || []).push(t); });
  var out = [];
  Object.keys(by).forEach(function (m) {
    var list = by[m];
    if (list.length < 3) return;
    list.sort(function (a, b) { return a.date.localeCompare(b.date); });
    var gaps = list.slice(1).map(function (t, i) { return (new Date(t.date) - new Date(list[i].date)) / 864e5; }).sort(function (a, b) { return a - b; });
    var med = gaps[Math.floor(gaps.length / 2)];
    var amts = list.map(function (t) { return -t.amount; }), mean = amts.reduce(function (a, b) { return a + b; }, 0) / amts.length;
    var cv = Math.sqrt(amts.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / amts.length) / mean;
    var freq = med >= 26 && med <= 35 ? 'monthly' : med >= 12 && med <= 16 ? 'biweekly' : med >= 6 && med <= 8 ? 'weekly' : med >= 350 && med <= 380 ? 'yearly' : null;
    var regular = gaps.filter(function (g) { return Math.abs(g - med) <= Math.max(3, med * 0.2); }).length / gaps.length;
    var variable = list[0].cat === 'Utilities';
    if (!freq || regular < 0.75 || cv > (variable ? 0.3 : 0.08)) return;
    var last = amts[amts.length - 1], ci = -1;
    for (var i = amts.length - 1; i > 0; i--) if (Math.abs(amts[i] - amts[i - 1]) / amts[i - 1] > 0.04) { ci = i; break; }
    var perMonth = last * { monthly: 1, biweekly: 26 / 12, weekly: 52 / 12, yearly: 1 / 12 }[freq];
    out.push({ merchant: m, freq: freq, last: last, perMonth: perMonth, annual: perMonth * 12, change: !variable && ci > 0 ? amts[ci] - amts[ci - 1] : 0, cat: list[0].cat, n: list.length, lastDate: list[list.length - 1].date });
  });
  return out.sort(function (a, b) { return b.annual - a.annual; });
}

/* Anomalies: robust z-score (median/MAD) per category, duplicate charges within a day, large first-time merchants. */
function anomalies(txs) {
  var out = [], byCat = {};
  spendOf(txs).forEach(function (t) { (byCat[t.cat] = byCat[t.cat] || []).push(-t.amount); });
  var stats = {};
  Object.keys(byCat).forEach(function (c) {
    var xs = byCat[c], s = xs.slice().sort(function (a, b) { return a - b; }), med = s[Math.floor(s.length / 2)];
    var mad = xs.map(function (x) { return Math.abs(x - med); }).sort(function (a, b) { return a - b; })[Math.floor(xs.length / 2)] || 1;
    stats[c] = { med: med, mad: mad };
  });
  var seen = {};
  var sorted = txs.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  sorted.forEach(function (t, i) {
    if (t.amount >= 0 || SPEND.indexOf(t.cat) < 0) return;
    var x = -t.amount, s = stats[t.cat], z = s ? (x - s.med) / (1.4826 * s.mad) : 0;
    if (z > 4 && x > 60 && x > s.med * 2.5) out.push({ t: t, kind: 'outlier', why: (x / s.med).toFixed(1) + '× your typical ' + t.cat.toLowerCase() + ' purchase', sev: z > 8 ? 'bad' : 'warn' });
    var dup = sorted.slice(0, i).some(function (o) { return o.merchant === t.merchant && o.amount === t.amount && Math.abs(new Date(t.date) - new Date(o.date)) <= 864e5; });
    if (dup && t.cat !== 'Groceries') out.push({ t: t, kind: 'duplicate', why: 'possible duplicate charge', sev: 'bad' });
    if (!seen[t.merchant] && x > 300 && t.cat !== 'Housing' && t.cat !== 'Travel') out.push({ t: t, kind: 'new-merchant', why: 'large first-time merchant', sev: 'warn' });
    seen[t.merchant] = true;
  });
  return out.reverse();
}

/* ---------- budgets ---------- */
/* Status per category for a month; with rollover, last month's unspent (or overspent) amount carries forward. */
function budgetStatus(txs, budgets, month, rollover) {
  var ms = monthsOf(txs), idx = ms.indexOf(month);
  var prev = idx > 0 ? monthSummary(txs, ms[idx - 1]).byCat : {};
  var cur = monthSummary(txs, month).byCat;
  return Object.keys(budgets).filter(function (c) { return budgets[c] > 0; }).map(function (c) {
    var carry = rollover && idx > 0 ? budgets[c] - (prev[c] || 0) : 0;
    var limit = Math.max(0, budgets[c] + carry), spent = cur[c] || 0;
    return { cat: c, budget: budgets[c], carry: carry, limit: limit, spent: spent, left: limit - spent, pct: limit ? spent / limit : spent ? Infinity : 0 };
  }).sort(function (a, b) { return b.pct - a.pct; });
}
/* Suggest budgets from the trailing average, rounded up to $25. */
function suggestBudgets(txs) {
  var ms = monthsOf(txs).slice(-3), sums = {};
  ms.forEach(function (m) { var c = monthSummary(txs, m).byCat; Object.keys(c).forEach(function (k) { sums[k] = (sums[k] || 0) + c[k]; }); });
  var out = {};
  Object.keys(sums).forEach(function (k) { out[k] = Math.ceil(sums[k] / Math.max(1, ms.length) / 25) * 25; });
  return out;
}

/* ---------- goals ---------- */
/* Months needed at the given monthly contribution, projected date, and required monthly amount to hit the deadline. */
function goalProjection(goal, monthly, now) {
  var left = Math.max(0, goal.target - goal.saved);
  var months = left === 0 ? 0 : monthly > 0 ? Math.ceil(left / monthly) : Infinity;
  var d = new Date(now); d.setMonth(d.getMonth() + (isFinite(months) ? months : 0));
  var res = { left: left, pct: goal.target ? Math.min(1, goal.saved / goal.target) : 0, months: months, eta: isFinite(months) ? d.toISOString().slice(0, 10) : null };
  if (goal.deadline) {
    var dl = new Date(goal.deadline), mLeft = Math.max(1, (dl.getFullYear() - new Date(now).getFullYear()) * 12 + dl.getMonth() - new Date(now).getMonth());
    res.needed = left / mLeft;
    res.onTrack = monthly >= res.needed;
  }
  return res;
}

/* ---------- forecasting ---------- */
/* Next n months: recurring charges are certain; other spending uses the 3-month average per category; income uses the 3-month average. */
function forecast(txs, n) {
  var ms = monthsOf(txs), recent = ms.slice(-3);
  if (!recent.length) return [];
  var avgIncome = recent.reduce(function (a, m) { return a + monthSummary(txs, m).income; }, 0) / recent.length;
  var rec = recurring(txs), recByCat = {};
  rec.forEach(function (r) { recByCat[r.cat] = (recByCat[r.cat] || 0) + r.perMonth; });
  var avgCat = {};
  recent.forEach(function (m) { var c = monthSummary(txs, m).byCat; Object.keys(c).forEach(function (k) { avgCat[k] = (avgCat[k] || 0) + c[k] / recent.length; }); });
  var last = ms[ms.length - 1], y = +last.slice(0, 4), mo = +last.slice(5, 7), out = [];
  for (var i = 1; i <= n; i++) {
    var mm = mo + i, yy = y + Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12) + 1;
    var spend = Object.keys(avgCat).reduce(function (a, k) { return a + Math.max(avgCat[k], recByCat[k] || 0); }, 0);
    out.push({ month: yy + '-' + String(mm).padStart(2, '0'), income: avgIncome, spend: spend, net: avgIncome - spend, fixed: Object.keys(recByCat).reduce(function (a, k) { return a + recByCat[k]; }, 0) });
  }
  return out;
}

function toCSV(txs) {
  var q = function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return ['date,description,merchant,category,amount,note'].concat(txs.map(function (t) { return [t.date, t.desc, t.merchant, t.cat, t.amount.toFixed(2), t.note || ''].map(q).join(','); })).join('\n');
}
