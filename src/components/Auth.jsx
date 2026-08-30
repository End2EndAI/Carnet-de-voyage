import React, { useState } from 'react';
import { signUp, signIn, resetPassword, updatePassword } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Auth({ reset = false, onResetDone }) {
  const [mode, setMode] = useState(reset ? 'reset' : 'signin'); // signin | signup | forgot | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const emailOk = EMAIL_RE.test(email.trim());
  const valid = mode === 'forgot' ? emailOk
    : mode === 'reset' ? password.length >= 6 && password === confirmation
      : emailOk && password.length >= 6;

  const switchTo = (next) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'reset') {
      const err = await updatePassword(password);
      if (err) setError(err);
      else onResetDone();
    } else if (mode === 'signup') {
      const { error: err, needsConfirmation } = await signUp(email, password);
      if (err) setError(err);
      // Sans confirmation par email, la session arrive toute seule et
      // onAuthChange bascule l'application : rien à faire de plus ici.
      else if (needsConfirmation) {
        setNotice(`Compte créé. Ouvrez le lien de confirmation envoyé à ${email.trim()} pour vous connecter.`);
      }
    } else if (mode === 'signin') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await resetPassword(email);
      if (err) setError(err);
      else setNotice(`Si un compte existe pour ${email.trim()}, un lien de réinitialisation vient d'y être envoyé.`);
    }

    setBusy(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 sans grain"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px w-8" style={{ background: 'var(--vermillion)' }} />
          <div className="text-[10px] tracking-[.35em] uppercase"
            style={{ color: 'var(--vermillion)', fontWeight: 600 }}>
            Carnets de voyage
          </div>
        </div>

        <h1 className="disp text-[2.1rem] leading-none mb-2" style={{ fontWeight: 350, fontStyle: 'italic' }}>
          {mode === 'reset' ? 'Nouveau mot de passe' : 'Votre carnet'}
        </h1>
        <p className="text-sm mb-7 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          {mode === 'reset'
            ? 'Choisissez le nouveau mot de passe de votre compte.'
            : <>Préparez chaque voyage : vos étapes, vos idées de visite, vos verdicts,
              sur une carte. Un compte, vos carnets, rien que les vôtres.</>}
        </p>

        {mode !== 'reset' && <div className="flex gap-2 mb-5">
          {[['signin', 'Se connecter'], ['signup', 'Créer un compte']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => switchTo(id)}
              className="px-3.5 py-1.5 rounded-full text-[11px] uppercase tracking-wide"
              style={{
                background: mode === id ? 'var(--ink)' : 'transparent',
                color: mode === id ? 'var(--paper)' : 'var(--ink-soft)',
                border: `1px solid ${mode === id ? 'var(--ink)' : 'var(--line)'}`,
                fontWeight: 600,
              }}>
              {label}
            </button>
          ))}
        </div>}

        <form onSubmit={submit}>
          {mode !== 'reset' && <>
            <label>Adresse email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com" autoComplete="email" autoFocus />
          </>}

          {mode !== 'forgot' && (
            <div className="mt-3">
              <label htmlFor="auth-password">Mot de passe</label>
              <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="6 caractères minimum"
                autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'}
                autoFocus={mode === 'reset'} />
            </div>
          )}

          {mode === 'reset' && (
            <div className="mt-3">
              <label htmlFor="auth-password-confirmation">Confirmer le mot de passe</label>
              <input id="auth-password-confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                placeholder="Retapez le mot de passe" autoComplete="new-password" />
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 rounded text-xs leading-relaxed"
              style={{ background: 'rgba(181,72,61,.07)', borderLeft: '2px solid var(--vermillion)', color: 'var(--ink-soft)' }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-3 p-3 rounded text-xs leading-relaxed"
              style={{ background: 'rgba(74,107,92,.09)', borderLeft: '2px solid var(--jade)', color: 'var(--ink-soft)' }}>
              {notice}
            </div>
          )}

          <button type="submit" disabled={!valid || busy}
            className="w-full mt-4 py-2.5 rounded text-sm"
            style={{
              background: valid ? 'var(--ink)' : 'var(--line)', color: 'var(--paper)',
              fontWeight: 600, cursor: valid && !busy ? 'pointer' : 'not-allowed',
            }}>
            {busy ? '…' : mode === 'reset' ? 'Changer mon mot de passe'
              : mode === 'signup' ? 'Créer mon compte'
                : mode === 'signin' ? 'Entrer' : 'Envoyer le lien'}
          </button>
        </form>

        {mode !== 'reset' && <div className="mt-4 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          {mode === 'forgot' ? (
            <button onClick={() => switchTo('signin')} className="underline">Retour à la connexion</button>
          ) : mode === 'signin' ? (
            <button onClick={() => switchTo('forgot')} className="underline">Mot de passe oublié ?</button>
          ) : (
            <span>En créant un compte, vos carnets ne sont visibles que par vous.</span>
          )}
        </div>}
      </div>
    </div>
  );
}
