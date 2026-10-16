// Vercel serverless function: create investor or admin logins.
// Runs on the server with the service-role key; the browser never sees that key.
// The caller must be signed in as an active Super Admin (checked here AND by the database).
import { createClient } from '@supabase/supabase-js';

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See README step 4.' });

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. who is calling?
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who.user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  const { data: caller } = await admin.from('profiles').select('id, role, account_status, full_name').eq('id', who.user.id).maybeSingle();
  if (!caller || caller.role !== 'super_admin' || caller.account_status !== 'active') return res.status(403).json({ error: 'Only an active Super Admin can create users.' });

  // 2. validate input
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as Record<string, unknown>;
  const email = str(b.email, 254).toLowerCase();
  const full_name = str(b.full_name, 120);
  const role = b.role === 'super_admin' ? 'super_admin' : 'investor';
  const mode = b.mode === 'password' ? 'password' : 'invite';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!full_name) return res.status(400).json({ error: 'Enter the full name.' });
  if (mode === 'password' && password.length < 10) return res.status(400).json({ error: 'Temporary password must be at least 10 characters.' });

  // 3. create the login (the database trigger creates the profile as an investor)
  const site = process.env.SITE_URL || '';
  const created = mode === 'invite'
    ? await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo: site ? site.replace(/\/$/, '') + '/set-password' : undefined })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (created.error || !created.data.user) {
    const m = created.error?.message || 'Could not create the user.';
    return res.status(/already|registered|exists/i.test(m) ? 409 : 400).json({ error: /already|registered|exists/i.test(m) ? 'A user with this email already exists.' : m });
  }
  const id = created.data.user.id;

  // 4. fill in the profile; promote to admin only here, never from user metadata
  const patch: Record<string, unknown> = {
    full_name,
    phone: str(b.phone, 40), city: str(b.city, 80), address: str(b.address, 400),
    id_number_masked: str(b.id_number_masked, 40), bank_name: str(b.bank_name, 120),
    bank_account_masked: str(b.bank_account_masked, 40), bank_ifsc: str(b.bank_ifsc, 40), updated_at: new Date().toISOString()
  };
  if (role === 'super_admin') {
    const { data: seq } = await admin.rpc('pms_next_admin_code');
    Object.assign(patch, { role: 'super_admin', kyc_status: 'verified', code: seq || undefined });
  }
  const { data: prof, error: pErr } = await admin.from('profiles').update(patch).eq('id', id).select('id, code').single();
  if (pErr) return res.status(500).json({ error: 'Login created but the profile could not be updated: ' + pErr.message });

  await admin.from('audit_logs').insert({
    actor_id: caller.id, actor_name: caller.full_name || 'Admin', action: role === 'super_admin' ? 'admin.create' : 'investor.create',
    entity_type: 'profile', entity_id: id, entity_label: prof.code || email, reason: mode === 'invite' ? 'Invitation emailed' : 'Created with temporary password',
    after: { email, full_name, role }
  });

  return res.status(200).json({ id, code: prof.code });
}
