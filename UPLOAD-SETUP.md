# Dev mode — screen recording uploads, elaborate project details, and hiding it from visitors

This adds a real PHP backend so "Dev mode" isn't just a client-side mock
anymore — uploaded screen recordings actually persist on the server, with
a 500MB total storage cap, and every project can now carry a full
description, a live link, and a repo link.

## ⚠️ Read this first — hosting requirements

**Vercel alone won't work for any of this.** Vercel's functions are
serverless with no persistent disk — a video "uploaded" there would
vanish the moment the function finishes running. That's fine, though:
Vercel can still host the **frontend** static pages just fine, as long as
the **backend** (`api/`, `data/`, `uploads/`) lives somewhere with real,
persistent PHP storage — InfinityFree, a VPS, or another shared PHP host.
See "Hosting split" below for exactly how to wire the two together.

**Whichever PHP host you pick:** free tiers commonly cap individual file
uploads around 5–10MB and limit execution time/memory, regardless of what
`.htaccess` requests. A 150MB screen recording will likely fail on a free
account. Options:
- Pay for a tier that removes the cap (InfinityFree's paid plans are
  cheap), or
- Try a few different free PHP hosts — caps vary and change over time,
  so what fails on one may work on another (see below), or
- Compress recordings before uploading (most screen-recording tools have
  a "web/compressed" export) so they land well under whatever cap your
  host enforces.

Either way, upload a small test recording first after deploying and
confirm it actually lands in `/uploads/videos/` before relying on it.

## What's new in this update

- **Bigger, less-congested work cards.** The "Our work" grid is now 2
  cards per row instead of 3, with a real click-to-expand "theater"
  lightbox — clicking a thumbnail opens a big video player with the full
  description, tags, and links laid out underneath it. Before you click,
  every project shows a colorful gradient thumbnail (unique per project
  name) with a play button, never an already-playing video sitting
  inline in the grid.
- **Team photos now upload through the dashboard**, not by hand-placing
  files on the server. Go to `dashboard.html` → Team roster → the photo
  upload box works exactly like the video upload box. Editing an existing
  member now works too (click the pencil icon), not just adding new ones.
- **Security fix:** `api/`, `data/`, and `uploads/` are no longer tracked
  in this Git repo (see `.gitignore`) — they were previously being pushed
  to the same repo Vercel deploys, which meant `config.php` (with your
  password hash inside) was technically downloadable from your live
  Vercel URL. Those folders still exist on your computer for your own
  reference and as a backup of what's live on WebHostMost — just don't
  `git add` them going forward.
- Cleaned out a handful of stray empty files (`1000`, `200`,
  `morphPeek(item)`, etc.) that were accidental artifacts from pasting
  code into a terminal at some point — harmless, just clutter.

### Deploying this update

**To WebHostMost** (upload these into `public_html`, overwriting what's there):
- `api/config.php`, `api/auth.php`, `api/projects.php` — updated to match
  what's already live (token-based auth), so this is mostly a formality
  to keep your local copy in sync, but push it anyway in case anything
  drifted.
- `api/team.php` — **new file**, required for team photo uploads to work.
- `uploads/team/.htaccess` — **new**, create the `uploads/team` folder if
  it doesn't exist and make sure it's writable (755).
- `data/team.json` — only upload this if `data/team.json` doesn't already
  exist on the server; if it does, leave the live one alone so you don't
  wipe out any team edits you've already made through the dashboard.

**To Vercel** (via your normal `git add . && git commit && git push`):
- Everything else — `index.html`, `work.html`, `team.html`,
  `dashboard.html`, `assets/`. Git will no longer try to push `api/`,
  `data/`, or `uploads/` at all now that they're gitignored.


If you don't want to pay for InfinityFree, you can host the static
frontend (`index.html`, `work.html`, etc.) on Vercel for free, and put
just the backend pieces (`api/`, `data/`, `uploads/`) on a separate free
PHP host. This is fully supported — the code is already set up for it.

**Reality check first:** the actual limiting factor was never
InfinityFree specifically — it's that *free* PHP hosting in general caps
individual uploads small (often 5–10MB) to stop people hosting large
files for free. Moving to a different free PHP host doesn't automatically
fix that. As of writing, hosts worth trying for the backend (PHP 8.3 +
MySQL, no cost): **WebHostMost** (no inode cap, better specs than most)
and **ByetHost** (5GB NVMe, unlimited databases) are reasonable current
picks — but upload a real ~100MB test file immediately after setting one
up and confirm it actually lands in `/uploads/videos/` before building
around it. If a host silently truncates or rejects it, try another one —
this varies a lot and changes over time.

### Setup steps

1. **Deploy the backend pieces** (`api/`, `data/`, `uploads/`, plus the
   root `.htaccess`) to your chosen PHP host. Make sure it's served over
   **HTTPS** — this isn't optional. Cross-site login cookies require
   `SameSite=None; Secure`, and browsers flatly refuse to store that kind
   of cookie over plain HTTP. Nearly every free PHP host issues a free
   SSL cert automatically; just confirm yours is actually active.

2. **In `api/config.php`** on the backend, fill in the two TODOs near the
   top:
   ```php
   define('BACKEND_URL', 'https://your-backend-host.example.com'); // no trailing slash
   $CORS_ALLOWED_ORIGINS = [
     'https://your-project.vercel.app', // your exact Vercel URL
   ];
   ```
   The origin has to match **exactly** (protocol, domain, no trailing
   slash) or the browser will silently block every request.

3. **Deploy the frontend** (everything except `api/`, `data/`,
   `uploads/`) to Vercel as-is — it's static files, no build step needed.

4. **In `assets/js/main.js`** on the frontend, set:
   ```js
   const API_BASE = "https://your-backend-host.example.com";
   ```
   (same value as `BACKEND_URL` above, no trailing slash).

5. Redeploy both sides and test: open `/dashboard.html` on the Vercel
   URL, sign in, and try uploading one small test file before trusting it
   with anything real.

If frontend and backend end up on the **same** domain instead (e.g. you
go back to one PHP host for everything), just leave `API_BASE = ""` and
skip steps 2 and 4 — everything reverts to relative same-origin requests
automatically.

## One-time setup (either hosting approach)

1. **Change the dev password.** The template ships with the password
   `authentech-dev` (hashed in `api/config.php`). Generate a new hash:
   ```
   php -r "echo password_hash('yourNewPassword', PASSWORD_DEFAULT);"
   ```
   Paste the result into `DEV_PASSWORD_HASH` in `api/config.php`, replacing
   the existing value.

2. **Make sure these folders are writable by PHP** (755 is normally
   enough — your host's file manager will let you chmod them if not):
   - `/data`
   - `/uploads/videos`

3. That's it — `data/projects.json` already comes seeded with your 8
   existing projects (no video attached yet), so the public Work page
   looks exactly like it does today until someone uploads a recording.

## Using it

- Go straight to `/dashboard.html` and enter the dev password.
- Upload a project: fill in the name, a short tagline (shows on the
  compact preview card), a full description (shows in the "Details"
  popup), the live site link, the repo link, tags, and a screen
  recording (.mp4, .webm, or .mov, up to 150MB).
- Existing projects can be edited the same way — click the pencil icon
  on any card to attach or replace its recording, or update any field.
- The storage meter at the top of the dashboard shows how much of the
  500MB total is used. If a new upload would go over, you'll get a clear
  error telling you how much room is left — delete an old recording
  (there's a "remove recording only" link under any project with one) to
  free up space without deleting the whole project.

## Where to put team & other images

There was no folder convention for these before, so:

- **Team photos:** create `assets/img/team/` (already included, currently
  empty) and drop in `team-1.jpg` through `team-5.jpg` — they map in
  order to the 5 cards on the Team page (Justin is `team-1.jpg`). Nothing
  breaks if some are missing — those cards just keep showing the icon
  placeholder until a matching file shows up.
- **Project thumbnails / other images:** the work is now done through
  screen recordings instead of static thumbnails, so there's no separate
  thumbnail upload — the first frame of the video effectively serves as
  the thumbnail. If you want a manually-chosen poster image later, that'd
  be a small follow-up (a `poster` field + `<video poster="...">`).

## How "hide dev mode" works now

The **Dev mode** button is gone from the sidebar for everyone by
default — regular visitors never see any trace of it. It only reappears
in the sidebar once your browser has actually signed in (checked
server-side via a PHP session, not just a hidden CSS class, so it's not
something someone can un-hide from devtools).

Developers reach it by going straight to `/dashboard.html`, which prompts
for the password before showing anything. Bookmark that URL — there's no
public link to it anywhere on the site anymore.

## What's new under the hood

- `api/config.php` — storage limits (500MB total / 150MB per file), the
  hashed dev password, and shared helpers.
- `api/auth.php` — login / logout / check, backed by a PHP session.
- `api/projects.php` — list / create / update / delete projects, plus
  upload handling and the storage meter endpoint.
- `data/projects.json` — the actual project data (seeded with your 8
  current projects). Protected from direct web access via `.htaccess`.
- `uploads/videos/` — where recordings actually live. PHP execution is
  disabled in this folder for security, even though only video files are
  ever written there.
- `assets/js/main.js` — new `AT.*` helper functions do all the fetch/XHR
  work; `dashboard.html`, `work.html`, and `index.html` all use them.
- `work.html` and the homepage's "Our work" preview now render from the
  live backend, but keep their old static content as a fallback if the
  backend can't be reached — so the site never breaks even before you
  deploy the PHP pieces.
