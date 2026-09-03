import React, { useEffect, useState } from 'react';
import LegalLinks from './LegalLinks.jsx';
import { changeShare, formatDates, listShares, removeShare, shareTrip } from '../lib/trips.js';
import { signOut } from '../lib/auth.js';

export default function TripList({ trips, email, loading, error, onOpen, onNew, onDelete, onDeleteAccount }) {
  const [sharing, setSharing] = useState(null);

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
                    {t.access !== 'owner' && (
                      <div className="text-[9px] tracking-[.14em] uppercase mt-2" style={{ color: 'var(--indigo)', fontWeight: 700 }}>
                        Partagé · {t.access === 'write' ? 'écriture' : 'lecture seule'}
                      </div>
                    )}
                  </button>
                  {t.access === 'owner' && (
                    <div className="flex flex-col" style={{ borderLeft: '1px solid var(--line)' }}>
                      <button onClick={() => setSharing(t)} className="flex-1 px-3 text-[10px] uppercase tracking-wide"
                        style={{ color: 'var(--indigo)', fontWeight: 600 }}>
                        Partager
                      </button>
                      <button onClick={() => onDelete(t)} aria-label={`Supprimer ${t.title}`}
                        className="px-3 py-2.5 flex items-center justify-center"
                        style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-soft)', fontSize: 14 }}>
                        ✕
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="px-6 py-6 border-t text-center text-[10px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
          <div>{email}</div>
          <div className="mt-2 flex justify-center gap-3">
            <button onClick={signOut} className="underline tracking-[.2em] uppercase">Se déconnecter</button>
            <button onClick={onDeleteAccount} className="underline tracking-[.12em] uppercase" style={{ color: 'var(--vermillion)' }}>Supprimer mon compte</button>
          </div>
          <LegalLinks className="mt-2" />
        </footer>
      </div>
      {sharing && <ShareTrip trip={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

function ShareTrip({ trip, onClose }) {
  const [shares, setShares] = useState([]);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = async () => {
    const result = await listShares(trip.id);
    setShares(result.shares);
    setError(result.error);
  };

  useEffect(() => { refresh(); }, [trip.id]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const err = await shareTrip(trip.id, email, access);
    setError(err);
    if (!err) { setEmail(''); await refresh(); }
    setBusy(false);
  };

  const change = async (member, nextAccess) => {
    const err = await changeShare(trip.id, member.user_id, nextAccess);
    setError(err);
    if (!err) setShares((current) => current.map((item) => (
      item.user_id === member.user_id ? { ...item, access: nextAccess } : item
    )));
  };

  const remove = async (member) => {
    const err = await removeShare(trip.id, member.user_id);
    setError(err);
    if (!err) setShares((current) => current.filter((item) => item.user_id !== member.user_id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 android-modal" style={{ background: 'rgba(27,34,48,.45)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sans"
        style={{ background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--line)' }}>
        <h3 id="share-title" className="disp text-xl" style={{ fontWeight: 600 }}>Partager « {trip.title} »</h3>
        <p className="text-xs mt-1 mb-5" style={{ color: 'var(--ink-soft)' }}>
          Votre ami doit déjà avoir créé son compte avec cette adresse.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div><label>Adresse email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label>Accès</label><select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option value="read">Lecture</option>
            <option value="write">Écriture</option>
          </select></div>
          <button disabled={busy} className="w-full py-2.5 rounded text-sm"
            style={{ background: 'var(--ink)', color: 'var(--paper)', fontWeight: 600, opacity: busy ? .6 : 1 }}>
            {busy ? 'Partage…' : 'Partager'}
          </button>
        </form>

        {error && <p className="text-xs mt-3" style={{ color: 'var(--vermillion)' }}>{error}</p>}

        {shares.length > 0 && (
          <div className="mt-5 pt-4 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
            {shares.map((member) => (
              <div key={member.user_id} className="flex items-center gap-2">
                <span className="text-xs flex-1 min-w-0 truncate">{member.email}</span>
                <select value={member.access} onChange={(e) => change(member, e.target.value)}
                  aria-label={`Accès de ${member.email}`} style={{ width: 'auto', fontSize: 11, padding: '5px 7px' }}>
                  <option value="read">Lecture</option>
                  <option value="write">Écriture</option>
                </select>
                <button onClick={() => remove(member)} aria-label={`Retirer ${member.email}`}
                  style={{ color: 'var(--vermillion)' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-5 py-2.5 rounded text-sm"
          style={{ border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 600 }}>Fermer</button>
      </div>
    </div>
  );
}
