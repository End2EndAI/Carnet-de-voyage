import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => fs.readFileSync(path, 'utf8');
const gradle = read('android/app/build.gradle');
const twaManifest = JSON.parse(read('android/twa-manifest.json'));
const strings = read('android/app/src/main/res/values/strings.xml');
const assetLinks = JSON.parse(read('public/.well-known/assetlinks.json'));
const webManifest = JSON.parse(read('public/manifest.webmanifest'));

// La TWA n'embarque pas de code : elle ouvre le site. Si l'une de ces trois
// déclarations diverge, la vérification Digital Asset Links échoue et l'app
// s'ouvre avec la barre d'adresse visible — motif de rejet côté Play Store.
// `bubblewrap update` régénère le projet et peut les désaligner sans bruit.
describe('trusted web activity', () => {
  const host = twaManifest.host;

  it('opens the same host everywhere', () => {
    expect(host).toBeTruthy();
    expect(gradle).toContain(`hostName: '${host}'`);
    expect(twaManifest.webManifestUrl).toBe(`https://${host}/manifest.webmanifest`);
    expect(twaManifest.fullScopeUrl).toBe(`https://${host}/`);
  });

  it('declares that same host as the site it trusts', () => {
    const site = strings.match(/\\"site\\":\s*\\"([^\\]+)\\"/)?.[1];
    expect(site).toBe(`https://${host}`);
  });

  it('publishes an asset link for the package the app declares', () => {
    expect(gradle).toContain(`applicationId "${twaManifest.packageId}"`);
    const statement = assetLinks.find((entry) => entry.target?.namespace === 'android_app');
    expect(statement.target.package_name).toBe(twaManifest.packageId);
    expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
  });
});

describe('web app manifest', () => {
  const maskable = webManifest.icons.filter((icon) => icon.purpose?.includes('maskable'));

  // Une icône maskable est masquée en cercle ou en squircle : ses coins doivent
  // être opaques. Celles marquées `any` ont des coins arrondis transparents,
  // les deux usages ne peuvent donc pas partager le même fichier.
  it('keeps the maskable icon separate from the rounded ones', () => {
    expect(maskable).toHaveLength(1);
    const anySources = webManifest.icons
      .filter((icon) => icon.purpose === 'any')
      .map((icon) => icon.src);
    expect(anySources.length).toBeGreaterThan(0);
    expect(anySources).not.toContain(maskable[0].src);
  });

  it('ships the icons it declares', () => {
    for (const icon of webManifest.icons) {
      expect(fs.existsSync(`public${icon.src}`), `${icon.src} manquant`).toBe(true);
    }
  });

  it('points the Android build at the maskable icon', () => {
    expect(twaManifest.maskableIconUrl).toBe(`https://${twaManifest.host}${maskable[0].src}`);
  });
});

describe('notification delegation', () => {
  // Rien dans le site n'appelle Notification ni push : la permission serait
  // demandée pour rien, et à déclarer au Play Console pour rien.
  it('stays off, with no notification permission requested', () => {
    expect(twaManifest.enableNotifications).toBe(false);
    expect(gradle).toContain('enableNotifications: false');
    const androidManifest = read('android/app/src/main/AndroidManifest.xml');
    expect(androidManifest).not.toContain('POST_NOTIFICATIONS');
  });
});
