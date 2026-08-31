import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/googleMaps.js', () => ({
  hasMapsKey: false,
  MAP_ID: 'DEMO_MAP_ID',
  loadGoogleMaps: vi.fn(() => Promise.reject(new Error('Clé Google Maps absente'))),
  suggestPlaces: vi.fn(),
  resolvePlace: vi.fn(),
  newSessionToken: vi.fn(),
}));
import GoogleMapView from '../src/components/GoogleMapView.jsx';
import PlaceSearch from '../src/components/PlaceSearch.jsx';

describe('Maps fallbacks', () => {
  it('does not render paid Places search without a Maps key', () => {
    const { container } = render(<PlaceSearch onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains why the map is unavailable without a Maps key', () => {
    render(<GoogleMapView pts={[]} sel={null} onSel={() => {}} />);
    expect(screen.getByText(/Carte indisponible/)).toBeInTheDocument();
  });
});
