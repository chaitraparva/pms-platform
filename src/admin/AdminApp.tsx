import { Route, Routes, useNavigate } from 'react-router-dom';
import { Shell, NavItem } from '../shell/Shell';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { ProfileSecurity } from '../pages/ProfileSecurity';
import { Notifications } from '../pages/Notifications';
import { Overview } from './Overview';
import { Investors, InvestorDetail } from './Investors';
import { Plans, PlanDetail } from './Plans';
import { Investments, InvestmentDetail } from './Investments';
import { Accruals } from './Accruals';
import { Payouts } from './Payouts';
import { Redemptions } from './Redemptions';
import { Transactions } from './Transactions';
import { Announcements } from './Announcements';
import { Reports } from './Reports';
import { Audit } from './Audit';
import { Settings } from './Settings';
import { Search } from './Search';

export default function AdminApp() {
  const nav = useNavigate();
  const counts = useQuery(async () => {
    const [p, r] = await Promise.all([
      supabase.from('payouts').select('id', { count: 'exact', head: true }).in('status', ['approved', 'processing', 'failed']),
      supabase.from('redemption_requests').select('id', { count: 'exact', head: true }).in('status', ['requested', 'under_review'])
    ]);
    return { payouts: p.count || 0, redemptions: r.count || 0 };
  }, []);
  const items: NavItem[] = [
    { group: 'Dashboard' }, { to: '/admin', label: 'Overview', icon: 'home' },
    { group: 'Manage' }, { to: '/admin/investors', label: 'Investors', icon: 'users' }, { to: '/admin/plans', label: 'Investment Plans', icon: 'plans' },
    { to: '/admin/investments', label: 'Investments', icon: 'invest' }, { to: '/admin/accruals', label: 'Monthly ROI & Accruals', icon: 'roi' },
    { to: '/admin/payouts', label: 'Payouts', icon: 'payout', count: counts.data?.payouts }, { to: '/admin/redemptions', label: 'Redemptions', icon: 'redeem', count: counts.data?.redemptions },
    { to: '/admin/transactions', label: 'Transactions', icon: 'txn' },
    { group: 'Communicate & control' }, { to: '/admin/announcements', label: 'Announcements', icon: 'announce' }, { to: '/admin/reports', label: 'Reports', icon: 'report' },
    { to: '/admin/audit', label: 'Audit Logs', icon: 'audit' }, { to: '/admin/settings', label: 'Settings', icon: 'settings' }
  ];
  return (
    <Routes>
      <Route element={<Shell base="/admin" roleLabel="Super Admin" nav={items} searchPh="Search investors, investments, transactions" onSearch={q => nav('/admin/search?q=' + encodeURIComponent(q))} />}>
        <Route index element={<Overview />} />
        <Route path="investors" element={<Investors />} />
        <Route path="investors/:code" element={<InvestorDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/:code" element={<PlanDetail />} />
        <Route path="investments" element={<Investments />} />
        <Route path="investments/:code" element={<InvestmentDetail />} />
        <Route path="accruals" element={<Accruals />} />
        <Route path="payouts" element={<Payouts />} />
        <Route path="redemptions" element={<Redemptions />} />
        <Route path="redemptions/:code" element={<Redemptions />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="search" element={<Search />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<ProfileSecurity />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  );
}
