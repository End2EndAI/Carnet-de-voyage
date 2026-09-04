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

## 0. Les outils, une fois pour toutes

Le projet Android est dans le dépôt : rien à générer, `bubblewrap` n'est pas
nécessaire pour construire. Il faut en revanche, sur le poste de build :

- un **JDK 17 ou plus** (`java -version`) — le plugin Android 8.9 l'exige.
  `brew install --cask temurin@17`, ou le JDK fourni par Android Studio ;
- le **SDK Android** avec la plateforme 36. Le plus simple est Android Studio ;
  sinon `brew install --cask android-commandlinetools` puis
  `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"` ;
- de dire à Gradle où il est, si `ANDROID_HOME` n'est pas déjà exporté :
  `echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties`
  (gitignoré).

Toutes les commandes de build se lancent **depuis `android/`** : c'est là
qu'est `gradlew`, pas à la racine du dépôt.

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

## 2. Construire l'AAB (ce qui s'envoie au Play Store)

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

### Un APK signé, pour essayer sur un téléphone

Le Play Store n'accepte que l'AAB ; un APK sert à installer soi-même, sans
passer par le magasin. Même clé, même configuration de signature :

```bash
cd android && ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Vérifier que la signature est bien celle attendue, puis installer :

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

Sans `android/keystore.properties` (ni variables d'environnement), la
configuration de signature reste vide et la tâche release échoue : c'est voulu,
plutôt qu'un binaire signé avec la clé de debug. `./gradlew assembleDebug`
reste disponible pour un essai rapide.

Attention : un APK signé par la clé d'upload n'est pas celui que le Play Store
distribuera. Le magasin resigne avec la clé de *Play App Signing*, dont
l'empreinte est celle qui doit figurer dans
`public/.well-known/assetlinks.json`. Un APK installé à la main peut donc
afficher la barre d'adresse alors que la version du magasin ne l'affichera pas
— sauf à ajouter aussi l'empreinte de la clé d'upload à `assetlinks.json`.

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
  ni mesure d'audience, ni revente. La position affichée sur la carte reste sur
  l'appareil, le temps de l'affichage : elle n'est ni enregistrée ni transmise,
  donc pas « collectée » au sens du formulaire.
- **Contenu généré par IA** : l'app en produit. Le signalement se fait par le
  lien « Signaler » présent sur chaque fiche marquée *suggéré*.
- **Ressources graphiques** : icône 512×512 (`android/store_icon.png`),
  image de bannière 1024×500, au moins deux captures d'écran de téléphone.
- Classification du contenu, public cible, déclaration publicité (aucune).

## La localisation dans l'application Android

Le bouton « ma position » de la carte a besoin d'une permission Android : dans
une TWA, Chrome ne donne la position à la page que si l'application la délègue.
La délégation est activée (`features.locationDelegation` dans
`android/twa-manifest.json`) et repose sur quatre déclarations solidaires, que
`tests/android-twa.test.js` vérifie ensemble :

| Où | Quoi |
| --- | --- |
| `android/twa-manifest.json` | `features.locationDelegation.enabled` — ce que relit `bubblewrap update` |
| `android/app/build.gradle` | `com.google.androidbrowserhelper:locationdelegation` |
| `AndroidManifest.xml` | l'activité `locationdelegation.PermissionRequestActivity` |
| `DelegationService.java` | `registerExtraCommandHandler(new LocationDelegationExtraCommandHandler())` |

La permission `ACCESS_FINE_LOCATION` n'est pas écrite dans notre manifeste :
elle vient de celui de la bibliothèque, fusionné à la compilation. Elle
apparaîtra donc dans la liste des autorisations de la fiche Play, et Android la
demandera à l'utilisateur au premier appui sur le bouton.

Côté Play Console, le formulaire « Sécurité des données » ne change pas : la
position est traitée sur l'appareil et n'est envoyée nulle part, elle n'est donc
pas « collectée » au sens du formulaire. Il faut en revanche republier
l'application : la délégation est du code natif, elle n'arrive pas par une mise
à jour du site.

## Ce que la TWA n'exige pas

Aucun code natif : les obligations liées aux bibliothèques natives (pages
mémoire de 16 Ko) ne s'appliquent pas. `targetSdkVersion 36` est conforme au
niveau d'API exigé.
