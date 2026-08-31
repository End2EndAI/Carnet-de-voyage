import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  listTrips: vi.fn(), createTrip: vi.fn(), loadIdeas: vi.fn(), insertIdeas: vi.fn(),
  getSession: vi.fn(), onAuthChange: vi.fn(), deleteAccount: vi.fn(), fetch: vi.fn(),
}));

vi.mock('../src/lib/supabase.js', () => ({ hasSupabase: true }));
vi.mock('../src/lib/auth.js', () => ({
  getSession: mock.getSession, onAuthChange: mock.onAuthChange, signOut: vi.fn(), deleteAccount: mock.deleteAccount,
  cleanAuthHash: vi.fn(), isPasswordRecovery: () => false,
}));
vi.mock('../src/lib/trips.js', () => ({
  listTrips: mock.listTrips, createTrip: mock.createTrip, deleteTrip: vi.fn(),
  normalizeCities: (cities) => cities.map((city) => ({ id: city.label.toLowerCase(), ...city })),
  formatDates: () => 'dates à définir',
}));
vi.mock('../src/lib/store.js', () => ({
  loadIdeas: mock.loadIdeas, saveIdea: vi.fn(), removeIdea: vi.fn(), insertIdeas: mock.insertIdeas,
}));
vi.mock('../src/lib/googleMaps.js', () => ({ hasMapsKey: false }));

import App from '../src/App.jsx';

describe('main trip workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    mock.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } });
    mock.onAuthChange.mockReturnValue(() => {});
    mock.listTrips.mockResolvedValue({ trips: [], error: null });
    mock.createTrip.mockResolvedValue({ trip: {
      id: 'trip-1', title: 'Sicile', cities: [{ id: 'sicile', label: 'Sicile', native: '', note: '' }], access: 'owner',
    }, error: null });
    mock.loadIdeas.mockResolvedValue({ ideas: [], error: null });
    mock.insertIdeas.mockResolvedValue({ ideas: [], error: null });
    mock.fetch.mockRejectedValue(new Error('IA indisponible'));
    vi.stubGlobal('fetch', mock.fetch);
  });

  it('creates an empty manual trip when AI generation is unavailable', async () => {
    render(<App />);
    await screen.findByRole('button', { name: '+ Nouveau voyage' });
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau voyage' }));
    fireEvent.change(screen.getByPlaceholderText('Corée du Sud, Sicile, Nord du Portugal…'), { target: { value: 'Sicile' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le carnet' }));

    await waitFor(() => expect(mock.createTrip).toHaveBeenCalled());
    expect(mock.createTrip).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sicile', userId: 'user-1' }));
    expect(mock.insertIdeas).not.toHaveBeenCalled();
    expect(await screen.findByText(/Le carnet a été créé, mais les suggestions/)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Sicile' })).toHaveLength(2);
  });

  it('returns to the trip list on browser Back', async () => {
    mock.listTrips.mockResolvedValue({ trips: [{
      id: 'trip-1', title: 'Sicile', cities: [{ id: 'sicile', label: 'Sicile', native: '', note: '' }], access: 'owner',
    }], error: null });
    render(<App />);

    fireEvent.click((await screen.findAllByRole('button', { name: /Sicile/ }))[0]);
    expect(window.history.state.carnetTripId).toBe('trip-1');

    fireEvent.popState(window, { state: { carnetTripId: null } });
    expect(await screen.findByRole('heading', { name: 'Mes voyages' })).toBeInTheDocument();
  });

  it('opens account deletion from its public web path', async () => {
    window.history.replaceState({}, '', '/?delete-account=1');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Supprimer mon compte ?' })).toBeInTheDocument();
  });
});
