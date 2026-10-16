import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, must, rpc, fetchAll } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { refreshAll, useQuery } from '../lib/useQuery';
import { date, dateTime } from '../lib/format';
import { Badge, Drawer, Empty, ErrorNote, Loading, PageHead } from '../ui/kit';
import type { Announcement, Notification } from '../lib/types';
import { Prose } from './parts';

/** Unread = the investor's 'announcement' notification for it has not been read. */
export function Announcements() {
  const { profile, settings } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery(async () => {
    const [anns, ns] = await Promise.all([
      fetchAll<Announcement>((a, b) => supabase.from('announcements').select('*').eq('status', 'published').order('published_at', { ascending: false }).range(a, b)),
      supabase.from('notifications').select('*').eq('user_id', profile!.id).eq('kind', 'announcement')
    ]);
    const notes = must(ns) as Notification[];
    return { anns, byAnn: Object.fromEntries(notes.filter(n => n.source_id).map(n => [n.source_id!, n])) as Record<string, Notification> };
  }, [profile?.id]);

  const open = async (a: Announcement) => {
    setOpenId(a.id);
    const n = q.data?.byAnn[a.id];
    if (n && !n.read_at) {
      try { await rpc('mark_notifications_read', { p_ids: [n.id] }); refreshAll(); } catch { /* reading still works; the badge stays until next time */ }
    }
  };

  // ?open=<announcement id> (from the overview) opens it directly
  const pre = sp.get('open');
  useEffect(() => {
    if (!pre || !q.data) return;
    const a = q.data.anns.find(x => x.id === pre);
    if (a) open(a);
    setSp({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre, q.data]);

  const anns = q.data?.anns || [];
  const unread = (a: Announcement) => { const n = q.data?.byAnn[a.id]; return !!n && !n.read_at; };
  const nUnread = anns.filter(unread).length;
  const current = anns.find(a => a.id === openId) || null;
  const markAll = async () => {
    const ids = anns.filter(unread).map(a => q.data!.byAnn[a.id].id);
    if (!ids.length) return;
    try { await rpc('mark_notifications_read', { p_ids: ids }); } finally { refreshAll(); }
  };

  return (
    <>
      <PageHead crumbs={['Announcements']} title="Announcements"
        sub={`Notices from ${settings?.company_name || 'the company'}. Announcements are informational and don't change your agreement.${nUnread ? ` ${nUnread} unread.` : ''}`}
        actions={nUnread ? <button className="btn" onClick={markAll}>Mark all as read</button> : undefined} />
      {q.error && <ErrorNote msg={q.error} retry={q.reload} />}
      {q.loading && !q.data ? <Loading /> : q.data && !anns.length ? (
        <div className="card"><div className="card-b"><Empty title="No announcements yet">Notices from the company will appear here.</Empty></div></div>
      ) : anns.map(a => {
        const u = unread(a);
        return (
          <div key={a.id} className="card" style={{ cursor: 'pointer', ...(u ? { borderColor: 'var(--blue)' } : {}) }} onClick={() => open(a)}
            role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(a); } }}>
            <div className="card-b" style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {u && <span className="dot unread" aria-label="Unread" />}
                <h3 style={{ fontSize: 16, fontWeight: u ? 650 : 600 }}>{a.title}</h3>
                <Badge cls="b-blue">{a.category}</Badge>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{date(a.published_at)}</span>
              </div>
              <p style={{ color: 'var(--fg-2)', maxWidth: '80ch', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.body}</p>
              <div><span className="hint">{u ? 'Unread · ' : ''}Read more</span></div>
            </div>
          </div>
        );
      })}
      {current && (
        <Drawer title={current.title} sub={<>{current.category} · {dateTime(current.published_at)}</>} onClose={() => setOpenId(null)}
          foot={<button className="btn primary" onClick={() => setOpenId(null)}>Close</button>}>
          <Prose text={current.body} empty="This announcement has no further details." />
        </Drawer>
      )}
    </>
  );
}
