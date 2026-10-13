# Last Vertex: Idle Defense

A retro, terminal-styled idle tower-defense game for phones: one triangle — the last vertex — holds the perimeter. It is a single-page web app (PWA): open it in a mobile browser and add it to the home screen to play full-screen and offline.

## Play / host on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
3. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/` (for example a repo named `last-vertex`).
4. On the phone, open that link and add it to the home screen (Android Chrome: menu → *Add to Home screen* / *Install app*; iPhone Safari: Share → *Add to Home Screen*).

Updates: push again. Players get the new version the next time they open the game while online.

Everything is served as plain static files; there is nothing to build on the server. `.nojekyll` tells GitHub Pages to publish the files exactly as they are.

## Files

| Path | What it is |
|---|---|
| `index.html` | The game (generated — edit `src/index.src.html`, then run the build) |
| `src/index.src.html`, `src/fonts/` | Game source and fonts |
| `src/lang/<code>.json` | Translations (tr, es, pt), keyed by the English text; `node tools/i18n-keys.js` lists missing ones |
| `sw.js` | Service worker: offline play and updates (cache name is set by the build) |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `favicon-32.png` | Home-screen app info and icons |
| `splash/` | iPhone launch images |
| `privacy.html` | Privacy policy (linked in Settings and the store listing) |
| `store/` | Google Play listing text, store art and the release guide (`store/README.md`) |
| `android/`, `capacitor.config.json`, `assets/` | The Android app (Capacitor) and the logo its icons are made from; `node tools/build-app.js debug\|release` (`www/` is a generated copy) |
| `tools/` | Build, balance simulation and icon scripts (not used by the game at runtime) |
| `_docs/balance.html` | Generated balance reference |

## Development (needs Node.js 18+)

```
npm run build      # src/index.src.html → index.html, updates sw.js
npm run sim        # long-term balance simulation (see tools/sim.js for modes)
npm run balance    # regenerate _docs/balance.html
npm install        # once, for the icon script
npm run icons      # regenerate icons and launch images
```

Gift codes (Settings → REDEEM GIFT CODE): `npm run code -- --gems 100 --coins 5000 --tattoo nova:3 --theme all --days 7`.
Codes are signed with `keys/gift-private.pem`, which stays on this computer only (`keys/` is git-ignored). Back it up: without it no new codes can be made.

