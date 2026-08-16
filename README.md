# Bons — suivi partagé des bons d'achat

## État actuel : MVP local, sans backend

Cette version sert à **tester l'ergonomie et les flux** avant de brancher
Supabase (base partagée, vraie authentification, RLS). C'est un choix
assumé, pas un oubli :

- **Aucune donnée n'est partagée entre appareils.** Chaque téléphone/
  ordinateur stocke ses propres bons dans IndexedDB (stockage local du
  navigateur). Installer l'app sur deux iPhones = deux carnets de bons
  indépendants, pas un carnet partagé.
- **Pas de vrai compte.** Au premier lancement, on choisit juste "Moi" ou
  "Ma femme" — ça sert uniquement à tracer qui a créé quoi/fait quelle
  dépense, sans mot de passe.
- **Les PDF sont stockés en local** (Blob IndexedDB), pas dans un bucket
  Supabase.
- Le routage utilise `HashRouter` (URLs en `#/...`) : ça fonctionne sur
  n'importe quel hébergement statique, y compris sans configuration
  serveur particulière — pratique pour ce stade du projet.

Tout le reste du cahier des charges (schéma SQL, RLS, fonctions
transactionnelles Postgres, auth e-mail/mot de passe, tests Playwright
avec deux comptes réels, anti-pause GitHub Actions) reste à faire et
viendra dans une deuxième phase, une fois l'ergonomie validée.

## Fonctionnalités couvertes dans ce MVP

- Écran d'accueil : bons actifs triés par urgence (expiration croissante,
  sans date en dernier), bandeau d'alerte sous 30 jours, pastilles par
  enseigne (nombre de bons + solde total), filtre au clic.
- Création d'un bon avec **alerte anti-oubli** dès la sélection/saisie de
  l'enseigne : solde actif déjà existant affiché avant toute validation.
- Enseigne créée automatiquement si elle n'existe pas encore.
- **Extraction automatique depuis le PDF** : au choix du fichier, tentative
  de lecture du code, du PIN et de la date d'expiration directement dans le
  texte du PDF, avec préremplissage des champs. Ne fonctionne que si le PDF
  a une couche de texte (pas une simple photo/scan) — sinon saisie manuelle
  normale, sans blocage.
- Champ PIN / code confidentiel, distinct du code du bon.
- **Édition complète d'un bon** après création (enseigne, montant, taux,
  dates, code, PIN) via le lien "Modifier" sur sa fiche — sans toucher à
  l'historique des dépenses et corrections déjà enregistrées.
- Dépense en 2 appuis depuis la liste, avec blocage si le montant dépasse
  le solde disponible.
- Correction manuelle du solde ("corriger le solde"), avec historique et
  auteur conservés.
- Archivage ("Marquer comme terminé", distinct de la suppression) et
  suppression définitive avec confirmation.
- PDF : ajout, consultation, remplacement, suppression.
- Écran Enseignes (renommer, lien de vérification, suppression), écran
  Expirés (section séparée, archivable) et écran **Calendrier** (grille des
  3 prochains mois avec les jours d'expiration marqués + liste complète des
  bons à échéance, y compris au-delà des 3 mois).
- Montants stockés en centimes (jamais en flottant).
- PWA installable (manifest + service worker, cache de l'app pour un accès
  hors ligne à l'interface — les données étaient de toute façon déjà
  locales). La librairie d'extraction PDF n'est chargée qu'à la demande,
  pas mise en cache hors-ligne par défaut (elle ne sert qu'à la création).

## Développement local

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production dans dist/
npm run preview  # sert le build de production localement
```

## Prochaine étape

Basculer sur Supabase (base partagée réelle, authentification e-mail/mot
de passe par compte, RLS, fonctions transactionnelles, stockage des PDF
par URL signées) puis déployer sur un hébergement public (Vercel ou
Netlify) pour un accès réel et partagé depuis les deux iPhones.
