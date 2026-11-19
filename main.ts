// Solmar City entry program: copies game/ and screenshots/ into the output
// directory and writes dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts. Runs twice in the grader and must write the same
// bytes both times, so the copy is deterministic: sorted entries, fixed
// file modes, no timestamps in the output.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const root = resolve(import.meta.dirname ?? '.');

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const from = join(src, e.name);
    const to = join(dst, e.name);
    if (e.isDirectory()) copyTree(from, to);
    else if (e.isFile()) cpSync(from, to);
  }
}

function main(): void {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const gameDir = join(root, 'game');
  const shotsDir = join(root, 'screenshots');
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
    throw new Error('main.ts: no game/ directory beside this program');
  }
  copyTree(gameDir, join(outDir, 'game'));
  if (existsSync(shotsDir)) copyTree(shotsDir, join(outDir, 'screenshots'));
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`Solmar City dossier written: ${dossier.length} bytes to ${outDir}`);
}

main();
