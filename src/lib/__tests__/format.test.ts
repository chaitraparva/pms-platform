import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, investmentLabel, monthlyReturn } from '../format';
import { toCsv } from '../csv';
import type { Investment } from '../types';

describe('calendar months (must match the database)', () => {
  it('clamps to month end', () => {
    expect(addMonths('2026-05-31', 6)).toBe('2026-11-30');
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 12)).toBe('2027-01-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('counts days', () => {
    expect(daysBetween('2026-09-30', '2026-10-16')).toBe(16);
  });
});

describe('simple monthly return', () => {
  it('uses the original principal and rounds to 2 decimals', () => {
    expect(monthlyReturn(100000, 2)).toBe(2000);
    expect(monthlyReturn(250000, 4)).toBe(10000);
    expect(monthlyReturn(123456.78, 6)).toBe(7407.41);
    expect(monthlyReturn(1000.5, 1)).toBe(10.01); // 10.005 rounds half up
  });
});

describe('investment label', () => {
  const base = { status: 'active', request_from_date: '2027-01-01', maturity_date: '2027-01-31' } as Investment;
  it('derives the state from dates', () => {
    expect(investmentLabel(base, 60, '2026-10-16')).toBe('Locked');
    expect(investmentLabel(base, 60, '2026-12-10')).toBe('Maturity approaching');
    expect(investmentLabel(base, 60, '2027-01-02')).toBe('Eligible for redemption');
    expect(investmentLabel({ ...base, status: 'pending_funding' }, 60, '2026-10-16')).toBe('Pending funding');
  });
});

describe('csv export', () => {
  it('quotes and neutralises formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', '=HYPERLINK("bad")'], [-5, 2.5]])).toBe('a,b\r\n"x,y","\'=HYPERLINK(""bad"")"\r\n-5,2.5');
  });
});
