-- DANGER: permanently deletes ALL plans, investments, accruals, payouts, ledger,
-- redemptions, announcements, notifications, documents records and audit logs.
-- Keeps users, profiles and settings. Use ONLY to clear test data before go-live.
-- Run in the Supabase SQL editor. Files in the "documents" storage bucket are not
-- removed; delete them under Storage if needed.
begin;
truncate table
  public.redemption_events, public.redemption_requests, public.payouts, public.accruals,
  public.ledger_entries, public.contract_amendments, public.documents, public.investments,
  public.plan_versions, public.plans, public.notifications, public.announcements, public.audit_logs
restart identity;
alter sequence public.investment_code_seq restart with 1001;
alter sequence public.payout_code_seq restart with 1;
alter sequence public.ledger_code_seq restart with 1;
alter sequence public.redemption_code_seq restart with 1;
alter sequence public.announcement_code_seq restart with 1;
alter sequence public.plan_code_seq restart with 1;
commit;
