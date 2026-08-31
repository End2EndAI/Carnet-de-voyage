import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { loadIdeas, saveIdea, removeIdea, insertIdeas } from './lib/store.js';
import { listTrips, createTrip, deleteTrip, formatDates, normalizeCities } from './lib/trips.js';
import { hasSupabase } from './lib/supabase.js';
import { hasMapsKey } from './lib/googleMaps.js';
import GoogleMapView from './components/GoogleMapView.jsx';
import PlaceSearch from './components/PlaceSearch.jsx';
import PlacePhoto from './components/PlacePhoto.jsx';
import Auth from './components/Auth.jsx';
import TripList from './components/TripList.jsx';
import NewTripWizard from './components/NewTripWizard.jsx';
import { deleteAccount as deleteAccountRequest, getSession, onAuthChange, signOut, cleanAuthHash, isPasswordRecovery } from './lib/auth.js';

const VERDICTS = {
  oui:    { bg: "rgba(74,107,92,.14)",   color: "var(--jade)",       label: "OUI" },
  option: { bg: "rgba(184,153,104,.18)", color: "var(--gold-deep)",  label: "OPTION" },
  voir:   { bg: "rgba(26,31,46,.08)",    color: "var(--ink-soft)",   label: "À VOIR" },
  non:    { bg: "rgba(181,72,61,.14)",   color: "var(--vermillion)", label: "NON" },
};

const gmaps = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

const LAST_TRIP_KEY = 'carnet-dernier-voyage';
const HISTORY_TRIP_KEY = 'carnetTripId';

function historyTrip(state = window.history.state) {
  return state && typeof state === 'object' ? state[HISTORY_TRIP_KEY] || null : null;
}

function historyState(patch) {
  return { ...(window.history.state || {}), ...patch };
}

function clearDeleteAccountQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete('delete-account');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

// ---------- Racine ----------
export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [recovering, setRecovering] = useState(isPasswordRecovery);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setChecking(false);
      cleanAuthHash();
    });
    return onAuthChange((s, event) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      cleanAuthHash();
    });
  }, []);

  if (!hasSupabase) return <NotConfigured />;
  if (checking) return <Splash>Chargement…</Splash>;
  if (!session) return <Auth />;
  if (recovering) return <Auth reset onResetDone={() => setRecovering(false)} />;

  return <Workspace key={session.user.id} session={session} />;
}

function Splash({ children }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center sans"
      style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
      <span className="text-xs tracking-[.2em] uppercase">{children}</span>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 sans"
      style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="max-w-sm">
        <h1 className="disp text-2xl mb-3" style={{ fontWeight: 600 }}>Configuration incomplète</h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>,
          puis relancez un déploiement. Sans elles, il n'y a ni comptes ni carnets.
        </p>
      </div>
    </div>
  );
}

// ---------- Espace de travail : liste des voyages + carnet ouvert ----------
function Workspace({ session }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(() => {
    try { return localStorage.getItem(LAST_TRIP_KEY); } catch { return null; }
  });
  const [wizard, setWizard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(
    () => new URLSearchParams(window.location.search).get('delete-account') === '1'
  );
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState(null);
  // Renseigné quand la génération IA a échoué : le carnet existe, mais vide.
  const [genWarning, setGenWarning] = useState(null);

  const refresh = useCallback(async () => {
    const { trips: list, error: err } = await listTrips(session.user.id);
    setTrips(list);
    setError(err);
    setLoading(false);
    return list;
  }, [session.user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!window.history.state) window.history.replaceState(historyState({ [HISTORY_TRIP_KEY]: null }), '');
    const saved = historyTrip() || openId;
    if (saved && !historyTrip()) window.history.pushState(historyState({ [HISTORY_TRIP_KEY]: saved }), '');

    const onPopState = (event) => {
      const tripId = historyTrip(event.state);
      setOpenId(tripId);
      setGenWarning(null);
      try {
        if (tripId) localStorage.setItem(LAST_TRIP_KEY, tripId);
        else localStorage.removeItem(LAST_TRIP_KEY);
      } catch { /* ignoré */ }
      refresh();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openId, refresh]);

  const open = (trip) => {
    if (historyTrip() !== trip.id) window.history.pushState(historyState({ [HISTORY_TRIP_KEY]: trip.id }), '');
    setOpenId(trip.id);
    try { localStorage.setItem(LAST_TRIP_KEY, trip.id); } catch { /* ignoré */ }
  };

  const back = () => {
    if (historyTrip()) {
      window.history.back();
      return;
    }
    setOpenId(null);
    setGenWarning(null);
    try { localStorage.removeItem(LAST_TRIP_KEY); } catch { /* ignoré */ }
    refresh();
  };

  // Questionnaire → génération IA → voyage + idées en base.
  // La génération est un bonus : si elle échoue, le carnet est quand même créé
  // avec les étapes saisies, et l'utilisateur remplit à la main.
  const create = async (answers) => {
    setCreating(true);
    setCreateError(null);

    let generated = null;
    let warning = null;
    try {
      const res = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Génération indisponible.');
      generated = data.trip;
    } catch (e) {
      warning = `Le carnet a été créé, mais les suggestions n'ont pas pu être générées (${e.message}). Ajoutez vos idées à la main.`;
    }

    const typed = answers.cities.split(',').map((s) => s.trim()).filter(Boolean);
    const cities = normalizeCities(
      generated?.cities?.length ? generated.cities
        : typed.length ? typed.map((label) => ({ label }))
        : [{ label: answers.destination.trim() }]
    );

    const { trip, error: tripError } = await createTrip({
      userId: session.user.id,
      title: generated?.title?.trim() || answers.destination.trim(),
      nativeName: generated?.native_name || null,
      startDate: answers.startDate,
      endDate: answers.endDate,
      cities,
      answers,
    });

    if (tripError) {
      setCreateError(tripError);
      setCreating(false);
      return;
    }

    // Rattachement des lieux à une étape : le modèle renvoie le libellé, on
    // retrouve l'identifiant. Un lieu non rattachable atterrit sur la 1re étape.
    if (generated?.ideas?.length) {
      const byLabel = new Map(cities.map((c) => [c.label.toLowerCase(), c.id]));
      const ideas = generated.ideas.map((i) => ({
        ...i,
        city: byLabel.get(String(i.city).toLowerCase()) || cities[0].id,
        origin: 'suggestion',
        verdict: 'voir',
        lat: Number.isFinite(i.lat) ? i.lat : undefined,
        lng: Number.isFinite(i.lng) ? i.lng : undefined,
      }));
      const { error: ideasError } = await insertIdeas(trip.id, ideas);
      if (ideasError) warning = `Carnet créé, mais les idées n'ont pas pu être enregistrées (${ideasError}).`;
    }

    setCreating(false);
    setWizard(false);
    setGenWarning(warning);
    setTrips((prev) => [trip, ...prev]);
    open(trip);
  };

  const removeTrip = async (trip) => {
    setConfirmDel(null);
    const err = await deleteTrip(trip.id);
    if (err) { setError(err); return; }
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));
    if (openId === trip.id) back();
  };

  const removeAccount = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    setAccountDeleteError(null);
    const err = await deleteAccountRequest();
    if (err) {
      setAccountDeleteError(err);
      setDeletingAccount(false);
    }
  };

  const openTrip = trips.find((t) => t.id === openId);

  if (openId && !openTrip && loading) return <Splash>Chargement…</Splash>;

  if (openTrip) {
    return (
      <Carnet
        key={openTrip.id}
        trip={openTrip}
        email={session.user.email}
        onDeleteAccount={() => { setAccountDeleteError(null); setConfirmAccountDelete(true); }}
        accessToken={session.access_token}
        warning={genWarning}
        onDismissWarning={() => setGenWarning(null)}
        onBack={back}
      />
    );
  }

  return (
    <>
      <TripList
        trips={trips}
        email={session.user.email}
        loading={loading}
        error={error}
        onOpen={open}
        onNew={() => { setCreateError(null); setWizard(true); }}
        onDelete={setConfirmDel}
        onDeleteAccount={() => { setAccountDeleteError(null); setConfirmAccountDelete(true); }}
      />
      {wizard && (
        <NewTripWizard
          busy={creating}
          error={createError}
          onCancel={() => !creating && setWizard(false)}
          onCreate={create}
        />
      )}
      {confirmDel && (
        <Confirm
          title="Supprimer ce voyage ?"
          message={<>« <strong>{confirmDel.title}</strong> » et toutes ses idées seront supprimés définitivement.</>}
          confirmLabel="Supprimer"
          onYes={() => removeTrip(confirmDel)}
          onNo={() => setConfirmDel(null)}
        />
      )}
      {confirmAccountDelete && (
        <Confirm
          title="Supprimer mon compte ?"
          message="Vos voyages, idées et partages seront supprimés définitivement. Cette action est irréversible."
          confirmLabel={deletingAccount ? 'Suppression…' : 'Supprimer mon compte'}
          error={accountDeleteError}
          busy={deletingAccount}
          onYes={removeAccount}
          onNo={() => {
            if (deletingAccount) return;
            clearDeleteAccountQuery();
            setConfirmAccountDelete(false);
          }}
        />
      )}
    </>
  );
}

// ---------- Carnet d'un voyage ----------
function Carnet({ trip, email, accessToken, onDeleteAccount, warning, onDismissWarning, onBack }) {
  const cities = trip.cities?.length ? trip.cities : [{ id: 'etape', label: trip.title, native: '', note: '' }];
  const canWrite = trip.access === 'owner' || trip.access === 'write';

  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("");
  const [city, setCity] = useState(cities[0].id);
  const [view, setView] = useState("liste");
  const [editing, setEditing] = useState(null);
  const [formSession, setFormSession] = useState(0); // force un remount propre de <Form> à chaque ouverture
  const [confirmDel, setConfirmDel] = useState(null);
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("tous");
  const [favOnly, setFavOnly] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const { ideas: loaded, error } = await loadIdeas(trip.id);
      setIdeas(loaded);
      if (error) setErrMsg(error);
      setLoading(false);
    })();
  }, [trip.id]);

  // Applique la modification en local, puis la propage à Supabase.
  const persist = async (next, action) => {
    const previous = ideas;
    setIdeas(next);
    setSaveState("saving");
    const error = await action();
    if (error) {
      setIdeas(previous);
      setErrMsg(error);
      setSaveState("error");
    } else {
      setErrMsg(null);
      setSaveState("saved");
      setTimeout(() => setSaveState(""), 1600);
    }
  };

  const cityIdeasAll = useMemo(() => {
    let list = ideas.filter(i => i.city === city);
    if (filter !== "tous") list = list.filter(i => i.verdict === filter);
    return list;
  }, [ideas, city, filter]);
  // Le bouton "Favoris" filtre toujours à l'intérieur de l'étape sélectionnée.
  const cityIdeas = useMemo(
    () => (favOnly ? cityIdeasAll.filter(i => i.favori) : cityIdeasAll),
    [cityIdeasAll, favOnly]
  );

  const mapPts = useMemo(
    () => cityIdeas.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng)),
    [cityIdeas]
  );

  // Où se trouve l'étape, d'après les lieux déjà placés : sert d'indice à la
  // recherche d'adresse. Calculé sur toute l'étape, pas sur `cityIdeas`, pour
  // qu'un filtre ou un favori n'aille pas déplacer le centre. Reste null tant
  // qu'aucun lieu n'a de coordonnées — la recherche est alors mondiale.
  const cityCenter = useMemo(() => {
    const placed = ideas.filter(i => i.city === city && Number.isFinite(i.lat) && Number.isFinite(i.lng));
    if (!placed.length) return null;
    return {
      lat: placed.reduce((sum, i) => sum + i.lat, 0) / placed.length,
      lng: placed.reduce((sum, i) => sum + i.lng, 0) / placed.length,
    };
  }, [ideas, city]);
  // En vue carte, une sélection filtre la liste sur ce seul lieu.
  const listIdeas = useMemo(
    () => (view === "carte" && sel ? cityIdeas.filter(i => i.id === sel) : cityIdeas),
    [cityIdeas, view, sel]
  );
  const countFor = (id) => ideas.filter(i => i.city === id).length;

  const save = async (data) => {
    setSaveState("saving");
    const { idea: saved, error } = await saveIdea(trip.id, {
      ...data,
      position: data.id ? undefined : ideas.length,
    });
    if (error || !saved) {
      setErrMsg(error || "Enregistrement impossible.");
      setSaveState("error");
      return false;
    }
    setIdeas(prev => prev.some(i => i.id === saved.id)
      ? prev.map(i => (i.id === saved.id ? saved : i))
      : [...prev, saved]);
    setErrMsg(null);
    setSaveState("saved");
    setTimeout(() => setSaveState(""), 1600);
    setEditing(null);
    return true;
  };

  const toggleFavori = (idea) => {
    const flipped = { ...idea, favori: !idea.favori };
    persist(ideas.map(i => (i.id === idea.id ? flipped : i)), async () => {
      const { error } = await saveIdea(trip.id, flipped);
      return error;
    });
  };

  // L'identifiant Google trouvé en cherchant la photo est conservé sur la
  // fiche : les ouvertures suivantes retrouvent l'image directement, sans
  // repasser par une recherche par nom.
  const rememberPlaceId = (idea, placeId) => {
    if (!canWrite || !placeId || idea.placeId === placeId) return;
    const next = { ...idea, placeId };
    setIdeas(prev => prev.map(i => (i.id === idea.id ? next : i)));
    // Écriture de confort : son échec ne vaut pas la peine d'alerter.
    saveIdea(trip.id, next);
  };

  const remove = (id) => {
    persist(ideas.filter(i => i.id !== id), () => removeIdea(id));
    setConfirmDel(null);
    if (sel === id) setSel(null);
  };

  const activeCity = cities.find(c => c.id === city) || cities[0];

  return (
    <div className="min-h-screen w-full" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="max-w-2xl mx-auto grain sans">

        {/* Header */}
        <header className="px-6 pt-8 pb-5 border-b" style={{ borderColor: "var(--line)" }}>
          <button onClick={onBack} className="text-[10px] tracking-[.2em] uppercase mb-4"
            style={{ color: "var(--ink-soft)" }}>
            ← Mes voyages
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="disp text-[2.1rem] leading-none" style={{ fontWeight: 350, fontStyle: "italic" }}>
                {trip.title}
              </h1>
              {trip.native_name && (
                <div className="kr text-sm mt-1" style={{ color: "var(--vermillion)", fontWeight: 500 }}>
                  {trip.native_name}
                </div>
              )}
              <div className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                {formatDates(trip)} · {ideas.length} idée{ideas.length > 1 ? "s" : ""}
              </div>
              {trip.access !== 'owner' && (
                <div className="text-[10px] tracking-[.14em] uppercase mt-1.5" style={{ color: "var(--indigo)", fontWeight: 600 }}>
                  Voyage partagé · {canWrite ? "écriture" : "lecture seule"}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              {loading && <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>chargement…</span>}
              {saveState === "saving" && <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>…</span>}
              {saveState === "saved" && <span className="text-[10px]" style={{ color: "var(--jade)" }}>✓ enregistré</span>}
              {saveState === "error" && <span className="text-[10px]" style={{ color: "var(--vermillion)" }}>échec sauvegarde</span>}
            </div>
          </div>
        </header>

        {warning && (
          <div className="mx-6 mt-4 p-3 rounded text-xs leading-relaxed flex items-start gap-3"
            style={{ background: "rgba(184,153,104,.12)", borderLeft: "2px solid var(--gold-deep)", color: "var(--ink-soft)" }}>
            <span className="flex-1">{warning}</span>
            <button onClick={onDismissWarning} style={{ color: "var(--ink-soft)" }} aria-label="Masquer">✕</button>
          </div>
        )}

        {errMsg && (
          <div className="mx-6 mt-4 p-3 rounded text-xs leading-relaxed"
            style={{ background: "rgba(181,72,61,.07)", borderLeft: "2px solid var(--vermillion)", color: "var(--ink-soft)" }}>
            <strong style={{ color: "var(--vermillion)" }}>Erreur.</strong> {errMsg}
          </div>
        )}

        {/* Étapes */}
        <div className="sticky top-0 z-20 backdrop-blur-md border-b" style={{ borderColor: "var(--line)", background: "rgba(242,237,227,.93)" }}>
          <div className="px-4 py-2.5 flex gap-2 overflow-x-auto noscroll">
            {cities.map(c => {
              const on = city === c.id, n = countFor(c.id);
              return (
                <button key={c.id} onClick={() => { setCity(c.id); setSel(null); }}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm"
                  style={{ background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper)" : "var(--ink)", border: `1px solid ${on ? "var(--ink)" : "var(--line)"}` }}>
                  <span className="disp" style={{ fontWeight: 500 }}>{c.label}</span>
                  {n > 0 && <span className="ml-1.5 text-[10px]" style={{ color: on ? "var(--gold)" : "var(--vermillion)", fontWeight: 700 }}>{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="px-4 pb-2.5 flex items-center gap-2 flex-wrap">
            {["liste", "carte"].map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1 rounded text-[11px] tracking-wide uppercase"
                style={{ background: view === v ? "var(--gold)" : "transparent", color: view === v ? "var(--paper)" : "var(--ink-soft)", border: `1px solid ${view === v ? "var(--gold)" : "var(--line)"}`, fontWeight: 600 }}>
                {v}
              </button>
            ))}
            <span className="w-px h-4" style={{ background: "var(--line)" }} />
            <select value={filter} onChange={e => setFilter(e.target.value)}
              style={{ width: "auto", padding: "4px 8px", fontSize: 11 }}>
              <option value="tous">Tous verdicts</option>
              <option value="oui">Oui</option>
              <option value="option">Option</option>
              <option value="voir">À voir</option>
              <option value="non">Non</option>
            </select>
            <button onClick={() => setFavOnly(v => !v)}
              className="px-3 py-1 rounded text-[11px] tracking-wide uppercase"
              style={{ background: favOnly ? "var(--vermillion)" : "transparent", color: favOnly ? "var(--paper)" : "var(--ink-soft)", border: `1px solid ${favOnly ? "var(--vermillion)" : "var(--line)"}`, fontWeight: 600 }}>
              ★ Favoris
            </button>
            {canWrite && (
              <button onClick={() => { setFormSession(s => s + 1); setEditing({ city, verdict: "voir" }); }}
                className="ml-auto px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
                style={{ background: "var(--vermillion)", color: "var(--paper)", fontWeight: 600 }}>
                + Ajouter
              </button>
            )}
          </div>
        </div>

        {/* Titre étape */}
        <div className="px-6 pt-7 pb-4">
          {activeCity.native && (
            <div className="kr text-sm mb-1" style={{ color: "var(--vermillion)", fontWeight: 500 }}>{activeCity.native}</div>
          )}
          <h2 className="disp text-[1.9rem] leading-none" style={{ fontWeight: 400 }}>{activeCity.label}</h2>
          <div className="text-[11px] tracking-[.16em] uppercase mt-1.5" style={{ color: "var(--ink-soft)" }}>
            {activeCity.note ? `${activeCity.note} · ` : ""}{cityIdeas.length} affichée{cityIdeas.length > 1 ? "s" : ""}
          </div>
        </div>

        {/* Vue carte */}
        {view === "carte" && (
          <div className="px-6 pb-4 fade">
            {mapPts.length === 0 ? (
              <div className="border border-dashed rounded-lg p-7 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>
                Aucun lieu géolocalisé ici. Ajoutez lat/lng pour l'afficher sur la carte.
              </div>
            ) : (
              <>
                <GoogleMapView pts={mapPts} sel={sel} onSel={setSel} />
                <div className="text-[10px] mt-2 px-1 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--ink-soft)" }}>
                  <span>{mapPts.length}/{cityIdeas.length} lieux placés.</span>
                  {sel ? (
                    <button onClick={() => setSel(null)} className="underline" style={{ color: "var(--vermillion)", fontWeight: 600 }}>
                      Voir les {cityIdeas.length} idées
                    </button>
                  ) : (
                    <span>Touchez un point pour n'afficher que ce lieu ci-dessous.</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Liste */}
        <main className="px-6 pb-10 fade" key={city + view + filter + (view === "carte" ? sel || "" : "")}>
          {loading ? (
            <div className="text-center text-xs py-8" style={{ color: "var(--ink-soft)" }}>chargement…</div>
          ) : listIdeas.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center" style={{ borderColor: "var(--line)" }}>
              <div className="disp text-lg italic mb-1" style={{ color: "var(--ink-soft)" }}>
                {favOnly && cityIdeasAll.length > 0 ? "Aucun favori ici" : "Rien ici"}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {favOnly && cityIdeasAll.length > 0
                  ? "Marquez une idée avec l'étoile pour la retrouver ici."
                  : canWrite ? "Ajoutez une idée avec le bouton ci-dessus." : "Aucune idée dans cette étape."}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {listIdeas.map(i => (
                <Card key={i.id} d={i} open={sel === i.id} canWrite={canWrite}
                  cityLabel={activeCity.label} near={cityCenter}
                  onPlaceId={(placeId) => rememberPlaceId(i, placeId)}
                  onToggle={() => setSel(sel === i.id ? null : i.id)}
                  onToggleFav={() => toggleFavori(i)}
                  onEdit={() => { setFormSession(s => s + 1); setEditing(i); }}
                  onDelete={() => setConfirmDel(i)} />
              ))}
            </div>
          )}
        </main>

        <footer className="px-6 py-6 border-t text-center text-[10px]" style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>
          <div>{email}</div>
          <div className="mt-2 flex justify-center gap-3">
            <button onClick={signOut} className="underline tracking-[.2em] uppercase">Se déconnecter</button>
            <button onClick={onDeleteAccount} className="underline tracking-[.12em] uppercase" style={{ color: "var(--vermillion)" }}>Supprimer mon compte</button>
          </div>
        </footer>
      </div>

      {canWrite && editing && (
        <Form key={formSession} init={editing} cities={cities} near={cityCenter} accessToken={accessToken}
          destination={trip.title} onSave={save} onCancel={() => setEditing(null)} />
      )}
      {canWrite && confirmDel && (
        <Confirm
          title="Supprimer ?"
          message={<>« <span style={{ color: "var(--ink)", fontWeight: 500 }}>{confirmDel.title}</span> » sera retiré de la liste.</>}
          confirmLabel="Supprimer"
          onYes={() => remove(confirmDel.id)}
          onNo={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ---------- Fiche ----------
function Card({ d, open, canWrite, cityLabel, near, onPlaceId, onToggle, onToggleFav, onEdit, onDelete }) {
  const v = VERDICTS[d.verdict] || VERDICTS.voir;
  return (
    <article className="rounded-lg overflow-hidden" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
      <div className="flex items-start gap-1 pl-4 pr-2.5 pt-4">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="disp text-[1.2rem] leading-tight" style={{ fontWeight: 600 }}>{d.title}</h3>
              {d.kr && <div className="kr text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{d.kr}</div>}
              {d.type && <div className="text-[9px] tracking-[.2em] uppercase mt-1.5" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>{d.type}</div>}
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-[9px] tracking-[.15em] px-2 py-0.5 rounded-full"
                style={{ background: v.bg, color: v.color, fontWeight: 700 }}>{v.label}</span>
              {d.origin === "suggestion" && (
                <span className="text-[8px] tracking-wider uppercase" style={{ color: "var(--indigo)", fontWeight: 700 }}>suggéré</span>
              )}
            </div>
          </div>
        </button>
        {canWrite ? (
          <button type="button" onClick={onToggleFav}
            aria-label={d.favori ? "Retirer des favoris" : "Ajouter aux favoris"}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
            style={{ color: d.favori ? "var(--vermillion)" : "var(--line)", fontSize: 20, lineHeight: 1 }}>
            {d.favori ? "★" : "☆"}
          </button>
        ) : d.favori ? (
          <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center" aria-label="Favori"
            style={{ color: "var(--vermillion)", fontSize: 20, lineHeight: 1 }}>★</span>
        ) : null}
      </div>

      {open && (
        <div className="px-4 pb-4 fade" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          {/* Cherchée à l'ouverture de la fiche, pas au rendu de la liste :
              une image par lieu affiché coûterait une requête Places chacune. */}
          <PlacePhoto title={d.title} placeId={d.placeId} city={cityLabel} near={near}
            onResolved={onPlaceId} />
          {d.note && <p className="text-xs italic disp mb-3" style={{ color: "var(--ink-soft)" }}>« {d.note} »</p>}
          {d.desc && <Field label="Descriptif">{d.desc}</Field>}
          {d.zone && <Field label="Quartier">{d.zone}</Field>}
          {d.avis && (
            <div className="mb-3 p-3 rounded text-sm leading-relaxed"
              style={{ background: "rgba(181,72,61,.05)", borderLeft: "2px solid var(--vermillion)" }}>
              {d.avis}
            </div>
          )}
          {d.when && <Field label="À caser">{d.when}</Field>}

          <div className="flex items-center gap-2 mt-4 pt-3 flex-wrap" style={{ borderTop: "1px solid var(--line)" }}>
            {canWrite && (
              <>
                <button onClick={onEdit} className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
                  style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Modifier</button>
                <button onClick={onDelete} className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
                  style={{ border: "1px solid var(--vermillion)", color: "var(--vermillion)", fontWeight: 600 }}>Supprimer</button>
              </>
            )}
            {Number.isFinite(d.lat) && Number.isFinite(d.lng) && (
              <a href={gmaps(d)} target="_blank" rel="noopener noreferrer"
                className="ml-auto px-3 py-1.5 rounded text-[11px]"
                style={{ background: "var(--ink)", color: "var(--paper)", fontWeight: 600 }}>Maps ↗</a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <div className="text-[9px] tracking-[.2em] uppercase mb-1" style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{label}</div>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

// ---------- Formulaire ----------
function Form({ init, cities, near, destination, accessToken, onSave, onCancel }) {
  // Capturé une seule fois : "Réinitialiser" y revient (blanc pour une nouvelle idée,
  // valeurs d'origine si on modifie une idée existante).
  const initialState = useRef({
    title: "", kr: "", type: "", verdict: "voir", note: "",
    desc: "", zone: "", avis: "", when: "",
    ...init,
    lat: init.lat ?? "", lng: init.lng ?? "",
  }).current;
  const [f, setF] = useState(initialState);
  // Ce que la photo doit illustrer, figé au moment où on la demande : sans ça,
  // chaque frappe dans le champ « Nom » relancerait une recherche facturée.
  // Null tant qu'aucune photo n'est demandée — une fiche déjà rattachée à un
  // lieu Google, elle, s'affiche d'emblée puisque sa photo est déjà connue.
  const [photoOf, setPhotoOf] = useState(
    init.placeId ? { title: init.title || "", placeId: init.placeId, city: init.city } : null
  );
  const [aiState, setAiState] = useState("idle"); // idle | loading | error
  const [aiError, setAiError] = useState(null);
  const [aiResearched, setAiResearched] = useState(null); // null tant qu'aucune génération n'a eu lieu
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.title.trim().length > 0;

  // Affiche la photo du lieu. Jamais déclenché à la main : le formulaire
  // l'appelle quand un lieu vient d'être choisi ou décrit par l'IA.
  // `over` porte alors ce lieu, l'état du formulaire n'étant pas encore à jour.
  // Un `placeId` explicitement vide écrase l'ancien : sinon un nouveau lieu
  // hériterait de la photo du précédent.
  const askPhoto = (over = {}) =>
    setPhotoOf({
      title: (over.title ?? f.title).trim(),
      placeId: ('placeId' in over ? over.placeId : f.placeId) || null,
      city: over.city ?? f.city,
    });

  const resetFields = () => {
    setF(initialState);
    setPhotoOf(
      initialState.placeId
        ? { title: initialState.title, placeId: initialState.placeId, city: initialState.city }
        : null
    );
    setAiState("idle");
    setAiError(null);
    setAiResearched(null);
  };

  // Complète les champs vides à partir du nom, de la latitude et de la longitude via un
  // modèle OpenAI (qui fait au préalable une recherche web pour vérifier ses infos).
  // Ne touche jamais aux champs déjà remplis par l'utilisateur.
  const generateWithAI = async () => {
    if (!f.title.trim() || aiState === "loading") return;
    setAiState("loading");
    setAiError(null);
    try {
      const res = await fetch("/api/generate-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: f.title, lat: f.lat, lng: f.lng, zone: f.zone,
          destination,
          city: cities.find(c => c.id === f.city)?.label || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de la génération.");
      setF(prev => {
        const next = { ...prev };
        for (const key of ["kr", "type", "note", "desc", "zone", "avis", "when"]) {
          if (!String(prev[key] || "").trim() && data.fields?.[key]) next[key] = data.fields[key];
        }
        return next;
      });
      setAiResearched(Boolean(data.researched));
      setAiState("idle");
      // Le lieu vient d'être décrit : autant l'illustrer dans la foulée.
      askPhoto();
    } catch (e) {
      setAiState("error");
      setAiError(e.message || "Échec de la génération.");
    }
  };

  const submit = async () => {
    if (!valid || saving) return;
    const out = { ...f };
    out.lat = f.lat === "" ? undefined : parseFloat(f.lat);
    out.lng = f.lng === "" ? undefined : parseFloat(f.lng);
    if (isNaN(out.lat) || isNaN(out.lng)) { delete out.lat; delete out.lng; }
    setSaving(true);
    await onSave(out);
    setSaving(false);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="idea-form-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 android-sheet"
      style={{ background: "rgba(27,34,48,.45)" }}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto sans"
        style={{ background: "var(--bg)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <div className="sticky top-0 px-5 py-4 border-b backdrop-blur-md"
          style={{ borderColor: "var(--line)", background: "rgba(242,237,227,.95)" }}>
          <h3 id="idea-form-title" className="disp text-xl" style={{ fontWeight: 600 }}>
            {init.id ? "Modifier" : "Nouvelle idée"}
          </h3>
        </div>

        <div className="p-5 space-y-3.5">
          <PlaceSearch near={near} onPick={(p) => {
            setF(prev => ({
              ...prev,
              title: p.name || prev.title,
              zone: p.address || prev.zone,
              lat: p.lat ?? prev.lat,
              lng: p.lng ?? prev.lng,
              placeId: p.placeId ?? prev.placeId,
            }));
            // Le lieu est identifié : sa photo est déjà chargée, on l'affiche.
            askPhoto({ title: p.name || f.title, placeId: p.placeId });
          }} />
          <div><label htmlFor="idea-title">Nom *</label><input id="idea-title" value={f.title} onChange={set("title")} placeholder="Ex : Café Onion Seongsu, Duomo di Catania…" /></div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button type="button" onClick={generateWithAI} disabled={!f.title.trim() || aiState === "loading"}
              className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
              style={{
                border: "1px solid var(--indigo)", color: "var(--indigo)", fontWeight: 600,
                opacity: (!f.title.trim() || aiState === "loading") ? 0.5 : 1,
                cursor: (!f.title.trim() || aiState === "loading") ? "not-allowed" : "pointer",
              }}>
              {aiState === "loading" ? "Génération…" : "Générer avec l'IA"}
            </button>
            <button type="button" onClick={resetFields}
              className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)", fontWeight: 600 }}>
              Réinitialiser les champs
            </button>
          </div>
          <span className="text-[10px] block -mt-1.5" style={{ color: "var(--ink-soft)" }}>
            L'IA cherche sur le web puis complète les champs vides ci-dessous à partir du nom,
            de l'étape et des coordonnées.
          </span>
          {aiState === "error" && aiError && (
            <p className="text-[11px]" style={{ color: "var(--vermillion)" }}>{aiError}</p>
          )}
          {aiState === "idle" && aiResearched !== null && (
            <p className="text-[10px]" style={{ color: aiResearched ? "var(--jade)" : "var(--gold-deep)" }}>
              {aiResearched
                ? "Champs proposés à partir d'une recherche web — à relire quand même."
                : "Recherche web indisponible cette fois : champs génériques, à vérifier."}
            </p>
          )}
          {photoOf && (
            <PlacePhoto
              title={photoOf.title}
              placeId={photoOf.placeId}
              city={cities.find(c => c.id === photoOf.city)?.label || ""}
              near={near}
              showEmpty
              onResolved={(placeId) => setF(prev => ({ ...prev, placeId }))}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Étape</label>
              <select value={f.city} onChange={set("city")}>
                {cities.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label>Verdict</label>
              <select value={f.verdict} onChange={set("verdict")}>
                <option value="oui">Oui</option>
                <option value="option">Option</option>
                <option value="voir">À voir</option>
                <option value="non">Non</option>
              </select>
            </div>
          </div>
          <div><label>Nom local / sous-titre</label><input value={f.kr} onChange={set("kr")} placeholder="Nom local · sous-titre" /></div>
          <div><label>Type</label><input value={f.type} onChange={set("type")} placeholder="Café · Brunch" /></div>
          <div><label>Note courte</label><input value={f.note} onChange={set("note")} placeholder="À réserver le week-end" /></div>
          <div><label>Descriptif</label><textarea rows={3} value={f.desc} onChange={set("desc")} /></div>
          <div><label>Quartier</label><input value={f.zone} onChange={set("zone")} /></div>
          <div><label>Mon avis</label><textarea rows={2} value={f.avis} onChange={set("avis")} /></div>
          <div><label>À caser</label><input value={f.when} onChange={set("when")} placeholder="Jour 3, après-midi" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label>Latitude</label><input value={f.lat} onChange={set("lat")} placeholder="37.5665" inputMode="decimal" /></div>
            <div><label>Longitude</label><input value={f.lng} onChange={set("lng")} placeholder="126.9780" inputMode="decimal" /></div>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Coordonnées facultatives — sans elles, le lieu reste dans la liste mais n'apparaît pas sur la carte.
            {hasMapsKey
              ? " Le plus simple : utilisez la recherche en haut du formulaire."
              : " Sur Google Maps : clic droit sur le point → les deux nombres s'affichent."}
          </p>
        </div>

        <div className="sticky bottom-0 px-5 py-4 border-t flex gap-2.5 backdrop-blur-md"
          style={{ borderColor: "var(--line)", background: "rgba(242,237,227,.95)" }}>
          <button onClick={onCancel} disabled={saving} className="flex-1 py-2.5 rounded text-sm"
            style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} disabled={!valid || saving} className="flex-1 py-2.5 rounded text-sm"
            style={{ background: valid && !saving ? "var(--ink)" : "var(--line)", color: "var(--paper)", fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed" }}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Confirmation ----------
function Confirm({ title, message, confirmLabel, onYes, onNo, busy = false, error = null }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-50 flex items-center justify-center p-6 android-modal" style={{ background: "rgba(27,34,48,.45)" }}>
      <div className="w-full max-w-sm p-5 sans" style={{ background: "var(--bg)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <h3 id="confirm-title" className="disp text-lg mb-2" style={{ fontWeight: 600 }}>{title}</h3>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>{message}</p>
        {error && <p className="text-xs mb-4" style={{ color: "var(--vermillion)" }}>{error}</p>}
        <div className="flex gap-2.5">
          <button onClick={onNo} disabled={busy} className="flex-1 py-2.5 rounded text-sm"
            style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Annuler</button>
          <button onClick={onYes} disabled={busy} className="flex-1 py-2.5 rounded text-sm"
            style={{ background: "var(--vermillion)", color: "var(--paper)", fontWeight: 600, opacity: busy ? .65 : 1 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
