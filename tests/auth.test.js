import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
  getSession: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
}));

vi.mock('../src/lib/supabase.js', () => ({
  hasSupabase: true,
  supabase: { auth: mock },
}));

import { cleanAuthHash, getSession, isPasswordRecovery, signIn, signUp } from '../src/lib/auth.js';

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('normalizes credentials and translates login errors', async () => {
    mock.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(signIn(' USER@Example.COM ', 'secret')).resolves.toBe('Adresse ou mot de passe incorrect.');
    expect(mock.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret' });
  });

  it('reports email confirmation when sign-up has no session', async () => {
    mock.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(signUp(' USER@Example.COM ', 'secret')).resolves.toEqual({ error: null, needsConfirmation: true });
    expect(mock.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.com' }));
  });

  it('reads sessions and cleans confirmation tokens from the hash', async () => {
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await expect(getSession()).resolves.toEqual({ user: { id: 'u1' } });
    window.history.replaceState({}, '', '/#access_token=secret&type=recovery');
    expect(isPasswordRecovery()).toBe(true);
    cleanAuthHash();
    expect(window.location.hash).toBe('');
  });
});
