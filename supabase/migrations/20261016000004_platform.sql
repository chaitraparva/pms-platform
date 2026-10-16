-- =====================================================================
-- PMS Investment Platform · 4/4 · Storage, realtime and scheduled job
-- =====================================================================

-- ---------- storage ----------
-- documents: private. Files live under {investor_id}/... ; admins manage all,
-- investors can read files in their own folder.
-- branding: public (company logo shown on the sign-in page).
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;

create policy "pms documents admin all" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and public.is_admin()) with check (bucket_id = 'documents' and public.is_admin());
create policy "pms documents owner read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
         and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and d.visible_to_investor));
create policy "pms branding admin write" on storage.objects for all to authenticated
  using (bucket_id = 'branding' and public.is_admin()) with check (bucket_id = 'branding' and public.is_admin());

-- ---------- realtime: live bell for notifications ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------- hourly accrual job ----------
-- Requires the pg_cron extension (Database → Extensions → pg_cron). If it is not
-- available this block only prints a notice; see README "Scheduled accruals".
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'pms-accruals';
    perform cron.schedule('pms-accruals', '5 * * * *', 'select public.pms_run_accruals()');
  else
    raise notice 'pg_cron not available: enable it and run the cron.schedule line from the README.';
  end if;
exception when others then
  raise notice 'Could not schedule accruals automatically (%). Follow README "Scheduled accruals".', sqlerrm;
end $$;
