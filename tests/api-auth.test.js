import { beforeEach, describe, expect, it, vi } from 'vitest';
import { response } from './helpers/vercel-response.js';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mock.createClient(...args),
}));

describe('AI API authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    mock.getUser.mockReset();
    mock.createClient.mockReset().mockReturnValue({ auth: { getUser: mock.getUser } });
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'publishable-key';
  });

  it('rejects anonymous requests before they can use the AI routes', async () => {
    const { requireUser } = await import('../api/auth.js');
    const res = response();
    await expect(requireUser({ headers: {} }, res)).resolves.toBeNull();
    expect(res).toMatchObject({ statusCode: 401, body: { error: 'Authentification requise.' } });
  });

  it('accepts a verified Supabase bearer token', async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const { requireUser } = await import('../api/auth.js');
    const res = response();
    await expect(requireUser({ headers: { authorization: 'Bearer session-token' } }, res))
      .resolves.toEqual({ id: 'user-1' });
    expect(mock.getUser).toHaveBeenCalledWith('session-token');
  });
});
