import React, { useEffect, useState } from 'react';
import { findPlacePhoto, hasMapsKey } from '../lib/googleMaps.js';

/**
 * Photo illustrant un lieu, cherchée dans Google Places.
 *
 * L'URL n'est jamais stockée (Google les fait expirer) : le composant la
 * résout à l'affichage, à partir de l'identifiant du lieu quand on l'a, sinon
 * de son nom et de l'étape. `onResolved` remonte l'identifiant trouvé pour
 * que le carnet puisse le conserver et s'épargner la recherche la fois d'après.
 *
 * `showEmpty` : afficher un message quand le lieu n'a pas de photo. Utile dans
 * le formulaire, où le silence laisserait croire à un bug ; inutile sur une
 * fiche, où l'absence d'image se passe de commentaire.
 */
export default function PlacePhoto({
  title, city = '', near = null, placeId = null,
  onResolved = null, showEmpty = false,
}) {
  const [state, setState] = useState('loading'); // loading | found | none | error
  const [photo, setPhoto] = useState(null);
  // Le message de Google est conservé tel quel : « API non activée », « clé
  // refusée »… sont des pannes de configuration, indevinables sans le détail.
  const [reason, setReason] = useState(null);

  useEffect(() => {
    if (!hasMapsKey || !String(title || '').trim()) {
      setState('none');
      return undefined;
    }

    let cancelled = false;
    setState('loading');
    setPhoto(null);

    findPlacePhoto({ placeId, title, city, near })
      .then((found) => {
        if (cancelled) return;
        setPhoto(found);
        setState(found ? 'found' : 'none');
        if (found?.placeId && found.placeId !== placeId) onResolved?.(found.placeId);
      })
      .catch((err) => {
        console.error('Photo Google indisponible :', err);
        if (cancelled) return;
        setReason(err?.message || null);
        setState('error');
      });

    return () => { cancelled = true; };
    // `onResolved` est volontairement hors dépendances : la fonction est
    // recréée à chaque rendu du parent et relancerait la recherche en boucle.
  }, [placeId, title, city, near?.lat, near?.lng]);

  if (!hasMapsKey) return null;

  if (state === 'loading') {
    return (
      <div className="rounded-lg mb-3"
        style={{ background: 'rgba(26,31,46,.05)', border: '1px solid var(--line)', aspectRatio: '16 / 10' }}
        aria-label="Recherche d'une photo…" />
    );
  }

  // Sur une fiche, l'absence d'image se passe de commentaire. Dans le
  // formulaire, où la photo a été demandée, le silence passerait pour un bug.
  if (state !== 'found') {
    if (!showEmpty) return null;
    return (
      <p className="text-[10px] mb-3" style={{ color: state === 'error' ? 'var(--vermillion)' : 'var(--ink-soft)' }}>
        {state === 'error'
          ? `Recherche de photo impossible${reason ? ` : ${reason}` : ''}`
          : 'Aucune photo Google pour ce lieu.'}
      </p>
    );
  }

  return (
    <figure className="rounded-lg overflow-hidden mb-3 fade" style={{ border: '1px solid var(--line)' }}>
      <img
        src={photo.url}
        alt={`Photo de ${title}`}
        loading="lazy"
        onError={() => { setReason("l'image n'a pas pu être chargée"); setState('error'); }}
        style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover' }}
      />
      {/* Attribution de l'auteur : exigée par les conditions d'usage de Google. */}
      <figcaption className="px-2.5 py-1 text-[9px] tracking-wide"
        style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}>
        Photo{photo.author ? ' de ' : ' '}
        {photo.author && (photo.authorUri ? (
          <a href={photo.authorUri} target="_blank" rel="noopener noreferrer" className="underline">
            {photo.author}
          </a>
        ) : photo.author)}
        {' · Google'}
      </figcaption>
    </figure>
  );
}
