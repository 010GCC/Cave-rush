# Cave Rush

**Deep Earth Exploration** — pilot a neon drone through a procedurally generated cave. Dodge walls, rocks, stalactites, and enemy waves; collect crystals and power-ups; burn boost fuel and survive as speed ramps each level.

Mobile-first browser game. Touch dashboard on phones; keyboard on desktop.

## Play

- **Live:** [https://010gcc.github.io/Cave-rush/](https://010gcc.github.io/Cave-rush/)
- **Custom domain:** [https://caverush.cc](https://caverush.cc) (when DNS/Pages are configured)

Open the link on your phone for fullscreen play, or on desktop for a centered portrait window.

## Controls

| Action | Touch | Keyboard |
|--------|--------|----------|
| Move | On-screen D-pad (bottom left) | Arrow keys / WASD |
| Fire | FIRE button (bottom right) | Z / F |
| Slow-mo | SLOW button | Shift / S |
| Boost | BOOST button | E / B |
| Start / menus | Tap buttons | Click / Enter |

## Features

- Procedural scrolling cave with tightening gaps per level
- Defender-style drone with multi-weapon firepower (spread, lock-on, bombs)
- Boost fuel system with warning / engine-failure if held too long
- Enemies (scouts & gunships), destructible rocks, ring crystals, power-ups
- Score multiplier, hull lives, level-complete tally cutscenes
- Procedural Web Audio soundtrack that cycles by level
- Hi-score persisted in `localStorage`

## Run locally

No build step — static HTML/JS.

```bash
# Prefer the master branch (or copy game.js from master) for fully offline play:
#   git checkout master   # or download game.js from master
python3 -m http.server 8080
# then open http://localhost:8080
```

> **Note:** On `main`, `game.js` is a thin loader that fetches a pinned copy of the full game from the `master` branch via jsDelivr (API upload size limits). For fully offline/local play, copy `game.js` from `master` into the repo root.

## Project layout

| File | Role |
|------|------|
| `index.html` | Shell, CSS overlays, mobile/desktop viewport sizing |
| `game.js` | Full game on `master`; on `main` a pinned CDN loader until inlined |
| `Claude.md` | Project conventions for AI-assisted development |
| `CNAME` | GitHub Pages custom domain (`caverush.cc`) |

## Viewport / sizing

- **Mobile:** `#game-window` fills the dynamic viewport (`100dvh` / full width) for true fullscreen play, with `viewport-fit=cover` for notched devices.
- **Desktop:** a centered ~9:16 phone frame (max ~710px tall) so the HUD and D-pad stay usable without stretching across ultrawide monitors.
- Canvas resolution follows the container; `index.html` bridges `visualViewport` resize/scroll to `window.resize` so mobile browser chrome show/hide recalculates layout.

## Tech

- Canvas 2D, single-file game logic
- Touch + keyboard input
- Web Audio API (procedural music/SFX)
- No frameworks or bundler

## License

All rights reserved unless otherwise noted by the repository owner.
