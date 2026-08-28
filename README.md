# Carnet de voyage — Corée du Sud

Carnet de voyage éditable pour un séjour en Corée du Sud du **24 septembre au 10 octobre 2026**.
66 idées de visites préchargées, réparties sur Séoul, Jeju, Busan, Gyeongju et Jeonju.

## Fonctionnalités

- **Ajouter / modifier / supprimer** des idées de visite
- **Persistance Supabase** — le carnet est le même sur téléphone et ordinateur
- **Vraie carte Google Maps** avec un marqueur par lieu, cliquable
- **Recherche d'adresse** (Google Places) : le nom et les coordonnées se remplissent seuls
- **Filtre par verdict** (oui / option / à voir / non) et navigation par ville
- **Mode dégradé** : si Supabase est injoignable, l'app continue en localStorage
- **Réinitialisation** possible vers les 66 idées d'origine

## Variables d'environnement

| Variable | Rôle | Où la trouver |
|---|---|---|
| `VITE_SUPABASE_URL` | URL du projet | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Clé publique | Supabase → Project Settings → API |
| `VITE_GOOGLE_MAPS_API_KEY` | Carte + recherche | Google Cloud → APIs & Services → Credentials |
| `VITE_GOOGLE_MAPS_MAP_ID` | *(facultatif)* style de carte | Google Cloud → Map Management |

APIs Google à activer : **Maps JavaScript API** et **Places API (New)**.

Ces variables sont lues au moment du build. Après les avoir modifiées sur Vercel,
il faut relancer un déploiement pour qu'elles prennent effet.

Sans elles, l'application démarre quand même : la persistance retombe sur
localStorage et la vue carte affiche un message d'explication.

## Base de données

Le schéma est dans [`supabase/schema.sql`](supabase/schema.sql) — à exécuter
dans le SQL Editor du projet. Au premier chargement, si la table `ideas` est
vide, l'application y verse automatiquement les 66 idées du carnet.

> **Note de sécurité** — le carnet n'a pas de compte utilisateur : les règles RLS
> donnent à la clé anon un accès complet à la table `ideas`. Toute personne
> connaissant l'URL du site peut donc lire et modifier le carnet. Pour cloisonner,
> il faut activer Supabase Auth (voir les commentaires dans `schema.sql`).

## Lancer en local

```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés
npm run dev
```

Le site est accessible sur `http://localhost:5173`.

## Déploiement

Hébergé sur Vercel, déployé automatiquement à chaque push sur `main`.
Build : `npm run build` · Dossier de sortie : `dist`.
