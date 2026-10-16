import { supabase } from './supabase';

export interface NewUser {
  email: string;
  full_name: string;
  role: 'investor' | 'super_admin';
  /** invite: emails a link to choose a password. password: sets a temporary password now. */
  mode: 'invite' | 'password';
  password?: string;
  phone?: string;
  city?: string;
  address?: string;
  id_number_masked?: string;
  bank_name?: string;
  bank_account_masked?: string;
  bank_ifsc?: string;
}

/** Creates a login through the server function (it holds the service key, never the browser). */
export async function createUser(u: NewUser): Promise<{ id: string; code: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(u)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Could not create the user (HTTP ${res.status}).`);
  return body as { id: string; code: string };
}

/** Re-sends an invitation or password-reset email to an existing user. */
export async function resendAccess(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/set-password' });
  if (error) throw new Error(error.message);
}
