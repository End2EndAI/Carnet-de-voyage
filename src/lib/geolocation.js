// Position de l'appareil. Isolé ici pour que la carte n'ait à connaître ni les
// codes d'erreur du navigateur, ni les options de précision.

// Une position récente évite de rallumer le GPS pour rien ; au-delà, mieux
// vaut un relevé neuf, un voyageur se déplace.
const OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 };

const MESSAGES = {
  1: 'Localisation refusée. Autorisez-la dans les réglages du navigateur.',
  2: 'Position indisponible : aucun signal de localisation.',
  3: 'La localisation a mis trop de temps à répondre.',
};

const UNSUPPORTED = 'Localisation indisponible sur cet appareil.';

/** Message lisible pour une erreur `GeolocationPositionError`. */
export function geolocationMessage(err) {
  return MESSAGES[err?.code] || UNSUPPORTED;
}

/**
 * Suit la position de l'appareil jusqu'à l'appel de la fonction retournée.
 * `onPosition` reçoit { lat, lng, accuracy } à chaque relevé, `onError` un
 * message déjà traduit. Les deux peuvent être appelés plusieurs fois : le
 * navigateur affine la position au fil des relevés.
 */
export function watchPosition(onPosition, onError) {
  if (!navigator.geolocation) {
    onError(UNSUPPORTED);
    return () => {};
  }

  let id;
  const watch = (options, onFailure) => {
    id = navigator.geolocation.watchPosition(
      ({ coords }) =>
        onPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      onFailure,
      options,
    );
  };

  // Dans la TWA Android, la haute précision demande un point GPS : sans vue du
  // ciel le fournisseur se déclare indisponible aussitôt et coupe le suivi
  // (POSITION_UNAVAILABLE). Un second essai en précision réduite passe par le
  // Wi-Fi et les antennes, ce qui répond à l'intérieur.
  watch(OPTIONS, (err) => {
    if (err?.code !== 2) {
      onError(geolocationMessage(err));
      return;
    }
    navigator.geolocation.clearWatch(id);
    watch({ ...OPTIONS, enableHighAccuracy: false }, (retryErr) =>
      onError(geolocationMessage(retryErr)),
    );
  });

  return () => navigator.geolocation.clearWatch(id);
}
