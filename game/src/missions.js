// Missions, taxi fares and the package hunt for Solmar City. Missions are
// data (see text.js) plus a small state machine: each step is a location or
// a condition, and the marker on the HUD/minimap always points at the next
// one. Taxi fares and packages are repeatable side activities that pay cash.
import { MISSIONS } from './text.js';
import { CFG } from './config.js';

export function createMissions(city, rng) {
  const missions = MISSIONS.map((def) => ({ ...def, active: false, done: false, step: 0 }));
  const taxi = { active: false, fare: null, timer: 0 };
  const packages = [];
  for (let i = 0; i < 20; i++) {
    // Packages hide at street corners, on the pier, along the boardwalk.
    const corner = rng.chance(0.6);
    const p = corner
      ? { x: rng.pick([-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]) + rng.pick([-9, 9]),
          z: rng.pick([-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]) + rng.pick([-9, 9]) }
      : { x: CFG.world.boardwalkX + rng.range(-4, 30), z: rng.range(-190, 190) };
    packages.push({ ...p, found: false, id: `pkg-${i}` });
  }

  function stepTarget(m) {
    const s = m.step;
    if (m.id === 'first-job') {
      if (s === 0) return { x: city.spawn.van.x, z: city.spawn.van.z, label: 'Stolen van' };
      if (s === 1) return { x: city.spawn.van.x, z: city.spawn.van.z, label: 'Steal the van' };
      return { x: city.beach.barX, z: city.beach.barZ, label: 'Return to the Beach Bar' };
    }
    if (m.id === 'pier-package') {
      if (s === 0) return { x: city.spawn.pier.x, z: city.spawn.pier.z, label: 'Package at the old pier' };
      return { x: city.spawn.chopShop.x, z: city.spawn.chopShop.z, label: 'Deliver to Marcus' };
    }
    // shake-the-heat
    if (s === 0) return { x: 0, z: 0, label: 'Reach 5 stars', anywhere: true };
    return { x: 0, z: 0, label: 'Lose the cops', anywhere: true };
  }

  return {
    missions, taxi, packages,
    active() { return missions.find((m) => m.active); },
    start(mission) {
      mission.active = true; mission.step = 0;
      return mission;
    },
    // The current objective marker: mission step first, then taxi fare.
    marker() {
      const m = this.active();
      if (m) return stepTarget(m);
      if (taxi.active && taxi.fare) return { x: taxi.fare.x, z: taxi.fare.z, label: 'Fare pickup' };
      return null;
    },
    startTaxi(player) {
      if (taxi.active) return null;
      const a = rng.pick([-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]);
      taxi.active = true;
      taxi.fare = { x: a + rng.pick([-40, 40]), z: rng.range(-180, 180), paid: false };
      taxi.timer = 90;
      return taxi.fare;
    },
    update(dt, state) {
      const m = this.active();
      if (m) {
        const t = stepTarget(m);
        if (m.id === 'first-job') {
          if (m.step === 0 && state.playerNear(t.x, t.z, 6)) m.step = 1;
          else if (m.step === 1 && state.player.inCar && state.player.inCar.kind === 'van') m.step = 2;
          else if (m.step === 2 && state.playerNear(city.beach.barX, city.beach.barZ, 10)) {
            m.active = false; m.done = true;
            state.pay(CFG.economy.missionPay);
            state.onMissionDone(m);
          }
        } else if (m.id === 'pier-package') {
          if (m.step === 0 && state.playerNear(t.x, t.z, 5)) { m.step = 1; state.toast('Package secured — take it to Marcus.'); }
          else if (m.step === 1 && state.playerNear(city.spawn.chopShop.x, city.spawn.chopShop.z, 8)) {
            m.active = false; m.done = true;
            state.pay(400);
            state.onMissionDone(m);
          }
        } else if (m.id === 'shake-the-heat') {
          if (m.step === 0 && state.wanted >= 5) { m.step = 1; state.toast('Five stars! Now lose them.'); }
          else if (m.step === 1 && state.wanted === 0) {
            m.active = false; m.done = true;
            state.pay(500);
            state.onMissionDone(m);
          }
        }
      }
      if (taxi.active && taxi.fare) {
        taxi.timer -= dt;
        if (taxi.timer <= 0) { taxi.active = false; taxi.fare = null; state.toast('Fare gave up waiting.'); }
        else if (!taxi.fare.paid && state.playerNear(taxi.fare.x, taxi.fare.z, 5)) {
          taxi.fare.paid = true;
          state.pay(CFG.economy.taxiFare);
          taxi.active = false; taxi.fare = null;
          state.toast(`Fare paid $${CFG.economy.taxiFare}.`);
        }
      }
      for (const p of packages) {
        if (!p.found && state.playerNear(p.x, p.z, 3)) {
          p.found = true;
          state.pay(CFG.economy.packageReward);
          state.onPackage(packages.filter((q) => q.found).length);
        }
      }
    },
  };
}
