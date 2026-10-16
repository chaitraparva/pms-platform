// Formatting helpers. Currency and locale come from Settings (edited by the Super Admin).
import type { Investment, Settings } from './types';

let CUR = 'INR';
let LOC = 'en-IN';
let TZ = 'Asia/Kolkata';
export function configureFormat(s: Pick<Settings, 'currency' | 'locale' | 'timezone'> | null) {
  if (!s) return;
  CUR = s.currency || 'INR'; LOC = s.locale || 'en-IN'; TZ = s.timezone || 'UTC';
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function money(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  try {
    return new Intl.NumberFormat(LOC, { style: 'currency', currency: CUR, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace('-', '−');
  } catch {
    return n.toFixed(2);
  }
}

/** Compact money for KPI tiles: ₹12.4L / ₹1.2Cr for INR, 1.2M elsewhere. */
export function moneyShort(v: number | string | null | undefined): string {
  const n = Number(v ?? 0), a = Math.abs(n), sign = n < 0 ? '−' : '';
  const sym = currencySymbol();
  if (CUR === 'INR') {
    if (a >= 1e7) return sign + sym + (a / 1e7).toFixed(2) + 'Cr';
    if (a >= 1e5) return sign + sym + (a / 1e5).toFixed(2) + 'L';
    return money(n);
  }
  if (a >= 1e9) return sign + sym + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + sym + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return sign + sym + (a / 1e3).toFixed(1) + 'K';
  return money(n);
}

export function currencySymbol(): string {
  try {
    const p = new Intl.NumberFormat(LOC, { style: 'currency', currency: CUR }).formatToParts(0).find(x => x.type === 'currency');
    return p ? p.value : '';
  } catch { return ''; }
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(LOC, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso; }
}
export const rate = (r: number | string) => Number(r).toFixed(2) + '% / month';
export const pct = (r: number | string) => Number(r).toFixed(2) + '%';

/** Today's date (YYYY-MM-DD) in the company time zone. */
export function today(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

/** Calendar-month arithmetic, clamped to month end (matches the database). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const tm = m - 1 + n, ty = y + Math.floor(tm / 12), mm = ((tm % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, mm + 1, 0)).getUTCDate();
  return `${ty}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
/** Simple interest per month on the original principal, rounded half away from zero to 2 decimals. */
export function monthlyReturn(principal: number, ratePct: number): number {
  const x = (principal * ratePct) / 100;
  return Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9) / 100;
}

export const initials = (name: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]!.toUpperCase()).join('') || '?';
export const ordinal = (d: number) => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');

/** The investor-facing state label of an investment, derived from status and dates. */
export function investmentLabel(i: Investment, approachingDays: number, t = today()): string {
  switch (i.status) {
    case 'pending_funding': return 'Pending funding';
    case 'matured': return 'Matured';
    case 'redemption_requested': return 'Redemption requested';
    case 'redemption_processing': return 'Redemption processing';
    case 'redeemed': return 'Redeemed';
    case 'cancelled': return 'Cancelled';
  }
  if (i.request_from_date && t >= i.request_from_date) return 'Eligible for redemption';
  if (i.maturity_date && daysBetween(t, i.maturity_date) <= approachingDays) return 'Maturity approaching';
  return 'Locked';
}
export const INV_BADGE: Record<string, string> = {
  'Locked': 'b-violet sq', 'Active': 'b-blue', 'Maturity approaching': 'b-amber', 'Eligible for redemption': 'b-green', 'Matured': 'b-green',
  'Redemption requested': 'b-amber', 'Redemption processing': 'b-blue', 'Redeemed': 'b-grey', 'Cancelled': 'b-grey', 'Pending funding': 'b-grey'
};
export const PAY_BADGE: Record<string, [string, string]> = {
  accrued: ['Accrued', 'b-grey'], approved: ['Approved', 'b-blue'], processing: ['Processing', 'b-amber'], paid: ['Paid', 'b-green'], failed: ['Failed', 'b-red'], cancelled: ['Reversed', 'b-grey']
};
export const LEDGER_BADGE: Record<string, [string, string]> = {
  confirmed: ['Confirmed', 'b-green'], pending: ['Pending', 'b-amber'], posted: ['Posted', 'b-grey'], failed: ['Failed', 'b-red'], reversed: ['Reversed', 'b-grey']
};
export const REDEMPTION_BADGE: Record<string, [string, string]> = {
  requested: ['Requested', 'b-amber'], under_review: ['Under review', 'b-blue'], approved: ['Approved', 'b-blue'], processing: ['Processing', 'b-amber'],
  completed: ['Completed', 'b-green'], rejected: ['Rejected', 'b-red'], withdrawn: ['Withdrawn', 'b-grey']
};
export const LEDGER_TYPE: Record<string, string> = {
  deposit: 'Deposit', allocation: 'Investment allocation', return_accrual: 'Return accrued', return_payout: 'Return payout',
  redemption_request: 'Redemption request', principal_redemption: 'Principal redemption', refund: 'Refund', adjustment: 'Adjustment', fee: 'Fee', reversal: 'Reversal'
};
export const EARLY_LABEL: Record<string, string> = {
  not_permitted: 'Not permitted before maturity', permitted_with_fee: 'Permitted with a fee', admin_discretion: 'At admin discretion'
};
