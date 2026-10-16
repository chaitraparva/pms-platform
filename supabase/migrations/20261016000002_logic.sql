-- =====================================================================
-- PMS Investment Platform · 2/4 · Business logic
-- Every money-moving action is a SECURITY DEFINER function that checks
-- the caller's role, validates input, locks rows, writes the ledger and
-- the audit log in the same transaction. The browser never computes or
-- writes balances.
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.pms_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.settings where id = 1), 'UTC'))::date
$$;

-- Calendar-month arithmetic from the ORIGINAL date. PostgreSQL clamps to month end:
-- 31 May + 6 months = 30 Nov; 31 Aug 2027 + 6 months = 29 Feb 2028.
create or replace function public.pms_add_months(d date, n int) returns date
language sql immutable as $$ select (d + make_interval(months => n))::date $$;

-- Simple interest on the original principal, rounded half-up to 2 decimals per entry.
create or replace function public.pms_monthly_return(p_principal numeric, p_rate numeric) returns numeric
language sql immutable as $$ select round(p_principal * p_rate / 100.0, 2) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and account_status = 'active')
$$;

create or replace function public.pms_require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin can do this.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.pms_actor_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(full_name, '') from public.profiles where id = p_id), (select email from public.profiles where id = p_id), 'System')
$$;

create or replace function public.pms_audit(p_action text, p_entity text, p_id uuid, p_label text, p_reason text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, entity_label, reason, before, after)
  values (auth.uid(), public.pms_actor_name(auth.uid()), p_action, p_entity, p_id, coalesce(p_label, ''), coalesce(p_reason, ''), p_before, p_after)
$$;

create or replace function public.pms_notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_src_table text, p_src_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link, source_table, source_id)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_link, ''), p_src_table, p_src_id)
  on conflict (user_id, kind, source_id) where source_id is not null do nothing
$$;

create or replace function public.pms_notify_admins(p_kind text, p_title text, p_body text, p_link text, p_src_table text, p_src_id uuid)
returns void language sql security definer set search_path = public as $$
  select public.pms_notify(id, p_kind, p_title, p_body, p_link, p_src_table, p_src_id)
  from public.profiles where role = 'super_admin' and account_status = 'active'
$$;

-- Four-eyes rule: when enabled and more than one active admin exists, the person who
-- performed the previous step cannot perform the approving step.
create or replace function public.pms_check_four_eyes(p_previous_actor uuid, p_what text) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_on boolean; v_admins int;
begin
  select four_eyes into v_on from public.settings where id = 1;
  select count(*) into v_admins from public.profiles where role = 'super_admin' and account_status = 'active';
  if v_on and v_admins > 1 and p_previous_actor is not null and p_previous_actor = auth.uid() then
    raise exception 'A different Super Admin must %. You performed the previous step.', p_what using errcode = '42501';
  end if;
end $$;

create or replace function public.pms_fmt_money(p numeric) returns text
language sql stable security definer set search_path = public as $$
  select (case (select currency from public.settings where id = 1) when 'INR' then '₹' when 'AED' then 'AED ' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' else '' end)
         || to_char(p, 'FM999,999,999,990.00')
$$;

-- ---------- bootstrap (run once from the Supabase SQL editor) ----------
create or replace function public.bootstrap_super_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'super_admin') then
    raise exception 'A Super Admin already exists. Add more admins from Settings → Administrators.';
  end if;
  select id into v_id from public.profiles where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No user with email %. Create the user first in Authentication → Users.', p_email;
  end if;
  update public.profiles set role = 'super_admin', kyc_status = 'verified', account_status = 'active',
         code = 'ADM-' || nextval('public.admin_code_seq') where id = v_id;
  insert into public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, entity_label, reason)
  values (null, 'Setup', 'admin.bootstrap', 'profile', v_id, p_email, 'First Super Admin created from SQL editor');
  return 'Super Admin created for ' || p_email;
end $$;

-- ---------- settings ----------
create or replace function public.admin_save_settings(p jsonb, p_reason text default 'Settings updated') returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform public.pms_require_admin();
  select to_jsonb(s) into v_before from public.settings s where id = 1;
  update public.settings set
    company_name        = coalesce(p ->> 'company_name', company_name),
    tagline             = coalesce(p ->> 'tagline', tagline),
    logo_url            = case when p ? 'logo_url' then nullif(p ->> 'logo_url', '') else logo_url end,
    primary_color       = coalesce(p ->> 'primary_color', primary_color),
    currency            = coalesce(p ->> 'currency', currency),
    locale              = coalesce(p ->> 'locale', locale),
    timezone            = coalesce(p ->> 'timezone', timezone),
    approaching_days    = coalesce((p ->> 'approaching_days')::int, approaching_days),
    request_window_days = coalesce((p ->> 'request_window_days')::int, request_window_days),
    default_payout_lag_days = coalesce((p ->> 'default_payout_lag_days')::int, default_payout_lag_days),
    four_eyes           = coalesce((p ->> 'four_eyes')::boolean, four_eyes),
    allow_custom_lockin = coalesce((p ->> 'allow_custom_lockin')::boolean, allow_custom_lockin),
    lockin_options      = coalesce((select array_agg(x::int order by x::int) from jsonb_array_elements_text(p -> 'lockin_options') x), lockin_options),
    default_terms       = coalesce(p ->> 'default_terms', default_terms),
    default_risk_disclosure = coalesce(p ->> 'default_risk_disclosure', default_risk_disclosure),
    support_email       = coalesce(p ->> 'support_email', support_email),
    support_phone       = coalesce(p ->> 'support_phone', support_phone),
    legal_footer        = coalesce(p ->> 'legal_footer', legal_footer),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform public.pms_audit('settings.update', 'settings', null, 'settings', p_reason, v_before, (select to_jsonb(s) from public.settings s where id = 1));
end $$;

-- ---------- investors ----------
create or replace function public.admin_update_investor(p_id uuid, p jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select to_jsonb(x) into v_before from public.profiles x where id = p_id;
  if v_before is null then raise exception 'Investor not found.'; end if;
  update public.profiles set
    full_name = coalesce(p ->> 'full_name', full_name),
    phone = coalesce(p ->> 'phone', phone),
    address = coalesce(p ->> 'address', address),
    city = coalesce(p ->> 'city', city),
    id_number_masked = coalesce(p ->> 'id_number_masked', id_number_masked),
    bank_name = coalesce(p ->> 'bank_name', bank_name),
    bank_account_masked = coalesce(p ->> 'bank_account_masked', bank_account_masked),
    bank_ifsc = coalesce(p ->> 'bank_ifsc', bank_ifsc),
    updated_at = now()
  where id = p_id;
  perform public.pms_audit('investor.update', 'profile', p_id, v_before ->> 'code', p_reason, v_before, (select to_jsonb(x) from public.profiles x where id = p_id));
end $$;

create or replace function public.admin_set_investor_status(p_id uuid, p_status public.account_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.account_status; v_code text;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if p_id = auth.uid() then raise exception 'You cannot change your own account status.'; end if;
  select account_status, code into v_old, v_code from public.profiles where id = p_id for update;
  update public.profiles set account_status = p_status, updated_at = now() where id = p_id;
  perform public.pms_audit('investor.status', 'profile', p_id, v_code, p_reason, jsonb_build_object('account_status', v_old), jsonb_build_object('account_status', p_status));
end $$;

create or replace function public.admin_set_kyc(p_id uuid, p_status public.kyc_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.kyc_status; v_code text;
begin
  perform public.pms_require_admin();
  select kyc_status, code into v_old, v_code from public.profiles where id = p_id for update;
  update public.profiles set kyc_status = p_status, updated_at = now() where id = p_id;
  perform public.pms_notify(p_id, 'kyc_' || p_status, case p_status when 'verified' then 'Your account is verified' when 'rejected' then 'Verification needs attention' else 'Verification pending' end,
    coalesce(p_reason, ''), '/portal/profile', 'profiles_kyc', gen_random_uuid());
  perform public.pms_audit('investor.kyc', 'profile', p_id, v_code, p_reason, jsonb_build_object('kyc_status', v_old), jsonb_build_object('kyc_status', p_status));
end $$;

create or replace function public.admin_set_role(p_id uuid, p_role public.user_role, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.user_role; v_code text;
begin
  perform public.pms_require_admin();
  if p_id = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select role, code into v_old, v_code from public.profiles where id = p_id for update;
  update public.profiles set role = p_role,
    code = case when p_role = 'super_admin' and v_old <> 'super_admin' then 'ADM-' || nextval('public.admin_code_seq') else code end,
    kyc_status = case when p_role = 'super_admin' then 'verified' else kyc_status end,
    updated_at = now() where id = p_id;
  perform public.pms_audit('user.role', 'profile', p_id, v_code, p_reason, jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
end $$;

create or replace function public.update_my_profile(p_phone text, p_address text, p_city text, p_notify_email boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update public.profiles set phone = coalesce(p_phone, phone), address = coalesce(p_address, address), city = coalesce(p_city, city),
         notify_email = coalesce(p_notify_email, notify_email), updated_at = now()
  where id = auth.uid();
end $$;

-- ---------- plans ----------
create or replace function public.pms_insert_plan_version(p_plan uuid, p_version int, v jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lock int[];
begin
  select array_agg(x::int order by x::int) into v_lock from jsonb_array_elements_text(v -> 'lockin_options') x;
  insert into public.plan_versions (plan_id, version, monthly_rate, min_amount, max_amount, lockin_options, allow_custom_lockin,
    eligible_from, eligible_to, early_redemption, early_fee_pct, payout_lag_days, terms, risk_disclosure, effective_from, change_reason, created_by)
  values (p_plan, p_version, (v ->> 'monthly_rate')::numeric, (v ->> 'min_amount')::numeric, (v ->> 'max_amount')::numeric, coalesce(v_lock, '{}'),
    coalesce((v ->> 'allow_custom_lockin')::boolean, false),
    coalesce((v ->> 'eligible_from')::date, public.pms_today()), nullif(v ->> 'eligible_to', '')::date,
    coalesce(v ->> 'early_redemption', 'not_permitted'), coalesce((v ->> 'early_fee_pct')::numeric, 0),
    coalesce((v ->> 'payout_lag_days')::int, (select default_payout_lag_days from public.settings where id = 1)),
    coalesce(v ->> 'terms', ''), coalesce(v ->> 'risk_disclosure', ''),
    coalesce(nullif(v ->> 'effective_from', '')::date, public.pms_today()), p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_create_plan(p_code text, p_name text, p_description text, p_version jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  perform public.pms_require_admin();
  v_code := upper(coalesce(nullif(trim(p_code), ''), 'PLN-' || lpad(nextval('public.plan_code_seq')::text, 3, '0')));
  insert into public.plans (code, name, description, status, current_version, created_by, updated_by)
  values (v_code, trim(p_name), coalesce(p_description, ''), 'draft', 1, auth.uid(), auth.uid()) returning id into v_id;
  perform public.pms_insert_plan_version(v_id, 1, p_version, 'Plan created');
  perform public.pms_audit('plan.create', 'plan', v_id, v_code, 'Plan created', null, p_version);
  return v_id;
end $$;

-- Editing a plan never touches existing investments: it adds a new immutable version.
create or replace function public.admin_update_plan(p_plan uuid, p_name text, p_description text, p_version jsonb, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare v_plan public.plans; v_prev jsonb; v_new int;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason for the change is required.'; end if;
  select * into v_plan from public.plans where id = p_plan for update;
  if v_plan.id is null then raise exception 'Plan not found.'; end if;
  if v_plan.status = 'archived' then raise exception 'Archived plans cannot be edited.'; end if;
  select to_jsonb(pv) into v_prev from public.plan_versions pv where plan_id = p_plan and version = v_plan.current_version;
  v_new := v_plan.current_version + 1;
  perform public.pms_insert_plan_version(p_plan, v_new, p_version, p_reason);
  update public.plans set name = coalesce(nullif(trim(p_name), ''), name), description = coalesce(p_description, description),
         current_version = v_new, updated_by = auth.uid(), updated_at = now() where id = p_plan;
  perform public.pms_audit('plan.version.create', 'plan', p_plan, v_plan.code || ' v' || v_new, p_reason, v_prev, p_version);
  return v_new;
end $$;

create or replace function public.admin_set_plan_status(p_plan uuid, p_status public.plan_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.plan_status; v_code text;
begin
  perform public.pms_require_admin();
  select status, code into v_old, v_code from public.plans where id = p_plan for update;
  if v_old is null then raise exception 'Plan not found.'; end if;
  update public.plans set status = p_status, updated_by = auth.uid(), updated_at = now() where id = p_plan;
  perform public.pms_audit('plan.status', 'plan', p_plan, v_code, p_reason, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end $$;

-- ---------- investments ----------
create or replace function public.admin_record_investment(
  p_investor uuid, p_plan uuid, p_lockin_months int, p_principal numeric,
  p_expected_start date, p_agreement_ref text, p_deposit_ref text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.profiles; v_plan public.plans; v_pv public.plan_versions; v_id uuid; v_code text; v_set public.settings;
begin
  perform public.pms_require_admin();
  select * into v_set from public.settings where id = 1;
  select * into v_inv from public.profiles where id = p_investor;
  if v_inv.id is null or v_inv.role <> 'investor' then raise exception 'Choose a valid investor.'; end if;
  if v_inv.kyc_status <> 'verified' then raise exception '% is not verified yet. Verify KYC before recording an investment.', v_inv.full_name; end if;
  if v_inv.account_status <> 'active' then raise exception '% has a suspended account.', v_inv.full_name; end if;
  select * into v_plan from public.plans where id = p_plan;
  if v_plan.status <> 'active' then raise exception 'Plan % is not active.', v_plan.name; end if;
  -- the version in force today (latest version whose effective date has arrived)
  select * into v_pv from public.plan_versions where plan_id = p_plan and effective_from <= public.pms_today() order by version desc limit 1;
  if v_pv.id is null then raise exception 'Plan % has no version in effect yet.', v_plan.name; end if;
  if public.pms_today() < v_pv.eligible_from or (v_pv.eligible_to is not null and public.pms_today() > v_pv.eligible_to) then
    raise exception 'Plan % is not open for new investments today.', v_plan.name; end if;
  if p_principal is null or p_principal < v_pv.min_amount or p_principal > v_pv.max_amount then
    raise exception 'Principal must be between % and %.', public.pms_fmt_money(v_pv.min_amount), public.pms_fmt_money(v_pv.max_amount); end if;
  if p_principal <> round(p_principal, 2) then raise exception 'Principal can have at most 2 decimals.'; end if;
  if not (p_lockin_months = any (v_pv.lockin_options)) and not (v_pv.allow_custom_lockin and v_set.allow_custom_lockin and p_lockin_months between 1 and 120) then
    raise exception 'Lock-in of % months is not offered on this plan.', p_lockin_months; end if;

  insert into public.investments (investor_id, plan_id, plan_version_id, plan_name, plan_version, monthly_rate, lockin_months,
    early_redemption, early_fee_pct, payout_lag_days, terms, risk_disclosure, principal, monthly_return,
    status, expected_start, agreement_ref, deposit_ref, notes, created_by)
  values (p_investor, p_plan, v_pv.id, v_plan.name, v_pv.version, v_pv.monthly_rate, p_lockin_months,
    v_pv.early_redemption, v_pv.early_fee_pct, v_pv.payout_lag_days,
    coalesce(nullif(v_pv.terms, ''), v_set.default_terms), coalesce(nullif(v_pv.risk_disclosure, ''), v_set.default_risk_disclosure),
    p_principal, public.pms_monthly_return(p_principal, v_pv.monthly_rate),
    'pending_funding', p_expected_start, coalesce(p_agreement_ref, ''), coalesce(p_deposit_ref, ''), coalesce(p_notes, ''), auth.uid())
  returning id, code into v_id, v_code;

  insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
  values (v_id, p_investor, 'deposit', p_principal, 'pending', coalesce(p_expected_start, public.pms_today()), coalesce(p_deposit_ref, ''), 'Awaiting bank confirmation', 'investments', v_id, auth.uid());

  perform public.pms_audit('investment.create', 'investment', v_id, v_code, 'Investment recorded', null,
    jsonb_build_object('principal', p_principal, 'plan', v_plan.code, 'version', v_pv.version, 'rate', v_pv.monthly_rate, 'lockin_months', p_lockin_months));
  return v_id;
end $$;

-- Confirming the deposit activates the investment and fixes its dates. A start date in the past
-- is allowed (for loading existing investments); past periods are accrued immediately.
create or replace function public.admin_activate_investment(p_id uuid, p_start_date date, p_deposit_ref text, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v public.investments; v_set public.settings; v_maturity date;
begin
  perform public.pms_require_admin();
  select * into v_set from public.settings where id = 1;
  select * into v from public.investments where id = p_id for update;
  if v.id is null then raise exception 'Investment not found.'; end if;
  if v.status <> 'pending_funding' then raise exception '% is already %.', v.code, v.status; end if;
  perform public.pms_check_four_eyes(v.created_by, 'confirm this deposit');
  if p_start_date is null or p_start_date > public.pms_today() then raise exception 'Start date must be today or earlier (the date funds were received).'; end if;
  if coalesce(trim(p_deposit_ref), '') = '' then raise exception 'Enter the bank reference for the deposit.'; end if;
  v_maturity := public.pms_add_months(p_start_date, v.lockin_months);
  update public.investments set status = 'active', start_date = p_start_date, lockin_end_date = v_maturity, maturity_date = v_maturity,
    request_from_date = v_maturity - v_set.request_window_days, deposit_ref = p_deposit_ref, activated_by = auth.uid(), activated_at = now()
  where id = p_id;
  update public.ledger_entries set status = 'confirmed', reference = p_deposit_ref, occurred_on = p_start_date, note = 'Deposit confirmed'
    where source_table = 'investments' and source_id = p_id and type = 'deposit';
  insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
  values (p_id, v.investor_id, 'allocation', v.principal, 'posted', p_start_date, v.agreement_ref, v.plan_name || ' v' || v.plan_version, 'investments', p_id, auth.uid())
  on conflict do nothing;
  perform public.pms_notify(v.investor_id, 'investment_active', 'Investment ' || v.code || ' is active',
    public.pms_fmt_money(v.principal) || ' at ' || to_char(v.monthly_rate, 'FM990.00') || '% per month · matures ' || to_char(v_maturity, 'DD Mon YYYY'),
    '/portal/investments/' || v.code, 'investments', p_id);
  perform public.pms_audit('investment.activate', 'investment', p_id, v.code, coalesce(nullif(p_reason, ''), 'Deposit confirmed ' || p_deposit_ref),
    jsonb_build_object('status', 'pending_funding'), jsonb_build_object('status', 'active', 'start_date', p_start_date, 'maturity_date', v_maturity));
  perform public.pms_run_accruals_for(p_id, public.pms_today());
end $$;

create or replace function public.admin_cancel_investment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.investments;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into v from public.investments where id = p_id for update;
  if v.status <> 'pending_funding' then raise exception 'Only investments awaiting funding can be cancelled.'; end if;
  update public.investments set status = 'cancelled', cancelled_reason = p_reason where id = p_id;
  update public.ledger_entries set status = 'reversed', note = 'Cancelled: ' || p_reason where source_table = 'investments' and source_id = p_id and type = 'deposit';
  perform public.pms_audit('investment.cancel', 'investment', p_id, v.code, p_reason, jsonb_build_object('status', v.status), jsonb_build_object('status', 'cancelled'));
end $$;

create or replace function public.admin_record_amendment(p_id uuid, p_description text, p_effective date, p_document_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_description), '') = '' then raise exception 'Describe the amendment.'; end if;
  select code into v_code from public.investments where id = p_id;
  insert into public.contract_amendments (investment_id, description, effective_date, document_path, requested_by)
  values (p_id, p_description, p_effective, p_document_path, auth.uid()) returning id into v_id;
  perform public.pms_audit('investment.amendment.request', 'investment', p_id, v_code, p_description, null, jsonb_build_object('effective_date', p_effective));
  return v_id;
end $$;

create or replace function public.admin_approve_amendment(p_amendment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.contract_amendments; v_code text;
begin
  perform public.pms_require_admin();
  select * into a from public.contract_amendments where id = p_amendment for update;
  if a.approved_at is not null then raise exception 'Already approved.'; end if;
  perform public.pms_check_four_eyes(a.requested_by, 'approve this amendment');
  update public.contract_amendments set approved_by = auth.uid(), approved_at = now() where id = p_amendment;
  select code into v_code from public.investments where id = a.investment_id;
  perform public.pms_audit('investment.amendment.approve', 'investment', a.investment_id, v_code, a.description, null, null);
end $$;

-- ---------- accrual engine ----------
-- Period k runs from start + (k-1) months to the day before start + k months and
-- accrues on start + k months. Returns the number of accruals created.
create or replace function public.pms_run_accruals_for(p_investment uuid, p_as_of date) returns int
language plpgsql security definer set search_path = public as $$
declare v public.investments; k int; v_end date; v_start date; v_acc uuid; v_n int := 0; v_set public.settings;
begin
  select * into v from public.investments where id = p_investment for update;
  if v.start_date is null or v.status not in ('active', 'matured', 'redemption_requested', 'redemption_processing') then return 0; end if;
  select * into v_set from public.settings where id = 1;
  for k in 1 .. v.lockin_months loop
    v_end := public.pms_add_months(v.start_date, k);
    exit when v_end > p_as_of;
    v_start := public.pms_add_months(v.start_date, k - 1);
    insert into public.accruals (investment_id, period_no, kind, period_start, period_end, accrual_date, days, days_in_period, amount)
    values (v.id, k, 'regular', v_start, v_end - 1, v_end, v_end - v_start, v_end - v_start, v.monthly_return)
    on conflict (investment_id, period_no) where kind in ('regular', 'stub') do nothing
    returning id into v_acc;
    if v_acc is not null then
      v_n := v_n + 1;
      insert into public.payouts (accrual_id, investment_id, investor_id, amount, due_date)
      values (v_acc, v.id, v.investor_id, v.monthly_return, v_end + v.payout_lag_days);
      insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id)
      values (v.id, v.investor_id, 'return_accrual', v.monthly_return, 'posted', v_end, v.code || ' · period ' || k,
              'Monthly return ' || to_char(v.monthly_rate, 'FM990.00') || '% on ' || public.pms_fmt_money(v.principal), 'accruals', v_acc);
      perform public.pms_notify(v.investor_id, 'accrual', 'Return accrued on ' || v.code || ': ' || public.pms_fmt_money(v.monthly_return),
        'Month ' || k || ' of ' || v.lockin_months || ' · not yet paid', '/portal/investments/' || v.code, 'accruals', v_acc);
      v_acc := null;
    end if;
  end loop;
  if v.status = 'active' and v.maturity_date <= p_as_of then
    update public.investments set status = 'matured' where id = v.id;
    perform public.pms_notify(v.investor_id, 'matured', v.code || ' has matured', 'You can now request redemption of ' || public.pms_fmt_money(v.principal) || '.',
      '/portal/redemptions', 'investments', v.id);
  elsif v.status = 'active' and v.maturity_date - p_as_of <= v_set.approaching_days then
    perform public.pms_notify(v.investor_id, 'maturity_reminder', 'Maturity reminder: ' || v.code || ' matures ' || to_char(v.maturity_date, 'DD Mon YYYY'),
      'You can request redemption from ' || to_char(v.request_from_date, 'DD Mon YYYY') || '.', '/portal/lock-in', 'investments', v.id);
  end if;
  return v_n;
end $$;

create or replace function public.pms_run_accruals(p_as_of date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_total int := 0; v_as_of date := coalesce(p_as_of, public.pms_today());
begin
  for r in select id from public.investments where status in ('active', 'matured', 'redemption_requested', 'redemption_processing') and start_date is not null loop
    v_total := v_total + public.pms_run_accruals_for(r.id, v_as_of);
  end loop;
  return jsonb_build_object('as_of', v_as_of, 'created', v_total);
end $$;

create or replace function public.admin_run_accruals() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.pms_require_admin();
  v := public.pms_run_accruals(null);
  perform public.pms_audit('job.accrual.run', 'job', null, 'accruals ' || (v ->> 'as_of'), 'Manual run', null, v);
  return v;
end $$;

-- Wrong accruals are corrected with a reversing entry, never deleted.
create or replace function public.admin_reverse_accrual(p_accrual uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.accruals; p public.payouts; v_rev uuid; v_code text;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into a from public.accruals where id = p_accrual;
  if a.id is null or a.kind = 'reversal' then raise exception 'Accrual not found.'; end if;
  select * into p from public.payouts where accrual_id = p_accrual for update;
  if p.status in ('paid', 'processing') then raise exception 'This return is % . Record an adjustment instead of reversing it.', p.status; end if;
  insert into public.accruals (investment_id, period_no, kind, period_start, period_end, accrual_date, days, days_in_period, amount, reverses_id, reason, created_by)
  values (a.investment_id, a.period_no, 'reversal', a.period_start, a.period_end, public.pms_today(), a.days, a.days_in_period, -a.amount, a.id, p_reason, auth.uid())
  returning id into v_rev;
  update public.payouts set status = 'cancelled', failure_reason = 'Accrual reversed: ' || p_reason, updated_at = now() where id = p.id;
  select code into v_code from public.investments where id = a.investment_id;
  insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
  values (a.investment_id, p.investor_id, 'reversal', -a.amount, 'posted', public.pms_today(), v_code || ' · period ' || a.period_no, p_reason, 'accruals', v_rev, auth.uid());
  perform public.pms_audit('accrual.reverse', 'accrual', a.id, v_code || ' period ' || a.period_no, p_reason,
    jsonb_build_object('amount', a.amount), jsonb_build_object('reversal', -a.amount));
end $$;

-- ---------- payouts ----------
-- accrued → approved → processing → paid ; processing → failed → approved (retry)
create or replace function public.admin_payouts_transition(p_ids uuid[], p_to public.payout_status, p_ref text default null, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare p record; v_n int := 0; v_from public.payout_status[]; v_bad int; v_ref text := nullif(trim(coalesce(p_ref, '')), ''); v_code text; v_paid_on date := public.pms_today();
begin
  perform public.pms_require_admin();
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Select at least one payout.'; end if;
  v_from := case p_to when 'approved' then array['accrued', 'failed']::public.payout_status[]
                      when 'processing' then array['approved']::public.payout_status[]
                      when 'paid' then array['processing']::public.payout_status[]
                      when 'failed' then array['processing']::public.payout_status[]
                      else null end;
  if v_from is null then raise exception 'Payouts cannot be moved to %.', p_to; end if;
  if p_to = 'paid' and v_ref is null then raise exception 'Enter the bank reference that confirms these payments.'; end if;
  if p_to = 'failed' and coalesce(trim(p_reason), '') = '' then raise exception 'Enter why the payment failed.'; end if;
  -- lock all rows first so two admins cannot process the same payouts at once
  perform 1 from public.payouts where id = any (p_ids) for update;
  select count(*) into v_bad from public.payouts where id = any (p_ids) and not (status = any (v_from));
  if v_bad > 0 then raise exception '% of the selected payouts cannot move to % from their current status (someone may have just processed them). Refresh and try again.', v_bad, p_to using errcode = '40001'; end if;
  if p_to = 'processing' and v_ref is null then v_ref := 'BATCH-' || to_char(now(), 'YYYYMMDD-HH24MISS'); end if;

  for p in select * from public.payouts where id = any (p_ids) loop
    select code into v_code from public.investments where id = p.investment_id;
    if p_to = 'approved' then
      update public.payouts set status = 'approved', approved_by = auth.uid(), approved_at = now(), failure_reason = null, updated_at = now() where id = p.id;
    elsif p_to = 'processing' then
      update public.payouts set status = 'processing', sent_by = auth.uid(), sent_at = now(), batch_ref = v_ref, updated_at = now() where id = p.id;
      insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
      values (p.investment_id, p.investor_id, 'return_payout', p.amount, 'pending', public.pms_today(), v_ref, p.code, 'payouts', p.id, auth.uid())
      on conflict (source_table, source_id, type) where source_id is not null do update set status = 'pending', reference = excluded.reference, occurred_on = excluded.occurred_on;
      perform public.pms_notify(p.investor_id, 'payout_processing', 'Payout for ' || v_code || ' is being processed', public.pms_fmt_money(p.amount),
        '/portal/investments/' || v_code, 'payouts', p.id);
    elsif p_to = 'paid' then
      perform public.pms_check_four_eyes(p.sent_by, 'confirm these payments');
      update public.payouts set status = 'paid', payment_ref = v_ref, confirmed_by = auth.uid(), confirmed_at = now(), paid_on = v_paid_on, updated_at = now() where id = p.id;
      update public.ledger_entries set status = 'confirmed', reference = v_ref, occurred_on = v_paid_on where source_table = 'payouts' and source_id = p.id and type = 'return_payout';
      perform public.pms_notify(p.investor_id, 'payout_paid', 'Return paid: ' || public.pms_fmt_money(p.amount) || ' for ' || v_code, 'Reference ' || v_ref,
        '/portal/investments/' || v_code, 'payouts', p.id);
    elsif p_to = 'failed' then
      update public.payouts set status = 'failed', failure_reason = p_reason, updated_at = now() where id = p.id;
      update public.ledger_entries set status = 'failed', note = p_reason where source_table = 'payouts' and source_id = p.id and type = 'return_payout';
    end if;
    v_n := v_n + 1;
  end loop;
  perform public.pms_audit('payout.' || p_to, 'payout', null, v_n || ' payouts', coalesce(p_reason, v_ref, ''), jsonb_build_object('ids', p_ids), jsonb_build_object('status', p_to, 'reference', v_ref));
  return v_n;
end $$;

-- ---------- redemptions ----------
create or replace function public.investor_request_redemption(p_investment uuid, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare v public.investments; v_type text; v_fee numeric := 0; v_code text; v_id uuid; v_today date := public.pms_today();
begin
  select * into v from public.investments where id = p_investment for update;
  if v.id is null or v.investor_id <> auth.uid() then raise exception 'Investment not found.' using errcode = '42501'; end if;
  if v.status not in ('active', 'matured') then raise exception 'A redemption cannot be requested for this investment right now.'; end if;
  if v_today >= v.request_from_date then
    v_type := 'maturity';
  elsif v.early_redemption = 'not_permitted' then
    raise exception 'Your agreement does not allow redemption before %. You can request it from %.', to_char(v.maturity_date, 'DD Mon YYYY'), to_char(v.request_from_date, 'DD Mon YYYY');
  else
    v_type := 'early';
    v_fee := round(v.principal * v.early_fee_pct / 100.0, 2);
  end if;
  begin
    insert into public.redemption_requests (investment_id, investor_id, type, note, payable_on, fee_amount)
    values (v.id, v.investor_id, v_type, coalesce(p_note, ''), greatest(case when v_type = 'early' then v_today else v.maturity_date end, v_today), v_fee)
    returning id, code into v_id, v_code;
  exception when unique_violation then
    raise exception 'There is already an open redemption request for %.', v.code;
  end;
  insert into public.redemption_events (request_id, from_status, to_status, actor_id, actor_name, note) values (v_id, null, 'requested', auth.uid(), public.pms_actor_name(auth.uid()), coalesce(p_note, ''));
  update public.investments set status = 'redemption_requested' where id = v.id;
  insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, source_table, source_id, created_by)
  values (v.id, v.investor_id, 'redemption_request', v.principal, 'pending', v_today, v_code, 'redemption_requests', v_id, auth.uid());
  perform public.pms_notify(v.investor_id, 'redemption_requested', 'Redemption ' || v_code || ' requested', v.code || ' · we will notify you at each step', '/portal/redemptions', 'redemption_requests', v_id);
  perform public.pms_notify_admins('admin_redemption', 'New redemption request ' || v_code, public.pms_actor_name(auth.uid()) || ' · ' || v.code || ' · ' || public.pms_fmt_money(v.principal),
    '/admin/redemptions', 'redemption_requests', v_id);
  perform public.pms_audit('redemption.request', 'redemption', v_id, v_code, coalesce(p_note, ''), null, jsonb_build_object('type', v_type, 'investment', v.code));
  return v_code;
end $$;

create or replace function public.investor_withdraw_redemption(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.redemption_requests; v public.investments;
begin
  select * into r from public.redemption_requests where id = p_request for update;
  if r.id is null or r.investor_id <> auth.uid() then raise exception 'Request not found.' using errcode = '42501'; end if;
  if r.status not in ('requested', 'under_review') then raise exception 'This request can no longer be withdrawn.'; end if;
  update public.redemption_requests set status = 'withdrawn', updated_at = now() where id = r.id;
  insert into public.redemption_events (request_id, from_status, to_status, actor_id, actor_name, note) values (r.id, r.status, 'withdrawn', auth.uid(), public.pms_actor_name(auth.uid()), 'Withdrawn by investor');
  select * into v from public.investments where id = r.investment_id for update;
  update public.investments set status = case when v.maturity_date <= public.pms_today() then 'matured'::public.investment_status else 'active'::public.investment_status end where id = v.id;
  update public.ledger_entries set status = 'reversed', note = 'Withdrawn' where source_table = 'redemption_requests' and source_id = r.id;
  perform public.pms_audit('redemption.withdraw', 'redemption', r.id, r.code, 'Withdrawn by investor', null, null);
end $$;

create or replace function public.admin_redemption_transition(p_request uuid, p_to public.redemption_status, p_note text, p_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.redemption_requests; v public.investments; v_ok boolean; v_today date := public.pms_today();
        v_n int; v_start date; v_end date; v_days int; v_dip int; v_stub numeric; v_acc uuid; p record; v_prev_actor uuid;
begin
  perform public.pms_require_admin();
  select * into r from public.redemption_requests where id = p_request for update;
  if r.id is null then raise exception 'Request not found.'; end if;
  v_ok := (r.status = 'requested' and p_to in ('under_review', 'approved', 'rejected'))
       or (r.status = 'under_review' and p_to in ('approved', 'rejected'))
       or (r.status = 'approved' and p_to = 'processing')
       or (r.status = 'processing' and p_to = 'completed');
  if not v_ok then raise exception 'A % request cannot be moved to %.', r.status, p_to; end if;
  if p_to in ('approved', 'rejected', 'completed') and coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_to = 'completed' and coalesce(trim(p_ref), '') = '' then raise exception 'Enter the bank reference for the settlement.'; end if;
  select * into v from public.investments where id = r.investment_id for update;
  if p_to = 'completed' and r.type = 'maturity' and v_today < r.payable_on then
    raise exception 'This redemption is payable on %. It can be settled from that date.', to_char(r.payable_on, 'DD Mon YYYY');
  end if;
  if p_to = 'completed' then
    select actor_id into v_prev_actor from public.redemption_events where request_id = r.id and to_status = 'approved' order by at desc limit 1;
    perform public.pms_check_four_eyes(v_prev_actor, 'confirm this settlement');
  end if;

  update public.redemption_requests set status = p_to, updated_at = now(),
    decision_reason = case when p_to in ('approved', 'rejected') then p_note else decision_reason end,
    decided_by = case when p_to in ('approved', 'rejected') then auth.uid() else decided_by end,
    decided_at = case when p_to in ('approved', 'rejected') then now() else decided_at end,
    payment_ref = case when p_to = 'completed' then p_ref else payment_ref end,
    completed_by = case when p_to = 'completed' then auth.uid() else completed_by end,
    completed_at = case when p_to = 'completed' then now() else completed_at end
  where id = r.id;
  insert into public.redemption_events (request_id, from_status, to_status, actor_id, actor_name, note)
  values (r.id, r.status, p_to, auth.uid(), public.pms_actor_name(auth.uid()), coalesce(p_note, '') || coalesce(' · ' || p_ref, ''));

  if p_to = 'rejected' then
    update public.investments set status = case when v.maturity_date <= v_today then 'matured'::public.investment_status else 'active'::public.investment_status end where id = v.id;
    update public.ledger_entries set status = 'reversed', note = 'Rejected: ' || p_note where source_table = 'redemption_requests' and source_id = r.id;
  elsif p_to = 'processing' then
    update public.investments set status = 'redemption_processing' where id = v.id;
  elsif p_to = 'completed' then
    -- bring accruals up to date, then add a pro-rata stub for an early exit mid-period
    perform public.pms_run_accruals_for(v.id, v_today);
    if r.type = 'early' and v_today < v.maturity_date then
      select coalesce(max(period_no), 0) into v_n from public.accruals where investment_id = v.id and kind = 'regular';
      v_start := public.pms_add_months(v.start_date, v_n);
      v_end := public.pms_add_months(v.start_date, v_n + 1);
      v_days := v_today - v_start; v_dip := v_end - v_start;
      if v_days > 0 then
        v_stub := round(v.monthly_return * v_days / v_dip, 2);
        insert into public.accruals (investment_id, period_no, kind, period_start, period_end, accrual_date, days, days_in_period, amount, reason, created_by)
        values (v.id, v_n + 1, 'stub', v_start, v_today - 1, v_today, v_days, v_dip, v_stub, 'Early redemption pro-rata', auth.uid())
        on conflict (investment_id, period_no) where kind in ('regular', 'stub') do nothing returning id into v_acc;
        if v_acc is not null then
          insert into public.payouts (accrual_id, investment_id, investor_id, amount, due_date, status) values (v_acc, v.id, v.investor_id, v_stub, v_today, 'processing');
          insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
          values (v.id, v.investor_id, 'return_accrual', v_stub, 'posted', v_today, v.code || ' · stub', v_days || ' of ' || v_dip || ' days', 'accruals', v_acc, auth.uid());
        end if;
      end if;
    end if;
    -- settle every unpaid return with the same bank reference
    for p in select * from public.payouts where investment_id = v.id and status in ('accrued', 'approved', 'processing', 'failed') loop
      update public.payouts set status = 'paid', payment_ref = p_ref, confirmed_by = auth.uid(), confirmed_at = now(), paid_on = v_today, updated_at = now() where id = p.id;
      insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
      values (v.id, v.investor_id, 'return_payout', p.amount, 'confirmed', v_today, p_ref, 'Settled with redemption ' || r.code, 'payouts', p.id, auth.uid())
      on conflict (source_table, source_id, type) where source_id is not null do update set status = 'confirmed', reference = excluded.reference, occurred_on = excluded.occurred_on;
    end loop;
    if r.fee_amount > 0 then
      insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
      values (v.id, v.investor_id, 'fee', -r.fee_amount, 'posted', v_today, r.code, 'Early redemption fee', 'redemption_fee', r.id, auth.uid());
    end if;
    insert into public.ledger_entries (investment_id, investor_id, type, amount, status, occurred_on, reference, note, source_table, source_id, created_by)
    values (v.id, v.investor_id, 'principal_redemption', v.principal - r.fee_amount, 'confirmed', v_today, p_ref, r.code, 'redemption_settlement', r.id, auth.uid());
    update public.ledger_entries set status = 'confirmed' where source_table = 'redemption_requests' and source_id = r.id;
    update public.investments set status = 'redeemed' where id = v.id;
  end if;

  perform public.pms_notify(r.investor_id, 'redemption_' || p_to, 'Redemption ' || r.code || ': ' || replace(p_to::text, '_', ' '),
    coalesce(p_note, ''), '/portal/redemptions', 'redemption_requests', r.id);
  perform public.pms_audit('redemption.' || p_to, 'redemption', r.id, r.code, coalesce(p_note, ''), jsonb_build_object('status', r.status), jsonb_build_object('status', p_to, 'reference', p_ref));
end $$;

-- ---------- announcements ----------
create or replace function public.admin_save_announcement(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ids uuid[];
begin
  perform public.pms_require_admin();
  select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(coalesce(p -> 'audience_investor_ids', '[]')) x;
  if p_id is null then
    insert into public.announcements (title, body, category, audience, audience_plan_id, audience_days, audience_investor_ids, attachment_path, send_email, created_by)
    values (p ->> 'title', coalesce(p ->> 'body', ''), coalesce(p ->> 'category', 'General notice'), coalesce((p ->> 'audience')::public.ann_audience, 'all'),
            nullif(p ->> 'audience_plan_id', '')::uuid, nullif(p ->> 'audience_days', '')::int, v_ids, nullif(p ->> 'attachment_path', ''),
            coalesce((p ->> 'send_email')::boolean, false), auth.uid())
    returning id into v_id;
  else
    update public.announcements set title = p ->> 'title', body = coalesce(p ->> 'body', ''), category = coalesce(p ->> 'category', category),
      audience = coalesce((p ->> 'audience')::public.ann_audience, audience), audience_plan_id = nullif(p ->> 'audience_plan_id', '')::uuid,
      audience_days = nullif(p ->> 'audience_days', '')::int, audience_investor_ids = v_ids, attachment_path = nullif(p ->> 'attachment_path', ''),
      send_email = coalesce((p ->> 'send_email')::boolean, send_email), updated_at = now()
    where id = p_id and status = 'draft' returning id into v_id;
    if v_id is null then raise exception 'Only drafts can be edited.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.pms_announcement_audience(p_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with a as (select * from public.announcements where id = p_id)
  select pr.id from public.profiles pr, a
  where pr.role = 'investor' and pr.account_status = 'active' and (
     a.audience = 'all'
  or (a.audience = 'selected' and pr.id = any (a.audience_investor_ids))
  or (a.audience = 'plan' and exists (select 1 from public.investments i where i.investor_id = pr.id and i.plan_id = a.audience_plan_id
                                       and i.status in ('pending_funding', 'active', 'matured', 'redemption_requested', 'redemption_processing')))
  or (a.audience = 'maturing' and exists (select 1 from public.investments i where i.investor_id = pr.id and i.status = 'active'
                                       and i.maturity_date - public.pms_today() between 0 and coalesce(a.audience_days, 60))))
$$;

create or replace function public.admin_audience_count(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  perform public.pms_require_admin();
  select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(coalesce(p -> 'audience_investor_ids', '[]')) x;
  select count(*) into v_n from public.profiles pr
  where pr.role = 'investor' and pr.account_status = 'active' and (
     coalesce(p ->> 'audience', 'all') = 'all'
  or (p ->> 'audience' = 'selected' and pr.id = any (v_ids))
  or (p ->> 'audience' = 'plan' and exists (select 1 from public.investments i where i.investor_id = pr.id and i.plan_id = nullif(p ->> 'audience_plan_id', '')::uuid
                                       and i.status in ('pending_funding', 'active', 'matured', 'redemption_requested', 'redemption_processing')))
  or (p ->> 'audience' = 'maturing' and exists (select 1 from public.investments i where i.investor_id = pr.id and i.status = 'active'
                                       and i.maturity_date - public.pms_today() between 0 and coalesce(nullif(p ->> 'audience_days', '')::int, 60))));
  return v_n;
end $$;

create or replace function public.admin_publish_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare a public.announcements; v_n int;
begin
  perform public.pms_require_admin();
  select * into a from public.announcements where id = p_id for update;
  if a.id is null then raise exception 'Announcement not found.'; end if;
  if a.status = 'published' then raise exception 'Already published.'; end if;
  insert into public.notifications (user_id, kind, title, body, link, source_table, source_id)
  select uid, 'announcement', a.title, a.category, '/portal/announcements', 'announcements', a.id from public.pms_announcement_audience(a.id) uid
  on conflict (user_id, kind, source_id) where source_id is not null do nothing;
  get diagnostics v_n = row_count;
  update public.announcements set status = 'published', published_at = now(), recipients = v_n, updated_at = now() where id = a.id;
  perform public.pms_audit('announcement.publish', 'announcement', a.id, a.code, a.title, null, jsonb_build_object('audience', a.audience, 'recipients', v_n));
  return v_n;
end $$;

-- ---------- notifications ----------
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- dashboard metrics (one definition, used by the admin overview) ----------
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.pms_today(); v_set public.settings; r jsonb;
begin
  perform public.pms_require_admin();
  select * into v_set from public.settings where id = 1;
  with live as (select * from public.investments where status in ('active', 'matured', 'redemption_requested', 'redemption_processing')),
  m as (select to_char(d, 'YYYY-MM') as ym from generate_series(date_trunc('month', v_today) - interval '7 months', date_trunc('month', v_today), interval '1 month') d)
  select jsonb_build_object(
    'today', v_today,
    'registered_investors', (select count(*) from public.profiles where role = 'investor'),
    'new_investors_month', (select count(*) from public.profiles where role = 'investor' and created_at >= date_trunc('month', v_today)),
    'active_investors', (select count(distinct investor_id) from live),
    'live_investments', (select count(*) from live),
    'principal_invested', (select coalesce(sum(principal), 0) from live),
    'locked_principal', (select coalesce(sum(principal), 0) from live where status = 'active' and lockin_end_date > v_today),
    'accrued_total', (select coalesce(sum(amount), 0) from public.accruals),
    'reversed_total', (select coalesce(sum(amount), 0) from public.accruals where kind = 'reversal'),
    'paid_total', (select coalesce(sum(amount), 0) from public.payouts where status = 'paid'),
    'outstanding_total', (select coalesce(sum(amount), 0) from public.payouts where status in ('accrued', 'approved', 'processing', 'failed')),
    'outstanding_count', (select count(*) from public.payouts where status in ('accrued', 'approved', 'processing', 'failed')),
    'maturing_count', (select count(*) from live where status = 'active' and maturity_date - v_today between 0 and v_set.approaching_days),
    'maturing_principal', (select coalesce(sum(principal), 0) from live where status = 'active' and maturity_date - v_today between 0 and v_set.approaching_days),
    'pending_redemptions', (select count(*) from public.redemption_requests where status in ('requested', 'under_review', 'approved', 'processing')),
    'pending_redemption_principal', (select coalesce(sum(i.principal), 0) from public.redemption_requests rr join public.investments i on i.id = rr.investment_id where rr.status in ('requested', 'under_review', 'approved', 'processing')),
    'active_plans', (select count(*) from public.plans where status = 'active'),
    'other_plans', (select count(*) from public.plans where status <> 'active'),
    'pending_funding', (select count(*) from public.investments where status = 'pending_funding'),
    'kyc_pending', (select count(*) from public.profiles where role = 'investor' and kyc_status = 'pending'),
    'payouts_by_status', (select coalesce(jsonb_object_agg(status, jsonb_build_object('count', n, 'amount', amt)), '{}') from (select status, count(*) n, sum(amount) amt from public.payouts group by status) s),
    'monthly', (select jsonb_agg(jsonb_build_object('month', m.ym,
                   'accrued', (select coalesce(sum(amount), 0) from public.accruals a where to_char(a.accrual_date, 'YYYY-MM') = m.ym),
                   'paid', (select coalesce(sum(amount), 0) from public.payouts p where p.status = 'paid' and to_char(p.paid_on, 'YYYY-MM') = m.ym),
                   'invested', (select coalesce(sum(principal), 0) from public.investments i where i.start_date is not null and to_char(i.start_date, 'YYYY-MM') = m.ym)) order by m.ym) from m),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', p.name, 'code', p.code, 'principal', coalesce(x.s, 0), 'count', coalesce(x.n, 0)) order by p.name), '[]')
                from public.plans p left join (select plan_id, sum(principal) s, count(*) n from live group by plan_id) x on x.plan_id = p.id where p.status <> 'archived' or x.n > 0),
    'by_lockin', (select coalesce(jsonb_agg(jsonb_build_object('months', lockin_months, 'count', n, 'principal', s) order by lockin_months), '[]')
                from (select lockin_months, count(*) n, sum(principal) s from live group by lockin_months) l)
  ) into r;
  return r;
end $$;

-- used by the server function when it creates an additional Super Admin
create or replace function public.pms_next_admin_code() returns text
language sql security definer set search_path = public as $$ select 'ADM-' || nextval('public.admin_code_seq') $$;
