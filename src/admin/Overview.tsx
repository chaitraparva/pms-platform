import { Link, useNavigate } from 'react-router-dom';
import { supabase, rpc, must, fetchAll } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { useAuth, useSettings } from '../lib/auth';
import { downloadCsv } from '../lib/csv';
import { money, moneyShort, date, dateShort, daysBetween, initials, today, LEDGER_TYPE, investmentLabel } from '../lib/format';
import type { Dashboard, Investment, Profile, LedgerEntry, Balance } from '../lib/types';
import { Kpi, Empty, ErrorNote, Loading, PageHead, KycBadge, Badge, useAction } from '../ui/kit';
import { BarChart, Donut, CHART_COLORS, monthLabel } from '../ui/Charts';
import { Icon } from '../ui/Icon';

type Lite = Pick<Profile, 'id' | 'full_name' | 'code'>;
interface ActionItem { tag: string; text: string; to: string; cls?: string }

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function loadOverview(approachingDays: number) {
  const t = today();
  const [dash, plansCount, reds, pend, kyc, maturing, ledger, recent] = await Promise.all([
    rpc<Dashboard>('admin_dashboard'),
    supabase.from('plans').select('id', { count: 'exact', head: true }),
    supabase.from('redemption_requests').select('id,code,status,investment_id,investor_id,created_at').in('status', ['requested', 'under_review', 'approved', 'processing']).order('created_at').limit(50),
    supabase.from('investments').select('id,code,investor_id,principal,created_at').eq('status', 'pending_funding').order('created_at').limit(50),
    supabase.from('profiles').select('id,code,full_name,created_at').eq('role', 'investor').eq('kyc_status', 'pending').order('created_at').limit(50),
    supabase.from('investments').select('*').eq('status', 'active').gte('maturity_date', t).lte('maturity_date', addDays(t, approachingDays)).order('maturity_date').limit(5),
    supabase.from('ledger_entries').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(6),
    supabase.from('profiles').select('*').eq('role', 'investor').order('created_at', { ascending: false }).limit(5)
  ]);
  if (plansCount.error) throw new Error(plansCount.error.message);
  const redRows = must(reds) as { id: string; code: string; status: string; investment_id: string; investor_id: string }[];
  const pendRows = must(pend) as { id: string; code: string; investor_id: string; principal: number }[];
  const kycRows = must(kyc) as { id: string; code: string | null; full_name: string }[];
  const matRows = must(maturing) as Investment[];
  const ledRows = must(ledger) as LedgerEntry[];
  const recentRows = must(recent) as Profile[];

  const pIds = [...new Set([...redRows.map(r => r.investor_id), ...pendRows.map(r => r.investor_id), ...matRows.map(r => r.investor_id), ...ledRows.map(r => r.investor_id).filter((x): x is string => !!x)])];
  const iIds = [...new Set([...redRows.map(r => r.investment_id), ...ledRows.map(r => r.investment_id).filter((x): x is string => !!x)])];
  const [people, invs] = await Promise.all([
    pIds.length ? supabase.from('profiles').select('id,full_name,code').in('id', pIds) : Promise.resolve({ data: [], error: null }),
    iIds.length ? supabase.from('investments').select('id,code').in('id', iIds) : Promise.resolve({ data: [], error: null })
  ]);
  const names: Record<string, Lite> = {};
  (must(people) as Lite[]).forEach(p => { names[p.id] = p; });
  const codes: Record<string, string> = {};
  (must(invs) as { id: string; code: string }[]).forEach(i => { codes[i.id] = i.code; });
  return { dash, planCount: plansCount.count || 0, redRows, pendRows, kycRows, matRows, ledRows, recentRows, names, codes };
}

export function Overview() {
  const { profile } = useAuth();
  const s = useSettings();
  const nav = useNavigate();
  const act = useAction();
  const q = useQuery(() => loadOverview(s.approaching_days), [s.approaching_days]);

  const first = (profile?.full_name || '').trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const exportCsv = () => act.run(async () => {
    const [rows, bal, people] = await Promise.all([
      fetchAll<Investment>((a, b) => supabase.from('investments').select('*').in('status', ['active', 'matured', 'redemption_requested', 'redemption_processing']).order('code').range(a, b)),
      fetchAll<Balance>((a, b) => supabase.from('investment_balances').select('*').range(a, b)),
      fetchAll<Lite>((a, b) => supabase.from('profiles').select('id,full_name,code').range(a, b))
    ]);
    const bm = new Map(bal.map(x => [x.investment_id, x]));
    const pm = new Map(people.map(x => [x.id, x]));
    downloadCsv(`live-investments-${today()}`,
      ['Investment', 'Investor ID', 'Investor', 'Plan', 'Version', 'Rate %/month', 'Principal', 'Monthly return', 'Lock-in months', 'Start', 'Maturity', 'Accrued', 'Paid', 'Outstanding', 'Status', 'Agreement ref'],
      rows.map(i => {
        const b = bm.get(i.id); const p = pm.get(i.investor_id);
        return [i.code, p?.code || '', p?.full_name || '', i.plan_name, i.plan_version, i.monthly_rate, i.principal, i.monthly_return, i.lockin_months, i.start_date, i.maturity_date,
          b?.accrued ?? 0, b?.paid ?? 0, b ? Number(b.unapproved) + Number(b.approved) + Number(b.processing) : 0, investmentLabel(i, s.approaching_days), i.agreement_ref];
      }));
    return rows.length;
  }, ['Export ready', 'Live investments downloaded as CSV']);

  const head = (
    <PageHead crumbs={['Overview']} title={`${greet}, ${first}`}
      sub={`Portfolio as of ${date(q.data?.dash.today || today())} · all figures derived from ledger records`}
      actions={<>
        <button className="btn" onClick={exportCsv} disabled={act.busy}><Icon name="download" />Export CSV</button>
        <button className="btn accent" onClick={() => nav('/admin/investments?new=1')}><Icon name="plus" />Record investment</button>
      </>} />
  );

  if (q.error) return <>{head}<ErrorNote msg={q.error} retry={q.reload} /></>;
  if (!q.data) return <>{head}<Loading rows={6} /></>;
  const { dash: d, planCount, redRows, pendRows, kycRows, matRows, ledRows, recentRows, names, codes } = q.data;

  /* ---------- first-run setup ---------- */
  const steps: { done: boolean; title: string; sub: string; to: string; cta: string }[] = [
    { done: !!s.company_name.trim(), title: 'Add company details', sub: 'Company name, logo, colours and support contacts shown to investors.', to: '/admin/settings', cta: 'Open settings' },
    { done: !!s.company_name.trim() && !!(s.default_terms.trim() || s.default_risk_disclosure.trim()), title: 'Confirm currency and default terms', sub: `Currency is ${s.currency}. Add the default terms and risk disclosure used on new plans.`, to: '/admin/settings?tab=terms', cta: 'Set terms' },
    { done: planCount > 0, title: 'Create your first plan', sub: 'Set the monthly rate, investment range and lock-in options.', to: '/admin/plans?new=1', cta: 'Create plan' },
    { done: d.registered_investors > 0, title: 'Add your first investor', sub: 'Invite an investor by email or set a temporary password.', to: '/admin/investors?new=1', cta: 'Add investor' }
  ];
  const showSetup = !s.company_name.trim() || planCount === 0;
  const doneCount = steps.filter(x => x.done).length;

  /* ---------- pending actions from real data ---------- */
  const pbs = d.payouts_by_status || {};
  const cnt = (k: string) => Number(pbs[k]?.count || 0);
  const amt = (k: string) => Number(pbs[k]?.amount || 0);
  const actions: ActionItem[] = [];
  if (cnt('failed')) actions.push({ tag: 'Payouts', cls: 'b-red', text: `${cnt('failed')} failed payout${cnt('failed') === 1 ? '' : 's'} need a retry · ${money(amt('failed'))}`, to: '/admin/payouts' });
  if (cnt('processing')) actions.push({ tag: 'Payouts', text: `${cnt('processing')} payout${cnt('processing') === 1 ? '' : 's'} waiting for payment confirmation · ${money(amt('processing'))}`, to: '/admin/payouts' });
  if (cnt('approved')) actions.push({ tag: 'Payouts', text: `${cnt('approved')} approved payout${cnt('approved') === 1 ? '' : 's'} waiting to be sent · ${money(amt('approved'))}`, to: '/admin/payouts' });
  if (cnt('accrued')) actions.push({ tag: 'Payouts', cls: 'b-grey', text: `${cnt('accrued')} accrued return${cnt('accrued') === 1 ? '' : 's'} awaiting approval · ${money(amt('accrued'))}`, to: '/admin/payouts' });
  redRows.forEach(r => actions.push({ tag: 'Redemption', text: `${r.code} from ${names[r.investor_id]?.full_name || 'investor'} · ${r.status.replace('_', ' ')}`, to: '/admin/redemptions/' + r.code }));
  pendRows.forEach(i => actions.push({ tag: 'Funding', text: `${i.code} awaiting deposit confirmation · ${names[i.investor_id]?.full_name || ''} · ${money(i.principal)}`, to: '/admin/investments/' + i.code }));
  kycRows.forEach(p => actions.push({ tag: 'KYC', text: `${p.full_name || p.code} awaiting verification`, to: '/admin/investors/' + p.code }));

  const months = d.monthly || [];
  const labels = months.map(m => monthLabel(m.month));
  const byPlan = (d.by_plan || []).map((p, i) => ({ name: p.plan, value: Number(p.principal), color: CHART_COLORS[i % CHART_COLORS.length] }));
  const lock = d.by_lockin || [];
  const lockTotal = lock.reduce((x, l) => x + Number(l.count), 0);
  const fmtAxis = (v: number) => moneyShort(v).replace(/\.00(?=[A-Za-z]|$)/, '');

  return (
    <>
      {head}

      {showSetup && (
        <div className="card setup-card">
          <div className="card-h"><h3>Finish setting up your platform</h3><div className="r">{doneCount} of {steps.length} done</div></div>
          <div className="card-b">
            <div className="hbar" style={{ marginBottom: 10 }}><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            <div className="list">
              {steps.map(st => (
                <div key={st.title}>
                  <span className={'badge ' + (st.done ? 'b-green' : 'b-grey')} style={{ minWidth: 74, justifyContent: 'center' }}>{st.done ? 'Done' : 'To do'}</span>
                  <div className="grow"><b>{st.title}</b><span>{st.sub}</span></div>
                  <Link className={'btn sm ' + (st.done ? '' : 'primary')} to={st.to}>{st.done ? 'Review' : st.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Registered investors" value={d.registered_investors} sub={`+${d.new_investors_month} this month`} subCls={d.new_investors_month ? 'up' : ''} tip="All investor accounts, any status." />
        <Kpi label="Active investors" value={d.active_investors} sub="With ≥1 live investment" tip="Investors with at least one investment that is active, matured or in redemption." />
        <Kpi label="Total principal invested" value={moneyShort(d.principal_invested)} sub={`${d.live_investments} live investments`} tip="Sum of principal on live investments. This is investor money, not company revenue." />
        <Kpi label="Locked principal" value={moneyShort(d.locked_principal)} sub="Inside lock-in" tip="Principal on active investments whose lock-in end date is after today." />
        <Kpi label="Active plans" value={d.active_plans} sub={`${d.other_plans} draft, inactive or archived`} tip="Plans currently open to new investments." />
        <Kpi label="Total accrued returns" value={moneyShort(d.accrued_total)} sub={Number(d.reversed_total) ? `Net of ${money(Math.abs(Number(d.reversed_total)))} reversals` : 'Net of reversals'} tip="Sum of all accrual entries less reversals. Accrued is not the same as paid." />
        <Kpi label="Total returns paid" value={moneyShort(d.paid_total)} sub="Confirmed payments only" cls="pos" tip="Payouts confirmed with a bank reference." />
        <Kpi label="Outstanding return obligations" value={moneyShort(d.outstanding_total)} sub={`${d.outstanding_count} payouts not yet paid`} subCls={d.outstanding_count ? 'warn' : ''} tip="Accrued returns that are not yet confirmed paid (accrued + approved + processing + failed)." />
        <Kpi label={`Maturing in ${s.approaching_days} days`} value={d.maturing_count} sub={`${moneyShort(d.maturing_principal)} principal`} subCls={d.maturing_count ? 'warn' : ''} tip={`Active investments whose maturity date is within the next ${s.approaching_days} days (Settings → Money & dates).`} />
        <Kpi label="Pending redemptions" value={d.pending_redemptions} sub={`${moneyShort(d.pending_redemption_principal)} requested`} subCls={d.pending_redemptions ? 'warn' : ''} tip="Redemption requests not yet completed, rejected or withdrawn." />
      </div>

      <div className="grid g-2-1">
        <div className="card">
          <div className="card-h"><h3>Monthly return accruals vs confirmed payouts</h3>
            <div className="r legend"><span><i style={{ background: 'var(--chart-1)' }} />Accrued</span><span><i style={{ background: 'var(--green)' }} />Paid</span></div></div>
          <div className="card-b">
            <BarChart labels={labels} label="Accrued vs paid returns by month" fmt={fmtAxis} tipFmt={money}
              series={[{ name: 'Accrued', color: 'var(--chart-1)', values: months.map(m => Number(m.accrued)) }, { name: 'Paid', color: 'var(--green)', values: months.map(m => Number(m.paid)) }]} />
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Pending administrative actions</h3><div className="r">{actions.length} open</div></div>
          <div className="card-b list">
            {actions.length ? actions.slice(0, 8).map((x, i) => (
              <div key={i} style={{ cursor: 'pointer' }} onClick={() => nav(x.to)} role="link" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') nav(x.to); }}>
                <Badge cls={x.cls || 'b-amber'}>{x.tag}</Badge><div className="grow"><b>{x.text}</b></div><span className="muted">›</span>
              </div>
            )) : <Empty title="All clear">No actions waiting.</Empty>}
            {actions.length > 8 && <div><div className="grow"><span>{actions.length - 8} more · see Payouts, Redemptions, Investments and Investors</span></div></div>}
          </div>
        </div>
      </div>

      <div className="grid g-1-1-1">
        <div className="card"><div className="card-h"><h3>Monthly investment volume</h3></div><div className="card-b">
          <BarChart labels={labels} w={420} h={200} label="New principal by month" fmt={fmtAxis} tipFmt={money}
            series={[{ name: 'New principal', color: 'var(--chart-2)', values: months.map(m => Number(m.invested)) }]} />
        </div></div>
        <div className="card"><div className="card-h"><h3>Principal by plan</h3></div><div className="card-b">
          {byPlan.length && byPlan.some(p => p.value > 0)
            ? <Donut parts={byPlan} fmt={moneyShort} center1="Total" center2={moneyShort(d.principal_invested)} label="Principal by plan" />
            : <Empty title="No live principal yet">{planCount ? 'Principal appears here once a deposit is confirmed.' : <><span>Create a plan to get started.</span><Link to="/admin/plans?new=1">New plan</Link></>}</Empty>}
        </div></div>
        <div className="card"><div className="card-h"><h3>Lock-in distribution</h3></div><div className="card-b" style={{ display: 'grid', gap: 14 }}>
          {lock.length ? lock.map(l => {
            const p = lockTotal ? (Number(l.count) / lockTotal) * 100 : 0;
            return (
              <div key={l.months}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 8 }}>
                  <span>{l.months}-month lock-in</span>
                  <b className="num" style={{ fontWeight: 500 }}>{l.count} investment{Number(l.count) === 1 ? '' : 's'} · {Math.round(p)}%</b>
                </div>
                <div className="hbar" title={money(l.principal)}><div style={{ width: `${p}%` }} /></div>
              </div>
            );
          }) : <Empty title="No live investments">The split by lock-in appears once investments are active.</Empty>}
          <p className="hint">Live investments only. Custom lock-in is {s.allow_custom_lockin ? 'enabled' : 'disabled'} in Settings.</p>
        </div></div>
      </div>

      <div className="grid g-1-1-1">
        <div className="card"><div className="card-h"><h3>Upcoming maturities</h3><div className="r"><Link to="/admin/investments">Register</Link></div></div><div className="card-b list">
          {matRows.length ? matRows.map(i => {
            const left = i.maturity_date ? daysBetween(today(), i.maturity_date) : 0;
            return (
              <div key={i.id} style={{ cursor: 'pointer' }} onClick={() => nav('/admin/investments/' + i.code)}>
                <div className="grow"><b>{i.code} · {names[i.investor_id]?.full_name || '—'}</b><span>{money(i.principal)} · {i.plan_name}</span></div>
                <Badge cls="b-amber">{dateShort(i.maturity_date)} · {left}d</Badge>
              </div>
            );
          }) : <Empty title="Nothing maturing soon">{`No active investment matures in the next ${s.approaching_days} days.`}</Empty>}
        </div></div>
        <div className="card"><div className="card-h"><h3>Recent transactions</h3><div className="r"><Link to="/admin/transactions">View all</Link></div></div><div className="card-b list">
          {ledRows.length ? ledRows.map(t => (
            <div key={t.id}>
              <div className="grow"><b>{LEDGER_TYPE[t.type] || t.type}{t.investment_id && codes[t.investment_id] ? ' · ' + codes[t.investment_id] : ''}</b>
                <span>{t.code} · {dateShort(t.occurred_on)}{t.investor_id && names[t.investor_id] ? ' · ' + names[t.investor_id].full_name : ''}</span></div>
              <span className={'num ' + (Number(t.amount) < 0 ? 'neg' : '')}>{money(t.amount)}</span>
            </div>
          )) : <Empty title="No transactions yet">Ledger entries appear when an investment is recorded.</Empty>}
        </div></div>
        <div className="card"><div className="card-h"><h3>Recently registered investors</h3><div className="r"><Link to="/admin/investors">Directory</Link></div></div><div className="card-b list">
          {recentRows.length ? recentRows.map(v => (
            <div key={v.id} style={{ cursor: 'pointer' }} onClick={() => nav('/admin/investors/' + v.code)}>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(v.full_name || v.email)}</div>
              <div className="grow"><b>{v.full_name || v.email}</b><span>{v.code} · {date(v.created_at)}</span></div>
              <KycBadge k={v.kyc_status} />
            </div>
          )) : <Empty title="No investors yet"><Link to="/admin/investors?new=1">Add your first investor</Link></Empty>}
        </div></div>
      </div>
    </>
  );
}
