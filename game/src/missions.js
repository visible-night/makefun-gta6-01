// The story: six missions in order, each a chain of steps the world watches for.
// The order doubles as the difficulty ramp: the first mission teaches stealing
// and driving, the middle ones add heat, fares and gunfights, and the last
// throws the whole city at the player at once.
// Step types:
//   goto   reach a place (needCar counts only in a car, dwell means stand there
//          that long, time is the seconds left, heat sets wanted stars on arrival)
//   kill   take down N armed guards spawned at a place
//   fares  finish N taxi fares, which runs the taxi side job
//   lose   bring the wanted level back to zero
export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    giver: 'Rico',
    giverColor: '#d9574f',
    brief: 'Fresh off the bus, huh? Nobody walks in Solmar. Grab yourself a car, any car, and bring it to the Chop Shop so my crew can strip it down. And keep it quiet, the cops love a new face.',
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
    brief: 'There is a package waiting at the Harbour Docks and a client at the Palm Royale who does not like waiting. Grab it, run it over, and be quick. Word is the precinct has eyes on the docks, so expect company.',
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
    brief: 'Rico and I need a ride out of downtown, one at a time, so nobody ties us together. Collect me from the hotel, then Rico from the bank. The cops will be all over us by then. Shake them and the money is yours.',
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
    brief: 'Three of my drivers called in sick and the phones will not stop ringing. Take a cab, run three fares and keep the tips. Drive like a gentleman, mind you, the customers pay extra when you are quick.',
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
    brief: 'The old warehouse crew has been skimming us for months. Go in on foot, settle the account, and bring the cash home. They are armed, so be quick and be careful, and watch out for the cops on the way back.',
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
    brief: 'This is the one, kid. Solmar Bank, in broad daylight. Walk in, take the vault cash and run. Every cop in the city will be on your tail. Make it home and you will never have to work again.',
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
