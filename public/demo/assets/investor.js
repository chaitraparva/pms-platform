/* PMS prototype — Investor dashboard (signed in as Ananya Rao) */
(function () {
  const P = window.PMS, U = window.UI, esc = U.esc, M = P.fmtMoney, D = P.fmtDate;
  const ME_ID = 'INVR-1001'; const me = P.invBy(ME_ID);
  const ME = { name: me.name, initials: 'AR', sub: me.id + ' · Verified' };

  U.shell({
    roleLabel: 'Investor portal', searchPh: 'Search my investments and transactions', user: ME,
    nav: [
      { group: 'Portfolio' }, { route: 'overview', label: 'Overview', icon: 'home' }, { route: 'investments', label: 'My Investments', icon: 'invest' },
      { route: 'returns', label: 'Monthly Returns', icon: 'roi' }, { route: 'lockin', label: 'Lock-in & Maturity', icon: 'lock' },
      { group: 'Money' }, { route: 'transactions', label: 'Transactions', icon: 'txn' }, { route: 'redemptions', label: 'Redemptions', icon: 'redeem' }, { route: 'documents', label: 'Statements & Documents', icon: 'doc' },
      { group: 'Updates' }, { route: 'announcements', label: 'Announcements', icon: 'announce', count: 1 }, { route: 'notifications', label: 'Notifications', icon: 'bell', count: 1 },
      { group: 'Account' }, { route: 'profile', label: 'Profile & Security', icon: 'user' }
    ]
  });
  const ord = d => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
  const crumb = (...p) => `<span data-crumb="${esc(p.map((x, i) => i === p.length - 1 ? '<b>' + esc(x) + '</b>' : esc(x)).join(' / '))}"></span>`;
  const mine = () => P.investments().filter(i => i.investorId === ME_ID && i.start);
  const notifs = () => P.notificationsFor(ME_ID);
  const anns = () => P.state.announcements.filter(a => a.status === 'published' && P.annAudience(a, ME_ID, P.investments())).sort((a, b) => b.at.localeCompare(a.at));

  function counts() {
    const n = notifs().filter(x => !x.read); const nn = n.length; const an = n.filter(x => x.kind === 'announcement').length;
    const bc = document.getElementById('bell-ct'); bc.textContent = nn; bc.classList.toggle('hidden', !nn);
    const c1 = document.querySelector('[data-count="notifications"]'), c2 = document.querySelector('[data-count="announcements"]');
    if (c1) { c1.textContent = nn; c1.classList.toggle('hidden', !nn); } if (c2) { c2.textContent = an; c2.classList.toggle('hidden', !an); }
  }
  const NIC = { announcement: ['announce', 'b-blue'], payout: ['payout', 'b-green'], accrual: ['roi', 'b-grey'], maturity: ['lock', 'b-amber'], redemption: ['redeem', 'b-amber'] };
  const nRow = (n, compact) => `<div data-act="open-notif" data-id="${n.id}" data-link="${n.link}" style="cursor:pointer"><span class="dot ${n.read ? '' : 'unread'}"></span><div class="grow"><b style="${n.read ? 'font-weight:400' : ''}">${esc(n.title)}</b><span>${esc(n.body || '')}${n.body ? ' · ' : ''}${P.fmtDateShort(n.at)}</span></div>${compact ? '' : `<span class="badge ${NIC[n.kind][1]}">${n.kind[0].toUpperCase() + n.kind.slice(1)}</span>`}</div>`;
  U.actions.bell = () => {
    const pop = document.getElementById('bell-pop'); if (pop.innerHTML) { U.closePops(); return; } U.closePops();
    const ns = notifs().slice(0, 8);
    pop.innerHTML = `<div class="popover"><div class="ph2"><b>Notifications</b><a data-act="read-all">Mark all as read</a></div><div class="pl list">${ns.map(n => nRow(n, true)).join('')}</div><div class="pf"><a href="#/notifications">View all notifications</a></div></div>`;
  };
  U.actions['open-notif'] = t => { P.state.reads[t.dataset.id] = true; P.save(); U.closePops(); U.nav(t.dataset.link); };
  U.actions['read-all'] = () => { notifs().forEach(n => P.state.reads[n.id] = true); P.save(); U.closePops(); U.toast('All notifications marked as read', 'This is saved to your account.'); };

  /* =============== OVERVIEW =============== */
  function overview() {
    const m = mine(); const live = m.filter(i => !['redeemed', 'pending_funding', 'cancelled'].includes(i.status));
    const principal = live.reduce((s, i) => s + i.principal, 0);
    const paid = m.reduce((s, i) => s + i.paid, 0), unpaid = m.reduce((s, i) => s + i.outstanding, 0), proc = m.reduce((s, i) => s + i.processing, 0);
    const next = live.filter(i => i.nextAccrual).sort((a, b) => a.nextAccrual.localeCompare(b.nextAccrual))[0];
    const nextMat = live.slice().sort((a, b) => (a.maturity || '').localeCompare(b.maturity || ''))[0];
    const months = U.lastMonths(7);
    const accs = m.flatMap(i => i.accruals);
    const recent = notifs().slice(0, 5);
    return `${crumb('Overview')}
      <div class="ph"><div><h1>Welcome back, ${esc(me.name.split(' ')[0])}</h1><p>Figures as of ${D(P.TODAY)}. Returns are simple interest on your original principal.</p></div><div class="acts"><button class="btn" data-act="stmt">${U.icon('download')}Download statement</button></div></div>
      <div class="kpis k4">
        ${U.kpi('Total principal invested', M(principal), live.length + ' active investments', { tip: 'The amount you invested in investments that are active today. It does not include returns.' })}
        ${U.kpi('Returns received', M(paid), 'Confirmed payments only', { cls: 'pos', tip: 'Returns the company has paid and confirmed with a bank reference.' })}
        ${U.kpi('Accrued, not yet paid', M(unpaid), proc ? M(proc) + ' being processed' : 'Awaiting payout', { subCls: 'warn', tip: 'Returns earned for completed months that have not been confirmed as paid yet. This is not money in your account.' })}
        ${U.kpi('Total outstanding principal', M(principal), 'Repayable at maturity', { tip: 'Principal that will be returned to you on redemption.' })}
        ${U.kpi('Next expected payout', next ? M(next.monthly) : '—', next ? 'Estimate · accrues ' + D(next.nextAccrual) : '', { tip: 'Estimated from your contract terms. It becomes an accrual on the date shown and is paid after confirmation.' })}
        ${U.kpi('Next maturity', nextMat ? D(nextMat.maturity) : '—', nextMat ? nextMat.code + ' · ' + nextMat.daysLeft + ' days' : '', { tip: 'The earliest maturity date across your active investments.' })}
        ${U.kpi('Active investments', live.length, m.length + ' in total')}
        ${U.kpi('Projected remaining returns', M(live.reduce((s, i) => s + i.projected, 0)), 'Estimate, not guaranteed', { tip: 'Remaining monthly returns until maturity at your contract rate, assuming no changes. This is an estimate.' })}
      </div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>My investments</h3><div class="r"><a href="#/investments">View all</a></div></div><div class="tbl"><table><thead><tr><th>Investment</th><th class="n">Principal</th><th>Rate</th><th>Maturity</th><th class="n">Accrued</th><th class="n">Received</th><th>Status</th></tr></thead><tbody>
          ${m.map(i => `<tr class="click" data-go="investments/${i.code}"><td><b class="mono">${i.code}</b><span class="sub">${i.planName} · ${i.lockin} months · from ${D(i.start)}</span></td><td class="n">${M(i.principal)}</td><td>${P.fmtRate(i.rate)}</td><td>${D(i.maturity)}<span class="sub">${i.daysLeft} days</span></td><td class="n">${M(i.accrued)}</td><td class="n pos">${M(i.paid)}</td><td>${U.invBadge(i)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Latest updates</h3><div class="r"><a href="#/notifications">All</a></div></div><div class="card-b list">${recent.map(n => nRow(n, true)).join('')}</div></div>
      </div>
      <div class="grid g-1-2">
        <div class="card"><div class="card-h"><h3>Lock-in progress</h3><div class="r"><a href="#/lockin">Tracker</a></div></div><div class="card-b" style="display:grid;gap:18px">${live.map(i => tracker(i, true)).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Monthly returns</h3><div class="r legend"><span><i style="background:var(--green)"></i>Paid</span><span><i style="background:var(--amber)"></i>Processing / approved</span><span><i style="background:var(--chart-4)"></i>Accrued</span></div></div>
          <div class="card-b">${U.barChart(months.map(U.monthLabel), [
            { name: 'Paid', color: 'var(--green)', values: months.map(mm => accs.filter(a => a.end.slice(0, 7) === mm && a.pay.status === 'paid').reduce((s, a) => s + a.amount, 0)) },
            { name: 'Processing / approved', color: 'var(--amber)', values: months.map(mm => accs.filter(a => a.end.slice(0, 7) === mm && ['processing', 'approved'].includes(a.pay.status)).reduce((s, a) => s + a.amount, 0)) },
            { name: 'Accrued', color: 'var(--chart-4)', values: months.map(mm => accs.filter(a => a.end.slice(0, 7) === mm && a.pay.status === 'accrued').reduce((s, a) => s + a.amount, 0)) }
          ], { fmt: v => '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v), tipFmt: M, label: 'My monthly returns by accrual month' })}</div></div>
      </div>
      <p class="hint">Rates are contractual monthly rates under your agreement. Projected values are estimates and are not guaranteed.</p>`;
  }
  function tracker(i, compact) {
    const total = P.diffDays(i.start, i.maturity), done = Math.min(total, P.diffDays(i.start, P.TODAY)); const pct = Math.round(done / total * 100);
    return `<div class="track"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-weight:600">${i.code} · ${i.planName}</b>${U.invBadge(i)}</div><div class="bar"><div class="fill ${pct >= 100 ? 'done' : ''}" style="width:${pct}%"></div></div><div class="lbls"><span>${compact ? P.fmtDateShort(i.start) : D(i.start)}</span><span>${i.daysLeft ? i.daysLeft + ' days left' : 'Matured'}</span><span>${compact ? P.fmtDateShort(i.maturity) : D(i.maturity)}</span></div></div>`;
  }

  /* =============== MY INVESTMENTS =============== */
  let view = 'table';
  function investments(p) {
    if (p[0]) return detail(p[0]);
    const m = mine();
    return `${crumb('My Investments')}<div class="ph"><div><h1>My investments</h1><p>${m.length} investments · ${M(m.reduce((s, i) => s + i.principal, 0))} principal</p></div><div class="acts"><div class="chips"><button class="chip ${view === 'table' ? 'on' : ''}" data-act="view" data-v="table">Table</button><button class="chip ${view === 'cards' ? 'on' : ''}" data-act="view" data-v="cards">Cards</button></div></div></div>
      ${view === 'table' ? `<div class="card"><div class="tbl"><table><thead><tr><th>Investment</th><th>Plan</th><th class="n">Principal</th><th>Monthly ROI</th><th>Start</th><th>Lock-in</th><th>Lock-in end</th><th>Maturity</th><th class="n">Days left</th><th class="n">Accrued</th><th class="n">Paid</th><th>Status</th></tr></thead><tbody>
        ${m.map(i => `<tr class="click" data-go="investments/${i.code}"><td class="m">${i.code}</td><td>${i.planName}</td><td class="n">${M(i.principal)}</td><td>${P.fmtRate(i.rate)}</td><td>${D(i.start)}</td><td>${i.lockin} months</td><td>${D(i.lockinEnd)}</td><td>${D(i.maturity)}</td><td class="n">${i.daysLeft}</td><td class="n">${M(i.accrued)}</td><td class="n pos">${M(i.paid)}</td><td>${U.invBadge(i)}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="inv-cards">${m.map(i => `<div class="card" data-go="investments/${i.code}" style="cursor:pointer"><div class="card-h"><h3 class="mono">${i.code}</h3><div class="r">${U.invBadge(i)}</div></div><div class="card-b" style="display:grid;gap:14px"><div><div class="num" style="font-size:24px;font-weight:700">${M(i.principal)}</div><div class="hint">${i.planName} · ${P.fmtRate(i.rate)} · ${i.lockin}-month lock-in</div></div>${tracker(i, true)}<dl class="kv"><dt>Monthly return</dt><dd>${M(i.monthly)}</dd><dt>Accrued</dt><dd>${M(i.accrued)}</dd><dt>Received</dt><dd class="pos">${M(i.paid)}</dd></dl></div></div>`).join('')}</div>`}`;
  }
  U.actions.view = t => { view = t.dataset.v; route(); };
  function steps(i) {
    const reached = [true, true, P.TODAY >= i.lockinEnd, P.TODAY >= i.eligible, P.TODAY >= i.maturity, ['redemption_requested', 'redemption_processing', 'redeemed'].includes(i.status), ['redemption_processing', 'redeemed'].includes(i.status), i.status === 'redeemed'];
    const labels = ['Investment created', 'Lock-in in progress', 'Lock-in completed', 'Redemption eligible', 'Maturity reached', 'Redemption requested', 'Redemption processed', 'Redemption completed'];
    const nowIx = reached.lastIndexOf(true);
    return `<div class="steps">${labels.map((l, ix) => `<div class="${ix < nowIx ? 'done' : ix === nowIx ? 'now' : ''}"><i>${ix < nowIx ? '✓' : ''}</i>${l}</div>`).join('')}</div>`;
  }
  function detail(code) {
    const i = mine().find(x => x.code === code);
    if (!i) return `${crumb('My Investments', 'Not found')}<div class="empty"><b>Investment not found</b>We couldn't find that investment in your account. <a href="#/investments">Back to my investments</a></div>`;
    const canRequest = P.TODAY >= i.requestFrom && i.status !== 'redeemed' && !i.status.startsWith('redemption');
    const plan = P.planBy(i.planId);
    return `${crumb('My Investments', code)}<a class="back" href="#/investments">${U.icon('back')} My investments</a>
      <div class="ph"><div><h1><span class="mono">${code}</span> · ${i.planName} ${U.invBadge(i)}</h1><p>${M(i.principal)} at ${P.fmtRate(i.rate)}, simple interest</p></div><div class="acts"><button class="btn" data-act="stmt">${U.icon('download')}Download statement</button><button class="btn primary" data-act="req-red" data-code="${code}" ${canRequest ? '' : 'disabled title="Available from ' + D(i.requestFrom) + '"'}>Request redemption</button></div></div>
      <div class="card"><div class="card-b" style="display:grid;gap:20px">
        <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:flex-end"><div><div class="hint">${i.daysLeft ? 'Lock-in ends and investment matures in' : 'Matured on ' + D(i.maturity)}</div><div class="countdown num">${i.daysLeft ? i.daysLeft + ' days' : '—'}</div></div>
          <div class="note ${canRequest ? 'ok' : 'lock'}" style="flex:1;min-width:260px">${canRequest ? `<b>You can request redemption.</b> The request window opened on ${D(i.requestFrom)}. Funds are paid on or after ${D(i.maturity)}.` : `<b>Redemption isn't available yet.</b> Your agreement has a ${i.lockin}-month lock-in and early redemption is ${i.early.toLowerCase()}. You can request redemption from <b>${D(i.requestFrom)}</b>, payable at maturity on ${D(i.maturity)}.`}</div></div>
        ${tracker(i, false)}${steps(i)}
      </div></div>
      <div class="kpis">${U.kpi('Monthly return', M(i.monthly), P.fmtRate(i.rate) + ' × ' + M(i.principal))}${U.kpi('Returns accrued', M(i.accrued), i.accruals.length + ' of ' + i.lockin + ' months')}${U.kpi('Returns received', M(i.paid), 'Confirmed payments', { cls: 'pos' })}${U.kpi('Accrued, not yet paid', M(i.outstanding), i.processing ? M(i.processing) + ' processing' : '', { subCls: 'warn' })}${U.kpi('Projected remaining', M(i.projected), 'Estimate', { subCls: 'warn' })}</div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>Monthly accrual and payout history</h3></div><div class="tbl"><table><thead><tr><th>Month</th><th>Period</th><th class="n">Return</th><th>Accrued on</th><th>Payout status</th><th>Reference</th></tr></thead><tbody>
          ${i.status === 'active' ? `<tr><td class="m">${i.accruals.length + 1}</td><td>${P.fmtDateShort(P.addMonths(i.start, i.accruals.length))} – ${P.fmtDateShort(P.addDays(i.nextAccrual, -1))}</td><td class="n muted">${M(i.monthly)}</td><td>${D(i.nextAccrual)}</td><td>${U.badge('Projected (estimate)', 'b-amber')}</td><td class="m">—</td></tr>` : ''}
          ${i.accruals.slice().reverse().map(a => `<tr><td class="m">${a.k}</td><td>${P.fmtDateShort(a.from)} – ${P.fmtDateShort(a.to)}</td><td class="n">${M(a.amount)}</td><td>${D(a.end)}</td><td>${U.payBadge(a.pay.status)}</td><td class="m">${a.pay.status === 'paid' ? a.pay.ref : '—'}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Your contractual terms</h3><div class="r mono">${i.planName} v${i.planVersion}</div></div><div class="card-b"><dl class="kv"><dt>Principal</dt><dd>${M(i.principal)}</dd><dt>Monthly ROI</dt><dd>${P.fmtRate(i.rate)}</dd><dt>Method</dt><dd>Simple interest, original principal</dd><dt>Start date</dt><dd>${D(i.start)}</dd><dt>Lock-in period</dt><dd>${i.lockin} months</dd><dt>Lock-in end</dt><dd>${D(i.lockinEnd)}</dd><dt>Maturity date</dt><dd>${D(i.maturity)}</dd><dt>Payout day</dt><dd>${ord(+i.start.slice(8))} of each month*</dd><dt>Early redemption</dt><dd>${i.early}</dd><dt>Fees</dt><dd>None</dd></dl>
            <p class="hint" style="margin-top:10px">*Or the last day of shorter months. ${plan.cur.v > i.planVersion ? `${i.planName} has since been updated to v${plan.cur.v} (${plan.cur.rate.toFixed(2)}%). Your terms above do not change.` : ''}</p></div></div>
          <div class="card"><div class="card-h"><h3>Documents</h3></div><div class="card-b list">${[['Investment agreement ' + i.agreement + '.pdf', D(i.start)], ['Risk disclosure.pdf', D(i.start)], ['Statement · ' + P.MONTHS[+P.TODAY.slice(5, 7) - 2] + ' 2026.pdf', '1 Oct 2026']].map(d => `<div>${U.icon('doc')}<div class="grow"><b>${d[0]}</b><span>${d[1]}</span></div><button class="btn sm" data-act="dl">Download</button></div>`).join('')}</div></div>
        </div>
      </div>`;
  }
  U.actions.stmt = () => { const h = (location.hash || '').slice(2).split('/'); const mine = P.investments().filter(i => i.investorId === ME_ID && i.start);
    const one = h[0] === 'investments' && h[1] ? mine.filter(i => i.code === h[1]) : []; const list = one.length ? one : mine;
    U.docView('Statement' + (one.length ? ' · ' + one[0].code : ''), U.statement(list, me.name), 'statement-' + (one.length ? one[0].code : 'all') + '-' + P.TODAY); };
  U.actions.dl = t => { const row = t.closest('div'); const name = (row.querySelector('b') || {}).textContent || 'Document';
    if (/^Statement/.test(name)) return U.actions.stmt();
    U.docView(name, U.kycDoc(name, me.name)); };

  /* =============== MONTHLY RETURNS =============== */
  function returns() {
    const m = mine(); const accs = m.flatMap(i => i.accruals.map(a => ({ ...a, i })));
    const months = U.lastMonths(8); let cum = 0;
    const sums = months.map(mm => accs.filter(a => a.end.slice(0, 7) === mm).reduce((s, a) => s + a.amount, 0));
    const cumS = sums.map(v => cum += v);
    const tot = k => accs.filter(a => k.includes(a.pay.status)).reduce((s, a) => s + a.amount, 0);
    const projected = m.reduce((s, i) => s + i.projected, 0);
    const principal = m.reduce((s, i) => s + i.principal, 0);
    return `${crumb('Monthly Returns')}<div class="ph"><div><h1>Monthly returns</h1><p>Simple interest: each month's return is your original principal × your contract rate. Returns are never added to principal.</p></div></div>
      <div class="kpis">${U.kpi('Accrued', M(tot(['accrued'])), 'Earned, not yet approved', { tip: 'Returns recorded for completed months, waiting for approval.' })}${U.kpi('Approved', M(tot(['approved'])), 'Scheduled for payment', { tip: 'Approved for payment but not yet sent to the bank.' })}${U.kpi('Processing', M(tot(['processing'])), 'Sent to bank', { subCls: 'warn', tip: 'Sent for payment. Shown as paid only once confirmed.' })}${U.kpi('Paid', M(tot(['paid'])), 'Confirmed', { cls: 'pos' })}${U.kpi('Projected', M(projected), 'Estimate to maturity', { subCls: 'warn', tip: 'Remaining returns at your contract rates if nothing changes. Not guaranteed.' })}</div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>Historical monthly returns</h3><div class="r">by accrual month</div></div><div class="card-b">${U.barChart(months.map(U.monthLabel), [{ name: 'Accrued in month', color: 'var(--chart-2)', values: sums }, { name: 'Cumulative', color: 'var(--chart-4)', values: cumS }], { fmt: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? Math.round(v / 1000) + 'k' : v), tipFmt: M, label: 'Monthly and cumulative returns' })}<div class="legend" style="margin-top:8px"><span><i style="background:var(--chart-2)"></i>Accrued in month</span><span><i style="background:var(--chart-4)"></i>Cumulative</span></div></div></div>
        <div class="card"><div class="card-h"><h3>Principal vs returns</h3></div><div class="card-b">${U.donut([{ name: 'Principal', value: principal, color: 'var(--chart-1)' }, { name: 'Returns received', value: tot(['paid']), color: 'var(--green)' }, { name: 'Returns not yet paid', value: tot(['accrued', 'approved', 'processing']), color: 'var(--amber)' }], { fmt: M, center1: 'Total value', center2: P.fmtShort(principal + accs.reduce((s, a) => s + a.amount, 0)), label: 'Principal versus returns' })}</div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Performance by investment</h3></div><div class="tbl"><table><thead><tr><th>Investment</th><th>Rate</th><th class="n">Principal</th><th class="n">Monthly return</th><th class="n">Months accrued</th><th class="n">Accrued</th><th class="n">Paid</th><th class="n">Not yet paid</th><th class="n">Projected (est.)</th><th class="n">Return on principal</th></tr></thead><tbody>
        ${m.map(i => `<tr class="click" data-go="investments/${i.code}"><td class="m">${i.code}</td><td>${P.fmtRate(i.rate)}</td><td class="n">${M(i.principal)}</td><td class="n">${M(i.monthly)}</td><td class="n">${i.accruals.length} / ${i.lockin}</td><td class="n">${M(i.accrued)}</td><td class="n pos">${M(i.paid)}</td><td class="n">${M(i.outstanding)}</td><td class="n muted">${M(i.projected)}</td><td class="n">${(i.accrued / i.principal * 100).toFixed(2)}%</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="note info"><b>How your return is calculated.</b> INV-1042: ₹5,00,000.00 × 4.00% = ₹20,000.00 per full month, every month of the lock-in. Over 12 months that is ₹2,40,000.00 if the full principal stays invested and nothing changes. This illustration is not a guarantee of payment.</div>`;
  }

  /* =============== LOCK-IN =============== */
  function lockin() {
    const m = mine();
    return `${crumb('Lock-in & Maturity')}<div class="ph"><div><h1>Lock-in & maturity</h1><p>Dates are calculated from your start date plus your lock-in in calendar months. They never change if a plan is edited.</p></div></div>
      ${m.map(i => { const canReq = P.TODAY >= i.requestFrom; return `<div class="card"><div class="card-h"><h3><span class="mono">${i.code}</span> · ${i.planName}</h3><div class="r">${U.invBadge(i)}</div></div><div class="card-b" style="display:grid;gap:20px">
        <div class="grid g-1-2" style="align-items:center"><div><div class="hint">Next date: ${canReq ? 'maturity' : 'redemption request window opens'}</div><div class="countdown num">${P.diffDays(P.TODAY, canReq ? i.maturity : i.requestFrom)} days</div><div class="hint">${D(canReq ? i.maturity : i.requestFrom)}</div></div>
          <dl class="kv"><dt>Start date</dt><dd>${D(i.start)}</dd><dt>Lock-in duration</dt><dd>${i.lockin} months</dd><dt>Lock-in end date</dt><dd>${D(i.lockinEnd)}</dd><dt>Redemption eligibility date</dt><dd>${D(i.eligible)}</dd><dt>Maturity date</dt><dd>${D(i.maturity)}</dd><dt>Days remaining</dt><dd>${i.daysLeft}</dd><dt>Early redemption</dt><dd>${i.early}</dd></dl></div>
        ${tracker(i, false)}${steps(i)}
        ${canReq ? '' : `<div class="note lock">Redemption is locked until ${D(i.requestFrom)} because of the ${i.lockin}-month lock-in in your agreement. This rule is checked by our system and cannot be overridden from this screen.</div>`}
      </div></div>`; }).join('')}`;
  }

  /* =============== TRANSACTIONS =============== */
  function transactions() {
    const rows = P.transactions().filter(t => t.investorId === ME_ID);
    return `${crumb('Transactions')}<div class="ph"><div><h1>Transactions</h1><p>Every movement on your investments. Payouts show as paid only after the bank confirms them.</p></div><div class="acts"><button class="btn" data-act="stmt">${U.icon('download')}Export</button></div></div>
      ${U.table('my-txn', [
        { h: 'Date', v: r => r.date, r: r => D(r.date) }, { h: 'Transaction', m: 1, v: r => r.id }, { h: 'Type', v: r => r.type }, { h: 'Investment', v: r => r.inv, r: r => `<span class="mono">${r.inv}</span>` },
        { h: 'Amount', n: 1, v: r => r.amount, r: r => M(r.amount) }, { h: 'Status', v: r => r.status, r: r => U.txnBadge(r.status) }, { h: 'Reference', v: r => r.ref, r: r => `<span class="mono muted">${esc(r.ref)}</span>` }
      ], rows, { searchPh: 'Search by investment, type or reference', sort: 0, filters: [['All', 'all'], ['Deposits', 'Deposit'], ['Return payouts', 'Return payout'], ['Accruals', 'Return accrual'], ['Redemptions', 'red']], filterFn: (r, f) => f === 'all' || r.type === f || (f === 'red' && r.type.includes('edemption')), per: 12, emptyTitle: 'No transactions', empty: 'Nothing matches these filters.' })}`;
  }

  /* =============== REDEMPTIONS =============== */
  function redemptions() {
    const m = mine(); const rs = P.state.redemptions.filter(r => m.some(i => i.code === r.inv));
    return `${crumb('Redemptions')}<div class="ph"><div><h1>Redemptions</h1><p>Request the return of your principal once your lock-in allows it.</p></div></div>
      <div class="grid g-1-1">${m.map(i => { const can = P.TODAY >= i.requestFrom && !i.status.startsWith('redemption') && i.status !== 'redeemed'; return `<div class="card"><div class="card-h"><h3 class="mono">${i.code}</h3><div class="r">${U.invBadge(i)}</div></div><div class="card-b" style="display:grid;gap:12px"><dl class="kv"><dt>Principal</dt><dd>${M(i.principal)}</dd><dt>Maturity</dt><dd>${D(i.maturity)}</dd><dt>Request window opens</dt><dd>${D(i.requestFrom)}</dd></dl>${can ? '' : `<div class="note lock">Locked. You can request redemption from ${D(i.requestFrom)}.</div>`}<div style="display:flex;justify-content:flex-end"><button class="btn primary" data-act="req-red" data-code="${i.code}" ${can ? '' : 'disabled'}>Request redemption</button></div></div></div>`; }).join('')}</div>
      <div class="card"><div class="card-h"><h3>My requests</h3></div>${rs.length ? `<div class="tbl"><table><thead><tr><th>Request</th><th>Investment</th><th>Requested</th><th>Status</th></tr></thead><tbody>${rs.map(r => `<tr><td class="m">${r.id}</td><td class="m">${r.inv}</td><td>${D(r.requested)}</td><td>${U.redBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card-b"><div class="empty"><b>No redemption requests yet</b>When you request a redemption, you can follow each step here.</div></div>`}</div>`;
  }
  U.actions['req-red'] = t => { const i = mine().find(x => x.code === t.dataset.code);
    U.modal('Request redemption of ' + i.code + '?', 'Your principal of ' + M(i.principal) + ' plus any unpaid returns will be paid on or after ' + D(i.maturity) + '.',
      `<div class="field"><label for="rq-n">Note (optional)</label><textarea class="input" id="rq-n"></textarea></div><div class="note info">Paid to your registered account ${me.bank}. You can withdraw the request until it is approved.</div>`,
      `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-req" data-code="${i.code}">Submit request</button>`); };
  U.actions['do-req'] = t => { const n = 'RDM-0' + (219 + P.state.redemptions.length); P.state.redemptions.push({ id: n, inv: t.dataset.code, type: 'maturity', status: 'requested', requested: P.TODAY, note: document.getElementById('rq-n').value, history: [['requested', P.TODAY, me.name]] }); P.save(); U.closeOverlay(); U.toast('Redemption requested', n + ' · we\'ll notify you at each step.'); route(); };

  /* =============== DOCUMENTS =============== */
  let docTab = 'statements';
  function documents() {
    const m = mine(); const docs = {
      statements: ['Sep', 'Aug', 'Jul', 'Jun', 'May', 'Apr'].map((mo, ix) => ['Monthly statement · ' + mo + ' 2026', 'All investments', D('2026-' + String(10 - ix).padStart(2, '0') + '-01')]),
      agreements: m.flatMap(i => [['Investment agreement ' + i.agreement, i.code, D(i.start)], ['Risk disclosure · ' + i.planName + ' v' + i.planVersion, i.code, D(i.start)]]),
      other: [['KYC verification confirmation', 'Account', D(me.registered)], ['Annual interest certificate FY 2025-26', 'Tax', '15 Apr 2026']]
    };
    return `${crumb('Statements & Documents')}<div class="ph"><div><h1>Statements & documents</h1><p>Downloads use secure, time-limited links. Only documents shared with you appear here.</p></div></div>
      <div class="card"><div class="tabs" style="padding:0 12px">${[['statements', 'Statements'], ['agreements', 'Investment agreements'], ['other', 'Other documents']].map(([k, l]) => `<button class="tab ${k === docTab ? 'on' : ''}" data-act="doc-tab" data-t="${k}">${l}<span class="c">${docs[k].length}</span></button>`).join('')}</div>
      <div class="card-b list">${docs[docTab].map(d => `<div>${U.icon('doc')}<div class="grow"><b>${esc(d[0])}</b><span>${esc(d[1])} · ${d[2]} · PDF</span></div><button class="btn sm" data-act="dl">${U.icon('download')}Download</button></div>`).join('')}</div></div>`;
  }
  U.actions['doc-tab'] = t => { docTab = t.dataset.t; route(); };

  /* =============== ANNOUNCEMENTS =============== */
  function announcements() {
    const list = anns(); const ns = notifs();
    return `${crumb('Announcements')}<div class="ph"><div><h1>Announcements</h1><p>Notices from ${P.BRAND.name}. Announcements are informational and don't change your agreement.</p></div></div>
      ${list.map(a => { const n = ns.find(x => x.id === 'N-' + a.id); const unread = n && !n.read; return `<div class="card" ${unread ? 'style="border-color:var(--blue)"' : ''}><div class="card-b" style="display:grid;gap:8px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${unread ? '<span class="dot unread"></span>' : ''}<h3 style="font-size:16px;font-weight:600">${esc(a.title)}</h3>${U.badge(a.cat, 'b-blue')}<span class="muted" style="margin-left:auto;font-size:12.5px">${D(a.at)}</span></div><p style="color:var(--fg-2);max-width:80ch">${esc(a.body)}</p>${unread ? `<div><button class="btn sm" data-act="mark-read" data-id="N-${a.id}">Mark as read</button></div>` : ''}</div></div>`; }).join('') || '<div class="empty"><b>No announcements yet</b>Notices from the company will appear here.</div>'}`;
  }
  U.actions['mark-read'] = t => { P.state.reads[t.dataset.id] = true; P.save(); route(); };

  /* =============== NOTIFICATIONS =============== */
  let nf = 'all';
  function notifications() {
    const all = notifs(); const list = all.filter(n => nf === 'all' || (nf === 'unread' ? !n.read : n.kind === nf));
    return `${crumb('Notifications')}<div class="ph"><div><h1>Notifications</h1><p>${all.filter(n => !n.read).length} unread. Read status is saved to your account.</p></div><div class="acts"><button class="btn" data-act="read-all">Mark all as read</button></div></div>
      <div class="card"><div class="toolbar"><div class="chips">${[['all', 'All'], ['unread', 'Unread'], ['announcement', 'Announcements'], ['payout', 'Payouts'], ['accrual', 'Accruals'], ['maturity', 'Maturity'], ['redemption', 'Redemptions']].map(([k, l]) => `<button class="chip ${nf === k ? 'on' : ''}" data-act="nf" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="card-b list">${list.slice(0, 40).map(n => nRow(n, false)).join('') || '<div class="empty"><b>You\'re all caught up</b>No notifications match this filter.</div>'}</div></div>`;
  }
  U.actions.nf = t => { nf = t.dataset.k; route(); };

  /* =============== PROFILE =============== */
  function profile() {
    return `${crumb('Profile & Security')}<div class="ph"><div><h1>Profile & security</h1></div></div>
      <div class="grid g-1-1">
        <div class="card"><div class="card-h"><h3>Personal details</h3><div class="r">${U.badge('Verified', 'b-green')}</div></div><div class="card-b form">
          <div class="f-row"><div class="field"><label for="pr-n">Full name</label><input class="input" id="pr-n" value="${esc(me.name)}" readonly><span class="hint">Contact support to change verified details.</span></div><div class="field"><label for="pr-id">Investor ID</label><input class="input" id="pr-id" value="${me.id}" readonly></div></div>
          <div class="f-row"><div class="field"><label for="pr-e">Email</label><input class="input" id="pr-e" value="${me.email}"></div><div class="field"><label for="pr-p">Phone</label><input class="input" id="pr-p" value="${me.phone}"></div></div>
          <div class="field"><label for="pr-a">Address</label><input class="input" id="pr-a" value="14, Lakeview Residency, Indiranagar, ${me.city}"></div>
          <div class="f-row"><div class="field"><label for="pr-b">Payout bank account</label><input class="input" id="pr-b" value="${me.bank}" readonly></div><div class="field"><label for="pr-k">Verification</label><input class="input" id="pr-k" value="KYC verified · ${D(me.registered)}" readonly></div></div>
          <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-act="save-profile">Save contact details</button></div></div></div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Password & two-factor authentication</h3></div><div class="card-b form">
            <div class="f-row"><div class="field"><label for="pw-1">Current password</label><input class="input" id="pw-1" type="password"></div><div class="field"><label for="pw-2">New password</label><input class="input" id="pw-2" type="password"><span class="hint">At least 12 characters.</span></div></div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><label class="check"><input type="checkbox" id="tfa" checked> Two-factor authentication (authenticator app)</label><button class="btn" data-act="pw">Change password</button></div></div></div>
          <div class="card"><div class="card-h"><h3>Active sessions</h3></div><div class="card-b list">
            <div><div class="grow"><b>Chrome on Windows · Bengaluru</b><span>This device · active now</span></div>${U.badge('Current', 'b-green')}</div>
            <div><div class="grow"><b>Safari on iPhone · Bengaluru</b><span>Last active 2 days ago</span></div><button class="btn sm danger" data-act="signout-s">Sign out</button></div></div></div>
          <div class="card"><div class="card-h"><h3>Notification preferences</h3></div><div class="card-b" style="display:grid;gap:10px">
            ${['Payout confirmations', 'Monthly accruals', 'Maturity reminders', 'Announcements', 'Redemption updates'].map((x, ix) => `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${x}</span><span style="display:flex;gap:14px"><label class="check"><input type="checkbox" checked disabled> In-app</label><label class="check"><input type="checkbox" ${ix !== 1 ? 'checked' : ''}> Email</label></span></div>`).join('')}</div></div>
          <a class="btn danger" href="index.html">${U.icon('logout')}Sign out</a>
        </div>
      </div>`;
  }
  U.actions['save-profile'] = () => U.toast('Contact details saved', 'Changes to email trigger a verification link.');
  U.actions.pw = () => { const a = document.getElementById('pw-2'); if (a.value.length < 12) { a.classList.add('bad'); U.toast('Password too short', 'Use at least 12 characters.', 'err'); return; } U.toast('Password changed', 'Other sessions have been signed out.'); };
  U.actions['signout-s'] = t => { t.closest('div').remove(); U.toast('Session signed out', 'Safari on iPhone'); };

  document.getElementById('gsearch').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const q = e.target.value.trim().toUpperCase(); const i = mine().find(x => x.code === q || x.code.endsWith(q)); if (i) U.nav('investments/' + i.code); else U.toast('No match', 'Try one of your investment IDs, e.g. INV-1042.', 'warn'); });

  const route = U.router({ overview, investments, returns, lockin, transactions, redemptions, documents, announcements, notifications, profile }, counts);
})();
