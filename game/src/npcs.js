// Pedestrians with daily schedules, Smallville-lite offline memory, gossip and
// branching dialogue for two named NPCs. No LLM: every line is authored content.
import { makeRng, dist2, clamp } from './random.js';
import { roadPath } from './city.js';

const FIRST = ['Ana', 'Ben', 'Cleo', 'Dario', 'Elena', 'Felix', 'Gita', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Leo', 'Mara', 'Nico', 'Olga', 'Paco', 'Rita', 'Sam', 'Tara', 'Vic'];
const BARKS = {
  greet: ['Hey.', 'Morning.', 'Nice day.', 'Watch where you walk.', 'Hey there.'],
  flee: ['Run!', 'Help!', 'Call the cops!', 'He\'s got a gun!', 'Get out of here!'],
  crime: ['Did you see that?', 'The cops are coming.', 'That was crazy.'],
  gossip: ['Heard about the maniac?', 'Stay away from that guy.', 'Trouble follows him.'],
  work: ['Almost done for today.', 'Another shift, another dollar.', 'This place never sleeps.'],
};
// v5: pedestrians are animated render-side — render.js swings limbs from distance travelled, so this file only owns schedules, memory and dialogue, never meshes.
export function createPeds(city, seed, count) {
  const rng = makeRng(seed + 777);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const home = { x: rng.pick([-140, -100, -60, -20, 20, 60, 100, 140]) + rng.range(-8, 8), z: rng.pick([-140, -100, -60, -20, 20, 60, 100, 140]) + rng.range(-8, 8) };
    const work = rng.chance(0.5)
      ? { x: rng.pick([-40, 0, 40]) + rng.range(-8, 8), z: rng.pick([-40, 0, 40]) + rng.range(-8, 8) }
      : { x: 176 + rng.range(-4, 4), z: rng.range(-60, 120) };
    const leisure = rng.chance(0.5) ? { x: rng.range(-160, -85), z: rng.range(-160, -85) } : { x: 178, z: rng.range(-40, 100) };
    peds.push({
      id: i, name: FIRST[i % FIRST.length], kind: 'crowd',
      x: home.x, z: home.z, angle: rng.range(0, 6.28), speed: 0,
      state: 'walk', home, work, leisure, slot: '', path: [], pathIdx: 0,
      affinity: 0, fear: 0, knows: false, barkCd: rng.range(0, 4), lastBark: '',
      shirt: rng.pick([0xc96f4a, 0x4a7dc9, 0x6fc94a, 0xc9b84a, 0x9a4ac9, 0x4ac9b8, 0xd8d8d8]),
      skin: rng.pick([0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0]),
      decideT: rng.range(0, 0.4), fleeT: 0, fleeX: 0, fleeZ: 0, mem: [],
    });
  }
  return peds;
}
// --- Memory stream (named NPCs): recency + importance + relevance retrieval ---
export function memNode(desc, importance, created, tags, kind = 'observation', evidence = []) {
  return { desc, importance, created, last: created, tags, kind, evidence };
}
function norm(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi <= lo) return vals.map(() => 0.5);
  return vals.map((v) => (v - lo) / (hi - lo));
}
export function retrieve(mem, queryTags, n = 5, now = 0) {
  if (!mem.length) return [];
  const rec = mem.map((m, i) => Math.pow(0.995, mem.length - 1 - i));
  const imp = mem.map((m) => m.importance);
  const rel = mem.map((m) => {
    const shared = m.tags.filter((t) => queryTags.includes(t)).length;
    return shared / Math.max(1, m.tags.length);
  });
  const [nr, ni, nrel] = [norm(rec), norm(imp), norm(rel)];
  const scored = mem.map((m, i) => ({ m, s: 0.5 * nr[i] + 3 * ni[i] + 2 * nrel[i] }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, n);
  top.forEach(({ m }) => { m.last = now; }); // recall refreshes memory
  return top.map(({ m }) => m);
}
export function reflect(npc, now) {
  const recent = npc.mem.slice(-100);
  const pressure = recent.reduce((s, m) => s + m.importance, 0);
  if (pressure < 150) return null;
  npc.pressure = 0;
  const insight = npc.insights.find((ins) => !npc.mem.some((m) => m.desc === ins.desc)
    && ins.evidence.every((e) => npc.mem.some((m) => m.tags.includes(e))));
  if (!insight) return null;
  const node = memNode(insight.desc, insight.importance, now, insight.tags, 'reflection', insight.evidence);
  npc.mem.push(node);
  if (npc.mem.length > 200) npc.mem.splice(0, npc.mem.length - 200);
  return node;
}
// --- Named NPCs with dialogue graphs (short lines: text counts toward the dossier cap) ---
export const NAMED_DEFS = [
  {
    id: 'rosa', name: 'Rosa', role: 'Bartender', x: 176, z: 60, shirt: 0xc94a6f, skin: 0xe8b88a,
    seeds: [
      ['Rosa runs the Sundown Beach Bar. Her regulars keep the place alive.', 6, ['bar', 'regulars']],
      ['She once chased a thief out with a mop. Nobody steals from Rosa.', 8, ['thief', 'bar']],
    ],
    insights: [
      { desc: 'The newcomer tips well and never starts trouble. A good regular.', importance: 7, tags: ['player', 'trust'], evidence: ['player'] },
      { desc: 'That one brings the cops to my door. Bad for business.', importance: 8, tags: ['player', 'cops'], evidence: ['crime'] },
    ],
  },
  {
    id: 'mack', name: 'Mack', role: 'Chop-shop contact', x: -120, z: 120, shirt: 0x4a4a4a, skin: 0xc98a5a,
    seeds: [
      ['Mack strips cars at the chop shop. Cash only, no questions.', 6, ['cars', 'shop']],
      ['He knows every fence in Solmar City.', 5, ['fences', 'city']],
    ],
    insights: [
      { desc: 'The kid delivers clean cars on time. Reliable.', importance: 7, tags: ['player', 'trust'], evidence: ['player'] },
      { desc: 'That driver is hot. Cops follow him everywhere.', importance: 8, tags: ['player', 'cops'], evidence: ['crime'] },
    ],
  },
];
const DIALOGUE = {
  rosa: {
    start: { text: (S) => S.flags.rosaMet ? 'Back again. What can I do for you?' : 'New face. Welcome to the Sundown. I\'m Rosa.',
      choices: [
        { text: 'A drink, please. ($10)', to: 'drink', cond: (S) => S.player.cash >= 10 },
        { text: 'Any work around here?', to: 'work' },
        { text: 'Just passing through.', to: 'bye' },
      ] },
    drink: { text: () => 'On the house next time. Stay out of trouble.',
      effect: (S) => { S.player.cash -= 10; S.player.hp = Math.min(100, S.player.hp + 25); bump(S, 'rosa', 5, 'player'); },
      choices: [{ text: 'Thanks, Rosa.', to: 'bye' }] },
    work: { text: () => 'Mack at the chop shop always needs drivers. And the bank? Forget I said anything.',
      effect: (S) => { S.flags.heardBank = true; },
      choices: [{ text: 'Good to know.', to: 'bye' }] },
    bye: { text: () => 'Take care out there.', end: true },
  },
  mack: {
    start: { text: (S) => S.flags.mackMet ? 'Back for more? Cars don\'t strip themselves.' : 'You must be the new driver. I\'m Mack.',
      choices: [
        { text: 'What do you need?', to: 'job' },
        { text: 'Sell me an SMG. ($500)', to: 'smg', cond: (S) => S.player.cash >= 500 && !S.player.hasSmg },
        { text: 'Not today.', to: 'bye' },
      ] },
    job: { text: () => 'Bring me a car, any car, and I pay cash. The fancier, the better. Start with whatever you can grab.',
      choices: [{ text: 'Deal.', to: 'bye' }] },
    smg: { text: () => 'She sprays fast. Don\'t point her at anyone I know.',
      effect: (S) => { S.player.cash -= 500; S.player.hasSmg = true; S.player.ammo.smg = 120; S.player.weapon = 'smg'; bump(S, 'mack', 5, 'player'); },
      choices: [{ text: 'Pleasure doing business.', to: 'bye' }] },
    bye: { text: () => 'Drive safe. Or don\'t. I get paid either way.', end: true },
  },
};
function bump(S, id, affinity, tag) {
  const n = S.named.find((x) => x.id === id);
  if (!n) return;
  n.affinity = clamp(n.affinity + affinity, -100, 100);
  n.mem.push(memNode(`The player ${tag === 'player' ? 'did business with' : 'was seen by'} ${n.name}.`, 5, S.time, ['player', tag]));
}
export function createNamed() {
  return NAMED_DEFS.map((d) => ({
    ...d, kind: 'named', state: 'work', angle: Math.PI, speed: 0,
    affinity: 0, fear: 0, knows: false, barkCd: 0, lastBark: '', path: [], pathIdx: 0,
    home: { x: d.x, z: d.z }, work: { x: d.x, z: d.z }, leisure: { x: d.x, z: d.z }, slot: 'work',
    decideT: 0, fleeT: 0, fleeX: 0, fleeZ: 0, pressure: 0,
    mem: d.seeds.map(([desc, imp, tags]) => memNode(desc, imp, 0, tags)),
    insights: d.insights,
  }));
}
export function startDialogue(S, npcId) {
  const graph = DIALOGUE[npcId];
  if (!graph) return null;
  S.flags[npcId === 'rosa' ? 'rosaMet' : 'mackMet'] = true;
  const npc = S.named.find((x) => x.id === npcId);
  if (npc) npc.mem.push(memNode(`The player talked to ${npc.name}.`, 4, S.time, ['player', 'talk']));
  return { npcId, nodeId: 'start', graph };
}
export function dialogueNode(S, dlg) {
  const node = dlg.graph[dlg.nodeId];
  return {
    text: typeof node.text === 'function' ? node.text(S) : node.text,
    choices: (node.choices || []).filter((c) => !c.cond || c.cond(S)),
    end: !!node.end,
  };
}
export function dialogueChoose(S, dlg, idx) {
  const view = dialogueNode(S, dlg);
  const choice = view.choices[idx];
  if (!choice) return dlg;
  const next = dlg.graph[choice.to];
  if (next && next.effect) next.effect(S);
  if (next && next.end) return null;
  return { ...dlg, nodeId: choice.to };
}
// --- Crowd behaviour: schedules, flee, gossip, barks ---
function slotFor(hours) {
  if (hours < 8 || hours >= 22) return 'home';
  if (hours < 17) return 'work';
  return 'leisure';
}
function slotTarget(p) { return p[p.slot]; }
export function bark(S, ped, trigger, force = false) {
  if (ped.barkCd > 0 && !force) return;
  const pool = BARKS[trigger] || BARKS.greet;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (line === ped.lastBark) line = pool[(pool.indexOf(line) + 1) % pool.length];
  ped.lastBark = line; ped.barkCd = 4 + Math.random() * 4;
  S.lastBark = { name: ped.name, text: line, t: 0 };
}
export function updatePeds(S, dt) {
  const px = S.player.x, pz = S.player.z;
  const hour = S.time % 24;
  for (const p of S.peds) {
    p.barkCd = Math.max(0, p.barkCd - dt);
    p.decideT -= dt;
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      const dx = p.x - p.fleeX, dz = p.z - p.fleeZ, d = Math.hypot(dx, dz) || 1;
      p.angle = Math.atan2(dx / d, dz / d);
      p.speed = 5.2;
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
      p.state = 'flee';
      if (p.fleeT <= 0) { p.state = 'walk'; p.path = []; }
      continue;
    }
    if (p.decideT <= 0) {
      p.decideT = 0.3 + Math.random() * 0.3; // staggered 3 Hz decisions
      const slot = slotFor(hour);
      if (slot !== p.slot) {
        p.slot = slot;
        const t = slotTarget(p);
        p.path = roadPath(p.x, p.z, t.x, t.z);
        p.pathIdx = 0;
      }
      // Gossip: spread knowledge of the player's crimes on contact.
      if (!p.knows && S.rep > 20) {
        for (const q of S.peds) {
          if (q !== p && q.knows && dist2(p.x, p.z, q.x, q.z) < 9) {
            p.knows = true; p.fear = Math.min(100, p.fear + 10);
            break;
          }
        }
      }
      // Greet the player when close and calm.
      if (dist2(p.x, p.z, px, pz) < 36 && p.fear < 40) {
        if (p.knows && Math.random() < 0.3) bark(S, p, 'gossip');
        else if (Math.random() < 0.25) bark(S, p, 'greet');
      }
    }
    // Walk the schedule path.
    if (p.path && p.pathIdx < p.path.length) {
      const wp = p.path[p.pathIdx];
      const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2) { p.pathIdx++; }
      else {
        const target = Math.atan2(dx / d, dz / d);
        let diff = target - p.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.angle += diff * Math.min(1, dt * 6);
        p.speed = 1.7;
        p.x += Math.sin(p.angle) * p.speed * dt;
        p.z += Math.cos(p.angle) * p.speed * dt;
        p.state = 'walk';
      }
    } else {
      p.speed = 0; p.state = p.slot === 'work' ? 'work' : 'idle';
      if (p.slot === 'work' && Math.random() < dt * 0.05) bark(S, p, 'work');
    }
  }
  // Named NPCs stand at their posts; they react to crimes and reflect.
  for (const n of S.named) {
    n.barkCd = Math.max(0, n.barkCd - dt);
    if (S.events.some((e) => e.type === 'gunshot' && dist2(n.x, n.z, e.x, e.z) < 625)) {
      n.fear = Math.min(100, n.fear + 15);
      n.mem.push(memNode('Gunfire near my place. The player was close by.', 7, S.time, ['crime', 'gunfire']));
      bark(S, n, 'flee', true);
    }
    const insight = reflect(n, S.time);
    if (insight && dist2(n.x, n.z, px, pz) < 400) S.lastBark = { name: n.name, text: insight.desc, t: 0 };
  }
}
// A crime the crowd can witness: nearby peds flee, remember, and spread the word.
export function witnessCrime(S, x, z, radius, repGain) {
  S.rep = Math.min(100, S.rep + repGain);
  for (const p of S.peds) {
    if (dist2(p.x, p.z, x, z) < radius * radius) {
      p.knows = true;
      p.fear = Math.min(100, p.fear + 30);
      p.fleeX = x; p.fleeZ = z; p.fleeT = 3 + Math.random() * 2;
      bark(S, p, 'flee', true);
    }
  }
}
