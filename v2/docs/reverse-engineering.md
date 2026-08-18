# CAJAC-Voucher v2 — Document de rétro-ingénierie

**Commit de référence :** `f67928c` (branche `claude/shared-voucher-tracker-pwa-nwxh7v`)
**Date :** 17 août 2026
**Application déployée :** https://gerardcrabix.github.io/Claude---voucher-app/v2/

Ce document décrit **ce que le code fait réellement**, tel qu'il existe à ce commit — pas ce qui était prévu au départ. Il complète deux documents antérieurs sans les remplacer :
- Le document Word « Inventaire complet des fonctionnalités » décrit la **v1** (dossier racine du dépôt, sans backend) — toujours exacte, v1 n'a pas été modifiée.
- Le document « CAJAC-Voucher v2 — Architecture & plan » (artefact Claude) décrit ce qui était **prévu** avant construction. Plusieurs points ont changé en cours de route ; ce document-ci fait foi sur l'état réel, le document d'architecture reste utile pour comprendre le raisonnement initial.

À cette date, la v2 est en usage réel par les deux utilisateurs finaux (CM et AJ) : connexion, création/dépense/correction de bons, clôture, export, mot de passe oublié — tous testés en conditions réelles, pas seulement en local. Un point reste en observation : la page blanche au démarrage sur Safari, signalée une fois, corrigée pour Firefox, jamais reconfirmée explicitement pour Safari depuis (voir §10).

---

## 1. Vue d'ensemble

```
gerardcrabix/Claude---voucher-app
├── (racine)          v1 — MVP local, IndexedDB, sans backend — inchangée
└── v2/                v2 — ce document
    ├── src/
    ├── supabase/migrations/   schéma SQL (3 fichiers, à exécuter dans l'ordre)
    ├── scripts/                script de migration v1 → v2
    └── docs/                   ce document
```

Les deux versions coexistent dans le même dépôt et sont déployées côte à côte sur le même site GitHub Pages : v1 à la racine, v2 sous `/v2/`. Un seul workflow GitHub Actions (`.github/workflows/deploy-pages.yml`) construit les deux à chaque push.

**Pourquoi un backend a été ajouté :** la v1 n'a jamais synchronisé quoi que ce soit entre appareils (base IndexedDB locale à chaque navigateur). Se connecter avec la même identité depuis un autre téléphone ouvrait une base vide. La v2 règle ce problème avec un vrai compte par personne (Supabase Auth) et une base partagée (Postgres).

---

## 2. Stack technique

| Composant | Choix | Remarque |
|---|---|---|
| Frontend | React 19 + Vite 8 | Identique à la v1 |
| Routage | `react-router-dom` (HashRouter) | Choix contraint par GitHub Pages (pas de rewrite serveur) — voir §5 pour le piège que ça pose avec les liens Supabase Auth |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | Un seul projet, partagé par les deux comptes |
| PDF, QR, XLSX | Code maison, sans dépendance (repris tel quel de la v1) | `src/pdf/*`, `src/export/qrcode.js`, `src/export/xlsxEcrivain.js` |
| Client Supabase | `@supabase/supabase-js` | Seule dépendance ajoutée par rapport à la v1 (qui utilisait `idb`, désormais retiré) |
| Hébergement | GitHub Pages (statique) | Le backend est le seul composant qui n'est plus 100 % client — tout le reste tourne dans le navigateur |

---

## 3. Modèle de données réel

Trois migrations, à exécuter **dans l'ordre**, une seule fois, dans le SQL Editor du projet Supabase :

1. `0001_init.sql` — schéma complet (tables, trigger, RLS, Realtime, bucket Storage)
2. `0002_archived_at.sql` — ajoute `bons.archived_at`
3. `0003_archived_by.sql` — ajoute `bons.archived_by`

Les deux dernières n'existaient pas au départ : elles ont été ajoutées en cours d'usage réel, quand il est devenu évident qu'un bon clôturé disparaissait sans laisser de trace (ni date, ni auteur) — voir §9.

### Tables

**`profiles`** — un compte réel = une ligne. Remplace les identités simulées `'moi'`/`'elle'` de la v1.
| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid, FK → `auth.users` | Même id que le compte Auth |
| `display_name` | text | « CM » ou « AJ » à l'affichage |
| `role` | text (`member`\|`admin`) | `admin` = peut gérer les logos d'enseigne |

Remplie automatiquement par un trigger (`gerer_nouvel_utilisateur`) à la création d'un compte Auth, avec `display_name` dérivé de l'e-mail — à corriger manuellement une fois (voir README) pour afficher « CM »/« AJ » plutôt que le préfixe de l'adresse mail.

**`enseignes`** — inchangée dans l'esprit par rapport à la v1 (nom, nom normalisé, lien de vérification, logo). Le logo reste stocké en **data URL** (colonne texte), pas dans un bucket Storage — décision prise après coup : c'est une petite image déjà redimensionnée côté client (128px max), le détour par Storage n'apportait rien de concret.

**`bons`** — équivalent de la v1, avec des différences notables :

| Champ | Vient de… | Remarque |
|---|---|---|
| `visibilite` | v1 | `'partage'` ou l'**uid réel** d'un des deux comptes (au lieu de `'moi'`/`'elle'`) |
| `code_barres_url` | v1 | Reste en data URL, comme le logo — même raisonnement |
| `pdf_path`, `pdf_filename`, `pdf_content_type` | nouveau | Le PDF, lui, va réellement dans Storage (bucket privé `pdfs`) — c'est le seul fichier assez volumineux pour le justifier |
| `archived_at` | ajouté (0002) | Date de clôture — absente du schéma initial |
| `archived_by` | ajouté (0003) | Qui a clôturé — absente du schéma initial |
| `tauxReduction` | **abandonné** | Champ mort en v1 (jamais exposé dans l'interface), non repris ici |

**`mouvements`**, **`overrides`**, **`modifications`** — inchangées dans l'esprit (dépenses, corrections de solde, changements de montant initial), avec `auteur` qui est désormais un vrai uid.

### Ce qui n'est PAS dans une table

La clôture d'un bon (`terminerBon`) ne passe par **aucune** des tables d'historique ci-dessus — c'est un simple changement de deux/trois colonnes sur la ligne `bons` elle-même (`archived`, `archived_at`, `archived_by`). Contrairement aux dépenses et corrections, il n'existe pas de ligne dédiée « évènement de clôture » dans une table séparée. Le code la traite comme un évènement virtuel, reconstruit à la volée (voir §9, `calculerLignesHistoriqueBon`).

---

## 4. Sécurité — Row Level Security

Chaque table a RLS activé. Résumé des politiques telles qu'elles existent aujourd'hui (fichier `0001_init.sql`) :

| Table | Règle |
|---|---|
| `profiles` | Lecture : tout le monde. Écriture : chacun sa propre ligne. |
| `enseignes` | Lecture/écriture : les deux comptes, sans distinction. |
| `bons` (lecture/modif/suppr) | `visibilite = 'partage' OU visibilite = auth.uid()` |
| `bons` (création) | `created_by = auth.uid()` ET visibilité valide (partage ou un des deux comptes réels) |
| `mouvements`/`overrides`/`modifications` | Héritent de la règle de lecture du bon parent (sous-requête `EXISTS`) |
| Storage `pdfs` | Même règle que le bon associé (chemin `<bon_id>/<fichier>`, retrouvé via `storage.foldername`) |
| Storage `logos` | Public en lecture (pas de donnée sensible) |

**Un bug réel a été trouvé et corrigé pendant la construction**, avant toute mise en production : la première version de la policy `bons` incluait `OR created_by = auth.uid()` dans la règle de **lecture**, ce qui permettait à l'auteur d'un bon de continuer à le voir même après l'avoir explicitement marqué « réservé à l'autre ». Un test fonctionnel local (deux comptes simulés sur un Postgres jetable, avant tout déploiement réel) l'a détecté ; la policy a été scindée en `bons_select`/`bons_insert`/`bons_update`/`bons_delete` distinctes pour que seul l'`INSERT` autorise l'auteur à agir en son propre nom, sans jamais lui donner un accès de lecture supplémentaire.

---

## 5. Authentification

Supabase Auth, e-mail + mot de passe, un compte réel par personne (créés manuellement dans le Dashboard, pas de self-service). `src/auth/AuthContext.jsx` expose `identite` (l'uid), `profil`, `profils` (les deux comptes), `estAdmin`, `libelleIdentite(id)`.

**Mot de passe oublié** (`demanderReinitialisation` / `definirNouveauMotDePasse`, page `ReinitialiserMotDePasse.jsx`) : ajouté après la mise en production, suite à un usage réel (AJ perd son mot de passe régulièrement). Remplace l'ancien onglet Admin de la v1, qui n'a plus de sens avec de vrais comptes (un compte ne peut pas changer le mot de passe d'un autre compte sans la clé de service, qui ne doit jamais être exposée côté client).

**Piège technique réel rencontré et documenté dans le code** : l'application utilise `HashRouter` (routage par `#/route`, imposé par l'hébergement statique GitHub Pages). Supabase, en mode implicite, ajoute lui aussi ses jetons de récupération après un `#` dans l'URL de retour. Deux `#` dans la même URL ne peuvent pas coexister proprement. La solution retenue : `redirectTo` pointe vers la **racine du site sans route** ; `App.jsx` détecte l'évènement `PASSWORD_RECOVERY` de Supabase et affiche le formulaire de nouveau mot de passe **avant même de regarder la route de l'URL**, quel que soit le hash présent au moment de l'arrivée sur le lien reçu par e-mail.

---

## 6. Synchronisation temps réel

`src/db/realtime.js` : une souscription Supabase Realtime par écran (`useSyncBons`), sur les tables `bons`/`mouvements`/`overrides`/`modifications`. Chaque évènement déclenche un **rechargement complet** des données de l'écran — pas de fusion incrémentale fine. Volontairement simple : pour deux comptes et quelques centaines de bons, la fiabilité d'un rechargement complet l'emporte sur l'optimisation d'une fusion partielle plus complexe à maintenir correctement.

**Point d'attention découvert en usage réel** (voir §9) : ce rechargement complet appelait, par bon, trois requêtes réseau séparées pour son historique — ce qui devenait très lentement perceptible à mesure que le nombre de bons grandissait, et se redéclenchait à chaque évènement Realtime. Corrigé (voir §9), mais explique pourquoi ce choix de conception (rechargement complet) doit rester attentif au coût de ce qu'il recharge.

---

## 7. Couche `db/repository.js` — inventaire

Mêmes noms de fonctions qu'en v1 (l'objectif explicite de la réécriture était que les pages n'aient presque rien à changer). Différences de fond :

- Le paramètre `identite` de beaucoup de fonctions (`listerBonsEnrichis(identite)`, `obtenirBon(id, identite)`…) **n'est plus utilisé pour filtrer** — Row Level Security s'en charge déjà côté serveur, une requête ne peut physiquement pas renvoyer un bon non autorisé. Le paramètre est gardé uniquement pour ne pas changer la signature des appels existants.
- `enregistrerMouvement` (le contrôle « ne pas dépasser le solde ») n'est plus dans une transaction IndexedDB atomique : c'est une vérification en deux temps (lecture puis écriture). Avec deux appareils actifs simultanément, une dépense lancée sur les deux en même temps pourrait en théorie passer les deux malgré un solde insuffisant pour les deux cumulées — limite assumée, non corrigée (fenêtre de risque très étroite pour un usage à deux personnes).
- `chargerHistoriqueGroupe(bonIds)` — remplace les appels un-par-un à `chargerHistorique(bonId)` dans les fonctions qui listent plusieurs bons (voir §9).
- `construireLignesHistorique(bonsEnrichis)` — fonction pure, transforme des bons déjà chargés en lignes d'historique à plat (dépense/correction/modification/clôture), utilisée à la fois par l'écran Enseignes (accordéon) et par l'export Excel complet.
- `purgerBonsAnciens()` — purge automatique (voir §9), appelée une fois par ouverture de session depuis `App.jsx`.
- `obtenirUrlsPdf(bonsAvecPdf)` — génère des URLs signées Storage en un seul appel groupé (`createSignedUrls`), pour afficher un lien PDF direct sur chaque carte de l'accueil sans télécharger le fichier par avance.

---

## 8. Parcours écran par écran

| Écran | Fichier | Statut par rapport au plan initial |
|---|---|---|
| Connexion | `pages/Connexion.jsx` | Conforme + lien « mot de passe oublié » ajouté après coup |
| Réinitialisation mot de passe | `pages/ReinitialiserMotDePasse.jsx` | N'existait pas dans le plan initial — ajouté suite à un vrai besoin |
| Accueil | `pages/Accueil.jsx` + `components/BonCard.jsx` | Très enrichi après la mise en prod (voir §9) |
| Nouveau bon | `pages/NouveauBon.jsx` | Conforme, extraction PDF inchangée |
| Fiche détail | `pages/BonDetail.jsx` | Conforme |
| Modifier | `pages/EditerBon.jsx` | Conforme |
| Enseignes | `pages/Enseignes.jsx` | + accordéon « Historique » par enseigne, ajouté après coup |
| Calendrier | `pages/Calendrier.jsx` | Conforme |
| Expirés | `pages/Expires.jsx` | Fortement étendu (voir §9) : couvre désormais expiré + soldé + clôturé, plus corrections/réactivation directement depuis l'écran |
| Export | `pages/Export.jsx` | Refondu (voir §9) : multi-enseignes, deux types d'export |
| Diagnostic | `pages/Diagnostic.jsx` | Repris tel quel de la v1, **pas** mis à jour pour afficher l'état de la connexion Realtime (dette mineure, voir §11) |
| Admin | — | **Retiré**, n'a plus de sens avec de vrais comptes Supabase Auth |

---

## 9. Ce qui a changé après la première mise en production

Ordre chronologique réel, tel que rapporté par l'usage — pas des améliorations anticipées, des corrections/ajouts nés de retours concrets :

1. **Page blanche au démarrage (Firefox)** — sur certains réglages de confidentialité, l'accès à `localStorage` lève une exception synchrone au lieu de renvoyer `undefined`. Comme Supabase y accède par défaut dès la création du client (donc avant le premier rendu React), toute l'application ne démarrait pas, sans que l'`ErrorBoundary` (qui ne protège que le rendu React) ne puisse rien afficher. `src/supabase/client.js` teste maintenant l'accès et bascule sur un stockage en mémoire en cas d'échec ; `index.html` ajoute un filet de secours indépendant de React (affiche un message après 5 secondes si rien n'a démarré). **Non reconfirmé sur Safari depuis** — même symptôme signalé une fois, cause potentiellement différente, jamais creusé plus loin après le correctif Firefox.
2. **Lenteur sévère** — `listerBonsEnrichis`, `getSoldeActifParEnseigne` et `listerPastillesEnseignes` faisaient chacun 3 requêtes réseau **par bon** (mouvements/overrides/modifications), donc 3N+2 requêtes pour lister N bons — et ce rechargement se redéclenchait à chaque évènement Realtime. Remplacé par `chargerHistoriqueGroupe` : 3 requêtes au total, quel que soit N, via `.in('bon_id', [...])` puis regroupement en mémoire.
3. **Bons soldés à 0 introuvables** — un bon dont le solde tombe à 0 sortait de l'accueil (qui ne montre que les actifs) et n'apparaissait nulle part ensuite. Ajouté à l'écran Expirés, avec la date (et l'auteur) du dernier évènement qui l'a amené à 0 — recalculée depuis l'historique existant, sans nouvelle colonne.
4. **Bons clôturés introuvables** — même problème, en pire : `reactiverBon()` existait déjà dans le code depuis le début (repris de la v1) mais n'était relié à aucun bouton. Ajouté à l'écran Expirés avec un bouton « Reprendre », plus le suivi de qui/quand a clôturé (`archived_at`/`archived_by`, migrations 0002/0003).
5. **Code-barres pas assez visible** — présent sur la carte d'accueil dès la construction initiale, mais raté par un vrai test utilisateur. Étiquette ajoutée, image agrandie, contour en couleur.
6. **PDF accessible seulement depuis la fiche détail** — lien direct ajouté sur la carte d'accueil, sous le code-barres, via des URLs signées Storage groupées (`obtenirUrlsPdf`) pour rester compatible avec le blocage des popups asynchrones de Safari/iOS.
7. **Code et PIN qui se chevauchent sur mobile** — un vrai code-barres extrait de PDF (Carrefour) peut faire 20-25 caractères, faisant sauter le PIN à la ligne suivante sur un écran de téléphone. Le code (et le PIN avec lui, pour rester à la même taille) rétrécit automatiquement à partir de 14 caractères.
8. **Logo d'enseigne absent de la carte d'accueil** — n'apparaissait que sur l'écran Enseignes ; ajouté devant le nom sur chaque carte.
9. **Historique par enseigne** — nouvelle fonctionnalité (n'existait pas en v1) : tableau accordéon sur l'écran Enseignes, tous bons confondus, avec montant avant/après recalculé en rejouant chronologiquement chaque bon.
10. **Export Excel refondu** — sélection d'enseignes multiple (1 à N, au lieu d'une seule) ; deuxième export ajouté (« Export complet ») avec tous statuts confondus et un onglet « Historique » — a nécessité de faire évoluer l'écrivain XLSX maison (`xlsxEcrivain.js`) pour supporter plusieurs onglets dans un même classeur, jusque-là limité à un seul.
11. **Purge automatique** — bons expirés depuis plus de 13 mois ou soldés depuis plus de 12 mois supprimés définitivement, jamais les bons clôturés (contrôle manuel volontaire). Ce n'est pas un vrai cron serveur : la vérification tourne une fois par ouverture de session (voir §11).
12. **Code-barres agrandi en plein écran au tap** — pour éviter de zoomer toute l'application avec deux doigts en caisse ; fermeture manuelle (tap n'importe où), délibérément pas de minuteur automatique.

---

## 10. Ce qui n'est pas encore confirmé

- **Safari, page blanche au démarrage** : signalé une fois par l'utilisateur, le correctif livré ciblait spécifiquement une cause Firefox (`localStorage` qui lève une exception) confirmée par une simulation Playwright ; l'utilisateur a ensuite indiqué que Chrome et Safari fonctionnaient (« ça marche aussi parfaitement sur Google »), sans reconfirmation explicite que Safari était bien concerné par la même cause ou une autre. **Aucune anomalie Safari non résolue connue à ce jour**, mais ce point n'a jamais été creusé plus loin faute de message d'erreur récupéré.
- Aucune des vérifications techniques de cette session (SQL, RLS, performance) n'a pu être testée par Claude directement contre le vrai projet Supabase — l'environnement de développement n'a pas accès réseau à `*.supabase.co` (politique réseau du sandbox). Tout ce qui est décrit comme « fonctionnel » dans ce document l'est parce que **l'utilisateur l'a testé lui-même en production réelle**, pas parce que Claude l'a vérifié de bout en bout.

---

## 11. Limites connues / dette technique

- **Purge « automatique »** : dépend de l'ouverture de l'application, pas un vrai cron indépendant. Si personne n'ouvre l'appli après qu'un bon a franchi son seuil, la purge est retardée jusqu'au prochain lancement.
- **Pas de vraie gestion de concurrence** sur les dépenses simultanées (voir §7) — fenêtre de risque théorique, jamais rencontrée en usage réel à ce jour.
- **Écran Diagnostic** hérité tel quel de la v1 — ne reflète pas l'état de la connexion Realtime ni les nouvelles fonctionnalités (purge, export). Utile pour un souci de rendu ou une erreur JS, pas pour diagnostiquer un souci de synchronisation.
- **Un seul fichier JS** (~530 Ko avant compression) — pas de découpage en plusieurs morceaux (`code splitting`). Sans conséquence perceptible pour un usage à deux personnes sur une connexion mobile normale, mais signalé par l'avertissement de build Vite à chaque compilation.
- **`tauxReduction`** définitivement abandonné (v1 déjà, confirmé ici) — si un besoin réel apparaît un jour (bons à réduction plutôt qu'à montant fixe), c'est à reconstruire consciemment, pas à réactiver un champ mort.

---

## 12. Comment reconstituer cet état

```bash
git clone https://github.com/gerardcrabix/Claude---voucher-app
cd Claude---voucher-app
git checkout f67928c   # ou plus récent sur claude/shared-voucher-tracker-pwa-nwxh7v
cd v2
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Côté Supabase (une fois, dans l'ordre) : exécuter `supabase/migrations/0001_init.sql`, puis `0002_archived_at.sql`, puis `0003_archived_by.sql` dans le SQL Editor ; créer les deux comptes dans Authentication → Users ; les nommer via `update public.profiles set display_name = '…', role = '…' where id = '…'` ; ajouter l'URL de déploiement dans Authentication → URL Configuration → Redirect URLs (nécessaire pour « mot de passe oublié »).
