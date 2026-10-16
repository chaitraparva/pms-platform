import { FormEvent, useEffect, useState } from 'react';
import { supabase, rpc, friendly } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { KycBadge, PageHead, useToast } from '../ui/kit';
import { date } from '../lib/format';

/** Shared by both dashboards: contact details, password and two-factor authentication. */
export function ProfileSecurity() {
  const { profile, reloadProfile, settings } = useAuth();
  const toast = useToast();
  const p = profile!;
  const [phone, setPhone] = useState(p.phone);
  const [address, setAddress] = useState(p.address);
  const [city, setCity] = useState(p.city);
  const [notifyEmail, setNotifyEmail] = useState(p.notify_email);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  const loadFactors = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp || []) as { id: string; status: string; friendly_name?: string }[]);
  };
  useEffect(() => { loadFactors(); }, []);
  const verified = factors.find(f => f.status === 'verified');

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault(); setBusy('profile');
    try { await rpc('update_my_profile', { p_phone: phone, p_address: address, p_city: city, p_notify_email: notifyEmail }); await reloadProfile(); toast('Profile saved'); }
    catch (err) { toast('Could not save', (err as Error).message, 'err'); } finally { setBusy(''); }
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) { toast('Password too short', 'Use at least 10 characters.', 'warn'); return; }
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy('');
    if (error) toast('Could not change password', friendly(error.message), 'err'); else { setPw(''); toast('Password changed'); }
  };
  const startEnroll = async () => {
    setBusy('mfa');
    // remove any half-finished enrolment first
    for (const f of factors.filter(x => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator ' + new Date().toISOString().slice(0, 10) });
    setBusy('');
    if (error) { toast('Could not start setup', friendly(error.message), 'err'); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const confirmEnroll = async (e: FormEvent) => {
    e.preventDefault(); if (!enroll) return; setBusy('mfa');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy('');
    if (error) { toast('Code not accepted', 'Check the time on your phone and try the current code.', 'err'); return; }
    setEnroll(null); setCode(''); await loadFactors(); toast('Two-factor authentication is on', 'You will be asked for a code each time you sign in.');
  };
  const disable = async () => {
    if (!verified || !confirm('Turn off two-factor authentication?')) return;
    setBusy('mfa');
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy('');
    if (error) toast('Could not turn off', friendly(error.message), 'err'); else { await loadFactors(); toast('Two-factor authentication is off', '', 'warn'); }
  };

  return (
    <>
      <PageHead crumbs={['Profile & Security']} title="Profile & Security" sub={`${p.code} · ${p.email} · member since ${date(p.created_at)}`} actions={p.role === 'investor' ? <KycBadge k={p.kyc_status} /> : undefined} />
      <div className="grid g-1-1">
        <div className="card"><div className="card-h"><h3>Contact details</h3></div><div className="card-b">
          <form className="form" onSubmit={saveProfile}>
            <div className="f-row"><div className="field"><label>Full name</label><input className="input" value={p.full_name} disabled /></div><div className="field"><label>Email</label><input className="input" value={p.email} disabled /></div></div>
            <div className="f-row"><div className="field"><label htmlFor="ph">Phone</label><input className="input" id="ph" value={phone} onChange={e => setPhone(e.target.value)} /></div><div className="field"><label htmlFor="ct">City</label><input className="input" id="ct" value={city} onChange={e => setCity(e.target.value)} /></div></div>
            <div className="field"><label htmlFor="ad">Address</label><textarea className="input" id="ad" rows={2} value={address} onChange={e => setAddress(e.target.value)} /></div>
            <label className="check"><input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} /> Email me important updates</label>
            {p.role === 'investor' && <p className="hint">Name, email and bank details can only be changed by {settings?.company_name || 'the administrator'} for your protection{settings?.support_email ? ` (${settings.support_email})` : ''}.</p>}
            <div><button className="btn primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save details'}</button></div>
          </form>
          {p.role === 'investor' && (
            <dl className="kv" style={{ marginTop: 18 }}>
              <dt>Bank</dt><dd>{p.bank_name || '—'}</dd><dt>Account</dt><dd className="mono">{p.bank_account_masked || '—'}</dd>
              <dt>IFSC / routing</dt><dd className="mono">{p.bank_ifsc || '—'}</dd><dt>ID number</dt><dd className="mono">{p.id_number_masked || '—'}</dd>
            </dl>
          )}
        </div></div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card"><div className="card-h"><h3>Two-factor authentication</h3><div className="r">{verified ? <span className="badge b-green">On</span> : <span className="badge b-grey">Off</span>}</div></div><div className="card-b">
            {!enroll && (verified
              ? <><p className="hint">Each sign-in asks for a code from your authenticator app.</p><div style={{ marginTop: 12 }}><button className="btn danger" onClick={disable} disabled={busy === 'mfa'}>Turn off</button></div></>
              : <><p className="hint">Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</p><div style={{ marginTop: 12 }}><button className="btn primary" onClick={startEnroll} disabled={busy === 'mfa'}>Set up two-factor</button></div></>)}
            {enroll && (
              <form className="form" onSubmit={confirmEnroll}>
                <p className="hint">Scan this QR code with your authenticator app, then enter the code it shows.</p>
                <img src={enroll.qr} alt="QR code for authenticator app" style={{ width: 180, height: 180, background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }} />
                <p className="hint">Can't scan? Enter this key: <span className="mono">{enroll.secret}</span></p>
                <div className="field"><label htmlFor="c6">6-digit code</label><input className="input mono" id="c6" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
                <div style={{ display: 'flex', gap: 8 }}><button className="btn primary" disabled={code.length !== 6 || busy === 'mfa'}>Confirm</button><button type="button" className="btn" onClick={() => setEnroll(null)}>Cancel</button></div>
              </form>
            )}
          </div></div>
          <div className="card"><div className="card-h"><h3>Change password</h3></div><div className="card-b">
            <form className="form" onSubmit={changePw}>
              <div className="field"><label htmlFor="np">New password</label><input className="input" id="np" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /><p className="hint">At least 10 characters.</p></div>
              <div><button className="btn" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button></div>
            </form>
          </div></div>
        </div>
      </div>
    </>
  );
}
