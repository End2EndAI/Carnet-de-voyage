import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = await readFile(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

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
});
