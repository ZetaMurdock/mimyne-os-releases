// Sign-in, Hubs, the feed, posts and messages. On while developing; the
// published site includes them when it's built with VITE_SOCIAL=true (set in
// .github/workflows/pages.yml).
export const SOCIAL = import.meta.env.DEV || import.meta.env.VITE_SOCIAL === 'true';
