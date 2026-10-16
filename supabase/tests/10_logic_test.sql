-- Business-rule tests. Run on a local database after 00_local_stubs.sql and the
-- four migrations. Every check raises an error if it fails.
\set ON_ERROR_STOP 1
\set A1 '''aaaaaaaa-0000-0000-0000-000000000001'''
\set A2 '''aaaaaaaa-0000-0000-0000-000000000002'''
\set I1 '''bbbbbbbb-0000-0000-0000-000000000001'''
\set I2 '''bbbbbbbb-0000-0000-0000-000000000002'''

create schema t; grant usage on schema t to authenticated;
create table t.ctx (k text primary key, v uuid); grant all on t.ctx to authenticated;
create function t.ok(c boolean, m text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', m; end if; raise notice 'ok  %', m; end $$;
create function t.err(q text, pat text, m text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm ilike '%' || pat || '%' then raise notice 'ok  % (refused: %)', m, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', m, sqlerrm;
  end;
  raise exception 'FAIL: % — was allowed', m;
end $$;
grant execute on all functions in schema t to authenticated;

-- test clock
create or replace function public.pms_today() returns date language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('pms.today', true), '')::date, current_date) $$;
set pms.today = '2026-10-16';

insert into auth.users (id, email, raw_user_meta_data) values
 (:A1, 'admin1@co.test', '{"full_name":"Admin One"}'), (:A2, 'admin2@co.test', '{"full_name":"Admin Two","role":"super_admin"}'),
 (:I1, 'inv1@co.test', '{"full_name":"Investor One"}'), (:I2, 'inv2@co.test', '{"full_name":"Investor Two"}');

select t.ok((select count(*) from public.plans) = 0 and (select count(*) from public.investments) = 0, 'fresh database has no plans or investments');
select t.ok((select role from public.profiles where id = :A2) = 'investor', 'role in signup metadata is ignored');
select public.bootstrap_super_admin('admin1@co.test');
select t.err($$select public.bootstrap_super_admin('inv1@co.test')$$, 'already exists', 'bootstrap works only once');

-- pure maths
select t.ok(public.pms_add_months('2026-05-31', 6) = '2026-11-30', '31 May + 6 months = 30 Nov');
select t.ok(public.pms_add_months('2027-08-31', 6) = '2028-02-29', '31 Aug 2027 + 6 months = 29 Feb 2028');
select t.ok(public.pms_monthly_return(100000, 2) = 2000, '2% of 1,00,000 = 2,000');
select t.ok(public.pms_monthly_return(250000, 4) = 10000, '4% of 2,50,000 = 10,000');
select t.ok(public.pms_monthly_return(123456.78, 6) = 7407.41, '6% of 1,23,456.78 = 7,407.41 (rounded)');

-- ===== as investor 1: no admin powers
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.err($$select public.admin_create_plan('X','X','',jsonb_build_object('monthly_rate',5,'min_amount',1,'max_amount',2,'lockin_options',jsonb_build_array(6)))$$, 'Only an active Super Admin', 'investor cannot create plans');
select t.err($$update public.profiles set role = 'super_admin' where id = auth.uid()$$, 'permission denied', 'investor cannot promote self');
select t.err($$insert into public.ledger_entries (type, amount, status, occurred_on) values ('deposit', 1, 'posted', current_date)$$, 'permission denied', 'investor cannot write ledger');
select t.err($$select public.pms_run_accruals()$$, 'permission denied', 'investor cannot run the accrual job directly');
select t.err($$select public.bootstrap_super_admin('inv1@co.test')$$, 'permission denied', 'investor cannot call bootstrap');
reset role;

-- ===== as admin 1: setup
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select public.admin_save_settings('{"company_name":"Test Capital","four_eyes":true}');
select t.ok((select company_name from public.settings) = 'Test Capital', 'admin edits company settings');
insert into t.ctx values ('plan', public.admin_create_plan('GRW', 'Growth', 'test', '{"monthly_rate":2,"min_amount":50000,"max_amount":5000000,"lockin_options":[6,12],"eligible_from":"2026-01-01","effective_from":"2026-01-01"}'));
select t.err($$select public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000001', (select v from t.ctx where k='plan'), 12, 100000, null, 'AGR-1', '', '')$$, 'not verified', 'KYC required before investing');
select public.admin_set_kyc('bbbbbbbb-0000-0000-0000-000000000001', 'verified', 'docs ok');
select public.admin_set_kyc('bbbbbbbb-0000-0000-0000-000000000002', 'verified', 'docs ok');
select t.err($$select public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000001', (select v from t.ctx where k='plan'), 12, 100000, null, 'AGR-1', '', '')$$, 'not active', 'draft plan cannot take investments');
select public.admin_set_plan_status((select v from t.ctx where k='plan'), 'active', 'launch');
select t.err($$select public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000001', (select v from t.ctx where k='plan'), 9, 100000, null, 'AGR-1', '', '')$$, 'not offered', '9-month lock-in refused');
select t.err($$select public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000001', (select v from t.ctx where k='plan'), 12, 1000, null, 'AGR-1', '', '')$$, 'between', 'amount below minimum refused');
insert into t.ctx values ('inv1', public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000001', (select v from t.ctx where k='plan'), 12, 100000, '2026-01-31', 'AGR-1', '', ''));
select t.ok((select status from public.investments where id = (select v from t.ctx where k='inv1')) = 'pending_funding', 'new investment waits for funding');
-- single admin: four-eyes cannot apply, so activation is allowed
select public.admin_activate_investment((select v from t.ctx where k='inv1'), '2026-01-31', 'NEFT-1', '');
select t.ok((select maturity_date from public.investments where id = (select v from t.ctx where k='inv1')) = '2027-01-31', '12-month maturity from 31 Jan = 31 Jan 2027');
select t.ok((select request_from_date from public.investments where id = (select v from t.ctx where k='inv1')) = '2027-01-01', 'request window opens 30 days before');
select t.ok((select count(*) from public.accruals where investment_id = (select v from t.ctx where k='inv1')) = 8, 'backdated start catches up 8 past months');
select t.ok((select string_agg(to_char(accrual_date,'MM-DD'), ',' order by period_no) from public.accruals where investment_id = (select v from t.ctx where k='inv1')) = '02-28,03-31,04-30,05-31,06-30,07-31,08-31,09-30', 'accrual dates clamp to month end from the original date');
select t.ok((select accrued from public.investment_balances where investment_id = (select v from t.ctx where k='inv1')) = 16000, 'accrued 16,000 = 8 x 2,000');
select t.ok((public.admin_run_accruals() ->> 'created')::int = 0, 'running the job again creates nothing');
select t.err($$update public.investments set monthly_rate = 3$$, 'permission denied', 'admin cannot edit investment rows directly');

-- plan change creates version 2 and does not touch existing investments
select public.admin_update_plan((select v from t.ctx where k='plan'), 'Growth', 'test', '{"monthly_rate":4,"min_amount":50000,"max_amount":5000000,"lockin_options":[6,12],"eligible_from":"2026-01-01","effective_from":"2026-08-01","early_redemption":"permitted_with_fee","early_fee_pct":1}', 'rate revision');
select t.err($$select public.admin_update_plan((select v from t.ctx where k='plan'), 'Growth', '', '{"monthly_rate":4,"min_amount":1,"max_amount":2,"lockin_options":[6]}', '')$$, 'reason', 'plan change needs a reason');
select t.ok((select monthly_rate from public.investments where id = (select v from t.ctx where k='inv1')) = 2, 'existing investment keeps 2% after plan moved to 4%');
insert into t.ctx values ('inv2', public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000002', (select v from t.ctx where k='plan'), 6, 250000, null, 'AGR-2', '', ''));
select public.admin_activate_investment((select v from t.ctx where k='inv2'), '2026-08-31', 'NEFT-2', '');
select t.ok((select (monthly_rate, plan_version, monthly_return, maturity_date)::text from public.investments where id = (select v from t.ctx where k='inv2')) = '(4.0000,2,10000.00,2027-02-28)', 'new investment snapshots v2: 4%, 10,000/month, 6 months from 31 Aug = 28 Feb');
select t.ok((select count(*) from public.accruals where investment_id = (select v from t.ctx where k='inv2')) = 1, 'one month accrued on the 6-month investment');
reset role;

-- ===== RLS between investors
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
set role authenticated;
select t.ok((select count(*) from public.investments) = 1, 'investor 2 sees only their own investment');
select t.ok((select count(*) from public.payouts where investor_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 0, 'investor 2 cannot see investor 1 payouts');
select t.ok((select count(*) from public.ledger_entries where investor_id <> auth.uid()) = 0, 'investor 2 ledger is private');
select t.ok((select count(*) from public.profiles) = 1, 'investor 2 sees only own profile');
select t.ok((select count(*) from public.audit_logs) = 0, 'investors cannot read the audit log');
select t.err($$select public.investor_request_redemption((select id from public.investments limit 1), 'need funds')$$, 'does not exist', 'redemption requests are no longer possible');
reset role;

-- ===== add a second admin, then four-eyes applies
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select public.admin_set_role('aaaaaaaa-0000-0000-0000-000000000002', 'super_admin', 'second approver');
-- payouts for investor 1
insert into t.ctx select 'p' || row_number() over (order by due_date), id from public.payouts where investment_id = (select v from t.ctx where k='inv1');
select t.ok(public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'approved') = 8, 'approve 8 payouts');
select t.err($$select public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'paid', 'UTR-1')$$, 'cannot move to', 'cannot jump approved -> paid');
select t.ok(public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'processing') = 8, 'send 8 payouts to bank');
select t.err($$select public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'paid', '')$$, 'bank reference', 'paid requires a bank reference');
select t.err($$select public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'paid', 'UTR-1')$$, 'different Super Admin', 'four-eyes: sender cannot confirm');
reset role;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);
set role authenticated;
select t.ok(public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1') and status = 'processing'), 'paid', 'UTR-1') = 8, 'second admin confirms 8 payments');
select t.ok((select paid from public.investment_balances where investment_id = (select v from t.ctx where k='inv1')) = 16000, 'paid total 16,000');
select t.err($$select public.admin_payouts_transition(array(select id from public.payouts where investment_id = (select v from t.ctx where k='inv1')), 'paid', 'UTR-9')$$, 'cannot move to', 'cannot pay twice');
reset role;

-- ===== immutability, even for the database owner
select t.err($$update public.ledger_entries set amount = 1$$, 'cannot be edited', 'ledger amounts are immutable');
select t.err($$delete from public.ledger_entries$$, 'cannot be deleted', 'ledger rows cannot be deleted');
select t.err($$delete from public.audit_logs$$, 'immutable', 'audit log is append-only');
select t.err($$update public.accruals set amount = 0$$, 'immutable', 'accruals are immutable');
select t.err($$update public.investments set principal = 1$$, 'cannot be edited', 'investment terms are locked');
select t.err($$update public.payouts set status = 'paid', payment_ref = null where id = (select id from public.payouts limit 1)$$, 'check constraint', 'paid without reference is impossible at table level');

-- ===== lock-in ends for investor 1: principal is unlocked, nothing is paid out automatically
set pms.today = '2027-01-15';
select t.ok(not public.pms_is_unlocked((select i from public.investments i where id = (select v from t.ctx where k='inv1'))), 'still locked two weeks before the lock-in ends');
set pms.today = '2027-02-01';
select t.ok((public.pms_run_accruals() ->> 'created')::int = 8, 'job (as scheduler) adds the Oct-Jan accruals of both investments');
select t.ok((select (accrued, periods_accrued)::text from public.investment_balances where investment_id = (select v from t.ctx where k='inv1')) = '(24000.00,12)', '12 months x 2,000 = 24,000 accrued, then accruals stop');
select t.ok((select status from public.investments where id = (select v from t.ctx where k='inv1')) = 'matured', 'investment 1 reaches the end of its lock-in');
select t.ok(public.pms_is_unlocked((select i from public.investments i where id = (select v from t.ctx where k='inv1'))), 'principal of investment 1 is unlocked');
select t.ok((select count(*) from public.ledger_entries where investment_id = (select v from t.ctx where k='inv1') and type in ('principal_redemption', 'redemption_request')) = 0, 'unlocking moves no money');
select t.ok((select count(*) from public.notifications where kind = 'unlocked' and source_id = (select v from t.ctx where k='inv1')) = 1, 'investor told the principal is unlocked');
select t.ok((select count(*) from public.notifications where link like '%redemption%') = 0, 'no notification links to redemption');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);
set role authenticated;
-- announcements
insert into t.ctx values ('ann', public.admin_save_announcement(null, '{"title":"Office closed","body":"Holiday","audience":"all"}'));
select t.ok(public.admin_publish_announcement((select v from t.ctx where k='ann')) = 2, 'announcement reaches 2 active investors');
select t.ok((public.admin_dashboard() ->> 'paid_total')::numeric = 16000, 'dashboard paid total adds up');
select t.ok((public.admin_dashboard() ->> 'unlocked_principal')::numeric = 100000 and (public.admin_dashboard() ->> 'locked_principal')::numeric = 250000, 'dashboard: 1,00,000 unlocked, 2,50,000 still locked until 28 Feb');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((select count(*) from public.announcements) = 1, 'investor sees the published announcement');
select t.ok(public.mark_notifications_read(null) > 0, 'investor marks notifications read');
select t.ok((select count(*) from public.notifications where read_at is null) = 0, 'no unread left');
reset role;
select t.ok((select count(*) from public.ledger_entries l join public.investments i on i.id = l.investment_id where l.type = 'return_payout' and l.status = 'confirmed') = 8, 'every paid return has one confirmed ledger line');
