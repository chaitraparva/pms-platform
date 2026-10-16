/* PMS prototype — Super Admin dashboard */
(function () {
  const P = window.PMS, U = window.UI, esc = U.esc, M = P.fmtMoney, D = P.fmtDate, S = P.fmtShort;
  const ME = { name: 'Priya Sharma', initials: 'PS', sub: 'Super Admin' };
  const CHECKER = 'Karan Mehta';

  U.shell({
    roleLabel: 'Super Admin', searchPh: 'Search investors, investments, transactions', user: ME,
    nav: [
      { group: 'Dashboard' }, { route: 'overview', label: 'Overview', icon: 'home' },
      { group: 'Manage' }, { route: 'investors', label: 'Investors', icon: 'users' }, { route: 'plans', label: 'Investment Plans', icon: 'plans' },
      { route: 'investments', label: 'Investments', icon: 'invest' }, { route: 'accruals', label: 'Monthly ROI & Accruals', icon: 'roi' },
      { route: 'payouts', label: 'Payouts', icon: 'payout', count: 1 }, { route: 'redemptions', label: 'Redemptions', icon: 'redeem', count: 1 },
      { route: 'transactions', label: 'Transactions', icon: 'txn' },
      { group: 'Communicate & control' }, { route: 'announcements', label: 'Announcements', icon: 'announce' }, { route: 'reports', label: 'Reports', icon: 'report' },
      { route: 'audit', label: 'Audit Logs', icon: 'audit' }, { route: 'settings', label: 'Settings', icon: 'settings' }
    ]
  });

  const crumb = (...p) => `<span data-crumb="${esc(p.map((x, i) => i === p.length - 1 ? '<b>' + esc(x) + '</b>' : esc(x)).join(' / '))}"></span>`;
  const payouts = () => P.investments().flatMap(i => i.accruals.map(a => ({ ...a, inv: i, status: a.pay.status })));
  const reds = () => P.state.redemptions.map(r => ({ ...r, i: P.investments().find(x => x.code === r.inv) }));
  const pendingCount = () => payouts().filter(p => p.status === 'approved' || p.status === 'processing').length;
  function counts() {
    const pc = document.querySelector('[data-count="payouts"]'), rc = document.querySelector('[data-count="redemptions"]');
    const n1 = pendingCount(), n2 = reds().filter(r => r.status === 'requested' || r.status === 'under_review').length;
    if (pc) { pc.textContent = n1; pc.classList.toggle('hidden', !n1); }
    if (rc) { rc.textContent = n2; rc.classList.toggle('hidden', !n2); }
    const bc = document.getElementById('bell-ct'); const tasks = adminAlerts(); bc.textContent = tasks.length; bc.classList.toggle('hidden', !tasks.length);
  }
  function adminAlerts() {
    const out = [];
    const ap = payouts().filter(p => p.status === 'approved'); if (ap.length) out.push(['Payouts', `${ap.length} approved payouts waiting to be sent`, 'payouts']);
    const pr = payouts().filter(p => p.status === 'processing'); if (pr.length) out.push(['Payouts', `${pr.length} payouts waiting for payment confirmation`, 'payouts']);
    reds().filter(r => r.status === 'requested' || r.status === 'under_review').forEach(r => out.push(['Redemption', `${r.id} from ${r.i.investor} needs review`, 'redemptions/' + r.id]));
    P.investments().filter(i => i.status === 'pending_funding').forEach(i => out.push(['Funding', `${i.code} awaiting deposit confirmation`, 'investments/' + i.code]));
    return out;
  }
  U.actions.bell = () => {
    const pop = document.getElementById('bell-pop'); if (pop.innerHTML) { U.closePops(); return; } U.closePops();
    const a = adminAlerts();
    pop.innerHTML = `<div class="popover"><div class="ph2"><b>Needs your attention</b></div><div class="pl list">${a.map(x => `<div data-go="${x[2]}" style="cursor:pointer"><span class="badge b-amber">${x[0]}</span><div class="grow"><b>${esc(x[1])}</b></div></div>`).join('') || '<div><div class="grow"><span>You are all caught up.</span></div></div>'}</div></div>`;
  };

  /* =============== OVERVIEW =============== */
  function overview() {
    const invs = P.investments(); const live = invs.filter(i => ['active', 'redemption_requested', 'redemption_processing', 'matured'].includes(i.status));
    const activeInvestors = new Set(live.map(i => i.investorId)).size;
    const principal = live.reduce((s, i) => s + i.principal, 0);
    const locked = live.filter(i => i.status === 'active' && i.maturity > P.TODAY).reduce((s, i) => s + i.principal, 0);
    const accrued = invs.reduce((s, i) => s + i.accrued, 0) - 6000;
    const paid = invs.reduce((s, i) => s + i.paid, 0);
    const outst = invs.reduce((s, i) => s + i.outstanding, 0);
    const unpaidN = payouts().filter(p => p.status !== 'paid').length;
    const maturing = live.filter(i => i.daysLeft !== null && i.daysLeft <= 60 && i.daysLeft > 0);
    const pendRed = reds().filter(r => ['requested', 'under_review', 'approved', 'processing'].includes(r.status));
    const activePlans = P.plans().filter(p => p.status === 'active').length;
    const months = U.lastMonths(8);
    const all = payouts();
    const accS = months.map(m => all.filter(a => a.end.slice(0, 7) === m).reduce((s, a) => s + a.amount, 0));
    const paidS = months.map(m => all.filter(a => a.status === 'paid' && (a.pay.at || a.end).slice(0, 7) === m).reduce((s, a) => s + a.amount, 0));
    const volS = months.map(m => invs.filter(i => i.start && i.start.slice(0, 7) === m).reduce((s, i) => s + i.principal, 0));
    const byPlan = P.plans().filter(p => p.status !== 'archived').map((p, ix) => ({ name: p.name + ' · ' + p.cur.rate.toFixed(2) + '%', value: live.filter(i => i.planId === p.id).reduce((s, i) => s + i.principal, 0), color: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'][ix] }));
    const l6 = live.filter(i => i.lockin === 6).length, l12 = live.filter(i => i.lockin === 12).length;
    const tx = P.transactions().slice(0, 6);
    return `${crumb('Overview')}
      <div class="ph"><div><h1>Good morning, Priya</h1><p>Portfolio as of ${D(P.TODAY)} · all figures derived from ledger records</p></div><div class="acts"><button class="btn" data-act="export-overview">${U.icon('download')}Export</button><button class="btn accent" data-act="new-investment">${U.icon('plus')}Record investment</button></div></div>
      <div class="kpis">
        ${U.kpi('Registered investors', P.investors.length, '+3 this month', { subCls: 'up', tip: 'All investor accounts, any status.' })}
        ${U.kpi('Active investors', activeInvestors, 'With ≥1 live investment', { tip: 'Investors with at least one investment that is active, matured or in redemption.' })}
        ${U.kpi('Total principal invested', S(principal), live.length + ' live investments', { tip: 'Sum of principal on live investments. This is investor money, not company revenue.' })}
        ${U.kpi('Locked principal', S(locked), 'Inside lock-in', { tip: 'Principal on investments whose lock-in end date is after today.' })}
        ${U.kpi('Active plans', activePlans, P.plans().length - activePlans + ' inactive or archived', { tip: 'Plans currently open to new investments.' })}
        ${U.kpi('Total accrued returns', S(accrued), 'Net of reversals', { tip: 'Sum of all accrual ledger entries less reversals. Accrued is not the same as paid.' })}
        ${U.kpi('Total returns paid', S(paid), 'Confirmed payments only', { cls: 'pos', tip: 'Payouts confirmed with a bank reference.' })}
        ${U.kpi('Outstanding return obligations', S(outst), unpaidN + ' payouts not yet paid', { subCls: 'warn', tip: 'Accrued returns that are not yet confirmed paid (accrued + approved + processing).' })}
        ${U.kpi('Maturing in 60 days', maturing.length, S(maturing.reduce((s, i) => s + i.principal, 0)) + ' principal', { subCls: 'warn', tip: 'Live investments whose maturity date is within the next 60 days.' })}
        ${U.kpi('Pending redemptions', pendRed.length, S(pendRed.reduce((s, r) => s + r.i.principal, 0)) + ' requested', { subCls: 'warn', tip: 'Redemption requests not yet completed or rejected.' })}
      </div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>Monthly return accruals vs confirmed payouts</h3><div class="r legend"><span><i style="background:var(--chart-1)"></i>Accrued</span><span><i style="background:var(--green)"></i>Paid</span></div></div>
          <div class="card-b">${U.barChart(months.map(U.monthLabel), [{ name: 'Accrued', color: 'var(--chart-1)', values: accS }, { name: 'Paid', color: 'var(--green)', values: paidS }], { fmt: v => S(v).replace('.00', ''), tipFmt: M, label: 'Accrued vs paid returns by month' })}</div></div>
        <div class="card"><div class="card-h"><h3>Pending administrative actions</h3><div class="r">${adminAlerts().length} open</div></div><div class="card-b list">
          ${adminAlerts().slice(0, 6).map(x => `<div data-go="${x[2]}" style="cursor:pointer"><span class="badge b-amber">${x[0]}</span><div class="grow"><b>${esc(x[1])}</b></div><span class="muted">›</span></div>`).join('') || '<div class="empty"><b>All clear</b>No actions waiting.</div>'}
        </div></div>
      </div>
      <div class="grid g-1-1-1">
        <div class="card"><div class="card-h"><h3>Monthly investment volume</h3></div><div class="card-b">${U.barChart(months.map(U.monthLabel), [{ name: 'New principal', color: 'var(--chart-2)', values: volS }], { h: 200, w: 420, fmt: v => S(v).replace('.00', ''), tipFmt: M, label: 'New principal by month' })}</div></div>
        <div class="card"><div class="card-h"><h3>Principal by plan</h3></div><div class="card-b">${U.donut(byPlan, { fmt: S, center1: 'Total', center2: S(principal), label: 'Principal by plan' })}</div></div>
        <div class="card"><div class="card-h"><h3>Lock-in distribution</h3></div><div class="card-b" style="display:grid;gap:14px">
          ${[['6-month lock-in', l6], ['12-month lock-in', l12]].map(([n, v]) => `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${n}</span><b class="num" style="font-weight:500">${v} investments · ${Math.round(v / (l6 + l12) * 100)}%</b></div><div class="hbar"><div style="width:${v / (l6 + l12) * 100}%"></div></div></div>`).join('')}
          <p class="hint">Live investments only. Custom lock-in is ${P.state.settings.customLockin ? 'enabled' : 'disabled'} in Settings.</p></div></div>
      </div>
      <div class="grid g-1-1-1">
        <div class="card"><div class="card-h"><h3>Upcoming maturities</h3><div class="r"><a href="#/reports">Report</a></div></div><div class="card-b list">
          ${maturing.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5).map(i => `<div data-go="investments/${i.code}" style="cursor:pointer"><div class="grow"><b>${i.code} · ${esc(i.investor)}</b><span>${M(i.principal)} · ${i.planName}</span></div><span class="badge b-amber">${P.fmtDateShort(i.maturity)} · ${i.daysLeft}d</span></div>`).join('')}
        </div></div>
        <div class="card"><div class="card-h"><h3>Recent transactions</h3><div class="r"><a href="#/transactions">View all</a></div></div><div class="card-b list">
          ${tx.map(t => `<div><div class="grow"><b>${esc(t.type)} · ${t.inv}</b><span>${t.id} · ${P.fmtDateShort(t.date)}</span></div><span class="num ${t.amount < 0 ? 'neg' : ''}">${M(t.amount)}</span></div>`).join('')}
        </div></div>
        <div class="card"><div class="card-h"><h3>Recently registered investors</h3><div class="r"><a href="#/investors">Directory</a></div></div><div class="card-b list">
          ${P.investors.slice().sort((a, b) => b.registered.localeCompare(a.registered)).slice(0, 5).map(v => `<div data-go="investors/${v.id}" style="cursor:pointer"><div class="avatar" style="width:30px;height:30px;font-size:11px">${v.name.split(' ').map(x => x[0]).join('')}</div><div class="grow"><b>${esc(v.name)}</b><span>${v.id} · ${D(v.registered)}</span></div>${kycBadge(v.kyc)}</div>`).join('')}
        </div></div>
      </div>`;
  }
  const kycBadge = k => ({ verified: U.badge('Verified', 'b-green'), pending: U.badge('KYC pending', 'b-amber'), rejected: U.badge('KYC rejected', 'b-red') })[k];
  const acctBadge = s => s === 'active' ? U.badge('Active', 'b-blue') : U.badge('Suspended', 'b-red');

  /* =============== INVESTORS =============== */
  function investorRows() {
    const invs = P.investments();
    return P.investors.map(v => { const m = invs.filter(i => i.investorId === v.id); const live = m.filter(i => !['redeemed', 'cancelled', 'pending_funding'].includes(i.status));
      return { ...v, principal: live.reduce((s, i) => s + i.principal, 0), active: live.length, accrued: m.reduce((s, i) => s + i.accrued, 0), paid: m.reduce((s, i) => s + i.paid, 0), next: live.map(i => i.maturity).filter(Boolean).sort()[0] || null }; });
  }
  function investors(p) {
    if (p[0]) return investorDetail(p[0]);
    const rows = investorRows();
    return `${crumb('Investors')}<div class="ph"><div><h1>Investors</h1><p>${rows.length} registered · ${rows.filter(r => r.kyc === 'pending').length} awaiting verification</p></div><div class="acts"><button class="btn" data-act="csv" data-csv="investors">${U.icon('download')}Export CSV</button><button class="btn accent" data-act="new-investor">${U.icon('plus')}Add investor</button></div></div>
      ${U.table('inv-dir', [
        { h: 'Investor', v: r => r.name, r: r => `<b>${esc(r.name)}</b><span class="sub">${r.id} · ${esc(r.email)}</span>` },
        { h: 'Phone', v: r => r.phone, r: r => `<span class="num">${r.phone}</span>` },
        { h: 'Registered', v: r => r.registered, r: r => D(r.registered) },
        { h: 'Verification', v: r => r.kyc, r: r => kycBadge(r.kyc) },
        { h: 'Account', v: r => r.status, r: r => acctBadge(r.status) },
        { h: 'Principal', n: 1, v: r => r.principal, r: r => M(r.principal) },
        { h: 'Active', n: 1, v: r => r.active, r: r => r.active },
        { h: 'Accrued', n: 1, v: r => r.accrued, r: r => M(r.accrued) },
        { h: 'Paid', n: 1, v: r => r.paid, r: r => `<span class="pos">${M(r.paid)}</span>` },
        { h: 'Next maturity', v: r => r.next || '9999', r: r => r.next ? D(r.next) : '<span class="muted">—</span>' }
      ], rows, { searchPh: 'Search name, ID, email, phone', sort: 5, filters: [['All', 'all'], ['Verified', 'verified'], ['KYC pending', 'pending'], ['Suspended', 'suspended']], filterFn: (r, f) => f === 'all' || r.kyc === f || r.status === f, go: r => 'investors/' + r.id, text: r => r.email + r.phone })}`;
  }
  function investorDetail(id) {
    const v = investorRows().find(x => x.id === id); if (!v) return notFound();
    const invs = P.investments().filter(i => i.investorId === id);
    const tx = P.transactions().filter(t => t.investorId === id);
    const rd = reds().filter(r => r.i.investorId === id);
    return `${crumb('Investors', v.name)}<a class="back" href="#/investors">${U.icon('back')} All investors</a>
      <div class="ph"><div style="display:flex;gap:14px;align-items:center"><div class="avatar" style="width:52px;height:52px;font-size:17px">${v.name.split(' ').map(x => x[0]).join('')}</div><div><h1>${esc(v.name)}</h1><p>${v.id} · ${esc(v.email)} · ${v.phone} · ${v.city}</p></div></div>
        <div class="acts">${kycBadge(v.kyc)} ${acctBadge(v.status)}<button class="btn" data-act="notify-investor" data-id="${v.id}">${U.icon('announce')}Send notice</button><button class="btn ${v.status === 'active' ? 'danger' : ''}" data-act="toggle-account" data-id="${v.id}">${v.status === 'active' ? 'Suspend account' : 'Reactivate account'}</button><button class="btn accent" data-act="new-investment" data-investor="${v.id}">${U.icon('plus')}Record investment</button></div></div>
      <div class="kpis">${U.kpi('Principal (live)', M(v.principal))}${U.kpi('Active investments', v.active)}${U.kpi('Accrued returns', M(v.accrued))}${U.kpi('Returns paid', M(v.paid), '', { cls: 'pos' })}${U.kpi('Next maturity', v.next ? D(v.next) : '—')}</div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>Investment portfolio</h3></div><div class="tbl"><table><thead><tr><th>Investment</th><th>Plan</th><th class="n">Principal</th><th>Rate</th><th>Maturity</th><th class="n">Accrued</th><th class="n">Paid</th><th>Status</th></tr></thead><tbody>
          ${invs.map(i => `<tr class="click" data-go="investments/${i.code}"><td class="m">${i.code}</td><td>${i.planName} v${i.planVersion}<span class="sub">${i.lockin} months</span></td><td class="n">${M(i.principal)}</td><td>${P.fmtRate(i.rate)}</td><td>${D(i.maturity)}</td><td class="n">${M(i.accrued)}</td><td class="n pos">${M(i.paid)}</td><td>${U.invBadge(i)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No investments yet</td></tr>'}
        </tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Profile & verification</h3></div><div class="card-b" style="display:grid;gap:14px"><dl class="kv"><dt>Registered</dt><dd>${D(v.registered)}</dd><dt>City</dt><dd>${v.city}</dd><dt>PAN</dt><dd class="mono">ABCPR••••K</dd><dt>Bank account</dt><dd class="mono">${v.bank}</dd><dt>Verification</dt><dd>${kycBadge(v.kyc)}</dd></dl>
          <div class="list">${['PAN card.pdf', 'Aadhaar (masked).pdf', 'Cancelled cheque.jpg'].map(d => `<div>${U.icon('doc', '')}<div class="grow"><b>${d}</b><span>Uploaded ${D(v.registered)}</span></div><button class="btn sm" data-act="kyc-doc" data-who="${esc(v.name)}">View</button></div>`).join('')}</div>
          ${v.kyc === 'pending' ? `<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn danger" data-act="kyc" data-id="${v.id}" data-d="rejected">Reject</button><button class="btn primary" data-act="kyc" data-id="${v.id}" data-d="verified">Verify investor</button></div>` : ''}
        </div></div>
      </div>
      <div class="grid g-1-1">
        <div class="card"><div class="card-h"><h3>Transaction history</h3></div><div class="tbl"><table><thead><tr><th>Date</th><th>Type</th><th>Investment</th><th class="n">Amount</th><th>Status</th></tr></thead><tbody>${tx.slice(0, 8).map(t => `<tr><td>${D(t.date)}</td><td>${t.type}</td><td class="m">${t.inv}</td><td class="n">${M(t.amount)}</td><td>${U.txnBadge(t.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No transactions</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Redemption requests</h3></div><div class="card-b list">${rd.map(r => `<div data-go="redemptions/${r.id}" style="cursor:pointer"><div class="grow"><b>${r.id} · ${r.inv}</b><span>Requested ${D(r.requested)}</span></div>${U.redBadge(r.status)}</div>`).join('') || '<div class="empty"><b>No redemption requests</b>Requests appear when this investor asks to redeem.</div>'}</div></div>
      </div>`;
  }
  U.actions['toggle-account'] = t => { const v = P.invBy(t.dataset.id); const nv = v.status === 'active' ? 'suspended' : 'active';
    U.modal(nv === 'suspended' ? 'Suspend ' + v.name + '?' : 'Reactivate ' + v.name + '?', 'The investor ' + (nv === 'suspended' ? 'will not be able to sign in. Accruals continue under their contract.' : 'will be able to sign in again.'),
      `<div class="field"><label for="rs">Reason (required, saved to audit log)</label><input class="input" id="rs" placeholder="e.g. KYC address mismatch"></div>`,
      `<button class="btn ghost" data-act="close">Cancel</button><button class="btn ${nv === 'suspended' ? 'danger' : 'primary'}" data-act="do-toggle" data-id="${v.id}" data-nv="${nv}">${nv === 'suspended' ? 'Suspend account' : 'Reactivate'}</button>`); };
  U.actions['do-toggle'] = t => { const r = document.getElementById('rs'); if (!r.value.trim()) { r.classList.add('bad'); r.insertAdjacentHTML('afterend', '<span class="hint err">Enter a reason.</span>'); return; }
    const v = P.invBy(t.dataset.id); P.log(ME.name, 'investor.status', v.id, r.value, 'status: ' + v.status + ' → ' + t.dataset.nv); v.status = t.dataset.nv; P.save(); U.closeOverlay(); U.toast('Account ' + (v.status === 'active' ? 'reactivated' : 'suspended'), v.name + ' · recorded in audit log'); route(); };
  U.actions.kyc = t => { const v = P.invBy(t.dataset.id); P.log(ME.name, 'investor.kyc', v.id, 'Documents reviewed', 'kyc: ' + v.kyc + ' → ' + t.dataset.d); v.kyc = t.dataset.d; P.save(); U.toast(t.dataset.d === 'verified' ? 'Investor verified' : 'Verification rejected', v.name); route(); };
  U.actions['new-investor'] = () => U.drawer('Add investor', 'Creates an investor account and sends an invitation to set a password.',
    `<div class="form"><div class="field"><label for="ni-n">Full name</label><input class="input" id="ni-n" placeholder="As on PAN"></div><div class="f-row"><div class="field"><label for="ni-e">Email</label><input class="input" id="ni-e" type="email"></div><div class="field"><label for="ni-p">Phone</label><input class="input" id="ni-p" placeholder="+91"></div></div><div class="field"><label for="ni-c">City</label><input class="input" id="ni-c"></div><div class="note info">Investors upload KYC documents after accepting the invitation. They cannot invest until verified.</div></div>`,
    `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="save-investor">Create and send invite</button>`);
  U.actions['save-investor'] = () => { const n = document.getElementById('ni-n'), e = document.getElementById('ni-e'); let ok = true;
    [n, e].forEach(x => { if (!x.value.trim()) { x.classList.add('bad'); ok = false; } }); if (!ok) { U.toast('Fill in the highlighted fields', 'Name and email are required.', 'err'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.value.trim())) { e.classList.add('bad'); U.toast('Check the email address', 'Enter a valid email such as name@example.com.', 'err'); return; }
    if (P.investors.some(x => x.email.toLowerCase() === e.value.trim().toLowerCase())) { e.classList.add('bad'); U.toast('Email already registered', 'Another investor already uses this email.', 'err'); return; }
    const id = P.addInvestor({ name: n.value.trim(), email: e.value.trim(), phone: document.getElementById('ni-p').value.trim(), city: document.getElementById('ni-c').value.trim() });
    P.log(ME.name, 'investor.create', id, 'Invitation sent to ' + e.value.trim(), 'status: — → active · kyc: pending'); P.save();
    U.closeOverlay(); U.toast('Investor added', n.value.trim() + ' · invitation sent. KYC is pending.'); U.nav('investors/' + id); };
  U.actions['notify-investor'] = t => openComposer({ aud: 'selected', ids: [t.dataset.id] });

  /* =============== PLANS =============== */
  const planBadge = s => ({ active: U.badge('Active', 'b-green'), inactive: U.badge('Inactive', 'b-amber'), archived: U.badge('Archived', 'b-grey'), draft: U.badge('Draft', 'b-grey') })[s];
  function plans(p) {
    if (p[0]) return planDetail(p[0]);
    const invs = P.investments();
    return `${crumb('Investment Plans')}<div class="ph"><div><h1>Investment Plans</h1><p>Rates are configurable. Editing a plan creates a new version; existing investments keep the terms they signed.</p></div><div class="acts"><button class="btn accent" data-act="new-plan">${U.icon('plus')}New plan</button></div></div>
      <div class="grid g-1-1-1">${P.plans().map(pl => { const m = invs.filter(i => i.planId === pl.id && !['redeemed', 'pending_funding', 'cancelled'].includes(i.status));
        return `<div class="card" data-go="plans/${pl.id}" style="cursor:pointer"><div class="card-h"><h3>${esc(pl.name)}</h3><span class="mono muted">${pl.id} · v${pl.cur.v}</span><div class="r">${planBadge(pl.status)}</div></div>
        <div class="card-b" style="display:grid;gap:14px"><div><div style="font-size:30px;font-weight:700;letter-spacing:-.02em" class="num">${pl.cur.rate.toFixed(2)}%</div><div class="hint">per month · simple interest on principal</div></div>
        <p class="muted" style="font-size:13px">${esc(pl.desc)}</p>
        <dl class="kv"><dt>Investment range</dt><dd>${S(pl.cur.min)} – ${S(pl.cur.max)}</dd><dt>Lock-in</dt><dd>${pl.cur.lockins.join(' or ')} months</dd><dt>Eligible</dt><dd>${P.fmtDateShort(pl.cur.eligFrom)} – ${D(pl.cur.eligTo)}</dd><dt>Live investments</dt><dd>${m.length} · ${S(m.reduce((s, i) => s + i.principal, 0))}</dd></dl></div></div>`; }).join('')}</div>
      <p class="hint">Rates shown are configurable examples, not guaranteed returns.</p>`;
  }
  function planDetail(id) {
    const pl = P.planBy(id); if (!pl) return notFound(); const c = pl.cur;
    const invs = P.investments().filter(i => i.planId === id);
    return `${crumb('Investment Plans', pl.name)}<a class="back" href="#/plans">${U.icon('back')} All plans</a>
      <div class="ph"><div><h1>${esc(pl.name)} ${planBadge(pl.status)}</h1><p class="mono">${pl.id} · current version v${c.v} · ${invs.length} investments across ${pl.versions.length} version${pl.versions.length > 1 ? 's' : ''}</p></div>
      <div class="acts">${pl.status === 'active' ? `<button class="btn" data-act="plan-status" data-id="${id}" data-s="inactive">Deactivate</button>` : pl.status !== 'archived' ? `<button class="btn" data-act="plan-status" data-id="${id}" data-s="active">Activate</button>` : ''}${pl.status !== 'archived' ? `<button class="btn" data-act="plan-status" data-id="${id}" data-s="archived">Archive</button><button class="btn primary" data-act="edit-plan" data-id="${id}">Edit plan</button>` : `<button class="btn" data-act="plan-status" data-id="${id}" data-s="inactive">Restore</button>`}</div></div>
      <div class="grid g-1-1">
        <div class="card"><div class="card-h"><h3>Current terms · v${c.v}</h3><div class="r">effective ${D(c.from)}</div></div><div class="card-b"><dl class="kv">
          <dt>Monthly ROI</dt><dd>${P.fmtRate(c.rate)}</dd><dt>Calculation method</dt><dd>Simple interest on original principal</dd><dt>Compounding</dt><dd>None (fixed for this product)</dd><dt>Minimum investment</dt><dd>${M(c.min)}</dd><dt>Maximum investment</dt><dd>${M(c.max)}</dd><dt>Lock-in options</dt><dd>${c.lockins.join(', ')} months${c.custom ? ' + custom' : ''}</dd><dt>Maturity convention</dt><dd>Start + lock-in calendar months</dd><dt>Accrual schedule</dt><dd>Monthly on start-date anniversary</dd><dt>Payout schedule</dt><dd>Within 3 business days of accrual</dd><dt>Early redemption</dt><dd>${c.early}</dd><dt>Eligible to invest</dt><dd>${D(c.eligFrom)} – ${D(c.eligTo)}</dd><dt>Created by</dt><dd>${pl.createdBy} · ${D(pl.created)}</dd><dt>Last modified by</dt><dd>${c.by} · ${D(c.from)}</dd></dl></div></div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Version history</h3></div><div class="tbl"><table><thead><tr><th>Version</th><th>Rate</th><th>Effective</th><th>Reason</th><th class="n">Investments</th></tr></thead><tbody>${pl.versions.slice().reverse().map(v => `<tr><td class="m">v${v.v}</td><td>${v.rate.toFixed(2)}%</td><td>${D(v.from)}</td><td>${esc(v.reason)}<span class="sub">${esc(v.by)}</span></td><td class="n">${invs.filter(i => i.planVersion === v.v).length}</td></tr>`).join('')}</tbody></table></div></div>
          <div class="card"><div class="card-h"><h3>Terms & risk disclosure</h3></div><div class="card-b" style="display:grid;gap:10px;font-size:13px;color:var(--fg-2)"><p>${esc(pl.terms)}</p><p><b style="color:var(--fg)">Risk disclosure.</b> ${esc(pl.risk)}</p></div></div>
        </div>
      </div>
      <div class="card"><div class="card-h"><h3>Investments on this plan</h3></div><div class="tbl"><table><thead><tr><th>Investment</th><th>Investor</th><th>Version</th><th>Contract rate</th><th class="n">Principal</th><th>Start</th><th>Status</th></tr></thead><tbody>
        ${invs.map(i => `<tr class="click" data-go="investments/${i.code}"><td class="m">${i.code}</td><td>${esc(i.investor)}</td><td class="m">v${i.planVersion}</td><td>${P.fmtRate(i.rate)}</td><td class="n">${M(i.principal)}</td><td>${D(i.start)}</td><td>${U.invBadge(i)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No investments yet</td></tr>'}</tbody></table></div></div>`;
  }
  function planForm(c, isNew) {
    return `<div class="form">${isNew ? `<div class="f-row"><div class="field"><label for="pf-name">Plan name</label><input class="input" id="pf-name" placeholder="e.g. Plan D"></div><div class="field"><label for="pf-id">Plan ID</label><input class="input" id="pf-id" placeholder="PLN-D"></div></div><div class="field"><label for="pf-desc">Description</label><input class="input" id="pf-desc"></div>` :
      `<div class="note"><b>Existing investments keep their terms.</b> Investments already on this plan stay at their contractual rate and lock-in. This version applies only to investments approved after it takes effect.</div>`}
      <div class="f-row"><div class="field"><label for="pf-rate">Monthly ROI (% per month)</label><input class="input" id="pf-rate" inputmode="decimal" value="${c ? c.rate.toFixed(2) : ''}" placeholder="e.g. 5.00"><span class="hint" id="pf-rate-h">${c ? 'Currently ' + c.rate.toFixed(2) + '%. Up to 4 decimals.' : 'Up to 4 decimals.'}</span></div>
      <div class="field"><label for="pf-from">Effective from</label><input class="input" id="pf-from" type="date" value="${P.addDays(P.TODAY, 1)}"></div></div>
      <div class="f-row"><div class="field"><label for="pf-min">Minimum investment (₹)</label><input class="input" id="pf-min" value="${c ? c.min : ''}"></div><div class="field"><label for="pf-max">Maximum investment (₹)</label><input class="input" id="pf-max" value="${c ? c.max : ''}"></div></div>
      <div class="field"><label>Lock-in options</label><div class="chips" id="pf-lock">${[6, 12].map(m => `<button type="button" class="chip ${!c || c.lockins.includes(m) ? 'on' : ''}" data-act="chip-toggle" data-m="${m}">${m} months</button>`).join('')}<button type="button" class="chip ${c && c.custom ? 'on' : ''}" data-act="chip-toggle" data-m="custom">Custom</button></div></div>
      <div class="f-row"><div class="field"><label for="pf-ef">Eligible from</label><input class="input" id="pf-ef" type="date" value="${c ? c.eligFrom : P.TODAY}"></div><div class="field"><label for="pf-et">Eligible to</label><input class="input" id="pf-et" type="date" value="${c ? c.eligTo : '2027-03-31'}"></div></div>
      <div class="field"><label for="pf-early">Early redemption</label><select class="input" id="pf-early"><option>Not permitted</option><option>Permitted with 2% fee, pro-rata final month</option><option>At admin discretion</option></select></div>
      <div class="field"><label for="pf-calc">Calculation method</label><input class="input" id="pf-calc" value="Simple interest on original principal (fixed)" readonly></div>
      <div class="field"><label for="pf-reason">Reason for change (required, saved to audit log)</label><input class="input" id="pf-reason" placeholder="e.g. Approved by investment committee, minute IC-2026-14"></div>
      <div class="field"><label for="pf-ex">Preview</label><div class="note info" id="pf-prev">₹1,00,000 at this rate earns <b id="pf-prev-v">—</b> per full month.</div></div>
      ${isNew ? '' : `<label class="check"><input type="checkbox" id="pf-ann" checked> Draft an announcement to investors on this plan</label>`}</div>`;
  }
  function bindPlanForm() { const r = document.getElementById('pf-rate'); const upd = () => { const v = parseFloat(r.value); document.getElementById('pf-prev-v').textContent = v > 0 ? M(P.monthlyReturnPaise(10000000, v) / 100) : '—'; }; r.addEventListener('input', upd); upd(); }
  U.actions['chip-toggle'] = t => t.classList.toggle('on');
  U.actions['edit-plan'] = t => { const pl = P.planBy(t.dataset.id); U.drawer('Edit ' + pl.name, 'Saving creates version v' + (pl.cur.v + 1) + '.', planForm(pl.cur, false), `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="save-plan" data-id="${pl.id}">Save version v${pl.cur.v + 1}</button>`); bindPlanForm(); };
  U.actions['new-plan'] = () => { U.drawer('New investment plan', 'Saved as a draft until you activate it.', planForm(null, true), `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="save-plan">Create plan</button>`); bindPlanForm(); };
  U.actions['save-plan'] = t => {
    const g = id => document.getElementById(id); const rate = parseFloat(g('pf-rate').value), min = +g('pf-min').value, max = +g('pf-max').value, reason = g('pf-reason').value.trim();
    const errs = []; document.querySelectorAll('.drawer .bad').forEach(x => x.classList.remove('bad'));
    if (!(rate > 0 && rate <= 20)) { errs.push('pf-rate'); } if (!(min > 0)) errs.push('pf-min'); if (!(max > min)) errs.push('pf-max'); if (!reason) errs.push('pf-reason');
    if (!t.dataset.id && !g('pf-name').value.trim()) errs.push('pf-name');
    if (errs.length) { errs.forEach(e => g(e).classList.add('bad')); U.toast('Check the highlighted fields', 'Rate must be between 0 and 20%, maximum above minimum, and a reason is required.', 'err'); return; }
    const lockins = [...document.querySelectorAll('#pf-lock .chip.on')].map(x => x.dataset.m).filter(x => x !== 'custom').map(Number);
    const ver = { rate, min, max, lockins: lockins.length ? lockins : [6, 12], custom: !!document.querySelector('#pf-lock [data-m=custom].on'), from: g('pf-from').value, eligFrom: g('pf-ef').value, eligTo: g('pf-et').value, early: g('pf-early').value, reason, by: ME.name };
    if (t.dataset.id) {
      const pl = P.planBy(t.dataset.id); ver.v = pl.cur.v + 1;
      const o = P.state.planOverrides[pl.id] = P.state.planOverrides[pl.id] || {}; o.versions = (o.versions || []).concat([ver]);
      P.log(ME.name, 'plan.version.create', pl.id + ' v' + ver.v, reason, 'monthly_rate: ' + pl.cur.rate.toFixed(2) + '% → ' + rate.toFixed(2) + '%');
      const wantAnn = g('pf-ann') && g('pf-ann').checked;
      P.save(); U.closeOverlay(); U.toast(pl.name + ' v' + ver.v + ' saved', 'Existing investments keep their contractual terms.');
      route();
      if (wantAnn) setTimeout(() => openComposer({ aud: 'plan', plan: pl.id, title: pl.name + ' rate update for new investments', body: `From ${D(ver.from)}, new investments in ${pl.name} earn ${rate.toFixed(2)}% per month. Your existing investments on ${pl.name} keep the rate in your agreement.`, cat: 'Plan update' }), 350);
    } else {
      const name = g('pf-name').value.trim(); let pid = (g('pf-id').value.trim() || ('PLN-' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))).toUpperCase();
      if (P.planBy(pid)) { g('pf-id').classList.add('bad'); U.toast('Plan ID already used', 'Choose a different plan ID.', 'err'); return; }
      ver.v = 1; ver.reason = reason || 'Initial plan';
      P.addPlan({ id: pid, name, desc: g('pf-desc').value.trim() || 'New investment plan.', createdBy: ME.name, by: ME.name, versions: [ver] });
      P.log(ME.name, 'plan.create', pid + ' v1', reason, 'status: — → draft · monthly_rate: ' + rate.toFixed(2) + '%'); P.save();
      U.closeOverlay(); U.toast(name + ' created as draft', 'Activate it to open the plan for new investments.'); U.nav('plans/' + pid);
    }
  };
  U.actions['plan-status'] = t => { const pl = P.planBy(t.dataset.id); const s = t.dataset.s;
    U.modal({ active: 'Activate ', inactive: 'Deactivate ', archived: 'Archive ' }[s] + pl.name + '?', s === 'active' ? 'Investors can be enrolled on this plan again.' : 'No new investments can be recorded on this plan. Existing investments are not affected.',
      `<div class="field"><label for="ps-r">Reason</label><input class="input" id="ps-r" value="${s === 'archived' ? 'Plan withdrawn' : 'Operational update'}"></div>`,
      `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-plan-status" data-id="${pl.id}" data-s="${s}">Confirm</button>`); };
  U.actions['do-plan-status'] = t => { const pl = P.planBy(t.dataset.id); const o = P.state.planOverrides[pl.id] = P.state.planOverrides[pl.id] || {};
    P.log(ME.name, 'plan.status', pl.id, document.getElementById('ps-r').value, 'status: ' + pl.status + ' → ' + t.dataset.s); o.status = t.dataset.s; P.save(); U.closeOverlay(); U.toast(pl.name + ' is now ' + t.dataset.s); route(); };

  /* =============== INVESTMENTS =============== */
  function investments(p) {
    if (p[0]) return investmentDetail(p[0]);
    const rows = P.investments();
    return `${crumb('Investments')}<div class="ph"><div><h1>Investment register</h1><p>${rows.length} investments · ${M(rows.filter(i => !['redeemed', 'pending_funding', 'cancelled'].includes(i.status)).reduce((s, i) => s + i.principal, 0))} live principal</p></div><div class="acts"><button class="btn" data-act="csv" data-csv="investments">${U.icon('download')}Export CSV</button><button class="btn accent" data-act="new-investment">${U.icon('plus')}Record investment</button></div></div>
      ${U.table('inv-reg', [
        { h: 'Investment', v: r => r.code, r: r => `<b class="mono">${r.code}</b><span class="sub">${r.agreement}</span>` },
        { h: 'Investor', v: r => r.investor, r: r => `${esc(r.investor)}<span class="sub">${r.investorId}</span>` },
        { h: 'Plan', v: r => r.planName, r: r => `${r.planName} <span class="muted mono">v${r.planVersion}</span><span class="sub">${P.fmtRate(r.rate)}</span>` },
        { h: 'Principal', n: 1, v: r => r.principal, r: r => M(r.principal) },
        { h: 'Lock-in', v: r => r.lockin, r: r => r.lockin + ' months' },
        { h: 'Start', v: r => r.start || '9999', r: r => r.start ? D(r.start) : '<span class="muted">Not funded</span>' },
        { h: 'Maturity', v: r => r.maturity || '9999', r: r => r.maturity ? D(r.maturity) + `<span class="sub">${r.daysLeft} days</span>` : '—' },
        { h: 'Accrued', n: 1, v: r => r.accrued, r: r => M(r.accrued) },
        { h: 'Paid', n: 1, v: r => r.paid, r: r => `<span class="pos">${M(r.paid)}</span>` },
        { h: 'Outstanding', n: 1, v: r => r.outstanding, r: r => M(r.outstanding) },
        { h: 'Status', v: r => r.label, r: r => U.invBadge(r) }
      ], rows, { searchPh: 'Search ID, investor, plan', filters: [['All', 'all'], ['Locked', 'Locked'], ['Maturity approaching', 'Maturity approaching'], ['Matured / eligible', 'mat'], ['In redemption', 'red'], ['Pending funding', 'Pending funding'], ['Redeemed', 'Redeemed']],
        filterFn: (r, f) => f === 'all' || r.label === f || (f === 'mat' && ['Matured', 'Eligible for redemption'].includes(r.label)) || (f === 'red' && r.label.startsWith('Redemption')), go: r => 'investments/' + r.code, per: 12 })}`;
  }
  function investmentDetail(code) {
    const i = P.investments().find(x => x.code === code); if (!i) return notFound();
    const pv = P.planBy(i.planId).versions.find(v => v.v === i.planVersion);
    const tl = [];
    tl.push(['', 'Investment recorded', 'Agreement ' + i.agreement + ' · by Priya Sharma', i.start ? P.addDays(i.start, -3) : i.created]);
    if (i.start) { tl.push(['g', 'Deposit confirmed', M(i.principal) + ' · bank reference verified', i.start]); tl.push(['b', 'Investment activated', 'Terms snapshot ' + i.planName + ' v' + i.planVersion + ' · approved by ' + CHECKER, i.start]); }
    i.accruals.forEach(a => { tl.push(['', 'Accrual #' + a.k + ' posted', M(a.amount) + ' · scheduled job', a.end]); if (a.pay.status === 'paid') tl.push(['g', 'Payout #' + a.k + ' confirmed', (a.pay.ref || '') + ' · by ' + (a.pay.by || CHECKER), a.pay.at]); else if (a.pay.status === 'processing') tl.push(['a', 'Payout #' + a.k + ' sent for processing', a.pay.ref || '', a.pay.at]); });
    P.state.redemptions.filter(r => r.inv === code).forEach(r => r.history.forEach(h => tl.push([h[0] === 'completed' ? 'g' : h[0] === 'rejected' ? 'r' : 'a', 'Redemption ' + P.REDEMPTION[h[0]][0].toLowerCase(), r.id + ' · ' + h[2], h[1]])));
    tl.sort((a, b) => (b[3] || '').localeCompare(a[3] || ''));
    const nextK = i.accruals.length + 1;
    return `${crumb('Investments', code)}<a class="back" href="#/investments">${U.icon('back')} Investment register</a>
      <div class="ph"><div><h1>${code} · <a href="#/investors/${i.investorId}">${esc(i.investor)}</a> ${U.invBadge(i)}</h1><p>${i.planName} v${i.planVersion} · ${i.lockin}-month lock-in · ${i.start ? 'started ' + D(i.start) + ' · matures ' + D(i.maturity) + ' (' + i.daysLeft + ' days)' : 'awaiting deposit confirmation'}</p></div>
      <div class="acts">${i.status === 'pending_funding' ? `<button class="btn danger" data-act="cancel-inv" data-code="${code}">Cancel</button><button class="btn primary" data-act="fund" data-code="${code}">Confirm deposit & activate</button>` : `<button class="btn" data-act="inv-stmt" data-code="${code}">${U.icon('download')}Statement</button><button class="btn" data-act="adjust" data-code="${code}">Record adjustment</button><button class="btn" data-act="amend" data-code="${code}">Record amendment</button>`}</div></div>
      <div class="kpis">${U.kpi('Principal', M(i.principal), 'Original, never changes')}${U.kpi('Monthly return', i.monthly ? M(i.monthly) : '—', P.fmtRate(i.rate) + ' × principal')}${U.kpi('Accrued to date', M(i.accrued), i.accruals.length + ' of ' + i.lockin + ' periods')}${U.kpi('Paid (confirmed)', M(i.paid), i.accruals.filter(a => a.pay.status === 'paid').length + ' payouts', { cls: 'pos' })}${U.kpi('Outstanding', M(i.outstanding), i.processing ? M(i.processing) + ' processing' : 'Not yet paid', { subCls: i.outstanding ? 'warn' : '' })}</div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h3>Monthly accruals and payouts</h3><div class="r">Period = start-date anniversary</div></div><div class="tbl"><table><thead><tr><th>#</th><th>Period</th><th class="n">Amount</th><th>Accrued on</th><th>Payout</th><th>Reference</th></tr></thead><tbody>
          ${i.accruals.slice().reverse().map(a => `<tr><td class="m">${a.k}</td><td>${P.fmtDateShort(a.from)} – ${P.fmtDateShort(a.to)}</td><td class="n">${M(a.amount)}</td><td>${D(a.end)}</td><td>${U.payBadge(a.pay.status)}</td><td class="m">${a.pay.ref || '—'}</td></tr>`).join('')}
          ${i.status === 'active' ? `<tr><td class="m">${nextK}</td><td>${P.fmtDateShort(P.addMonths(i.start, nextK - 1))} – ${P.fmtDateShort(P.addDays(i.nextAccrual, -1))}</td><td class="n muted">${M(i.monthly)}</td><td colspan="3">${U.badge('Projected (estimate)', 'b-amber')} <span class="muted">accrues ${D(i.nextAccrual)}</span></td></tr>` : ''}
          ${!i.accruals.length && i.status !== 'active' ? '<tr><td colspan="6"><div class="empty"><b>No accruals yet</b>Returns start accruing one month after the deposit is confirmed.</div></td></tr>' : ''}
        </tbody></table></div></div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Contractual terms snapshot</h3><div class="r mono">${i.planName} v${i.planVersion}</div></div><div class="card-b"><dl class="kv"><dt>Monthly ROI</dt><dd>${P.fmtRate(i.rate)}</dd><dt>Method</dt><dd>Simple interest</dd><dt>Start date</dt><dd>${D(i.start)}</dd><dt>Lock-in</dt><dd>${i.lockin} months</dd><dt>Lock-in end</dt><dd>${D(i.lockinEnd)}</dd><dt>Maturity</dt><dd>${D(i.maturity)}</dd><dt>Redemption eligible</dt><dd>${D(i.eligible)}</dd><dt>Request window opens</dt><dd>${D(i.requestFrom)}</dd><dt>Early redemption</dt><dd>${pv.early}</dd><dt>Fees</dt><dd>None</dd><dt>Agreement</dt><dd class="mono">${i.agreement}</dd></dl>
          ${pv.v < P.planBy(i.planId).cur.v ? `<div class="note lock" style="margin-top:12px">Plan is now on v${P.planBy(i.planId).cur.v} (${P.planBy(i.planId).cur.rate.toFixed(2)}%). This investment keeps v${pv.v} terms.</div>` : ''}</div></div>
          <div class="card"><div class="card-h"><h3>Timeline</h3></div><div class="card-b timeline" style="max-height:420px;overflow:auto">${tl.map(t => `<div><span class="d ${t[0]}"></span><div><b>${esc(t[1])}</b><span>${esc(t[2])}</span></div><time>${P.fmtDateShort(t[3])}</time></div>`).join('')}</div></div>
        </div>
      </div>`;
  }
  U.actions['new-investment'] = t => {
    const pre = t.dataset.investor || '';
    const plans = P.plans().filter(p => p.status === 'active');
    U.drawer('Record investment', 'Step 1 of 2: record. Activation happens when the deposit is confirmed.',
      `<div class="form"><div class="field"><label for="ni-inv">Investor</label><select class="input" id="ni-inv">${P.investors.filter(v => v.kyc === 'verified' && v.status === 'active').map(v => `<option value="${v.id}" ${v.id === pre ? 'selected' : ''}>${esc(v.name)} · ${v.id}</option>`).join('')}</select><span class="hint">Only verified, active investors are listed.</span></div>
      <div class="f-row"><div class="field"><label for="ni-plan">Plan</label><select class="input" id="ni-plan">${plans.map(p => `<option value="${p.id}">${p.name} · ${p.cur.rate.toFixed(2)}% (v${p.cur.v})</option>`).join('')}</select></div><div class="field"><label for="ni-lock">Lock-in</label><select class="input" id="ni-lock"></select></div></div>
      <div class="f-row"><div class="field"><label for="ni-amt">Principal (₹)</label><input class="input" id="ni-amt" inputmode="numeric" value="500000"><span class="hint" id="ni-amt-h"></span></div><div class="field"><label for="ni-start">Expected start date</label><input class="input" id="ni-start" type="date" value="${P.TODAY}"><span class="hint">Final start date = deposit confirmation date.</span></div></div>
      <div class="f-row"><div class="field"><label for="ni-ref">Deposit reference</label><input class="input" id="ni-ref" placeholder="UTR / cheque no."></div><div class="field"><label for="ni-agr">Agreement</label><input class="input" id="ni-agr" type="file"></div></div>
      <div class="card" style="box-shadow:none"><div class="card-h"><h3>Calculated terms</h3><div class="r">server-calculated in the product</div></div><div class="card-b"><dl class="kv" id="ni-calc"></dl></div></div></div>`,
      `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="save-investment">Record investment</button>`);
    const g = id => document.getElementById(id);
    const upd = () => { const pl = P.planBy(g('ni-plan').value); const ls = g('ni-lock'); const cur = ls.value; ls.innerHTML = pl.cur.lockins.map(m => `<option value="${m}" ${String(m) === cur ? 'selected' : ''}>${m} months</option>`).join('');
      const amt = +g('ni-amt').value || 0, lock = +ls.value, st = g('ni-start').value || P.TODAY; const ok = amt >= pl.cur.min && amt <= pl.cur.max;
      g('ni-amt').classList.toggle('bad', !ok); g('ni-amt-h').className = 'hint' + (ok ? '' : ' err'); g('ni-amt-h').textContent = ok ? 'Within plan range.' : `${pl.name} accepts ${M(pl.cur.min)} to ${M(pl.cur.max)}.`;
      const mr = P.monthlyReturnPaise(amt * 100, pl.cur.rate) / 100; const mat = P.addMonths(st, lock);
      g('ni-calc').innerHTML = `<dt>Contract rate</dt><dd>${P.fmtRate(pl.cur.rate)}</dd><dt>Monthly return</dt><dd>${M(mr)}</dd><dt>Lock-in end / maturity</dt><dd>${D(mat)}</dd><dt>Total over lock-in (estimate)</dt><dd>${M(mr * lock)}</dd><dt>First accrual</dt><dd>${D(P.addMonths(st, 1))}</dd>`; };
    ['ni-plan', 'ni-lock', 'ni-amt', 'ni-start'].forEach(id => g(id).addEventListener('input', upd)); upd();
  };
  U.actions['save-investment'] = () => { const g = id => document.getElementById(id); if (g('ni-amt').classList.contains('bad')) { U.toast('Principal is outside the plan range', '', 'err'); return; }
    const pl = P.planBy(g('ni-plan').value); const n = 1220 + P.state.investmentsAdded.length * 7; const code = 'INV-' + n;
    const ii = P.investors.findIndex(v => v.id === g('ni-inv').value);
    P.state.investmentsAdded.push([code, ii, pl.id, pl.cur.v, +g('ni-amt').value, +g('ni-lock').value, null]);
    P.log(ME.name, 'investment.create', code, 'Recorded with deposit ref ' + (g('ni-ref').value || '—'), 'status: — → pending_funding'); P.save(); U.closeOverlay();
    U.toast(code + ' recorded', 'Pending funding. Confirm the deposit to activate it.'); U.nav('investments/' + code); };
  U.actions.fund = t => U.modal('Confirm deposit for ' + t.dataset.code + '?', 'Only confirm once the funds show in the company bank account. The start date will be today and the contract terms are frozen.',
    `<div class="field"><label for="fd-ref">Bank reference (UTR)</label><input class="input" id="fd-ref" value="UTR 58${Math.floor(Math.random() * 1e8)}"></div><div class="note info">Approver: ${CHECKER}. The person who recorded the investment cannot activate it.</div>`,
    `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-fund" data-code="${t.dataset.code}">Confirm & activate</button>`);
  U.actions['do-fund'] = t => { P.state.funded[t.dataset.code] = P.TODAY; P.log(CHECKER, 'investment.activate', t.dataset.code, 'Deposit confirmed ' + document.getElementById('fd-ref').value, 'status: pending_funding → active'); P.save(); U.closeOverlay(); U.toast(t.dataset.code + ' is active', 'Terms snapshot saved. The investor can now see it.'); route(); };
  U.actions['cancel-inv'] = t => U.modal('Cancel ' + t.dataset.code + '?', 'The investment was never funded, so no money moves. It stays on record as cancelled.',
    `<div class="field"><label for="cx-r">Reason (required, saved to audit log)</label><input class="input" id="cx-r" placeholder="e.g. Investor withdrew before funding"></div>`,
    `<button class="btn ghost" data-act="close">Keep investment</button><button class="btn danger" data-act="do-cancel" data-code="${t.dataset.code}">Cancel investment</button>`);
  U.actions['do-cancel'] = t => { const r = document.getElementById('cx-r'); if (!r.value.trim()) { r.classList.add('bad'); U.toast('Enter a reason', 'A reason is required to cancel.', 'err'); return; }
    P.state.cancelled = P.state.cancelled || {}; P.state.cancelled[t.dataset.code] = P.TODAY; P.log(ME.name, 'investment.cancel', t.dataset.code, r.value.trim(), 'status: pending_funding → cancelled'); P.save(); U.closeOverlay(); U.toast(t.dataset.code + ' cancelled', 'Recorded in the audit log.'); route(); };
  U.actions.adjust = t => U.modal('Record adjustment · ' + t.dataset.code, 'Adjustments post a new ledger entry. Balances cannot be edited directly.',
    `<div class="field"><label for="ad-t">Type</label><select class="input" id="ad-t"><option>Accrual reversal</option><option>Correcting accrual</option><option>Fee</option></select></div><div class="field"><label for="ad-a">Amount (₹)</label><input class="input" id="ad-a" placeholder="0.00"></div><div class="field"><label for="ad-r">Reason (required)</label><input class="input" id="ad-r"></div><div class="note">Requires approval by a second admin before it posts.</div>`,
    `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-adjust" data-code="${t.dataset.code}">Submit for approval</button>`);
  U.actions['do-adjust'] = t => { const r = document.getElementById('ad-r'), a = document.getElementById('ad-a'); if (!r.value.trim() || !(+a.value > 0)) { [r, a].forEach(x => x.classList.toggle('bad', !x.value.trim())); U.toast('Amount and reason are required', '', 'err'); return; }
    P.log(ME.name, 'adjustment.request', t.dataset.code, r.value, document.getElementById('ad-t').value + ' ' + M(+a.value) + ' · awaiting approval'); P.save(); U.closeOverlay(); U.toast('Adjustment submitted for approval', 'Nothing posts to the ledger until ' + CHECKER + ' approves.'); };
  U.actions.amend = t => U.modal('Record contract amendment', 'Use only for a signed, legally effective change to this investor\'s terms. Informational announcements don\'t change contracts.',
    `<div class="field"><label for="am-f">Field</label><select class="input" id="am-f"><option>Monthly ROI</option><option>Lock-in end date</option><option>Early redemption policy</option></select></div><div class="field"><label for="am-v">New value</label><input class="input" id="am-v"></div><div class="field"><label for="am-d">Signed amendment</label><input class="input" id="am-d" type="file"></div>`,
    `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="close-toast" data-msg="Amendment submitted for second approval">Submit for approval</button>`);
  U.actions['close-toast'] = t => { U.closeOverlay(); U.toast(t.dataset.msg, t.dataset.sub || ''); };

  /* =============== ACCRUALS =============== */
  function accruals() {
    const all = payouts(); const months = U.lastMonths(6);
    const thisM = all.filter(a => a.end.slice(0, 7) === P.TODAY.slice(0, 7));
    return `${crumb('Monthly ROI & Accruals')}<div class="ph"><div><h1>Monthly ROI & Accruals</h1><p>The accrual job runs daily at 00:30 IST and posts each investment's monthly return on its anniversary date.</p></div><div class="acts"><button class="btn" data-act="csv" data-csv="accruals">${U.icon('download')}Export</button><button class="btn primary" data-act="run-job">Run today's accrual job</button></div></div>
      <div class="kpis k4">${U.kpi('Accrued this month', M(thisM.reduce((s, a) => s + a.amount, 0)), thisM.length + ' accrual entries')}${U.kpi('Accrued to date', S(all.reduce((s, a) => s + a.amount, 0)), all.length + ' entries')}${U.kpi('Reversals', M(6000), '1 correcting entry', { cls: 'neg' })}${U.kpi('Last job run', D(P.TODAY), '00:30 IST · 0 exceptions', { subCls: 'up' })}</div>
      <div class="note info"><b>Formula.</b> Monthly return = original principal × monthly ROI ÷ 100, rounded half-up to 2 decimals per entry. Each investment can have only one accrual per period, so re-running the job never creates duplicates.</div>
      ${U.table('acc', [
        { h: 'Accrual', m: 1, v: r => r.id }, { h: 'Investment', v: r => r.inv.code, r: r => `<a href="#/investments/${r.inv.code}" class="mono">${r.inv.code}</a><span class="sub">${esc(r.inv.investor)}</span>` },
        { h: 'Period', v: r => r.k, r: r => `#${r.k} · ${P.fmtDateShort(r.from)} – ${P.fmtDateShort(r.to)}` },
        { h: 'Principal', n: 1, v: r => r.inv.principal, r: r => M(r.inv.principal) }, { h: 'Rate', v: r => r.inv.rate, r: r => r.inv.rate.toFixed(2) + '%' },
        { h: 'Accrued on', v: r => r.end, r: r => D(r.end) }, { h: 'Amount', n: 1, v: r => r.amount, r: r => M(r.amount) }, { h: 'Payout', v: r => r.status, r: r => U.payBadge(r.status) }
      ], all, { searchPh: 'Search accrual, investment, investor', sort: 5, filters: [['All', 'all']].concat(months.slice().reverse().slice(0, 4).map(m => [U.monthLabel(m) + ' ' + m.slice(0, 4), m])), filterFn: (r, f) => f === 'all' || r.end.slice(0, 7) === f, text: r => r.inv.investor, per: 12 })}`;
  }
  U.actions['run-job'] = t => { t.disabled = true; t.textContent = 'Running…'; setTimeout(() => { P.log('System', 'job.accrual.run', 'accrual_daily ' + P.TODAY, 'Manual run by ' + ME.name, '0 new · ' + payouts().length + ' already posted · 0 duplicates'); P.save(); U.toast('Accrual job complete', '0 new accruals. All periods due today were already posted, so no duplicates were created.'); route(); }, 900); };

  /* =============== PAYOUTS =============== */
  let payTab = 'approved';
  function payoutsPage() {
    const all = payouts(); const by = s => all.filter(p => p.status === s);
    const tabs = [['accrued', 'Accrued'], ['approved', 'Approved'], ['processing', 'Processing'], ['paid', 'Paid']];
    const rows = by(payTab).sort((a, b) => b.end.localeCompare(a.end));
    const act = { accrued: ['Approve selected', 'approve'], approved: ['Send selected to bank', 'send'], processing: ['Confirm selected as paid', 'confirm'] }[payTab];
    return `${crumb('Payouts')}<div class="ph"><div><h1>Payouts</h1><p>Payments are made by bank transfer outside the platform and confirmed here with a reference. Nothing shows as paid until confirmed.</p></div></div>
      <div class="kpis k4">${tabs.map(([k, l]) => U.kpi(l, M(by(k).reduce((s, p) => s + p.amount, 0)), by(k).length + ' payouts', { cls: k === 'paid' ? 'pos' : '' })).join('')}</div>
      <div class="flow-steps note info">Workflow: <b>Accrued</b> (job) → <b>Approved</b> (admin) → <b>Processing</b> (sent to bank) → <b>Paid</b> (second admin confirms with bank reference). Failed payments return to Approved for retry.</div>
      <div class="card"><div class="tabs" style="padding:0 12px">${tabs.map(([k, l]) => `<button class="tab ${k === payTab ? 'on' : ''}" data-act="pay-tab" data-t="${k}">${l}<span class="c">${by(k).length}</span></button>`).join('')}</div>
        <div class="toolbar"><label class="check"><input type="checkbox" id="pay-all" ${act ? 'checked' : 'disabled'}> Select all</label><span class="muted" id="pay-sel"></span><div style="margin-left:auto;display:flex;gap:8px">${act ? `${payTab === 'processing' ? '<button class="btn danger" data-act="pay-fail">Mark failed</button>' : ''}<button class="btn primary" data-act="pay-bulk" data-op="${act[1]}">${act[0]}</button>` : ''}</div></div>
        <div class="tbl">${rows.length ? `<table><thead><tr><th></th><th>Payout</th><th>Investor</th><th>Investment</th><th>Period</th><th>Due</th><th class="n">Amount</th><th>Bank</th><th>Reference</th><th>Status</th></tr></thead><tbody>
          ${rows.slice(0, 40).map(p => `<tr><td><input type="checkbox" class="pay-cb" value="${p.id}" ${act ? 'checked' : 'disabled'} aria-label="Select ${p.id}"></td><td class="m">PAY-${p.id.slice(4)}</td><td>${esc(p.inv.investor)}</td><td><a class="mono" href="#/investments/${p.inv.code}">${p.inv.code}</a></td><td>#${p.k}</td><td>${D(P.addDays(p.end, 3))}</td><td class="n">${M(p.amount)}</td><td class="m">${P.invBy(p.inv.investorId).bank}</td><td class="m">${p.pay.ref || '—'}</td><td>${U.payBadge(p.status)}</td></tr>`).join('')}
        </tbody></table>${rows.length > 40 ? `<div class="pager">Showing 40 of ${rows.length}</div>` : ''}` : `<div style="padding:18px"><div class="empty"><b>No ${payTab} payouts</b>${payTab === 'accrued' ? 'New accruals appear here after the daily job runs.' : 'Move payouts forward from the previous tab.'}</div></div>`}</div></div>`;
  }
  U.actions['pay-tab'] = t => { payTab = t.dataset.t; route(); };
  document.addEventListener('change', e => { if (e.target.id === 'pay-all') document.querySelectorAll('.pay-cb').forEach(c => c.checked = e.target.checked); });
  const selected = () => [...document.querySelectorAll('.pay-cb:checked')].map(c => c.value);
  U.actions['pay-bulk'] = t => {
    const ids = selected(); if (!ids.length) { U.toast('Select at least one payout', '', 'warn'); return; }
    const all = payouts(); const sum = all.filter(p => ids.includes(p.id)).reduce((s, p) => s + p.amount, 0); const op = t.dataset.op;
    if (op === 'confirm') {
      U.modal(`Confirm ${ids.length} payouts as paid?`, 'Only confirm after the bank shows these transfers as completed.',
        `<dl class="kv"><dt>Total</dt><dd>${M(sum)}</dd><dt>Batch</dt><dd class="mono">BATCH-2026-10-A</dd><dt>Prepared by</dt><dd>Priya Sharma</dd><dt>Confirming as</dt><dd>${CHECKER} (approver)</dd></dl>
        <div class="field"><label for="pc-ref">Bank batch / UTR reference</label><input class="input" id="pc-ref" value="NEFT-B-${P.TODAY.replace(/-/g, '')}-${String(ids.length).padStart(4, '0')}"></div><div class="field"><label for="pc-doc">Bank confirmation</label><input class="input" id="pc-doc" type="file"></div>`,
        `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-pay" data-op="paid" data-ids="${ids.join(',')}">Confirm paid</button>`);
    } else {
      U.modal(op === 'approve' ? `Approve ${ids.length} payouts?` : `Send ${ids.length} payouts to the bank?`, op === 'approve' ? 'Approved payouts are queued for the next bank batch.' : 'This creates batch BATCH-2026-10-B for manual bank upload. Investors see these payouts as "Processing".',
        `<dl class="kv"><dt>Payouts</dt><dd>${ids.length}</dd><dt>Total</dt><dd>${M(sum)}</dd></dl>`,
        `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="do-pay" data-op="${op === 'approve' ? 'approved' : 'processing'}" data-ids="${ids.join(',')}">${op === 'approve' ? 'Approve' : 'Send to bank'}</button>`);
    }
  };
  U.actions['do-pay'] = t => { const ids = t.dataset.ids.split(','); const op = t.dataset.op; const ref = op === 'paid' ? document.getElementById('pc-ref').value : op === 'processing' ? 'BATCH-2026-10-B' : undefined;
    const all = payouts(); let n = 0, sum = 0;
    ids.forEach(id => { const p = all.find(x => x.id === id); if (!p) return; P.state.payoutStatus[id] = { status: op, ref: ref || p.pay.ref, at: P.TODAY, by: op === 'paid' ? CHECKER : ME.name }; n++; sum += p.amount;
      if (op === 'paid' || op === 'processing') P.state.extraNotifs.push({ id: 'N-X-' + op + '-' + id, investorId: p.inv.investorId, kind: 'payout', title: op === 'paid' ? `Return paid: ${M(p.amount)} for ${p.inv.code}` : `Payout for ${p.inv.code} is being processed`, body: 'Period ' + p.k + ' · ' + (ref || ''), at: P.TODAY, link: 'investments/' + p.inv.code }); });
    P.log(op === 'paid' ? CHECKER : ME.name, 'payout.' + op, n + ' payouts', op === 'paid' ? 'Bank confirmation ' + ref : 'Batch action', 'status → ' + op + ' · ' + M(sum));
    P.save(); U.closeOverlay(); U.toast({ approved: 'Payouts approved', processing: 'Sent to bank', paid: 'Payouts confirmed as paid' }[op], n + ' payouts · ' + M(sum) + (op === 'paid' ? ' · investors notified' : '')); payTab = op; route(); };
  U.actions['pay-fail'] = () => { const ids = selected(); if (!ids.length) { U.toast('Select at least one payout', '', 'warn'); return; }
    ids.slice(0, 1).forEach(id => P.state.payoutStatus[id] = { status: 'approved', ref: 'Retry after failure', at: P.TODAY }); P.log(ME.name, 'payout.failed', ids[0], 'Bank returned transfer', 'processing → failed → approved (retry)'); P.save(); U.toast('Payout marked failed', 'Moved back to Approved for retry. Investor still sees it as unpaid.', 'warn'); route(); };

  /* =============== REDEMPTIONS =============== */
  function redemptions(p) {
    const rows = reds().sort((a, b) => b.requested.localeCompare(a.requested));
    if (p[0]) setTimeout(() => openRedemption(p[0]), 50);
    return `${crumb('Redemptions')}<div class="ph"><div><h1>Redemptions</h1><p>Each request is checked against the investment's contractual lock-in before it reaches review. Only one open request is allowed per investment.</p></div></div>
      <div class="kpis k4">${[['Awaiting review', ['requested', 'under_review']], ['Approved / processing', ['approved', 'processing']], ['Completed', ['completed']], ['Rejected', ['rejected']]].map(([l, s]) => U.kpi(l, rows.filter(r => s.includes(r.status)).length, S(rows.filter(r => s.includes(r.status)).reduce((x, r) => x + r.i.principal, 0)))).join('')}</div>
      ${U.table('red', [
        { h: 'Request', m: 1, v: r => r.id }, { h: 'Investor', v: r => r.i.investor, r: r => esc(r.i.investor) }, { h: 'Investment', v: r => r.inv, r: r => `<span class="mono">${r.inv}</span><span class="sub">${r.i.planName} · ${r.i.lockin} months</span>` },
        { h: 'Type', v: r => r.type, r: r => r.type === 'early' ? U.badge('Early', 'b-red') : U.badge('At maturity', 'b-grey') },
        { h: 'Principal', n: 1, v: r => r.i.principal, r: r => M(r.i.principal) }, { h: 'Maturity', v: r => r.i.maturity, r: r => D(r.i.maturity) },
        { h: 'Requested', v: r => r.requested, r: r => D(r.requested) }, { h: 'Status', v: r => r.status, r: r => U.redBadge(r.status) },
        { h: '', r: r => `<button class="btn sm" data-act="open-red" data-id="${r.id}">${['requested', 'under_review', 'approved', 'processing'].includes(r.status) ? 'Review' : 'View'}</button>` }
      ], rows, { searchPh: 'Search request, investor, investment', filters: [['All', 'all'], ['Open', 'open'], ['Completed', 'completed'], ['Rejected', 'rejected']], filterFn: (r, f) => f === 'all' || r.status === f || (f === 'open' && ['requested', 'under_review', 'approved', 'processing'].includes(r.status)), text: r => r.i.investor })}`;
  }
  U.actions['open-red'] = t => openRedemption(t.dataset.id);
  function openRedemption(id) {
    const r = reds().find(x => x.id === id); if (!r) return; const i = r.i;
    const unpaid = i.outstanding; const early = r.type === 'early';
    const elig = !early || i.early !== 'Not permitted';
    const next = { requested: ['under_review', 'Start review'], under_review: ['approved', 'Approve'], approved: ['processing', 'Send to bank'], processing: ['completed', 'Confirm settlement'] }[r.status];
    U.drawer(r.id + ' · ' + i.investor, i.code + ' · ' + i.planName + ' · ' + U.esc(P.REDEMPTION[r.status][0]),
      `<div style="display:grid;gap:16px"><dl class="kv"><dt>Principal</dt><dd>${M(i.principal)}</dd><dt>Maturity date</dt><dd>${D(i.maturity)}</dd><dt>Requested on</dt><dd>${D(r.requested)}</dd><dt>Payable on</dt><dd>${D(i.maturity > P.TODAY ? i.maturity : P.TODAY)}</dd><dt>Unpaid returns to settle</dt><dd>${M(unpaid)}</dd><dt>Early-redemption fee</dt><dd>${M(0)}</dd><dt>Settlement total</dt><dd><b>${M(i.principal + unpaid)}</b></dd><dt>Bank account</dt><dd class="mono">${P.invBy(i.investorId).bank}</dd></dl>
      ${elig ? `<div class="note ok"><b>Eligibility check passed.</b> ${early ? 'Early redemption permitted by contract.' : 'Request is within the 30-day pre-maturity window (opened ' + D(i.requestFrom) + ').'} No other open request on this investment.</div>` : `<div class="note" style="border-left-color:var(--red);background:var(--red-soft)"><b>Not eligible.</b> ${i.planName} v${i.planVersion} does not permit early redemption during lock-in. Lock-in ends ${D(i.lockinEnd)}.</div>`}
      ${r.note ? `<div class="field"><label>Investor note</label><div class="input" style="background:var(--surface-2)">${esc(r.note)}</div></div>` : ''}
      ${next ? `<div class="field"><label for="rd-r">Reason / note (required)</label><input class="input" id="rd-r" placeholder="${next[0] === 'approved' ? 'e.g. Bank details verified' : next[0] === 'completed' ? 'Bank reference (UTR)' : 'Note'}"></div>` : r.reason ? `<div class="note">${esc(r.reason)}</div>` : ''}
      <div><h4 style="font-size:13px;margin-bottom:10px">History</h4><div class="timeline">${r.history.slice().reverse().map(h => `<div><span class="d ${h[0] === 'completed' ? 'g' : h[0] === 'rejected' ? 'r' : 'a'}"></span><div><b>${P.REDEMPTION[h[0]][0]}</b><span>${esc(h[2])}</span></div><time>${D(h[1])}</time></div>`).join('')}</div></div></div>`,
      next ? `<button class="btn ghost" data-act="close">Close</button>${['requested', 'under_review'].includes(r.status) ? `<button class="btn danger" data-act="red-step" data-id="${id}" data-s="rejected">Reject</button>` : ''}<button class="btn primary" data-act="red-step" data-id="${id}" data-s="${next[0]}" ${!elig && next[0] === 'approved' ? 'disabled' : ''}>${next[1]}</button>` : `<button class="btn" data-act="close">Close</button>`);
  }
  U.actions['red-step'] = t => { const r = P.state.redemptions.find(x => x.id === t.dataset.id); const s = t.dataset.s; const note = document.getElementById('rd-r');
    if ((s === 'approved' || s === 'rejected' || s === 'completed') && !note.value.trim()) { note.classList.add('bad'); U.toast('Add a reason before you continue', 'Approvals, rejections and settlements are audited.', 'err'); return; }
    const who = s === 'approved' || s === 'completed' ? CHECKER : ME.name; const prev = r.status;
    r.status = s; r.history.push([s, P.TODAY, who]); if (s === 'rejected') r.reason = note.value; if (s === 'completed') { r.settled = P.TODAY; r.ref = note.value; }
    const inv = P.investments().find(x => x.code === r.inv);
    P.state.extraNotifs.push({ id: 'N-X-RD-' + r.id + '-' + s, investorId: inv.investorId, kind: 'redemption', title: 'Redemption ' + r.id + ': ' + P.REDEMPTION[s][0], body: note ? note.value : '', at: P.TODAY, link: 'redemptions' });
    P.log(who, 'redemption.' + s, r.id, note ? note.value : '', 'status: ' + prev + ' → ' + s); P.save(); U.closeOverlay(); U.toast('Redemption ' + P.REDEMPTION[s][0].toLowerCase(), r.id + ' · investor notified'); route(); };

  /* =============== TRANSACTIONS =============== */
  function transactions() {
    const rows = P.transactions();
    return `${crumb('Transactions')}<div class="ph"><div><h1>Transaction ledger</h1><p>Append-only. Corrections are separate reversing entries, never edits.</p></div><div class="acts"><button class="btn" data-act="csv" data-csv="transactions">${U.icon('download')}Export CSV</button></div></div>
      ${U.table('txn', [
        { h: 'Transaction', m: 1, v: r => r.id }, { h: 'Date', v: r => r.date, r: r => D(r.date) }, { h: 'Type', v: r => r.type },
        { h: 'Investment', v: r => r.inv, r: r => `<span class="mono">${r.inv}</span>` }, { h: 'Investor', v: r => r.investor, r: r => esc(r.investor) },
        { h: 'Amount', n: 1, v: r => r.amount, r: r => `<span class="${r.amount < 0 ? 'neg' : ''}">${M(r.amount)}</span>` }, { h: 'Status', v: r => r.status, r: r => U.txnBadge(r.status) },
        { h: 'Reference', v: r => r.ref, r: r => `<span class="mono muted">${esc(r.ref)}</span>` }, { h: 'Created by', v: r => r.by }
      ], rows, { searchPh: 'Search ID, investment, investor, reference', sort: 1, filters: [['All', 'all'], ['Deposits', 'Deposit'], ['Accruals', 'Return accrual'], ['Payouts', 'Return payout'], ['Redemptions', 'Redemption'], ['Adjustments', 'adj']],
        filterFn: (r, f) => f === 'all' || r.type === f || (f === 'Redemption' && r.type.includes('edemption')) || (f === 'adj' && ['Accrual reversal', 'Refund'].includes(r.type)), per: 15 })}`;
  }

  /* =============== ANNOUNCEMENTS =============== */
  function announcements() {
    const rows = P.state.announcements.slice().reverse();
    return `${crumb('Announcements')}<div class="ph"><div><h1>Announcements</h1><p>Published announcements appear in the targeted investors' dashboards and notification bell immediately.</p></div><div class="acts"><button class="btn accent" data-act="new-ann">${U.icon('plus')}New announcement</button></div></div>
      <div class="note info">Announcements are <b>informational</b>. They never change an investor's contract. Contract changes go through Investments → Record amendment.</div>
      <div class="card"><div class="tbl"><table><thead><tr><th>Announcement</th><th>Category</th><th>Audience</th><th>Published</th><th>Status</th><th class="n">Read by</th><th></th></tr></thead><tbody>
        ${rows.map(a => { const n = P.investors.filter(v => P.annAudience(a, v.id, P.investments())).length; return `<tr><td><b>${esc(a.title)}</b><span class="sub">${esc(a.body.slice(0, 90))}…</span></td><td>${esc(a.cat)}</td><td>${esc(a.audLabel)}<span class="sub">${n} investors</span></td><td>${a.at ? D(a.at) : '—'}<span class="sub">${esc(a.by)}</span></td><td>${a.status === 'published' ? U.badge('Published', 'b-navy') : U.badge('Draft', 'b-grey')}</td><td class="n">${a.status === 'published' ? Math.min(a.reads, n) + ' / ' + n : '—'}</td><td>${a.status === 'draft' ? `<button class="btn sm primary" data-act="pub-draft" data-id="${a.id}">Publish</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  function openComposer(pre = {}) {
    const plans = P.plans().filter(p => p.status !== 'archived');
    U.drawer('New announcement', 'Draft or publish to a target audience.',
      `<div class="form"><div class="field"><label for="an-t">Title</label><input class="input" id="an-t" value="${esc(pre.title || '')}"></div>
      <div class="field"><label for="an-b">Message</label><textarea class="input" id="an-b">${esc(pre.body || '')}</textarea></div>
      <div class="f-row"><div class="field"><label for="an-c">Category</label><select class="input" id="an-c">${['New plan', 'Plan update', 'Policy', 'General notice', 'Maturity reminder', 'Payout notice', 'Redemption update'].map(c => `<option ${c === pre.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label for="an-f">Attachment (optional)</label><input class="input" id="an-f" type="file"></div></div>
      <div class="field"><label>Audience</label><div class="chips" id="an-aud">${[['all', 'All investors'], ['plan', 'Investors on a plan'], ['maturing', 'Maturing within 60 days'], ['selected', 'Selected investors']].map(([k, l]) => `<button type="button" class="chip ${(pre.aud || 'all') === k ? 'on' : ''}" data-act="aud" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="field ${pre.aud === 'plan' ? '' : 'hidden'}" id="an-plan-f"><label for="an-plan">Plan</label><select class="input" id="an-plan">${plans.map(p => `<option value="${p.id}" ${p.id === pre.plan ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
      <div class="field ${pre.aud === 'selected' ? '' : 'hidden'}" id="an-sel-f"><label for="an-sel">Investors</label><select class="input" id="an-sel" multiple size="5">${P.investors.map(v => `<option value="${v.id}" ${(pre.ids || []).includes(v.id) ? 'selected' : ''}>${esc(v.name)} · ${v.id}</option>`).join('')}</select><span class="hint">Hold Ctrl / Cmd to select several.</span></div>
      <div class="note info" id="an-count"></div><label class="check"><input type="checkbox" id="an-email"> Also send by email</label></div>`,
      `<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="save-ann" data-s="draft">Save draft</button><button class="btn primary" data-act="save-ann" data-s="published" id="an-pub">Publish</button>`);
    ['an-plan', 'an-sel'].forEach(id => document.getElementById(id).addEventListener('change', annCount)); annCount();
  }
  function annDraft() { const g = id => document.getElementById(id); const aud = document.querySelector('#an-aud .chip.on').dataset.k; const plan = P.planBy(g('an-plan').value);
    return { aud, audPlan: plan.id, audIds: [...g('an-sel').selectedOptions].map(o => o.value), audDays: 60, audLabel: { all: 'All investors', plan: 'Investors on ' + plan.name, maturing: 'Maturing within 60 days', selected: 'Selected investors' }[aud] }; }
  function annCount() { const d = annDraft(); const n = P.investors.filter(v => P.annAudience(d, v.id, P.investments())).length; document.getElementById('an-count').innerHTML = `Resolves to <b>${n} investor${n === 1 ? '' : 's'}</b> right now.`; document.getElementById('an-pub').textContent = 'Publish to ' + n + ' investor' + (n === 1 ? '' : 's'); }
  U.actions.aud = t => { document.querySelectorAll('#an-aud .chip').forEach(c => c.classList.toggle('on', c === t)); document.getElementById('an-plan-f').classList.toggle('hidden', t.dataset.k !== 'plan'); document.getElementById('an-sel-f').classList.toggle('hidden', t.dataset.k !== 'selected'); annCount(); };
  U.actions['new-ann'] = () => openComposer();
  U.actions['save-ann'] = t => { const g = id => document.getElementById(id); const title = g('an-t').value.trim(), body = g('an-b').value.trim();
    if (!title || !body) { [g('an-t'), g('an-b')].forEach(x => x.classList.toggle('bad', !x.value.trim())); U.toast('Title and message are required', '', 'err'); return; }
    const a = Object.assign({ id: 'ANN-0' + (35 + P.state.announcements.length), title, body, cat: g('an-c').value, status: t.dataset.s, at: t.dataset.s === 'published' ? P.TODAY : null, by: ME.name, reads: 0 }, annDraft());
    P.state.announcements.push(a); P.log(ME.name, 'announcement.' + (a.status === 'published' ? 'publish' : 'draft'), a.id, a.title, 'audience: ' + a.audLabel); P.save(); U.closeOverlay();
    U.toast(a.status === 'published' ? 'Announcement published' : 'Saved as draft', a.status === 'published' ? 'Open the investor dashboard (Ananya Rao) to see it arrive.' : 'Investors can\'t see it yet.', a.status === 'published' ? 'ok' : 'warn');
    if (location.hash !== '#/announcements') U.nav('announcements'); else route(); };
  U.actions['pub-draft'] = t => { const a = P.state.announcements.find(x => x.id === t.dataset.id); a.status = 'published'; a.at = P.TODAY; P.log(ME.name, 'announcement.publish', a.id, a.title, 'draft → published'); P.save(); U.toast('Announcement published', a.audLabel); route(); };

  /* =============== REPORTS =============== */
  const REPORTS = [['Investor-wise investment report', 'Principal, accrued, paid and outstanding per investor', 'investors'], ['Plan-wise investment report', 'Investments and principal grouped by plan and version', 'plans'], ['Monthly return accrual report', 'All accrual entries for a month, with reversals', 'accruals'], ['Monthly payout report', 'Payouts by status, batch and bank reference', 'payouts'], ['Upcoming maturity report', 'Investments maturing in the next 90 days', 'maturity'], ['Redemption report', 'Requests, decisions and settlements', 'redemptions'], ['Transaction export', 'Full ledger for a date range', 'transactions'], ['Administrative activity history', 'Audit log entries by actor and action', 'audit'], ['Plan version history', 'Every plan version with rate changes and reasons', 'versions'], ['Approval and rejection history', 'Four-eyes decisions on payouts, redemptions, adjustments', 'approvals']];
  function reports() {
    return `${crumb('Reports')}<div class="ph"><div><h1>Reports</h1><p>Every report is generated from ledger and audit records. Exports are logged.</p></div><div class="acts"><select class="input" style="width:auto" id="rp-range" aria-label="Period"><option>Last 30 days</option><option>This quarter</option><option selected>Year to date</option><option>All time</option></select></div></div>
      <div class="grid g-1-1">${REPORTS.map(r => `<div class="card"><div class="card-b" style="display:flex;gap:14px;align-items:center"><div class="icon-btn" style="width:42px;height:42px;background:var(--blue-soft);color:var(--blue);border:0">${U.icon('report')}</div><div style="flex:1;min-width:0"><b style="font-weight:600">${r[0]}</b><p class="hint">${r[1]}</p></div><button class="btn sm" data-act="csv" data-csv="${r[2]}">CSV</button><button class="btn sm" data-act="pdf" data-csv="${r[2]}">PDF</button></div></div>`).join('')}</div>`;
  }
  function csvFor(kind) {
    const invs = P.investments();
    const map = {
      investors: () => [['Investor ID', 'Name', 'Email', 'Phone', 'Registered', 'KYC', 'Account', 'Principal', 'Active', 'Accrued', 'Paid', 'Next maturity']].concat(investorRows().map(r => [r.id, r.name, r.email, r.phone, r.registered, r.kyc, r.status, r.principal, r.active, r.accrued, r.paid, r.next || ''])),
      investments: () => [['Investment', 'Investor', 'Plan', 'Version', 'Rate %/month', 'Principal', 'Lock-in', 'Start', 'Maturity', 'Accrued', 'Paid', 'Outstanding', 'Status']].concat(invs.map(i => [i.code, i.investor, i.planName, i.planVersion, i.rate, i.principal, i.lockin, i.start || '', i.maturity || '', i.accrued, i.paid, i.outstanding, i.label])),
      transactions: () => [['Transaction', 'Date', 'Type', 'Investment', 'Investor', 'Amount', 'Status', 'Reference', 'Created by']].concat(P.transactions().map(t => [t.id, t.date, t.type, t.inv, t.investor, t.amount, t.status, t.ref, t.by])),
      accruals: () => [['Accrual', 'Investment', 'Investor', 'Period', 'From', 'To', 'Accrued on', 'Amount', 'Payout status']].concat(payouts().map(a => [a.id, a.inv.code, a.inv.investor, a.k, a.from, a.to, a.end, a.amount, a.status])),
      audit: () => [['ID', 'Time', 'Actor', 'Action', 'Record', 'Reason', 'Change']].concat(P.audit().map(a => [a.id, a.at, a.actor, a.action, a.record, a.reason, a.diff]))
    };
    return (map[kind] || map.investments)();
  }
  U.actions.csv = t => { const rows = csvFor(t.dataset.csv); const csv = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(',')).join('\n');
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'pms-' + t.dataset.csv + '-' + P.TODAY + '.csv'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
    P.log(ME.name, 'export.csv', t.dataset.csv, 'Report export', (rows.length - 1) + ' rows'); P.save(); U.toast('Export ready', (rows.length - 1) + ' rows · logged to audit trail'); };
  U.actions['export-overview'] = () => U.actions.csv({ dataset: { csv: 'investments' } });
  U.actions.pdf = t => { const rows = csvFor(t.dataset.csv); const title = (REPORTS.find(r => r[2] === t.dataset.csv) || ['Report'])[0];
    U.docView(title, U.docHead(title, (rows.length - 1) + ' rows') + U.docTable(rows), 'pms-' + t.dataset.csv + '-' + P.TODAY); P.log(ME.name, 'export.pdf', t.dataset.csv, 'Report export', (rows.length - 1) + ' rows'); P.save(); };
  U.actions['inv-stmt'] = t => { const i = P.investments().find(x => x.code === t.dataset.code); U.docView('Statement · ' + i.code, U.statement([i], i.investor), 'statement-' + i.code); };
  U.actions['kyc-doc'] = t => { const name = t.closest('div').querySelector('b').textContent; U.docView(name, U.kycDoc(name, t.dataset.who)); };

  /* =============== AUDIT =============== */
  function auditPage() {
    return `${crumb('Audit Logs')}<div class="ph"><div><h1>Audit logs</h1><p>Read-only for everyone, including Super Admins. Every sensitive action records actor, reason and before/after values.</p></div><div class="acts"><button class="btn" data-act="csv" data-csv="audit">${U.icon('download')}Export</button></div></div>
      ${U.table('aud', [
        { h: 'Time', v: r => r.at, r: r => `<span class="num">${r.at}</span>` }, { h: 'Actor', v: r => r.actor }, { h: 'Action', v: r => r.action, r: r => `<span class="mono">${r.action}</span>` },
        { h: 'Record', v: r => r.record, r: r => `<span class="mono">${esc(r.record)}</span>` }, { h: 'Reason', v: r => r.reason }, { h: 'Change (before → after)', v: r => r.diff, r: r => `<span class="mono muted">${esc(r.diff)}</span>` }
      ], P.audit(), { searchPh: 'Search actor, action, record', filters: [['All', 'all'], ['Plans', 'plan'], ['Payouts', 'payout'], ['Redemptions', 'redemption'], ['Investors', 'investor'], ['Announcements', 'announcement']], filterFn: (r, f) => f === 'all' || r.action.startsWith(f), per: 15 })}`;
  }

  /* =============== SETTINGS =============== */
  function settings() {
    const s = P.state.settings;
    return `${crumb('Settings')}<div class="ph"><div><h1>Settings</h1><p>Brand, product rules and security. Changes are audited.</p></div></div>
      <div class="grid g-1-1">
        <div class="card"><div class="card-h"><h3>Brand</h3></div><div class="card-b form"><div style="display:flex;gap:14px;align-items:center"><div class="logo" style="width:52px;height:52px;font-size:22px;border-radius:12px">${P.BRAND.short}</div><button class="btn sm">Replace logo</button></div>
          <div class="f-row"><div class="field"><label for="st-n">Company name</label><input class="input" id="st-n" value="${P.BRAND.name}"></div><div class="field"><label for="st-c">Currency</label><select class="input" id="st-c"><option>INR (₹)</option><option>AED (د.إ)</option><option>USD ($)</option></select></div></div>
          <div class="f-row"><div class="field"><label for="st-tz">Business timezone</label><select class="input" id="st-tz"><option>Asia/Kolkata</option><option>Asia/Dubai</option></select></div><div class="field"><label for="st-col">Primary colour</label><input class="input" id="st-col" value="#0B1F3F"></div></div>
          <div class="field"><label for="st-risk">Default risk disclosure</label><textarea class="input" id="st-risk">${esc(P.plans()[0].risk)}</textarea></div></div></div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Investment rules</h3></div><div class="card-b form">
            <div class="f-row"><div class="field"><label for="st-ap">"Maturity approaching" threshold (days)</label><input class="input" id="st-ap" type="number" value="${s.approachingDays}"></div><div class="field"><label for="st-rw">Redemption request window (days before maturity)</label><input class="input" id="st-rw" type="number" value="30"></div></div>
            <label class="check"><input type="checkbox" id="st-cl" ${s.customLockin ? 'checked' : ''}> Allow custom lock-in durations</label>
            <label class="check"><input type="checkbox" id="st-4e" ${s.fourEyes ? 'checked' : ''}> Require a second admin for payouts, redemptions and adjustments</label>
            <label class="check"><input type="checkbox" id="st-em" ${s.email ? 'checked' : ''}> Send notification emails (needs email provider)</label>
            <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-act="save-settings">Save changes</button></div></div></div>
          <div class="card"><div class="card-h"><h3>Administrators</h3><div class="r"><button class="btn sm">Invite admin</button></div></div><div class="card-b list">
            <div><div class="avatar" style="width:30px;height:30px;font-size:11px">PS</div><div class="grow"><b>Priya Sharma</b><span>priya.sharma@astercapital.example · 2FA on</span></div>${U.badge('Super Admin', 'b-navy')}</div>
            <div><div class="avatar" style="width:30px;height:30px;font-size:11px">KM</div><div class="grow"><b>Karan Mehta</b><span>karan.mehta@astercapital.example · 2FA on</span></div>${U.badge('Super Admin', 'b-navy')}</div></div></div>
          <div class="card"><div class="card-h"><h3>Integrations</h3></div><div class="card-b list">
            <div><div class="grow"><b>Payment provider</b><span>Not configured. Payouts use the manual bank-transfer workflow.</span></div>${U.badge('Manual', 'b-amber')}</div>
            <div><div class="grow"><b>Email delivery</b><span>Not configured. In-app notifications only.</span></div>${U.badge('Off', 'b-grey')}</div>
            <div><div class="grow"><b>Document storage</b><span>S3-compatible bucket, encrypted</span></div>${U.badge('Connected', 'b-green')}</div></div></div>
        </div>
      </div>`;
  }
  U.actions['save-settings'] = () => { const s = P.state.settings; const nd = +document.getElementById('st-ap').value; const before = s.approachingDays;
    s.approachingDays = nd || 60; s.customLockin = document.getElementById('st-cl').checked; s.fourEyes = document.getElementById('st-4e').checked; s.email = document.getElementById('st-em').checked;
    P.log(ME.name, 'settings.update', 'investment_rules', 'Updated from Settings', 'approaching_maturity_days: ' + before + ' → ' + s.approachingDays); P.save(); U.toast('Settings saved', 'Recorded in the audit log.'); };

  function notFound() { return `${crumb('Not found')}<div class="empty"><b>Record not found</b>It may have been removed, or you don't have access. <a href="#/overview">Back to overview</a></div>`; }

  // global search -> investors / investments
  document.getElementById('gsearch').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const q = e.target.value.trim().toUpperCase(); if (!q) return;
    const inv = P.investments().find(i => i.code === q || i.code.endsWith(q)); if (inv) { U.nav('investments/' + inv.code); return; }
    const v = P.investors.find(x => x.id === q || x.name.toUpperCase().includes(q)); if (v) { U.nav('investors/' + v.id); return; }
    U.toast('No match for "' + e.target.value + '"', 'Try an investment ID like INV-1042 or an investor name.', 'warn'); });

  const route = U.router({ overview, investors, plans, investments, accruals, payouts: payoutsPage, redemptions, transactions, announcements, reports, audit: auditPage, settings }, counts);
})();
