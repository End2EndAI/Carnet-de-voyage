# Carnet de voyage

Application de préparation de voyage multi-comptes. Chacun crée son compte,
ses voyages, et ne voit que les siens.

## Fonctionnalités

- **Inscription et connexion** par email + mot de passe
- **Plusieurs voyages par compte**, chacun avec ses étapes
- **Création guidée** : cinq questions (destination, dates, étapes, centres
  d'intérêt, rythme) et le carnet se pré-remplit avec des lieux suggérés
- **Ajouter / modifier / supprimer** des idées de visite
- **Vraie carte Google Maps** avec un marqueur par lieu, cliquable
- **Recherche d'adresse** (Google Places) : le nom et les coordonnées se remplissent seuls
- **Complétion d'une fiche par IA** à partir du seul nom du lieu
- **Filtre par verdict** (oui / option / à voir / non), favoris, navigation par étape
- **Données cloisonnées** par compte au niveau de la base (Row Level Security)

## Variables d'environnement

| Variable | Rôle | Où la trouver |
|---|---|---|
| `VITE_SUPABASE_URL` | URL du projet | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Clé publique | Supabase → Project Settings → API |
| `VITE_GOOGLE_MAPS_API_KEY` | Carte + recherche | Google Cloud → APIs & Services → Credentials |
| `VITE_GOOGLE_MAPS_MAP_ID` | *(facultatif)* style de carte | Google Cloud → Map Management |
| `OPENAI_API_KEY` | Génération des carnets et des fiches | platform.openai.com |

APIs Google à activer : **Maps JavaScript API** et **Places API (New)**.

`OPENAI_API_KEY` est volontairement **sans** préfixe `VITE_` : une variable
`VITE_*` est embarquée dans le bundle envoyé au navigateur. Seules les
fonctions serverless (`api/`) y ont accès.

Les variables `VITE_*` sont lues au moment du build. Après les avoir modifiées
sur Vercel, il faut relancer un déploiement.

Sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, l'application affiche un
écran d'explication : il n'y a ni comptes ni carnets sans base.

## Mise en place du projet Supabase

### 1. Le schéma

Exécuter [`supabase/schema.sql`](supabase/schema.sql) dans le SQL Editor du
projet. Le fichier est idempotent et peut être rejoué.

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
- **Confirm email** : désactivé. Le serveur mail intégré de Supabase est
  plafonné à **2 emails par heure**, tous usages confondus — avec la
  confirmation active, la troisième inscription de l'heure échoue. Pour la
  garder active, configurez d'abord un SMTP externe dans *Authentication* →
  *Emails*. Le code gère les deux cas : sans session en retour, l'écran invite
  à ouvrir le lien de confirmation.

Dans *Authentication* → *URL Configuration*, la *Site URL* et l'*allow list*
doivent couvrir l'URL de production et `http://localhost:5173/**`.

## Cloisonnement des données

`trips.user_id` et `ideas.user_id` ont `auth.uid()` pour valeur par défaut :
le client n'envoie jamais l'identifiant du propriétaire. Les politiques RLS
n'autorisent que `user_id = auth.uid()`, en lecture comme en écriture, et sont
limitées au rôle `authenticated` — sans session, les tables sont invisibles.

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

## Déploiement

Hébergé sur Vercel, déployé automatiquement à chaque push sur `main`.
Build : `npm run build` · Dossier de sortie : `dist`.
