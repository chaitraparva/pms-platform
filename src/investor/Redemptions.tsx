import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, must, rpc } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { refreshAll, useQuery } from '../lib/useQuery';
import { date, dateTime, EARLY_LABEL, money, pct, REDEMPTION_BADGE, today } from '../lib/format';
import { Badge, Drawer, Empty, ErrorNote, Field, InvBadge, Loading, Modal, PageHead, RedBadge, useAction } from '../ui/kit';
import type { Investment, Redemption, RedemptionEvent } from '../lib/types';
import { bal, loadPortfolio, Portfolio, unpaid } from './data';
import { useApproaching } from './parts';

type Mode = 'maturity' | 'early' | 'locked';
/** Same rule as the database: maturity from the request date; earlier only if the agreement permits it. */
function modeOf(i: Investment, t = today()): Mode {
  if (i.request_from_date && t >= i.request_from_date) return 'maturity';
  return i.early_redemption === 'not_permitted' ? 'locked' : 'early';
}
const eligible = (i: Investment) => ['active', 'matured'].includes(i.status) && !!i.start_date;
const DOT: Record<string, string> = { requested: 'a', under_review: 'b', approved: 'b', processing: 'a', completed: 'g', rejected: 'r', withdrawn: '' };

export function Redemptions() {
  const { profile } = useAuth();
  const approaching = useApproaching();
  const [sp, setSp] = useSearchParams();
  const [asking, setAsking] = useState<string | null>(null); // investment id or '' for "choose"
  const [viewing, setViewing] = useState<string | null>(null);
  const q = useQuery(async () => {
    const p = await loadPortfolio(profile!.id);
    const reqs = must(await supabase.from('redemption_requests').select('*').eq('investor_id', profile!.id).order('created_at', { ascending: false })) as Redemption[];
    const events = reqs.length ? must(await supabase.from('redemption_events').select('*').in('request_id', reqs.map(r => r.id)).order('at')) as RedemptionEvent[] : [];
    return { p, reqs, events };
  }, [profile?.id]);

  // ?request=INV-1001 opens the request flow for that investment
  const pre = sp.get('request');
  useEffect(() => {
    if (!pre || !q.data) return;
    const i = q.data.p.investments.find(x => x.code === pre);
    setAsking(i && eligible(i) ? i.id : '');
    setSp({}, { replace: true });
  }, [pre, q.data, setSp]);

  const inv = q.data?.p.investments || [];
  const open = inv.filter(eligible);
  const codes = Object.fromEntries(inv.map(i => [i.id, i.code]));
  const anyRequestable = open.some(i => modeOf(i) !== 'locked');
  const viewed = q.data?.reqs.find(r => r.id === viewing) || null;

  return (
    <>
      <PageHead crumbs={['Redemptions']} title="Redemptions" sub="Request the return of your principal once your lock-in allows it. You can follow every step here."
        actions={<button className="btn primary" disabled={!anyRequestable} title={anyRequestable ? '' : 'None of your investments can be redeemed yet'} onClick={() => setAsking('')}>Request redemption</button>} />
      {q.error && <ErrorNote msg={q.error} retry={q.reload} />}
      {q.loading && !q.data ? <Loading /> : q.data && (
        <>
          {open.length ? (
            <div className="grid g-1-1">
              {open.map(i => {
                const m = modeOf(i);
                return (
                  <div key={i.id} className="card">
                    <div className="card-h"><h3><span className="mono">{i.code}</span> · {i.plan_name}</h3><div className="r"><InvBadge i={i} approachingDays={approaching} /></div></div>
                    <div className="card-b" style={{ display: 'grid', gap: 12 }}>
                      <dl className="kv">
                        <dt>Principal</dt><dd>{money(i.principal)}</dd>
                        <dt>Maturity</dt><dd>{date(i.maturity_date)}</dd>
                        <dt>Request window opens</dt><dd>{date(i.request_from_date)}</dd>
                        <dt>Early redemption</dt><dd>{EARLY_LABEL[i.early_redemption] || i.early_redemption}</dd>
                      </dl>
                      {m === 'locked' && <div className="note lock">Locked. You can request redemption from <b>{date(i.request_from_date)}</b>.</div>}
                      {m === 'early' && <div className="note">You can request redemption at maturity from {date(i.request_from_date)}. An early request is possible now{Number(i.early_fee_pct) > 0 ? ` with a ${pct(i.early_fee_pct)} fee` : ''}{i.early_redemption === 'admin_discretion' ? ', subject to the company’s approval' : ''}.</div>}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn primary" disabled={m === 'locked'} onClick={() => setAsking(i.id)}>{m === 'early' ? 'Request early redemption' : 'Request redemption'}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card"><div className="card-b">
              <Empty title={inv.length ? 'No investments available for redemption' : 'You have no investments yet'}>
                {inv.length ? 'Investments that are active or matured, without an open request, appear here.' : 'Your advisor will record your investment once funds are received.'}
              </Empty>
            </div></div>
          )}

          <div className="card">
            <div className="card-h"><h3>My requests</h3></div>
            {q.data.reqs.length ? (
              <div className="tbl"><table>
                <thead><tr><th>Request</th><th>Investment</th><th>Type</th><th>Requested</th><th>Payable on</th><th className="n">Fee</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {q.data.reqs.map(r => (
                    <tr key={r.id} className="click" onClick={() => setViewing(r.id)}>
                      <td className="m">{r.code}</td><td className="m">{codes[r.investment_id] || '—'}</td>
                      <td>{r.type === 'early' ? 'Early' : 'At maturity'}</td><td>{date(r.created_at)}</td><td>{date(r.payable_on)}</td>
                      <td className="n">{Number(r.fee_amount) ? money(r.fee_amount) : '—'}</td><td><RedBadge s={r.status} /></td>
                      <td className="n"><button className="btn sm" onClick={() => setViewing(r.id)}>Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <div className="card-b"><Empty title="No redemption requests yet">When you request a redemption, you can follow each step here.</Empty></div>}
          </div>
        </>
      )}
      {asking !== null && q.data && <RequestDrawer p={q.data.p} initial={asking} onClose={() => setAsking(null)} />}
      {viewed && q.data && <RequestDetail r={viewed} code={codes[viewed.investment_id] || ''} principal={inv.find(i => i.id === viewed.investment_id)?.principal ?? 0}
        events={q.data.events.filter(e => e.request_id === viewed.id)} onClose={() => setViewing(null)} />}
    </>
  );
}

function RequestDrawer({ p, initial, onClose }: { p: Portfolio; initial: string; onClose: () => void }) {
  const { profile } = useAuth();
  const { busy, run } = useAction();
  const choices = p.investments.filter(eligible);
  const [id, setId] = useState(initial || (choices.find(i => modeOf(i) !== 'locked')?.id ?? ''));
  const [note, setNote] = useState('');
  const [ok, setOk] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const i = choices.find(x => x.id === id) || null;
  const m = i ? modeOf(i) : null;
  const t = today();
  const fee = i && m === 'early' ? Math.round(Number(i.principal) * Number(i.early_fee_pct)) / 100 : 0;
  const b = i ? bal(p, i.id) : null;
  const payable = i ? (m === 'early' ? t : (i.maturity_date! > t ? i.maturity_date! : t)) : '';
  const bank = [profile!.bank_name, profile!.bank_account_masked].filter(Boolean).join(' · ');

  const submit = async () => {
    if (!i) return;
    const code = await run(() => rpc<string>('investor_request_redemption', { p_investment: i.id, p_note: note.trim() }));
    if (code) { setDone(code); refreshAll(); }
  };

  if (done) return (
    <Drawer title="Redemption requested" onClose={onClose} foot={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="note ok"><b>Request {done} received.</b> We will notify you at each step. You can withdraw the request until it is approved.</div>
    </Drawer>
  );

  return (
    <Drawer title="Request redemption" sub="Your request is checked against your agreement before it is accepted." onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!i || m === 'locked' || !ok || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</button></>}>
      <div className="form">
        <Field label="Investment">
          <select className="input" value={id} onChange={e => { setId(e.target.value); setOk(false); }}>
            {!id && <option value="">Choose an investment</option>}
            {choices.map(c => <option key={c.id} value={c.id}>{c.code} · {c.plan_name} · {money(c.principal)}{modeOf(c) === 'locked' ? ' (locked)' : ''}</option>)}
          </select>
        </Field>
        {!choices.length && <Empty title="Nothing to redeem">None of your investments is active or matured without an open request.</Empty>}
        {i && m === 'locked' && (
          <div className="note lock"><b>Locked.</b> Your agreement does not allow redemption before the lock-in ends. You can request redemption from <b>{date(i.request_from_date)}</b>, payable at maturity on {date(i.maturity_date)}.</div>
        )}
        {i && m !== 'locked' && b && (
          <>
            {m === 'maturity'
              ? <div className="note ok"><b>Redemption at maturity.</b> The request window for {i.code} opened on {date(i.request_from_date)}.</div>
              : <div className="note"><b>Early redemption.</b> {i.code} is still within its lock-in until {date(i.maturity_date)}. {i.early_redemption === 'admin_discretion' ? 'The company reviews early requests and may decline them. ' : ''}{Number(i.early_fee_pct) > 0 ? `A fee of ${pct(i.early_fee_pct)} of principal applies.` : 'No fee applies under your agreement.'}</div>}
            <dl className="kv">
              <dt>Type</dt><dd>{m === 'early' ? 'Early redemption' : 'At maturity'}</dd>
              <dt>Principal</dt><dd>{money(i.principal)}</dd>
              {m === 'early' && <><dt>Early redemption fee ({pct(i.early_fee_pct)})</dt><dd className={fee ? 'neg' : ''}>{fee ? '−' + money(fee) : money(0)}</dd></>}
              <dt>Principal to be repaid</dt><dd><b>{money(Number(i.principal) - fee)}</b></dd>
              <dt>Returns accrued, not yet paid</dt><dd>{money(unpaid(b))}</dd>
              <dt>Payable on</dt><dd>{m === 'early' ? 'After approval' : 'On or after ' + date(payable)}</dd>
              <dt>Paid to</dt><dd>{bank || 'Your registered bank account'}</dd>
            </dl>
            <p className="hint">
              {m === 'early'
                ? 'Returns for the current part-month are added pro-rata up to the settlement date. Unpaid returns are settled together with your principal.'
                : 'Any returns still due up to maturity are settled together with your principal.'}
              {' '}Amounts are confirmed by the company when the redemption is settled.
            </p>
            <Field label="Note (optional)"><textarea className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Anything we should know" /></Field>
            <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
              <span>I confirm I want to redeem {i.code}{m === 'early' && fee ? `, and I accept the early redemption fee of ${money(fee)}` : ''}.</span></label>
          </>
        )}
      </div>
    </Drawer>
  );
}

function RequestDetail({ r, code, principal, events, onClose }: { r: Redemption; code: string; principal: number; events: RedemptionEvent[]; onClose: () => void }) {
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const canWithdraw = r.status === 'requested' || r.status === 'under_review';
  const withdraw = async () => {
    const res = await run(() => rpc('investor_withdraw_redemption', { p_request: r.id }).then(() => true), ['Request withdrawn', r.code + ' has been withdrawn.']);
    if (res) { setConfirm(false); refreshAll(); onClose(); }
  };
  return (
    <>
      <Drawer title={`Redemption ${r.code}`} sub={<>{code} · <RedBadge s={r.status} /></>} onClose={onClose}
        foot={<>{canWithdraw && <button className="btn danger" disabled={busy} onClick={() => setConfirm(true)}>Withdraw request</button>}<button className="btn" onClick={onClose}>Close</button></>}>
        <div style={{ display: 'grid', gap: 18 }}>
          <dl className="kv">
            <dt>Investment</dt><dd><Link className="mono" to={'/portal/investments/' + code} onClick={onClose}>{code}</Link></dd>
            <dt>Type</dt><dd>{r.type === 'early' ? 'Early redemption' : 'At maturity'}</dd>
            <dt>Principal</dt><dd>{money(principal)}</dd>
            {Number(r.fee_amount) > 0 && <><dt>Early redemption fee</dt><dd className="neg">−{money(r.fee_amount)}</dd></>}
            <dt>Payable on</dt><dd>{date(r.payable_on)}</dd>
            <dt>Requested</dt><dd>{dateTime(r.created_at)}</dd>
            {r.decision_reason && <><dt>Decision</dt><dd>{r.decision_reason}</dd></>}
            {r.payment_ref && <><dt>Payment reference</dt><dd className="mono">{r.payment_ref}</dd></>}
            {r.completed_at && <><dt>Settled</dt><dd>{dateTime(r.completed_at)}</dd></>}
          </dl>
          {r.note && <div><div className="hint">Your note</div><p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.note}</p></div>}
          <div>
            <h4 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Status timeline</h4>
            <div className="timeline">
              {events.map(e => (
                <div key={e.id}>
                  <span className={'d ' + (DOT[e.to_status] || '')} />
                  <div><b>{(REDEMPTION_BADGE[e.to_status] || [e.to_status])[0]}</b><span>{e.actor_name}{e.note ? ' · ' + e.note : ''}</span></div>
                  <time>{dateTime(e.at)}</time>
                </div>
              ))}
              {!events.length && <p className="hint">No status changes recorded yet.</p>}
            </div>
          </div>
          {canWithdraw && <p className="hint">You can withdraw this request until it is approved. Your investment then returns to its previous state.</p>}
          {r.status === 'approved' && <Badge cls="b-blue">Approved · payment will be made on or after {date(r.payable_on)}</Badge>}
        </div>
      </Drawer>
      {confirm && (
        <Modal title={`Withdraw ${r.code}?`} sub="Your investment stays invested under its existing terms. You can submit a new request later." onClose={() => setConfirm(false)}
          foot={<><button className="btn ghost" onClick={() => setConfirm(false)}>Keep request</button><button className="btn primary" disabled={busy} onClick={withdraw}>Withdraw request</button></>} />
      )}
    </>
  );
}
