// Mimyne's plans, their prices, and where each is bought (Lemon Squeezy).
// The prices here are what the pricing page shows; Lemon Squeezy charges
// what its products say, so change both together.
//
// Checkout links: the test-mode store's links are used in development and on
// staging, where test cards work. Live links come from the build settings
// (VITE_CHECKOUT_*); until they're set, mimyne.com shows "Available at launch".
const env = import.meta.env;
const STAGING = !!env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== 'mimyne-os';
const TESTING = env.DEV || STAGING;
const TEST_STORE = 'https://mimyne.lemonsqueezy.com/checkout/buy/';

const TEST_LINKS = {
  deep: `${TEST_STORE}8a3c2c5e-9b7e-41aa-85a3-a894234d566f`,
  bundle: `${TEST_STORE}f134d82e-e4aa-4c4a-b2a0-a896b26c7757`,
  plus: `${TEST_STORE}ad7a424c-2a41-47f2-a5b8-f5dc48758176`,
  plus_yearly: `${TEST_STORE}8b158738-fc82-4cd5-8181-dc9b6b74188b`,
  hub_pro: `${TEST_STORE}ec6b4879-3484-499b-8510-646d0a987d25`,
};

const LIVE_LINKS = {
  deep: env.VITE_CHECKOUT_DEEP,
  bundle: env.VITE_CHECKOUT_BUNDLE,
  plus: env.VITE_CHECKOUT_PLUS,
  plus_yearly: env.VITE_CHECKOUT_PLUS_YEARLY,
  hub_pro: env.VITE_CHECKOUT_HUB_PRO,
};

const LINKS = TESTING ? TEST_LINKS : LIVE_LINKS;

/** Whether this plan can be bought from this build. */
export const onSale = (plan) => typeof LINKS[plan] === 'string' && LINKS[plan].startsWith('https://');

/**
 * The checkout link for a plan, carrying who is buying (and for Hub Pro,
 * which Hub), so the payment lands on the right account.
 */
export function checkoutUrl(plan, { uid, email, hub } = {}) {
  if (!onSale(plan) || !uid) return null;
  const url = new URL(LINKS[plan]);
  url.searchParams.set('checkout[custom][uid]', uid);
  if (hub) url.searchParams.set('checkout[custom][hub]', hub);
  if (email) url.searchParams.set('checkout[email]', email);
  return url.toString();
}

export const PRICES = {
  deep: { amount: 79, per: 'year' },
  bundle: { amount: 129, per: 'year' },
  plus: { amount: 7.99, per: 'month' },
  plus_yearly: { amount: 79, per: 'year' },
  hub_pro: { amount: 11.99, per: 'month' },
};

export const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// What Free and Plus each give, for the comparison table.
export const COMPARE = [
  ['Storage', '5 GB', '100 GB'],
  ['Largest upload', '2 GB', '25 GB'],
  ['Hubs you own', '3', '10'],
  ['Canvas in your Hubs', '300 notes per Room', '2,000 notes per Room + export'],
  ['Converter', 'One file at a time', 'Larger files + several at once'],
  ['Hub appearance', 'Standard', 'Custom banners, colours and Room icons'],
  ['Chat', 'Full history', 'Search across all your chats, and pinned messages'],
  ['New features', 'At launch', 'Early access'],
  ['Profile cosmetics', 'Standard', 'Themes, auras, animated picture and badge (after launch)'],
];
