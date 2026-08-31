import React, { useState } from 'react';

const STYLES = [
  'Culture & patrimoine', 'Nature & randonnée', 'Gastronomie', 'Cafés & douceurs',
  'Vie nocturne', 'Shopping', 'Plages & détente', 'Photo & panoramas',
  'Hors des sentiers battus', 'Avec des enfants',
];

const PACES = [
  ['tranquille', 'Tranquille', 'peu de lieux, du temps sur place'],
  ['equilibre', 'Équilibré', 'un ou deux temps forts par jour'],
  ['intense', 'Intense', 'on remplit les journées'],
];

const EMPTY = {
  destination: '', startDate: '', endDate: '',
  cities: '', styles: [], pace: 'equilibre', notes: '',
};

/** Nombre de nuits entre deux dates, ou null si l'une manque / l'ordre est faux. */
function nights(start, end) {
  if (!start || !end) return null;
  const d = (new Date(end) - new Date(start)) / 86400000;
  return d > 0 ? Math.round(d) : null;
}

export default function NewTripWizard({ onCancel, onCreate, busy, error }) {
  const [a, setA] = useState(EMPTY);
  const [step, setStep] = useState(0);

  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const toggleStyle = (s) =>
    setA({ ...a, styles: a.styles.includes(s) ? a.styles.filter((x) => x !== s) : [...a.styles, s] });

  const n = nights(a.startDate, a.endDate);
  const datesInvalid = a.startDate && a.endDate && n === null;

  const steps = [
    {
      title: 'Vous allez où ?',
      hint: 'Un pays, une région ou une ville — comme vous le diriez à quelqu’un.',
      ok: a.destination.trim().length > 1,
      body: (
        <div>
          <label>Destination *</label>
          <input value={a.destination} onChange={set('destination')}
            placeholder="Corée du Sud, Sicile, Nord du Portugal…" autoFocus />
        </div>
      ),
    },
    {
      title: 'Quand ?',
      hint: 'Facultatif, mais ça aide à proposer la bonne saison et le bon rythme.',
      ok: !datesInvalid,
      body: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div><label>Départ</label><input type="date" value={a.startDate} onChange={set('startDate')} /></div>
            <div><label>Retour</label><input type="date" value={a.endDate} onChange={set('endDate')} /></div>
          </div>
          {n !== null && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--jade)' }}>{n} nuit{n > 1 ? 's' : ''}</p>
          )}
          {datesInvalid && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--vermillion)' }}>
              Le retour doit être après le départ.
            </p>
          )}
        </>
      ),
    },
    {
      title: 'Quelles étapes ?',
      hint: 'Séparez par des virgules. Laissez vide et elles seront proposées pour vous.',
      ok: true,
      body: (
        <div>
          <label>Villes ou étapes</label>
          <input value={a.cities} onChange={set('cities')} placeholder="Séoul, Busan, Jeju" />
        </div>
      ),
    },
    {
      title: 'Vous aimez quoi ?',
      hint: 'Autant que vous voulez — c’est ce qui oriente les suggestions.',
      ok: true,
      body: (
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => {
            const on = a.styles.includes(s);
            return (
              <button key={s} type="button" onClick={() => toggleStyle(s)}
                className="px-3 py-1.5 rounded-full text-[12px]"
                style={{
                  background: on ? 'var(--jade)' : 'transparent',
                  color: on ? 'var(--paper)' : 'var(--ink)',
                  border: `1px solid ${on ? 'var(--jade)' : 'var(--line)'}`,
                  fontWeight: on ? 600 : 400,
                }}>
                {s}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: 'À quel rythme ?',
      hint: 'Et tout ce qui compte : avec qui, budget, contraintes, envies précises.',
      ok: true,
      body: (
        <>
          <div className="space-y-2 mb-4">
            {PACES.map(([id, label, sub]) => (
              <button key={id} type="button" onClick={() => setA({ ...a, pace: id })}
                className="w-full text-left px-3.5 py-2.5 rounded"
                style={{
                  background: a.pace === id ? 'rgba(74,107,92,.10)' : 'transparent',
                  border: `1px solid ${a.pace === id ? 'var(--jade)' : 'var(--line)'}`,
                }}>
                <div className="text-sm" style={{ fontWeight: 600 }}>{label}</div>
                <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{sub}</div>
              </button>
            ))}
          </div>
          <label>Autre chose ?</label>
          <textarea rows={3} value={a.notes} onChange={set('notes')}
            placeholder="En couple, on marche beaucoup, pas de musées à rallonge…" />
        </>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-trip-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(27,34,48,.45)' }}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto sans"
        style={{ background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--line)' }}>

        <div className="sticky top-0 px-5 py-4 border-b backdrop-blur-md"
          style={{ borderColor: 'var(--line)', background: 'rgba(242,237,227,.95)' }}>
          <div className="text-[10px] tracking-[.25em] uppercase mb-1"
            style={{ color: 'var(--vermillion)', fontWeight: 600 }}>
            Nouveau voyage · {step + 1}/{steps.length}
          </div>
          <h3 id="new-trip-title" className="disp text-xl" style={{ fontWeight: 600 }}>{current.title}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>{current.hint}</p>
        </div>

        <div className="p-5">{current.body}</div>

        {error && (
          <div className="mx-5 mb-4 p-3 rounded text-xs leading-relaxed"
            style={{ background: 'rgba(181,72,61,.07)', borderLeft: '2px solid var(--vermillion)', color: 'var(--ink-soft)' }}>
            {error}
          </div>
        )}

        {busy && (
          <div className="mx-5 mb-4 p-3 rounded text-xs leading-relaxed"
            style={{ background: 'rgba(71,89,126,.08)', borderLeft: '2px solid var(--indigo)', color: 'var(--ink-soft)' }}>
            Le carnet se prépare — étapes et premières idées de visite. Comptez une minute.
          </div>
        )}

        <div className="sticky bottom-0 px-5 py-4 border-t flex gap-2.5 backdrop-blur-md"
          style={{ borderColor: 'var(--line)', background: 'rgba(242,237,227,.95)' }}>
          <button onClick={step === 0 ? onCancel : () => setStep(step - 1)} disabled={busy}
            className="px-4 py-2.5 rounded text-sm"
            style={{ border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 600 }}>
            {step === 0 ? 'Annuler' : 'Retour'}
          </button>
          <button
            onClick={() => (last ? onCreate({ ...a, nights: n }) : setStep(step + 1))}
            disabled={!current.ok || busy}
            className="flex-1 py-2.5 rounded text-sm"
            style={{
              background: current.ok && !busy ? 'var(--ink)' : 'var(--line)',
              color: 'var(--paper)', fontWeight: 600,
              cursor: current.ok && !busy ? 'pointer' : 'not-allowed',
            }}>
            {busy ? 'Préparation…' : last ? 'Créer le carnet' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
