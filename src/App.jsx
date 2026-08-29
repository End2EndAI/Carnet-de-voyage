import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SEED } from './data.js';
import { loadIdeas, saveIdea, removeIdea, resetToSeed } from './lib/store.js';
import { hasSupabase } from './lib/supabase.js';
import { hasMapsKey } from './lib/googleMaps.js';
import GoogleMapView from './components/GoogleMapView.jsx';
import PlaceSearch from './components/PlaceSearch.jsx';
import Login from './components/Login.jsx';
import { getSession, onAuthChange, signOut, cleanAuthHash } from './lib/auth.js';


const VERDICTS = {
  oui:    { bg: "rgba(74,107,92,.14)",   color: "var(--jade)",       label: "OUI" },
  option: { bg: "rgba(184,153,104,.18)", color: "var(--gold-deep)",  label: "OPTION" },
  voir:   { bg: "rgba(26,31,46,.08)",    color: "var(--ink-soft)",   label: "À VOIR" },
  non:    { bg: "rgba(181,72,61,.14)",   color: "var(--vermillion)", label: "NON" },
};

const CITY_COLOR = {
  seoul: "var(--ink)", jeju: "var(--vermillion)", busan: "var(--jade)",
  gyeongju: "var(--gold-deep)", jeonju: "var(--indigo)",
};

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lieu";

const gmaps = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// ---------- Racine : porte d'entrée ----------
export default function CoreeApp() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setChecking(false);
      cleanAuthHash();
    });
    return onAuthChange((s) => {
      setSession(s);
      cleanAuthHash();
    });
  }, []);

  // Sans Supabase (variables absentes), on garde le carnet utilisable en local.
  if (!hasSupabase) return <Carnet session={null} />;

  if (checking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center sans"
        style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
        <span className="text-xs tracking-[.2em] uppercase">Chargement…</span>
      </div>
    );
  }

  if (!session) return <Login />;

  return <Carnet session={session} />;
}

// ---------- Carnet ----------
function Carnet({ session }) {
  const [ideas, setIdeas] = useState(SEED.ideas);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("");
  const [city, setCity] = useState("seoul");
  const [view, setView] = useState("liste");
  const [editing, setEditing] = useState(null);
  const [formSession, setFormSession] = useState(0); // force un remount propre de <Form> à chaque ouverture
  const [confirmDel, setConfirmDel] = useState(null);
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("tous");
  const [source, setSource] = useState(hasSupabase ? "supabase" : "local");
  const [errMsg, setErrMsg] = useState(null);

  // Chargement initial
  useEffect(() => {
    (async () => {
      const { ideas: loaded, source: src, error } = await loadIdeas();
      setIdeas(loaded);
      setSource(src);
      if (error) setErrMsg(error);
      setLoading(false);
    })();
  }, []);

  // Applique la modification en local, puis la propage à Supabase.
  const persist = async (next, action) => {
    setIdeas(next);
    setSaveState("saving");
    const error = await action(next);
    if (error) {
      setErrMsg(error);
      setSaveState("error");
    } else {
      setErrMsg(null);
      setSaveState("saved");
      setTimeout(() => setSaveState(""), 1600);
    }
  };

  const cityIdeas = useMemo(() => {
    let list = ideas.filter(i => i.city === city);
    if (filter !== "tous") list = list.filter(i => i.verdict === filter);
    return list;
  }, [ideas, city, filter]);

  const mapPts = useMemo(() => cityIdeas.filter(i => i.lat && i.lng), [cityIdeas]);
  // En vue carte, une sélection filtre la liste sur ce seul lieu.
  const listIdeas = useMemo(
    () => (view === "carte" && sel ? cityIdeas.filter(i => i.id === sel) : cityIdeas),
    [cityIdeas, view, sel]
  );
  const countFor = (id) => ideas.filter(i => i.city === id).length;

  const save = (data) => {
    let next, saved;
    if (data.id && ideas.some(i => i.id === data.id)) {
      saved = { ...ideas.find(i => i.id === data.id), ...data };
      next = ideas.map(i => i.id === data.id ? saved : i);
    } else {
      let id = slug(data.title);
      while (ideas.some(i => i.id === id)) id += "-2";
      saved = { ...data, id, origin: "perso" };
      next = [...ideas, saved];
    }
    persist(next, (list) => saveIdea(saved, list));
    setEditing(null);
  };

  const remove = (id) => {
    persist(ideas.filter(i => i.id !== id), (list) => removeIdea(id, list));
    setConfirmDel(null);
    if (sel === id) setSel(null);
  };

  const resetAll = () => {
    persist(SEED.ideas, () => resetToSeed());
    setConfirmDel(null);
  };

  const activeCity = SEED.cities.find(c => c.id === city);

  return (
    <div className="min-h-screen w-full" style={{ background: "var(--bg)", color: "var(--ink)" }}>

      <div className="max-w-2xl mx-auto grain sans">
        {/* Header */}
        <header className="px-6 pt-10 pb-5 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px w-8" style={{ background: "var(--vermillion)" }} />
                <div className="text-[10px] tracking-[.35em] uppercase" style={{ color: "var(--vermillion)", fontWeight: 600 }}>
                  Carnet éditable
                </div>
              </div>
              <h1 className="disp text-[2.1rem] leading-none" style={{ fontWeight: 350, fontStyle: "italic" }}>
                Corée du Sud
              </h1>
              <div className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                {SEED.trip.dates} · {ideas.length} idées
              </div>
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              {loading && <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>chargement…</span>}
              {saveState === "saving" && <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>…</span>}
              {saveState === "saved" && <span className="text-[10px]" style={{ color: "var(--jade)" }}>✓ enregistré</span>}
              {saveState === "error" && <span className="text-[10px]" style={{ color: "var(--vermillion)" }}>échec sauvegarde</span>}
              {!loading && (
                <span className="text-[9px] tracking-[.14em] uppercase"
                  style={{ color: source === "supabase" ? "var(--jade)" : "var(--gold-deep)", fontWeight: 700 }}>
                  {source === "supabase" ? "· synchronisé" : "· local"}
                </span>
              )}
            </div>
          </div>
        </header>

        {errMsg && (
          <div className="mx-6 mt-4 p-3 rounded text-xs leading-relaxed"
            style={{ background: "rgba(181,72,61,.07)", borderLeft: "2px solid var(--vermillion)", color: "var(--ink-soft)" }}>
            <strong style={{ color: "var(--vermillion)" }}>Supabase injoignable.</strong>{" "}
            Vos modifications restent enregistrées sur cet appareil. ({errMsg})
          </div>
        )}

        {/* Villes */}
        <div className="sticky top-0 z-20 backdrop-blur-md border-b" style={{ borderColor: "var(--line)", background: "rgba(242,237,227,.93)" }}>
          <div className="px-4 py-2.5 flex gap-2 overflow-x-auto noscroll">
            {SEED.cities.map(c => {
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
            <button onClick={() => { setFormSession(s => s + 1); setEditing({ city, verdict: "voir" }); }}
              className="ml-auto px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
              style={{ background: "var(--vermillion)", color: "var(--paper)", fontWeight: 600 }}>
              + Ajouter
            </button>
          </div>
        </div>

        {/* Titre ville */}
        <div className="px-6 pt-7 pb-4">
          <div className="kr text-sm mb-1" style={{ color: "var(--vermillion)", fontWeight: 500 }}>{activeCity.korean}</div>
          <h2 className="disp text-[1.9rem] leading-none" style={{ fontWeight: 400 }}>{activeCity.label}</h2>
          <div className="text-[11px] tracking-[.16em] uppercase mt-1.5" style={{ color: "var(--ink-soft)" }}>
            {activeCity.note} · {cityIdeas.length} affichée{cityIdeas.length > 1 ? "s" : ""}
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
          {listIdeas.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center" style={{ borderColor: "var(--line)" }}>
              <div className="disp text-lg italic mb-1" style={{ color: "var(--ink-soft)" }}>Rien ici</div>
              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>Ajoutez une idée avec le bouton ci-dessus.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {listIdeas.map(i => (
                <Card key={i.id} d={i} open={sel === i.id}
                  onToggle={() => setSel(sel === i.id ? null : i.id)}
                  onEdit={() => { setFormSession(s => s + 1); setEditing(i); }}
                  onDelete={() => setConfirmDel(i)} />
              ))}
            </div>
          )}
        </main>

        <footer className="px-6 py-6 border-t text-center" style={{ borderColor: "var(--line)" }}>
          <button onClick={() => setConfirmDel({ id: "__reset__", title: "toutes vos modifications" })}
            className="text-[10px] tracking-[.2em] uppercase underline"
            style={{ color: "var(--ink-soft)" }}>
            Réinitialiser au carnet d'origine
          </button>
          {session && (
            <div className="mt-4 text-[10px]" style={{ color: "var(--ink-soft)" }}>
              {session.user.email}
              <button onClick={signOut} className="ml-2 underline tracking-[.2em] uppercase">
                Se déconnecter
              </button>
            </div>
          )}
        </footer>
      </div>

      {editing && <Form key={formSession} init={editing} cities={SEED.cities} onSave={save} onCancel={() => setEditing(null)} />}
      {confirmDel && (
        <Confirm item={confirmDel}
          onYes={() => confirmDel.id === "__reset__" ? resetAll() : remove(confirmDel.id)}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

// ---------- Fiche ----------
function Card({ d, open, onToggle, onEdit, onDelete }) {
  const v = VERDICTS[d.verdict] || VERDICTS.voir;
  return (
    <article className="rounded-lg overflow-hidden" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="disp text-[1.2rem] leading-tight" style={{ fontWeight: 600 }}>{d.title}</h3>
            {d.kr && <div className="kr text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{d.kr}</div>}
            {d.type && <div className="text-[9px] tracking-[.2em] uppercase mt-1.5" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>{d.type}</div>}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-[9px] tracking-[.15em] px-2 py-0.5 rounded-full"
              style={{ background: v.bg, color: v.color, fontWeight: 700 }}>{v.label}</span>
            {d.origin === "perso" && (
              <span className="text-[8px] tracking-wider uppercase" style={{ color: "var(--indigo)", fontWeight: 700 }}>perso</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 fade" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
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
            <button onClick={onEdit} className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
              style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Modifier</button>
            <button onClick={onDelete} className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide"
              style={{ border: "1px solid var(--vermillion)", color: "var(--vermillion)", fontWeight: 600 }}>Supprimer</button>
            {d.lat && d.lng && (
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
function Form({ init, cities, onSave, onCancel }) {
  // Capturé une seule fois : "Réinitialiser" y revient (blanc pour une nouvelle idée,
  // valeurs d'origine si on modifie une idée existante).
  const initialState = useRef({
    title: "", kr: "", type: "", verdict: "voir", note: "",
    desc: "", zone: "", avis: "", when: "",
    ...init,
    lat: init.lat ?? "", lng: init.lng ?? "",
  }).current;
  const [f, setF] = useState(initialState);
  const [aiState, setAiState] = useState("idle"); // idle | loading | error
  const [aiError, setAiError] = useState(null);
  const [aiResearched, setAiResearched] = useState(null); // null tant qu'aucune génération n'a eu lieu
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.title.trim().length > 0;

  const resetFields = () => {
    setF(initialState);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: f.title, lat: f.lat, lng: f.lng, zone: f.zone }),
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
    } catch (e) {
      setAiState("error");
      setAiError(e.message || "Échec de la génération.");
    }
  };

  const submit = () => {
    if (!valid) return;
    const out = { ...f };
    out.lat = f.lat === "" ? undefined : parseFloat(f.lat);
    out.lng = f.lng === "" ? undefined : parseFloat(f.lng);
    if (isNaN(out.lat) || isNaN(out.lng)) { delete out.lat; delete out.lng; }
    onSave(out);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(27,34,48,.45)" }}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto sans"
        style={{ background: "var(--bg)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <div className="sticky top-0 px-5 py-4 border-b backdrop-blur-md"
          style={{ borderColor: "var(--line)", background: "rgba(242,237,227,.95)" }}>
          <h3 className="disp text-xl" style={{ fontWeight: 600 }}>
            {init.id ? "Modifier" : "Nouvelle idée"}
          </h3>
        </div>

        <div className="p-5 space-y-3.5">
          <PlaceSearch onPick={(p) => setF(prev => ({
            ...prev,
            title: p.name || prev.title,
            zone: p.address || prev.zone,
            lat: p.lat ?? prev.lat,
            lng: p.lng ?? prev.lng,
          }))} />
          <div><label>Nom *</label><input value={f.title} onChange={set("title")} placeholder="Ex : Café Onion Seongsu" /></div>
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
            de la latitude et de la longitude.
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Ville</label>
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
          <div><label>Nom coréen / sous-titre</label><input value={f.kr} onChange={set("kr")} placeholder="성수동 · Café" /></div>
          <div><label>Type</label><input value={f.type} onChange={set("type")} placeholder="Café · Brunch" /></div>
          <div><label>Note courte</label><input value={f.note} onChange={set("note")} placeholder="À réserver le week-end" /></div>
          <div><label>Descriptif</label><textarea rows={3} value={f.desc} onChange={set("desc")} /></div>
          <div><label>Quartier</label><input value={f.zone} onChange={set("zone")} /></div>
          <div><label>Mon avis</label><textarea rows={2} value={f.avis} onChange={set("avis")} /></div>
          <div><label>À caser</label><input value={f.when} onChange={set("when")} placeholder="7 oct, après-midi" /></div>
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
          <button onClick={onCancel} className="flex-1 py-2.5 rounded text-sm"
            style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} disabled={!valid} className="flex-1 py-2.5 rounded text-sm"
            style={{ background: valid ? "var(--ink)" : "var(--line)", color: "var(--paper)", fontWeight: 600, cursor: valid ? "pointer" : "not-allowed" }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Confirmation ----------
function Confirm({ item, onYes, onNo }) {
  const isReset = item.id === "__reset__";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(27,34,48,.45)" }}>
      <div className="w-full max-w-sm p-5 sans" style={{ background: "var(--bg)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <h3 className="disp text-lg mb-2" style={{ fontWeight: 600 }}>
          {isReset ? "Réinitialiser ?" : "Supprimer ?"}
        </h3>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {isReset
            ? "Toutes vos modifications et ajouts seront perdus, et la liste repartira des 66 idées du carnet d'origine."
            : <>« <span style={{ color: "var(--ink)", fontWeight: 500 }}>{item.title}</span> » sera retiré de la liste.</>}
        </p>
        <div className="flex gap-2.5">
          <button onClick={onNo} className="flex-1 py-2.5 rounded text-sm"
            style={{ border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>Annuler</button>
          <button onClick={onYes} className="flex-1 py-2.5 rounded text-sm"
            style={{ background: "var(--vermillion)", color: "var(--paper)", fontWeight: 600 }}>
            {isReset ? "Réinitialiser" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
