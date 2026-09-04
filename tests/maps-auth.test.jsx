import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ce fichier exerce le vrai module `googleMaps.js` : c'est lui qui installe le
// rappel `gm_authFailure` appelé par Google quand il refuse la clé.
vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
const { default: GoogleMapView } = await import('../src/components/GoogleMapView.jsx');

describe('clé Google refusée', () => {
  beforeEach(() => {
    window.google = undefined;
  });

  afterEach(() => {
    delete window.gm_authFailure;
  });

  it('replaces the map with an explanation instead of leaving Google’s grey panel', async () => {
    render(<GoogleMapView pts={[]} sel={null} onSel={() => {}} />);
    // Le script est injecté au montage : Google appelle ce rappel s'il refuse.
    await vi.waitFor(() => expect(typeof window.gm_authFailure).toBe('function'));

    window.gm_authFailure();

    expect(await screen.findByText(/Google a refusé la clé/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher ma position' })).not.toBeInTheDocument();
  });
});
