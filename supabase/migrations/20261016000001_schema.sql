-- =====================================================================
-- PMS Investment Platform · 1/4 · Schema
-- Tables, types, sequences, constraints and integrity triggers.
-- No sample data is inserted. The single settings row holds empty
-- configuration that the Super Admin fills in from the app.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.user_role         as enum ('super_admin', 'investor');
create type public.kyc_status        as enum ('pending', 'verified', 'rejected');
create type public.account_status    as enum ('active', 'suspended');
create type public.plan_status       as enum ('draft', 'active', 'inactive', 'archived');
create type public.investment_status as enum ('pending_funding', 'active', 'matured', 'redemption_requested', 'redemption_processing', 'redeemed', 'cancelled');
create type public.accrual_kind      as enum ('regular', 'stub', 'reversal');
create type public.payout_status     as enum ('accrued', 'approved', 'processing', 'paid', 'failed', 'cancelled');
create type public.redemption_status as enum ('requested', 'under_review', 'approved', 'processing', 'completed', 'rejected', 'withdrawn');
create type public.ledger_type       as enum ('deposit', 'allocation', 'return_accrual', 'return_payout', 'redemption_request', 'principal_redemption', 'refund', 'adjustment', 'fee', 'reversal');
create type public.ledger_status     as enum ('pending', 'posted', 'confirmed', 'failed', 'reversed');
create type public.ann_audience      as enum ('all', 'selected', 'plan', 'maturing');
create type public.ann_status        as enum ('draft', 'published');

-- ---------- sequences for human-readable codes ----------
create sequence public.investor_code_seq start 1001;
create sequence public.admin_code_seq start 1;
create sequence public.plan_code_seq start 1;
create sequence public.investment_code_seq start 1001;
create sequence public.payout_code_seq start 1;
create sequence public.ledger_code_seq start 1;
create sequence public.redemption_code_seq start 1;
create sequence public.announcement_code_seq start 1;

-- ---------- settings (one row, edited by the Super Admin) ----------
create table public.settings (
  id                    int primary key default 1 check (id = 1),
  company_name          text not null default '',
  tagline               text not null default '',
  logo_url              text,
  primary_color         text not null default '#0B1F3F',
  currency              text not null default 'INR',
  locale                text not null default 'en-IN',
  timezone              text not null default 'Asia/Kolkata',
  approaching_days      int  not null default 60 check (approaching_days between 1 and 365),
  request_window_days   int  not null default 30 check (request_window_days between 0 and 365),
  default_payout_lag_days int not null default 3 check (default_payout_lag_days between 0 and 60),
  four_eyes             boolean not null default true,
  allow_custom_lockin   boolean not null default false,
  lockin_options        int[] not null default '{6,12}',
  default_terms         text not null default '',
  default_risk_disclosure text not null default '',
  support_email         text not null default '',
  support_phone         text not null default '',
  legal_footer          text not null default '',
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
insert into public.settings (id) values (1);

-- ---------- people ----------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                public.user_role not null default 'investor',
  code                text unique,
  full_name           text not null default '',
  email               text not null,
  phone               text not null default '',
  address             text not null default '',
  city                text not null default '',
  id_number_masked    text not null default '',
  bank_name           text not null default '',
  bank_account_masked text not null default '',
  bank_ifsc           text not null default '',
  kyc_status          public.kyc_status not null default 'pending',
  account_status      public.account_status not null default 'active',
  notify_email        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- A profile row is created for every auth user. The role is NEVER taken from
-- user-editable metadata: everyone starts as an investor and only a Super Admin
-- (or the bootstrap function) can promote someone.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, code)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          'INVR-' || nextval('public.investor_code_seq'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- plans ----------
create table public.plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null check (length(trim(name)) > 0),
  description     text not null default '',
  status          public.plan_status not null default 'draft',
  current_version int not null default 1,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),
  updated_at      timestamptz not null default now()
);

create table public.plan_versions (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.plans (id),
  version             int  not null,
  monthly_rate        numeric(7,4) not null check (monthly_rate > 0 and monthly_rate <= 100),
  min_amount          numeric(18,2) not null check (min_amount > 0),
  max_amount          numeric(18,2) not null,
  lockin_options      int[] not null check (cardinality(lockin_options) > 0),
  allow_custom_lockin boolean not null default false,
  eligible_from       date not null,
  eligible_to         date,
  early_redemption    text not null default 'not_permitted' check (early_redemption in ('not_permitted', 'permitted_with_fee', 'admin_discretion')),
  early_fee_pct       numeric(7,4) not null default 0 check (early_fee_pct >= 0 and early_fee_pct <= 100),
  payout_lag_days     int not null default 3 check (payout_lag_days between 0 and 60),
  terms               text not null default '',
  risk_disclosure     text not null default '',
  effective_from      date not null,
  change_reason       text not null check (length(trim(change_reason)) > 0),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  unique (plan_id, version),
  check (max_amount >= min_amount),
  check (eligible_to is null or eligible_to >= eligible_from)
);

-- ---------- investments (with immutable contractual terms snapshot) ----------
create table public.investments (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique default ('INV-' || nextval('public.investment_code_seq')),
  investor_id        uuid not null references public.profiles (id),
  plan_id            uuid not null references public.plans (id),
  plan_version_id    uuid not null references public.plan_versions (id),
  -- terms snapshot (copied from the plan version when recorded; never changes afterwards)
  plan_name          text not null,
  plan_version       int  not null,
  monthly_rate       numeric(7,4) not null check (monthly_rate > 0),
  lockin_months      int  not null check (lockin_months between 1 and 120),
  early_redemption   text not null,
  early_fee_pct      numeric(7,4) not null default 0,
  payout_lag_days    int  not null default 3,
  terms              text not null default '',
  risk_disclosure    text not null default '',
  principal          numeric(18,2) not null check (principal > 0),
  monthly_return     numeric(18,2) not null check (monthly_return >= 0),
  -- lifecycle
  status             public.investment_status not null default 'pending_funding',
  expected_start     date,
  start_date         date,
  lockin_end_date    date,
  maturity_date      date,
  request_from_date  date,
  agreement_ref      text not null default '',
  deposit_ref        text not null default '',
  notes              text not null default '',
  cancelled_reason   text,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  activated_by       uuid references public.profiles (id),
  activated_at       timestamptz,
  updated_at         timestamptz not null default now(),
  check (start_date is null or maturity_date is not null)
);
create index investments_investor_idx on public.investments (investor_id);
create index investments_status_idx on public.investments (status);
create index investments_maturity_idx on public.investments (maturity_date);

-- Contract terms cannot change once recorded, and dates cannot change once active.
create or replace function public.protect_investment_terms() returns trigger
language plpgsql as $$
begin
  if (new.investor_id, new.plan_version_id, new.monthly_rate, new.lockin_months, new.principal, new.monthly_return,
      new.early_redemption, new.early_fee_pct, new.terms, new.risk_disclosure)
     is distinct from
     (old.investor_id, old.plan_version_id, old.monthly_rate, old.lockin_months, old.principal, old.monthly_return,
      old.early_redemption, old.early_fee_pct, old.terms, old.risk_disclosure) then
    raise exception 'Contractual terms of % cannot be edited. Record a contract amendment instead.', old.code using errcode = '42501';
  end if;
  if old.start_date is not null and (new.start_date, new.maturity_date, new.lockin_end_date) is distinct from (old.start_date, old.maturity_date, old.lockin_end_date) then
    raise exception 'Dates of an active investment cannot be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger investments_protect before update on public.investments
  for each row execute function public.protect_investment_terms();

-- ---------- contract amendments (legally effective changes, recorded separately) ----------
create table public.contract_amendments (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id),
  description   text not null,
  effective_date date not null,
  document_path text,
  requested_by  uuid references public.profiles (id),
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------- accruals ----------
create table public.accruals (
  id             uuid primary key default gen_random_uuid(),
  investment_id  uuid not null references public.investments (id),
  period_no      int not null check (period_no >= 1),
  kind           public.accrual_kind not null default 'regular',
  period_start   date not null,
  period_end     date not null,           -- last day covered (inclusive)
  accrual_date   date not null,           -- the date the accrual was earned
  days           int not null,
  days_in_period int not null,
  amount         numeric(18,2) not null,
  reverses_id    uuid references public.accruals (id),
  reason         text,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  check ((kind = 'reversal') = (reverses_id is not null)),
  check ((kind = 'reversal' and amount <= 0) or (kind <> 'reversal' and amount >= 0))
);
-- One accrual per investment per period: re-running the job can never duplicate.
create unique index accruals_one_per_period on public.accruals (investment_id, period_no) where kind in ('regular', 'stub');
create unique index accruals_one_reversal on public.accruals (reverses_id) where reverses_id is not null;
create index accruals_date_idx on public.accruals (accrual_date);

-- ---------- payouts ----------
create table public.payouts (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('PAY-' || lpad(nextval('public.payout_code_seq')::text, 6, '0')),
  accrual_id     uuid not null unique references public.accruals (id),
  investment_id  uuid not null references public.investments (id),
  investor_id    uuid not null references public.profiles (id),
  amount         numeric(18,2) not null check (amount >= 0),
  due_date       date not null,
  status         public.payout_status not null default 'accrued',
  batch_ref      text,
  payment_ref    text,
  failure_reason text,
  approved_by    uuid references public.profiles (id),
  approved_at    timestamptz,
  sent_by        uuid references public.profiles (id),
  sent_at        timestamptz,
  confirmed_by   uuid references public.profiles (id),
  confirmed_at   timestamptz,
  paid_on        date,
  updated_at     timestamptz not null default now(),
  check (status <> 'paid' or (payment_ref is not null and length(trim(payment_ref)) > 0))
);
create index payouts_status_idx on public.payouts (status);
create index payouts_investor_idx on public.payouts (investor_id);

-- ---------- ledger (append-only; only status may move forward) ----------
create table public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default ('TXN-' || lpad(nextval('public.ledger_code_seq')::text, 7, '0')),
  investment_id uuid references public.investments (id),
  investor_id   uuid references public.profiles (id),
  type          public.ledger_type not null,
  amount        numeric(18,2) not null,
  status        public.ledger_status not null,
  occurred_on   date not null,
  reference     text not null default '',
  note          text not null default '',
  source_table  text,
  source_id     uuid,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index ledger_one_per_source on public.ledger_entries (source_table, source_id, type) where source_id is not null;
create index ledger_investor_idx on public.ledger_entries (investor_id, occurred_on desc);
create index ledger_date_idx on public.ledger_entries (occurred_on desc);

create or replace function public.protect_ledger() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ledger entries cannot be deleted. Post a reversing entry instead.' using errcode = '42501';
  end if;
  if (new.investment_id, new.investor_id, new.type, new.amount, new.source_table, new.source_id, new.created_at)
     is distinct from (old.investment_id, old.investor_id, old.type, old.amount, old.source_table, old.source_id, old.created_at) then
    raise exception 'Ledger entries cannot be edited. Post a reversing entry instead.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger ledger_protect before update or delete on public.ledger_entries
  for each row execute function public.protect_ledger();

create or replace function public.protect_immutable() returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable.', tg_table_name using errcode = '42501';
end $$;
create trigger plan_versions_immutable before update or delete on public.plan_versions
  for each row execute function public.protect_immutable();
create trigger accruals_immutable before update or delete on public.accruals
  for each row execute function public.protect_immutable();

-- ---------- redemptions ----------
create table public.redemption_requests (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique default ('RDM-' || lpad(nextval('public.redemption_code_seq')::text, 5, '0')),
  investment_id       uuid not null references public.investments (id),
  investor_id         uuid not null references public.profiles (id),
  type                text not null check (type in ('maturity', 'early')),
  status              public.redemption_status not null default 'requested',
  note                text not null default '',
  payable_on          date not null,
  fee_amount          numeric(18,2) not null default 0,
  decision_reason     text,
  payment_ref         text,
  decided_by          uuid references public.profiles (id),
  decided_at          timestamptz,
  completed_by        uuid references public.profiles (id),
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Only one open request per investment (prevents duplicate / concurrent requests).
create unique index redemption_one_open on public.redemption_requests (investment_id)
  where status in ('requested', 'under_review', 'approved', 'processing');

create table public.redemption_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.redemption_requests (id),
  from_status public.redemption_status,
  to_status   public.redemption_status not null,
  actor_id    uuid references public.profiles (id),
  actor_name  text not null default '',
  note        text not null default '',
  at          timestamptz not null default now()
);

-- ---------- announcements & notifications ----------
create table public.announcements (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique default ('ANN-' || lpad(nextval('public.announcement_code_seq')::text, 4, '0')),
  title                text not null check (length(trim(title)) > 0),
  body                 text not null default '',
  category             text not null default 'General notice',
  audience             public.ann_audience not null default 'all',
  audience_plan_id     uuid references public.plans (id),
  audience_days        int,
  audience_investor_ids uuid[] not null default '{}',
  status               public.ann_status not null default 'draft',
  attachment_path      text,
  send_email           boolean not null default false,
  recipients           int not null default 0,
  published_at         timestamptz,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null default '',
  link         text not null default '',
  source_table text,
  source_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_once on public.notifications (user_id, kind, source_id) where source_id is not null;

-- ---------- documents ----------
create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references public.profiles (id),
  investment_id       uuid references public.investments (id),
  kind                text not null check (kind in ('agreement', 'statement', 'kyc', 'proof', 'attachment', 'other')),
  title               text not null,
  storage_path        text not null unique,
  mime                text not null default '',
  size_bytes          bigint not null default 0,
  visible_to_investor boolean not null default true,
  uploaded_by         uuid references public.profiles (id),
  created_at          timestamptz not null default now()
);
create index documents_owner_idx on public.documents (owner_id);

-- ---------- audit log (append-only) ----------
create table public.audit_logs (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null default '',
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  entity_label text not null default '',
  reason      text not null default '',
  before      jsonb,
  after       jsonb
);
create index audit_at_idx on public.audit_logs (at desc);
create trigger audit_immutable before update or delete on public.audit_logs
  for each row execute function public.protect_immutable();

-- ---------- balances view (totals are always sums of rows, never typed in) ----------
create view public.investment_balances with (security_invoker = true) as
select
  i.id as investment_id,
  coalesce((select sum(a.amount) from public.accruals a where a.investment_id = i.id), 0)                                  as accrued,
  coalesce((select sum(p.amount) from public.payouts p where p.investment_id = i.id and p.status = 'paid'), 0)            as paid,
  coalesce((select sum(p.amount) from public.payouts p where p.investment_id = i.id and p.status = 'processing'), 0)      as processing,
  coalesce((select sum(p.amount) from public.payouts p where p.investment_id = i.id and p.status = 'approved'), 0)        as approved,
  coalesce((select sum(p.amount) from public.payouts p where p.investment_id = i.id and p.status in ('accrued', 'failed')), 0) as unapproved,
  coalesce((select count(*) from public.accruals a where a.investment_id = i.id and a.kind = 'regular'), 0)::int          as periods_accrued
from public.investments i;
