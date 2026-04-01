# Cave Rush — Project CLAUDE.md

> This file overrides or extends ~/.claude/CLAUDE.md for this specific project.
> Update this file as the project evolves. It is read every single turn.

---

## Project Overview

- **Game Title:** Cave Rush
- **Genre / Type:** Endless runner / dodge game
- **Status:** Active Development
- **Target Audience:** Casual browser players, mobile-first (touch + keyboard supported)
- **One-liner:** Pilot a drone through a procedurally generated cave, dodging walls, rocks, and enemies while collecting power-ups and crystals.

## Current Sprint / Active Focus

- [ ] Update this section at the start of each session with the active task

> Update this section at the start of each session. It is the most important context for subagents.

---

## Architecture

### Entry Point

- `index.html` — loads canvas, CSS overlay screens (menu/game-over/HUD), and `game.js`

### Core Modules

| File       | Responsibility                                              |
|------------|-------------------------------------------------------------|
| `game.js`  | Everything: game loop, state machine, all classes inline    |
| `index.html` | Canvas setup, overlay screens, HUD, CSS styling           |

> The entire game is a single `game.js` file. All classes (Cave, Drone, enemies, UI, input) live there. There is no `src/` split.

### State Machine

- `MENU` → `PLAYING` → `PAUSED` → `LEVEL_COMPLETE` → `GAME_OVER` → `MENU`
- Level complete runs a tally/countdown cutscene before the next level begins.

---

## Game-Specific Conventions

### Entity Naming

- Player entity: drone (internally managed by the `Drone` class / `G.drone`)
- Enemies: various classes (bats, turrets, etc.) stored in `G.enemies[]`
- Bullets: `G.bullets[]` (player) and `G.eBullets[]` (enemy)
- Power-ups: `G.pups[]`
- Crystals: `G.crystals[]`
- Rocks / rock walls: `G.rocks[]`
- Stalactites: `G.stalas[]`

### Coordinate System

- Origin: top-left (standard canvas)
- Units: pixels
- Canvas size: dynamic — fills `window.innerWidth × window.innerHeight`, recalculated on resize/orientation change
- HUD header reserved: `HUD_H = 54px` at top
- Dashboard panel reserved: bottom `~26% of H` (max 190px), recalculated by `DPad.resize()`
- Drone fixed Y: `DRONE_Y = HUD_H + (PANEL_Y - HUD_H) * 0.60`

### Game Loop

- Target: 60fps via `requestAnimationFrame`
- Delta time: **not used** — speed is in px/frame, not px/second
- The cave scrolls rightward; drone moves within a fixed vertical band

### Config Object

All tunable constants live in `CFG` at the top of `game.js`. Always edit values there, never hardcode magic numbers elsewhere.

Key values:
- `CFG.BASE_SCROLL` — base cave scroll speed (px/frame)
- `CFG.DRONE_SPD` — drone movement speed
- `CFG.LEVEL_DIST` — px scrolled to complete level 1 (increases by `LEVEL_DIST_INC` per level)
- `CFG.MAX_LIVES` — starting lives (5)
- `CFG.FIRE_RATE` — ms between player shots (175)
- `CFG.BOOST_FUEL_MAX` — total boost fuel in ms (30000)

### Collision Detection

- Method: AABB (axis-aligned bounding box) for most entities
- Cave wall collision: drone rect vs. per-segment cave gap bounds
- Pairs: drone ↔ walls, drone ↔ rocks, drone ↔ stalactites, drone ↔ enemies, drone ↔ enemy bullets, player bullets ↔ enemies

---

## Asset Inventory

### Sprites

All graphics are drawn procedurally on canvas — no external image files.

### Audio

No audio system currently implemented.

### Fonts

- UI Font: `'Courier New', monospace` (system font, no external load)

---

## Known Issues / Active Bugs

> Keep this list current. Remove fixed items. Add new ones as discovered.

- [ ] Add known bugs here as discovered

---

## Performance Constraints

- Target devices: mid-range mobile (Android/iOS) and desktop Chrome/Safari
- Canvas: avoid per-frame shadow/blur — currently used sparingly for glow effects only
- No external assets to preload
- All rendering is immediate-mode canvas 2D

---

## Never Do in This Project

- Do not split `game.js` into modules without explicit instruction — the single-file architecture is intentional
- Do not add a physics library — collision and movement are handled manually
- Do not modify `CFG` values without understanding the ripple effect on difficulty scaling
- Do not add `<script>` dependencies to `index.html` without approval
- Do not use `dt` (delta time) — the game loop is frame-rate based, not time-based

---

## Testing Targets

Manual browser testing only — no automated test suite currently.

| Scenario              | How to test                          |
|-----------------------|--------------------------------------|
| Mobile touch controls | Open on phone or Chrome DevTools mobile emulation |
| Resize / orientation  | Rotate device or resize browser window |
| Level progression     | Play through level 1 → 2 transition  |
| Power-up spawning     | Observe `CFG.PU_CHANCE` in action    |

---

## Subagent Task Board

> Use this section to plan parallel work. Update as tasks complete.

### Can Run in Parallel

- [ ] [Task A — independent]
- [ ] [Task B — independent]

### Must Run Serial

- [ ] [Task C — depends on A]

---

## Session Notes

> Running log of decisions, dead ends, and learnings. Append, don't overwrite.

- 2026-04-01 — Created Claude.md from GitHub template, filled in with Cave Rush specifics from reading game.js and index.html
