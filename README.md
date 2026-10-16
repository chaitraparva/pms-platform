# PMS Investment Platform

A Super Admin dashboard and an Investor portal for monthly simple-interest investment plans with 6- and 12-month lock-ins (or any lock-in you configure), built on **Supabase** (database, auth, storage, realtime, scheduled jobs) and hosted on **Vercel**.

There is **no sample data**. After setup the database is empty: the Super Admin enters the company details, plans, rates, lock-ins, terms, investors and investments from the app.

---

## What's inside

```
supabase/migrations/   4 SQL files: schema, business logic, security rules, storage/realtime/cron
supabase/tests/        database tests (run on a local PostgreSQL, never on Supabase)
supabase/maintenance/  one-off script to clear trial data before go-live
api/admin/users.ts     Vercel server function that creates investor/admin logins (holds the service key)
src/                   React app (Vite + TypeScript)
  admin/               Super Admin pages
  investor/            Investor portal pages
  pages/               sign-in, set password, profile & 2FA, notifications
  lib/ ui/ shell/      data access, formatting, design-system components, layout
```

How money is protected:

- Every change that moves money (recording, activating, accruing, paying, redeeming) is a database function that checks the caller is an active Super Admin, validates the input, locks the rows and writes the ledger and the audit log in one transaction. The browser cannot insert or update financial tables at all.
- Row-level security: an investor can read only their own records; admins read everything.
- The ledger, accruals, plan versions and audit log are append-only (enforced by triggers, even for the database owner). Mistakes are corrected with reversing entries.
- An investment copies the plan's terms when it is recorded. Editing a plan creates a new version and never changes existing investments.
- Optional four-eyes control: with two or more Super Admins, the person who records/sends something cannot also confirm it.
- Accruals are idempotent: re-running the job never creates a second accrual for the same month.

---

## 1. Set up Supabase (about 10 minutes)

1. **Create a project** at supabase.com (your Pro plan is fine). Note the *Project URL*, *anon public key* and *service_role key* from **Project Settings → API**.
2. **Enable pg_cron** (runs accruals every hour): **Database → Extensions → pg_cron → Enable**.
3. **Run the migrations**, in order. Either:
   - **SQL Editor:** open each file in `supabase/migrations/` in order (`…0001_schema.sql`, `…0002_logic.sql`, `…0003_security.sql`, `…0004_platform.sql`), paste, and click *Run*; or
   - **Supabase CLI:** `npx supabase link --project-ref YOUR-REF` then `npx supabase db push`.

   Check the scheduled job exists: `select jobname, schedule from cron.job;` should show `pms-accruals | 5 * * * *`. If it does not (pg_cron was not enabled first), enable pg_cron and run:
   ```sql
   select cron.schedule('pms-accruals', '5 * * * *', 'select public.pms_run_accruals()');
   ```
4. **Authentication → Sign In / Providers → Email:** turn **off "Allow new users to sign up"**. Only the Super Admin creates accounts. Keep "Confirm email" on.
5. **Authentication → URL Configuration:**
   - *Site URL:* your Vercel URL, e.g. `https://your-app.vercel.app`
   - *Redirect URLs:* add `https://your-app.vercel.app/set-password` and `http://localhost:5173/set-password`
6. **Authentication → Emails → SMTP Settings:** add your own SMTP (e.g. your company mail, Resend, SendGrid). Supabase's built-in mailer is heavily rate-limited and meant only for testing. Invitation and password-reset emails depend on this.
7. **Authentication → Multi-Factor:** make sure *TOTP (App Authenticator)* is enabled (it is by default). Users turn on 2FA from *Profile & Security*.

### Create the first Super Admin

1. **Authentication → Users → Add user → Create new user:** your email and a strong password, tick *Auto Confirm User*.
2. **SQL Editor**, run once:
   ```sql
   select public.bootstrap_super_admin('you@yourcompany.com');
   ```
   This works only while no Super Admin exists. Add further admins later from **Settings → Administrators** in the app.

---

## 2. Deploy on Vercel

1. Put this folder in a Git repository (GitHub/GitLab/Bitbucket) and **Import** it in Vercel, or run `npx vercel` from this folder.
2. Framework preset: **Vite** (detected automatically from `vercel.json`). Build command `npm run build`, output `dist`.
3. **Project Settings → Environment Variables** (Production and Preview):

   | Name | Value | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project URL | used by the browser |
   | `VITE_SUPABASE_ANON_KEY` | anon public key | used by the browser, safe to expose |
   | `SUPABASE_URL` | Project URL | server function |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only, never prefix with `VITE_`** |
   | `SITE_URL` | `https://your-app.vercel.app` | where invitation links land |

4. Deploy, then put the final URL into Supabase *Site URL* / *Redirect URLs* (step 1.5) if it changed.

---

## 3. First run (in the app)

Sign in with the Super Admin account. The Overview shows a setup checklist until it is complete:

1. **Settings → Company & branding:** company name, tagline, logo, brand colour, support contacts, legal footer.
2. **Settings → Money & dates:** currency (INR, AED, USD…), locale, time zone, "maturity approaching" window, how many days before maturity an investor may request redemption, default payout lag.
3. **Settings → Lock-in & controls:** lock-in options (default 6 and 12 months), custom lock-ins on/off, four-eyes on/off.
4. **Settings → Terms:** default agreement terms and risk disclosure (used when a plan has none of its own).
5. **Investment Plans → New plan:** monthly rate, minimum/maximum amount, lock-ins offered, eligibility window, early-redemption rule and fee, payout lag, terms. Plans start as *draft*; **Activate** to open them.
6. **Investors → Add investor:** sends an invitation email (the investor chooses a password at `/set-password`) or sets a temporary password. Verify KYC on the investor's page before recording an investment.
7. **Investments → Record investment:** investor, plan, lock-in, principal. It waits as *Pending funding* until you **Confirm deposit** with the bank reference and the date funds were received. That date is the start date; maturity = start + lock-in months.

### Loading investments that already exist

Record the investment and confirm the deposit with its **original start date** (a past date is allowed). The system immediately creates every monthly accrual that has already fallen due, each as an unpaid payout. Then on **Payouts**, approve → send → confirm paid with the bank reference for the months you have already paid.

---

## 4. Day-to-day

- **Accruals** are created automatically every hour for any investment whose monthly anniversary has passed (period *k* accrues on start date + *k* months, clamped to month end: 31 Jan → 28 Feb → 31 Mar…). *Monthly ROI & Accruals → Run now* does the same on demand.
- **Payouts:** Due → **Approve** → **Send to bank** → **Confirm paid** (bank/UTR reference required) or **Mark failed** → re-approve. With four-eyes on, a different admin confirms what one admin sent.
- **Redemptions:** investors request from the portal once the request window opens (or early, if their agreement allows it, with the fee shown up front). Admin: review → approve/reject → processing → complete with the bank reference. Completing settles principal (less any fee) and every unpaid return; an early exit gets a pro-rata return for the part-month.
- **Announcements:** to all investors, selected investors, everyone in a plan, or investors maturing within N days. Published announcements appear instantly in the investor's bell.
- **Reports:** CSV exports of portfolio, investors, accruals, payouts, maturities, redemptions, plan history and ledger. Investors can print a statement from *Statements & Documents*.
- **Audit Logs:** every admin action with who, when, why, and before/after values.

---

## 5. Local development

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:5173
```

`npm run dev` serves the React app only. Creating users needs the server function, so either run `npx vercel dev` (reads the same env vars) or create users on the deployed site.

Checks:

```bash
npm run typecheck   # TypeScript
npm test            # unit tests for date maths, rounding, labels, CSV
npm run build       # production build

# Database tests on a throwaway LOCAL PostgreSQL 15+ (never point this at Supabase):
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run_local.sh
```

---

## 6. What has been tested, and what to check on your project

**Tested before delivery**

- All four migrations apply cleanly on PostgreSQL 16 (with small stand-ins for Supabase's `auth` and `storage` schemas).
- 70 database checks pass (`supabase/tests/10_logic_test.sql`), including: fresh database has no data; signup metadata cannot make someone an admin; bootstrap works once; 2%, 4% and 6% monthly returns; 6- and 12-month maturities with month-end clamping (31 Aug 2027 + 6 = 29 Feb 2028); backdated start catches up 8 months; re-running accruals creates nothing; a plan change keeps existing terms; KYC, plan status, min/max and lock-in validation; lock-in blocks redemption; early redemption fee and pro-rata stub; one open request per investment; four-eyes on payments and settlements; a payment cannot be marked paid without a reference; investors cannot see each other's data or the audit log; investors cannot call admin functions or write tables; ledger, accruals and audit log cannot be edited or deleted; announcement audience and read receipts.
- TypeScript compiles in strict mode, the production build succeeds, and unit tests pass.
- A browser walk-through of the built app against a local copy of the database (PostgREST plus a stand-in for Supabase Auth): sign in as Super Admin, fill company settings and terms, create and activate a plan, add an investor through the `/api/admin/users` function, verify KYC, record an investment, confirm the deposit with a backdated start (two past months accrued automatically), approve, send and confirm the payouts, publish an announcement; then sign in as the investor and open every portal page, see the returns and the announcement, and confirm the redemption request is locked until the window opens. All 27 admin and investor pages load with no errors, the investor is redirected away from admin pages, and the portal fits a phone screen. The server function also refused a non-admin caller, a missing token and a duplicate email.

**Needs your Supabase project to verify** (cannot be reproduced offline)

- Invitation and password-reset emails (depend on your SMTP settings and redirect URLs).
- Two-factor enrolment and sign-in challenge.
- The hourly pg_cron job (check `select * from cron.job_run_details order by start_time desc limit 5;` after an hour).
- Realtime bell updates (falls back to refreshing every 60 seconds).
- Storage uploads/downloads for documents and the logo.
- The Vercel `/api/admin/users` function with your service key.

A good first check after deploying: create a test plan and a test investor, record an investment with a start date two months ago, confirm the deposit, and check that two accruals appear and the investor sees them in the portal. Financial records cannot be edited or deleted from the app by design, so do these trial runs before go-live and then clear them with `supabase/maintenance/wipe_test_data_before_go_live.sql` (keeps users and settings, deletes everything else), or use a separate Supabase project for testing.

---

## Security notes

- The service-role key lives only in Vercel's server environment. The browser uses the anon key and is limited by row-level security and function grants.
- Roles are stored in `profiles.role` and only changed by a Super Admin (or the one-time bootstrap); user-editable metadata is ignored.
- Public sign-up must be disabled (step 1.4).
- Turn on 2FA for every Super Admin account.
- Vercel adds security headers (`vercel.json`): no framing, no MIME sniffing, strict referrer policy.
