# Carnet de voyage

Application de préparation de voyage multi-comptes. Chacun crée son compte et
ses voyages, puis peut les partager avec les personnes de son choix.

## Fonctionnalités

- **Inscription et connexion** par email + mot de passe
- **Suppression de compte** et des données associées depuis l’application
- **Plusieurs voyages par compte**, chacun avec ses étapes
- **Partage d'un voyage** avec un autre compte, en lecture ou en écriture
- **Création guidée** : cinq questions (destination, dates, étapes, centres
  d'intérêt, rythme) et le carnet se pré-remplit avec des lieux suggérés
- **Ajouter / modifier / supprimer** des idées de visite
- **Vraie carte Google Maps** avec un marqueur par lieu, cliquable
- **Recherche d'adresse** (Google Places) : le nom et les coordonnées se remplissent seuls
- **Complétion d'une fiche par IA** à partir du seul nom du lieu
- **Photo du lieu** (Google Places), affichée sur la fiche et dans le formulaire
- **Filtre par verdict** (oui / option / à voir / non), favoris, navigation par étape
- **Données cloisonnées** par compte au niveau de la base (Row Level Security)

## Variables d'environnement

| Variable | Rôle | Où la trouver |
|---|---|---|
| `VITE_SUPABASE_URL` | URL du projet | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Clé publique | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Suppression sécurisée du compte | Supabase → Project Settings → API |
| `VITE_GOOGLE_MAPS_API_KEY` | Carte + recherche | Google Cloud → APIs & Services → Credentials |
| `VITE_GOOGLE_MAPS_MAP_ID` | *(facultatif)* style de carte | Google Cloud → Map Management |
| `OPENAI_API_KEY` | Génération des carnets et des fiches | platform.openai.com |

APIs Google à activer : **Maps JavaScript API** et **Places API (New)**.

Les photos passent par la même clé que la carte : rien de plus à configurer.
Seul l'identifiant Google du lieu (`place_id`) est conservé en base — les URL
de photos expirent et Google en interdit la mise en cache, elles sont donc
demandées au moment de l'affichage, puis gardées en mémoire le temps de la
session. Une photo est cherchée quand on déplie une fiche, quand on choisit un
lieu dans la recherche d'adresse, et après une génération par l'IA ; jamais
pour toute une liste d'un coup, chaque lieu coûtant une requête Places.

`OPENAI_API_KEY` est volontairement **sans** préfixe `VITE_` : une variable
`VITE_*` est embarquée dans le bundle envoyé au navigateur. Seules les
fonctions serverless (`api/`) y ont accès.

`SUPABASE_SERVICE_ROLE_KEY` est elle aussi réservée aux fonctions serverless :
elle permet à `api/delete-account.js` de supprimer uniquement le compte dont
le jeton Supabase a été vérifié. Ne l’exposez jamais dans une variable `VITE_*`.

Les variables `VITE_*` sont lues au moment du build. Après les avoir modifiées
sur Vercel, il faut relancer un déploiement.

Sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, l'application affiche un
écran d'explication : il n'y a ni comptes ni carnets sans base.

## Mise en place du projet Supabase

### 1. Le schéma

Le schéma de production est versionné dans [`supabase/migrations`](supabase/migrations).
Après `supabase login` et `supabase link --project-ref …`, appliquez-le avec :

```bash
supabase db push --linked
```

[`supabase/schema.sql`](supabase/schema.sql) documente l'ancien déploiement et
sa reprise de données ; ne le rejouez pas sur une base déjà migrée.

Il crée `trips` et `ideas`, active la Row Level Security sur les deux, et
supprime l'ancien accès par liste blanche (`allowed_emails`). Les données de
l'ancienne version mono-carnet ne sont pas perdues : la table est renommée
`ideas_legacy` et son contenu repris dans un voyage rattaché au plus ancien
compte de la base. Une fois la reprise vérifiée, `ideas_legacy` peut être
supprimée à la main.

> Si la base ne contient encore aucun compte au moment de l'exécution, la
> reprise est ignorée avec un message. Rejouer le fichier après la première
> inscription.

### 2. L'authentification

Dans *Authentication* → *Sign In / Providers* → *Email* :

- **Allow new users to sign up** : activé, sinon personne ne peut s'inscrire.
- Configurez d'abord un SMTP externe, puis activez **Confirm email**. Le
  partage repose sur l'adresse email : une adresse non vérifiée ne doit jamais
  recevoir l'accès à un carnet.

Dans *Authentication* → *URL Configuration*, la *Site URL* et l'*allow list*
doivent couvrir l'URL de production et `http://localhost:5173/**`.

## Cloisonnement des données

Les propriétaires gardent le contrôle du voyage et de ses partages. Un membre
peut lire un voyage partagé, et modifier ses idées uniquement si l'accès
« écriture » lui a été donné. Les politiques RLS appliquent ces droits en base
et sont limitées au rôle `authenticated` — sans session, les tables sont invisibles.

Un compte ne peut donc ni lire, ni modifier, ni s'attribuer les données d'un
autre, même en manipulant les requêtes depuis le navigateur.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés
npm run dev
```

Le site est accessible sur `http://localhost:5173`.

Les fonctions `api/` ne tournent pas avec `npm run dev` : utilisez `vercel dev`
pour tester la génération de carnet et la complétion de fiche en local. Sans
elles, la création d'un voyage fonctionne quand même — le carnet est
simplement créé vide, avec un message.

## Tests

```bash
npm test            # tests unitaires, composants et fonctions serverless
npm run test:schema # contrat de sécurité du schéma Supabase
npm run test:rls    # vraies politiques RLS sur Supabase local démarré
npm run test:e2e    # parcours navigateur Chromium
npm run test:all    # build puis toutes les vérifications, RLS incluses
```

Installez Chromium une fois sur une nouvelle machine avec
`npx playwright install chromium`.

Le test RLS demande Docker et `supabase start`. Il applique le schéma à la base
locale uniquement ; il ne touche jamais au projet Supabase distant.

GitHub Actions exécute automatiquement `npm run test:all` sur chaque pull
request et chaque push vers `main`.

## Déploiement

Hébergé sur Vercel, déployé automatiquement à chaque push sur `main`.
Build : `npm run build` · Dossier de sortie : `dist`.

Les opérations de production (SMTP, pare-feu, alertes et reprise) sont décrites
dans [OPERATIONS.md](OPERATIONS.md).
