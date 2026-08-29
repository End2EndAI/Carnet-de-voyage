import { supabase, hasSupabase } from './supabase.js';
import { SEED } from '../data.js';

const TABLE = 'ideas';
const CACHE_KEY = 'coree-carnet-cache-v2';
const LEGACY_KEY = 'coree-carnet-v1';

// ---------- Mapping JS <-> colonnes Postgres ----------
// `desc` et `when` sont des mots réservés en SQL : on les stocke sous
// `description` et `when_note`.
function toRow(idea, position = 0) {
  return {
    id: idea.id,
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
    lat: typeof idea.lat === 'number' && !Number.isNaN(idea.lat) ? idea.lat : null,
    lng: typeof idea.lng === 'number' && !Number.isNaN(idea.lng) ? idea.lng : null,
    origin: idea.origin || 'carnet',
    favori: Boolean(idea.favori),
    position,
  };
}

function fromRow(row) {
  const idea = {
    id: row.id,
    city: row.city,
    title: row.title,
    verdict: row.verdict || 'voir',
    origin: row.origin || 'carnet',
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

// ---------- Cache local (mode hors-ligne / secours) ----------
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(ideas) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(ideas));
  } catch {
    /* quota plein ou navigation privée : on ignore */
  }
}

// ---------- API publique ----------

/**
 * Charge les idées. Retourne { ideas, source, error }.
 * source : 'supabase' | 'local' — permet à l'UI d'annoncer où sont les données.
 */
export async function loadIdeas() {
  if (!hasSupabase) {
    return { ideas: readCache() || SEED.ideas, source: 'local', error: null };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('position', { ascending: true });

  if (error) {
    return {
      ideas: readCache() || SEED.ideas,
      source: 'local',
      error: error.message,
    };
  }

  // Base vide au premier lancement : on y verse le carnet d'origine
  // (ou les modifications déjà faites en local, pour ne rien perdre).
  if (!data || data.length === 0) {
    const initial = readCache() || SEED.ideas;
    const seedError = await replaceAll(initial);
    return { ideas: initial, source: 'supabase', error: seedError };
  }

  const ideas = data.map(fromRow);
  writeCache(ideas);
  return { ideas, source: 'supabase', error: null };
}

/** Crée ou met à jour une idée. Retourne un message d'erreur, ou null. */
export async function saveIdea(idea, allIdeas) {
  writeCache(allIdeas);
  if (!hasSupabase) return null;

  const position = Math.max(0, allIdeas.findIndex((i) => i.id === idea.id));
  const { error } = await supabase.from(TABLE).upsert(toRow(idea, position));
  return error ? error.message : null;
}

/** Supprime une idée. Retourne un message d'erreur, ou null. */
export async function removeIdea(id, allIdeas) {
  writeCache(allIdeas);
  if (!hasSupabase) return null;

  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return error ? error.message : null;
}

/** Remplace tout le contenu de la table par la liste fournie. */
export async function replaceAll(ideas) {
  writeCache(ideas);
  if (!hasSupabase) return null;

  const { error: delError } = await supabase.from(TABLE).delete().neq('id', '');
  if (delError) return delError.message;

  const rows = ideas.map((idea, i) => toRow(idea, i));
  // Insertion par paquets : au-delà de ~500 lignes la requête devient lourde.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(TABLE).insert(rows.slice(i, i + 200));
    if (error) return error.message;
  }
  return null;
}

/** Réinitialise la base aux 66 idées du carnet d'origine. */
export function resetToSeed() {
  return replaceAll(SEED.ideas);
}
