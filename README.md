# Solmar City

[![make.fun](https://make.fun/badge.svg)](https://make.fun/c/gta6-01) [![Solmar City](https://make.fun/badge-gta6-01.svg)](https://make.fun/c/gta6-01)

**Solmar City** is an open-world crime game in the spirit of GTA 6, built as
static files with Three.js: a sun-soaked coastal city to explore on foot and
by car, traffic and pedestrians, cars to steal and drive, a wanted level with
police cruisers and a helicopter that respond to it, missions and a story,
combat, a HUD with a live minimap, a start screen and autosave — all in one
HTML page with zero network requests.

## The city

Sundown Beach runs along the east edge: sand, boardwalk, palms, the Sundown
Beach Bar run by Rosa Marlow, a lifeguard tower and umbrellas. Downtown is a
grid of streets and towers, including the Bank of Solmar tower. Drive the
causeway at golden hour, steal a sports coupe, take taxi fares, hunt 20
hidden packages, and run jobs for Rosa, Marcus the chop-shop mechanic, and
Dell the ex-cop informant.

## Controls

- **WASD / arrows** — drive or walk (W accelerate, S brake/reverse)
- **Space** — brake / handbrake (brake lights flare)
- **E** — enter or exit a car, talk to people, start jobs
- **Mouse click** — shoot (draws heat and panics pedestrians)
- **H** — horn · **R** — radio · **M** — mute · **P** — pause · **Enter** — start

## Systems

- **Driving:** arcade handling, spinning spoked wheels, brake-light flare,
  headlights, traffic that follows the street grid, a taxi and a sports coupe
  to find.
- **Wanted:** stealing and shooting raise stars; cruisers chase and ram, and
  at 4 stars the police helicopter hunts you with a searchlight. Stay clean
  and out of sight to cool off.
- **Missions:** three story jobs plus repeatable taxi fares and a 20-package
  hunt, with a gold beacon and minimap marker on the current objective.
- **Life:** pedestrians walk the sidewalks and the boardwalk, flee gunfire,
  and gawk at crashes; named NPCs greet you, remember favors, and change
  their lines after you help them.
- **Feel:** camera shake, hit-stop, FOV punch, particle bursts, synthesized
  engine hum, sirens and a synth radio — no audio files.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Progress autosaves at
the Beach Bar and resumes on your next visit.

## Tech

Three.js r187 vendored locally (`game/vendor/three.module.min.js`), plain ES
modules, procedural canvas textures, no build step, no network. Dossier text
is built with the kit's `vendor/makefun-game.ts` via `main.ts`.
