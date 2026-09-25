// Sample data for building the site before it talks to Mimyne's Firebase.
// Everything the pages read goes through api.js, so this file is the only one
// that has to go when the real data arrives.

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;
const minutesAgo = (m) => Date.now() - m * 60_000;

export const users = {
  zeta: { id: 'zeta', name: 'Zeta Murdock', username: 'zetamurdock', color: '#f4f4f5' },
  kai: { id: 'kai', name: 'Kai', username: 'kai', color: '#f2b84b', activity: 'In Level design' },
  rae: { id: 'rae', name: 'Rae', username: 'rae', color: '#f9a8d4', activity: 'In Level design' },
  mira: { id: 'mira', name: 'Mira', username: 'mira', color: '#c4b5fd', activity: 'In Lore bible' },
  dex: { id: 'dex', name: 'Dex', username: 'dex', color: '#5eead4', activity: 'Playing a game' },
};

// A role is the Hub's own name and colour on top of one fixed level:
// owner, mod or member. Levels decide what a role can do.
const defaultRoles = [
  { id: 'owner', name: 'Owner', level: 'owner', color: '#f2b84b', tint: '#2a2112' },
  { id: 'mod', name: 'Mod', level: 'mod', color: '#c4b5fd', tint: '#1c1530' },
  { id: 'member', name: 'Member', level: 'member', color: '#f4f4f5', tint: '#202022' },
];

export const hubs = {
  ashfall: {
    id: 'ashfall',
    name: 'Ashfall Modding Crew',
    letter: 'A',
    bg: '#7c3aed',
    fg: '#ffffff',
    tagline: 'Maps, mods and lore for Ashfall',
    tag: 'modding',
    banner: '#111112',
    // 'signed-in': anyone signed in may post (the default).
    // 'pledged': only people who pledged may post.
    postingPolicy: 'signed-in',
    roles: [
      { id: 'warden', name: 'Warden', level: 'owner', color: '#f2b84b', tint: '#2a2112' },
      { id: 'keeper', name: 'Keeper', level: 'mod', color: '#c4b5fd', tint: '#1c1530' },
      { id: 'mapper', name: 'Mapper', level: 'member', color: '#5eead4', tint: '#0f2724' },
      { id: 'crew', name: 'Crew', level: 'member', color: '#f4f4f5', tint: '#202022' },
    ],
    members: { kai: 'warden', mira: 'keeper', rae: 'mapper', dex: 'crew' },
    rules: [
      'Credit the map or mod you build on.',
      'Bug reports go in the Level design room, not DMs.',
      'No leaks from other studios.',
    ],
  },
  pyre: {
    id: 'pyre',
    name: 'Studio Pyre',
    letter: 'P',
    bg: '#2a2112',
    fg: '#f2b84b',
    tagline: 'Co-op horror in the making',
    tag: 'horror',
    banner: '#1a1712',
    postingPolicy: 'pledged',
    roles: defaultRoles,
    members: { dex: 'owner', mira: 'member' },
    rules: ['Spoilers go behind a warning.'],
  },
  wraithline: {
    id: 'wraithline', name: 'Wraithline', letter: 'W', bg: '#0f2724', fg: '#5eead4',
    tagline: 'Competitive scene and scrims', tag: 'esports', banner: '#0f1a18',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
  nightshift: {
    id: 'nightshift', name: 'Night Shift Clips', letter: 'N', bg: '#2a1522', fg: '#f9a8d4',
    tagline: 'Late-night clips and edits', tag: 'clips', banner: '#1a1318',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
  lowpoly: {
    id: 'lowpoly', name: 'Low Poly Club', letter: 'L', bg: '#202022', fg: '#f4f4f5',
    tagline: 'Small models, big feelings', tag: '3d', banner: '#141415',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
  speedrun: {
    id: 'speedrun', name: 'Speedrun Lab', letter: 'S', bg: '#0f2724', fg: '#5eead4',
    tagline: 'Routes, splits, tech', tag: 'speedrun', banner: '#0f1a18',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
  mapmakers: {
    id: 'mapmakers', name: 'Map Makers Guild', letter: 'M', bg: '#2a1522', fg: '#f9a8d4',
    tagline: 'Share blockouts, get notes', tag: 'maps', banner: '#1a1318',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
  cutscene: {
    id: 'cutscene', name: 'Cutscene Club', letter: 'C', bg: '#202022', fg: '#f4f4f5',
    tagline: 'Editing, music, pacing', tag: 'film', banner: '#141415',
    postingPolicy: 'signed-in', roles: defaultRoles, members: {}, rules: [],
  },
};

// A room is one shared workspace. It can belong to several Hubs.
export const rooms = [
  {
    id: 'level-design', name: 'Level design', tag: 'maps', hubs: ['ashfall'],
    front: '#17141f', here: ['kai', 'rae', 'dex'], access: 'edit', edited: minutesAgo(2),
  },
  {
    id: 'lore-bible', name: 'Lore bible', tag: 'lore', hubs: ['ashfall', 'pyre'],
    front: '#121a18', here: ['mira'], access: 'add', edited: minutesAgo(5),
  },
  {
    id: 'patch-notes', name: 'Patch notes', tag: 'announce', hubs: ['ashfall'],
    front: '#1a1712', here: [], access: 'view', edited: minutesAgo(60 * 22),
  },
  {
    id: 'clip-review', name: 'Clip review', tag: 'clips', hubs: ['ashfall', 'nightshift'],
    front: '#1a1318', here: [], access: 'add', edited: minutesAgo(60 * 72),
  },
  {
    id: 'keepers', name: "Keepers' room", tag: 'staff', hubs: ['ashfall'],
    front: '#111112', here: [], access: 'none', levels: ['owner', 'mod'], edited: minutesAgo(60 * 5),
  },
];

export const posts = [
  {
    id: 'arena-v3', author: 'kai', hub: 'ashfall', at: minutesAgo(120),
    title: 'Boss arena v3 is up. Grab the map and break it.',
    body: 'East pillar moved 2m, phase-two ledge added, dash timing untouched. Drop what clips in the comments or straight into the Level design room.',
    files: [{ name: 'ashfall_arena_v3.zip', size: 4.2 * GB, kind: 'file' }],
    approvals: 24, comments: 7, room: 'level-design',
  },
  {
    id: 'dash-clip', author: 'rae', hub: null, at: minutesAgo(300),
    title: 'The dash finally clears the east pillar',
    files: [{ name: 'dash_clears.mp4', size: 212 * MB, kind: 'video', duration: '1:42' }],
    approvals: 57, approved: true, comments: 13,
  },
  {
    id: 'pyre-writers', author: 'dex', hub: null, at: minutesAgo(60 * 24),
    body: 'Looking for people to write lore for a co-op horror project. Everything we have lives in one Hub, rooms and all. Pledge and come look.',
    embedHub: 'pyre', approvals: 9, comments: 4,
  },
  {
    id: 'lore-open', author: 'mira', hub: 'ashfall', at: minutesAgo(60 * 26),
    title: 'Lore bible is open for notes',
    body: 'Anyone pledged can add notes in the Lore bible room now. Keep canon questions in comments there.',
    approvals: 11, comments: 3,
  },
];

export const comments = {
  'arena-v3': [
    {
      id: 'c1', author: 'rae', at: minutesAgo(60), approvals: 12,
      body: 'Downloaded. The phase-two ledge is perfect, but the east spawn clips through the wall if you dash on the first frame.',
      replies: [
        {
          id: 'c1a', author: 'kai', at: minutesAgo(45), approvals: 9,
          body: 'Good catch. Fixed it in the Level design room, new zip tonight.',
          replies: [{ id: 'c1a1', author: 'rae', at: minutesAgo(40), approvals: 3, body: 'Legend.', replies: [] }],
        },
        {
          id: 'c1b', author: 'mira', at: minutesAgo(30), approvals: 5,
          body: "Here's the spot, marked in red.",
          files: [{ name: 'east_spawn.png', size: 1.8 * MB, kind: 'image' }],
          replies: [],
        },
      ],
    },
    {
      id: 'c2', author: 'dex', at: minutesAgo(20), approvals: 2,
      body: 'Crashing on load for anyone else? Log attached.',
      files: [{ name: 'crash_log.txt', size: 14 * KB, kind: 'file' }],
      replies: [
        { id: 'c2a', author: 'kai', at: minutesAgo(15), approvals: 1, body: 'Which GPU? Only seen it on older drivers.', replies: [] },
        { id: 'c2b', author: 'dex', at: minutesAgo(12), approvals: 0, body: 'Updated drivers, it loads now.', replies: [] },
      ],
    },
  ],
};

export const conversations = [
  {
    id: 'kai', kind: 'direct', with: 'kai', at: minutesAgo(2), unread: false,
    messages: [
      { id: 'm1', from: 'kai', at: minutesAgo(40), text: "Sending you the raw footage from last night's test." },
      { id: 'm2', from: 'kai', at: minutesAgo(39), files: [{ name: 'arena_test_raw.mp4', size: 12.8 * GB, kind: 'video' }] },
      { id: 'm3', from: 'zeta', at: minutesAgo(30), text: "Got it. I'll cut the dash clip and post it." },
      { id: 'm4', from: 'zeta', at: minutesAgo(29), post: 'dash-clip' },
      { id: 'm5', from: 'kai', at: minutesAgo(2), invite: { room: 'level-design', hub: 'ashfall', access: 'edit' } },
    ],
  },
  {
    id: 'ashfall-map', kind: 'group', hub: 'ashfall', title: 'Ashfall · map team', at: minutesAgo(14), unread: true,
    messages: [{ id: 'g1', from: 'mira', at: minutesAgo(14), text: 'Pushed the lighting pass.' }],
  },
  {
    id: 'rae', kind: 'direct', with: 'rae', at: minutesAgo(60), unread: false,
    messages: [{ id: 'r1', from: 'rae', at: minutesAgo(60), files: [{ name: 'dash_clears.mp4', size: 212 * MB, kind: 'video' }] }],
  },
  {
    id: 'dex', kind: 'direct', with: 'dex', at: minutesAgo(180), unread: false,
    messages: [{ id: 'd1', from: 'dex', at: minutesAgo(180), text: 'ha, yes. same crash' }],
  },
  {
    id: 'pyre-writers', kind: 'group', hub: 'pyre', title: 'Studio Pyre · writers', at: minutesAgo(60 * 24), unread: false,
    messages: [{ id: 'w1', from: 'zeta', at: minutesAgo(60 * 24), text: "I'll draft the prologue." }],
  },
];

export const discover = ['speedrun', 'mapmakers', 'cutscene'];
