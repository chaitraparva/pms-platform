-- Tests for migration 5: branches, 2% / 3.3% / 6% plans, unlocked principal,
-- brochures and the property catalog. Runs after 10_logic_test.sql on the same
-- local database (the clock is at 1 Feb 2027 and two investments exist).
\set ON_ERROR_STOP 1

select t.ok((select string_agg(name, ',' order by name) from public.branches) = 'Bangalore,Tumkur', 'Tumkur and Bangalore branches exist');
select t.ok(public.pms_monthly_return(100000, 3.3) = 3300, '3.3% of 1,00,000 = 3,300');
select t.ok(public.pms_monthly_return(123457, 3.3) = 4074.08, '3.3% of 1,23,457 = 4,074.08 (rounded, no float error)');

-- ===== investor cannot use the new admin functions
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.err($$select public.admin_set_investor_branch(array['bbbbbbbb-0000-0000-0000-000000000001'::uuid], (select id from public.branches where code = 'BLR'), 'x')$$, 'Only an active Super Admin', 'investor cannot change branches');
select t.err($$select public.admin_dashboard()$$, 'Only an active Super Admin', 'investor cannot read the admin dashboard');
select t.err($$select public.admin_save_brochure(null, '{"title":"x"}')$$, 'Only an active Super Admin', 'investor cannot add brochures');
select t.err($$select public.admin_save_property(null, '{"title":"x","url":"https://parvarealty.ae/"}')$$, 'Only an active Super Admin', 'investor cannot add properties');
select t.ok((select count(*) from public.branches) = 0, 'investor without a branch sees no branch rows');
reset role;

-- ===== admin: branches, plans
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((public.admin_dashboard() ->> 'unassigned_investors')::int = 2, 'both investors start without a branch');
select t.err($$select public.admin_set_investor_branch(array['bbbbbbbb-0000-0000-0000-000000000001'::uuid], (select id from public.branches where code = 'TMK'), '')$$, 'reason', 'branch change needs a reason');
select t.ok(public.admin_set_investor_branch(array['bbbbbbbb-0000-0000-0000-000000000001'::uuid], (select id from public.branches where code = 'TMK'), 'Joined via Tumkur office') = 1, 'investor 1 assigned to Tumkur');
select t.ok(public.admin_set_investor_branch(array['bbbbbbbb-0000-0000-0000-000000000002'::uuid], (select id from public.branches where code = 'BLR'), 'Joined via Bangalore office') = 1, 'investor 2 assigned to Bangalore');
select t.ok(public.admin_set_investor_branch(array['bbbbbbbb-0000-0000-0000-000000000002'::uuid], (select id from public.branches where code = 'BLR'), 'again') = 0, 'assigning the same branch again changes nothing');
select t.ok(public.admin_set_investor_branch(array['aaaaaaaa-0000-0000-0000-000000000002'::uuid], (select id from public.branches where code = 'BLR'), 'not an investor') = 0, 'admins are never given a branch');
select t.ok((select count(*) from public.audit_logs where action = 'investor.branch') = 2, 'each branch change is in the audit log');

select t.ok(public.admin_create_standard_plans(true) = 3, 'standard 2%, 3.3% and 6% plans created');
select t.ok(public.admin_create_standard_plans(true) = 0, 'creating them again adds nothing');
select t.ok((select string_agg(pv.monthly_rate::text || ':' || array_to_string(pv.lockin_options, '/'), ',' order by pv.monthly_rate)
             from public.plans p join public.plan_versions pv on pv.plan_id = p.id and pv.version = p.current_version where p.code in ('P2', 'P33', 'P6'))
             = '2.0000:6/12,3.3000:6/12,6.0000:6/12', 'each standard plan offers 6- and 12-month lock-ins');
select set_config('pms.today', '2027-02-01', false);
insert into t.ctx values ('inv3', public.admin_record_investment('bbbbbbbb-0000-0000-0000-000000000002', (select id from public.plans where code = 'P33'), 12, 300000, null, 'AGR-3', '', ''));
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);
set role authenticated;
select public.admin_activate_investment((select v from t.ctx where k='inv3'), '2027-02-01', 'NEFT-3', '');
select t.ok((select (monthly_rate, monthly_return, maturity_date)::text from public.investments where id = (select v from t.ctx where k='inv3')) = '(3.3000,9900.00,2028-02-01)', '3.3% plan: 9,900 a month, 12-month lock-in ends 1 Feb 2028');

-- dashboard reconciles: branch rows add up to the totals
select t.ok((select sum((b ->> 'principal')::numeric) from jsonb_array_elements(public.admin_dashboard() -> 'by_branch') b) = (public.admin_dashboard() ->> 'principal_invested')::numeric, 'branch principal adds up to total principal');
select t.ok((select (b ->> 'investors', b ->> 'principal', b ->> 'unlocked', b ->> 'locked')::text from jsonb_array_elements(public.admin_dashboard() -> 'by_branch') b where b ->> 'name' = 'Tumkur') = '(1,100000.00,100000.00,0)', 'Tumkur: 1 investor, 1,00,000 all unlocked');
select t.ok((select (b ->> 'investors', b ->> 'principal', b ->> 'unlocked', b ->> 'locked')::text from jsonb_array_elements(public.admin_dashboard() -> 'by_branch') b where b ->> 'name' = 'Bangalore') = '(1,550000.00,0,550000.00)', 'Bangalore: 1 investor, 5,50,000 all locked');
select t.ok((public.admin_dashboard((select id from public.branches where code = 'TMK')) ->> 'principal_invested')::numeric = 100000, 'dashboard filtered to Tumkur');
select t.ok((select string_agg((r ->> 'rate') || '=' || (r ->> 'investors'), ',') from jsonb_array_elements(public.admin_dashboard() -> 'by_rate') r) = '2.0000=1,3.3000=1,4.0000=1', 'investors counted by contracted rate (historical 4% kept)');
select t.ok(exists (select 1 from public.admin_review_flags() where code = (select code from public.investments where id = (select v from t.ctx where k='inv2')) and reason like '%4%not one of%'), 'the historical 4% investment is flagged for review, not changed');
select t.ok((select monthly_rate from public.investments where id = (select v from t.ctx where k='inv2')) = 4, 'flagged investment keeps its 4% rate');
select t.err($$select public.admin_dashboard(null, '2027-03-01', '2027-01-01')$$, 'before its end', 'date range must be in order');
reset role;

-- ===== brochures
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select t.err($$select public.admin_save_brochure(null, '{"title":"Plan sheet","mime":"application/zip","storage_path":"x.zip"}')$$, 'PDF, PNG', 'only PDF or image brochures');
insert into t.ctx values ('bro_all', public.admin_save_brochure(null, '{"title":"3.3% plan launch","description":"New plan","storage_path":"b/all.pdf","file_name":"all.pdf","mime":"application/pdf","size_bytes":1000}'));
insert into t.ctx values ('bro_blr', public.admin_save_brochure(null, jsonb_build_object('title', 'Bangalore update', 'storage_path', 'b/blr.pdf', 'mime', 'application/pdf', 'branch_id', (select id from public.branches where code = 'BLR'))));
insert into t.ctx values ('bro_nofile', public.admin_save_brochure(null, '{"title":"Draft without file"}'));
select t.err($$select public.admin_set_brochure_status((select v from t.ctx where k='bro_nofile'), 'published')$$, 'Upload the brochure file', 'cannot publish without a file');
select t.ok(public.admin_set_brochure_status((select v from t.ctx where k='bro_all'), 'published') = 2, 'brochure for everyone notifies 2 investors');
select t.ok(public.admin_set_brochure_status((select v from t.ctx where k='bro_blr'), 'published') = 1, 'Bangalore brochure notifies 1 investor');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((select count(*) from public.my_brochures()) = 1, 'Tumkur investor sees only the brochure for everyone');
select t.ok((select count(*) from public.brochures) = 1, 'row-level security hides other branches'' brochures');
select t.ok((select not seen and not acknowledged from public.my_brochures()), 'brochure starts unseen');
select t.err($$select public.mark_brochure_seen((select v from t.ctx where k='bro_blr'), true)$$, 'not available', 'cannot acknowledge a brochure meant for another branch');
select public.mark_brochure_seen((select v from t.ctx where k='bro_all'), true);
select t.ok((select seen and acknowledged from public.my_brochures()), 'acknowledged brochure is remembered');
select t.ok((select read_at is not null from public.notifications where kind = 'brochure' and source_id = (select v from t.ctx where k='bro_all')), 'its notification is marked read');
select t.ok((select count(*) from public.branches) = 1, 'investor sees their own branch');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select public.admin_save_brochure((select v from t.ctx where k='bro_all'), '{"title":"3.3% plan launch","storage_path":"b/all-v2.pdf","file_name":"all-v2.pdf","mime":"application/pdf"}');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((select not acknowledged from public.my_brochures()), 'a replaced brochure file is shown again');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select public.admin_set_brochure_status((select v from t.ctx where k='bro_all'), 'archived', 'superseded');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((select count(*) from public.my_brochures()) = 0, 'archived brochure disappears for investors');
reset role;

-- ===== property catalog
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select t.err($$select public.admin_save_property(null, '{"title":"Villa","url":"http://parvarealty.ae/"}')$$, 'https://', 'property links must be https');
insert into t.ctx values ('prop1', public.admin_save_property(null, '{"title":"Listings","url":"https://parvarealty.ae/","status":"published"}'));
insert into t.ctx values ('prop2', public.admin_save_property(null, '{"title":"Draft","url":"https://parvarealty.ae/"}'));
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', false);
set role authenticated;
select t.ok((select count(*) from public.properties) = 1, 'investors see only published properties');
select t.err($$insert into public.properties (title, url) values ('x', 'https://x.test')$$, 'permission denied', 'investors cannot add properties');
reset role;
\echo ALL TESTS PASSED
