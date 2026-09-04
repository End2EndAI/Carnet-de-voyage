import fs from 'node:fs';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/googleMaps.js', () => ({
  hasMapsKey: true,
  MAP_ID: 'DEMO_MAP_ID',
  loadGoogleMaps: vi.fn(() => Promise.resolve()),
  onMapsAuthFailure: vi.fn(() => () => {}),
}));
import GoogleMapView from '../src/components/GoogleMapView.jsx';

// SDK Google Maps minimal : le composant n'a besoin que de poser des objets et
// de bouger la caméra. On observe ce qu'il en fait.
const created = { markers: [], circles: [] };
let map;

class FakeMap {
  constructor(el, options) {
    Object.assign(this, options);
    map = this;
  }
  setCenter(center) { this.center = center; }
  setZoom(zoom) { this.zoom = zoom; }
  fitBounds() {}
}

class FakeMarker {
  constructor(options) { Object.assign(this, options); created.markers.push(this); }
  addListener() {}
}

class FakeCircle {
  constructor(options) { Object.assign(this, options); created.circles.push(this); }
  setCenter(center) { this.center = center; }
  setRadius(radius) { this.radius = radius; }
  setMap(value) { this.map = value; }
}

const PTS = [{ id: 'a', lat: 45.07, lng: 7.68, title: 'Mole Antonelliana', city: 'turin' }];

let geolocation;

beforeEach(() => {
  created.markers = [];
  created.circles = [];
  map = null;
  window.google = {
    maps: {
      Map: FakeMap,
      InfoWindow: class { addListener() {} setContent() {} open() {} close() {} },
      LatLngBounds: class { extend() {} getCenter() { return { lat: 45.07, lng: 7.68 }; } },
      Circle: FakeCircle,
      marker: { AdvancedMarkerElement: FakeMarker },
    },
  };
  geolocation = { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() };
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
});

afterEach(() => {
  delete window.google;
});

const fix = (lat, lng, accuracy) => ({ coords: { latitude: lat, longitude: lng, accuracy } });

async function renderMap() {
  const { unmount } = render(<GoogleMapView pts={PTS} sel={null} onSel={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Afficher ma position' });
  await waitFor(() => expect(map).not.toBeNull());
  return { button, unmount };
}

describe('localisation sur la carte', () => {
  it('places the device on the map and centres on the first fix', async () => {
    const user = userEvent.setup();
    const { button } = await renderMap();

    await user.click(button);
    expect(screen.getByText('Recherche de votre position…')).toBeInTheDocument();

    const [onPosition] = geolocation.watchPosition.mock.calls[0];
    onPosition(fix(45.06, 7.69, 30));

    await waitFor(() => expect(created.markers).toHaveLength(2));
    const me = created.markers.at(-1);
    expect(me.title).toBe('Ma position');
    expect(me.position).toEqual({ lat: 45.06, lng: 7.69 });
    expect(created.circles.at(-1).radius).toBe(30);
    expect(map.center).toEqual({ lat: 45.06, lng: 7.69 });
  });

  it('follows the device without stealing the map after the first fix', async () => {
    const user = userEvent.setup();
    const { button } = await renderMap();
    await user.click(button);
    const [onPosition] = geolocation.watchPosition.mock.calls[0];

    onPosition(fix(45.06, 7.69, 30));
    await waitFor(() => expect(created.markers).toHaveLength(2));
    map.center = 'déplacée à la main';

    onPosition(fix(45.05, 7.7, 12));
    await waitFor(() => expect(created.markers.at(-1).position).toEqual({ lat: 45.05, lng: 7.7 }));
    // Un seul point : le marqueur est déplacé, pas recréé.
    expect(created.markers).toHaveLength(2);
    expect(created.circles.at(-1).radius).toBe(12);
    expect(map.center).toBe('déplacée à la main');
  });

  it('explains a refusal and stops asking', async () => {
    const user = userEvent.setup();
    const { button } = await renderMap();
    await user.click(button);

    const [, onError] = geolocation.watchPosition.mock.calls[0];
    onError({ code: 1 });

    expect(await screen.findByText(/Localisation refusée/)).toBeInTheDocument();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(created.markers).toHaveLength(1);
  });

  it('hides the device again when the tracking is switched off', async () => {
    const user = userEvent.setup();
    const { button } = await renderMap();
    await user.click(button);
    geolocation.watchPosition.mock.calls[0][0](fix(45.06, 7.69, 30));
    await waitFor(() => expect(created.markers).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Arrêter la localisation' }));
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    await waitFor(() => expect(created.markers.at(-1).map).toBeNull());
    expect(created.circles.at(-1).map).toBeNull();
  });

  it('stops the device tracking when the map goes away', async () => {
    const user = userEvent.setup();
    const { button, unmount } = await renderMap();
    await user.click(button);

    unmount();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
  });

  it('reports an unsupported device instead of a silent failure', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    const { button } = await renderMap();

    await user.click(button);
    expect(await screen.findByText(/Localisation indisponible/)).toBeInTheDocument();
  });
});

// Le site interdit caméra et micro par en-tête ; la carte, elle, a besoin de la
// position. Un `geolocation=()` vide refuse la permission à tout le monde, le
// site compris : le navigateur répond « refusée » sans même demander, et la
// fonction est morte en production alors que tout passe en local.
describe('en-têtes du site', () => {
  const headers = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers
    .find((rule) => rule.source === '/(.*)').headers;
  const policy = headers.find((header) => header.key === 'Permissions-Policy').value;

  it('lets the site itself use geolocation, and nobody else', () => {
    expect(policy).toContain('geolocation=(self)');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
  });
});
