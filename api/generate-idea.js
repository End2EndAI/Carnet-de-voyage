// Fonction serverless Vercel — génère les champs d'une idée (description, type,
// quartier, etc.) via un modèle OpenAI, à partir du nom du lieu déjà saisi.
//
// Nécessite la variable d'environnement OPENAI_API_KEY côté Vercel
// (Project Settings > Environment Variables). Volontairement SANS préfixe
// VITE_ : une variable VITE_* est embarquée dans le bundle JS envoyé au
// navigateur, ce qui exposerait la clé à n'importe qui. Ici, seul ce code
// serveur y a accès.

import OpenAI from 'openai';

const MODEL = 'gpt-5.6-luna';

const FIELDS_SCHEMA = {
  type: 'object',
  properties: {
    kr: {
      type: 'string',
      description:
        "Nom coréen du lieu suivi d'un court sous-titre séparé par ' · ', ex: '경복궁 · Palais royal'. Chaîne vide si inconnu.",
    },
    type: {
      type: 'string',
      description: "Catégorie courte séparée par ' · ', ex: 'Café · Brunch' ou 'Activité · Culture'.",
    },
    note: {
      type: 'string',
      description: 'Note courte et pratique, une phrase maximum, ex : "À réserver le week-end".',
    },
    desc: {
      type: 'string',
      description: 'Descriptif factuel et neutre du lieu, 2 à 3 phrases, en français.',
    },
    zone: {
      type: 'string',
      description: 'Quartier ou zone probable où se trouve le lieu, si déductible du nom ou de la ville.',
    },
    avis: {
      type: 'string',
      description:
        "Brouillon d'avis en 1 à 2 phrases, formulé comme une suggestion à relire et corriger — jamais comme un vécu personnel réel.",
    },
    when: {
      type: 'string',
      description: 'Suggestion de moment du séjour pour caser cette visite, ex : "Plutôt en fin de journée".',
    },
  },
  required: ['kr', 'type', 'note', 'desc', 'zone', 'avis', 'when'],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Clé OpenAI absente côté serveur. Ajoutez OPENAI_API_KEY dans les variables d'environnement Vercel.",
    });
    return;
  }

  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const zone = typeof body.zone === 'string' ? body.zone.trim() : '';
  const kr = typeof body.kr === 'string' ? body.kr.trim() : '';

  if (!title) {
    res.status(400).json({ error: "Le nom du lieu est requis pour générer une fiche." });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: 'system',
          content:
            "Tu aides à pré-remplir une fiche d'un carnet de voyage personnel en Corée du Sud. " +
            'Réponds uniquement en français, de façon factuelle, concise et sobre. ' +
            "Si tu n'es pas certain d'un détail précis (adresse exacte, prix, horaires), reste " +
            "général plutôt que d'inventer. Le champ \"avis\" doit rester un brouillon neutre à " +
            "corriger par l'utilisateur, jamais formulé comme une expérience vécue.",
        },
        {
          role: 'user',
          content: [
            `Lieu : ${title}`,
            `Ville : ${city || 'non précisée'}`,
            `Quartier déjà connu : ${zone || 'inconnu'}`,
            `Nom coréen déjà connu : ${kr || 'inconnu'}`,
            '',
            'Propose les champs manquants de la fiche.',
          ].join('\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'idee_carnet',
          schema: FIELDS_SCHEMA,
          strict: true,
        },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      res.status(502).json({ error: 'Réponse OpenAI inattendue (aucun contenu structuré).' });
      return;
    }

    const fields = JSON.parse(raw);
    res.status(200).json({ fields });
  } catch (err) {
    const message = err?.message || "Échec de l'appel à OpenAI.";
    res.status(502).json({ error: message });
  }
}
