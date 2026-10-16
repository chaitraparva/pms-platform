import { supabase, friendly } from './supabase';
import type { DocumentRow } from './types';

const safe = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-120);

/** Admin: upload a file into the investor's private folder and register it. */
export async function uploadDocument(opts: { ownerId: string; investmentId?: string | null; kind: DocumentRow['kind']; title: string; file: File; visible: boolean }): Promise<DocumentRow> {
  if (opts.file.size > 20 * 1024 * 1024) throw new Error('Files must be 20 MB or smaller.');
  const path = `${opts.ownerId}/${crypto.randomUUID()}-${safe(opts.file.name)}`;
  const up = await supabase.storage.from('documents').upload(path, opts.file, { contentType: opts.file.type || 'application/octet-stream', upsert: false });
  if (up.error) throw new Error(friendly(up.error.message));
  const { data, error } = await supabase.from('documents').insert({
    owner_id: opts.ownerId, investment_id: opts.investmentId || null, kind: opts.kind, title: opts.title || opts.file.name,
    storage_path: path, mime: opts.file.type, size_bytes: opts.file.size, visible_to_investor: opts.visible,
    uploaded_by: (await supabase.auth.getUser()).data.user?.id
  }).select('*').single();
  if (error) { await supabase.storage.from('documents').remove([path]); throw new Error(friendly(error.message)); }
  return data as DocumentRow;
}

/** Opens a short-lived signed link (60 seconds) to a private document. */
export async function openDocument(path: string): Promise<void> {
  const w = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
  if (error || !data) { w?.close(); throw new Error(friendly(error?.message || 'Document not available.')); }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

export async function deleteDocument(d: DocumentRow): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', d.id);
  if (error) throw new Error(friendly(error.message));
  await supabase.storage.from('documents').remove([d.storage_path]);
}

/** Admin: upload the company logo to the public branding bucket; returns its public URL. */
export async function uploadLogo(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, SVG or JPG).');
  if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.');
  const path = `logo-${Date.now()}-${safe(file.name)}`;
  const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(friendly(error.message));
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
}
