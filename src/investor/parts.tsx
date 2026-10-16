// Visual pieces shared by several investor pages (ported from the approved prototype).
import { Link } from 'react-router-dom';
import { date, dateShort, EARLY_LABEL, money, pct, today } from '../lib/format';
import { useAuth } from '../lib/auth';
import { InvBadge } from '../ui/kit';
import { Icon } from '../ui/Icon';
import type { Investment } from '../lib/types';
import { daysLeft, elapsedPct } from './data';

export const useApproaching = () => useAuth().settings?.approaching_days ?? 60;

/** Lock-in progress bar from start to maturity. */
export function Tracker({ i, compact }: { i: Investment; compact?: boolean }) {
  const approaching = useApproaching();
  const p = elapsedPct(i);
  const left = daysLeft(i);
  const d = compact ? dateShort : date;
  return (
    <div className="track">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <b style={{ fontWeight: 600 }}><span className="mono">{i.code}</span> · {i.plan_name}</b>
        <InvBadge i={i} approachingDays={approaching} />
      </div>
      {i.start_date ? (
        <>
          <div className="bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${p}% of the lock-in elapsed`}>
            <div className={'fill ' + (p >= 100 ? 'done' : '')} style={{ width: p + '%' }} />
          </div>
          <div className="lbls"><span>{d(i.start_date)}</span><span>{left ? `${left} days left · ${p}%` : 'Matured'}</span><span>{d(i.maturity_date)}</span></div>
        </>
      ) : (
        <div className="hint">Dates are set once your deposit is confirmed.</div>
      )}
    </div>
  );
}

const STEP_LABELS = ['Investment recorded', 'Lock-in in progress', 'Request window opens', 'Lock-in completed', 'Maturity reached', 'Redemption requested', 'Redemption processed', 'Redemption completed'];

/** The eight-step lifecycle strip. */
export function Steps({ i }: { i: Investment }) {
  const t = today();
  const s = i.status;
  const reached = [
    true,
    !!i.start_date,
    !!i.request_from_date && t >= i.request_from_date,
    !!i.lockin_end_date && t >= i.lockin_end_date,
    !!i.maturity_date && t >= i.maturity_date,
    ['redemption_requested', 'redemption_processing', 'redeemed'].includes(s),
    ['redemption_processing', 'redeemed'].includes(s),
    s === 'redeemed'
  ];
  const now = reached.lastIndexOf(true);
  return (
    <div className="steps" aria-label="Investment lifecycle">
      {STEP_LABELS.map((l, ix) => (
        <div key={l} className={ix < now ? 'done' : ix === now ? 'now' : ''}>
          <i>{ix < now ? '✓' : ''}</i>{l}
        </div>
      ))}
    </div>
  );
}

/** The early-redemption rule of the investment's own terms snapshot, in plain words. */
export function earlyRule(i: Investment): string {
  const fee = Number(i.early_fee_pct);
  const feeTxt = fee > 0 ? ` A fee of ${pct(fee)} of your principal (${money((Number(i.principal) * fee) / 100)}) is deducted from the amount repaid.` : ' No early-redemption fee applies.';
  const from = i.request_from_date ? date(i.request_from_date) : 'the request date in your agreement';
  switch (i.early_redemption) {
    case 'not_permitted':
      return `${EARLY_LABEL.not_permitted}. Your agreement does not allow redemption before the lock-in ends. You can request redemption from ${from}.`;
    case 'permitted_with_fee':
      return `${EARLY_LABEL.permitted_with_fee}. You may ask to redeem before ${from}.${feeTxt} Returns for the part-month are paid pro-rata up to the settlement date.`;
    case 'admin_discretion':
      return `${EARLY_LABEL.admin_discretion}. You may ask to redeem before ${from}; the company reviews each request and may decline it.${feeTxt}`;
    default:
      return EARLY_LABEL[i.early_redemption] || i.early_redemption;
  }
}

/** What happens at maturity, from the investment's own dates. */
export function maturityText(i: Investment): string {
  if (!i.maturity_date) return 'Your maturity date is fixed when your deposit is confirmed.';
  return `On ${date(i.maturity_date)} your lock-in ends and monthly returns stop accruing. Request redemption from ${date(i.request_from_date)}; your principal of ${money(i.principal)} plus any returns not yet paid is then transferred to your registered bank account on or after the maturity date.`;
}

export const BackLink = ({ to, children }: { to: string; children: string }) => (
  <Link className="back" to={to}><Icon name="back" />{children}</Link>
);

/** Readable multi-paragraph text (terms, disclosures, announcement bodies). */
export const Prose = ({ text, empty }: { text: string; empty: string }) =>
  text.trim() ? <div style={{ whiteSpace: 'pre-wrap', color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.6, maxWidth: '80ch' }}>{text}</div> : <p className="hint">{empty}</p>;
