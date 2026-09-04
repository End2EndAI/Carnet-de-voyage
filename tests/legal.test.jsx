import fs from 'node:fs';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LegalLinks from '../src/components/LegalLinks.jsx';
import { CONTACT_EMAIL, PRIVACY_URL, TERMS_URL, reportIdeaUrl } from '../src/lib/legal.js';

describe('legal links', () => {
  it('points to the pages served outside the SPA, reachable without an account', () => {
    render(<LegalLinks />);
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', PRIVACY_URL);
    expect(screen.getByRole('link', { name: 'Conditions' })).toHaveAttribute('href', TERMS_URL);
  });
});

describe('reportIdeaUrl', () => {
  it('prefills a mail identifying the reported card', () => {
    const url = reportIdeaUrl({ id: 'idea-7', title: 'Duomo di Catania' }, 'Sicile');
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
    const body = decodeURIComponent(new URL(url).search.match(/body=([^&]*)/)[1]);
    expect(body).toContain('Duomo di Catania');
    expect(body).toContain('Sicile');
    expect(body).toContain('idea-7');
  });

  it('stays usable for an idea that has no id or title yet', () => {
    const body = decodeURIComponent(reportIdeaUrl({}, null).match(/body=([^&]*)/)[1]);
    expect(body).toContain('(sans titre)');
    expect(body).toContain('(non enregistrée)');
  });
});

describe('legal pages are served outside the SPA', () => {
  const routes = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites;
  const pages = [[PRIVACY_URL, 'confidentialite'], [TERMS_URL, 'conditions']];

  it.each(pages)('routes %s before the catch-all that returns index.html', (url, name) => {
    const catchAll = routes.findIndex((route) => route.source === '/(.*)');
    const page = routes.findIndex((route) => route.source === url);
    expect(page).toBeGreaterThanOrEqual(0);
    expect(page).toBeLessThan(catchAll);
    expect(routes[page].destination).toBe(`/${name}.html`);
  });

  it.each(pages)('ships %s in public/ with the contact address', (_url, name) => {
    const html = fs.readFileSync(`public/${name}.html`, 'utf8');
    expect(html).toContain(CONTACT_EMAIL);
  });
});
