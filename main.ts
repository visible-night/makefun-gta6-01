// Solmar City hand-in (Node 22, standard library only). The game itself is the
// static files under game/; this program only gathers them. It copies game/ and
// screenshots/ into the output directory and writes dossier.json there with the
// kit's buildDossier, using the scorer's own caps so a build that passes here
// is the build the gate sees. Run it as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and the target is /output.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Solmar City entry written to ${outDir} (${dossier.length} bytes of dossier).`);
// v5: report the dossier text size against the 163,840-byte cap, so a graphics pass that grows the sources warns loudly instead of silently truncating.
const _dossierJson = JSON.parse(Buffer.from(dossier).toString('utf8')); // buildDossier returns a Uint8Array, not a string
const _textBytes = Buffer.byteLength(_dossierJson.text ?? '', 'utf8');
console.log(`Dossier text: ${_textBytes} / 163840 bytes.${_textBytes > 160000 ? ' WARNING: over the 160000 self-cap — trim sources before submitting.' : ''}`);
