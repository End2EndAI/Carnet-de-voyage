// Fonction serverless Vercel — génère les champs d'une idée (description, type,
// quartier, etc.) via un modèle OpenAI, à partir du nom du lieu déjà saisi et
// du voyage auquel il appartient (destination et étape).
//
// Nécessite la variable d'environnement OPENAI_API_KEY côté Vercel
// (Project Settings > Environment Variables). Volontairement SANS préfixe
// VITE_ : une variable VITE_* est embarquée dans le bundle JS envoyé au
// navigateur, ce qui exposerait la clé à n'importe qui. Ici, seul ce code
// serveur y a accès.
//
// Déroulé en deux appels :
//  1. Recherche web libre (outil `web_search`) pour vérifier ce qui existe
//     vraiment sur ce lieu — pas de format contraint ici, la compatibilité
//     entre `web_search` et un JSON schema strict n'étant pas garantie.
//  2. Mise en forme du résultat (avec ou sans notes de recherche, si l'étape 1
//     a échoué ou n'a rien trouvé) dans le JSON schema attendu par le formulaire.

import OpenAI from 'openai';
import { requireUser, text } from './auth.js';

const MODEL = 'gpt-5.6-luna';

const FIELDS_SCHEMA = {
  type: 'object',
  properties: {
    kr: {
      type: 'string',
      description:
        "Nom du lieu dans la langue locale, suivi d'un court sous-titre séparé par ' · ', " +
        "ex: '경복궁 · Palais royal' ou 'Duomo di Catania · Cathédrale'. Chaîne vide si inconnu ou " +
        'si la langue locale utilise le même nom.',
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
      description:
        'Quartier ou zone où se trouve le lieu. Reprends tel quel le quartier fourni ' +
        "(venant de Google Maps) s'il existe ; sinon déduis-le du nom du lieu ou des coordonnées.",
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

// Étape 1 — recherche web libre. Best-effort : si l'outil n'est pas dispo pour ce
// compte/modèle, ou si la recherche échoue, on continue sans plutôt que de tout faire échouer.
async function researchPlace(client, place) {
  try {
    const response = await client.responses.create({
      model: MODEL,
      tools: [{ type: 'web_search' }],
      input: [
        {
          role: 'system',
          content:
            "Tu recherches des informations fiables sur un lieu, en vue d'aider à pré-remplir " +
            'la fiche d’un carnet de voyage personnel. La destination et l’étape indiquées ' +
            'situent le lieu : ne cherche pas un homonyme ailleurs dans le monde. Le quartier ' +
            'fourni vient de Google Maps et est fiable : utilise-le pour situer le lieu sans le ' +
            'remettre en question. Utilise la recherche web pour vérifier le nom exact dans la ' +
            'langue locale, le type de lieu, ce que les visiteurs en disent en général, et le ' +
            'meilleur moment pour le visiter. Réponds en français, en quelques phrases ' +
            "factuelles. Si tu ne trouves rien de fiable ou d'assez précis sur ce lieu précis, " +
            "dis-le clairement plutôt que d'inventer des détails.",
        },
        { role: 'user', content: describe(place, 'Lieu à rechercher') },
      ],
    });
    return response.output_text || null;
  } catch (err) {
    console.error('web_search indisponible pour cette génération, on continue sans :', err?.message);
    return null;
  }
}

/** Le contexte du lieu, mis en forme pour le modèle. */
function describe(place, label) {
  return [
    `${label} : ${place.title}`,
    `Destination du voyage : ${place.destination || 'non précisée'}`,
    `Étape du voyage : ${place.city || 'non précisée'}`,
    `Quartier (Google Maps) : ${place.zone || 'inconnu'}`,
    `Latitude : ${place.hasCoords ? place.lat : 'inconnue'}`,
    `Longitude : ${place.hasCoords ? place.lng : 'inconnue'}`,
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  if (!await requireUser(req, res)) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Clé OpenAI absente côté serveur. Ajoutez OPENAI_API_KEY dans les variables d'environnement Vercel.",
    });
    return;
  }

  const body = req.body || {};
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const place = {
    title: text(body.title, 160),
    zone: text(body.zone, 240),
    destination: text(body.destination, 120),
    city: text(body.city, 120),
    lat,
    lng,
    hasCoords: Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
  };

  if (!place.title) {
    res.status(400).json({ error: "Le nom du lieu est requis pour générer une fiche." });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });

    const research = await researchPlace(client, place);

    const response = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: 'system',
          content:
            "Tu aides à pré-remplir une fiche d'un carnet de voyage personnel. La destination " +
            "et l'étape indiquées situent le lieu : traite-le comme étant là-bas, jamais comme " +
            'un homonyme ailleurs. Le quartier, quand il est fourni, vient de Google Maps et ' +
            "est fiable : ne le remets pas en question, sers-t'en pour situer le lieu et " +
            "enrichir les autres champs (type, descriptif, avis). Des notes de recherche web " +
            "peuvent aussi t'être fournies : si elles sont présentes et pertinentes, base-toi " +
            'dessus en priorité. Si tout ça est absent ou peu concluant, déduis ce que tu peux ' +
            "du nom du lieu et de sa latitude/longitude, sinon reste général plutôt que " +
            "d'inventer. Réponds uniquement en français, de façon factuelle, concise et sobre. " +
            'Le champ "avis" doit rester un brouillon neutre à corriger par l\'utilisateur, ' +
            'jamais formulé comme une expérience vécue.',
        },
        {
          role: 'user',
          content: [
            describe(place, 'Lieu'),
            '',
            research
              ? `Notes de recherche web :\n${research}`
              : "(Aucune recherche web exploitable — reste général plutôt que d'inventer.)",
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
    res.status(200).json({ fields, researched: Boolean(research) });
  } catch (err) {
    console.error('generate-idea failed:', err?.message);
    res.status(502).json({ error: 'La génération est temporairement indisponible.' });
  }
}
