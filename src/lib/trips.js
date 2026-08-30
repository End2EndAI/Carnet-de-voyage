import { supabase } from './supabase.js';

const TABLE = 'trips';

// Un identifiant de ville stable, dérivé du nom : sert de clé entre le tableau
// `cities` du voyage et la colonne `city` des idées.
export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'etape';

/** Rend les identifiants de villes uniques au sein d'un même voyage. */
export function normalizeCities(cities) {
  const seen = new Set();
  return (cities || [])
    .filter((c) => c && String(c.label || '').trim())
    .map((c) => {
      let id = slugify(c.label);
      while (seen.has(id)) id += '-2';
      seen.add(id);
      return {
        id,
        label: String(c.label).trim(),
        native: c.native ? String(c.native).trim() : '',
        note: c.note ? String(c.note).trim() : '',
      };
    });
}

/** Les voyages du compte connecté, du plus récent au plus ancien. */
export async function listTrips() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  return { trips: data || [], error: error?.message || null };
}

/**
 * Crée un voyage. `user_id` n'est pas envoyé : la colonne a auth.uid() pour
 * valeur par défaut et la politique RLS refuserait toute autre valeur.
 */
export async function createTrip({ title, nativeName, startDate, endDate, cities, answers }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      title: title.trim(),
      native_name: nativeName || null,
      start_date: startDate || null,
      end_date: endDate || null,
      cities: normalizeCities(cities),
      answers: answers || {},
    })
    .select()
    .single();
  return { trip: data, error: error?.message || null };
}

export async function updateTrip(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  return { trip: data, error: error?.message || null };
}

/** Supprime le voyage et, par cascade en base, toutes ses idées. */
export async function deleteTrip(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return error?.message || null;
}

/** Libellé de dates lisible, ex. « 24 sept 2026 → 10 oct 2026 ». */
export function formatDates(trip) {
  const fmt = (d) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  if (trip.start_date && trip.end_date) return `${fmt(trip.start_date)} → ${fmt(trip.end_date)}`;
  if (trip.start_date) return `à partir du ${fmt(trip.start_date)}`;
  return 'dates à définir';
}
