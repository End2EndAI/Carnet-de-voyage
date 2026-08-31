import { beforeEach, describe, expect, it, vi } from 'vitest';
import { response } from './helpers/vercel-response.js';

const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class OpenAI { constructor() { this.responses = { create: mock.create }; } },
}));

import handler from '../api/generate-idea.js';

const fields = { kr: '', type: 'Musée', note: '', desc: 'Texte.', zone: 'Centre', avis: '', when: '' };

describe('generate-idea handler', () => {
  beforeEach(() => {
    mock.create.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('rejects non-POST and a missing title', async () => {
    const method = response();
    await handler({ method: 'GET' }, method);
    expect(method.statusCode).toBe(405);
    const invalid = response();
    await handler({ method: 'POST', body: {} }, invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it('continues when web research fails and returns structured fields', async () => {
    mock.create
      .mockRejectedValueOnce(new Error('web unavailable'))
      .mockResolvedValueOnce({ output_text: JSON.stringify(fields) });
    const res = response();
    await handler({ method: 'POST', body: { title: 'Duomo', lat: '37.5', lng: '15.1', city: 'Catane' } }, res);

    expect(res).toMatchObject({ statusCode: 200, body: { fields, researched: false } });
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(mock.create.mock.calls[1][0]).toMatchObject({
      model: 'gpt-5.6-luna',
      text: expect.objectContaining({ format: expect.objectContaining({ strict: true }) }),
    });
  });

  it('returns a safe upstream error when formatting fails', async () => {
    mock.create.mockResolvedValueOnce({ output_text: 'notes' }).mockRejectedValueOnce(new Error('provider failed'));
    const res = response();
    await handler({ method: 'POST', body: { title: 'Duomo' } }, res);
    expect(res).toMatchObject({ statusCode: 502, body: { error: 'provider failed' } });
  });
});
