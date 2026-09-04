# Architecture du projet

Ce document donne les repères utiles pour modifier l'application sans lire
chaque composant. Le projet est un carnet de voyage monopage : React dans le
navigateur, Supabase pour l'authentification et les données, Vercel pour les
deux appels OpenAI. Il n'y a pas d'API applicative persistante distincte.

## Vue d'ensemble

```text
Navigateur (Vite + React)
  main.jsx → App.jsx
       │       ├─ Supabase Auth + tables Postgres (via src/lib/)
       │       ├─ Google Maps JavaScript / Places (chargé à la demande)
       │       └─ POST /api/generate-* → Vercel Functions → OpenAI
       │
       └─ interface : voyages, idées, formulaire, carte, partage
```

Le front accède directement à Supabase avec la clé anonyme. Ce choix est sûr
uniquement parce que les politiques RLS du schéma constituent l'autorisation
réelle ; ne déplacez pas ces règles uniquement dans React.

## Démarrage et structure

- `src/main.jsx` monte `App` dans `React.StrictMode` et charge `index.css`.
- `src/App.jsx` est le contrôleur principal (état de session, liste des
  voyages, carnet ouvert, idées, modales). Il contient aussi les petits
  composants propres à la fiche d'idée (`Carnet`, `Card`, `Form`, `Confirm`).
- `src/components/` contient les vues isolées :
  `Auth`, `TripList` (et sa modale de partage), `NewTripWizard`,
  `PlaceSearch` et `GoogleMapView`.
- `src/lib/` est la frontière avec les services externes. Les composants ne
  construisent pas de requêtes Supabase directement.
- `api/` contient les fonctions serverless Vercel, séparées du bundle Vite.
- `supabase/migrations/` est la source de vérité du schéma, des fonctions SQL,
  des triggers et des politiques RLS ; c'est ce que `supabase db push` applique.
  `supabase/schema.sql` documente l'ancien déploiement et sa reprise de
  données : il ne doit pas être rejoué sur une base déjà migrée.

Tailwind fournit les utilitaires CSS ; l'identité visuelle et les styles de
base sont dans `src/index.css`. Il n'y a pas de routeur : l'état affiché est
local à `App.jsx` et le dernier voyage ouvert est gardé dans `localStorage`
sous `carnet-dernier-voyage`.

## Parcours principaux

### Authentification et montage

`App` récupère d'abord la session avec `getSession`, puis s'abonne à
`onAuthChange` (`src/lib/auth.js`). Il affiche successivement :

1. l'écran de configuration si les variables Supabase manquent ;
2. le chargement de session ;
3. `Auth` si personne n'est connecté ;
4. `Workspace` pour l'utilisateur connecté.

`Auth` couvre connexion, inscription, réinitialisation et nouveau mot de
passe. Les erreurs Supabase fréquentes sont traduites dans `lib/auth.js`.
Les liens de confirmation/récupération reviennent sur l'origine du site ;
`cleanAuthHash` retire ensuite le jeton du fragment d'URL.

### Création et consultation d'un voyage

`NewTripWizard` collecte les réponses. `Workspace.create` tente d'abord
`POST /api/generate-trip`. Même si cette génération échoue, le voyage est
créé dans `trips` avec les étapes saisies (ou la destination) et l'interface
affiche un avertissement. Les idées générées sont ensuite insérées en lot.

`listTrips` lit les voyages visibles et les adhésions de l'utilisateur, puis
ajoute au modèle d'UI `access: owner | read | write`. Le carnet ouvert charge
ses idées avec `loadIdeas`, filtre par étape/verdict/favori, et autorise les
mutations seulement quand `access` vaut `owner` ou `write`.

Les modifications d'idée passent par `saveIdea` ou `removeIdea`. L'interface
met la liste à jour de façon optimiste pour le favori et la suppression : une
erreur est affichée, mais l'état local n'est pas automatiquement rechargé.

### Carte, recherche et enrichissement IA

`googleMaps.js` injecte une seule fois le SDK Google Maps. `PlaceSearch`
utilise Places Autocomplete avec un délai de 320 ms et un jeton de session ;
le résultat remplit nom, adresse et coordonnées. `GoogleMapView` ne monte la
carte qu'en vue carte et dessine des `AdvancedMarkerElement` pour les idées
géolocalisées. Son bouton de localisation passe par `lib/geolocation.js`, qui
enveloppe `navigator.geolocation.watchPosition` : la position est dessinée avec
son cercle de précision, la carte n'est recentrée qu'au premier relevé, et le
suivi s'arrête au clic suivant comme au démontage du composant. Cette position
ne quitte pas le navigateur : elle n'est ni enregistrée ni envoyée à un tiers.

Le formulaire d'idée appelle `POST /api/generate-idea`. La fonction effectue
une recherche web OpenAI au mieux, puis produit un JSON strict ; le client ne
remplit que les champs encore vides afin de préserver la saisie manuelle.

## Données et droits

| Table | Rôle | Droits effectifs |
| --- | --- | --- |
| `trips` | Voyage, propriétaire, dates, étapes (`cities` JSONB) et réponses du wizard (`answers` JSONB) | propriétaire : tout ; membre : lecture |
| `ideas` | Lieux rattachés à un voyage | lecture pour tout lecteur ; écriture pour propriétaire/membre `write` |
| `trip_members` | Partages et niveau `read`/`write` | propriétaire : gère ; membre : voit sa propre adhésion |

`ideas.trip_id` cascade à la suppression d'un voyage. Le trigger
`set_idea_owner` attribue toujours une idée au propriétaire du voyage, y
compris quand elle est ajoutée par un membre. `touch_updated_at` maintient les
horodatages.

Les fonctions `owns_trip`, `can_read_trip` et `can_write_trip` sont
`security definer` pour éviter la récursion RLS. Le partage passe par le RPC
`share_trip`, qui vérifie que l'appelant est propriétaire et que l'adresse
cible correspond déjà à un compte. Ne remplacez pas ce RPC par un insert
client dans `trip_members` : aucune politique INSERT ne l'autorise.

La convention de modèle est importante : `cities[].id` est un slug unique
produit par `normalizeCities`; `ideas.city` contient cet id. Dans Postgres,
`description` et `when_note` correspondent respectivement aux propriétés
front `desc` et `when`; ce mapping est centralisé dans `src/lib/store.js`.

## Fonctions serverless

| Endpoint | Entrée | Sortie | Dégradation |
| --- | --- | --- | --- |
| `POST /api/generate-trip` | `answers` du wizard | voyage, étapes et idées suggérées | le client crée un voyage vide d'idées |
| `POST /api/generate-idea` | nom, lieu, destination et étape | champs de fiche suggérés | le formulaire reste éditable manuellement |
| `DELETE /api/delete-account` | jeton Supabase du compte | suppression du compte et de ses données | l'interface affiche l'erreur, rien n'est supprimé |

Les trois handlers refusent les autres méthodes HTTP, valident leur entrée
minimale et lisent leurs clés côté serveur. Les deux routes de génération
exigent un jeton Supabase valide (`requireUser` dans `api/auth.js`) avant de
dépenser du quota OpenAI ; `delete-account` vérifie le même jeton, puis n'agit
que sur le compte qu'il identifie, avec la clé de service.

`generate-trip` est limité à 60 secondes par Vercel et plafonne à cinq étapes,
quatre idées par étape. L'authentification empêche un appel anonyme, pas un
compte qui boucle : la limitation de débit reste une règle de pare-feu Vercel,
décrite dans [OPERATIONS.md](OPERATIONS.md).

## Configuration, exécution et déploiement

| Variable | Consommateur |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client React/Supabase |
| `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` (optionnel) | client Google Maps/Places |
| `OPENAI_API_KEY` | seulement les fonctions Vercel |

`npm run dev` lance seulement Vite. Utilisez `vercel dev` pour exercer aussi
les endpoints `api/`; `npm run build` vérifie le build de production.
`vercel.json` réécrit les routes non-API vers `index.html` pour la SPA. Sur
Vercel, les variables `VITE_*` sont prises au build : un changement demande
un nouveau déploiement.

## Où modifier quoi

- Ajouter un champ d'idée : modifier le formulaire dans `App.jsx`, les
  mappings `toRow`/`fromRow` de `store.js`, le schéma SQL et, si l'IA le
  remplit, `FIELDS_SCHEMA`/la liste de champs de `generate-idea`.
- Ajouter une donnée de voyage : `NewTripWizard`, `Workspace.create`,
  `createTrip`, le schéma `trips`, puis l'affichage concerné.
- Changer les règles de partage : SQL/RLS et les helpers dans `trips.js` en
  même temps ; un changement front seul n'est pas une règle de sécurité.
- Changer Google Maps : garder le chargement centralisé dans `googleMaps.js`;
  ne chargez pas le SDK depuis un composant supplémentaire.
- Toucher à la localisation : `lib/geolocation.js` et `GoogleMapView`, plus
  l'en-tête `Permissions-Policy` de `vercel.json` — un navigateur refuse la
  position sans même la demander si l'en-tête ne l'autorise pas, et cela ne se
  voit qu'en production. Sur Android, la position passe en plus par la
  délégation Bubblewrap du projet TWA (voir [PLAY_STORE.md](PLAY_STORE.md)). Si
  la position venait à être enregistrée ou transmise, la politique de
  confidentialité et la déclaration Play Console changeraient avec le code.
- Changer les prompts ou modèles : uniquement dans `api/`, jamais dans une
  variable `VITE_*` ni dans le client.

## Points d'attention

- Sans variables Supabase, il n'y a pas de repli local : `App` affiche l'écran
  de configuration et rien n'est lisible ni enregistrable.
- Les tests couvrent les composants, les fonctions serverless, le contrat du
  schéma, les politiques RLS sur une base locale et les parcours navigateur.
  `npm run test:all` les enchaîne, précédé du build et de l'audit des
  dépendances de production ; `npm run test:rls` demande Docker.
- Les pages légales (`public/confidentialite.html`, `public/conditions.html`)
  sont servies hors de la SPA, par des réécritures placées avant le
  catch-all de `vercel.json`. Elles doivent rester lisibles sans compte : leurs
  URL sont celles déclarées au Play Store.
