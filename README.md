[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/visible-night/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/visible-night/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Solmar City

A sun-soaked open-world crime game in the browser, built for the
[make.fun GTA 6 bounty](https://make.fun/c/gta6-01). Fully 3D: a coastal city
you explore on foot and by car, with traffic, pedestrians who keep daily
schedules and remember you, a five-star wanted system, police cars and a
helicopter, and six story missions building to a daylight bank robbery.

## Play it

Serve the `game/` folder with any static server and open `index.html` in
desktop Chrome — no build step, no network requests, everything procedural:

```sh
node serve.ts
# then open http://localhost:8080
```

## What is in the city

- **A living city**: downtown glass towers, a park with a pond, a beach
  boardwalk, a harbour container yard, a warehouse district, and the Safehouse.
- **Drive and steal**: sedans, taxis, trucks and police cruisers with arcade
  handling, handbrake drifts, damage stages, smoke, fire and explosions.
- **People with memory**: pedestrians walk daily routines, flee gunfire,
  gossip about your crimes, and two named characters — Rosa the bartender and
  Mack at the chop shop — talk, remember and deal with you.
- **Heat**: five wanted stars, foot cops, pursuit cars that ram, and a police
  helicopter at four stars. Break line of sight or repaint at Spray & Go.
- **Six jobs**: a chop-shop delivery, a timed harbour run, a two-pickup
  getaway, three taxi fares, a warehouse shootout, and the bank job — plus
  taxi fares, vigilante work and 20 hidden packages on the side.
- **Full game shell**: title screen, HUD with live minimap, day/night cycle,
  synthesized WebAudio (engine, sirens, gunfire, bassline), saves at the
  Safehouse, and coach hints for the first two minutes.

## How it is built

Plain ES modules under `game/src/`, Three.js r187 vendored as
`game/vendor/three.module.min.js`, one import map, no build step. The world
is seeded and deterministic; the same seed always builds the same city.

| File | Job |
| --- | --- |
| `src/main.js` | Boot, fixed-step loop, HUD, menus, saves |
| `src/world.js` | Simulation: player, cars, police, combat, wanted |
| `src/render.js` | Three.js scene, camera, lighting, minimap |
| `src/city.js` | Procedural city layout, roads, collision |
| `src/npcs.js` | Pedestrian schedules, memory, gossip, dialogue |
| `src/missions.js` | Story missions and side jobs |
| `src/sky.js` | Sky dome and day cycle |
| `src/audio.js` | Synthesized sound and music |
| `src/juice.js` | Particles, shake, hit-stop, flashes |
| `src/input.js` | Keyboard and mouse actions |
| `src/config.js` | Tuning constants |
| `src/random.js` | Seeded RNG and math helpers |
| `src/text.js` | Canvas-generated textures |
| `src/shots.js` | Deterministic screenshot staging |

## License

MIT — see [LICENSE](LICENSE).
