# CAJAC-Voucher v2

Deuxième version de l'application, avec un vrai backend (Supabase) à la
place du stockage 100&nbsp;% local de la v1 — voir le document
« CAJAC-Voucher v2 — Architecture & plan » pour le détail des choix, et le
rapport de livraison pour ce qui est vérifié vs. ce qui reste à faire de
votre côté.

**La v1 (dossier racine du dépôt) n'est pas modifiée** et continue de
tourner telle quelle. Ce dossier `v2/` est un projet à part, à son propre
rythme de mise en route.

## 0. Ce qui est déjà fait ici

- Tout le code applicatif : écrans, composants, extraction PDF, génération
  QR/XLSX (repris à l'identique de la v1), couche `repository.js` réécrite
  pour Supabase, authentification réelle, synchronisation temps réel.
- Le schéma SQL complet (`supabase/migrations/0001_init.sql`), avec Row
  Level Security.
- Le script de migration depuis une sauvegarde JSON v1.
- `npm run build` compile sans erreur (vérifié).

## 1. Ce qui reste à faire — et pourquoi ce n'est pas déjà fait

Cet environnement de développement n'a **pas accès au réseau vers
`*.supabase.co`** (bloqué par la politique réseau du sandbox — confirmé,
ce n'est pas un bug applicatif). Concrètement, je n'ai pas pu, depuis
cette session :

- exécuter le schéma SQL sur votre projet réel,
- créer les deux comptes (CM, AJ),
- vérifier la connexion, l'authentification, la synchronisation temps réel
  ou le stockage de fichiers contre le vrai serveur.

Le code est écrit et cohérent avec le schéma, mais **n'a pas encore tourné
une seule fois contre Supabase**. Les étapes ci-dessous sont donc à faire
par vous (ou en relançant une session ayant accès au réseau vers Supabase),
avant de considérer la v2 utilisable.

## 2. Mise en route

### a. Exécuter le schéma SQL

Dashboard Supabase → SQL Editor → New query → coller le contenu de
`supabase/migrations/0001_init.sql` → Run.

### b. Créer les deux comptes

Dashboard → Authentication → Users → Add user, une fois pour CM, une fois
pour AJ (email + mot de passe de votre choix). Notez l'UUID de chaque
compte (colonne `UID`).

Puis, dans SQL Editor, avec les deux UUID notés :

```sql
update public.profiles set display_name = 'CM', role = 'admin' where id = '<uid-de-CM>';
update public.profiles set display_name = 'AJ' where id = '<uid-de-AJ>';
```

### c. Configurer le frontend

```bash
cp .env.example .env.local
# éditer .env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
# (Dashboard → Project Settings → API)
npm install
npm run dev
```

Se connecter avec l'un des deux comptes créés à l'étape b.

### d. Migrer les données existantes (optionnel, quand vous êtes prêts)

```bash
# Chacun exporte sa sauvegarde depuis la v1 (menu Export → Exporter toutes les données)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CM_UID=... AJ_UID=... \
  node scripts/migrate-from-v1-backup.mjs sauvegarde-cm.json sauvegarde-aj.json
```

Le script journalise tout doublon détecté entre les deux fichiers plutôt
que de fusionner en silence (voir le document d'architecture, §A8).

### e. Déployer

Même mécanisme que la v1 (GitHub Pages + Action de build), à adapter pour
pointer sur `v2/` — non encore mis en place dans ce dépôt (voir le rapport
de livraison).

## 3. Simplifications assumées par rapport au document d'architecture

- Les logos d'enseigne et les images de code-barres/QR restent en data URL
  (colonne texte), pas dans un bucket Storage — ce sont de petites images,
  le détour par Storage n'apportait rien de concret pour leur taille.
- L'onglet « Admin » de gestion des mots de passe a été retiré : Supabase
  Auth gère désormais les mots de passe, ce n'est plus le rôle de
  l'application.
- La restauration de sauvegarde n'est plus proposée dans l'écran Export :
  c'est désormais une opération hors application (`migrate-from-v1-
  backup.mjs`), pour éviter qu'un remplacement accidentel touche la base
  partagée par les deux comptes.
- La sauvegarde JSON exportée depuis un compte ne contient que ce que ce
  compte peut voir (Row Level Security) — ce n'est plus une sauvegarde
  strictement complète comme en v1.
