import { beforeEach, describe, expect, it, vi } from 'vitest';
import { response } from './helpers/vercel-response.js';

const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class OpenAI { constructor() { this.responses = { create: mock.create }; } },
}));
vi.mock('../api/auth.js', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
  text: (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '',
}));

import handler from '../api/generate-trip.js';

describe('generate-trip handler', () => {
  beforeEach(() => {
    mock.create.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('rejects non-POST requests and a missing destination', async () => {
    const method = response();
    await handler({ method: 'GET' }, method);
    expect(method).toMatchObject({ statusCode: 405, body: { error: 'Méthode non autorisée.' } });

    const invalid = response();
    await handler({ method: 'POST', body: { answers: {} } }, invalid);
    expect(invalid).toMatchObject({ statusCode: 400, body: { error: 'La destination est requise.' } });
  });

  it('keeps explicitly requested cities and removes generated extras', async () => {
    mock.create.mockResolvedValue({ output_text: JSON.stringify({
      title: 'Italie', native_name: '',
      cities: [
        { label: 'Palermo', native: '', note: '2 nuits' },
        { label: 'Rome', native: '', note: '2 nuits' },
      ],
      ideas: [],
    }) });
    const res = response();
    await handler({ method: 'POST', body: { answers: { destination: 'Sicile', cities: 'Palermo, Catane' } } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.trip.cities).toEqual([
      { label: 'Palermo', native: '', note: '2 nuits' },
      { label: 'Catane', native: '', note: '' },
    ]);
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-luna',
      text: expect.objectContaining({ format: expect.objectContaining({ strict: true }) }),
    }));
  });

  it('returns a safe upstream error for malformed model output', async () => {
    mock.create.mockResolvedValue({ output_text: '{not json' });
    const res = response();
    await handler({ method: 'POST', body: { answers: { destination: 'Sicile' } } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('La génération est temporairement indisponible.');
  });
});
