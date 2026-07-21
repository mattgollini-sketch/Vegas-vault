# Vegas Vault

A single-page countdown planner for your next Las Vegas trip. Set your trip date and watch a live countdown, then track your hotel details, packing essentials, and a bucket list of restaurants, shows, spas, and nightclubs you want to hit. Everything is saved locally in your browser (`localStorage`) — no backend, no sign-up.

## Features

- Live days/hours/minutes/seconds countdown to your trip
- Hotel card: name, confirmation #, check-in/out, room type, notes
- Editable essentials packing checklist (pre-seeded with common items)
- Bucket-list tabs for Restaurants, Shows, Spas, and Nightclubs — add, check off, or remove items
- Data persists across reloads via `localStorage`
- Neon Vegas-themed, mobile-responsive design

## Running locally

This is a static site — no build step required.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Files

- `index.html` — markup and layout
- `style.css` — neon Vegas theme
- `app.js` — countdown logic, tab switching, and localStorage-backed checklists
