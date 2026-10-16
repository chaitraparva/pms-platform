import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { date, daysBetween, EARLY_LABEL, pct, today } from '../lib/format';
import { Empty, ErrorNote, InvBadge, Loading, PageHead } from '../ui/kit';
import { daysLeft, isLive, loadInvestments } from './data';
import { earlyRule, maturityText, Steps, Tracker, useApproaching } from './parts';

export function LockIn() {
  const { profile } = useAuth();
  const approaching = useApproaching();
  const q = useQuery(() => loadInvestments(profile!.id), [profile?.id]);
  const t = today();
  const live = (q.data || []).filter(i => isLive(i) && i.start_date);
  const pending = (q.data || []).filter(i => i.status === 'pending_funding');

  return (
    <>
      <PageHead crumbs={['Lock-in & Maturity']} title="Lock-in & maturity" sub="Dates are calculated from your start date plus your lock-in in calendar months. They never change if a plan is edited." />
      {q.error && <ErrorNote msg={q.error} retry={q.reload} />}
      {q.loading && !q.data ? <Loading /> : q.data && !live.length ? (
        <div className="card"><div className="card-b">
          <Empty title={q.data.length ? 'No investments in lock-in' : 'You have no investments yet'}>
            {q.data.length ? (pending.length ? 'Lock-in dates are set once your deposit is confirmed.' : 'None of your investments are currently live.') : 'Your advisor will record your investment once funds are received.'}
          </Empty>
        </div></div>
      ) : null}
      {live.map(i => {
        const canReq = !!i.request_from_date && t >= i.request_from_date;
        const target = canReq ? i.maturity_date! : i.request_from_date!;
        const until = Math.max(0, daysBetween(t, target));
        const reqOpen = ['active', 'matured'].includes(i.status);
        return (
          <div key={i.id} className="card">
            <div className="card-h"><h3><span className="mono">{i.code}</span> · {i.plan_name}</h3><div className="r"><InvBadge i={i} approachingDays={approaching} /></div></div>
            <div className="card-b" style={{ display: 'grid', gap: 20 }}>
              <div className="grid g-1-2" style={{ alignItems: 'center' }}>
                <div>
                  <div className="hint">Next date: {canReq ? (t >= i.maturity_date! ? 'matured' : 'maturity') : 'redemption request window opens'}</div>
                  <div className="countdown num">{until} days</div>
                  <div className="hint">{date(target)}</div>
                </div>
                <dl className="kv">
                  <dt>Start date</dt><dd>{date(i.start_date)}</dd>
                  <dt>Lock-in duration</dt><dd>{i.lockin_months} months</dd>
                  <dt>Lock-in end date</dt><dd>{date(i.lockin_end_date)}</dd>
                  <dt>Redemption can be requested from</dt><dd>{date(i.request_from_date)}</dd>
                  <dt>Maturity date</dt><dd>{date(i.maturity_date)}</dd>
                  <dt>Days remaining</dt><dd>{daysLeft(i)}</dd>
                  <dt>Early redemption</dt><dd>{EARLY_LABEL[i.early_redemption] || i.early_redemption}{Number(i.early_fee_pct) > 0 && i.early_redemption !== 'not_permitted' ? ` · ${pct(i.early_fee_pct)} fee` : ''}</dd>
                </dl>
              </div>
              <Tracker i={i} />
              <Steps i={i} />
              {!canReq && reqOpen && <div className="note lock">Redemption at maturity is locked until <b>{date(i.request_from_date)}</b> because of the {i.lockin_months}-month lock-in in your agreement. This rule is checked by our system and cannot be overridden from this screen.</div>}
              {canReq && reqOpen && <div className="note ok"><b>You can request redemption now.</b> <Link to={'/portal/redemptions?request=' + i.code}>Request redemption</Link></div>}
              {!reqOpen && <div className="note info">A redemption request for this investment is in progress. <Link to="/portal/redemptions">Follow it on Redemptions</Link>.</div>}
              <div className="grid g-1-1">
                <div><div className="hint" style={{ marginBottom: 4 }}>Early redemption rule</div><p style={{ fontSize: 13 }}>{earlyRule(i)}</p></div>
                <div><div className="hint" style={{ marginBottom: 4 }}>What happens at maturity</div><p style={{ fontSize: 13 }}>{maturityText(i)}</p></div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
