// Solmar City, a gta6-01 entry (Node 22, standard library only). The game is
// the game/ folder beside this file: plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library, no network request).
// This program hands the entry in: it copies game/ and screenshots/ to /output
// and writes /output/dossier.json, the summary the judge reads, using the
// vendored make.fun library.
//
// The game is a complete open-world crime game in a sun-soaked coastal city:
// steal and drive cars, traffic and pedestrians, a wanted system with police
// chases, six story missions plus taxi and vigilante side jobs, a HUD with a
// minimap, a day cycle, synthesised sound and a save. Keep 3 or 4 PNG or JPEG
// screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsDir = join(root, 'screenshots');

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the rest refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes: game/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
//
// Say where the entry landed: the grader's log is the only trace of a run.
console.log('Solmar City entry written to', outDir);
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
