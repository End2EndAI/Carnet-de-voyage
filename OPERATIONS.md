# Exploitation production

## Déploiement

La seule source de vérité de la base est `supabase/migrations/`. Après revue
et passage de CI, appliquez les migrations avec `supabase db push --linked`.
Ne rejouez pas `supabase/schema.sql` en production : il reste une référence de
l'ancien déploiement et de sa reprise de données.

L'URL de production est `https://ai-simple-voyage-planner.vercel.app/`. Gardez
`https://carnet-de-voyage-zeta.vercel.app/` dans les redirections Supabase et
les restrictions Google jusqu'à ce que la nouvelle URL ait été validée.

## Réglages hors dépôt

- Dans Supabase, configurez SMTP, activez la confirmation d'email, exigez au
  moins 8 caractères de mot de passe, et ajoutez les deux URLs ci-dessus aux
  redirections autorisées.
- Dans Vercel → Firewall, créez une règle : chemins `/api/generate-trip` et
  `/api/generate-idea`, limitation de 10 requêtes par minute et par IP, réponse
  `429`. Surveillez-la en mode journalisation avant de la publier.
- Activez les alertes de budget et d'erreur dans OpenAI, Google Maps, Vercel et
  Supabase. Testez une restauration Supabase avant de dépendre des sauvegardes.
- Avant ouverture au public, publiez les conditions, la politique de
  confidentialité (OpenAI, Google et Supabase reçoivent des données de voyage),
  ainsi qu'une procédure d'export et de suppression de compte.

## Quand la carte affiche « Une erreur s'est produite »

Ce panneau gris vient de Google, pas de l'application : la clé a été refusée
pour la page qui la demande. La console du navigateur en donne le motif exact
(`RefererNotAllowedMapError`, `ApiNotActivatedMapError`,
`BillingNotEnabledMapError`, `InvalidKeyMapError`).

Le cas le plus courant est la préversion : Vercel sert chaque branche sur son
propre domaine (`…-git-<branche>-<compte>.vercel.app`), qu'une restriction
limitée au domaine de production ne couvre pas. Ajoutez alors le motif
`https://ai-simple-voyage-planner-*.vercel.app/*` aux référents autorisés de la
clé (Google Cloud → APIs & Services → Credentials), en plus des URLs de
production. La restriction reste indispensable : une clé Maps sans référent
autorisé est utilisable par n'importe quel site, à vos frais.

L'application intercepte ce refus (`gm_authFailure`) et remplace le panneau de
Google par un message qui dit quoi vérifier ; elle ne peut pas le corriger.
