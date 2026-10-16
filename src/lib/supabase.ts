import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anon);

// Only the public anon key is used in the browser. Every table is protected by
// row-level security and every change goes through checked database functions.
export const supabase = createClient(url || 'http://localhost', anon || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/** Call a database function and throw a readable error if it fails. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
}

export function friendly(msg: string): string {
  if (/JWT|not signed in/i.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/permission denied/i.test(msg)) return 'You do not have permission to do this.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network problem. Check your connection and try again.';
  return msg.replace(/^ERROR:\s*/, '');
}

/** Throw on a Supabase query error; return the data otherwise. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendly(res.error.message));
  return (res.data ?? ([] as unknown)) as T;
}

/**
 * Fetch every row of a query in pages of 1000 (Supabase returns at most 1000 rows per request).
 * Pass a factory that builds the query for a given range, e.g.
 *   fetchAll<Payout>((a, b) => supabase.from('payouts').select('*').order('due_date').range(a, b))
 */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, cap = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(friendly(error.message));
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
