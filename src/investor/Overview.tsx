import { Link, useNavigate } from 'react-router-dom';
import { supabase, must } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { date, dateShort, LEDGER_TYPE, money, moneyShort, rate, today } from '../lib/format';
import { Empty, ErrorNote, Kpi, LedgerBadge, Loading, PageHead } from '../ui/kit';
import { BarChart, monthLabel } from '../ui/Charts';
import { Icon } from '../ui/Icon';
import type { Announcement, LedgerEntry } from '../lib/types';
import { addDays, bal, codeMap, daysLeft, isLive, lastMonths, loadPortfolio, nextAccrual, projectedRemaining, unpaid } from './data';
import { Tracker } from './parts';

export function Overview() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const id = profile!.id;
  const q = useQuery(async () => {
    const [p, led, ann] = await Promise.all([
      loadPortfolio(id),
      supabase.from('ledger_entries').select('*').eq('investor_id', id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(6),
      supabase.from('announcements').select('id,code,title,category,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(4)
    ]);
    return { p, ledger: must(led) as LedgerEntry[], anns: must(ann) as Pick<Announcement, 'id' | 'code' | 'title' | 'category' | 'published_at'>[] };
  }, [id]);

  const first = (profile!.full_name || '').trim().split(/\s+/)[0] || 'there';
  const t = today();

  if (q.loading && !q.data) return <><PageHead crumbs={['Overview']} title={`Welcome back, ${first}`} /><Loading /></>;
  if (q.error || !q.data) return <><PageHead crumbs={['Overview']} title={`Welcome back, ${first}`} /><ErrorNote msg={q.error || 'Could not load your portfolio.'} retry={q.reload} /></>;

  const { p, ledger, anns } = q.data;
  const inv = p.investments;
  const live = inv.filter(isLive);
  const earning = live.filter(i => i.status === 'active');
  const principal = live.reduce((s, i) => s + Number(i.principal), 0);
  const monthly = earning.reduce((s, i) => s + Number(i.monthly_return), 0);
  const paid = inv.reduce((s, i) => s + Number(bal(p, i.id).paid), 0);
  const notPaid = inv.reduce((s, i) => s + unpaid(bal(p, i.id)), 0);
  const processing = inv.reduce((s, i) => s + Number(bal(p, i.id).processing), 0);
  const projected = earning.reduce((s, i) => s + projectedRemaining(i, bal(p, i.id)), 0);

  // Next payout: earliest of a payout already due (real row) or the next scheduled accrual + payout lag (projection).
  type Cand = { date: string; amount: number; scheduled: boolean };
  const cands: Cand[] = [
    ...p.payouts.filter(x => ['accrued', 'approved', 'processing', 'failed'].includes(x.status)).map(x => ({ date: x.due_date, amount: Number(x.amount), scheduled: false })),
    ...earning.map(i => { const n = nextAccrual(i, bal(p, i.id)); return n ? { date: addDays(n.date, i.payout_lag_days), amount: Number(i.monthly_return), scheduled: true } : null; }).filter((x): x is Cand => !!x)
  ].sort((a, b) => a.date.localeCompare(b.date));
  const nextDate = cands[0]?.date;
  const nextGroup = cands.filter(c => c.date === nextDate);
  const nextAmt = nextGroup.reduce((s, c) => s + c.amount, 0);
  const nextScheduled = nextGroup.some(c => c.scheduled);

  const nextMat = live.filter(i => i.maturity_date && i.maturity_date >= t).sort((a, b) => a.maturity_date!.localeCompare(b.maturity_date!))[0];
  const codes = codeMap(inv);

  // Monthly returns by accrual month, split by payout status (last 7 months).
  const months = lastMonths(7);
  const payByAcc = Object.fromEntries(p.payouts.map(x => [x.accrual_id, x.status]));
  const sumBy = (st: string[]) => months.map(m => p.accruals.filter(a => a.kind !== 'reversal' && a.accrual_date.slice(0, 7) === m && st.includes(payByAcc[a.id] || '')).reduce((s, a) => s + Number(a.amount), 0));

  return (
    <>
      <PageHead crumbs={['Overview']} title={`Welcome back, ${first}`} sub={`Figures as of ${date(t)}. Returns are simple interest on your original principal.`}
        actions={<button className="btn" onClick={() => nav('/portal/statement')}><Icon name="download" />Account statement</button>} />

      {!inv.length ? (
        <div className="card"><div className="card-b">
          <Empty title="You have no investments yet">Your advisor will record your investment once funds are received. You will be notified here as soon as it is active.</Empty>
        </div></div>
      ) : (
        <>
          <div className="kpis k4">
            <Kpi label="Total principal invested" value={money(principal)} sub={`${live.length} live investment${live.length === 1 ? '' : 's'}`} tip="The amount you invested in investments that are live today. It does not include returns." />
            <Kpi label="Monthly return" value={money(monthly)} sub={`Across ${earning.length} earning investment${earning.length === 1 ? '' : 's'}`} tip="The sum of the fixed monthly return in each agreement that is still earning." />
            <Kpi label="Returns received" value={money(paid)} cls="pos" sub="Confirmed payments only" tip="Returns the company has paid and confirmed with a bank reference." />
            <Kpi label="Accrued, not yet paid" value={money(notPaid)} sub={processing ? money(processing) + ' being processed' : 'Awaiting payout'} subCls="warn" tip="Returns earned for completed months that have not been confirmed as paid yet. This is not money in your account." />
            <Kpi label="Next expected payout" value={nextDate ? money(nextAmt) : '—'} sub={nextDate ? (nextScheduled ? 'Scheduled · ' : 'Due · ') + date(nextDate) : 'No payouts scheduled'}
              tip="A payout already due, or the next scheduled month from your contract terms. Scheduled amounts become an accrual on the accrual date and are paid after confirmation." />
            <Kpi label="Next maturity" value={nextMat ? date(nextMat.maturity_date) : '—'} sub={nextMat ? `${nextMat.code} · ${daysLeft(nextMat)} days` : 'No upcoming maturity'} tip="The earliest maturity date across your live investments." />
            <Kpi label="Live investments" value={String(live.length)} sub={`${inv.length} in total`} />
            <Kpi label="Projected remaining returns" value={money(projected)} sub="Projected · not guaranteed" subCls="warn" tip="Remaining monthly returns until maturity at your contract rate, assuming nothing changes. This is an estimate." />
          </div>

          <div className="inv-cards">
            {inv.filter(i => i.status !== 'cancelled').map(i => {
              const b = bal(p, i.id);
              const n = nextAccrual(i, b);
              return (
                <div key={i.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav('/portal/investments/' + i.code)}>
                  <div className="card-b" style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{money(i.principal)}</div>
                      <div className="hint">{rate(i.monthly_rate)} · {i.lockin_months}-month lock-in</div>
                    </div>
                    <Tracker i={i} compact />
                    <dl className="kv">
                      <dt>Monthly return</dt><dd>{money(i.monthly_return)}</dd>
                      <dt>Accrued</dt><dd>{money(b.accrued)}</dd>
                      <dt>Received</dt><dd className="pos">{money(b.paid)}</dd>
                      <dt>Next accrual</dt><dd>{n ? <>{date(n.date)} <span className="muted">· scheduled</span></> : '—'}</dd>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid g-2-1">
            <div className="card">
              <div className="card-h"><h3>Monthly returns</h3>
                <div className="r legend"><span><i style={{ background: 'var(--green)' }} />Paid</span><span><i style={{ background: 'var(--amber)' }} />Processing / approved</span><span><i style={{ background: 'var(--chart-4)' }} />Accrued</span></div>
              </div>
              <div className="card-b">
                {p.accruals.length ? (
                  <BarChart labels={months.map(monthLabel)} label="My monthly returns by accrual month" fmt={moneyShort} tipFmt={money} series={[
                    { name: 'Paid', color: 'var(--green)', values: sumBy(['paid']) },
                    { name: 'Processing / approved', color: 'var(--amber)', values: sumBy(['processing', 'approved']) },
                    { name: 'Accrued', color: 'var(--chart-4)', values: sumBy(['accrued', 'failed']) }
                  ]} />
                ) : <Empty title="No returns yet">Your first monthly return accrues one month after your start date.</Empty>}
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>Latest announcements</h3><div className="r"><Link to="/portal/announcements">All</Link></div></div>
              <div className="card-b list">
                {anns.map(a => (
                  <div key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav('/portal/announcements?open=' + a.id)}>
                    <Icon name="announce" />
                    <div className="grow"><b>{a.title}</b><span>{a.category} · {dateShort(a.published_at)}</span></div>
                  </div>
                ))}
                {!anns.length && <Empty title="No announcements yet">Notices from the company will appear here.</Empty>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Recent activity</h3><div className="r"><Link to="/portal/transactions">All transactions</Link></div></div>
            <div className="tbl">
              {ledger.length ? (
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Investment</th><th className="n">Amount</th><th>Status</th><th>Reference</th></tr></thead>
                  <tbody>
                    {ledger.map(l => (
                      <tr key={l.id}>
                        <td>{date(l.occurred_on)}</td><td>{LEDGER_TYPE[l.type] || l.type}</td>
                        <td className="m">{l.investment_id ? codes[l.investment_id] || '—' : '—'}</td>
                        <td className="n">{money(l.amount)}</td><td><LedgerBadge s={l.status} /></td>
                        <td className="m">{l.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="card-b"><Empty title="No activity yet">Deposits, returns and payouts will be listed here.</Empty></div>}
            </div>
          </div>
          <p className="hint">Rates are contractual monthly rates under your agreement. Scheduled and projected values are estimates and are not guaranteed.</p>
        </>
      )}
    </>
  );
}
