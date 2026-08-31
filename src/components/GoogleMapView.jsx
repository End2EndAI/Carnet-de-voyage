import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey, MAP_ID } from '../lib/googleMaps.js';

// Une couleur par étape, tirée de la palette du carnet. L'identifiant de
// l'étape choisit la teinte : même étape, même couleur d'une visite à l'autre.
const PALETTE = ['#1B2230', '#B5483D', '#4A6B5C', '#8C6F44', '#47597E'];

function cityColor(city) {
  let hash = 0;
  for (const ch of String(city || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function infoWindowContent(title, kr) {
  return `
    <div style="font-family:'DM Sans',system-ui,sans-serif;padding:2px 2px;max-width:220px;">
      <div style="font-size:13px;font-weight:700;color:#1B2230;line-height:1.3;">${escapeHtml(title)}</div>
      ${kr ? `<div style="font-size:11px;color:#6b6b6b;margin-top:2px;">${escapeHtml(kr)}</div>` : ''}
    </div>
  `;
}

export default function GoogleMapView({ pts, sel, onSel }) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const infoWindow = useRef(null);
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
        center: { lat: 20, lng: 0 },
        zoom: 2,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
    }

    if (!infoWindow.current) {
      infoWindow.current = new maps.InfoWindow();
      // Si l'utilisateur ferme l'infobulle à la main, on désélectionne le point.
      infoWindow.current.addListener('closeclick', () => onSel(null));
    }

    markers.current.forEach(({ marker }) => {
      marker.map = null;
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
        content: makePin(i, cityColor(p.city), sel === p.id),
        gmpClickable: true,
        zIndex: sel === p.id ? 999 : i,
      });
      marker.addListener('gmp-click', () => onSel(sel === p.id ? null : p.id));
      markers.current.set(p.id, { marker, index: i, city: p.city, title: p.title, kr: p.kr });
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

  // Mise en évidence du marqueur sélectionné + infobulle avec le nom du lieu
  useEffect(() => {
    if (!ready) return;
    markers.current.forEach(({ marker, index, city }, id) => {
      const selected = id === sel;
      marker.content = makePin(index, cityColor(city), selected);
      marker.zIndex = selected ? 999 : index;
    });

    const entry = sel ? markers.current.get(sel) : null;
    if (entry && infoWindow.current) {
      infoWindow.current.setContent(infoWindowContent(entry.title, entry.kr));
      infoWindow.current.open({ map: map.current, anchor: entry.marker });
    } else {
      infoWindow.current?.close();
    }
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
      className="w-full rounded-lg map-view"
      style={{ height: 440, background: 'var(--paper)', border: '1px solid var(--line)' }}
    />
  );
}
