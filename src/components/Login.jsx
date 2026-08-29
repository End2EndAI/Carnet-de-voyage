import React, { useState } from 'react';
import { sendMagicLink } from '../lib/auth.js';
import { SEED } from '../data.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || state === 'sending') return;
    setState('sending');
    setError(null);
    const err = await sendMagicLink(email);
    if (err) {
      setError(err);
      setState('idle');
    } else {
      setState('sent');
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6 sans grain"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px w-8" style={{ background: 'var(--vermillion)' }} />
          <div
            className="text-[10px] tracking-[.35em] uppercase"
            style={{ color: 'var(--vermillion)', fontWeight: 600 }}
          >
            Carnet éditable
          </div>
        </div>

        <h1
          className="disp text-[2.1rem] leading-none mb-1"
          style={{ fontWeight: 350, fontStyle: 'italic' }}
        >
          Corée du Sud
        </h1>
        <div className="kr text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
          대한민국 · {SEED.trip.dates}
        </div>

        {state === 'sent' ? (
          <div
            className="p-4 rounded-lg fade"
            style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
          >
            <div className="disp text-lg mb-1.5" style={{ fontWeight: 600 }}>
              Lien envoyé
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Ouvrez le message envoyé à{' '}
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{email}</span> et cliquez
              sur le lien. Il expire au bout d'une heure et ne sert qu'une fois.
            </p>
            <p className="text-[11px] mt-3" style={{ color: 'var(--ink-soft)' }}>
              Rien reçu ? Pensez au dossier indésirables.
            </p>
            <button
              onClick={() => {
                setState('idle');
                setError(null);
              }}
              className="mt-3 text-[10px] tracking-[.2em] uppercase underline"
              style={{ color: 'var(--ink-soft)' }}
            >
              Changer d'adresse
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>Votre adresse email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
              autoFocus
            />

            {error && (
              <div
                className="mt-3 p-3 rounded text-xs leading-relaxed"
                style={{
                  background: 'rgba(181,72,61,.07)',
                  borderLeft: '2px solid var(--vermillion)',
                  color: 'var(--ink-soft)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!valid || state === 'sending'}
              className="w-full mt-4 py-2.5 rounded text-sm"
              style={{
                background: valid ? 'var(--ink)' : 'var(--line)',
                color: 'var(--paper)',
                fontWeight: 600,
                cursor: valid && state !== 'sending' ? 'pointer' : 'not-allowed',
              }}
            >
              {state === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion'}
            </button>

            <p className="text-[10px] leading-relaxed mt-3" style={{ color: 'var(--ink-soft)' }}>
              Pas de mot de passe : vous recevez un lien à usage unique.
              Le carnet est réservé aux adresses autorisées.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
