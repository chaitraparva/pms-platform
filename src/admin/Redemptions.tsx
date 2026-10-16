import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, rpc, fetchAll, must, friendly } from '../lib/supabase';
import { useQuery, refreshAll } from '../lib/useQuery';
import { useAuth } from '../lib/auth';
import { money, moneyShort, date, dateTime, rate, pct, today, addMonths, daysBetween, EARLY_LABEL, REDEMPTION_BADGE } from '../lib/format';
import type { Balance, Investment, Redemption, RedemptionEvent, RedemptionStatus } from '../lib/types';
import { Badge, RedBadge, Kpi, ErrorNote, Loading, PageHead, Drawer, Field, Empty, useAction } from '../ui/kit';
import { DataTable, Col } from '../ui/DataTable';

type Person = { id: string; code: string | null; full_name: string; email: string; bank_name: string; bank_account_masked: string; bank_ifsc: string };
interface Row extends Redemption { inv?: Investment; investor?: Person }

const OPEN: RedemptionStatus[] = ['requested', 'under_review', 'approved', 'processing'];
const nameOf = (p?: Person) => (p ? p.full_name || p.email : '—');

async function load() {
  const [reqs, invs, people] = await Promise.all([
    fetchAll<Redemption>((a, b) => supabase.from('redemption_requests').select('*').order('created_at', { ascending: false }).range(a, b)),
    fetchAll<Investment>((a, b) => supabase.from('investments').select('*').range(a, b)),
    fetchAll<Person>((a, b) => supabase.from('profiles').select('id, code, full_name, email, bank_name, bank_account_masked, bank_ifsc').range(a, b))
  ]);
  const invBy = new Map(invs.map(i => [i.id, i]));
  const pplBy = new Map(people.map(p => [p.id, p]));
  return reqs.map<Row>(r => ({ ...r, inv: invBy.get(r.investment_id), investor: pplBy.get(r.investor_id) }));
}

export function Redemptions() {
  const { code } = useParams();
  const nav = useNavigate();
  const q = useQuery(load, []);
  const rows = q.data || [];
  const open = code ? rows.find(r => r.code === code) : undefined;

  const group = (s: RedemptionStatus[]) => {
    const xs = rows.filter(r => s.includes(r.status));
    return { n: xs.length, sum: xs.reduce((t, r) => t + Number(r.inv?.principal || 0), 0) };
  };
  const g1 = group(['requested', 'under_review']), g2 = group(['approved', 'processing']), g3 = group(['completed']), g4 = group(['rejected']);

  const cols: Col<Row>[] = [
    { h: 'Request', m: true, v: r => r.code },
    { h: 'Investor', v: r => nameOf(r.investor), r: r => <>{nameOf(r.investor)}<span className="sub">{r.investor?.code}</span></> },
    { h: 'Investment', v: r => r.inv?.code, r: r => r.inv ? <><span className="mono">{r.inv.code}</span><span className="sub">{r.inv.plan_name} · {r.inv.lockin_months} months</span></> : '—' },
    { h: 'Type', v: r => r.type, r: r => r.type === 'early' ? <Badge cls="b-red">Early</Badge> : <Badge cls="b-grey">At maturity</Badge> },
    { h: 'Principal', n: true, v: r => Number(r.inv?.principal || 0), r: r => money(r.inv?.principal) },
    { h: 'Maturity', v: r => r.inv?.maturity_date, r: r => date(r.inv?.maturity_date) },
    { h: 'Requested', v: r => r.created_at, r: r => date(r.created_at) },
    { h: 'Payable', v: r => r.payable_on, r: r => date(r.payable_on) },
    { h: 'Status', v: r => r.status, r: r => <RedBadge s={r.status} /> },
    { h: '', r: r => <Link className="btn sm" to={`/admin/redemptions/${r.code}`}>{OPEN.includes(r.status) ? 'Review' : 'View'}</Link> }
  ];

  return (
    <>
      <PageHead crumbs={code ? ['Redemptions', code] : ['Redemptions']} title="Redemptions"
        sub="Each request is checked against the investment's contractual lock-in when it is made. Only one open request is allowed per investment." />
      {q.error && <ErrorNote msg={q.error} retry={q.reload} />}
      {!q.data && !q.error ? <Loading /> : q.data && (
        <>
          <div className="kpis k4">
            <Kpi label="Awaiting review" value={g1.n} sub={moneyShort(g1.sum) + ' principal'} subCls={g1.n ? 'warn' : ''} />
            <Kpi label="Approved / processing" value={g2.n} sub={moneyShort(g2.sum) + ' principal'} />
            <Kpi label="Completed" value={g3.n} sub={moneyShort(g3.sum) + ' settled'} />
            <Kpi label="Rejected" value={g4.n} sub={moneyShort(g4.sum) + ' principal'} />
          </div>
          <DataTable rows={rows} cols={cols} rowKey={r => r.id} href={r => `/admin/redemptions/${r.code}`}
            searchPh="Search request, investor, investment" text={r => `${r.investor?.email || ''} ${r.inv?.plan_name || ''}`}
            filters={[['Open', 'open'], ['Completed', 'completed'], ['Rejected', 'rejected'], ['Withdrawn', 'withdrawn'], ['All', 'all']]}
            filterFn={(r, f) => f === 'all' || r.status === f || (f === 'open' && OPEN.includes(r.status))}
            sort={6} dir={-1}
            emptyTitle={rows.length ? 'No matching requests' : 'No redemption requests yet'}
            empty={rows.length ? 'No requests match this filter. Try "All".' : 'Investors request redemption from their portal once the request window opens (or earlier, if their contract allows early redemption).'} />
        </>
      )}
      {code && q.data && (open
        ? <RedemptionDrawer r={open} onClose={() => nav('/admin/redemptions')} />
        : <Drawer title={code} onClose={() => nav('/admin/redemptions')} foot={<button className="btn" onClick={() => nav('/admin/redemptions')}>Close</button>}>
          <Empty title="Request not found">There is no redemption request with this reference.</Empty>
        </Drawer>)}
    </>
  );
}

function RedemptionDrawer({ r, onClose }: { r: Row; onClose: () => void }) {
  const { settings, profile } = useAuth();
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<{ note?: string; ref?: string }>({});
  useEffect(() => { setNote(''); setRef(''); setErr({}); }, [r.id, r.status]);

  const extra = useQuery(async () => {
    const [ev, bal] = await Promise.all([
      supabase.from('redemption_events').select('*').eq('request_id', r.id).order('at', { ascending: false }),
      supabase.from('investment_balances').select('*').eq('investment_id', r.investment_id).maybeSingle()
    ]);
    if (bal.error) throw new Error(friendly(bal.error.message));
    return { events: must(ev) as RedemptionEvent[], bal: (bal.data || null) as Balance | null };
  }, [r.id, r.status]);

  const i = r.inv;
  const t = today();
  const principal = Number(i?.principal || 0);
  const fee = Number(r.fee_amount || 0);
  const b = extra.data?.bal;
  const unpaid = b ? Number(b.unapproved) + Number(b.approved) + Number(b.processing) : 0;
  const net = principal - fee + unpaid;
  const early = r.type === 'early';
  const done = !OPEN.includes(r.status);

  // pro-rata stub for an early exit mid-period (the database calculates it at settlement)
  let stub = 0, stubDays = 0, stubDip = 0;
  if (early && i?.start_date && i.maturity_date && t < i.maturity_date && b) {
    const s = addMonths(i.start_date, b.periods_accrued), e = addMonths(i.start_date, b.periods_accrued + 1);
    stubDays = Math.max(0, daysBetween(s, t)); stubDip = daysBetween(s, e);
    if (stubDays > 0 && stubDays < stubDip) stub = Math.round((Number(i.monthly_return) * stubDays / stubDip) * 100) / 100;
  }
  const notYetPayable = r.type === 'maturity' && t < r.payable_on;
  const approver = extra.data?.events.find(e => e.to_status === 'approved');
  const selfApproved = !!profile && approver?.actor_id === profile.id;

  type Step = { to: RedemptionStatus; label: string; cls: string; needNote: boolean; needRef?: boolean };
  const steps: Step[] = r.status === 'requested'
    ? [{ to: 'rejected', label: 'Reject', cls: 'danger', needNote: true }, { to: 'under_review', label: 'Start review', cls: '', needNote: false }, { to: 'approved', label: 'Approve', cls: 'primary', needNote: true }]
    : r.status === 'under_review' ? [{ to: 'rejected', label: 'Reject', cls: 'danger', needNote: true }, { to: 'approved', label: 'Approve', cls: 'primary', needNote: true }]
      : r.status === 'approved' ? [{ to: 'processing', label: 'Mark processing', cls: 'primary', needNote: false }]
        : r.status === 'processing' ? [{ to: 'completed', label: 'Complete settlement', cls: 'primary', needNote: true, needRef: true }] : [];

  const go = async (s: Step) => {
    const e: { note?: string; ref?: string } = {};
    if (s.needNote && !note.trim()) e.note = s.to === 'completed' ? 'Add a settlement note.' : 'A reason is required. Approvals and rejections are audited and shown to the investor.';
    if (s.needRef && !ref.trim()) e.ref = 'Enter the bank reference for the settlement.';
    setErr(e);
    if (e.note || e.ref) return;
    const ok = await run(() => rpc('admin_redemption_transition', { p_request: r.id, p_to: s.to, p_note: note.trim(), p_ref: s.needRef ? ref.trim() : null }).then(() => true),
      [`Redemption ${(REDEMPTION_BADGE[s.to] || [s.to])[0].toLowerCase()}`, `${r.code} · investor notified`]);
    if (ok) refreshAll();
  };

  const dot = (s: RedemptionStatus) => (s === 'completed' ? 'g' : s === 'rejected' ? 'r' : s === 'withdrawn' ? '' : s === 'requested' ? 'a' : 'b');

  return (
    <Drawer title={`${r.code} · ${nameOf(r.investor)}`} sub={<>{i ? `${i.code} · ${i.plan_name} v${i.plan_version}` : ''} · <RedBadge s={r.status} /></>} onClose={onClose}
      foot={steps.length ? <>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {steps.map(s => <button key={s.to} className={'btn ' + s.cls} disabled={busy || (s.to === 'completed' && notYetPayable)} onClick={() => go(s)}>{s.label}</button>)}
      </> : <button className="btn" onClick={onClose}>Close</button>}>
      <div style={{ display: 'grid', gap: 16 }}>
        <dl className="kv">
          <dt>Investor</dt><dd>{r.investor?.code ? <Link to={`/admin/investors/${r.investor.code}`}>{nameOf(r.investor)}</Link> : nameOf(r.investor)}</dd>
          <dt>Investment</dt><dd>{i ? <Link className="mono" to={`/admin/investments/${i.code}`}>{i.code}</Link> : '—'}</dd>
          <dt>Type</dt><dd>{early ? <Badge cls="b-red">Early redemption</Badge> : <Badge cls="b-grey">At maturity</Badge>}</dd>
          <dt>Requested on</dt><dd>{dateTime(r.created_at)}</dd>
          <dt>Payable on</dt><dd>{date(r.payable_on)}</dd>
          <dt>Bank account</dt><dd className="mono">{r.investor?.bank_name || r.investor?.bank_account_masked ? `${r.investor?.bank_name || ''} ${r.investor?.bank_account_masked || ''} ${r.investor?.bank_ifsc || ''}`.trim() : 'Not on file'}</dd>
        </dl>

        {i && (
          <div className="card"><div className="card-h"><h3>Investment terms</h3><div className="r mono">{i.plan_name} v{i.plan_version}</div></div><div className="card-b">
            <dl className="kv">
              <dt>Monthly ROI</dt><dd>{rate(i.monthly_rate)}</dd>
              <dt>Monthly return</dt><dd>{money(i.monthly_return)}</dd>
              <dt>Start date</dt><dd>{date(i.start_date)}</dd>
              <dt>Lock-in</dt><dd>{i.lockin_months} months</dd>
              <dt>Maturity</dt><dd>{date(i.maturity_date)}</dd>
              <dt>Request window opens</dt><dd>{date(i.request_from_date)}</dd>
              <dt>Early redemption</dt><dd>{EARLY_LABEL[i.early_redemption] || i.early_redemption}{i.early_redemption === 'permitted_with_fee' ? ` (${pct(i.early_fee_pct)} of principal)` : ''}</dd>
            </dl>
          </div></div>
        )}

        {early
          ? <div className="note">This is an <b>early redemption</b>: it was requested before the request window opened on {date(i?.request_from_date)}. The contract allows it ({(EARLY_LABEL[i?.early_redemption || ''] || '').toLowerCase()}){fee > 0 ? `, with a fee of ${money(fee)}` : ''}. On completion a pro-rata return is added for the part-month since the last anniversary.</div>
          : <div className="note info">This is a <b>maturity redemption</b>: the request window opened on {date(i?.request_from_date)}. Maturity redemptions can only be completed on or after the payable date ({date(r.payable_on)}).</div>}

        <div className="card"><div className="card-h"><h3>{done && r.status === 'completed' ? 'Settlement' : 'Settlement (if completed now)'}</h3></div><div className="card-b">
          {extra.error ? <ErrorNote msg={extra.error} retry={extra.reload} /> : !extra.data ? <Loading rows={2} /> : (
            <dl className="kv">
              <dt>Principal</dt><dd>{money(principal)}</dd>
              <dt>Early-redemption fee</dt><dd className={fee ? 'neg' : ''}>{fee ? money(-fee) : money(0)}</dd>
              {r.status === 'completed' ? <>
                <dt>Principal paid</dt><dd>{money(principal - fee)}</dd>
                <dt>Bank reference</dt><dd className="mono">{r.payment_ref || '—'}</dd>
                <dt>Completed</dt><dd>{dateTime(r.completed_at)}</dd>
              </> : <>
                <dt>Unpaid returns to settle</dt><dd>{money(unpaid)}</dd>
                <dt>Net payable</dt><dd><b>{money(net)}</b></dd>
                {stub > 0 && !done && <><dt>Plus pro-rata return (estimate)</dt><dd>{money(stub)}<span className="hint" style={{ display: 'block' }}>{stubDays} of {stubDip} days, if settled today</span></dd></>}
              </>}
            </dl>
          )}
          {!done && <p className="hint" style={{ marginTop: 10 }}>Net payable = principal − fee + unpaid returns. Every unpaid return is marked paid with the settlement's bank reference when the redemption is completed.</p>}
        </div></div>

        {r.note && <Field label="Investor note"><div className="input" style={{ background: 'var(--surface-2)' }}>{r.note}</div></Field>}
        {r.decision_reason && <div className="note"><b>Decision:</b> {r.decision_reason}</div>}

        {steps.length > 0 && (
          <div className="form">
            <Field label={steps.some(s => s.needNote) ? 'Reason / note (required to approve, reject or complete)' : 'Note (optional)'} err={err.note}>
              <textarea className={'input' + (err.note ? ' bad' : '')} rows={2} value={note} onChange={e => { setNote(e.target.value); setErr({ ...err, note: undefined }); }}
                placeholder={r.status === 'processing' ? 'e.g. Principal and returns transferred' : 'e.g. Bank details verified against KYC'} />
            </Field>
            {r.status === 'processing' && (
              <Field label="Bank reference (required)" err={err.ref}>
                <input className={'input mono' + (err.ref ? ' bad' : '')} value={ref} onChange={e => { setRef(e.target.value); setErr({ ...err, ref: undefined }); }} placeholder="UTR / transfer reference" />
              </Field>
            )}
            {r.status === 'processing' && notYetPayable && <div className="note">This maturity redemption is payable on <b>{date(r.payable_on)}</b>. It can be completed from that date.</div>}
            {r.status === 'processing' && settings?.four_eyes && (
              <div className="note">{selfApproved
                ? <><b>Another Super Admin must confirm the settlement.</b> You approved this request, so the database will refuse your confirmation while another active Super Admin exists.</>
                : <>Four-eyes is on: the admin who approved this request cannot also complete the settlement.</>}</div>
            )}
          </div>
        )}

        <div>
          <h4 style={{ fontSize: 13, marginBottom: 10 }}>History</h4>
          {!extra.data ? <Loading rows={2} /> : extra.data.events.length ? (
            <div className="timeline">
              {extra.data.events.map(e => (
                <div key={e.id}>
                  <span className={'d ' + dot(e.to_status)} />
                  <div><b>{(REDEMPTION_BADGE[e.to_status] || [e.to_status])[0]}</b><span>{[e.actor_name, e.note].filter(Boolean).join(' · ')}</span></div>
                  <time>{dateTime(e.at)}</time>
                </div>
              ))}
            </div>
          ) : <p className="hint">No events recorded.</p>}
        </div>
      </div>
    </Drawer>
  );
}
