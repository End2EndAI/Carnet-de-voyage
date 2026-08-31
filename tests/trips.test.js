import { describe, expect, it } from 'vitest';
import { formatDates, normalizeCities, slugify } from '../src/lib/trips.js';

describe('trip helpers', () => {
  it('makes stable, unique city ids', () => {
    expect(normalizeCities([
      { label: ' Séoul ', native: ' 서울 ', note: ' 3 nuits ' },
      { label: 'Séoul' },
      { label: '   ' },
    ])).toEqual([
      { id: 'seoul', label: 'Séoul', native: '서울', note: '3 nuits' },
      { id: 'seoul-2', label: 'Séoul', native: '', note: '' },
    ]);
  });

  it('normalizes accents, punctuation, empty labels, and long labels', () => {
    expect(slugify('Île de Ré!')).toBe('ile-de-re');
    expect(slugify('***')).toBe('etape');
    expect(slugify('a'.repeat(50))).toHaveLength(40);
  });

  it('formats dates without a timezone shift', () => {
    expect(formatDates({ start_date: '2026-09-24', end_date: '2026-10-10' }))
      .toBe('24 sept. 2026 → 10 oct. 2026');
    expect(formatDates({ start_date: '2026-09-24' })).toBe('à partir du 24 sept. 2026');
    expect(formatDates({})).toBe('dates à définir');
  });
});
