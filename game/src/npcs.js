// Pedestrians and named NPCs for Solmar City. Crowd walkers follow sidewalk
// waypoints, flee from gunfire and panic in waves; named NPCs (Rosa, Marcus,
// Dell) stand at their posts, greet the player, remember favors, and hand
// out the story missions. All decisions run on a staggered 8 Hz tick —
// movement and animation still run every frame.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makePedestrian } from './models.js';
import { NPCS, BARKS } from './text.js';

const NAMED_SPOTS = [
  { id: 'rosa', x: 0, z: 0, post: 'bar' },       // placed by the Beach Bar
  { id: 'marcus', x: 0, z: 0, post: 'chop' },    // chop shop, SW corner
  { id: 'dell', x: 0, z: 0, post: 'pier' },      // old pier, NE corner
];

export function createNpcs(scene, city, rng) {
  const peds = [];
  const named = [];
  const barkCooldown = new Map();

  function sidewalkPoint() {
    // A point on a sidewalk: near a street axis, offset onto the walk.
    const axis = rng.pick([-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]);
    const along = rng.range(-200, 200);
    const side = rng.chance(0.5) ? 1 : -1;
    if (rng.chance(0.5)) return { x: axis + side * (CFG.grid.roadHalf + 2.5), z: along };
    return { x: along, z: axis + side * (CFG.grid.roadHalf + 2.5) };
  }

  function makePed(kind) {
    const mesh = makePedestrian(rng);
    const p = sidewalkPoint();
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    const ped = {
      id: `ped-${peds.length}`, kind, mesh,
      x: p.x, z: p.z, angle: rng.range(0, Math.PI * 2),
      speed: rng.range(CFG.peds.walkMin, CFG.peds.walkMax),
      target: sidewalkPoint(), state: 'walk',
      panic: 0, phase: rng.range(0, 1), decisionAt: 0,
      walkPhase: rng.range(0, Math.PI * 2),
    };
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < CFG.peds.count; i++) makePed('crowd');
  // A few beach strollers on the boardwalk so the beach feels lived in.
  for (let i = 0; i < 6; i++) {
    const ped = makePed('beach');
    ped.x = CFG.world.boardwalkX + rng.range(-4, 4);
    ped.z = rng.range(-180, 180);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.target = { x: ped.x, z: ped.z + rng.pick([-40, 40]) };
  }

  for (const spot of NAMED_SPOTS) {
    let x, z;
    if (spot.post === 'bar') { x = city.beach.barX - 4; z = city.beach.barZ + 8; }
    else if (spot.post === 'chop') { x = city.spawn.chopShop.x; z = city.spawn.chopShop.z; }
    else { x = city.spawn.pier.x; z = city.spawn.pier.z - 8; }
    const mesh = makePedestrian(rng);
    mesh.position.set(x, 0, z);
    mesh.scale.setScalar(1.08);
    scene.add(mesh);
    const def = NPCS[spot.id];
    named.push({
      id: spot.id, name: def.name, role: def.role, mesh,
      x, z, angle: Math.PI, state: 'idle',
      met: false, favorDone: false, lastBark: 0,
    });
  }

  function bark(ped, pool, now) {
    const last = barkCooldown.get(ped.id) || 0;
    if (now - last < 4) return null;
    barkCooldown.set(ped.id, now);
    return pool[(Math.random() * pool.length) | 0];
  }

  return {
    peds, named,
    // Panic event: gunfire or a crash at (x, z). Nearby pedestrians flee,
    // farther ones gawk. Returns the bark to show, if any.
    panicAt(x, z, now, radius = 30) {
      let said = null;
      for (const ped of peds) {
        const d = Math.hypot(ped.x - x, ped.z - z);
        if (d < radius) {
          ped.state = 'flee';
          ped.panic = 1;
          const away = Math.atan2(ped.z - z, ped.x - x);
          ped.target = { x: ped.x + Math.cos(away) * 40, z: ped.z + Math.sin(away) * 40 };
          if (!said) said = bark(ped, BARKS.pedFlee, now);
        } else if (d < radius * 2 && ped.state === 'walk') {
          ped.state = 'gawk';
          ped.gawkUntil = now + 3;
          if (!said) said = bark(ped, BARKS.pedPanic, now);
        }
      }
      return said;
    },
    nearestNamed(x, z, maxDist = 4) {
      let best = null, bd = maxDist;
      for (const n of named) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    talk(npc, state) {
      const def = NPCS[npc.id];
      npc.met = true;
      if (npc.favorDone) return { line: def.greetAfterJob, mission: null };
      const mission = state.missions.find((m) => m.giver === npc.id && !m.done && !m.active);
      if (mission) return { line: def.job, mission };
      return { line: npc.met ? def.greetReturn : def.greetFirst, mission: null };
    },
    update(dt, now, player) {
      for (const ped of peds) {
        ped.decisionAt -= dt;
        if (ped.decisionAt <= 0) {
          ped.decisionAt = 0.12 + ped.phase * 0.05; // staggered ~8 Hz
          if (ped.state === 'walk' && Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 2) {
            ped.target = sidewalkPoint();
          }
          if (ped.state === 'flee') {
            ped.panic = Math.max(0, ped.panic - dt * 2);
            if (ped.panic <= 0) { ped.state = 'walk'; ped.target = sidewalkPoint(); }
          }
          if (ped.state === 'gawk' && now > (ped.gawkUntil || 0)) ped.state = 'walk';
        }
        let tx = ped.target.x, tz = ped.target.z;
        let speed = ped.speed;
        if (ped.state === 'flee') speed = CFG.peds.fleeSpeed;
        if (ped.state === 'gawk') speed = 0;
        const dx = tx - ped.x, dz = tz - ped.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2 && speed > 0) {
          const want = Math.atan2(dx, dz);
          let diff = want - ped.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
          ped.x += Math.sin(ped.angle) * speed * dt;
          ped.z += Math.cos(ped.angle) * speed * dt;
          ped.walkPhase += dt * speed * 4;
        }
        // Keep pedestrians inside the city and off the beach water.
        ped.x = Math.max(-215, Math.min(CFG.world.oceanX - 6, ped.x));
        ped.z = Math.max(-215, Math.min(215, ped.z));
        ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
        ped.mesh.rotation.y = ped.angle;
        // Walk bob: arms swing with the step phase.
        ped.mesh.children.forEach((c, i) => {
          if (i >= 4 && i <= 5) c.rotation.x = Math.sin(ped.walkPhase) * (i === 4 ? 0.5 : -0.5);
        });
      }
      // Named NPCs idle at their posts and turn to face the player nearby.
      for (const n of named) {
        const d = Math.hypot(player.x - n.x, player.z - n.z);
        if (d < 8) {
          const want = Math.atan2(player.x - n.x, player.z - n.z);
          n.mesh.rotation.y = want;
        } else {
          n.mesh.rotation.y += (Math.PI - n.mesh.rotation.y) * dt * 0.5;
        }
        n.mesh.position.y = Math.sin(now * 1.2 + n.x) * 0.02; // breathing idle
      }
    },
  };
}
