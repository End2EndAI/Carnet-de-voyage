import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = await readFile(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
const integrity = await readFile(resolve(process.cwd(), 'supabase/migrations/20260831051000_production_integrity.sql'), 'utf8');

describe('Supabase schema contract', () => {
  it('keeps RLS, sharing, and cascade safeguards in the deployed schema', () => {
    expect(schema).toContain('alter table public.trips enable row level security;');
    expect(schema).toContain('alter table public.ideas enable row level security;');
    expect(schema).toContain('create or replace function public.share_trip(');
    expect(schema).toContain("check (access in ('read', 'write'))");
    expect(schema).toContain('trip_id     uuid not null references public.trips (id) on delete cascade');
    expect(schema).toContain('create policy "ideas_insert"');
    expect(schema).toContain('with check (public.can_write_trip(trip_id));');
  });

  it('keeps database-level validation for direct API access', () => {
    expect(integrity).toContain('trips_date_order');
    expect(integrity).toContain('ideas_lat_range');
    expect(integrity).toContain('revoke all on function public.share_trip');
  });
});
