import { supabase } from './supabase.js';

const TABLE = 'ideas';

// ---------- Mapping JS <-> colonnes Postgres ----------
// `desc` et `when` sont des mots réservés en SQL : stockés sous `description`
// et `when_note`. `user_id` n'est jamais envoyé : la base rattache toujours
// l'idée au propriétaire du voyage, y compris quand un membre l'ajoute.
function toRow(idea) {
  const row = {
    city: idea.city,
    title: idea.title,
    kr: idea.kr || null,
    type: idea.type || null,
    verdict: idea.verdict || 'voir',
    note: idea.note || null,
    description: idea.desc || null,
    zone: idea.zone || null,
    avis: idea.avis || null,
    when_note: idea.when || null,
    lat: Number.isFinite(idea.lat) ? idea.lat : null,
    lng: Number.isFinite(idea.lng) ? idea.lng : null,
    origin: idea.origin || 'perso',
    favori: Boolean(idea.favori),
  };

  // `position` n'est envoyé que s'il est fourni : une modification ne doit pas
  // renvoyer l'idée en tête de liste, et à l'insertion la colonne a un défaut.
  if (Number.isFinite(idea.position)) row.position = idea.position;
  return row;
}

function fromRow(row) {
  const idea = {
    id: row.id,
    city: row.city,
    title: row.title,
    verdict: row.verdict || 'voir',
    origin: row.origin || 'perso',
  };
  if (row.kr) idea.kr = row.kr;
  if (row.type) idea.type = row.type;
  if (row.note) idea.note = row.note;
  if (row.description) idea.desc = row.description;
  if (row.zone) idea.zone = row.zone;
  if (row.avis) idea.avis = row.avis;
  if (row.when_note) idea.when = row.when_note;
  if (row.lat !== null && row.lat !== undefined) idea.lat = Number(row.lat);
  if (row.lng !== null && row.lng !== undefined) idea.lng = Number(row.lng);
  if (row.favori) idea.favori = true;
  return idea;
}

// ---------- API ----------

/** Les idées d'un voyage. Retourne { ideas, error }. */
export async function loadIdeas(tripId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('trip_id', tripId)
    .order('position', { ascending: true });

  return { ideas: (data || []).map(fromRow), error: error?.message || null };
}

/**
 * Crée ou met à jour une idée. Retourne { idea, error } — `idea` porte
 * l'identifiant attribué par la base à la création.
 */
export async function saveIdea(tripId, idea) {
  const row = toRow(idea);

  const { data, error } = idea.id
    ? await supabase.from(TABLE).update(row).eq('id', idea.id).select().single()
    : await supabase.from(TABLE).insert({ ...row, trip_id: tripId }).select().single();

  return { idea: data ? fromRow(data) : null, error: error?.message || null };
}

export async function removeIdea(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return error?.message || null;
}

/** Insertion en lot — utilisée par la génération de voyage. */
export async function insertIdeas(tripId, ideas) {
  if (!ideas.length) return { ideas: [], error: null };

  const rows = ideas.map((idea, i) => ({ ...toRow({ ...idea, position: i }), trip_id: tripId }));
  const { data, error } = await supabase.from(TABLE).insert(rows).select();
  return { ideas: (data || []).map(fromRow), error: error?.message || null };
}
