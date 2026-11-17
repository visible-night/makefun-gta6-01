// The story: six missions, unlocked in order, each a list of steps the world runs.
// A step is one objective; the world watches for its completion and moves on.
// Step types:
//   goto   reach a place (needCar: only counts in a car; dwell: stand there that long;
//          time: seconds left to get there; heat: wanted stars set when it completes)
//   kill   eliminate N hostile guards spawned at a place
//   fares  complete N taxi fares (drives the taxi side job)
//   lose   get the wanted level back to zero
export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    giver: 'Rico',
    giverColor: '#d9574f',
    brief: 'Welcome to Solmar, kid. Nobody walks in this town. Steal yourself a ride — any car will do — and bring it to the Chop Shop so my boys can strip it. Try not to get the cops involved.',
    reward: 500,
    start: { place: 'safehouse' },
    steps: [
      { type: 'goto', place: 'chop', r: 130, needCar: true, text: 'Steal a car and bring it to the Chop Shop' },
    ],
  },
  {
    id: 'm2',
    title: 'Sunset Delivery',
    giver: 'Rico',
    giverColor: '#d9574f',
    brief: 'A package is waiting at the Harbour Docks. Grab it and run it to the Palm Royale Hotel before the client loses patience. Word is the precinct has the docks watched — expect company.',
    reward: 800,
    start: { place: 'safehouse' },
    steps: [
      { type: 'goto', place: 'docks', r: 130, dwell: 1.5, heat: 2, text: 'Pick up the package at the Harbour Docks' },
      { type: 'goto', place: 'hotel', r: 130, time: 90, text: 'Deliver the package to the Palm Royale Hotel' },
    ],
  },
  {
    id: 'm3',
    title: 'Getaway Driver',
    giver: 'Mia',
    giverColor: '#57b8a8',
    brief: 'Rico and I need a lift out of downtown — separately, so nobody connects us. Pick me up at the hotel, then Rico at the bank. The cops will be all over us by then. Lose them, and the money is yours.',
    reward: 1200,
    start: { place: 'safehouse' },
    steps: [
      { type: 'goto', place: 'hotel', r: 130, needCar: true, text: 'Pick up Mia at the Palm Royale Hotel' },
      { type: 'goto', place: 'bank', r: 130, needCar: true, heat: 2, text: 'Pick up Rico at Solmar Bank' },
      { type: 'lose', text: 'Lose the cops' },
    ],
  },
  {
    id: 'm4',
    title: 'Taxi Trouble',
    giver: 'Depot Dan',
    giverColor: '#e8d268',
    brief: 'Three of my drivers called in sick and the phones will not stop. Take a cab, run three fares, and keep the tips. Drive like a gentleman — the customers pay extra when you are quick.',
    reward: 700,
    start: { place: 'taxi' },
    steps: [
      { type: 'fares', count: 3, text: 'Complete 3 taxi fares' },
    ],
  },
  {
    id: 'm5',
    title: 'Warehouse Heat',
    giver: 'Rico',
    giverColor: '#d9574f',
    brief: 'The old warehouse crew skimmed us for months. Go in on foot, settle it, and bring the cash home. They are armed, so be quick and be careful — and mind the cops.',
    reward: 1500,
    start: { place: 'safehouse' },
    steps: [
      { type: 'kill', place: 'warehouse', count: 6, text: 'Clear out the warehouse guards' },
      { type: 'goto', place: 'safehouse', r: 130, text: 'Take the cash back to the Safehouse' },
    ],
  },
  {
    id: 'm6',
    title: 'The Big Score',
    giver: 'Mia',
    giverColor: '#57b8a8',
    brief: 'This is the one, kid. Solmar Bank, broad daylight. Walk in, take the vault cash, and run. Every cop in the city will be on you. Make it home and you never work again.',
    reward: 3000,
    start: { place: 'safehouse' },
    steps: [
      { type: 'goto', place: 'bank', r: 130, dwell: 2.5, heat: 3, text: 'Grab the vault cash at Solmar Bank' },
      { type: 'goto', place: 'safehouse', r: 130, text: 'Escape to the Safehouse' },
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

// The next mission the player has not finished, or null when the story is done.
export function nextMission(done) {
  for (const m of MISSIONS) {
    if (!done.includes(m.id)) return m;
  }
  return null;
}
