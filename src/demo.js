/* Six months of realistic synthetic bank transactions for the sample dataset. */
function sampleTransactions() {
  var r = Kit.rng(7), out = [], id = 0;
  var add = function (date, desc, amount) { out.push({ id: 's' + id++, date: date, desc: desc, amount: +amount.toFixed(2) }); };
  var end = new Date(), start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
  var days = Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - start.getTime()) / 864e5);
  var pick = function (a) { return a[Math.floor(r() * a.length)]; };
  for (var day = 0; day <= days; day++) {
    var d = new Date(start.getTime() + day * 864e5), ds = d.toISOString().slice(0, 10), dom = d.getUTCDate(), dow = d.getUTCDay(), mIdx = Math.floor(day / 30.5);
    if (day % 14 === 4) add(ds, 'PAYROLL DEPOSIT ACME CORP', 2140);
    if (dom === 1) { add(ds, 'RENT PAYMENT - MAPLE PROPERTY MGMT', -1650); add(ds, 'PRE-AUTH ROGERS INTERNET', -85); }
    if (dom === 3) add(ds, 'NETFLIX.COM', mIdx >= 4 ? -18.99 : -16.49);
    if (dom === 5) add(ds, 'SPOTIFY P2A1B3', -11.99);
    if (dom === 8) add(ds, 'APPLE.COM/BILL ICLOUD', -3.99);
    if (dom === 12) add(ds, 'GOODLIFE FITNESS #221', -49.99);
    if (dom === 18) add(ds, 'HYDRO ONE NETWORKS', -(78 + r() * 40));
    if (dom === 21) add(ds, 'PAYPAL *KOFI MONTHLY', -5);
    if (dom === 25) add(ds, 'CREDIT CARD PAYMENT - THANK YOU', -400);
    if (dow === 6) add(ds, pick(['LOBLAWS #1012', 'NO FRILLS 3321', 'COSTCO WHOLESALE #522']), -(55 + r() * 120));
    if (dow === 3 && r() < 0.6) add(ds, 'FARM BOY #19', -(18 + r() * 35));
    if (dow >= 1 && dow <= 5 && r() < 0.45) add(ds, 'STARBUCKS #4471 TORONTO ON', -(4.5 + r() * 3));
    if (r() < 0.12) add(ds, 'UBER EATS', -(24 + r() * 22));
    if (r() < 0.06) add(ds, pick(['SQ *BLUE DOOR CAFE', 'TST* MAMAS DUMPLINGS', 'TST* EL TACO LOCO', 'SQ *NORTHERN NOODLE']), -(14 + r() * 40));
    if (r() < 0.09) add(ds, 'UBER TRIP HELP.UBER.COM', -(11 + r() * 18));
    if (r() < 0.05) add(ds, 'SHELL C02145', -(48 + r() * 25));
    if (dow === 1 && r() < 0.5) add(ds, 'PRESTO AUTOLOAD', -40);
    if (r() < 0.07) add(ds, 'AMAZON.CA*2K4L9', -(15 + r() * 70));
    if (r() < 0.025) add(ds, 'SHOPPERS DRUG MART #0817', -(12 + r() * 40));
    if (r() < 0.02) add(ds, pick(['CINEPLEX ENTERTAINMENT', 'STEAMGAMES.COM 4259']), -(18 + r() * 30));
    if (r() < 0.015) add(ds, 'ETSY*CRAFTHOUSE STUDIO', -(25 + r() * 40));
    if (r() < 0.012) add(ds, 'BAYVIEW PET CLINIC', -(60 + r() * 90));
    if (day === Math.round(days * 0.7)) add(ds, 'BEST BUY #949 TORONTO', -1149.99);
    if (day === Math.round(days * 0.9)) { add(ds, 'UBER EATS', -38.42); add(ds, 'UBER EATS', -38.42); }
    if (day === Math.round(days * 0.4)) add(ds, 'AIR CANADA 0142', -486.2);
  }
  return out;
}
var SAMPLE_GOALS = [
  { id: 'g1', name: 'Emergency fund', target: 6000, saved: 2400, deadline: null, color: '#1f9d63' },
  { id: 'g2', name: 'Japan trip', target: 3500, saved: 900, deadline: new Date(Date.now() + 240 * 864e5).toISOString().slice(0, 10), color: '#d6457a' },
];
var SAMPLE_RULES = [
  { id: 'r1', field: 'merchant', op: 'contains', value: 'BAYVIEW PET', category: 'Health' },
  { id: 'r2', field: 'desc', op: 'contains', value: 'COSTCO', category: 'Shopping', min: 250 },
];
