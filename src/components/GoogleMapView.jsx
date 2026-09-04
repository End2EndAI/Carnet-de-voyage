import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey, MAP_ID } from '../lib/googleMaps.js';
import { watchPosition } from '../lib/geolocation.js';

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

// La position de l'appareil se distingue des étapes par sa forme — un point
// plein sans numéro — autant que par sa couleur.
const ME_COLOR = '#47597E';

function makeMeDot() {
  const el = document.createElement('div');
  el.title = 'Ma position';
  el.style.cssText = `
    width:16px;height:16px;border-radius:50%;
    background:${ME_COLOR};border:3px solid #FAF6EE;
    box-shadow:0 1px 5px rgba(27,34,48,.45);
  `;
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
  const me = useRef({ stop: null, marker: null, halo: null, centered: false });
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [myPos, setMyPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);

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

  // Suivi de la position : le point se déplace avec l'utilisateur tant que le
  // suivi est actif, ce qui sert surtout sur place, en marchant.
  const stopTracking = useCallback(() => {
    me.current.stop?.();
    me.current.stop = null;
    me.current.centered = false;
    setTracking(false);
    setMyPos(null);
  }, []);

  // À la fermeture de la carte, la géolocalisation ne doit pas continuer à
  // tourner en fond : elle consomme la batterie pour rien.
  useEffect(() => stopTracking, [stopTracking]);

  const toggleTracking = () => {
    if (tracking) {
      stopTracking();
      setGeoError(null);
      return;
    }
    setGeoError(null);
    setTracking(true);
    me.current.centered = false;
    me.current.stop = watchPosition(setMyPos, (message) => {
      setGeoError(message);
      stopTracking();
    });
  };

  // Point de position + cercle de précision, recentrés au premier relevé.
  useEffect(() => {
    if (!ready || !map.current) return;
    const maps = window.google.maps;

    if (!myPos) {
      if (me.current.marker) me.current.marker.map = null;
      me.current.halo?.setMap(null);
      me.current.marker = null;
      me.current.halo = null;
      return;
    }

    const position = { lat: myPos.lat, lng: myPos.lng };
    if (me.current.marker) {
      me.current.marker.position = position;
    } else {
      me.current.marker = new maps.marker.AdvancedMarkerElement({
        map: map.current,
        position,
        title: 'Ma position',
        content: makeMeDot(),
        zIndex: 1000,
      });
    }

    // Le cercle dit ce que la position vaut : un relevé à 500 m près ne doit
    // pas se lire comme un point posé sur le trottoir.
    const radius = Number(myPos.accuracy) || 0;
    if (me.current.halo) {
      me.current.halo.setCenter(position);
      me.current.halo.setRadius(radius);
    } else {
      me.current.halo = new maps.Circle({
        map: map.current,
        center: position,
        radius,
        strokeColor: ME_COLOR,
        strokeOpacity: 0.35,
        strokeWeight: 1,
        fillColor: ME_COLOR,
        fillOpacity: 0.12,
        clickable: false,
      });
    }

    // Seulement au premier relevé : recentrer à chaque affinage volerait la
    // carte à qui vient de la déplacer.
    if (!me.current.centered) {
      me.current.centered = true;
      map.current.setCenter(position);
      map.current.setZoom(15);
    }
  }, [ready, myPos]);

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
    <div className="relative">
      <div
        ref={holder}
        className="w-full rounded-lg map-view"
        style={{ height: 440, background: 'var(--paper)', border: '1px solid var(--line)' }}
      />
      <button
        type="button"
        onClick={toggleTracking}
        aria-pressed={tracking}
        title={tracking ? 'Arrêter la localisation' : 'Afficher ma position'}
        className="absolute rounded-full flex items-center justify-center"
        style={{
          top: 10,
          left: 10,
          width: 44,
          height: 44,
          background: tracking ? ME_COLOR : 'var(--paper)',
          color: tracking ? 'var(--paper)' : 'var(--ink)',
          border: `1px solid ${tracking ? ME_COLOR : 'var(--line)'}`,
          boxShadow: '0 1px 4px rgba(27,34,48,.3)',
        }}
      >
        <span className="sr-only">{tracking ? 'Arrêter la localisation' : 'Afficher ma position'}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
      {(geoError || (tracking && !myPos)) && (
        <div className="text-[10px] mt-2 px-1" style={{ color: 'var(--ink-soft)' }} role="status">
          {geoError || 'Recherche de votre position…'}
        </div>
      )}
    </div>
  );
}
