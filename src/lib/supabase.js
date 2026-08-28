import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Client Supabase — null si les variables d'environnement ne sont pas
 * configurées. Dans ce cas l'application bascule automatiquement sur
 * localStorage (voir src/lib/store.js).
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const hasSupabase = Boolean(supabase);
