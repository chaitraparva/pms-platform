import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase, friendly, configured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Logo } from '../shell/Shell';

export function Login() {
  const { session, profile, branding, needsMfa, ready } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'signin' | 'reset' | 'mfa'>('signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);

  useEffect(() => { if (session && needsMfa) setMode('mfa'); }, [session, needsMfa]);

  if (ready && session && profile && !needsMfa) return <Navigate to={profile.role === 'super_admin' ? '/admin' : '/portal'} replace />;

  const signIn = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setMsg({ t: /invalid/i.test(error.message) ? 'Email or password is incorrect.' : friendly(error.message) });
  };
  const sendReset = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/set-password' });
    setBusy(false);
    setMsg(error ? { t: friendly(error.message) } : { t: 'If an account exists for this email, a reset link is on its way.', ok: true });
  };
  const verifyMfa = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const { data: f, error: fe } = await supabase.auth.mfa.listFactors();
      if (fe) throw fe;
      const factor = f.totp.find(x => x.status === 'verified');
      if (!factor) throw new Error('No authenticator is set up on this account.');
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (error) throw error;
      nav('/', { replace: true });
    } catch (err) {
      setMsg({ t: err instanceof Error ? (/invalid/i.test(err.message) ? 'That code is not valid. Try the current code.' : friendly(err.message)) : 'Could not verify.' });
    } finally { setBusy(false); }
  };

  const company = branding?.company_name || 'Investor Portal';
  return (
    <div className="login">
      <section className="login-l">
        <div className="brand" style={{ padding: 0 }}><Logo name={company} url={branding?.logo_url} /><div className="brand-txt"><b>{company}</b><small>Portfolio Management System</small></div></div>
        <div style={{ display: 'grid', gap: 14, marginTop: 40, position: 'relative', zIndex: 1 }}>
          <h1>{branding?.tagline || 'Every investment, return and maturity in one place.'}</h1>
          <p>Monthly simple-interest plans with contractual lock-ins, transparent accruals and confirmed payouts.</p>
        </div>
        <div className="hint" style={{ color: 'var(--on-navy-2)', position: 'relative', zIndex: 1 }}>{branding?.legal_footer}</div>
      </section>
      <section className="login-r">
        {!configured && <div className="note" style={{ position: 'absolute', top: 16, left: 16, right: 16 }}>This deployment is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See README.</div>}
        {mode === 'signin' && (
          <form className="login-box" onSubmit={signIn}>
            <div><h2>Sign in</h2><p className="hint" style={{ fontSize: 13.5, marginTop: 4 }}>Use the email your administrator registered for you.</p></div>
            <div className="field"><label htmlFor="em">Email</label><input className="input" id="em" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw">Password</label><input className="input" id="pw" type="password" required autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><a style={{ cursor: 'pointer' }} onClick={() => { setMode('reset'); setMsg(null); }}>Forgot password?</a></div>
            {msg && <p className="hint" role="alert" style={{ color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</p>}
            <button className="btn primary" style={{ padding: 13 }} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <div className="divider">Security</div>
            <p className="hint">Accounts are created by the administrator. Two-factor authentication can be turned on from Profile & Security.{branding?.support_email ? ` Need help? ${branding.support_email}` : ''}</p>
          </form>
        )}
        {mode === 'reset' && (
          <form className="login-box" onSubmit={sendReset}>
            <div><h2>Reset password</h2><p className="hint" style={{ fontSize: 13.5, marginTop: 4 }}>We will email you a secure link to choose a new password.</p></div>
            <div className="field"><label htmlFor="em2">Email</label><input className="input" id="em2" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            {msg && <p className="hint" role="status" style={{ color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</p>}
            <button className="btn primary" style={{ padding: 13 }} type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <a style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setMode('signin'); setMsg(null); }}>Back to sign in</a>
          </form>
        )}
        {mode === 'mfa' && (
          <form className="login-box" onSubmit={verifyMfa}>
            <div><h2>Two-factor check</h2><p className="hint" style={{ fontSize: 13.5, marginTop: 4 }}>Enter the 6-digit code from your authenticator app.</p></div>
            <div className="field"><label htmlFor="otp">Code</label><input className="input mono" id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            {msg && <p className="hint" role="alert" style={{ color: 'var(--red)' }}>{msg.t}</p>}
            <button className="btn primary" style={{ padding: 13 }} type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</button>
            <a style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => supabase.auth.signOut()}>Use a different account</a>
          </form>
        )}
      </section>
    </div>
  );
}
