import { createClient } from '@supabase/supabase-js';

const config = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const token = req.headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { url, anonKey, serviceRoleKey } = config();
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  if (!url || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: 'La suppression de compte n’est pas configurée.' });
  }

  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Authentification requise.' });

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error('delete-account failed:', deleteError.message);
    return res.status(502).json({ error: 'La suppression du compte est temporairement indisponible.' });
  }
  return res.status(200).json({ ok: true });
}
