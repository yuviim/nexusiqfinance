// Point this at your running NexusIQ Finance backend.
//
// Local dev: leave VITE_API_BASE_URL unset — it falls back to localhost,
// which is correct since this is a website running in your desktop browser
// (not a phone app), so "localhost" means "this same computer."
//
// Production (Vercel etc.): set the VITE_API_BASE_URL environment variable
// in your hosting dashboard to your deployed backend's https:// URL. Vite
// only reads env vars prefixed with VITE_ and only at build time — after
// changing it in Vercel, you need a redeploy (not just a refresh) for it
// to take effect.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050';
