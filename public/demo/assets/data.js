/* PMS prototype — sample data and the simple-interest calculation engine.
   In the real product this lives on the server; here it runs in the browser so the
   prototype works by double-clicking index.html. All data is fictional. */
(function () {
  const TODAY = '2026-10-14';
  const BRAND = { name: 'Aster Capital', short: 'A', currency: 'INR', locale: 'en-IN', tz: 'Asia/Kolkata', approachingDays: 60 };

  /* ---------- dates (all business dates are YYYY-MM-DD strings) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  // Calendar-month arithmetic from the ORIGINAL date, clamped to month end (31 May + 6m = 30 Nov).
  function addMonths(iso, n) {
    const d = parse(iso); const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
    return ty + '-' + pad(tm + 1) + '-' + pad(Math.min(day, daysInMonth(ty, tm)));
  }
  const addDays = (iso, n) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  /* ---------- money: integer paise to avoid floating point ---------- */
  // monthly_return = round_half_up(principal × rate ÷ 100, 2). Rates have ≤4 decimals.
  function monthlyReturnPaise(principalPaise, ratePct) {
    const rate10k = Math.round(ratePct * 10000);            // 4.0000% -> 40000
    const num = principalPaise * rate10k;                    // paise × rate×10^4
    const den = 100 * 10000;
    return Math.floor((num + den / 2) / den);                // half-up
  }

  /* ---------- plans ---------- */
  const plans = [
    { id: 'PLN-A', name: 'Plan A', desc: 'Conservative monthly-return plan for first-time investors.', status: 'active', created: '2026-01-02', createdBy: 'Priya Sharma',
      versions: [ { v: 1, rate: 2.0, min: 25000, max: 2500000, lockins: [6, 12], custom: false, from: '2026-01-01', eligFrom: '2026-01-01', eligTo: '2026-12-31', early: 'Not permitted', reason: 'Initial plan', by: 'Priya Sharma' } ] },
    { id: 'PLN-B', name: 'Plan B', desc: 'Balanced plan with a higher monthly rate and larger ticket size.', status: 'active', created: '2026-01-02', createdBy: 'Priya Sharma',
      versions: [
        { v: 1, rate: 3.75, min: 50000, max: 5000000, lockins: [6, 12], custom: false, from: '2025-09-01', eligFrom: '2025-09-01', eligTo: '2026-12-31', early: 'Not permitted', reason: 'Initial plan', by: 'Priya Sharma' },
        { v: 2, rate: 4.0, min: 50000, max: 5000000, lockins: [6, 12], custom: false, from: '2026-03-01', eligFrom: '2025-09-01', eligTo: '2026-12-31', early: 'Not permitted', reason: 'Rate revised per IC-2026-03', by: 'Karan Mehta' },
        { v: 3, rate: 4.0, min: 50000, max: 5000000, lockins: [6, 12], custom: false, from: '2026-09-02', eligFrom: '2025-09-01', eligTo: '2026-12-31', early: 'Not permitted', reason: 'Updated risk disclosure text', by: 'Priya Sharma' } ] },
    { id: 'PLN-C', name: 'Plan C', desc: 'Premium plan for large tickets. 12-month lock-in only.', status: 'active', created: '2025-09-01', createdBy: 'Karan Mehta',
      versions: [ { v: 1, rate: 6.0, min: 500000, max: 10000000, lockins: [12], custom: false, from: '2025-09-01', eligFrom: '2025-09-01', eligTo: '2026-12-31', early: 'Not permitted', reason: 'Initial plan', by: 'Karan Mehta' } ] },
    { id: 'PLN-L', name: 'Launch Plan', desc: 'Introductory plan offered during launch. Closed to new investments.', status: 'archived', created: '2025-06-01', createdBy: 'Karan Mehta',
      versions: [ { v: 1, rate: 3.0, min: 25000, max: 1000000, lockins: [6], custom: false, from: '2025-06-01', eligFrom: '2025-06-01', eligTo: '2025-08-31', early: 'Not permitted', reason: 'Initial plan', by: 'Karan Mehta' } ] }
  ];
  plans.forEach(p => p.terms = 'Returns are calculated as simple interest on the original principal at the monthly rate stated in the investment agreement. Unpaid returns are not added to principal. Payouts are made after confirmation of the monthly accrual.');
  plans.forEach(p => p.risk = 'Investments carry risk, including loss of principal. Returns shown are contractual rates, not guarantees of payment. Past payouts do not indicate future results.');

  /* ---------- investors ---------- */
  const names = ['Ananya Rao','Rahul Menon','Fatima Shaikh','Vikram Iyer','Meera Kapoor','Arjun Nair','Sana Qureshi','Rohan Desai','Kavya Reddy','Imran Khan','Neha Joshi','Aditya Kulkarni','Priyanka Das','Siddharth Bose','Zara Ahmed','Karthik Subramanian','Ishita Malhotra','Farhan Siddiqui','Deepa Pillai','Nikhil Bhatt','Ayesha Patel','Manish Agarwal','Lakshmi Venkat','Omar Farooq','Tanvi Shah','Harish Gupta'];
  const investors = names.map((n, i) => {
    const id = 'INVR-' + String(1001 + i);
    const slug = n.toLowerCase().replace(/[^a-z]+/g, '.');
    const reg = addDays('2025-08-20', i * 13 + (i % 4) * 3);
    return { id, name: n, email: slug + '@example.com', phone: '+91 98' + String(45000000 + i * 7919).slice(0, 8), registered: reg,
      kyc: i === 23 || i === 24 ? 'pending' : i === 25 ? 'rejected' : 'verified', status: i === 21 ? 'suspended' : 'active',
      city: ['Mumbai','Bengaluru','Pune','Chennai','Hyderabad','Delhi','Kochi','Ahmedabad'][i % 8], bank: ['HDFC','ICICI','SBI','Axis','Kotak'][i % 5] + ' ••' + String(1000 + i * 37).slice(-4) };
  });
  const invBy = id => investors.find(x => x.id === id);

  /* ---------- investments ---------- */
  const raw = [
    // [code, investorIdx, planId, version, principal, lockin, start]
    ['INV-1042', 0, 'PLN-B', 2, 500000, 12, '2026-03-15'],
    ['INV-1187', 0, 'PLN-A', 1, 200000, 6, '2026-05-31'],
    ['INV-0912', 1, 'PLN-C', 1, 1000000, 12, '2025-10-22'],
    ['INV-0931', 2, 'PLN-A', 1, 500000, 12, '2025-11-03'],
    ['INV-0866', 3, 'PLN-L', 1, 300000, 6, '2025-08-10'],
    ['INV-0901', 4, 'PLN-B', 1, 750000, 6, '2025-10-05'],
    ['INV-0944', 5, 'PLN-B', 1, 1500000, 12, '2025-11-18'],
    ['INV-0958', 6, 'PLN-C', 1, 2500000, 12, '2025-12-01'],
    ['INV-0977', 7, 'PLN-A', 1, 300000, 12, '2026-01-12'],
    ['INV-0983', 8, 'PLN-B', 1, 1000000, 6, '2026-01-20'],
    ['INV-0995', 9, 'PLN-A', 1, 150000, 6, '2026-02-01'],
    ['INV-1008', 10, 'PLN-B', 1, 600000, 12, '2026-02-14'],
    ['INV-1013', 11, 'PLN-C', 1, 5000000, 12, '2026-02-28'],
    ['INV-1027', 12, 'PLN-A', 1, 250000, 6, '2026-03-04'],
    ['INV-1035', 13, 'PLN-B', 2, 2000000, 12, '2026-03-10'],
    ['INV-1051', 14, 'PLN-A', 1, 400000, 12, '2026-03-28'],
    ['INV-1066', 15, 'PLN-B', 2, 800000, 6, '2026-04-07'],
    ['INV-1074', 16, 'PLN-C', 1, 1200000, 12, '2026-04-21'],
    ['INV-1089', 17, 'PLN-A', 1, 100000, 6, '2026-05-02'],
    ['INV-1095', 18, 'PLN-B', 2, 3000000, 12, '2026-05-15'],
    ['INV-1102', 19, 'PLN-A', 1, 500000, 12, '2026-05-30'],
    ['INV-1116', 20, 'PLN-B', 2, 1000000, 6, '2026-06-12'],
    ['INV-1124', 1, 'PLN-B', 2, 500000, 12, '2026-06-25'],
    ['INV-1139', 4, 'PLN-C', 1, 1500000, 12, '2026-07-08'],
    ['INV-1148', 6, 'PLN-A', 1, 300000, 6, '2026-07-31'],
    ['INV-1156', 10, 'PLN-B', 2, 700000, 12, '2026-08-11'],
    ['INV-1163', 13, 'PLN-A', 1, 200000, 6, '2026-08-29'],
    ['INV-1171', 15, 'PLN-C', 1, 2000000, 12, '2026-09-09'],
    ['INV-1179', 3, 'PLN-B', 3, 900000, 12, '2026-09-18'],
    ['INV-1194', 22, 'PLN-A', 1, 350000, 6, '2026-09-30'],
    ['INV-1203', 9, 'PLN-B', 3, 300000, 6, '2026-10-11'],
    ['INV-1210', 23, 'PLN-B', 3, 450000, 12, null],
    ['INV-1214', 24, 'PLN-A', 1, 120000, 6, null],
    ['INV-0889', 2, 'PLN-L', 1, 200000, 6, '2025-09-01']
  ];

  /* ---------- state (persisted in localStorage so admin actions show up for the investor) ---------- */
  const KEY = 'pms-prototype-state-v1';
  function freshState() {
    return {
      planOverrides: {},              // planId -> {status, versions:[...] }
      payoutStatus: {},               // payoutId -> {status, ref, by, at}
      redemptions: [
        { id: 'RDM-0218', inv: 'INV-0912', type: 'maturity', status: 'under_review', requested: '2026-10-10', note: 'Please credit to my registered ICICI account.', history: [['requested','2026-10-10','Rahul Menon'],['under_review','2026-10-11','Priya Sharma']] },
        { id: 'RDM-0216', inv: 'INV-0901', type: 'maturity', status: 'requested', requested: '2026-10-08', note: '', history: [['requested','2026-10-08','Meera Kapoor']] },
        { id: 'RDM-0211', inv: 'INV-0866', type: 'maturity', status: 'completed', requested: '2026-01-28', note: '', settled: '2026-02-12', ref: 'UTR 5512093381', history: [['requested','2026-01-28','Vikram Iyer'],['approved','2026-02-02','Karan Mehta'],['processing','2026-02-10','Priya Sharma'],['completed','2026-02-12','Karan Mehta']] },
        { id: 'RDM-0213', inv: 'INV-0889', type: 'maturity', status: 'completed', requested: '2026-02-20', note: '', settled: '2026-03-03', ref: 'UTR 5598120044', history: [['requested','2026-02-20','Fatima Shaikh'],['approved','2026-02-24','Karan Mehta'],['completed','2026-03-03','Karan Mehta']] },
        { id: 'RDM-0215', inv: 'INV-0983', type: 'early', status: 'rejected', requested: '2026-06-02', note: 'Need funds for property purchase.', reason: 'Plan B v1 does not permit early redemption during lock-in.', history: [['requested','2026-06-02','Kavya Reddy'],['rejected','2026-06-04','Karan Mehta']] }
      ],
      announcements: [
        { id: 'ANN-031', title: 'Plan C now open for 2026 investments', body: 'Plan C (6.00% per month, 12-month lock-in, minimum ₹5,00,000) is open for new investments until 31 Dec 2026. Contact your relationship manager to invest.', cat: 'New plan', aud: 'all', audLabel: 'All investors', status: 'published', at: '2026-09-05', by: 'Priya Sharma', reads: 141 },
        { id: 'ANN-032', title: 'Updated payout processing times', body: 'From October 2026, monthly payouts are processed within 3 business days of your accrual date. You will be notified when your payout is confirmed.', cat: 'Policy', aud: 'all', audLabel: 'All investors', status: 'published', at: '2026-09-28', by: 'Karan Mehta', reads: 96 },
        { id: 'ANN-033', title: 'Your investment matures soon', body: 'One or more of your investments matures within 60 days. You can request redemption from 30 days before maturity in the Redemptions section.', cat: 'Maturity reminder', aud: 'maturing', audLabel: 'Maturing within 60 days', status: 'published', at: '2026-10-01', by: 'System', reads: 9 },
        { id: 'ANN-034', title: 'Diwali holiday schedule', body: 'Our offices will be closed on 8–9 November. Payouts due on those days will be processed on 10 November.', cat: 'General notice', aud: 'all', audLabel: 'All investors', status: 'draft', at: null, by: 'Priya Sharma', reads: 0 }
      ],
      reads: {},                      // notifId -> true
      extraNotifs: [],                // pushed by admin actions
      audit: [],
      investmentsAdded: [], funded: {},
      settings: { approachingDays: 60, fourEyes: true, email: false, customLockin: false }
    };
  }
  let state;
  function load() { try { const s = localStorage.getItem(KEY); state = s ? Object.assign(freshState(), JSON.parse(s)) : freshState(); } catch (e) { state = freshState(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} try { window.dispatchEvent(new Event('pms-state')); } catch (e) {} }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} state = freshState(); }
  load();
  window.addEventListener('storage', e => { if (e.key === KEY) { load(); window.dispatchEvent(new Event('pms-state')); } });

  /* ---------- derived model ---------- */
  function planList() {
    return plans.map(p => {
      const o = state.planOverrides[p.id];
      const versions = o && o.versions ? p.versions.concat(o.versions) : p.versions;
      return Object.assign({}, p, { status: (o && o.status) || p.status, versions, cur: versions[versions.length - 1] });
    });
  }
  const planBy = id => planList().find(p => p.id === id);

  function payoutState(acc, inv) {
    const ov = state.payoutStatus[acc.id];
    if (ov) return ov;
    if (inv.redeemed) return { status: 'paid', ref: 'UTR ' + (5100000000 + acc.seq * 7717), at: addDays(acc.end, 3) };
    const age = diffDays(acc.end, TODAY);
    if (age > 30) return { status: 'paid', ref: 'UTR ' + (5100000000 + acc.seq * 7717), at: addDays(acc.end, 3) };
    if (age >= 20) return { status: 'processing', ref: 'BATCH-2026-10-A', at: '2026-10-12' };
    if (age >= 10) return { status: 'approved', at: addDays(acc.end, 2) };
    return { status: 'accrued' };
  }

  let seq = 0;
  function buildInvestment(r) {
    const [code, ii, planId, ver, principal, lockin] = r; const start = r[6] || (state.funded || {})[code] || null;
    const plan = plans.find(p => p.id === planId);
    const pv = plan.versions.find(v => v.v === ver);
    const investor = investors[ii];
    const inv = { code, investorId: investor.id, investor: investor.name, planId, planName: plan.name, planVersion: ver, rate: pv.rate, principal, lockin, start,
      early: pv.early, agreement: 'AGR-' + code.slice(4) };
    if (!start) { inv.status = 'pending_funding'; inv.created = addDays(TODAY, -2 - (ii % 3)); inv.accruals = []; inv.maturity = null; return finish(inv); }
    inv.maturity = addMonths(start, lockin);
    inv.lockinEnd = inv.maturity; inv.eligible = inv.maturity; inv.requestFrom = addDays(inv.maturity, -30);
    inv.monthly = monthlyReturnPaise(principal * 100, pv.rate) / 100;
    const red = state.redemptions.find(x => x.inv === code && x.status === 'completed');
    inv.redeemed = !!red;
    inv.accruals = [];
    for (let k = 1; k <= lockin; k++) {
      const end = addMonths(start, k);
      if (end > TODAY) break;
      const acc = { id: 'ACR-' + code.slice(4) + '-' + pad(k), k, from: addMonths(start, k - 1), to: addDays(end, -1), end, amount: inv.monthly, seq: ++seq };
      Object.assign(acc, { pay: payoutState(acc, inv) });
      inv.accruals.push(acc);
    }
    return finish(inv);
  }
  function finish(inv) {
    const sum = f => inv.accruals.filter(f).reduce((s, a) => s + a.amount, 0);
    inv.accrued = sum(() => true);
    inv.paid = sum(a => a.pay.status === 'paid');
    inv.processing = sum(a => a.pay.status === 'processing');
    inv.approved = sum(a => a.pay.status === 'approved');
    inv.outstanding = inv.accrued - inv.paid;
    const openRed = state.redemptions.find(x => x.inv === inv.code && ['requested','under_review','approved','processing'].includes(x.status));
    if (inv.status !== 'pending_funding') {
      if (inv.redeemed) inv.status = 'redeemed';
      else if (openRed) inv.status = openRed.status === 'processing' || openRed.status === 'approved' ? 'redemption_processing' : 'redemption_requested';
      else if (inv.maturity <= TODAY) inv.status = 'matured';
      else inv.status = 'active';
    }
    inv.daysLeft = inv.maturity ? Math.max(0, diffDays(TODAY, inv.maturity)) : null;
    inv.label = displayStatus(inv);
    inv.projected = inv.status === 'active' ? (inv.lockin - inv.accruals.length) * inv.monthly : 0;
    inv.nextAccrual = inv.status === 'active' ? addMonths(inv.start, inv.accruals.length + 1) : null;
    return inv;
  }
  function displayStatus(inv) {
    switch (inv.status) {
      case 'pending_funding': return 'Pending funding';
      case 'redeemed': return 'Redeemed';
      case 'cancelled': return 'Cancelled';
      case 'redemption_requested': return 'Redemption requested';
      case 'redemption_processing': return 'Redemption processing';
      case 'matured': return 'Matured';
    }
    if (TODAY >= inv.eligible) return 'Eligible for redemption';
    if (inv.daysLeft <= state.settings.approachingDays) return 'Maturity approaching';
    return 'Locked';
  }
  function investments() {
    seq = 0;
    return raw.concat(state.investmentsAdded).map(buildInvestment).sort((a, b) => (b.start || '9999').localeCompare(a.start || '9999'));
  }

  /* ---------- notifications for an investor ---------- */
  function annAudience(a, investorId, invs) {
    if (a.aud === 'all') return true;
    if (a.aud === 'plan') return invs.some(i => i.investorId === investorId && i.planId === a.audPlan && i.status !== 'redeemed');
    if (a.aud === 'selected') return (a.audIds || []).includes(investorId);
    if (a.aud === 'maturing') return invs.some(i => i.investorId === investorId && i.daysLeft !== null && i.daysLeft <= (a.audDays || 60) && i.status !== 'redeemed');
    return false;
  }
  function notificationsFor(investorId) {
    const invs = investments(); const mine = invs.filter(i => i.investorId === investorId);
    const out = [];
    state.announcements.filter(a => a.status === 'published' && annAudience(a, investorId, invs)).forEach(a => out.push({ id: 'N-' + a.id, kind: 'announcement', title: a.title, body: a.cat, at: a.at, link: 'announcements', ann: a.id }));
    mine.forEach(i => i.accruals.forEach(a => {
      if (a.pay.status === 'paid') out.push({ id: 'N-P-' + a.id, kind: 'payout', title: 'Return paid: ' + fmtMoney(a.amount) + ' for ' + i.code, body: 'Period ' + a.k + ' · ' + (a.pay.ref || ''), at: a.pay.at || a.end, link: 'investments/' + i.code });
      else if (a.pay.status === 'processing') out.push({ id: 'N-R-' + a.id, kind: 'payout', title: 'Payout for ' + i.code + ' is being processed', body: fmtMoney(a.amount) + ' for period ' + a.k, at: a.pay.at || a.end, link: 'investments/' + i.code });
      out.push({ id: 'N-A-' + a.id, kind: 'accrual', title: 'Return accrued on ' + i.code + ': ' + fmtMoney(a.amount), body: 'Period ' + a.k + ' · not yet paid at time of accrual', at: a.end, link: 'returns' });
    }));
    mine.filter(i => i.daysLeft !== null && i.daysLeft <= 60 && i.status !== 'redeemed').forEach(i => out.push({ id: 'N-M-' + i.code, kind: 'maturity', title: 'Maturity reminder: ' + i.code + ' matures ' + fmtDate(i.maturity), body: 'You can request redemption from ' + fmtDate(i.requestFrom), at: '2026-10-01', link: 'lockin' }));
    state.redemptions.filter(r => mine.some(i => i.code === r.inv)).forEach(r => r.history.forEach((h, ix) => out.push({ id: 'N-RD-' + r.id + '-' + ix, kind: 'redemption', title: 'Redemption ' + r.id + ': ' + REDEMPTION[h[0]][0], body: r.inv, at: h[1], link: 'redemptions' })));
    state.extraNotifs.filter(n => n.investorId === investorId).forEach(n => out.push(n));
    const seen = new Set(); const uniq = out.filter(n => { const k = n.title + '|' + n.at; if (seen.has(k)) return false; seen.add(k); return true; });
    uniq.forEach(n => n.read = !!state.reads[n.id] || n.at < '2026-09-20');
    return uniq.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  /* ---------- transactions ledger ---------- */
  function transactions() {
    const out = []; let n = 8000;
    investments().slice().reverse().forEach(i => {
      if (!i.start) { out.push({ id: 'TXN-' + (++n), date: i.created, type: 'Deposit', inv: i.code, investorId: i.investorId, investor: i.investor, amount: i.principal, status: 'pending', ref: 'Awaiting bank confirmation', by: 'Priya Sharma' }); return; }
      out.push({ id: 'TXN-' + (++n), date: i.start, type: 'Deposit', inv: i.code, investorId: i.investorId, investor: i.investor, amount: i.principal, status: 'confirmed', ref: 'UTR ' + (5800000000 + n * 31), by: 'Priya Sharma' });
      out.push({ id: 'TXN-' + (++n), date: i.start, type: 'Investment allocation', inv: i.code, investorId: i.investorId, investor: i.investor, amount: i.principal, status: 'confirmed', ref: i.agreement, by: 'Karan Mehta' });
      i.accruals.forEach(a => {
        out.push({ id: 'TXN-' + (++n), date: a.end, type: 'Return accrual', inv: i.code, investorId: i.investorId, investor: i.investor, amount: a.amount, status: 'posted', ref: a.id, by: 'System' });
        if (a.pay.status !== 'accrued' && a.pay.status !== 'approved') out.push({ id: 'TXN-' + (++n), date: a.pay.at || a.end, type: 'Return payout', inv: i.code, investorId: i.investorId, investor: i.investor, amount: a.amount, status: a.pay.status === 'paid' ? 'confirmed' : a.pay.status, ref: a.pay.ref || '—', by: a.pay.by || 'Karan Mehta' });
      });
    });
    state.redemptions.forEach(r => {
      const i = investments().find(x => x.code === r.inv); if (!i) return;
      out.push({ id: 'TXN-' + (++n), date: r.requested, type: 'Redemption request', inv: i.code, investorId: i.investorId, investor: i.investor, amount: i.principal, status: r.status === 'rejected' ? 'rejected' : r.status === 'completed' ? 'confirmed' : 'pending', ref: r.id, by: i.investor });
      if (r.status === 'completed') out.push({ id: 'TXN-' + (++n), date: r.settled, type: 'Principal redemption', inv: i.code, investorId: i.investorId, investor: i.investor, amount: i.principal, status: 'confirmed', ref: r.ref, by: 'Karan Mehta' });
    });
    out.push({ id: 'TXN-' + (++n), date: '2026-10-10', type: 'Accrual reversal', inv: 'INV-0977', investorId: 'INVR-1008', investor: 'Rohan Desai', amount: -6000, status: 'posted', ref: 'Duplicate manual accrual ACR-0977-M1', by: 'Karan Mehta' });
    out.push({ id: 'TXN-' + (++n), date: '2026-08-02', type: 'Refund', inv: 'INV-1022', investorId: 'INVR-1011', investor: 'Neha Joshi', amount: 50000, status: 'confirmed', ref: 'Deposit above plan maximum', by: 'Karan Mehta' });
    out.push({ id: 'TXN-' + (++n), date: '2026-10-13', type: 'Return payout', inv: 'INV-0958', investorId: 'INVR-1007', investor: 'Sana Qureshi', amount: 150000, status: 'failed', ref: 'Bank rejected: account frozen', by: 'Karan Mehta' });
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  /* ---------- audit ---------- */
  const seedAudit = [
    ['2026-10-12 18:04','Priya Sharma','payout.batch.send','BATCH-2026-10-A','Sent 38 payouts to bank','status: approved → processing'],
    ['2026-10-11 10:22','Priya Sharma','redemption.review','RDM-0218','Picked up for review','status: requested → under_review'],
    ['2026-10-10 16:40','Karan Mehta','accrual.reverse','ACR-0977-M1','Duplicate manual accrual','amount: 6,000.00 → reversal −6,000.00'],
    ['2026-10-09 11:15','Karan Mehta','investor.status','INVR-1022','KYC address mismatch, account suspended pending review','status: active → suspended'],
    ['2026-09-30 09:02','Priya Sharma','investment.activate','INV-1194','Deposit confirmed UTR 5874410093','status: pending_funding → active'],
    ['2026-09-02 14:31','Priya Sharma','plan.version.create','PLN-B v3','Updated risk disclosure text','risk_disclosure: (edited)'],
    ['2026-09-01 08:55','Karan Mehta','settings.update','approaching_maturity_days','Align reminders with request window','45 → 60'],
    ['2026-03-01 12:10','Karan Mehta','plan.version.create','PLN-B v2','Rate revised per IC-2026-03','monthly_rate: 3.75% → 4.00%']
  ].map((r, i) => ({ id: 'AUD-' + (5000 - i), at: r[0], actor: r[1], action: r[2], record: r[3], reason: r[4], diff: r[5] }));
  function audit() { return state.audit.concat(seedAudit); }
  function log(actor, action, record, reason, diff) {
    state.audit.unshift({ id: 'AUD-' + (5001 + state.audit.length), at: TODAY + ' ' + new Date().toTimeString().slice(0, 5), actor, action, record, reason, diff });
  }

  /* ---------- formatting ---------- */
  const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmtMoney(v) { return (v < 0 ? '−₹' : '₹') + nf.format(Math.abs(v)); }
  function fmtShort(v) {
    const a = Math.abs(v);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    return fmtMoney(v);
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; }
  function fmtDateShort(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return d + ' ' + MONTHS[m - 1]; }
  const fmtRate = r => r.toFixed(2) + '%\u00a0/\u00a0month';

  const REDEMPTION = {
    requested: ['Requested', 'b-amber'], under_review: ['Under review', 'b-amber'], approved: ['Approved', 'b-blue'],
    processing: ['Processing', 'b-blue'], completed: ['Completed', 'b-green'], rejected: ['Rejected', 'b-red'], withdrawn: ['Withdrawn', 'b-grey']
  };

  window.PMS = { TODAY, BRAND, addMonths, addDays, diffDays, monthlyReturnPaise, plans: planList, planBy, investors, invBy, investments, transactions, notificationsFor, audit, log,
    get state() { return state; }, save, reset, fmtMoney, fmtShort, fmtDate, fmtDateShort, fmtRate, MONTHS, REDEMPTION, annAudience };
})();
