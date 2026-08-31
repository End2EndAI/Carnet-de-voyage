import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/lib/supabase.js', () => ({ supabase: query }));

import { insertIdeas, loadIdeas, saveIdea } from '../src/lib/store.js';

describe('idea store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps database names to the UI model when loading', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{
      id: 'idea-1', city: 'catane', title: 'Duomo', verdict: 'oui', origin: 'suggestion',
      description: 'Une cathédrale.', when_note: 'Matin', lat: 37.5, lng: 15.1, favori: true,
    }], error: null });
    const eq = vi.fn(() => ({ order }));
    query.from.mockReturnValue({ select: vi.fn(() => ({ eq })) });

    await expect(loadIdeas('trip-1')).resolves.toEqual({ ideas: [{
      id: 'idea-1', city: 'catane', title: 'Duomo', verdict: 'oui', origin: 'suggestion',
      desc: 'Une cathédrale.', when: 'Matin', lat: 37.5, lng: 15.1, favori: true,
    }], error: null });
    expect(eq).toHaveBeenCalledWith('trip_id', 'trip-1');
    expect(order).toHaveBeenCalledWith('position', { ascending: true });
  });

  it('does not overwrite position when editing an idea', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'idea-1', city: 'catane', title: 'Duomo' }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    query.from.mockReturnValue({ update });

    await saveIdea('trip-1', { id: 'idea-1', city: 'catane', title: 'Duomo', desc: 'Texte', position: undefined });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ description: 'Texte' }));
    expect(update.mock.calls[0][0]).not.toHaveProperty('position');
  });

  it('returns early for an empty batch', async () => {
    await expect(insertIdeas('trip-1', [])).resolves.toEqual({ ideas: [], error: null });
    expect(query.from).not.toHaveBeenCalled();
  });
});
