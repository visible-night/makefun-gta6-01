// Every line of authored text in Solmar City: story, NPC dialogue, barks,
// mission briefings, HUD strings and radio patter. All original names and
// lines — nothing borrowed from any commercial game.
export const STORY = {
  title: 'SOLMAR CITY',
  subtitle: 'Sundown Beach, Solmar — a city that never pays its debts on time.',
  intro: [
    'You are Vic Marlow, back in Solmar after three years away.',
    'Your sister Rosa runs the Sundown Beach Bar. The city owes you.',
    'Steal a car. Take fares. Run jobs. Stay out of the morgue.',
  ],
  controls: 'WASD drive / walk · SPACE brake · E enter car / talk · Mouse shoot · P pause · R radio · M mute',
};

export const NPCS = {
  rosa: {
    name: 'Rosa Marlow',
    role: 'Runs the Sundown Beach Bar',
    greetFirst: 'Vic? Vic Marlow! Three years and not one call. Sit. You look hungry.',
    greetReturn: "Back again? The jukebox is broken, the till is light, but the beer's cold.",
    greetAfterJob: 'You did it. I knew you would. The bar stays open another month because of you.',
    job: 'Listen. Deluca’s crew took my delivery van. Get it back to the bar and I’ll pay you proper.',
    idle: [
      'If you see my brother, tell him the rent is due.',
      'Best sunset in Solmar, right off this boardwalk.',
      'No trouble in my bar, Vic. Take it outside.',
    ],
  },
  marcus: {
    name: 'Marcus Hale',
    role: 'Chop-shop mechanic',
    greetFirst: 'You want a car gone, or a car found? I do both. Cash only.',
    greetReturn: 'Back for parts? I got a sports coupe in the back. Don’t ask where from.',
    job: 'A client left a package at the old pier. Bring it here, no questions, I pay double.',
    idle: [
      'Every car in this city has a story. Most of them are lies.',
      'You scratch it, you bought it. That’s the rule.',
    ],
  },
  dell: {
    name: 'Dell Rook',
    role: 'Ex-cop informant',
    greetFirst: 'Marlow. You’re back. The department still has your file, you know.',
    greetReturn: 'Word is Deluca’s moving product through the marina tonight.',
    job: 'Lose the heat for me — get to five stars and shake them — and I’ll owe you one.',
    idle: [
      'Cops here chase what they can catch. Be faster.',
      'The heli only comes out when you really annoy them.',
    ],
  },
};

export const BARKS = {
  pedGreet: [
    'Hey, watch it!', 'Beautiful day, huh?', 'You see the game last night?',
    'I love this city.', 'Outta my way!', 'Sun’s out, finally.',
  ],
  pedFlee: [
    'He’s got a gun!', 'Somebody call the cops!', 'Run! RUN!',
    'Not again — not in my street!', 'I’m outta here!',
  ],
  pedPanic: ['Whoa, whoa!', 'What was that?!', 'Everybody down!'],
  copChase: [
    'Solmar PD! Pull over!', 'Stop that vehicle!', 'He’s running! Cut him off!',
    'Dispatch, we need backup!', 'Box him in!',
  ],
  copGiveUp: ['Lost him. Back to patrol.', 'He’s gone. Again.'],
  taxi: ['Need a ride, pal?', 'Hop in, I know a shortcut.', 'Where to?'],
  radio: [
    'You’re listening to SUN 98 — all sunset, all the time.',
    'Traffic on the causeway is a nightmare, as usual.',
    'Next up: a song for everyone stuck in Solmar traffic.',
  ],
};

export const MISSIONS = [
  {
    id: 'first-job', name: 'First Job', giver: 'rosa',
    brief: 'Deluca’s crew took Rosa’s delivery van. Steal it back and drive it to the Sundown Beach Bar.',
    steps: [
      'Find the stolen van near the marina (follow the marker).',
      'Steal the van.',
      'Drive it back to the Beach Bar.',
    ],
    pay: 300,
  },
  {
    id: 'pier-package', name: 'The Pier Package', giver: 'marcus',
    brief: 'Marcus needs a package picked up from the old pier. No questions. Bring it to the chop shop.',
    steps: ['Pick up the package at the old pier.', 'Deliver it to Marcus at the chop shop.'],
    pay: 400,
  },
  {
    id: 'shake-the-heat', name: 'Shake the Heat', giver: 'dell',
    brief: 'Dell wants proof you can lose a five-star wanted level. Get the heat up, then make it vanish.',
    steps: ['Reach a 5-star wanted level.', 'Lose the cops completely.'],
    pay: 500,
  },
];

export const HUD = {
  wantedLabel: 'WANTED',
  cashLabel: 'CASH',
  speedLabel: 'MPH',
  missionLabel: 'JOB',
  taxiLabel: 'TAXI FARE',
  packagesLabel: 'PACKAGES',
  paused: 'PAUSED — P to resume · M mute · R radio',
  dead: 'BUSTED — press Enter to start over at the Beach Bar',
  busted: 'WASTED — press Enter to start over at the Beach Bar',
  saveNote: 'Progress saves automatically at the Beach Bar.',
  startPrompt: 'Press ENTER to start',
  lowHealth: 'You are hurt — find the Beach Bar to recover.',
};

export const TIPS = [
  'Steal any parked car with E. Cops notice.',
  'Brake lights flare when you brake — traffic reads them.',
  'The heli only hunts at 4 stars and up.',
  'Taxi fares pay fast. Look for the yellow marker.',
  'Packages hide on rooftops and piers — 20 in all.',
  'Wanted level fades if you stay out of sight.',
];
