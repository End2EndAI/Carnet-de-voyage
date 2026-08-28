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
      region: 'KR',
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

/**
 * Suggestions d'adresses via la nouvelle API Places.
 * Retourne [{ id, main, secondary, fetchPlace }].
 */
export async function suggestPlaces(input, sessionToken) {
  if (!input.trim()) return [];
  const maps = await loadGoogleMaps();
  const { AutocompleteSuggestion } = await maps.importLibrary('places');

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    // Le carnet ne couvre que la Corée du Sud : on restreint les résultats.
    includedRegionCodes: ['kr'],
    language: 'fr',
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

/** Récupère nom + coordonnées d'une suggestion sélectionnée. */
export async function resolvePlace(suggestion) {
  const place = suggestion.toPlace();
  await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] });
  const loc = place.location;
  return {
    name: place.displayName || suggestion.main,
    address: place.formattedAddress || suggestion.secondary,
    lat: typeof loc?.lat === 'function' ? loc.lat() : loc?.lat,
    lng: typeof loc?.lng === 'function' ? loc.lng() : loc?.lng,
  };
}

/** Jeton de session Places — regroupe la facturation d'une recherche. */
export async function newSessionToken() {
  const maps = await loadGoogleMaps();
  const { AutocompleteSessionToken } = await maps.importLibrary('places');
  return new AutocompleteSessionToken();
}
