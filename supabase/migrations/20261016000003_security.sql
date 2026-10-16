-- =====================================================================
-- PMS Investment Platform · 3/4 · Row-level security and grants
-- Reads: an investor sees only their own rows; a Super Admin sees all.
-- Writes: no table accepts direct writes from the browser (except
-- document records by admins). Every change goes through the
-- functions in migration 2, which check the role themselves.
-- =====================================================================

alter table public.settings            enable row level security;
alter table public.profiles            enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_versions       enable row level security;
alter table public.investments         enable row level security;
alter table public.contract_amendments enable row level security;
alter table public.accruals            enable row level security;
alter table public.payouts             enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.redemption_requests enable row level security;
alter table public.redemption_events   enable row level security;
alter table public.announcements       enable row level security;
alter table public.notifications       enable row level security;
alter table public.documents           enable row level security;
alter table public.audit_logs          enable row level security;

create policy settings_read on public.settings for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());

create policy plans_read on public.plans for select to authenticated
  using (public.is_admin() or status = 'active' or exists (select 1 from public.investments i where i.plan_id = plans.id and i.investor_id = auth.uid()));
create policy plan_versions_read on public.plan_versions for select to authenticated
  using (public.is_admin() or exists (select 1 from public.investments i where i.plan_version_id = plan_versions.id and i.investor_id = auth.uid()));

create policy investments_read on public.investments for select to authenticated using (investor_id = auth.uid() or public.is_admin());
create policy amendments_read on public.contract_amendments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.investments i where i.id = contract_amendments.investment_id and i.investor_id = auth.uid()));
create policy accruals_read on public.accruals for select to authenticated
  using (public.is_admin() or exists (select 1 from public.investments i where i.id = accruals.investment_id and i.investor_id = auth.uid()));
create policy payouts_read on public.payouts for select to authenticated using (investor_id = auth.uid() or public.is_admin());
create policy ledger_read on public.ledger_entries for select to authenticated using (investor_id = auth.uid() or public.is_admin());
create policy redemptions_read on public.redemption_requests for select to authenticated using (investor_id = auth.uid() or public.is_admin());
create policy redemption_events_read on public.redemption_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.redemption_requests r where r.id = redemption_events.request_id and r.investor_id = auth.uid()));

-- Investors see an announcement only after it was published to them.
create policy announcements_read on public.announcements for select to authenticated
  using (public.is_admin() or (status = 'published' and exists (
    select 1 from public.notifications n where n.user_id = auth.uid() and n.kind = 'announcement' and n.source_id = announcements.id)));

create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());

create policy documents_read on public.documents for select to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and visible_to_investor));
create policy documents_admin_insert on public.documents for insert to authenticated with check (public.is_admin());
create policy documents_admin_update on public.documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy documents_admin_delete on public.documents for delete to authenticated using (public.is_admin());

create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

-- ---------- table privileges ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.documents to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- function privileges ----------
-- Nothing is callable by default; only the app's entry points are granted.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_admin(),
  public.pms_today(),
  public.pms_add_months(date, int),
  public.pms_monthly_return(numeric, numeric),
  public.admin_save_settings(jsonb, text),
  public.admin_update_investor(uuid, jsonb, text),
  public.admin_set_investor_status(uuid, public.account_status, text),
  public.admin_set_kyc(uuid, public.kyc_status, text),
  public.admin_set_role(uuid, public.user_role, text),
  public.update_my_profile(text, text, text, boolean),
  public.admin_create_plan(text, text, text, jsonb),
  public.admin_update_plan(uuid, text, text, jsonb, text),
  public.admin_set_plan_status(uuid, public.plan_status, text),
  public.admin_record_investment(uuid, uuid, int, numeric, date, text, text, text),
  public.admin_activate_investment(uuid, date, text, text),
  public.admin_cancel_investment(uuid, text),
  public.admin_record_amendment(uuid, text, date, text),
  public.admin_approve_amendment(uuid),
  public.admin_run_accruals(),
  public.admin_reverse_accrual(uuid, text),
  public.admin_payouts_transition(uuid[], public.payout_status, text, text),
  public.investor_request_redemption(uuid, text),
  public.investor_withdraw_redemption(uuid),
  public.admin_redemption_transition(uuid, public.redemption_status, text, text),
  public.admin_save_announcement(uuid, jsonb),
  public.admin_audience_count(jsonb),
  public.admin_publish_announcement(uuid),
  public.mark_notifications_read(uuid[]),
  public.admin_dashboard()
to authenticated;

-- Branding for the sign-in page, before anyone is signed in.
create or replace function public.public_branding() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company_name', company_name, 'tagline', tagline, 'logo_url', logo_url,
                            'primary_color', primary_color, 'support_email', support_email, 'legal_footer', legal_footer)
  from public.settings where id = 1
$$;
revoke execute on function public.public_branding() from public;
grant execute on function public.public_branding() to anon, authenticated;

-- bootstrap_super_admin and pms_run_accruals stay callable only from the SQL editor / cron (postgres role).
-- The server function (service role) needs the admin code generator.
grant execute on function public.pms_next_admin_code() to service_role;
