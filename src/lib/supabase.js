import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Client Supabase — null si les variables d'environnement ne sont pas
 * configurées. Il n'y a pas de repli local : dans ce cas `App` affiche l'écran
 * de configuration, sans compte ni carnet.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const hasSupabase = Boolean(supabase);
