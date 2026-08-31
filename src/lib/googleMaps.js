const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
// Un Map ID est requis par les marqueurs avancés (AdvancedMarkerElement).
// DEMO_MAP_ID fonctionne sans configuration ; pour un style personnalisé,
// créez un Map ID dans la console Google Cloud et renseignez la variable.
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const hasMapsKey = Boolean(API_KEY);

let loader = null;

/** Charge le SDK Google Maps une seule fois pour toute l'application. */
export function loadGoogleMaps() {
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error('Clé Google Maps absente (VITE_GOOGLE_MAPS_API_KEY).'));
      return;
    }
    if (window.google?.maps?.Map) {
      resolve(window.google.maps);
      return;
    }

    const callbackName = '__carnetGoogleMapsReady';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };

    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: API_KEY,
      v: 'weekly',
      libraries: 'maps,marker,places',
      language: 'fr',
      loading: 'async',
      callback: callbackName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loader = null;
      reject(new Error('Google Maps n’a pas pu être chargé (clé invalide ou API non activée).'));
    };
    document.head.appendChild(script);
  });

  return loader;
}

// Rayon de l'indice de localisation : de quoi couvrir une agglomération et ses
// environs sans écarter un lieu un peu excentré.
const BIAS_RADIUS_M = 50000;

/**
 * Suggestions d'adresses via la nouvelle API Places.
 * `near` : {lat, lng} facultatif, pour privilégier les lieux du coin.
 * Retourne [{ id, main, secondary, fetchPlace }].
 */
export async function suggestPlaces(input, sessionToken, near = null) {
  if (!input.trim()) return [];
  const maps = await loadGoogleMaps();
  const { AutocompleteSuggestion } = await maps.importLibrary('places');

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    language: 'fr',
    // Aucune restriction par pays : un carnet peut aller n'importe où. Quand
    // l'étape a déjà des lieux placés, on donne leur position en indice pour
    // que « Duomo » sur un voyage en Sicile ne remonte pas celui de Milan.
    // `locationBias` reste une préférence : un lieu ailleurs sort quand même.
    ...(near ? { locationBias: { center: near, radius: BIAS_RADIUS_M } } : {}),
  });

  return (suggestions || [])
    .filter((s) => s.placePrediction)
    .map((s) => {
      const p = s.placePrediction;
      return {
        id: p.placeId,
        main: p.mainText?.text || p.text?.text || '',
        secondary: p.secondaryText?.text || '',
        toPlace: () => p.toPlace(),
      };
    });
}

/**
 * Récupère nom, coordonnées et photo d'une suggestion sélectionnée.
 * La photo est demandée dans le même appel que le reste : une fois le lieu
 * choisi, l'illustrer ne coûte alors aucune requête supplémentaire.
 */
export async function resolvePlace(suggestion) {
  const place = suggestion.toPlace();
  // `id` n'est pas un champ à demander : il est toujours porté par l'objet Place.
  await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress', 'photos'] });
  const loc = place.location;
  const photo = firstPhoto(place);
  if (place.id) photoCache.set(`id:${place.id}`, photo);
  return {
    name: place.displayName || suggestion.main,
    address: place.formattedAddress || suggestion.secondary,
    lat: typeof loc?.lat === 'function' ? loc.lat() : loc?.lat,
    lng: typeof loc?.lng === 'function' ? loc.lng() : loc?.lng,
    placeId: place.id || null,
  };
}

/** Jeton de session Places — regroupe la facturation d'une recherche. */
export async function newSessionToken() {
  const maps = await loadGoogleMaps();
  const { AutocompleteSessionToken } = await maps.importLibrary('places');
  return new AutocompleteSessionToken();
}

// ---------------------------------------------------------------------------
// Photos des lieux
// ---------------------------------------------------------------------------
// Google interdit de conserver les URL de photos, qui expirent. Ce qui se
// stocke, en revanche, c'est l'identifiant du lieu (`place_id`) : il est
// stable. L'URL est donc résolue à l'affichage, puis gardée en mémoire le
// temps de la session pour ne pas refacturer le même lieu à chaque ouverture.

// Largeur demandée : de quoi rester net sur un écran dense sans télécharger
// une image de plusieurs méga-octets.
const PHOTO_WIDTH = 900;

// clé → { url, author, authorUri } | null (null = cherché, rien trouvé)
const photoCache = new Map();

/** Première photo d'un objet Place, mise en forme. `null` s'il n'y en a pas. */
function firstPhoto(place) {
  const photo = place?.photos?.[0];
  if (!photo) return null;
  const author = photo.authorAttributions?.[0];
  return {
    url: photo.getURI({ maxWidth: PHOTO_WIDTH }),
    author: author?.displayName || '',
    authorUri: author?.uri || '',
  };
}

/** Photo d'un lieu dont on connaît déjà l'identifiant Google. */
async function photoByPlaceId(placeId) {
  const key = `id:${placeId}`;
  if (photoCache.has(key)) return photoCache.get(key);

  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary('places');
  const place = new Place({ id: placeId });
  await place.fetchFields({ fields: ['photos'] });

  const found = firstPhoto(place);
  photoCache.set(key, found);
  return found;
}

/**
 * Photo d'un lieu qu'on ne connaît que par son nom : une recherche textuelle
 * retrouve le lieu, l'étape et les coordonnées voisines servant à écarter les
 * homonymes. Renvoie aussi l'identifiant trouvé, à conserver en base.
 */
async function photoByName({ title, city, near }) {
  const query = [title, city].filter(Boolean).join(', ');
  const around = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : '';
  const key = `q:${query}|${around}`;
  if (photoCache.has(key)) return photoCache.get(key);

  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: ['photos'],
    maxResultCount: 1,
    language: 'fr',
    ...(near ? { locationBias: { center: near, radius: BIAS_RADIUS_M } } : {}),
  });

  const place = places?.[0];
  const photo = firstPhoto(place);
  const found = place && photo ? { placeId: place.id, ...photo } : null;
  photoCache.set(key, found);
  if (place) photoCache.set(`id:${place.id}`, photo);
  return found;
}

/**
 * Cherche une image illustrant un lieu, par identifiant Google si on l'a,
 * sinon par son nom. Retourne { placeId, url, author, authorUri } ou `null`
 * quand aucune photo n'existe pour ce lieu.
 */
export async function findPlacePhoto({ placeId, title, city, near }) {
  if (!hasMapsKey) return null;

  if (placeId) {
    // Un identifiant devenu invalide ne doit pas priver la fiche d'image :
    // on retombe alors sur la recherche par nom.
    try {
      const photo = await photoByPlaceId(placeId);
      if (photo) return { placeId, ...photo };
    } catch (err) {
      console.error('Lieu Google introuvable, recherche par nom :', err?.message);
    }
  }
  if (!String(title || '').trim()) return null;
  return photoByName({ title, city, near });
}
