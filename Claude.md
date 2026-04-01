# [Game Title] — Project CLAUDE.md

> This file overrides or extends ~/.claude/CLAUDE.md for this specific project.
> Update this file as the project evolves. It is read every single turn.

-----

## Project Overview

- **Game Title:** [Title]
- **Genre / Type:** [e.g. runner, puzzle, platformer, tower defense]
- **Status:** [Planning / Active Development / Polishing / Shipped]
- **Target Audience:** [e.g. casual browser players, desktop, mobile-first]
- **One-liner:** [What is this game in one sentence]

## Current Sprint / Active Focus

- [ ] [What we are actively building right now]
- [ ] [Next thing after that]

> Update this section at the start of each session. It is the most important context for subagents.

-----

## Architecture

### Entry Point

- `index.html` — loads all scripts, sets up canvas or DOM root

### Core Modules

|File             |Responsibility                       |
|-----------------|-------------------------------------|
|`src/game.js`    |Main game loop, state machine        |
|`src/input.js`   |Keyboard, mouse, touch input handling|
|`src/renderer.js`|All draw calls, canvas context       |
|`src/entities/`  |Player, enemies, projectiles, etc.   |
|`src/systems/`   |Physics, collision, scoring, audio   |
|`src/ui.js`      |HUD, menus, overlays                 |
|`src/utils.js`   |Shared helpers, math, constants      |


> Add rows as the project grows. Remove placeholder rows that don’t exist yet.

### State Machine

- `MENU` → `PLAYING` → `PAUSED` → `GAME_OVER` → `MENU`
- Add states here as they are introduced.

-----

## Game-Specific Conventions

### Entity Naming

- Player entity: `player`
- Enemy base class: `Enemy`
- Projectiles: `[type]Projectile` (e.g. `laserProjectile`)

### Coordinate System

- Origin: top-left (standard canvas)
- Units: pixels
- Canvas size: [e.g. 800x450, 16:9] — document actual dimensions here

### Game Loop

- Target: 60fps via `requestAnimationFrame`
- Delta time: passed to all update functions as `dt` in seconds
- Fixed vs. variable timestep: [document your choice here]

### Collision Detection

- Method: [AABB / circle / spatial grid — document what’s in use]
- Collision pairs to check: [list them as the game grows]

-----

## Asset Inventory

### Sprites

|Asset     |File               |Dimensions|Notes|
|----------|-------------------|----------|-----|
|Player    |`assets/player.png`|64x64     |     |
|[Add more]|                   |          |     |

### Audio

|Asset     |File                 |Trigger    |Notes|
|----------|---------------------|-----------|-----|
|Jump      |`assets/sfx/jump.wav`|player jump|     |
|[Add more]|                     |           |     |

### Fonts

- UI Font: [name, source, fallback]

-----

## Known Issues / Active Bugs

> Keep this list current. Remove fixed items. Add new ones as discovered.

- [ ] [Bug description + reproduction steps]

-----

## Performance Constraints

- Target devices: [e.g. mid-range Android, desktop Chrome]
- Canvas operations: avoid per-frame shadow/blur effects
- Sprite sheets preferred over individual image files
- Audio: preload all sfx at init, not on trigger

-----

## Never Do in This Project

- [Project-specific anti-patterns go here]
- Do not modify the game loop structure without discussing it first
- Do not add a physics library without approval — we are handling this manually

-----

## Testing Targets

> Suggest tests alongside new logic. Mirror `/src` structure in `/tests`.

|Module        |Test File            |Coverage Status        |
|--------------|---------------------|-----------------------|
|`src/utils.js`|`tests/utils.test.js`|[none / partial / good]|
|[Add more]    |                     |                       |

-----

## Subagent Task Board

> Use this section to plan parallel work. Update as tasks complete.

### Can Run in Parallel (fork model)

- [ ] [Task A — independent]
- [ ] [Task B — independent]

### Must Run Serial (mutating / dependent)

- [ ] [Task C — depends on A]
- [ ] [Task D — depends on C]

-----

## Session Notes

> Running log of decisions, dead ends, and learnings. Append, don’t overwrite.

- [Date] — [Decision or finding]
