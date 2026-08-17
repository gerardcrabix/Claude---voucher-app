-- CAJAC-Voucher v2 — ajoute la date de clôture d'un bon.
--
-- À exécuter dans le SQL Editor de Supabase, comme 0001_init.sql (Dashboard
-- → SQL Editor → New query → coller → Run). Idempotent.
--
-- Sans cette date, un bon clôturé ("Terminé") ne peut apparaître dans
-- l'écran Expirés avec une date pertinente, contrairement aux bons expirés
-- et soldés (voir 0001_init.sql pour ces deux-là) — et surtout, il n'y
-- avait jusqu'ici tout simplement aucun moyen de retrouver ni de rouvrir un
-- bon clôturé par erreur : `reactiverBon()` existait déjà côté code depuis
-- le début (repris de la v1) mais n'était relié à aucun bouton.

alter table public.bons add column if not exists archived_at timestamptz;
