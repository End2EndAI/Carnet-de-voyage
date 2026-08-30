import { supabase, hasSupabase } from './supabase.js';

const NOT_CONFIGURED = "Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).";

// Supabase répond en anglais ; on traduit les cas courants et on laisse
// passer le reste tel quel plutôt que d'avaler un message inconnu.
function translate(message) {
  if (/invalid login credentials/i.test(message)) return 'Adresse ou mot de passe incorrect.';
  if (/user already registered|already been registered/i.test(message)) {
    return 'Un compte existe déjà avec cette adresse. Connectez-vous.';
  }
  if (/password should be at least/i.test(message)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/email address.*invalid|unable to validate email/i.test(message)) return 'Adresse email invalide.';
  if (/email not confirmed/i.test(message)) return 'Compte non confirmé : ouvrez le lien reçu par email.';
  if (/rate limit|too many|for security purposes/i.test(message)) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }
  if (/signups not allowed/i.test(message)) return 'Les inscriptions sont désactivées sur ce projet Supabase.';
  return message;
}

/**
 * Crée un compte. Retourne { error, needsConfirmation }.
 * `needsConfirmation` : Supabase a créé le compte mais pas de session, parce
 * que la confirmation par email est activée sur le projet. Le cas est géré
 * dans l'UI plutôt que forcé côté client — c'est un réglage du projet.
 */
export async function signUp(email, password) {
  if (!hasSupabase) return { error: NOT_CONFIGURED, needsConfirmation: false };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });

  if (error) return { error: translate(error.message), needsConfirmation: false };
  return { error: null, needsConfirmation: !data.session };
}

export async function signIn(email, password) {
  if (!hasSupabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return error ? translate(error.message) : null;
}

export async function resetPassword(email) {
  if (!hasSupabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  return error ? translate(error.message) : null;
}

export async function getSession() {
  if (!hasSupabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(callback) {
  if (!hasSupabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  if (!hasSupabase) return;
  await supabase.auth.signOut();
}

/** Nettoie le fragment `#access_token=…` laissé par un lien de confirmation. */
export function cleanAuthHash() {
  if (window.location.hash.includes('access_token')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}
