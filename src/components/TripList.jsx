import React from 'react';
import { formatDates } from '../lib/trips.js';
import { signOut } from '../lib/auth.js';

export default function TripList({ trips, email, loading, error, onOpen, onNew, onDelete }) {
  return (
    <div className="min-h-screen w-full" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div className="max-w-2xl mx-auto grain sans">
        <header className="px-6 pt-10 pb-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-8" style={{ background: 'var(--vermillion)' }} />
            <div className="text-[10px] tracking-[.35em] uppercase"
              style={{ color: 'var(--vermillion)', fontWeight: 600 }}>
              Carnets de voyage
            </div>
          </div>
          <h1 className="disp text-[2.1rem] leading-none" style={{ fontWeight: 350, fontStyle: 'italic' }}>
            Mes voyages
          </h1>
          <div className="text-xs mt-2" style={{ color: 'var(--ink-soft)' }}>
            {loading ? 'chargement…' : `${trips.length} carnet${trips.length > 1 ? 's' : ''}`}
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded text-xs leading-relaxed"
            style={{ background: 'rgba(181,72,61,.07)', borderLeft: '2px solid var(--vermillion)', color: 'var(--ink-soft)' }}>
            {error}
          </div>
        )}

        <div className="px-6 pt-6 pb-10">
          <button onClick={onNew}
            className="w-full py-3 rounded text-sm mb-6"
            style={{ background: 'var(--vermillion)', color: 'var(--paper)', fontWeight: 600 }}>
            + Nouveau voyage
          </button>

          {!loading && trips.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center" style={{ borderColor: 'var(--line)' }}>
              <div className="disp text-lg italic mb-1" style={{ color: 'var(--ink-soft)' }}>Aucun carnet</div>
              <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                Créez votre premier voyage : quelques questions, et le carnet se pré-remplit.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((t) => (
                <article key={t.id} className="rounded-lg overflow-hidden flex items-stretch"
                  style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
                  <button onClick={() => onOpen(t)} className="flex-1 min-w-0 text-left px-4 py-4">
                    <h2 className="disp text-[1.3rem] leading-tight" style={{ fontWeight: 600 }}>{t.title}</h2>
                    {t.native_name && (
                      <div className="kr text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{t.native_name}</div>
                    )}
                    <div className="text-[10px] tracking-[.16em] uppercase mt-2" style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>
                      {formatDates(t)}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>
                      {(t.cities || []).map((c) => c.label).join(' · ') || 'aucune étape'}
                    </div>
                  </button>
                  <button onClick={() => onDelete(t)} aria-label={`Supprimer ${t.title}`}
                    className="px-3.5 flex items-center"
                    style={{ borderLeft: '1px solid var(--line)', color: 'var(--ink-soft)', fontSize: 16 }}>
                    ✕
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="px-6 py-6 border-t text-center text-[10px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
          {email}
          <button onClick={signOut} className="ml-2 underline tracking-[.2em] uppercase">Se déconnecter</button>
        </footer>
      </div>
    </div>
  );
}
