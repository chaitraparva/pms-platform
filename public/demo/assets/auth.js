/* Parva Realty PMS demo — sign-in accounts and session. Loaded by every page. */
(function () {
  const KEY = 'pms-auth';
  const ACCOUNTS = {
    admin: { email: 'chaitra@parvarealty.ae', password: 'Parva@2026', name: 'Chaitra', home: 'admin.html', login: 'admin-login.html' },
    investor: { email: 'ananya.rao@example.com', password: 'Investor@2026', name: 'Ananya Rao', home: 'investor.html', login: 'investor-login.html' }
  };
  function read() {
    for (const store of [sessionStorage, localStorage]) { try { const v = JSON.parse(store.getItem(KEY) || 'null'); if (v && v.role) return v; } catch (e) {} }
    return null;
  }
  function signIn(role, email, password, remember) {
    const a = ACCOUNTS[role];
    if (!a || email.trim().toLowerCase() !== a.email || password !== a.password) return false;
    const v = JSON.stringify({ role, email: a.email, at: Date.now() });
    try { (remember ? localStorage : sessionStorage).setItem(KEY, v); } catch (e) {}
    return true;
  }
  function signOut() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} location.href = 'index.html'; }
  // Pages call this before rendering; anyone not signed in to the right role goes to that role's sign-in page.
  function require(role) { const s = read(); if (!s || s.role !== role) { location.replace(ACCOUNTS[role].login); return false; } return true; }
  window.PMSAuth = { ACCOUNTS, read, signIn, signOut, require };
})();
