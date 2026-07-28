// Point this at your running NexusIQ Finance backend.
//
// Local dev: run the backend (`python run.py` inside wealthos-backend/) and
// leave this as localhost — since this is a website running in your desktop
// browser (not a phone app), localhost correctly means "this same computer."
//
// Once you deploy the backend (e.g. Render, or your own domain), replace this
// with that https:// URL so the site works from anywhere, not just your machine.

export const API_BASE_URL = 'http://localhost:5050';
