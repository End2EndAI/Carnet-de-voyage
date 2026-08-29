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

Schéma dans [`supabase/schema.sql`](supabase/schema.sql), puis
[`supabase/auth.sql`](supabase/auth.sql) pour la connexion — à exécuter dans
cet ordre dans le SQL Editor du projet.

## Accès

Le carnet est privé : sans connexion, rien n'est visible. La connexion se fait
par **lien magique** — pas de mot de passe, un lien à usage unique valable
une heure envoyé par email.

Seules les adresses présentes dans la table `allowed_emails` peuvent entrer.
Deux verrous indépendants :

1. `disable_signup` est actif côté Supabase et le client demande
   `shouldCreateUser: false` — une adresse inconnue ne reçoit aucun email.
2. Les politiques RLS de `ideas` exigent `authenticated` **et** une adresse
   présente dans `allowed_emails`. Même avec un compte valide, une adresse
   hors liste ne lit ni n'écrit rien.

### Ajouter quelqu'un

```sql
insert into public.allowed_emails (email, note)
values ('elle@exemple.com', 'Prénom');
```

Puis créer le compte : dashboard Supabase → *Authentication* → *Users* →
*Add user* → cocher *Auto Confirm User*. Sans cette étape, la personne ne
recevra pas de lien (les inscriptions sont désactivées).

### Retirer quelqu'un

Supprimer la ligne de `allowed_emails` coupe l'accès à la requête suivante.
Pour invalider aussi sa session en cours, supprimer le compte dans
*Authentication* → *Users*.

> **Limite d'envoi** — le serveur mail intégré de Supabase est plafonné à
> **2 emails par heure**, tous usages confondus. Suffisant à deux personnes qui
> se connectent rarement (une session dure des semaines), mais si vous heurtez
> la limite, configurez un SMTP externe dans *Authentication* → *Emails*.

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
