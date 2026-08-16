-- CAJAC-Voucher v2 — schéma initial.
--
-- À exécuter une fois dans l'éditeur SQL du projet Supabase (Dashboard →
-- SQL Editor → New query → coller ce fichier → Run), ou via
-- `supabase db push` si le CLI est lié au projet. Idempotent : peut être
-- rejoué sans erreur sur un projet déjà migré (IF NOT EXISTS partout).
--
-- Correspond à l'architecture décrite dans le document "CAJAC-Voucher v2 —
-- Architecture & plan" (§A3, §A5). Deux simplifications assumées par rapport
-- à ce document, documentées ici plutôt que dans le code applicatif :
--   1. Les logos d'enseigne et les images de code-barres/QR restent stockés
--      en data URL (colonne texte), comme en v1 — ce sont de petites images
--      (l'upload de logo est déjà redimensionné à 128px côté client), le
--      détour par un bucket Storage n'apportait rien de concret. Seuls les
--      PDF (potentiellement plusieurs Mo) utilisent réellement Storage.
--   2. Le champ tauxReduction de la v1 (jamais exposé dans l'interface) est
--      abandonné plutôt que reporté ici.

-- ---------------------------------------------------------------------------
-- 1. Profils — un par compte Supabase Auth (CM, AJ)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Sans nom',
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Un compte réel = une ligne. Remplace les identités simulées "moi"/"elle" de la v1.';

-- Auto-création d'un profil à la création d'un compte Auth (fonction
-- exécutée avec les droits du propriétaire de la base, seule façon d'écrire
-- dans le schéma "auth" -> "public" de façon fiable côté trigger).
create or replace function public.gerer_nouvel_utilisateur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Sans nom'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- ---------------------------------------------------------------------------
-- 2. Enseignes
-- ---------------------------------------------------------------------------
create table if not exists public.enseignes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  nom_normalise text not null,
  lien_verification text,
  logo_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists enseignes_nom_normalise_idx on public.enseignes (nom_normalise);

-- ---------------------------------------------------------------------------
-- 3. Bons
-- ---------------------------------------------------------------------------
create table if not exists public.bons (
  id uuid primary key default gen_random_uuid(),
  enseigne_id uuid not null references public.enseignes(id),
  montant_initial integer not null check (montant_initial > 0), -- centimes
  date_achat date not null,
  date_expiration date,
  code text not null,
  pin text,
  -- 'partage' (visible des deux) ou l'uid (texte) d'un des deux comptes —
  -- même sémantique que le champ `visibilite` de la v1, juste avec de vrais
  -- identifiants de compte au lieu de 'moi'/'elle'.
  visibilite text not null default 'partage',
  code_barres_url text,
  pdf_path text,          -- chemin dans le bucket Storage "pdfs", si un PDF est joint
  pdf_filename text,
  pdf_content_type text,
  archived boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists bons_enseigne_idx on public.bons (enseigne_id);
create index if not exists bons_visibilite_idx on public.bons (visibilite);

-- ---------------------------------------------------------------------------
-- 4. Historique (mouvements / overrides / modifications)
-- ---------------------------------------------------------------------------
create table if not exists public.mouvements (
  id uuid primary key default gen_random_uuid(),
  bon_id uuid not null references public.bons(id) on delete cascade,
  montant integer not null check (montant > 0),
  date date not null,
  note text default '',
  auteur uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists mouvements_bon_idx on public.mouvements (bon_id);

create table if not exists public.overrides (
  id uuid primary key default gen_random_uuid(),
  bon_id uuid not null references public.bons(id) on delete cascade,
  nouveau_solde integer not null check (nouveau_solde >= 0),
  motif text default '',
  auteur uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists overrides_bon_idx on public.overrides (bon_id);

create table if not exists public.modifications (
  id uuid primary key default gen_random_uuid(),
  bon_id uuid not null references public.bons(id) on delete cascade,
  auteur uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  montant_avant integer not null,
  montant_apres integer not null,
  solde_apres integer not null
);
create index if not exists modifications_bon_idx on public.modifications (bon_id);

-- ---------------------------------------------------------------------------
-- 5. Row Level Security — la garantie serveur qui manquait en v1 (§A5)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.enseignes enable row level security;
alter table public.bons enable row level security;
alter table public.mouvements enable row level security;
alter table public.overrides enable row level security;
alter table public.modifications enable row level security;

-- profiles : les deux comptes doivent pouvoir lire les deux lignes (pour
-- afficher "créé par CM/AJ" et peupler le sélecteur de visibilité), mais
-- chacun ne modifie que sa propre ligne.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid());

-- enseignes : pas de notion de privé, les deux comptes lisent/écrivent tout.
drop policy if exists "enseignes_all" on public.enseignes;
create policy "enseignes_all" on public.enseignes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- bons : la règle de visibilité elle-même (SELECT/UPDATE/DELETE) reproduit
-- exactement `visiblePour()` de la v1 — "partagé" ou "réservé à moi", sans
-- exception pour l'auteur. C'est délibéré, pas un oubli : la v1 se
-- comportait déjà ainsi (créer un bon puis le marquer "réservé à l'autre"
-- le rend invisible même pour soi, y compris dans son propre écran
-- d'édition) — voir le rapport de livraison pour la discussion de ce piège
-- hérité. Un premier jet de cette policy laissait le créateur toujours
-- passer (`or created_by = auth.uid()`) ; un test fonctionnel local a
-- montré que ça permettait à CM de lire un bon qu'il/elle avait pourtant
-- explicitement marqué "AJ seulement" — corrigé ici.
--
-- L'INSERT a sa propre policy, plus stricte qu'utile pour la lecture : on
-- ne peut créer un bon qu'en son propre nom (`created_by = auth.uid()`),
-- mais avec n'importe quelle visibilité valide (y compris "réservée à
-- l'autre" — la v1 autorise ce cas, un formulaire n'étant jamais restreint
-- à qui le remplit).
drop policy if exists "bons_visibles" on public.bons;
drop policy if exists "bons_select" on public.bons;
create policy "bons_select" on public.bons for select
  using (visibilite = 'partage' or visibilite = auth.uid()::text);

drop policy if exists "bons_insert" on public.bons;
create policy "bons_insert" on public.bons for insert
  with check (
    created_by = auth.uid()
    and (visibilite = 'partage' or visibilite in (select id::text from public.profiles))
  );

drop policy if exists "bons_update" on public.bons;
create policy "bons_update" on public.bons for update
  using (visibilite = 'partage' or visibilite = auth.uid()::text)
  with check (visibilite = 'partage' or visibilite in (select id::text from public.profiles));

drop policy if exists "bons_delete" on public.bons;
create policy "bons_delete" on public.bons for delete
  using (visibilite = 'partage' or visibilite = auth.uid()::text);

-- mouvements / overrides / modifications : héritent de la règle de lecture
-- du bon parent (jointure), pas de logique de visibilité propre.
drop policy if exists "mouvements_via_bon" on public.mouvements;
create policy "mouvements_via_bon" on public.mouvements for all
  using (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ))
  with check (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ));

drop policy if exists "overrides_via_bon" on public.overrides;
create policy "overrides_via_bon" on public.overrides for all
  using (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ))
  with check (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ));

drop policy if exists "modifications_via_bon" on public.modifications;
create policy "modifications_via_bon" on public.modifications for all
  using (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ))
  with check (exists (
    select 1 from public.bons b where b.id = bon_id
      and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
  ));

-- ---------------------------------------------------------------------------
-- 6. Realtime — expose les tables au flux de réplication (§A6)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bons'
  ) then
    alter publication supabase_realtime add table public.bons;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mouvements'
  ) then
    alter publication supabase_realtime add table public.mouvements;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'overrides'
  ) then
    alter publication supabase_realtime add table public.overrides;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'modifications'
  ) then
    alter publication supabase_realtime add table public.modifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Storage — bucket privé pour les PDF (§A7)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('pdfs', 'pdfs', false)
  on conflict (id) do nothing;

-- Chemin de stockage : "<bon_id>/<nom-de-fichier>" — storage.foldername(name)
-- renvoie ['<bon_id>'], ce qui permet de retrouver le bon concerné et de lui
-- appliquer la même règle de visibilité que ci-dessus.
drop policy if exists "pdfs_via_bon" on storage.objects;
create policy "pdfs_via_bon" on storage.objects for all
  using (
    bucket_id = 'pdfs'
    and exists (
      select 1 from public.bons b
      where b.id::text = (storage.foldername(name))[1]
        and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
    )
  )
  with check (
    bucket_id = 'pdfs'
    and exists (
      select 1 from public.bons b
      where b.id::text = (storage.foldername(name))[1]
        and (b.visibilite = 'partage' or b.visibilite = auth.uid()::text)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Après avoir créé les deux comptes CM et AJ dans Auth (Dashboard →
--    Authentication → Users → Add user), exécuter séparément (voir README) :
--
--    update public.profiles set display_name = 'CM', role = 'admin' where id = '<uid-de-CM>';
--    update public.profiles set display_name = 'AJ' where id = '<uid-de-AJ>';
-- ---------------------------------------------------------------------------
