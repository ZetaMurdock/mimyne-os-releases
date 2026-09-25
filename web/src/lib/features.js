// Hubs, the feed, posts and messages run on sample data until the site is
// connected to Mimyne's Firebase. They're on while developing and off in
// the published site; build with VITE_SOCIAL=true to include them.
export const SOCIAL = import.meta.env.DEV || import.meta.env.VITE_SOCIAL === 'true';
