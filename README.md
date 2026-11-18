# Solmar City

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/visible-night/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/visible-night/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01)

A sun-soaked 3D open-world crime game for the make.fun GTA 6 bounty. Start broke and on foot at the Safehouse, steal a car, run six story missions, and stay one step ahead of the Solmar PD — from a single star to a helicopter spotlight.

## The city

A seeded procedural city on a 40-unit avenue grid: glass downtown towers, a park with a pond, a beach boardwalk with palms and ocean, a harbour container yard, and a warehouse district. Every facade, road and car is textured from canvas generators — no image files, no network. Golden-hour light, warm fog and a gradient sky with a sun disc give it the early-2000s open-world look.

## Play

- On foot: walk, run, aim with the mouse, shoot (pistol / SMG).
- Driving: arcade handling, handbrake drifts, carjacking, chain explosions.
- Wanted: 5 stars, foot cops, pursuit cars, a police helicopter at 4–5 stars. A Spray & Go repaint clears your heat.
- Missions: 6 story jobs (delivery, harbour run, pickups, taxi fares, warehouse shootout, the bank job) plus taxi fares, vigilante work and 20 hidden packages.
- NPCs: pedestrians keep schedules, flee gunfire, remember what they saw and gossip about it. Rosa (Sundown Beach Bar) and Mack (chop shop) have short branching dialogue.
- Save: progress autosaves at the Safehouse; Continue from the title screen.

## Controls

WASD / arrows move and drive · mouse aim · LMB shoot · Shift run · Space handbrake · E use / enter / buy / save · Q switch weapon · H horn · P / Esc pause · M mute · F fullscreen.

## Files

- `game/index.html` — page, HUD, import map for Three.js
- `game/src/main.js` — boot, fixed-step loop, HUD, save
- `game/src/world.js` — simulation: player, cars, cops, wanted, missions glue
- `game/src/city.js` — procedural layout: roads, districts, landmarks, collision
- `game/src/render.js` — Three.js scene, camera, lighting, merged geometry, characters
- `game/src/textures.js` — procedural canvas textures (facades, asphalt, sand, paint)
- `game/src/models.js` — merged vehicle / character / helicopter builders
- `game/src/sky.js` — gradient sky dome, sun + hemisphere light, day cycle
- `game/src/text.js` — sign boards and glow sprites
- `game/src/juice.js` — particles, tracers, hit-stop, trauma shake, vignette
- `game/src/npcs.js` — schedules, offline memory, gossip, dialogue
- `game/src/missions.js` — the six story missions and side jobs
- `game/src/config.js` — tuning constants (gameplay + graphics)
- `game/src/input.js` — keyboard / mouse / touch
- `game/src/audio.js` — synthesised WebAudio SFX
- `game/src/random.js` — seeded RNG
- `game/src/shots.js` — staged screenshot poses
- `main.ts` — entrypoint: copies the game and writes `dossier.json`
- `serve.ts` — static dev server (`node serve.ts --port 8083`)

## Run it

`node serve.ts --port 8083`, then open http://localhost:8083/ — or add `?shot=cover|drive|title|foot&seed=1` for a staged screenshot pose (`&lowq=1` for the fast software-GL path).

## License

MIT — see LICENSE.
