# Publication sur le Play Store

L'application Android est une **TWA** (Trusted Web Activity) : elle n'embarque
pas de code, elle ouvre `https://ai-simple-voyage-planner.vercel.app` en plein
écran. Le site déployé et l'app publiée doivent donc rester cohérents.

Le domaine est **gravé dans le binaire** (`android/app/build.gradle`,
`android/twa-manifest.json`, `android/app/src/main/res/values/strings.xml`).
En changer impose de republier une version de l'app : arrêtez le domaine
définitif avant la première publication.

## Ce qui doit rester aligné

| Élément | Fichier |
| --- | --- |
| Domaine ouvert par la TWA | `android/app/build.gradle` (`hostName`), `android/twa-manifest.json` |
| Domaine que l'app déclare approuver | `android/app/src/main/res/values/strings.xml` (`assetStatements`) |
| Empreinte de la clé qui signe l'app | `public/.well-known/assetlinks.json` |

Ces trois lignes forment la vérification *Digital Asset Links*. Si l'une ne
correspond pas, l'app s'ouvre en Custom Tab **avec la barre d'adresse visible**
— c'est le motif de rejet le plus courant pour une TWA.

## 1. La clé d'upload

À faire une seule fois. **Perdre cette clé interdit définitivement toute mise à
jour de l'app** : sauvegardez-la hors du poste de travail.

```bash
keytool -genkeypair -v -keystore android/carnet-upload.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Puis, sur la machine de build :

```bash
cp android/keystore.properties.example android/keystore.properties
# renseignez storePassword et keyPassword
```

`android/keystore.properties` et `*.keystore` sont gitignorés. En CI, les mêmes
valeurs se passent par `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`.

## 2. Construire l'AAB

```bash
cd android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Un `versionCode` n'est acceptable qu'une seule fois par envoi. Il vaut 1 par
défaut ; incrémentez-le à chaque publication, sans éditer le fichier :

```bash
./gradlew bundleRelease -PcarnetVersionCode=2 -PcarnetVersionName=1.1.0
```

Les variables `CARNET_VERSION_CODE` et `CARNET_VERSION_NAME` font la même
chose depuis l'environnement.

### Les icônes

`public/icon.svg` est l'icône « any » (coins arrondis) ;
`public/icon-maskable.svg` est la variante maskable, fond plein cadre et motif
dans la zone sûre, dont dérivent `public/icon-maskable-512.png` et les
`android/app/src/main/res/mipmap-*/ic_maskable.png`. Une icône maskable à coins
transparents laisse passer le fond du lanceur sous un masque adaptatif : gardez
les deux séparées si vous retouchez le dessin.

Attention si vous relancez `bubblewrap update` : il régénère le projet Android
depuis `twa-manifest.json` et écrase `strings.xml`. Revérifiez alors les trois
lignes du tableau ci-dessus — `npm test` échoue si elles divergent.

## 3. Le point d'ordre à ne pas rater : l'empreinte

Google **re-signe** votre AAB avec sa propre clé (Play App Signing).
L'empreinte à publier dans `assetlinks.json` est donc celle de Google, pas
celle de votre clé d'upload — et elle n'est connue qu'après le premier envoi.

1. Envoyez l'AAB sur une piste de **test interne**.
2. Play Console → *Test et publication* → *Intégrité de l'app* → *Certificat de
   la clé de signature de l'app* → copiez le SHA-256.
3. Reportez-le dans `public/.well-known/assetlinks.json`. Gardez aussi
   l'empreinte de la clé d'upload dans le même tableau : c'est elle qui vaut
   pour les builds testés localement.
4. Redéployez le site (le fichier part avec `dist/`), puis vérifiez :
   `https://ai-simple-voyage-planner.vercel.app/.well-known/assetlinks.json`.
5. Réinstallez l'app depuis la piste de test : **aucune barre d'adresse ne doit
   apparaître**. Si elle est là, l'empreinte ou le domaine ne correspondent pas.

## 4. La fiche Play Console

À préparer hors du dépôt :

- **Politique de confidentialité** : `https://ai-simple-voyage-planner.vercel.app/confidentialite`
- **Conditions d'utilisation** : `https://ai-simple-voyage-planner.vercel.app/conditions`
- **Suppression du compte** : dans l'app, en bas de la liste des voyages ; par
  le web, `https://ai-simple-voyage-planner.vercel.app/?delete-account=1`
- **Sécurité des données** : compte (adresse e-mail) et contenu utilisateur
  (carnets), transmis à Supabase, Vercel, OpenAI et Google Maps Platform ;
  chiffrés en transit ; suppression possible par l'utilisateur ; ni publicité,
  ni mesure d'audience, ni revente.
- **Contenu généré par IA** : l'app en produit. Le signalement se fait par le
  lien « Signaler » présent sur chaque fiche marquée *suggéré*.
- **Ressources graphiques** : icône 512×512 (`android/store_icon.png`),
  image de bannière 1024×500, au moins deux captures d'écran de téléphone.
- Classification du contenu, public cible, déclaration publicité (aucune).

## Ce que la TWA n'exige pas

Aucun code natif : les obligations liées aux bibliothèques natives (pages
mémoire de 16 Ko) ne s'appliquent pas. `targetSdkVersion 36` est conforme au
niveau d'API exigé.
