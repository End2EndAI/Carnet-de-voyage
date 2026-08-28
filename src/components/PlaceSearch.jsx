import React, { useEffect, useRef, useState } from 'react';
import { suggestPlaces, resolvePlace, newSessionToken, hasMapsKey } from '../lib/googleMaps.js';

/**
 * Champ de recherche d'adresse (Google Places).
 * Au choix d'un résultat, appelle onPick({ name, address, lat, lng }).
 */
export default function PlaceSearch({ onPick }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const session = useRef(null);
  const box = useRef(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Recherche débounced
  useEffect(() => {
    if (!hasMapsKey || query.trim().length < 3) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        if (!session.current) session.current = await newSessionToken();
        const results = await suggestPlaces(query, session.current);
        if (!cancelled) {
          setItems(results.slice(0, 6));
          setOpen(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const pick = async (item) => {
    setOpen(false);
    setBusy(true);
    try {
      const place = await resolvePlace(item);
      // Un jeton de session ne vaut que pour une recherche aboutie.
      session.current = null;
      setQuery('');
      setItems([]);
      onPick(place);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!hasMapsKey) return null;

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <label>Rechercher un lieu</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        placeholder="Gyeongbokgung, Café Onion Seongsu…"
        autoComplete="off"
      />
      <div className="text-[10px] mt-1" style={{ color: 'var(--ink-soft)' }}>
        {busy
          ? 'recherche…'
          : error || 'Le nom et les coordonnées se remplissent automatiquement.'}
      </div>

      {open && items.length > 0 && (
        <ul
          className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden"
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 24px rgba(27,34,48,.14)',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => pick(item)}
                className="w-full text-left px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <div className="text-sm" style={{ fontWeight: 600 }}>
                  {item.main}
                </div>
                {item.secondary && (
                  <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    {item.secondary}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
