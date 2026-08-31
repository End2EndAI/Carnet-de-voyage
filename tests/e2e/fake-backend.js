const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const token = (user) => {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.test`;
};

export async function fakeBackend(page, { access = 'owner', trips = [], ideas = [] } = {}) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', role: 'authenticated' };
  const state = { trips: structuredClone(trips), ideas: structuredClone(ideas), shares: [] };

  await page.route('**/auth/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      return json(route, { access_token: token(user), refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user });
    }
    if (path.endsWith('/logout')) return json(route, {}, 204);
    return json(route, user);
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const method = request.method();

    if (table === 'trip_members') {
      const rows = url.searchParams.has('trip_id')
        ? state.shares
        : access === 'owner' ? [] : state.trips.map((trip) => ({ trip_id: trip.id, access }));
      return json(route, rows);
    }
    if (table === 'share_trip') {
      const body = request.postDataJSON();
      state.shares = [{ user_id: 'member-1', email: body.target_email, access: body.target_access }];
      return json(route, null);
    }

    if (table === 'trips') {
      if (method === 'GET') return json(route, state.trips);
      if (method === 'POST') {
        const body = request.postDataJSON();
        const trip = { id: 'trip-created', created_at: new Date().toISOString(), ...body };
        state.trips.unshift(trip);
        return json(route, trip, 201);
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        state.trips = state.trips.filter((trip) => trip.id !== id);
        state.ideas = state.ideas.filter((idea) => idea.trip_id !== id);
        return json(route, null, 204);
      }
    }

    if (table === 'ideas') {
      if (method === 'GET') {
        const tripId = url.searchParams.get('trip_id')?.replace('eq.', '');
        return json(route, state.ideas.filter((idea) => !tripId || idea.trip_id === tripId));
      }
      if (method === 'POST') {
        const body = request.postDataJSON();
        const rows = (Array.isArray(body) ? body : [body]).map((idea, index) => ({
          id: `idea-${state.ideas.length + index + 1}`, position: 0, ...idea,
        }));
        state.ideas.push(...rows);
        return json(route, Array.isArray(body) ? rows : rows[0], 201);
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const patch = request.postDataJSON();
        const index = state.ideas.findIndex((idea) => idea.id === id);
        state.ideas[index] = { ...state.ideas[index], ...patch };
        return json(route, state.ideas[index]);
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        state.ideas = state.ideas.filter((idea) => idea.id !== id);
        return json(route, null, 204);
      }
    }

    return json(route, []);
  });

  await page.route('**/api/generate-trip', (route) => json(route, { error: 'mocked unavailable' }, 503));
  await page.route('**/api/generate-idea', (route) => json(route, { fields: {
    kr: '', type: 'Culture', note: '', desc: 'Description générée.', zone: '', avis: '', when: '',
  }, researched: true }));

  return state;
}

export async function signIn(page) {
  await page.goto('/');
  await page.getByPlaceholder('vous@exemple.com').fill('owner@example.com');
  await page.getByPlaceholder('6 caractères minimum').fill('secret');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.getByRole('heading', { name: 'Mes voyages' }).waitFor();
}

export const trip = (overrides = {}) => ({
  id: 'trip-1', user_id: '11111111-1111-4111-8111-111111111111', title: 'Sicile', native_name: '',
  start_date: null, end_date: null, cities: [{ id: 'catane', label: 'Catane', native: '', note: '' }],
  answers: {}, created_at: '2026-01-01T00:00:00Z', ...overrides,
});
