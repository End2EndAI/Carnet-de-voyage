import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey, MAP_ID } from '../lib/googleMaps.js';

const CITY_HEX = {
  seoul: '#1B2230',
  jeju: '#B5483D',
  busan: '#4A6B5C',
  gyeongju: '#8C6F44',
  jeonju: '#47597E',
};

function makePin(index, color, selected) {
  const el = document.createElement('div');
  el.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:${selected ? 32 : 26}px;height:${selected ? 32 : 26}px;
    border-radius:50%;border:2px solid #FAF6EE;
    background:${selected ? '#B5483D' : color};
    color:#FAF6EE;font-family:'DM Sans',system-ui,sans-serif;
    font-size:${selected ? 13 : 11}px;font-weight:700;
    box-shadow:0 2px 6px rgba(27,34,48,.35);
    cursor:pointer;transition:all .15s ease;
  `;
  el.textContent = String(index + 1);
  return el;
}

export default function GoogleMapView({ pts, sel, onSel }) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => !cancelled && setReady(true))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Création de la carte + des marqueurs
  useEffect(() => {
    if (!ready || !holder.current) return;
    const maps = window.google.maps;

    if (!map.current) {
      map.current = new maps.Map(holder.current, {
        mapId: MAP_ID,
        center: { lat: 37.5665, lng: 126.978 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
    }

    markers.current.forEach((m) => {
      m.map = null;
    });
    markers.current = new Map();

    if (!pts.length) return;

    const bounds = new maps.LatLngBounds();
    pts.forEach((p, i) => {
      const position = { lat: p.lat, lng: p.lng };
      const marker = new maps.marker.AdvancedMarkerElement({
        map: map.current,
        position,
        title: p.title,
        content: makePin(i, CITY_HEX[p.city] || '#1B2230', sel === p.id),
        gmpClickable: true,
        zIndex: sel === p.id ? 999 : i,
      });
      marker.addListener('gmp-click', () => onSel(sel === p.id ? null : p.id));
      markers.current.set(p.id, { marker, index: i, city: p.city });
      bounds.extend(position);
    });

    if (pts.length === 1) {
      map.current.setCenter(bounds.getCenter());
      map.current.setZoom(15);
    } else {
      map.current.fitBounds(bounds, 56);
    }
    // `sel` volontairement absent : la sélection est gérée dans l'effet suivant
    // pour ne pas reconstruire tous les marqueurs à chaque clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pts]);

  // Mise en évidence du marqueur sélectionné
  useEffect(() => {
    if (!ready) return;
    markers.current.forEach(({ marker, index, city }, id) => {
      const selected = id === sel;
      marker.content = makePin(index, CITY_HEX[city] || '#1B2230', selected);
      marker.zIndex = selected ? 999 : index;
    });
  }, [sel, ready]);

  if (!hasMapsKey || error) {
    return (
      <div
        className="border border-dashed rounded-lg p-6 text-center text-sm"
        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}
      >
        {hasMapsKey
          ? error
          : 'Carte indisponible : la clé Google Maps n’est pas configurée (VITE_GOOGLE_MAPS_API_KEY).'}
      </div>
    );
  }

  return (
    <div
      ref={holder}
      className="w-full rounded-lg"
      style={{ height: 440, background: 'var(--paper)', border: '1px solid var(--line)' }}
    />
  );
}
