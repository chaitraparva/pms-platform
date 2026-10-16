-- =====================================================================
-- PMS Investment Platform · 5 · Upgrade
-- Branches (Tumkur, Bangalore), standard 2% / 3.3% / 6% plans, unlocked
-- principal, brochures, Parva Realty property catalog, email-based
-- investor identification, and removal of the redemption workflow.
--
-- Safe on a database that already holds data: nothing is deleted.
-- Redemption tables and their history stay; only the functions that
-- created or moved redemption requests are removed.
-- =====================================================================

-- ---------- branches ----------
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null unique check (length(trim(name)) > 0),
  city       text not null default '',
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.branches (code, name, city) values ('TMK', 'Tumkur', 'Tumkur'), ('BLR', 'Bangalore', 'Bangalore')
on conflict do nothing;

alter table public.profiles add column if not exists branch_id uuid references public.branches (id);
create index if not exists profiles_branch_idx on public.profiles (branch_id);

-- ---------- email is the investor's identity ----------
-- Emails are stored trimmed and lower-case. Investors without a display code
-- are found by their login (auth user id = profile id) and email, never by code.
update public.profiles set email = lower(trim(email)) where email <> lower(trim(email));
do $$
begin
  if not exists (select lower(email) from public.profiles group by lower(email) having count(*) > 1) then
    create unique index if not exists profiles_email_unique on public.profiles (lower(email));
  else
    raise notice 'Duplicate investor emails exist; resolve them, then create index profiles_email_unique.';
  end if;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, code)
  values (new.id, lower(trim(coalesce(new.email, ''))), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          'INVR-' || nextval('public.investor_code_seq'))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- settings additions ----------
alter table public.settings add column if not exists property_site_url text not null default 'https://parvarealty.ae/';
alter table public.settings add column if not exists show_properties_to text not null default 'all'
  check (show_properties_to in ('all', 'unlocked'));

-- settings: same as before, plus the Parva Realty website link and who sees property suggestions
create or replace function public.admin_save_settings(p jsonb, p_reason text default 'Settings updated') returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform public.pms_require_admin();
  if nullif(p ->> 'property_site_url', '') is not null and (p ->> 'property_site_url') !~* '^https://' then
    raise exception 'The property website link must start with https://'; end if;
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
    property_site_url   = coalesce(nullif(trim(p ->> 'property_site_url'), ''), property_site_url),
    show_properties_to  = coalesce(p ->> 'show_properties_to', show_properties_to),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform public.pms_audit('settings.update', 'settings', null, 'settings', p_reason, v_before, (select to_jsonb(s) from public.settings s where id = 1));
end $$;

-- ---------- brochures ----------
create sequence if not exists public.brochure_code_seq start 1;
create table if not exists public.brochures (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default ('BRO-' || lpad(nextval('public.brochure_code_seq')::text, 4, '0')),
  title        text not null check (length(trim(title)) > 0),
  description  text not null default '',
  storage_path text,
  file_name    text not null default '',
  mime         text not null default '',
  size_bytes   bigint not null default 0,
  plan_id      uuid references public.plans (id),
  branch_id    uuid references public.branches (id),   -- null = every branch
  publish_on   date not null default current_date,
  starts_on    date,
  ends_on      date,
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (status <> 'published' or storage_path is not null)
);
create table if not exists public.brochure_views (
  brochure_id     uuid not null references public.brochures (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  first_seen_at   timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (brochure_id, user_id)
);

-- ---------- property catalog (Parva Realty) ----------
create table if not exists public.properties (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  location      text not null default '',
  property_type text not null default '',
  price_text    text not null default '',
  description   text not null default '',
  image_url     text,
  url           text not null check (url ~* '^https://'),
  status        text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order    int not null default 0,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- lock-in state (one definition used everywhere) ----------
-- An investment's principal is "unlocked" once its lock-in end date has been
-- reached. Unlocking never moves money; it is a status only.
create or replace function public.pms_is_unlocked(i public.investments) returns boolean
language sql stable security definer set search_path = public as $$
  select i.lockin_end_date is not null and i.lockin_end_date <= public.pms_today()
     and i.status in ('active', 'matured', 'redemption_requested', 'redemption_processing')
$$;

-- ---------- redemption workflow removed ----------
drop function if exists public.investor_request_redemption(uuid, text);
drop function if exists public.investor_withdraw_redemption(uuid);
drop function if exists public.admin_redemption_transition(uuid, public.redemption_status, text, text);

-- Accrual job: same rules; maturity now only marks the principal as unlocked.
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
    perform public.pms_notify(v.investor_id, 'unlocked', 'Principal unlocked on ' || v.code,
      public.pms_fmt_money(v.principal) || ' has completed its ' || v.lockin_months || '-month lock-in.', '/portal/investments?view=unlocked', 'investments', v.id);
  elsif v.status = 'active' and v.maturity_date - p_as_of <= v_set.approaching_days then
    perform public.pms_notify(v.investor_id, 'maturity_reminder', v.code || ' unlocks on ' || to_char(v.maturity_date, 'DD Mon YYYY'),
      'Lock-in ends in ' || (v.maturity_date - p_as_of) || ' days.', '/portal/lock-in', 'investments', v.id);
  end if;
  return v_n;
end $$;

-- links in earlier notifications that pointed at the removed redemption pages
update public.notifications set link = '/portal/investments?view=unlocked' where link like '/portal/redemptions%';
update public.notifications set link = '/admin/investments' where link like '/admin/redemptions%';

-- ---------- branches: management ----------
create or replace function public.admin_save_branch(p_id uuid, p_code text, p_name text, p_city text, p_status text, p_reason text default 'Branch saved')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_code), '') = '' then raise exception 'Branch code and name are required.'; end if;
  if p_id is null then
    insert into public.branches (code, name, city, status, created_by)
    values (upper(trim(p_code)), trim(p_name), coalesce(trim(p_city), ''), coalesce(p_status, 'active'), auth.uid()) returning id into v_id;
  else
    select to_jsonb(b) into v_before from public.branches b where id = p_id;
    if v_before is null then raise exception 'Branch not found.'; end if;
    update public.branches set code = upper(trim(p_code)), name = trim(p_name), city = coalesce(trim(p_city), ''),
      status = coalesce(p_status, status), updated_at = now() where id = p_id returning id into v_id;
  end if;
  perform public.pms_audit(case when p_id is null then 'branch.create' else 'branch.update' end, 'branch', v_id, trim(p_name), p_reason,
    v_before, (select to_jsonb(b) from public.branches b where id = v_id));
  return v_id;
end $$;

-- Assign one or many investors to a branch (or clear with null). Each change is audited.
create or replace function public.admin_set_investor_branch(p_ids uuid[], p_branch uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_name text;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if p_branch is not null then
    select name into v_name from public.branches where id = p_branch;
    if v_name is null then raise exception 'Branch not found.'; end if;
  end if;
  for r in select p.id, p.code, p.email, p.branch_id, b.name as old_name from public.profiles p left join public.branches b on b.id = p.branch_id
           where p.id = any (p_ids) and p.role = 'investor' for update of p loop
    if r.branch_id is distinct from p_branch then
      update public.profiles set branch_id = p_branch, updated_at = now() where id = r.id;
      perform public.pms_audit('investor.branch', 'profile', r.id, coalesce(r.code, r.email), p_reason,
        jsonb_build_object('branch', r.old_name), jsonb_build_object('branch', v_name));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ---------- standard plans ----------
-- Creates any of the 2%, 3.3% and 6% monthly plans that do not exist yet
-- (6- and 12-month lock-ins). Existing plans and investments are untouched.
create or replace function public.admin_create_standard_plans(p_activate boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_id uuid; v_n int := 0;
begin
  perform public.pms_require_admin();
  for r in select * from (values ('P2', '2% Monthly Plan', 2.0), ('P33', '3.3% Monthly Plan', 3.3), ('P6', '6% Monthly Plan', 6.0)) t(code, name, rate) loop
    if not exists (select 1 from public.plans p where p.code = r.code)
       and not exists (select 1 from public.plans p join public.plan_versions pv on pv.plan_id = p.id and pv.version = p.current_version
                       where pv.monthly_rate = r.rate and p.status <> 'archived') then
      v_id := public.admin_create_plan(r.code, r.name, 'Simple monthly return of ' || to_char(r.rate, 'FM990.0##') || '% on the original principal, paid monthly.',
        jsonb_build_object('monthly_rate', r.rate, 'min_amount', 1, 'max_amount', 999999999999, 'lockin_options', jsonb_build_array(6, 12),
                           'eligible_from', public.pms_today(), 'effective_from', public.pms_today()));
      if p_activate then perform public.admin_set_plan_status(v_id, 'active', 'Standard plan published'); end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Investments whose terms do not match a standard configuration are flagged, not changed.
create or replace function public.admin_review_flags() returns table (investment_id uuid, code text, investor text, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.pms_require_admin();
  return query
  select i.id, i.code, coalesce(nullif(p.full_name, ''), p.email),
         concat_ws('; ',
           case when i.monthly_rate not in (2, 3.3, 6) then 'Rate ' || to_char(i.monthly_rate, 'FM990.00##') || '% is not one of 2%, 3.3%, 6%' end,
           case when i.lockin_months not in (6, 12) then 'Lock-in of ' || i.lockin_months || ' months' end,
           case when p.branch_id is null then 'Investor has no branch' end,
           case when i.status in ('active', 'matured') and i.start_date is null then 'Missing start date' end)
  from public.investments i join public.profiles p on p.id = i.investor_id
  where i.status not in ('cancelled', 'redeemed')
    and (i.monthly_rate not in (2, 3.3, 6) or i.lockin_months not in (6, 12) or p.branch_id is null
         or (i.status in ('active', 'matured') and i.start_date is null))
  order by i.code;
end $$;

-- ---------- dashboard (overall, or for one branch; optional date range for the trend) ----------
-- Keeps every figure the existing Overview used and adds unlocked principal,
-- branch totals and the split by contracted monthly rate.
drop function if exists public.admin_dashboard();
create or replace function public.admin_dashboard(p_branch uuid default null, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.pms_today(); v_set public.settings; r jsonb; v_from date; v_to date;
begin
  perform public.pms_require_admin();
  select * into v_set from public.settings where id = 1;
  v_to := coalesce(p_to, v_today);
  v_from := coalesce(p_from, (date_trunc('month', v_to) - interval '7 months')::date);
  if v_from > v_to then raise exception 'The start of the date range must be before its end.'; end if;
  with inv as (select p.* from public.profiles p where p.role = 'investor' and (p_branch is null or p.branch_id = p_branch)),
  live as (select i.*, public.pms_is_unlocked(i) as unlocked, inv.branch_id from public.investments i join inv on inv.id = i.investor_id
           where i.status in ('active', 'matured', 'redemption_requested', 'redemption_processing')),
  acc as (select a.*, inv.branch_id from public.accruals a join public.investments i on i.id = a.investment_id join inv on inv.id = i.investor_id),
  pay as (select py.*, inv.branch_id from public.payouts py join inv on inv.id = py.investor_id),
  m as (select to_char(d, 'YYYY-MM') as ym from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') d)
  select jsonb_build_object(
    'today', v_today, 'from', v_from, 'to', v_to, 'branch_id', p_branch,
    'registered_investors', (select count(*) from inv),
    'total_investors', (select count(*) from inv),
    'new_investors_month', (select count(*) from inv where created_at >= date_trunc('month', v_today)),
    'investors_with_investments', (select count(distinct investor_id) from live),
    'live_investments', (select count(*) from live),
    'principal_invested', (select coalesce(sum(principal), 0) from live),
    'unlocked_principal', (select coalesce(sum(principal), 0) from live where unlocked),
    'unlocked_count', (select count(*) from live where unlocked),
    'locked_principal', (select coalesce(sum(principal), 0) from live where not unlocked),
    'locked_count', (select count(*) from live where not unlocked),
    'accrued_total', (select coalesce(sum(amount), 0) from acc),
    'reversed_total', (select coalesce(sum(amount), 0) from acc where kind = 'reversal'),
    'paid_total', (select coalesce(sum(amount), 0) from pay where status = 'paid'),
    'outstanding_total', (select coalesce(sum(amount), 0) from pay where status in ('accrued', 'approved', 'processing', 'failed')),
    'outstanding_count', (select count(*) from pay where status in ('accrued', 'approved', 'processing', 'failed')),
    'maturing_count', (select count(*) from live where not unlocked and maturity_date - v_today between 0 and v_set.approaching_days),
    'maturing_principal', (select coalesce(sum(principal), 0) from live where not unlocked and maturity_date - v_today between 0 and v_set.approaching_days),
    'pending_funding', (select count(*) from public.investments i join inv on inv.id = i.investor_id where i.status = 'pending_funding'),
    'kyc_pending', (select count(*) from inv where kyc_status = 'pending'),
    'unassigned_investors', (select count(*) from inv where branch_id is null),
    'unassigned_principal', (select coalesce(sum(principal), 0) from live where branch_id is null),
    'payouts_by_status', (select coalesce(jsonb_object_agg(status, jsonb_build_object('count', n, 'amount', amt)), '{}')
                          from (select status, count(*) n, sum(amount) amt from pay group by status) s),
    'monthly', (select jsonb_agg(jsonb_build_object('month', m.ym,
                   'accrued', (select coalesce(sum(amount), 0) from acc where to_char(acc.accrual_date, 'YYYY-MM') = m.ym),
                   'paid', (select coalesce(sum(amount), 0) from pay where pay.status = 'paid' and to_char(pay.paid_on, 'YYYY-MM') = m.ym),
                   'invested', (select coalesce(sum(principal), 0) from live where to_char(live.start_date, 'YYYY-MM') = m.ym)) order by m.ym) from m),
    -- one row per branch, so the branch cards and the bar chart add up to the totals above (plus unassigned)
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'status', b.status,
          'investors', (select count(*) from inv where inv.branch_id = b.id),
          'principal', (select coalesce(sum(principal), 0) from live where live.branch_id = b.id),
          'unlocked', (select coalesce(sum(principal), 0) from live where live.branch_id = b.id and unlocked),
          'locked', (select coalesce(sum(principal), 0) from live where live.branch_id = b.id and not unlocked),
          'accrued', (select coalesce(sum(amount), 0) from acc where acc.branch_id = b.id),
          'paid', (select coalesce(sum(amount), 0) from pay where pay.branch_id = b.id and pay.status = 'paid'),
          'by_rate', (select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'investors', ni, 'principal', s, 'count', n) order by rate), '[]')
                      from (select monthly_rate rate, count(distinct investor_id) ni, sum(principal) s, count(*) n from live where live.branch_id = b.id group by monthly_rate) x)
        ) order by b.name), '[]')
        from public.branches b where (p_branch is null and b.status = 'active') or b.id = p_branch
          or exists (select 1 from inv where inv.branch_id = b.id)),
    -- split by the monthly rate each investment was contracted at (2%, 3.3%, 6% or any historical rate)
    'by_rate', (select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'investors', ni, 'principal', s, 'count', n,
                   'unlocked', u) order by rate), '[]')
                from (select monthly_rate rate, count(distinct investor_id) ni, sum(principal) s, count(*) n,
                             coalesce(sum(principal) filter (where unlocked), 0) u from live group by monthly_rate) x),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan_id', p.id, 'plan', p.name, 'code', p.code, 'rate', pv.monthly_rate, 'status', p.status,
                   'investors', coalesce(x.ni, 0), 'principal', coalesce(x.s, 0), 'count', coalesce(x.n, 0)) order by pv.monthly_rate, p.name), '[]')
                from public.plans p join public.plan_versions pv on pv.plan_id = p.id and pv.version = p.current_version
                left join (select plan_id, count(distinct investor_id) ni, sum(principal) s, count(*) n from live group by plan_id) x on x.plan_id = p.id
                where p.status <> 'archived' or x.n > 0),
    'by_lockin', (select coalesce(jsonb_agg(jsonb_build_object('months', lockin_months, 'count', n, 'principal', s, 'unlocked', u) order by lockin_months), '[]')
                from (select lockin_months, count(*) n, sum(principal) s, coalesce(sum(principal) filter (where unlocked), 0) u from live group by lockin_months) l)
  ) into r;
  return r;
end $$;

-- ---------- brochures ----------
create or replace function public.pms_brochure_visible_to(p_brochure uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.brochures b, public.profiles p
    where b.id = p_brochure and p.id = p_user and p.account_status = 'active'
      and b.status = 'published' and b.publish_on <= public.pms_today()
      and (b.starts_on is null or b.starts_on <= public.pms_today())
      and (b.ends_on is null or b.ends_on >= public.pms_today())
      and (b.branch_id is null or b.branch_id = p.branch_id))
$$;

create or replace function public.admin_save_brochure(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb; v_status text;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'Enter a brochure title.'; end if;
  if nullif(p ->> 'mime', '') is not null and (p ->> 'mime') not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
    raise exception 'Brochures must be PDF, PNG, JPG or WebP files.'; end if;
  if coalesce((p ->> 'size_bytes')::bigint, 0) > 15 * 1024 * 1024 then raise exception 'Brochures must be 15 MB or smaller.'; end if;
  if p_id is null then
    insert into public.brochures (title, description, storage_path, file_name, mime, size_bytes, plan_id, branch_id, publish_on, starts_on, ends_on, created_by)
    values (trim(p ->> 'title'), coalesce(p ->> 'description', ''), nullif(p ->> 'storage_path', ''), coalesce(p ->> 'file_name', ''),
            coalesce(p ->> 'mime', ''), coalesce((p ->> 'size_bytes')::bigint, 0), nullif(p ->> 'plan_id', '')::uuid, nullif(p ->> 'branch_id', '')::uuid,
            coalesce(nullif(p ->> 'publish_on', '')::date, public.pms_today()), nullif(p ->> 'starts_on', '')::date, nullif(p ->> 'ends_on', '')::date, auth.uid())
    returning id into v_id;
  else
    select to_jsonb(b), b.status into v_before, v_status from public.brochures b where id = p_id for update;
    if v_before is null then raise exception 'Brochure not found.'; end if;
    update public.brochures set title = trim(p ->> 'title'), description = coalesce(p ->> 'description', ''),
      storage_path = coalesce(nullif(p ->> 'storage_path', ''), storage_path),
      file_name = case when nullif(p ->> 'storage_path', '') is not null then coalesce(p ->> 'file_name', '') else file_name end,
      mime = case when nullif(p ->> 'storage_path', '') is not null then coalesce(p ->> 'mime', '') else mime end,
      size_bytes = case when nullif(p ->> 'storage_path', '') is not null then coalesce((p ->> 'size_bytes')::bigint, 0) else size_bytes end,
      plan_id = nullif(p ->> 'plan_id', '')::uuid, branch_id = nullif(p ->> 'branch_id', '')::uuid,
      publish_on = coalesce(nullif(p ->> 'publish_on', '')::date, publish_on), starts_on = nullif(p ->> 'starts_on', '')::date,
      ends_on = nullif(p ->> 'ends_on', '')::date, updated_at = now()
    where id = p_id;
    -- a replaced file is shown again to everyone
    if nullif(p ->> 'storage_path', '') is not null and (p ->> 'storage_path') is distinct from (v_before ->> 'storage_path') then
      delete from public.brochure_views where brochure_id = p_id;
    end if;
  end if;
  perform public.pms_audit(case when p_id is null then 'brochure.create' else 'brochure.update' end, 'brochure', v_id,
    (select code from public.brochures where id = coalesce(v_id, p_id)), coalesce(p ->> 'title', ''), v_before, p);
  return coalesce(v_id, p_id);
end $$;

create or replace function public.admin_set_brochure_status(p_id uuid, p_status text, p_reason text default '') returns int
language plpgsql security definer set search_path = public as $$
declare b public.brochures; v_n int := 0;
begin
  perform public.pms_require_admin();
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unknown status %.', p_status; end if;
  select * into b from public.brochures where id = p_id for update;
  if b.id is null then raise exception 'Brochure not found.'; end if;
  if p_status = 'published' and b.storage_path is null then raise exception 'Upload the brochure file before publishing.'; end if;
  update public.brochures set status = p_status, updated_at = now(),
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end where id = p_id;
  if p_status = 'published' then
    insert into public.notifications (user_id, kind, title, body, link, source_table, source_id)
    select p.id, 'brochure', b.title, 'New investment update', '/portal?brochure=' || b.id, 'brochures', b.id
    from public.profiles p where p.role = 'investor' and public.pms_brochure_visible_to(b.id, p.id)
    on conflict (user_id, kind, source_id) where source_id is not null do nothing;
    get diagnostics v_n = row_count;
  end if;
  perform public.pms_audit('brochure.' || p_status, 'brochure', p_id, b.code, coalesce(nullif(p_reason, ''), b.title),
    jsonb_build_object('status', b.status), jsonb_build_object('status', p_status, 'notified', v_n));
  return v_n;
end $$;

-- Brochures the signed-in investor may see, newest first, with whether they have seen it.
create or replace function public.my_brochures() returns table (
  id uuid, code text, title text, description text, storage_path text, file_name text, mime text, plan_id uuid, plan_name text,
  publish_on date, starts_on date, ends_on date, seen boolean, acknowledged boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.code, b.title, b.description, b.storage_path, b.file_name, b.mime, b.plan_id, pl.name, b.publish_on, b.starts_on, b.ends_on,
         v.user_id is not null, v.acknowledged_at is not null
  from public.brochures b
  left join public.plans pl on pl.id = b.plan_id
  left join public.brochure_views v on v.brochure_id = b.id and v.user_id = auth.uid()
  where public.pms_brochure_visible_to(b.id, auth.uid())
  order by b.publish_on desc, b.published_at desc nulls last
$$;

create or replace function public.mark_brochure_seen(p_id uuid, p_acknowledge boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.pms_brochure_visible_to(p_id, auth.uid()) then raise exception 'Brochure not available.' using errcode = '42501'; end if;
  insert into public.brochure_views (brochure_id, user_id, acknowledged_at) values (p_id, auth.uid(), case when p_acknowledge then now() end)
  on conflict (brochure_id, user_id) do update set acknowledged_at = coalesce(public.brochure_views.acknowledged_at, excluded.acknowledged_at);
  update public.notifications set read_at = coalesce(read_at, now()) where user_id = auth.uid() and kind = 'brochure' and source_id = p_id;
end $$;

-- ---------- properties ----------
create or replace function public.admin_save_property(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb;
begin
  perform public.pms_require_admin();
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'Enter the property name.'; end if;
  if coalesce(p ->> 'url', '') !~* '^https://' then raise exception 'Enter the property''s https:// link on the official website.'; end if;
  if nullif(p ->> 'image_url', '') is not null and (p ->> 'image_url') !~* '^https://' then raise exception 'Image links must start with https://'; end if;
  if p_id is null then
    insert into public.properties (title, location, property_type, price_text, description, image_url, url, status, sort_order, created_by)
    values (trim(p ->> 'title'), coalesce(p ->> 'location', ''), coalesce(p ->> 'property_type', ''), coalesce(p ->> 'price_text', ''),
            coalesce(p ->> 'description', ''), nullif(p ->> 'image_url', ''), trim(p ->> 'url'), coalesce(nullif(p ->> 'status', ''), 'draft'),
            coalesce((p ->> 'sort_order')::int, 0), auth.uid())
    returning id into v_id;
  else
    select to_jsonb(x) into v_before from public.properties x where id = p_id;
    if v_before is null then raise exception 'Property not found.'; end if;
    update public.properties set title = trim(p ->> 'title'), location = coalesce(p ->> 'location', ''), property_type = coalesce(p ->> 'property_type', ''),
      price_text = coalesce(p ->> 'price_text', ''), description = coalesce(p ->> 'description', ''), image_url = nullif(p ->> 'image_url', ''),
      url = trim(p ->> 'url'), status = coalesce(nullif(p ->> 'status', ''), status), sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      updated_at = now() where id = p_id returning id into v_id;
  end if;
  perform public.pms_audit(case when p_id is null then 'property.create' else 'property.update' end, 'property', v_id, trim(p ->> 'title'), '', v_before, p);
  return v_id;
end $$;

-- ---------- security ----------
alter table public.branches       enable row level security;
alter table public.brochures      enable row level security;
alter table public.brochure_views enable row level security;
alter table public.properties     enable row level security;

drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated
  using (public.is_admin() or id = (select branch_id from public.profiles where id = auth.uid()));
drop policy if exists brochures_read on public.brochures;
create policy brochures_read on public.brochures for select to authenticated
  using (public.is_admin() or public.pms_brochure_visible_to(id, auth.uid()));
drop policy if exists brochure_views_read on public.brochure_views;
create policy brochure_views_read on public.brochure_views for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists properties_read on public.properties;
create policy properties_read on public.properties for select to authenticated using (public.is_admin() or status = 'published');

revoke all on public.branches, public.brochures, public.brochure_views, public.properties from anon;
revoke insert, update, delete, truncate on public.branches, public.brochures, public.brochure_views, public.properties from authenticated;
grant select on public.branches, public.brochures, public.brochure_views, public.properties to authenticated;
revoke all on sequence public.brochure_code_seq from anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.public_branding() to anon, authenticated;
revoke execute on function public.pms_is_unlocked(public.investments), public.pms_brochure_visible_to(uuid, uuid),
  public.handle_new_user(), public.pms_run_accruals_for(uuid, date) from authenticated;
grant execute on function
  public.pms_brochure_visible_to(uuid, uuid),      -- used by row-level security
  public.admin_save_branch(uuid, text, text, text, text, text),
  public.admin_set_investor_branch(uuid[], uuid, text),
  public.admin_create_standard_plans(boolean),
  public.admin_review_flags(),
  public.admin_dashboard(uuid, date, date),
  public.admin_save_brochure(uuid, jsonb),
  public.admin_set_brochure_status(uuid, text, text),
  public.my_brochures(),
  public.mark_brochure_seen(uuid, boolean),
  public.admin_save_property(uuid, jsonb)
to authenticated;
grant execute on function public.pms_is_unlocked(public.investments) to authenticated;

-- ---------- brochure files: private bucket ----------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('brochures', 'brochures', false) on conflict (id) do nothing;
    execute 'drop policy if exists "pms brochures admin all" on storage.objects';
    execute 'create policy "pms brochures admin all" on storage.objects for all to authenticated
      using (bucket_id = ''brochures'' and public.is_admin()) with check (bucket_id = ''brochures'' and public.is_admin())';
    execute 'drop policy if exists "pms brochures investor read" on storage.objects';
    execute 'create policy "pms brochures investor read" on storage.objects for select to authenticated
      using (bucket_id = ''brochures'' and exists (select 1 from public.brochures b where b.storage_path = storage.objects.name
             and public.pms_brochure_visible_to(b.id, auth.uid())))';
  end if;
end $$;
