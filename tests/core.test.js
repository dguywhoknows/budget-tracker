const tx = (date, desc, amount, extra) => Object.assign({ id: date + desc + amount, date, desc, amount }, extra);
const enrich = (list, ctx) => list.map((t) => Object.assign(t, categorize(t, ctx)));

test('parseDate handles ISO, US, day-first and text dates', () => {
  assert.eq(parseDate('2026-3-5'), '2026-03-05');
  assert.eq(parseDate('03/05/2026'), '2026-03-05');
  assert.eq(parseDate('25/12/2025'), '2025-12-25', 'day > 12 implies day-first');
  assert.eq(parseDate('05/03/26', true), '2026-03-05');
  assert.eq(parseDate('not a date'), null);
});

test('parseAmount handles currency, thousands, parentheses and trailing minus', () => {
  assert.eq(parseAmount('$1,234.50'), 1234.5);
  assert.eq(parseAmount('(45.00)'), -45);
  assert.eq(parseAmount('12.30-'), -12.3);
  assert.eq(parseAmount(''), 0);
});

test('importCSV merges debit/credit columns', () => {
  const t = importCSV('Date,Description,Debit,Credit\n2026-01-02,STARBUCKS,5.25,\n2026-01-03,PAYROLL ACME,,2000');
  assert.deepEq(t.map((x) => x.amount), [-5.25, 2000]);
});

test('importCSV flips all-positive expense exports (except deposits)', () => {
  const t = importCSV('date,description,amount\n2026-01-02,NETFLIX,15.99\n2026-01-03,AMAZON,30\n2026-01-04,PAYROLL DEPOSIT,2000');
  assert.deepEq(t.map((x) => x.amount), [-15.99, -30, 2000]);
});

test('merchantOf strips processors, store numbers and locations', () => {
  assert.eq(merchantOf('SQ *BLUE DOOR CAFE #1234 TORONTO ON'), 'BLUE DOOR CAFE');
  assert.eq(merchantOf('POS STARBUCKS #4471 TORONTO ON'), 'STARBUCKS');
  assert.eq(merchantOf('AMAZON.CA*2K4L9'), 'AMAZON.CA');
  assert.eq(merchantOf('SPOTIFY P2A1B3'), 'SPOTIFY');
  assert.eq(merchantOf('SHELL C02145'), 'SHELL');
});

test('categorize priority: manual > user rule > merchant override > built-in > AI > Other', () => {
  const ctx = { rules: [{ id: 'r1', field: 'desc', op: 'contains', value: 'costco', category: 'Shopping', min: 200 }], overrides: { 'BLUE DOOR CAFE': 'Entertainment' }, aiCats: { 'MYSTERY SHOP': 'Shopping' } };
  assert.eq(categorize(tx('2026-01-01', 'COSTCO WHOLESALE', -350), ctx).cat, 'Shopping', 'rule with min amount');
  assert.eq(categorize(tx('2026-01-01', 'COSTCO WHOLESALE', -80), ctx).cat, 'Groceries', 'rule min not met → built-in');
  assert.eq(categorize(tx('2026-01-01', 'SQ *BLUE DOOR CAFE', -12), ctx).src, 'you');
  assert.eq(categorize(tx('2026-01-01', 'MYSTERY SHOP', -9), ctx).src, 'ai');
  assert.eq(categorize(tx('2026-01-01', 'ZZZ UNKNOWN', -9), ctx).cat, 'Other');
  assert.eq(categorize(tx('2026-01-01', 'COSTCO', -9, { catOverride: 'Health' }), ctx).src, 'manual');
});

test('matchRule supports equals, regex (invalid regex is safe) and max', () => {
  const t = tx('2026-01-01', 'UBER TRIP 123', -14);
  assert.ok(matchRule({ field: 'merchant', op: 'equals', value: 'uber trip' }, t));
  assert.ok(matchRule({ field: 'desc', op: 'regex', value: '^uber\\s' }, t));
  assert.ok(!matchRule({ field: 'desc', op: 'regex', value: '(' }, t));
  assert.ok(!matchRule({ field: 'desc', op: 'contains', value: 'uber', max: 10 }, t));
  assert.ok(!matchRule({ field: 'desc', op: 'contains', value: '' }, t));
});

test('monthSummary computes income, spend, savings rate and excludes transfers/excluded', () => {
  const list = enrich([tx('2026-02-01', 'PAYROLL', 3000), tx('2026-02-02', 'RENT PAYMENT', -1500), tx('2026-02-03', 'LOBLAWS', -200), tx('2026-02-04', 'CREDIT CARD PAYMENT - THANK YOU', -400), tx('2026-02-05', 'AMAZON', -100, { excluded: true }), tx('2026-03-01', 'LOBLAWS', -50)]);
  const s = monthSummary(list, '2026-02');
  assert.eq(s.income, 3000); assert.eq(s.spend, 1700);
  assert.near(s.savingsRate, 1300 / 3000, 1e-9);
  assert.deepEq(s.byCat, { Housing: 1500, Groceries: 200 });
});

const monthly = (desc, amount, n, start = 0, cat) => Array.from({ length: n }, (_, i) => tx(new Date(Date.UTC(2026, start + i, 5)).toISOString().slice(0, 10), desc, amount));

test('recurring detects stable monthly charges and price hikes; ignores irregular spending', () => {
  const list = enrich([...monthly('NETFLIX.COM', -15.49, 3), ...monthly('NETFLIX.COM', -17.99, 2, 3), ...[3, 9, 31, 33, 70].map((d) => tx(new Date(Date.UTC(2026, 0, d)).toISOString().slice(0, 10), 'UBER EATS', -(20 + d)))]);
  const r = recurring(list);
  assert.eq(r.length, 1);
  assert.eq(r[0].merchant, 'NETFLIX.COM');
  assert.eq(r[0].freq, 'monthly');
  assert.near(r[0].change, 2.5, 1e-9);
  assert.near(r[0].annual, 17.99 * 12, 1e-9);
});

test('anomalies flags outliers, duplicates and large first-time merchants', () => {
  const base = Array.from({ length: 12 }, (_, i) => tx(`2026-01-${String(i + 1).padStart(2, '0')}`, 'AMAZON', -(20 + i)));
  const list = enrich([...base, tx('2026-01-20', 'AMAZON', -900), tx('2026-01-21', 'UBER EATS', -38.42), tx('2026-01-21', 'UBER EATS', -38.42), tx('2026-01-22', 'BEST BUY', -1149.99)]);
  const kinds = anomalies(list).map((a) => a.kind + ':' + a.t.merchant);
  assert.ok(kinds.includes('outlier:AMAZON'));
  assert.ok(kinds.includes('duplicate:UBER EATS'));
  assert.ok(kinds.includes('new-merchant:BEST BUY'));
});

test('budgetStatus with and without rollover', () => {
  const list = enrich([tx('2026-01-03', 'LOBLAWS', -300), tx('2026-02-03', 'LOBLAWS', -450)]);
  const plain = budgetStatus(list, { Groceries: 400 }, '2026-02', false)[0];
  assert.eq(plain.left, -50);
  const roll = budgetStatus(list, { Groceries: 400 }, '2026-02', true)[0];
  assert.eq(roll.carry, 100); assert.eq(roll.limit, 500); assert.eq(roll.left, 50);
});

test('suggestBudgets rounds the 3-month average up to $25', () => {
  const list = enrich([tx('2026-01-03', 'LOBLAWS', -310), tx('2026-02-03', 'LOBLAWS', -290), tx('2026-03-03', 'LOBLAWS', -330)]);
  assert.deepEq(suggestBudgets(list), { Groceries: 325 });
});

test('goalProjection: ETA, needed monthly amount, on-track flag', () => {
  const now = Date.UTC(2026, 0, 15);
  const g = goalProjection({ target: 6000, saved: 1500, deadline: '2026-10-15' }, 500, now);
  assert.eq(g.left, 4500); assert.eq(g.months, 9);
  assert.near(g.needed, 500, 1e-9); assert.ok(g.onTrack);
  assert.eq(goalProjection({ target: 100, saved: 0 }, 0, now).months, Infinity);
  assert.eq(goalProjection({ target: 100, saved: 150 }, 10, now).months, 0);
});

test('forecast projects months forward with recurring floors', () => {
  const list = enrich([...monthly('PAYROLL', 3000, 3), ...monthly('RENT PAYMENT', -1500, 3), ...monthly('LOBLAWS', -400, 3)]);
  const f = forecast(list, 2);
  assert.deepEq(f.map((x) => x.month), ['2026-04', '2026-05']);
  assert.eq(f[0].income, 3000);
  assert.eq(f[0].spend, 1900);
  assert.eq(f[0].net, 1100);
});

test('toCSV quotes fields with commas', () => {
  const csv = toCSV(enrich([tx('2026-01-01', 'CAFE, THE', -4.5)]));
  assert.ok(csv.split('\n')[1].startsWith('2026-01-01,"CAFE, THE"'));
});
