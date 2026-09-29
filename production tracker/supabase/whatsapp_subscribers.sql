-- ===========================================================================
-- WHATSAPP SUBSCRIBERS  (shared table for the WhatsApp chatbot)
-- ---------------------------------------------------------------------------
-- WHO WRITES:  supabase/functions/wa-webhook  (service role) when somebody
--              sends "hi" to the bot on WhatsApp.
-- WHO READS:   the website (anon key) so every device knows who to alert,
--              plus the settings modal for manual add / remove.
--
-- HOW TO APPLY: paste this whole file into the Supabase Dashboard
--   -> SQL Editor -> New query -> Run.  (One time only.)
-- ===========================================================================

create table if not exists public.whatsapp_subscribers (
  id             text primary key,                 -- WhatsApp number, E.164 without "+"
  name           text,                             -- profile name from WhatsApp
  last_inbound_at timestamptz,                     -- last message FROM them (starts the 24h window)
  welcomed_at    timestamptz,                      -- when the bot answered their "hi"
  active         boolean not null default true,    -- false = unsubscribed
  created_at     timestamptz not null default now()
);

comment on table public.whatsapp_subscribers is
  'People who chatted "hi" with the Production Tracker WhatsApp bot.';

alter table public.whatsapp_subscribers enable row level security;

-- The website (anon key) must be able to read the list and to add/remove
-- numbers manually from the "WhatsApp Alerts" modal. The webhook itself uses
-- the service role, which bypasses RLS, so its writes are unaffected.
drop policy if exists "anon reads subscribers"   on public.whatsapp_subscribers;
drop policy if exists "anon adds subscribers"    on public.whatsapp_subscribers;
drop policy if exists "anon updates subscribers" on public.whatsapp_subscribers;
drop policy if exists "anon removes subscribers" on public.whatsapp_subscribers;

create policy "anon reads subscribers"
  on public.whatsapp_subscribers for select
  to anon, authenticated
  using (true);

create policy "anon adds subscribers"
  on public.whatsapp_subscribers for insert
  to anon, authenticated
  with check (true);

create policy "anon updates subscribers"
  on public.whatsapp_subscribers for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anon removes subscribers"
  on public.whatsapp_subscribers for delete
  to anon, authenticated
  using (true);

-- Handy index: the broadcast only ever asks for active chats.
create index if not exists whatsapp_subscribers_active_idx
  on public.whatsapp_subscribers (active, created_at);
