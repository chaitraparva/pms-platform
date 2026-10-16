/* Parva Realty PMS — "I am a..." chooser and the separate Super Admin / Investor sign-in pages.
   The page type comes from <body data-page="choose|admin|investor">. */
(function () {
  const P = window.PMS, A = window.PMSAuth, page = document.body.dataset.page;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOGO = '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><rect x="10" y="8" width="13" height="100" rx="2" fill="#C9A96E"/><path d="M23 8 Q72 8 72 38 Q72 68 23 68" stroke="#C9A96E" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="38" y="44" width="10" height="64" rx="2" fill="#C9A96E"/><path d="M48 44 Q82 44 82 62 Q82 80 48 80" stroke="#C9A96E" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M62 75 L95 108" stroke="#C9A96E" stroke-width="11" stroke-linecap="round"/></svg>';
  const ICON = { admin: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>', investor: '<svg viewBox="0 0 24 24"><path d="M3 20h18M6 16V10M11 16V5M16 16v-5M21 16V8"/></svg>' };
  const ROLE = {
    admin: { label: 'Super Admin', desc: 'Plans, investors, payouts and full control', ph: 'you@parvarealty.ae' },
    investor: { label: 'Investor', desc: 'Your investments, returns and statements', ph: 'you@example.com' }
  };
  const SUPPORT = 'chaitra@parvarealty.ae';

  // Already signed in for this role: go straight to the dashboard.
  const ses = A.read();
  if (page !== 'choose' && ses && ses.role === page) { location.replace(A.ACCOUNTS[page].home); return; }

  let aum = '—', investors = '—';
  try { const live = P.investments().filter(i => ['active', 'matured', 'redemption_requested', 'redemption_processing'].includes(i.status));
    aum = P.fmtShort(live.reduce((s, i) => s + i.principal, 0)); investors = P.investors.length; } catch (e) {}

  const left = `<section class="auth-l">
      <div class="auth-brand">${LOGO}<div><b>PARVA REALTY</b><small>Investment Portal</small></div></div>
      <div class="auth-hero">
        <h1>Every investment, return and maturity in one place.</h1>
        <p>Monthly simple-interest plans with fixed lock-ins, transparent accruals and confirmed payouts, for our team and our investors.</p>
        <div class="auth-flow"><span>Investment</span><em>→</em><span>Monthly returns</span><em>→</em><span class="g">Maturity</span></div>
        <div class="auth-stats"><div><b>${esc(aum)}</b><span>Principal under management</span></div><div><b>${esc(investors)}</b><span>Registered investors</span></div><div><b>6 / 12</b><span>Month lock-in options</span></div><div><b>Dubai &amp; India</b><span>Two offices</span></div></div>
      </div>
    </section>`;

  function chooser() {
    return `<div class="auth-box">
      <div><h2>Welcome</h2><p class="sub">Choose how you sign in to the Parva Realty investment portal.</p></div>
      <div class="eyebrow">I am a…</div>
      <div class="role-pick">${['admin', 'investor'].map(r => `<a class="role" href="${A.ACCOUNTS[r].login}"><span class="ri">${ICON[r]}</span><span class="rt"><b>${ROLE[r].label}</b><span>${ROLE[r].desc}</span></span><span class="go">›</span></a>`).join('')}</div>
      <p class="auth-help">Access issues? <a href="mailto:${SUPPORT}">${SUPPORT}</a></p>
    </div>`;
  }
  function signInForm() {
    const R = ROLE[page];
    return `<form class="auth-box" id="f" novalidate>
      <span class="role-chip"><i>${ICON[page]}</i>${R.label}<a href="index.html">Change</a></span>
      <div><h2>Sign in</h2><p class="sub">Use your registered email and password.</p></div>
      <div class="alert err hidden" id="err" role="alert"></div>
      <div class="field"><label for="em">Email <span class="req">*</span></label><input class="input" id="em" type="email" placeholder="${R.ph}" autocomplete="username" required></div>
      <div class="field"><div class="lbl-row"><label for="pw">Password <span class="req">*</span></label><a href="#" id="fp">Forgot password?</a></div>
        <div class="pw-wrap"><input class="input" id="pw" type="password" placeholder="Enter your password" autocomplete="current-password" required><button type="button" id="pwt">Show</button></div></div>
      <label class="check"><input type="checkbox" id="rm" checked> Keep me signed in on this device</label>
      <button class="btn primary block" type="submit" id="go">Sign in as ${R.label}</button>
      <p class="auth-help">Access issues? <a href="mailto:${SUPPORT}">${SUPPORT}</a></p>
    </form>`;
  }
  function resetBox() {
    return `<div class="auth-box">
      <span class="role-chip"><i>${ICON[page]}</i>${ROLE[page].label}<a href="index.html">Change</a></span>
      <div><h2>Reset password</h2><p class="sub">Password resets are handled by the Parva Realty team so only the account owner can change it.</p></div>
      <div class="note info">Email <b>${SUPPORT}</b> from your registered email address. You will receive a link to set a new password.</div>
      <a class="btn primary block" href="mailto:${SUPPORT}?subject=${encodeURIComponent('Password reset · ' + ROLE[page].label + ' account')}">Email the Parva Realty team</a>
      <button class="btn block" type="button" id="back">Back to sign in</button>
    </div>`;
  }

  document.body.innerHTML = `<div class="auth">${left}<section class="auth-r" id="r"></section></div>`;
  const r = document.getElementById('r');
  function show(html) { r.innerHTML = html; bind(); }
  function bind() {
    const f = document.getElementById('f');
    if (f) {
      const em = document.getElementById('em'), pw = document.getElementById('pw'), err = document.getElementById('err');
      em.focus();
      document.getElementById('pwt').onclick = e => { pw.type = pw.type === 'password' ? 'text' : 'password'; e.target.textContent = pw.type === 'password' ? 'Show' : 'Hide'; };
      document.getElementById('fp').onclick = e => { e.preventDefault(); show(resetBox()); };
      [em, pw].forEach(x => x.addEventListener('input', () => { x.classList.remove('bad'); err.classList.add('hidden'); }));
      f.onsubmit = e => {
        e.preventDefault();
        const miss = [em, pw].filter(x => !x.value.trim()); miss.forEach(x => x.classList.add('bad'));
        if (miss.length) { err.textContent = 'Enter your email and password.'; err.classList.remove('hidden'); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value.trim())) { em.classList.add('bad'); err.textContent = 'Enter a valid email address.'; err.classList.remove('hidden'); return; }
        if (!A.signIn(page, em.value, pw.value, document.getElementById('rm').checked)) {
          const other = page === 'admin' ? 'investor' : 'admin';
          err.textContent = em.value.trim().toLowerCase() === A.ACCOUNTS[other].email ? `This is ${other === "investor" ? "an" : "a"} ${ROLE[other].label} account. Use the ${ROLE[other].label} sign-in instead.` : 'The email or password is incorrect.';
          err.classList.remove('hidden'); pw.value = ''; pw.focus(); return;
        }
        const b = document.getElementById('go'); b.textContent = 'Signing in…'; b.disabled = true;
        setTimeout(() => { location.href = A.ACCOUNTS[page].home; }, 300);
      };
    }
    const back = document.getElementById('back'); if (back) back.onclick = () => show(signInForm());
  }
  show(page === 'choose' ? chooser() : signInForm());
})();
