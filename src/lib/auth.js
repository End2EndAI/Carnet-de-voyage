import { supabase, hasSupabase } from './supabase.js';

/**
 * Envoie un lien de connexion à usage unique.
 * `shouldCreateUser: false` : aucun compte n'est créé à la volée, donc une
 * adresse hors liste ne reçoit rien. La liste fait autorité côté base
 * (table `allowed_emails` + politiques RLS) ; ceci n'est qu'un premier filtre.
 */
export async function sendMagicLink(email) {
  if (!hasSupabase) return 'Supabase n’est pas configuré.';

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });

  if (!error) return null;

  // Supabase renvoie un message générique pour ne pas révéler quelles
  // adresses existent ; on le traduit sans en dire plus.
  if (/signups not allowed|user not found|not authorized/i.test(error.message)) {
    return 'Cette adresse n’a pas accès au carnet.';
  }
  if (/rate limit|too many/i.test(error.message)) {
    return 'Trop de demandes. Réessayez dans une heure.';
  }
  return error.message;
}

export async function getSession() {
  if (!hasSupabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(callback) {
  if (!hasSupabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  if (!hasSupabase) return;
  await supabase.auth.signOut();
  // Le cache local ne doit pas survivre à la déconnexion sur un appareil partagé.
  try {
    localStorage.removeItem('coree-carnet-cache-v2');
    localStorage.removeItem('coree-carnet-v1');
  } catch {
    /* ignoré */
  }
}

/** Nettoie le fragment `#access_token=…` laissé par le lien de connexion. */
export function cleanAuthHash() {
  if (window.location.hash.includes('access_token')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}
