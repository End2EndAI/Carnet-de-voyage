// Pages légales et signalement de contenu, exigés par le Play Store.
// Les deux pages sont des fichiers statiques de `public/`, servis hors de la SPA
// (`cleanUrls` dans vercel.json) : elles restent lisibles sans compte.

export const CONTACT_EMAIL = 'louis.fontaine.pro@gmail.com';
export const PRIVACY_URL = '/confidentialite';
export const TERMS_URL = '/conditions';

/**
 * Lien de signalement d'une suggestion générée par IA. La politique Play sur le
 * contenu génératif impose un moyen de signalement accessible depuis l'app,
 * au plus près du contenu concerné.
 */
export function reportIdeaUrl(idea, tripTitle) {
  const subject = 'Signalement de contenu généré par IA';
  const body = [
    'Décrivez en quelques mots ce qui pose problème :',
    '',
    '',
    '— Ne modifiez pas les lignes ci-dessous, elles identifient la fiche —',
    `Lieu : ${idea?.title || '(sans titre)'}`,
    `Voyage : ${tripTitle || '(inconnu)'}`,
    `Référence : ${idea?.id || '(non enregistrée)'}`,
  ].join('\n');

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
