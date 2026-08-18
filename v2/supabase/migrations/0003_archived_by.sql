-- CAJAC-Voucher v2 — trace qui a clôturé un bon.
--
-- À exécuter dans le SQL Editor de Supabase, comme 0001 et 0002 (Dashboard
-- → SQL Editor → New query → coller → Run). Idempotent.

alter table public.bons add column if not exists archived_by uuid references public.profiles(id);
