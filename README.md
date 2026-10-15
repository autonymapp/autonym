<div align="center">

<img src="press/branding/icon-512.png" width="88" alt="" />

# Autonym

**AI roleplay & story-writing, without the technical mess.**

A structured, compendium-first desktop app for solo roleplayers and authors, built on
[OpenRouter](https://openrouter.ai). MIT licensed.

### 🔗 [**autonym.app**](https://autonym.app) — features, screenshots, and the Windows download

[![License: MIT](https://img.shields.io/badge/license-MIT-8b93ff)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-c792ea)](https://autonym.app)

</div>

---

Autonym runs two ways: as a Windows desktop app (Electron) and as an installable web app (PWA)
at **[autonym.app](https://autonym.app)**. This README covers running the source and contributing.

## Running from source

```bash
npm install
npm run dev
```

On first launch, go to **Settings** and paste an OpenRouter API key (get one at
[openrouter.ai/keys](https://openrouter.ai/keys)) — it's encrypted at rest via OS-level credential
encryption and never leaves the Electron main process.

## Building a Windows installer

```bash
npm run build:win
```

Output lands in `dist/`.

## Testing

```bash
npm run typecheck
npm test
```

## Architecture notes

- All OpenRouter API calls and the API key live only in the Electron **main** process
  (`src/main/openrouter.ts`); the renderer talks to it over IPC (`src/preload/index.ts`) and never
  sees the key or makes network calls directly.
- Data is stored as a single JSON file in the app's userData folder (`src/main/db.ts`) — simple and
  dependency-free for a personal-scale app; no native compilation required.
- `src/shared/assemble.ts` is the only place that turns structured character/persona/lorebook/mood
  fields into the actual prompt sent to the model.
- `src/shared/characterInheritance.ts` resolves a linked character variant's blank fields against
  its base character before assembly, so downstream consumers never need to know Universes exist.
- Purely clerical, non-creative tasks (wiki/text structuring, thesaurus lookups, journal
  summaries) are hardcoded to a fixed, hidden model (`CLERICAL_MODEL_ID` in
  `src/shared/presets.ts`) rather than using the Act's chosen model — quality on those tasks
  shouldn't depend on what the user picked for creative writing.
- The web app swaps the Electron bridge for a browser adapter (`src/web/`): data lives in
  IndexedDB with optional Supabase sync, and the OpenRouter key is kept in the browser.
- `npm run build:web` builds the PWA into `docs/`, which GitHub Pages serves at
  [autonym.app](https://autonym.app) (see `src/renderer/public/CNAME`). `docs/` is generated:
  rebuild and commit it rather than editing it by hand.

## License

MIT — see [LICENSE](LICENSE).
