/* PMS prototype — shared UI kit: shell, router, tables, charts, overlays. */
(function () {
  const P = window.PMS;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .6 3.2 2.5 3.5 5.5"/>',
    plans: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    invest: '<path d="M3 20h18M6 16V10M11 16V5M16 16v-5M21 16V8"/>',
    roi: '<path d="M4 19l5-6 4 3 7-9"/><path d="M15 7h5v5"/>',
    payout: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    redeem: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    txn: '<path d="M7 7h13M17 4l3 3-3 3M17 17H4M7 14l-3 3 3 3"/>',
    announce: '<path d="M4 10v4h3l7 4V6L7 10H4zM18 9a4 4 0 010 6"/>',
    report: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
    audit: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 018 0v3.5"/>',
    doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
    bell: '<path d="M6 16v-5a6 6 0 1112 0v5l2 2H4zM10 20.5a2 2 0 004 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    collapse: '<path d="M4 4h16v16H4zM9 4v16M15 10l-2 2 2 2"/>',
    back: '<path d="M15 6l-6 6 6 6"/>'
  };
  const icon = (n, cls) => `<svg viewBox="0 0 24 24" class="ic ${cls || ''}" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* ---------- badges ---------- */
  const INV_BADGE = { 'Locked': 'b-violet sq', 'Active': 'b-blue', 'Maturity approaching': 'b-amber', 'Eligible for redemption': 'b-green', 'Matured': 'b-green', 'Redemption requested': 'b-amber', 'Redemption processing': 'b-blue', 'Redeemed': 'b-grey', 'Cancelled': 'b-grey', 'Pending funding': 'b-grey' };
  const PAY_BADGE = { accrued: ['Accrued', 'b-grey'], approved: ['Approved', 'b-blue'], processing: ['Processing', 'b-amber'], paid: ['Paid', 'b-green'], failed: ['Failed', 'b-red'], reversed: ['Reversed', 'b-grey'] };
  const TXN_BADGE = { confirmed: ['Confirmed', 'b-green'], pending: ['Pending', 'b-amber'], processing: ['Processing', 'b-amber'], posted: ['Posted', 'b-grey'], failed: ['Failed', 'b-red'], rejected: ['Rejected', 'b-red'] };
  const badge = (label, cls) => `<span class="badge ${cls}">${esc(label)}</span>`;
  const invBadge = inv => badge(inv.label, INV_BADGE[inv.label] || 'b-grey');
  const payBadge = s => badge(PAY_BADGE[s][0], PAY_BADGE[s][1]);
  const txnBadge = s => badge((TXN_BADGE[s] || [s])[0], (TXN_BADGE[s] || [0, 'b-grey'])[1]);
  const redBadge = s => badge(P.REDEMPTION[s][0], P.REDEMPTION[s][1]);
  const tip = t => `<span class="tip" tabindex="0" data-tip="${esc(t)}">i</span>`;
  const kpi = (label, value, sub, opts = {}) => `<div class="kpi"><div class="kpi-l">${esc(label)}${opts.tip ? tip(opts.tip) : ''}</div><div class="kpi-v ${opts.cls || ''}" title="${esc(value)}">${value}</div>${sub ? `<div class="kpi-s ${opts.subCls || ''}">${sub}</div>` : ''}</div>`;

  /* ---------- shell ---------- */
  function shell(cfg) {
    const collapsed = (() => { try { return localStorage.getItem('pms-side') === '1'; } catch (e) { return false; } })();
    document.body.innerHTML = `
      <div class="demo-bar">Demo with sample data. Your changes are saved on this device. <a data-act="reset-demo">Reset sample data</a> · <a href="index.html">Switch account</a></div>
      <div class="shell ${collapsed ? 'collapsed' : ''}" id="shell">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><div class="logo">${P.BRAND.short}</div><div class="brand-txt"><b>${P.BRAND.name}</b><small>${esc(cfg.roleLabel)}</small></div></div>
          <nav id="nav">${cfg.nav.map(n => n.group ? `<div class="nav-grp">${n.group}</div>` : `<a class="nav-a" data-route="${n.route}" href="#/${n.route}" title="${esc(n.label)}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.count ? `<em class="ct" data-count="${n.route}"></em>` : ''}</a>`).join('')}</nav>
          <div class="side-foot"><div class="avatar">${cfg.user.initials}</div><div class="who"><b>${esc(cfg.user.name)}</b><small>${esc(cfg.user.sub)}</small></div></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn mobile-only" data-act="mob-menu" aria-label="Open menu">${icon('menu')}</button>
            <button class="icon-btn desk-only" data-act="collapse" aria-label="Collapse sidebar" title="Collapse sidebar">${icon('collapse')}</button>
            <div class="crumbs" id="crumbs"></div>
            <label class="gsearch">${icon('search')}<input id="gsearch" placeholder="${esc(cfg.searchPh)}" aria-label="Search"></label>
            <div style="position:relative"><button class="icon-btn" data-act="bell" aria-label="Notifications">${icon('bell')}<em id="bell-ct" class="hidden">0</em></button><div id="bell-pop"></div></div>
            <div style="position:relative"><button class="avatar" data-act="user-menu" aria-label="Account">${cfg.user.initials}</button><div id="user-pop"></div></div>
          </header>
          <main class="content" id="view"></main>
        </div>
      </div>
      <div class="toasts" id="toasts"></div><div id="overlay"></div>`;
  }

  /* ---------- router ---------- */
  function router(routes, onAfter) {
    function go() {
      const h = (location.hash || '#/overview').slice(2);
      const parts = h.split('/');
      const route = routes[parts[0]] ? parts[0] : 'overview';
      document.querySelectorAll('.nav-a').forEach(a => a.classList.toggle('on', a.dataset.route === route));
      document.getElementById('shell').classList.remove('mob-open');
      closeOverlay(); closePops();
      const view = document.getElementById('view');
      const r = routes[route];
      view.innerHTML = r(parts.slice(1)) || '';
      document.getElementById('crumbs').innerHTML = view.querySelector('[data-crumb]') ? view.querySelector('[data-crumb]').dataset.crumb : '';
      window.scrollTo(0, 0);
      if (onAfter) onAfter(route);
      bindTables(view); bindCharts(view);
    }
    window.addEventListener('hashchange', go);
    window.addEventListener('pms-state', () => { if (!document.querySelector('.drawer,.modal')) go(); else if (onAfter) onAfter(); });
    go();
    return go;
  }
  const nav = h => { location.hash = '#/' + h; };

  /* ---------- global events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    const go = e.target.closest('[data-go]');
    if (go && !e.target.closest('button,a,input,label')) { nav(go.dataset.go); return; }
    if (go && go.tagName !== 'TR') { nav(go.dataset.go); return; }
    if (!t) { if (!e.target.closest('.popover')) closePops(); return; }
    const a = t.dataset.act;
    if (a === 'collapse') { const s = document.getElementById('shell'); s.classList.toggle('collapsed'); try { localStorage.setItem('pms-side', s.classList.contains('collapsed') ? '1' : '0'); } catch (er) {} }
    else if (a === 'mob-menu') document.getElementById('shell').classList.toggle('mob-open');
    else if (a === 'close') closeOverlay();
    else if (a === 'doc-download') { if (curDoc) { const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([docFile()], { type: 'text/html' })); l.download = curDoc.file + '.html'; document.body.appendChild(l); l.click(); l.remove(); toast('Downloaded', curDoc.file + '.html'); } }
    else if (a === 'doc-print') { if (curDoc) { const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print', 'Your browser blocked the print window.', 'warn'); return; } w.document.write(docFile()); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); } }
    else if (a === 'reset-demo') { P.reset(); toast('Demo data reset', 'All sample data is back to its starting state.'); setTimeout(() => location.reload(), 600); }
    else if (a === 'user-menu') { const pop = document.getElementById('user-pop'); if (pop.innerHTML) { closePops(); return; } closePops(); pop.innerHTML = `<div class="popover" style="width:220px"><div class="pl" style="padding:6px"><a class="nav-a" style="color:var(--fg)" href="index.html">${icon('logout')}<span>Sign out</span></a></div></div>`; }
    else if (UI.actions[a]) UI.actions[a](t, e);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeOverlay(); closePops(); } });
  function closePops() { ['bell-pop', 'user-pop'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }); }

  /* ---------- overlays ---------- */
  function drawer(title, sub, body, foot) {
    document.getElementById('overlay').innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true"><div class="dh"><div><h3>${esc(title)}</h3>${sub ? `<p class="hint">${sub}</p>` : ''}</div><button class="x" data-act="close" aria-label="Close">×</button></div><div class="db">${body}</div><div class="df">${foot}</div></aside>`;
    const f = document.querySelector('.drawer input,.drawer textarea,.drawer select'); if (f) f.focus();
  }
  function modal(title, sub, body, foot) {
    document.getElementById('overlay').innerHTML = `<div class="scrim" data-act="close"></div><div class="modal" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3>${sub ? `<p class="hint">${sub}</p>` : ''}</div><div class="mb">${body}</div><div class="mf">${foot}</div></div>`;
  }
  function closeOverlay() { const o = document.getElementById('overlay'); if (o) o.innerHTML = ''; }
  function toast(title, sub, kind = 'ok') {
    const c = { ok: ['var(--green)', '✓'], warn: ['var(--amber)', '!'], err: ['var(--red)', '×'], info: ['var(--blue)', 'i'] }[kind];
    const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ti" style="background:${c[0]}">${c[1]}</span><div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
    document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 4200);
  }

  /* ---------- printable documents (statements, reports, KYC files) ---------- */
  let curDoc = null;
  const DOC_CSS = 'body{font:13px/1.5 "Plus Jakarta Sans",Arial,sans-serif;color:#111827;margin:32px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #E5E7EB;padding:7px 8px;text-align:left}th{background:#F3F4F6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280}.dh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4F46E5;padding-bottom:12px;margin-bottom:14px}.muted{color:#6B7280}.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.sum div{background:#F5F5FF;border-radius:8px;padding:10px}.sum b{display:block;font-size:15px}.foot{margin-top:24px;font-size:11px;color:#6B7280}';
  function docHead(title, sub) { return `<div class="dh"><div><h1>${esc(title)}</h1><div class="muted">${sub || ''}</div></div><div style="text-align:right"><b>${esc(P.BRAND.name)}</b><div class="muted">Generated ${P.fmtDate(P.TODAY)}</div></div></div>`; }
  function docTable(rows) { const [h, ...b] = rows; return `<table><thead><tr>${h.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${h.length}" class="muted">No records</td></tr>`}</tbody></table>`; }
  function statement(invs, who) {
    const sum = f => invs.reduce((s, i) => s + f(i), 0);
    return docHead('Investment statement', esc(who) + ' · ' + invs.length + ' investment' + (invs.length === 1 ? '' : 's')) +
      `<div class="sum"><div>Principal<b>${P.fmtMoney(sum(i => i.status === 'redeemed' ? 0 : i.principal))}</b></div><div>Returns accrued<b>${P.fmtMoney(sum(i => i.accrued))}</b></div><div>Returns paid<b>${P.fmtMoney(sum(i => i.paid))}</b></div><div>Outstanding<b>${P.fmtMoney(sum(i => i.outstanding))}</b></div></div>` +
      invs.map(i => `<h2>${esc(i.code)} · ${esc(i.planName)} v${i.planVersion} · ${P.fmtMoney(i.principal)} at ${i.rate.toFixed(2)}% per month</h2><div class="muted" style="margin-bottom:6px">Start ${P.fmtDate(i.start)} · ${i.lockin}-month lock-in · maturity ${P.fmtDate(i.maturity)} · ${esc(i.label)}</div>` +
        docTable([['Period', 'Accrued on', 'Amount', 'Payout', 'Reference']].concat(i.accruals.map(a => ['Month ' + a.k, P.fmtDate(a.end), P.fmtMoney(a.amount), PAY_BADGE[a.pay.status][0], a.pay.ref || '—'])))).join('') +
      '<p class="foot">Returns are simple interest on the original principal. Sample statement generated from demo data.</p>';
  }
  function docView(title, html, fileBase) {
    curDoc = { title, html, file: (fileBase || title).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') };
    document.getElementById('overlay').innerHTML = `<div class="scrim" data-act="close"></div><div class="modal doc-modal" role="dialog" aria-modal="true"><div class="mh"><div style="display:flex;align-items:center;gap:10px"><h3>${esc(title)}</h3><button class="x" data-act="close" aria-label="Close">×</button></div></div><div class="mb"><div class="doc-paper">${html}</div></div><div class="mf"><button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="doc-download">${icon('download')}Download</button><button class="btn primary" data-act="doc-print">Print or save as PDF</button></div></div>`;
  }
  function docFile() { return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(curDoc.title)}</title><style>${DOC_CSS}</style></head><body>${curDoc.html}</body></html>`; }
  function kycDoc(name, who) {
    return docHead(name.replace(/\.(pdf|jpg)$/, ''), esc(who)) + `<table><tbody><tr><th>Document</th><td>${esc(name)}</td></tr><tr><th>Holder</th><td>${esc(who)}</td></tr><tr><th>Status</th><td>Reviewed by compliance</td></tr><tr><th>Stored</th><td>Encrypted document store, access logged</td></tr></tbody></table><p class="foot">Sample document from the demo. Real files are shown here once uploaded.</p>`;
  }

  /* ---------- data table: search, filter chips, sort, paginate ---------- */
  const TABLES = {};
  function table(id, cols, rows, opts = {}) {
    TABLES[id] = { cols, rows, opts, page: 0, sort: opts.sort || null, dir: opts.dir || -1, q: '', filter: opts.filters ? opts.filters[0][1] : null };
    return `<div class="card" data-table="${id}">${opts.title ? `<div class="card-h"><h3>${esc(opts.title)}</h3><div class="r">${opts.right || ''}</div></div>` : ''}
      ${opts.search !== false || opts.filters ? `<div class="toolbar">${opts.search !== false ? `<label class="search">${icon('search')}<input data-tsearch placeholder="${esc(opts.searchPh || 'Search')}" aria-label="Search table"></label>` : ''}
      ${opts.filters ? `<div class="chips">${opts.filters.map((f, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-tfilter="${esc(f[1])}">${esc(f[0])}</button>`).join('')}</div>` : ''}${opts.tools ? `<div style="margin-left:auto;display:flex;gap:8px">${opts.tools}</div>` : ''}</div>` : ''}
      <div class="tbl" data-tbody></div><div class="pager" data-pager></div></div>`;
  }
  function renderTable(el) {
    const T = TABLES[el.dataset.table]; if (!T) return;
    let rows = T.rows.slice();
    if (T.filter && T.opts.filterFn) rows = rows.filter(r => T.opts.filterFn(r, T.filter));
    if (T.q) { const q = T.q.toLowerCase(); rows = rows.filter(r => T.cols.some(c => String(c.v ? c.v(r) : '').toLowerCase().includes(q)) || (T.opts.text && T.opts.text(r).toLowerCase().includes(q))); }
    if (T.sort != null) { const c = T.cols[T.sort]; rows.sort((a, b) => { const x = c.s ? c.s(a) : c.v(a), y = c.s ? c.s(b) : c.v(b); return (x > y ? 1 : x < y ? -1 : 0) * T.dir; }); }
    const per = T.opts.per || 10, pages = Math.max(1, Math.ceil(rows.length / per)); T.page = Math.min(T.page, pages - 1);
    const slice = rows.slice(T.page * per, T.page * per + per);
    el.querySelector('[data-tbody]').innerHTML = rows.length ? `<table><thead><tr>${T.cols.map((c, i) => `<th class="${c.n ? 'n' : ''} ${c.v ? 'sort' : ''}" data-tsort="${i}">${esc(c.h)}${T.sort === i ? (T.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>${slice.map(r => `<tr ${T.opts.go ? `class="click" data-go="${T.opts.go(r)}"` : ''}>${T.cols.map(c => `<td class="${c.n ? 'n' : ''} ${c.m ? 'm' : ''}">${c.r ? c.r(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<div style="padding:18px"><div class="empty"><b>${esc(T.opts.emptyTitle || 'Nothing here yet')}</b>${esc(T.opts.empty || 'No records match these filters.')}</div></div>`;
    el.querySelector('[data-pager]').innerHTML = `<span>${rows.length ? (T.page * per + 1) + '–' + Math.min(rows.length, T.page * per + per) + ' of ' + rows.length : '0 records'}</span><div class="sp"><button class="btn sm" data-tpage="-1" ${T.page === 0 ? 'disabled' : ''}>Previous</button><button class="btn sm" data-tpage="1" ${T.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>`;
  }
  function bindTables(root) {
    root.querySelectorAll('[data-table]').forEach(el => {
      renderTable(el);
      const T = TABLES[el.dataset.table];
      const s = el.querySelector('[data-tsearch]'); if (s) s.addEventListener('input', () => { T.q = s.value; T.page = 0; renderTable(el); });
      el.addEventListener('click', e => {
        const f = e.target.closest('[data-tfilter]'); if (f) { el.querySelectorAll('[data-tfilter]').forEach(x => x.classList.toggle('on', x === f)); T.filter = f.dataset.tfilter; T.page = 0; renderTable(el); }
        const so = e.target.closest('[data-tsort]'); if (so && T.cols[so.dataset.tsort].v) { const i = +so.dataset.tsort; T.dir = T.sort === i ? -T.dir : -1; T.sort = i; renderTable(el); }
        const pg = e.target.closest('[data-tpage]'); if (pg) { T.page += +pg.dataset.tpage; renderTable(el); }
      });
    });
  }

  /* ---------- charts (inline SVG) ---------- */
  // series: [{name, color, values:[]}], labels: []
  function barChart(labels, series, opts = {}) {
    const W = opts.w || 640, H = opts.h || 220, L = 52, B = 26, T = 10, R = 8;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const iw = W - L - R, ih = H - T - B, gw = iw / labels.length, bw = Math.min(28, (gw - 12) / series.length);
    const y = v => T + ih - (v / max) * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4; g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${opts.fmt ? opts.fmt(v) : v}</text>`; }
    labels.forEach((lb, i) => {
      const x0 = L + gw * i + (gw - bw * series.length - 3 * (series.length - 1)) / 2;
      series.forEach((s, j) => { const v = s.values[i]; const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
        g += `<rect class="bar" x="${x0 + j * (bw + 3)}" y="${T + ih - h}" width="${bw}" height="${h}" rx="3" fill="${s.color}" ${s.dash ? 'fill-opacity=".25" stroke="' + s.color + '" stroke-dasharray="3 2"' : ''} data-tip="${esc(s.name + ' · ' + lb + ': ' + (opts.tipFmt || opts.fmt || String)(v))}"/>`; });
      g += `<text x="${L + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Chart')}">${g}</svg></div>`;
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function donut(parts, opts = {}) {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1; const r = 54, c = 2 * Math.PI * r; let off = 0;
    const arcs = parts.map(p => { const len = c * p.value / total; const s = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${p.color}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(p.name)}</title></circle>`; off += len; return s; }).join('');
    return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="${esc(opts.label || '')}"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${arcs}<text x="70" y="66" text-anchor="middle" style="font-size:11px;fill:var(--fg-3)">${esc(opts.center1 || '')}</text><text x="70" y="84" text-anchor="middle" style="font-size:15px;font-weight:600;fill:var(--fg)">${esc(opts.center2 || '')}</text></svg>
      <div style="display:grid;gap:8px;font-size:13px;flex:1;min-width:150px">${parts.map(p => `<div style="display:flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:3px;background:${p.color};flex:none"></i><span style="flex:1">${esc(p.name)}</span><b class="num" style="font-weight:500">${opts.fmt ? opts.fmt(p.value) : p.value}</b></div>`).join('')}</div></div>`;
  }
  let ctip;
  function bindCharts(root) {
    root.querySelectorAll('rect.bar[data-tip]').forEach(r => {
      r.addEventListener('mousemove', e => { if (!ctip) { ctip = document.createElement('div'); ctip.className = 'ctip'; document.body.appendChild(ctip); } ctip.textContent = r.dataset.tip; ctip.style.display = 'block'; ctip.style.left = (e.clientX + 12) + 'px'; ctip.style.top = (e.clientY - 34) + 'px'; });
      r.addEventListener('mouseleave', () => { if (ctip) ctip.style.display = 'none'; });
    });
  }

  /* ---------- monthly series helper ---------- */
  function lastMonths(n) { const out = []; let [y, m] = P.TODAY.split('-').map(Number); for (let i = n - 1; i >= 0; i--) { let mm = m - i, yy = y; while (mm < 1) { mm += 12; yy--; } out.push(yy + '-' + String(mm).padStart(2, '0')); } return out; }
  const monthLabel = ym => P.MONTHS[+ym.slice(5) - 1] + (ym.slice(5) === '01' ? ' ' + ym.slice(2, 4) : '');

  const UI = { docView, docHead, docTable, statement, kycDoc, esc, icon, badge, invBadge, payBadge, txnBadge, redBadge, tip, kpi, shell, router, nav, drawer, modal, closeOverlay, toast, table, renderTable, bindTables, barChart, donut, lastMonths, monthLabel, actions: {}, closePops };
  window.UI = UI;
})();
