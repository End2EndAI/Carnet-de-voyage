import { createClient } from '@supabase/supabase-js';

let client;

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ||= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

/** Verifies the Supabase session before a route can spend OpenAI quota. */
export async function requireUser(req, res) {
  const token = req.headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = getClient();
  if (!token || !supabase) {
    res.status(token ? 500 : 401).json({ error: token ? 'Service d’authentification indisponible.' : 'Authentification requise.' });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Authentification requise.' });
    return null;
  }
  return data.user;
}

export const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
