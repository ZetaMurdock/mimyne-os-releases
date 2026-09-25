// The one place pages get data from. Today it reads sample data; the same
// functions will call Mimyne's Firebase later, so pages don't change.
import * as mock from './mock.js';

// Sample reads take a moment, like a real request would, so page changes
// and the notch's transition behave the way they will against Firebase.
const wait = (ms = 280) => new Promise((resolve) => setTimeout(resolve, ms));

function notFound() {
  throw new Response('Not found', { status: 404 });
}

export async function getHub(id) {
  await wait();
  const hub = mock.hubs[id];
  if (!hub) notFound();
  return {
    hub,
    rooms: mock.rooms.filter((r) => r.hubs.includes(id)),
    posts: mock.posts.filter((p) => p.hub === id),
  };
}

export function getHubsById(ids) {
  return ids.map((id) => mock.hubs[id]).filter(Boolean);
}

export function getHubSync(id) {
  return mock.hubs[id] ?? null;
}

export function getUser(id) {
  return mock.users[id] ?? { id, name: id, color: '#333336' };
}

export async function getFeed() {
  await wait();
  return {
    posts: [...mock.posts].sort((a, b) => b.at - a.at),
    discover: getHubsById(mock.discover),
  };
}

export async function getPost(id) {
  await wait();
  const post = mock.posts.find((p) => p.id === id);
  if (!post) notFound();
  return { post, comments: getComments(id) };
}

// A copy, so a page can hold it in state and swap it after a change.
export function getComments(postId) {
  return structuredClone(mock.comments[postId] ?? []);
}

export function getPostSync(id) {
  return mock.posts.find((p) => p.id === id) ?? null;
}

export function getRoom(id) {
  return mock.rooms.find((r) => r.id === id) ?? null;
}

export async function getConversations() {
  await wait();
  return [...mock.conversations].sort((a, b) => b.at - a.at);
}

let nextId = 1;

export async function createPost({ author, hub, title, body, files }) {
  await wait(150);
  const post = {
    id: `local-${nextId++}`,
    author,
    hub: hub || null,
    at: Date.now(),
    title: title || undefined,
    body: body || undefined,
    files,
    approvals: 0,
    comments: 0,
  };
  mock.posts.unshift(post);
  return post;
}

export async function addComment(postId, parentId, { author, body, files }) {
  await wait(120);
  const comment = { id: `local-${nextId++}`, author, at: Date.now(), approvals: 0, body, files, replies: [] };
  const list = (mock.comments[postId] ??= []);
  if (!parentId) {
    list.push(comment);
  } else {
    const parent = findComment(list, parentId);
    if (parent) parent.replies.push(comment);
  }
  return comment;
}

function findComment(list, id) {
  for (const c of list) {
    if (c.id === id) return c;
    const hit = findComment(c.replies, id);
    if (hit) return hit;
  }
  return null;
}

export async function sendMessage(conversationId, { from, text, files }) {
  await wait(120);
  const convo = mock.conversations.find((c) => c.id === conversationId);
  const message = { id: `local-${nextId++}`, from, at: Date.now(), text: text || undefined, files };
  convo.messages.push(message);
  convo.at = message.at;
  return message;
}

export function findHub(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return Object.values(mock.hubs).find((h) => h.name.toLowerCase().includes(q) || h.tag === q) ?? null;
}

export function hasUnread() {
  return mock.conversations.some((c) => c.unread);
}
