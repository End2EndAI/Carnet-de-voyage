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
