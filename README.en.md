<div align="center">

<img src="docs/assets/android-atlas.jpg" alt="word-atlas-android: the atlas grid" width="32%">　<img src="docs/assets/android-word.jpg" alt="Word card" width="32%">　<img src="docs/assets/android-today.jpg" alt="Today" width="32%">

# word-atlas-android

**Word Atlas in your pocket — a fully offline Android build.**

7,298 IELTS words · original illustrations · bundled UK & US speech · zero permissions · works with no network

[![Code: MIT](https://img.shields.io/badge/Code-MIT-17283B?style=flat-square)](LICENSE)
[![Dataset: CC BY 4.0](https://img.shields.io/badge/Dataset-CC_BY_4.0-AD5038?style=flat-square)](CONTENT_LICENSE.md)
![APK: ~1.0 GB](https://img.shields.io/badge/APK-~1.0_GB-2F5D50?style=flat-square)
![Permissions: none](https://img.shields.io/badge/Permissions-none-2F5D50?style=flat-square)
[![Upstream](https://img.shields.io/badge/Upstream-designfuchen%2Fword--atlas-17283B?style=flat-square&logo=github)](https://github.com/designfuchen/word-atlas)

**This repository**: <https://github.com/H1DDENADM1N/word-atlas-android>
**Upstream**: <https://github.com/designfuchen/word-atlas>

[简体中文](README.md)

</div>

---

## What this is

A fork of [word-atlas](https://github.com/designfuchen/word-atlas) that does exactly one thing: **packs the same app into a fully offline Android APK**.

The vocabulary, illustrations, recordings, examples and review algorithm all come from upstream — not a single entry was changed. What changed is the shell: how it is built, how data is loaded, what speaks when there is no recording, and a handful of problems that only appear once the app lives on a phone.

Upstream is web-first: it runs in a browser and pulls media over the network. This fork puts the same front end inside an Android WebView, opens it over `file://`, and replaces every place that reaches for the network or for a system component. Install once; aeroplane mode and underground tunnels make no difference afterwards.

## How it differs from upstream word-atlas

In one line: **same content, different runtime.** Upstream is about learning the words; this repository is about making it run on a phone with no network, no server and no system speech pack.

| | **word-atlas** (upstream) | **word-atlas-android** (this repo) |
| :--- | :--- | :--- |
| Form | Web app + open dataset | Android APK (same front end inside) |
| Runtime | A browser on the hosted site or `npm run dev` | Android WebView over `file:///android_asset/www/index.html` |
| Network | Required; media is fetched and may be cached | **None**: no `<uses-permission>`, including `INTERNET` |
| Local server | Vite dev server / static host | No server, no listening port |
| Data loading | `fetch()` of sharded JSON | Inlined at build time into `atlas-embed/data.js` |
| Fallback speech | Browser `speechSynthesis` / system TTS | Bundled Kokoro-82M via sherpa-onnx |
| Save & share | Browser download | Saved to Download/Word Atlas, then the system share sheet |
| Themes | Light / dark / system | Adds the aurora and starlight night skies, three English faces, and fixes "follow system" inside a WebView |
| Word card | One transcription line | UK and US side by side; words in examples open a lookup popover |
| Size | ~1 GB of assets in the repo | APK of about **1004 MB** |
| Updating | `git pull` / the site updates itself | Rebuild and reinstall (a new signing key needs an uninstall) |
| Toolchain | Node + Vite | Plus JDK 17 and the Android SDK, **no Gradle** |

### Three hard guarantees

- **It cannot reach the network.** The manifest declares no permissions at all. Without `INTERNET` the kernel refuses to create sockets for this UID; there is no code path around it. Cleartext traffic is off and a network security config trusts system CAs only.
- **There is no server.** The page is opened from `assets/www` over `file://`, with images and audio referenced relatively. Nothing listens on a port.
- **Nothing is downloaded at runtime.** The index, 73 word shards and 24 sound cues are inlined; 7,298 illustrations, 7,298 thumbnails and 22,905 recordings ship as files. There is not a single `fetch` at runtime.

No accounts, no analytics, no third-party SDKs.

### Added for the phone

- **Bundled speech.** Only 1,011 words have a recording for their second example; the other 6,287 used to fall back to system TTS, which is silence on a phone without an English voice. They are now synthesised by the bundled Kokoro-82M voice, pre-rendered before you tap.
- **Share cards work.** Under `file://` every document is its own opaque origin, so `drawImage` taints the canvas and `toBlob()` hands back `null`. Illustrations are now read as `data:` URLs, and the native layer opens the system share sheet afterwards (a WebView has no `navigator.share({files})`).
- **The back button has layers.** Close the lookup popover, then the word card, then the previous page, and only then leave the app.
- **Themes follow the phone.** A WebView answers `prefers-color-scheme` from the app's own theme, which is why "follow system" used to stay dark on a light phone; the native layer now reports `Configuration.uiMode`.
- **Import and clear work.** With no `WebChromeClient`, `confirm()` silently returns `false` and the file picker never opens. `onJsConfirm` and `onShowFileChooser` fixed both.

Full implementation notes, size breakdown and per-bug write-ups: **[docs/android.md](docs/android.md)** (Chinese).

## What stays the same

| | |
| :--- | :--- |
| Entries | **7,298**, CEFR A1–C2, 19 topics |
| Examples | **14,596** with Chinese translations |
| Illustrations | **7,298** at 512 px WebP, plus thumbnails |
| Recordings | **22,905**: UK, US and example narration |
| Review | TS-FSRS spaced repetition, adjustable retention |
| Screens | Today, atlas, word card, WebGL2 word galaxy, four practice modes, typing, backup export/import |
| Privacy | Local-first, no account, progress stays on the device |

Content provenance is unchanged too: text and illustrations were generated for the project with AI, speech with ElevenLabs, checked automatically but **not reviewed entry by entry**. This is not an official IELTS list and promises no score gain.

## Install

The APK is about 1 GB and is not committed (see `.gitignore`). Either check [Releases](https://github.com/H1DDENADM1N/word-atlas-android/releases), or build it below.

```bash
adb install -r word-atlas-offline.apk
```

Android 7.0 (API 24) or newer; arm64 devices are fastest; about **2.5 GB** of free space to install.

## Build from source

Requires **Node.js 20+**, **JDK 17** and the Android SDK (`platforms;android-34`, `build-tools;34.0.0`). No Gradle, no Android Studio.

```bash
git clone --depth 1 https://github.com/H1DDENADM1N/word-atlas-android.git
cd word-atlas-android
npm ci

# Once: fetch the speech runtime and voice (~540 MB, SHA-256 checked, not committed)
python3 scripts/android/fetch_tts.py

export ANDROID_HOME=$HOME/.android-sdk
export JAVA_HOME=/path/to/jdk-17

python3 scripts/android/build_apk.py     # → word-atlas-offline.apk
```

The script runs `vite build` with the Android config (relative paths, a classic IIFE bundle), generates the inlined data, then `aapt2` → `javac` → `d8` → assets and `lib/<abi>/*.so` → `zipalign` → `apksigner`.

The plain web build is still upstream's:

```bash
npm run dev      # http://localhost:5188
npm test
npm run build
```

## Size

| | |
| :--- | ---: |
| Illustrations (512 px WebP) | 203 MB |
| Thumbnails | 88 MB |
| Recordings | 426 MB |
| Word data | 6.9 MB |
| Sound cues and music | 4.4 MB |
| ONNX Runtime + JNI (arm64, x86_64) | 55 MB |
| Kokoro-82M voice + espeak tables | 353 MB |
| Bundle, fonts, icons | ~1 MB |
| **APK** | **~1004 MB** |

To slim it down: ship only `thumb/`, transcode the audio, build a single ABI, or switch back to Piper (`fetch_tts.py --voice piper`, saves ~290 MB with clearly worse quality).

## Known limits

- Cold start is a little slower: the inlined data is parsed from the APK on first paint.
- 1004 MB is the direct cost of putting every asset in the APK.
- Bundled speech loads in ~0.9 s and takes ~3.6 s for a 7.8 s sentence. Taps are instant because the sentence is pre-rendered as soon as the card appears; tapping immediately after opening the page is not.
- Speech is only a fallback: the 22,905 recordings always win.
- `android/keystore/` holds a self-signed development key (password `wordatlas`). Use your own for real releases — changing it means installed copies cannot be upgraded in place.
- Content tracks upstream, including its mistakes.

## Open dataset

| | |
| :--- | :--- |
| Entries | [JSON](data/word-atlas.json) · [CSV](data/word-atlas.csv) |
| Schema | [docs/dataset.md](docs/dataset.md) |
| Illustrations | [public/atlas/img/](public/atlas/img/) |
| Recordings | [public/atlas/audio/](public/atlas/audio/) |

## Contributing

- Android shell, build or APK issues → [this repository](https://github.com/H1DDENADM1N/word-atlas-android/issues).
- Vocabulary corrections → an issue here is fine; they can be passed upstream.
- Please include the **word ID, reproduction steps and expected result**. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License and credit

| | |
| :--- | :--- |
| Application code | [MIT](LICENSE) |
| Vocabulary, illustrations and word recordings | [CC BY 4.0](CONTENT_LICENSE.md), credit “Word Atlas contributors（词光）” |
| Kokoro-82M, sherpa-onnx | Apache-2.0 |

The app and all of its content were made and open-sourced by [@designfuchen](https://github.com/designfuchen) in [designfuchen/word-atlas](https://github.com/designfuchen/word-atlas). This fork is derived from its `main` at `99c00767` and only adds the offline Android packaging. The credit is upstream's; the bugs in the shell are ours.
