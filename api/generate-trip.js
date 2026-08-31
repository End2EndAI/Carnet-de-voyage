// Fonction serverless Vercel — construit le squelette d'un carnet à partir des
// réponses du questionnaire de création : étapes du voyage et premières idées
// de visite.
//
// Nécessite OPENAI_API_KEY côté Vercel (Project Settings > Environment
// Variables). Volontairement SANS préfixe VITE_ : une variable VITE_* finit
// dans le bundle envoyé au navigateur.

import OpenAI from 'openai';
import { requireUser, text } from './auth.js';

const MODEL = 'gpt-5.6-luna';

// Vercel coupe la fonction à 60 s ; la génération d'une vingtaine de lieux en
// prend une bonne partie. Au-delà, le client crée le voyage sans idées.
export const maxDuration = 60;

const MAX_CITIES = 5;
const IDEAS_PER_CITY = 4;

const TRIP_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Nom propre de la destination, tel qu’il s’écrit en français. Ex : "Corée du Sud".',
    },
    native_name: {
      type: 'string',
      description: 'Nom de la destination dans sa langue locale, ex : "대한민국". Chaîne vide si sans objet.',
    },
    cities: {
      type: 'array',
      description: `Étapes du voyage, ${MAX_CITIES} au maximum, dans un ordre d’itinéraire cohérent.`,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Nom de la ville ou de l’étape en français.' },
          native: { type: 'string', description: 'Nom local de l’étape. Chaîne vide si sans objet.' },
          note: { type: 'string', description: 'Répartition suggérée, ex : "3 nuits" ou "Excursion à la journée".' },
        },
        required: ['label', 'native', 'note'],
        additionalProperties: false,
      },
    },
    ideas: {
      type: 'array',
      description: `Lieux à visiter : ${IDEAS_PER_CITY} par étape, des lieux réels et identifiables.`,
      items: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Le `label` exact de l’étape à laquelle ce lieu appartient.' },
          title: { type: 'string', description: 'Nom du lieu tel qu’on le chercherait sur une carte.' },
          kr: { type: 'string', description: 'Nom local suivi d’un court sous-titre séparé par " · ". Chaîne vide si inconnu.' },
          type: { type: 'string', description: 'Catégorie courte séparée par " · ", ex : "Café · Brunch".' },
          note: { type: 'string', description: 'Note pratique, une phrase maximum, ex : "À réserver le week-end".' },
          desc: { type: 'string', description: 'Descriptif factuel et neutre, 2 à 3 phrases, en français.' },
          zone: { type: 'string', description: 'Quartier ou zone du lieu.' },
          avis: { type: 'string', description: 'Brouillon d’avis en une phrase, formulé comme une suggestion à relire — jamais comme un vécu personnel.' },
          when: { type: 'string', description: 'Moment conseillé, ex : "Plutôt en fin de journée".' },
          lat: { type: 'number', description: 'Latitude approximative du lieu, en degrés décimaux.' },
          lng: { type: 'number', description: 'Longitude approximative du lieu, en degrés décimaux.' },
        },
        required: ['city', 'title', 'kr', 'type', 'note', 'desc', 'zone', 'avis', 'when', 'lat', 'lng'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'native_name', 'cities', 'ideas'],
  additionalProperties: false,
};

const PACE_LABEL = {
  tranquille: 'tranquille — peu de lieux, du temps sur place',
  equilibre: 'équilibré — un ou deux temps forts par jour',
  intense: 'intense — des journées bien remplies',
};

function buildPrompt(a) {
  const asked = a.cities
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_CITIES);

  const lines = [
    `Destination : ${a.destination}`,
    a.startDate && a.endDate ? `Dates : du ${a.startDate} au ${a.endDate}` : 'Dates : non précisées',
    a.nights ? `Durée : ${a.nights} nuits` : null,
    asked.length
      ? `Étapes imposées par le voyageur (reprends exactement celles-ci, ni plus ni moins) : ${asked.join(', ')}`
      : `Étapes : à proposer, ${MAX_CITIES} au maximum, cohérentes avec la durée et la géographie.`,
    a.styles?.length ? `Centres d'intérêt : ${a.styles.join(', ')}` : null,
    `Rythme souhaité : ${PACE_LABEL[a.pace] || a.pace || 'équilibré'}`,
    a.notes?.trim() ? `Précisions du voyageur : ${a.notes.trim()}` : null,
  ].filter(Boolean);

  return { text: lines.join('\n'), asked };
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

  const raw = req.body?.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    res.status(400).json({ error: 'Les réponses sont invalides.' });
    return;
  }
  const answers = {
    destination: text(raw.destination, 120),
    cities: text(raw.cities, 500),
    startDate: text(raw.startDate, 10),
    endDate: text(raw.endDate, 10),
    nights: Number.isInteger(raw.nights) && raw.nights > 0 && raw.nights <= 365 ? raw.nights : null,
    styles: Array.isArray(raw.styles) ? raw.styles.slice(0, 10).map((style) => text(style, 80)).filter(Boolean) : [],
    pace: text(raw.pace, 30),
    notes: text(raw.notes, 1500),
  };
  if (!answers.destination) {
    res.status(400).json({ error: 'La destination est requise.' });
    return;
  }

  const { text: prompt, asked } = buildPrompt(answers);

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: 'system',
          content:
            "Tu prépares le squelette d'un carnet de voyage personnel : les étapes, puis des " +
            `lieux à visiter (${IDEAS_PER_CITY} par étape). Ne propose que des lieux réels et ` +
            'identifiables, que le voyageur pourra retrouver sur une carte — pas de lieu inventé, ' +
            'pas de nom approximatif. Les coordonnées doivent être celles du vrai lieu ; en cas ' +
            'de doute, donne celles du quartier plutôt qu\'un chiffre au hasard. Réponds ' +
            'uniquement en français, de façon factuelle, concise et sobre. Le champ "avis" reste ' +
            "un brouillon neutre que le voyageur corrigera, jamais une expérience vécue.",
        },
        { role: 'user', content: `${prompt}\n\nPropose les étapes et les lieux.` },
      ],
      text: {
        format: { type: 'json_schema', name: 'carnet_voyage', schema: TRIP_SCHEMA, strict: true },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      res.status(502).json({ error: 'Réponse OpenAI inattendue (aucun contenu structuré).' });
      return;
    }

    const trip = JSON.parse(raw);

    // Les étapes demandées par le voyageur font foi : le modèle peut en
    // renommer ou en ajouter, on ne garde alors que ce qui a été demandé.
    if (asked.length) {
      const wanted = new Set(asked.map((c) => c.toLowerCase()));
      const kept = (trip.cities || []).filter((c) => wanted.has(String(c.label).toLowerCase()));
      const missing = asked.filter(
        (c) => !kept.some((k) => k.label.toLowerCase() === c.toLowerCase())
      );
      trip.cities = [...kept, ...missing.map((label) => ({ label, native: '', note: '' }))];
    }

    trip.cities = (trip.cities || []).slice(0, MAX_CITIES);
    res.status(200).json({ trip });
  } catch (err) {
    console.error('generate-trip failed:', err?.message);
    res.status(502).json({ error: 'La génération est temporairement indisponible.' });
  }
}
