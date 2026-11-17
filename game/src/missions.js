// Six story missions as data + a generic step runner, plus taxi and vigilante side jobs.
import { dist2 } from './random.js';
import { MISSION_REWARDS } from './config.js';

const L = (S) => S.city.landmarks;
export const MISSIONS = [
  { name: 'First Delivery', intro: 'Mack needs a car. Steal one and bring it to the chop shop.',
    steps: [{ t: 'goto', at: (S) => L(S).chopshop, r: 10, needCar: true, text: 'Deliver a car to the chop shop' }] },
  { name: 'Harbour Run', intro: 'A package has to reach the harbour in 90 seconds. No excuses.',
    steps: [{ t: 'goto', at: (S) => L(S).harbour, r: 12, time: 90, text: 'Reach the harbour before the timer runs out' }] },
  { name: 'Two Pickups', intro: 'Collect two friends, then shake the cops and get home.',
    steps: [
      { t: 'pickup', at: () => ({ x: 60, z: -60 }), r: 8, label: 'Pick up Dario', text: 'Pick up Dario downtown' },
      { t: 'pickup', at: () => ({ x: -60, z: 60 }), r: 8, label: 'Pick up Cleo', text: 'Pick up Cleo, then head home' },
      { t: 'goto', at: (S) => L(S).safehouse, r: 10, text: 'Get back to the Safehouse' },
    ] },
  { name: 'Night Shift', intro: 'Three fares, three deadlines. The meter is running.',
    steps: [
      { t: 'taxi', from: () => ({ x: 40, z: 40 }), to: () => ({ x: -100, z: -100 }), time: 80, text: 'Fare 1 of 3' },
      { t: 'taxi', from: () => ({ x: -140, z: 20 }), to: () => ({ x: 100, z: 100 }), time: 80, text: 'Fare 2 of 3' },
      { t: 'taxi', from: () => ({ x: 160, z: -40 }), to: () => ({ x: 0, z: -140 }), time: 80, text: 'Fare 3 of 3' },
    ] },
  { name: 'Warehouse Heat', intro: 'Six guards between you and the stash. Clear them out.',
    steps: [
      { t: 'goto', at: (S) => L(S).warehouse, r: 14, text: 'Reach the warehouse district' },
      { t: 'kill', count: 6, at: (S) => L(S).warehouse, text: 'Take out the guards' },
      { t: 'goto', at: (S) => L(S).safehouse, r: 10, text: 'Get back to the Safehouse' },
    ] },
  { name: 'The Bank Job', intro: 'Daylight robbery. Hold the bank for 30 seconds, then run.',
    steps: [
      { t: 'goto', at: (S) => L(S).bank, r: 12, text: 'Get to Solmar Bank' },
      { t: 'survive', time: 30, text: 'Hold the bank while the vault opens' },
      { t: 'goto', at: (S) => L(S).safehouse, r: 10, text: 'Escape to the Safehouse' },
    ] },
];

export function missionStartPoint(S) { return S.city.landmarks.safehouse; }
export function startMission(S) {
  const idx = S.missionIdx;
  if (idx >= MISSIONS.length) return false;
  const def = MISSIONS[idx];
  S.mission = { idx, def, stepIdx: 0, timer: 0, kills: 0, phase: 'pickup', guardsSpawned: false, started: true };
  S.events.push({ type: 'mission-start', name: def.name, intro: def.intro });
  return true;
}
function currentStep(S) { return S.mission.def.steps[S.mission.stepIdx]; }
export function missionTarget(S) {
  if (!S.mission) return null;
  const st = currentStep(S);
  if (st.t === 'taxi') return { ...(S.mission.phase === 'pickup' ? st.from(S) : st.to(S)), label: S.mission.phase === 'pickup' ? 'Pick up fare' : 'Drop off fare' };
  if (st.t === 'kill') return { ...st.at(S), label: `Guards left: ${st.count - S.mission.kills}` };
  if (st.t === 'survive') return { ...L(S).bank, label: `Hold on: ${Math.ceil(S.mission.timer)}s` };
  return { ...st.at(S), label: st.text };
}
export function missionText(S) {
  if (!S.mission) {
    return S.missionIdx >= MISSIONS.length
      ? 'All jobs done. Solmar City is yours — free roam, packages, fares.'
      : `Next job: ${MISSIONS[S.missionIdx].name}. Go to the Safehouse to start.`;
  }
  const st = currentStep(S);
  if (st.t === 'taxi') return `${st.text} — ${S.mission.phase === 'pickup' ? 'pick up the fare' : 'drop them off'}${st.time ? ` (${Math.ceil(S.mission.timer)}s)` : ''}`;
  if (st.t === 'kill') return `${st.text} (${S.mission.kills}/${st.count})`;
  if (st.t === 'survive') return `${st.text} — ${Math.ceil(S.mission.timer)}s left`;
  if (st.time) return `${st.text} (${Math.ceil(S.mission.timer)}s)`;
  return st.text;
}
function advance(S) {
  S.mission.stepIdx++;
  S.mission.timer = 0;
  S.mission.phase = 'pickup';
  if (S.mission.stepIdx >= S.mission.def.steps.length) {
    const reward = MISSION_REWARDS[S.mission.idx];
    S.player.cash += reward;
    S.missionIdx++;
    S.events.push({ type: 'mission-complete', name: S.mission.def.name, reward });
    S.mission = null;
    S.flags[`m${S.missionIdx}done`] = true;
  }
}
function fail(S, why) {
  S.events.push({ type: 'mission-fail', why });
  S.mission = null;
  S.guards = [];
}
export function updateMission(S, dt) {
  const m = S.mission;
  if (!m) return;
  const st = currentStep(S);
  const px = S.player.x, pz = S.player.z;
  if (st.time && m.timer === 0 && !m.timerSet) { m.timer = st.time; m.timerSet = true; }
  if (st.time) {
    m.timer -= dt;
    if (m.timer <= 0) { fail(S, 'Out of time.'); return; }
  }
  if (st.t === 'goto' || st.t === 'pickup') {
    const at = st.at(S);
    const d2 = dist2(px, pz, at.x, at.z);
    if (d2 < st.r * st.r) {
      if (st.needCar && !S.player.inCar) {
        S.hint = 'You need a car for this. Steal one nearby.';
      } else {
        if (st.t === 'pickup') S.events.push({ type: 'pickup', label: st.label });
        if (m.idx === 2 && m.stepIdx === 1) S.events.push({ type: 'heat', amount: 22 });
        advance(S);
      }
    }
  } else if (st.t === 'taxi') {
    const at = m.phase === 'pickup' ? st.from(S) : st.to(S);
    if (dist2(px, pz, at.x, at.z) < 64) {
      if (m.phase === 'pickup') { m.phase = 'dropoff'; S.events.push({ type: 'pickup', label: 'Fare aboard' }); }
      else advance(S);
    }
  } else if (st.t === 'kill') {
    if (!m.guardsSpawned) {
      m.guardsSpawned = true;
      S.spawnGuards(st.at(S), st.count);
    }
    if (m.kills >= st.count) advance(S);
  } else if (st.t === 'survive') {
    if (!m.timerSet) { m.timer = st.time; m.timerSet = true; S.events.push({ type: 'heat', amount: 60 }); }
    if (m.timer <= 0) {
      S.events.push({ type: 'cash', amount: 0, label: 'Vault open — $2,000 is in the bag!' });
      advance(S);
    }
  }
}
// --- Side jobs: taxi fares (in a taxi) and vigilante (in a stolen cruiser) ---
export function updateSideJobs(S, dt) {
  if (S.mission || S.mode !== 'play') return;
  const car = S.player.inCar;
  if (!car) { S.sideJob = null; return; }
  if (car.type === 'taxi' && !S.sideJob) {
    const r = S.rng;
    const pick = () => ({ x: r.pick([-140, -100, -60, -20, 20, 60, 100, 140]), z: r.pick([-140, -100, -60, -20, 20, 60, 100, 140]) });
    S.sideJob = { kind: 'fare', from: pick(), to: pick(), phase: 'pickup', pay: 40 + Math.floor(r.next() * 5) * 10 };
    S.events.push({ type: 'sidejob', label: 'Fare waiting — pick them up.' });
  }
  if (car.type === 'police' && !S.sideJob) {
    S.sideJob = { kind: 'vigilante', target: null, pay: 150, timer: 120 };
    S.events.push({ type: 'sidejob', label: 'Vigilante: a getaway car is fleeing. Stop it.' });
    S.spawnCriminal();
  }
  const j = S.sideJob;
  if (!j) return;
  if (j.kind === 'fare') {
    const at = j.phase === 'pickup' ? j.from : j.to;
    if (dist2(S.player.x, S.player.z, at.x, at.z) < 64) {
      if (j.phase === 'pickup') { j.phase = 'dropoff'; S.events.push({ type: 'pickup', label: 'Fare aboard' }); }
      else {
        S.player.cash += j.pay;
        S.events.push({ type: 'cash', amount: j.pay, label: `Fare paid $${j.pay}` });
        S.sideJob = null;
      }
    }
  } else if (j.kind === 'vigilante') {
    j.timer -= dt;
    if (j.timer <= 0) { S.events.push({ type: 'sidejob', label: 'The getaway car escaped.' }); S.sideJob = null; S.clearCriminal(); }
  }
}
export function sideJobTarget(S) {
  const j = S.sideJob;
  if (!j) return null;
  if (j.kind === 'fare') return { ...(j.phase === 'pickup' ? j.from : j.to), label: j.phase === 'pickup' ? 'Fare pickup' : 'Fare dropoff' };
  if (S.criminal) return { x: S.criminal.x, z: S.criminal.z, label: 'Getaway car' };
  return null;
}
