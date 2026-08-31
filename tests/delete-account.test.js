import { beforeEach, describe, expect, it, vi } from 'vitest';
import { response } from './helpers/vercel-response.js';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), deleteUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));

import handler from '../api/delete-account.js';

describe('delete-account handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    mock.createClient
      .mockReturnValueOnce({ auth: { getUser: mock.getUser } })
      .mockReturnValueOnce({ auth: { admin: { deleteUser: mock.deleteUser } } });
  });

  it('requires a DELETE request with a valid bearer token', async () => {
    const method = response();
    await handler({ method: 'POST' }, method);
    expect(method).toMatchObject({ statusCode: 405, body: { error: 'Méthode non autorisée.' } });

    const unauthenticated = response();
    await handler({ method: 'DELETE', headers: {} }, unauthenticated);
    expect(unauthenticated).toMatchObject({ statusCode: 401, body: { error: 'Authentification requise.' } });
  });

  it('deletes only the user identified by the verified token', async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mock.deleteUser.mockResolvedValue({ error: null });
    const res = response();

    await handler({ method: 'DELETE', headers: { authorization: 'Bearer token' } }, res);

    expect(mock.getUser).toHaveBeenCalledWith('token');
    expect(mock.deleteUser).toHaveBeenCalledWith('user-1');
    expect(res).toMatchObject({ statusCode: 200, body: { ok: true } });
  });
});
