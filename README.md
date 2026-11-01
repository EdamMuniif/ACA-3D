# Arrow Cube Away — 3D Puzzle

A complete, original, mobile-friendly **3D arrow escape puzzle** built in plain HTML, CSS and JavaScript. No dependencies, frameworks, sign-ups, third-party assets, or build pipeline.

## Play

- **Drag** the cube with mouse or touch to examine different faces. Or use the rotate buttons.
- **Tap** a visible arrow to release it head-first, with the tail following the bends of its path.
- The arrow is **blocked** when another arrow occupies the straight outward exit ray beyond its arrowhead on the same face. The tail follows the arrow's existing path instead of sliding rigidly.
- Clear free arrows first, then newly unblocked arrows. Clear all faces to finish.
- A blocked tap removes one heart. You have five hearts per attempt. Hints are unlimited.
- Fifteen levels in three tiers: **Easy (1–5), Medium (6–10), Hard (11–15)**.
- Optional colorful arrow mode, sound effects, auto-saved unlocked levels and current level, and offline support.

## Run locally

Open `index.html` in a browser. For full progressive-web-app offline installation support, serve from localhost instead:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000. This is a static site. No npm install needed.

## Publish to GitHub Pages

1. Open the GitHub repository `EdamMuniif/ACA-3D`.
2. Keep **all files in the repository root**, especially `index.html` (leave `tests/` inside its folder).
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`, and save.
4. Your game will be served at `https://EdamMuniif.github.io/ACA-3D/` after GitHub finishes publishing.

Alternatively, use Git:

```bash
git init
git add .
git commit -m "Add Arrow Cube Away 3D playable game"
git branch -M main
git remote add origin https://github.com/EdamMuniif/ACA-3D.git
git push -u origin main
```

The app uses relative paths, so it works at GitHub Pages repository subpaths. After the first successful online load, the service worker caches the game for offline play in supporting browsers.

## Gameplay-reference update (V2)

The user-provided gameplay recording is the primary **behavioral reference**, not source code.
The first levels follow the observed density curve: **Level 1: 5 arrows, Level 2: 28,
Level 3: approximately 44, Level 4: 57**, with progressively denser generated stages
through Level 15 (150 arrows). All generated levels have deterministic seeds and
valid escape sequences; they are **not exact reconstructions of the original app's
proprietary per-arrow layouts**.

Rendering uses a vellum-paper cube with bold ink arrows. The arrow that is leaving
turns vermilion and glides head-first, tail following. A blocked tap draws a dashed
vermilion lane to the arrow in the way and rings that arrow in amber. Existing heart, hint, save, sound,
and touch controls remain available. The escape check now matches the visible head-first, tail-following animation. It is still a same-face model; multi-face paths and the original game's hidden collision rules are not confirmed from video.

## Design & puzzle guarantees

- `core.js`: deterministic puzzle generation, grid-cell collision detection, and level config. Independent of rendering, making it easy to test.
- `game.js`: perspective-projected 3D cube, touch/mouse rotation, arrow picking, animation, hearts, hints, level navigation, settings, and save data.
- `styles.css` and `index.html`: responsive user interface.
- `sw.js`: static offline caching (registered over HTTP(S), not `file://`).

Each generated arrow is admitted only if it can escape **with all previously placed arrows present**. Consequently, removing arrows in reverse insertion order is always a valid solution. This makes every generated level solvable, without relying on random player guessing. Faces can be solved independently; arrow collisions don't extend between distinct cube faces.

This is a standalone interpretation of the arrow-escape puzzle concept, not a pixel-for-pixel copy of another game's proprietary art or level data.

## Visual design

The "Orthographic Quiet" look (vellum paper, ink arrows, one rationed vermilion accent,
Instrument Serif and Instrument Sans) is described in `design/philosophy.md`; key art is
`design/key-art.png`. Fonts are bundled in `fonts/` (SIL OFL) so it works offline.

## Test puzzle logic

```bash
node --test tests/*.cjs
```

No packages are required. Browser smoke checks can be run with any modern Chromium, Firefox, or Safari browser.

## Accessibility / controls

- Touch, mouse, and keyboard work for cube rotation (arrow keys when the canvas is focused).
- `H` triggers a hint while the canvas is focused.
- Controls have labels and visible focus states.
- The game has a reduced-motion CSS mode and is responsive to mobile sizes.

## Notes

- Game progress is saved to `localStorage` on the current browser/device only, not synced to an account.
- Clearing site data also clears progress.
- On restrictive browsers or private mode, storage and sound may not be available; gameplay remains functional.
- Future expansions could include new handcrafted levels, 3D path bridges between faces, undo mode, and alternative skins.
## Gameplay logic and UI verification (V2 correction)

- **Fixed incorrect blocked moves:** The former rigid-translation collision model could reject clear head-first escapes. `getBlocker()` checks only the prospective outward ray of the arrowhead, consistent with the existing curved escape animation.
- **Full arrow counts:** When dense random placement runs out of long paths, a deterministic scan uses valid two-cell fallback arrows. Levels retain their target counts and remain solvable.
- **Actionable feedback:** A blocked tap highlights the blocking arrow; hit-testing adapts to grid density to reduce accidental selection on mobile.
- **Accessible movement:** Reduced-motion preference shortens arrow animation.
- **Visual polish:** Calmer cube stage, subtle instruction label, and mobile-friendly action layout.

The static UI remains framework-free. Tests cover all levels, arrow routing, blocker removal, and path motion. Future improvements should include assessing dependency depth as well as arrow count, plus custom authored/tutorial levels and cross-face paths.

## Complete game application (V6)

The app now has three mobile-friendly screens:

1. **Home** — enter a local player name, see points and completed stages, start or continue.
2. **Levels** — choose from 15 progressively harder stages. Locked levels cannot be opened.
3. **Play** — rotate the 3D cube, tap anywhere on an arrow body or arrowhead when its exit ray is clear, use hints, lose hearts for blocked moves, restart the current attempt, and advance on a win.

**Scoring rules:** A level is scored only when all its arrows escape:

```text
level score = 10 × cleared arrows + difficulty bonus + 25 × remaining hearts − 15 × hints used
difficulty bonus: Easy 25, Medium 75, Hard 150
minimum score: 0
```

Each level stores its personal best. Replaying a level adds to total points **only when the
new score beats its previous best**; restarting or losing an attempt does not award points.
Totals are recalculated from the 15 saved personal best scores.

**Player data:** Name, points, personal best scores, unlocked stages, completed stages,
audio and color settings are saved in the browser's existing `localStorage` key.
Older saves migrate automatically without discarding unlocked levels. The name is a
local display name only; there is no online account or leaderboard.

**Restart options:** Use *Restart* during play to start the current level with five hearts.
Use *Settings → Reset all progress and points* to begin from Level 1; this requires a
confirmation and keeps the player's name and preferences. Reset is irreversible on that device.

**Quality checks:** Run `node --test tests/*.test.cjs` to verify puzzle solvability,
score anti-farming, HTML element references, controller navigation, legacy-save migration,
and the offline cache. No app build tooling or runtime packages are required.

## Mobile usability update (V7)

Based on the supplied mobile Chrome screenshot, this release focuses on **navigation, readability,
and reducing the time between opening the page and starting the game** rather than modifying puzzle rules.

- The brand occupies its own header row at phone widths; Home, Levels, sound and settings
  form an accessible second row instead of being clipped offscreen.
- The home hero uses shorter copy, a clear **Play now / Continue** action, a Level Select action
  and a compact inline progress summary (current level, points, completed count).
- The large decorative hero illustration is kept on desktop but hidden on small screens
  so the player profile and progress appear sooner.
- Mobile-level selection uses bigger three-column tiles; in-game actions form a predictable
  two-column grid with a visible **Restart** control.
- Small-screen actions are at least 44px high and retain visible keyboard focus styling.
- Browser toolbar/footer UI belongs to the browser and cannot be changed by the website.
- All existing scoring, saves, game engine, audio, hints, and offline support are preserved.
- Asset URLs and service-worker cache are bumped to v7 to avoid old CSS and JS on mobile.

Run `node --test tests/*.test.cjs` to check navigation, DOM references, cache versions,
scoring and the game logic. Responsive visual testing on actual devices is recommended.

## V9: Five hearts and full-body arrow selection

- **Lives:** Each new or restarted level starts with five hearts. A blocked arrow still costs one heart. The game-over screen appears when all five are lost.
- **Bold arrows:** Arrow-body stroke width scales with each level's grid spacing (approximately 4.5–12 canvas pixels) to keep dense puzzles readable.
- **Touch:** Tap or click any part of a visible arrow line, bend, tail, or arrowhead. Touch picking considers the whole projected path and triangular tip, prefers the nearest stroke and the frontmost face when paths overlap, and tolerates slight finger drift without treating it as a rotation.
- **Preserved rules:** A move is only legal if the arrowhead's exit route is unblocked. Points still depend on remaining hearts, now up to five. Existing player progress remains untouched.

## V10 — visible triangular arrowheads

A regression in V9 made the winding arrow shafts thick without increasing their head sizes. V10 corrects that drawing mismatch: each arrow has a clearly distinguishable, filled, screen-space triangular head, sized relative to the stroke. The round-capped shaft ends at the triangle base so it cannot cover the point. Head geometry stays legible as the cube rotates; arrow lines, tails, head triangles, and bend segments remain touch targets. There are no changes to the puzzle collision rules, five-heart gameplay, saved scores, player names, or level progression. Regression tests cover multiple arrow directions, head geometry and touch detection.

## V19 — 3D edge-on arrow visibility fix

The user-provided rotation recording shows arrows collapsing into thick overlapping arrowhead bands along the silhouette of the cube. This is a rendering artifact from the projected perspective and large pixel-sized arrowheads, not a corrupted puzzle state.

**Fix:** Keep the cube's face outlines and grids visible through 360-degree rotation, but cull arrows completely when their face's camera-facing normal component is 0.28 or below. Fade arrows smoothly to full opacity at 0.66. Extremely faint rear-face hints only display when the back face is substantially turned away (at most -0.85); grazing faces cannot create edge clutter. Hint targeting follows visible arrows. Player progress, five hearts, level geometry, collision logic, and release animations remain unchanged.

## V20 — perspective-correct flat ink arrows

The 3D cube stays rotatable, but **every arrow is a flat 2D printed path on its corresponding cube face**, matching the user's reference images. Unlike the old fixed-pixel canvas strokes, the **thick shaft**, rounded bends and **triangular arrowhead** are constructed as flat, filled polygons in local face-grid coordinates. Their vertices are then projected through the cube's existing 3D camera, so their apparent thickness and head size foreshorten naturally when the cube tilts. No arrow depth, extrusion or billboard-style head is added.

- Ink body width: approximately **0.23 grid cell**; triangular head width: **0.50 cell**; this remains consistent across grid sizes and 3D orientations.
- Tap detection continues to use the **entire projected path and triangular head**; selection includes tail, bends, body, and tip. Existing touch-friendly padding is preserved.
- Animations still follow the arrow centerline head-first; board collision, five hearts, scoring, unlocked levels, player name and saved progress are unchanged.
- The V19 grazing-angle fade and ghost restrictions remain in place; cache version and asset URLs are now **V20**.

## V21 — compact Home UI

The home page has **one** progress summary, not duplicate counters in the hero and the progress card. The progress card shows total points, cleared levels, and highest unlocked level in one compact row with a progress bar. Two circular icon buttons at the **top-right of Home** open the editable Player Profile and How It Works panels. The panels are mutually exclusive, close when navigating away or pressing Escape, and are otherwise hidden to reduce scroll on phones. The home hero and artwork are smaller; the illustration is omitted on narrow screens. No player saves, puzzle mechanics, scoring, or level content change.

## V22 — 100 levels for friend testing

- **100 progressive levels** in six tiers: Easy 1–5, Medium 6–10, Hard 11–30, Expert 31–60, Master 61–85, Legend 86–100.
- **Levels 1–15 are unchanged** (same deterministic layout and scoring). Levels 16–100 use a new deterministic constructive generator with increasing target arrows (151 to 256), larger boards (15 to 18 cells), longer winding paths (up to 10 cells) and blocking-dependency weighting. A generated arrow is free when inserted, ensuring the board can be solved in reverse construction order.
- **100-level selection** is paged 20 at a time, with six tier groups and locked/completed/best-score states. The desktop sidebar shows nearby levels and a button to open the full selector.
- Existing save data migrates automatically; players who finished level 15 can continue on level 16 without replaying. Highest unlocked, completed count, progress percentage, and win flow now support 100 levels.
- Tier score bonuses: Easy 25, Medium 75, Hard 150, Expert 225, Master 300, Legend 400. Replays still award only the increase over the best score.
- The cube remains 3D with perspective-correct thick, flat printed arrows; full-body taps, five hearts, arrow escape physics, and audio settings are unchanged.
- **Before inviting friends**, verify generation and solvability via `node --test tests/*.test.cjs`, then perform a hands-on mobile check at Levels 1, 15, 16, 30, 60, and 100 (using a test save in an isolated browser only if needed). Unlocking follows sequential completion; no public leaderboard or online account is provided.

## V23 — viewport-fit home and animated cube showcase

- **Home app shell:** Home fills the available `100dvh` viewport on phones, iPhones, tablets, laptops and monitors, with an intentionally compact header, profile/help icons, primary Play and Levels actions, and a single progress summary. Normal viewport heights fit without body scrolling. On exceptionally short viewports or large text, the Home content area may scroll internally rather than cutting off accessible buttons. Level selection and gameplay retain their existing scrolling behavior.
- **Animated 3D cube:** Replaces the static SVG illustration with a lightweight, separate Canvas showcase using `Core.generateLevel(2)`, `getEscapeShape` and `buildFlatArrowGeometry`. The cube gently tilts, displays a perspective grid with face-colored, flat ink arrows, and releases a few available arrows head-first before looping. It does not read or write gameplay progress.
- The preview uses a capped device-pixel ratio and ~30fps painting, skips painting when the page is hidden, and displays a still cube when reduced motion is requested. No additional runtime dependency is required. A new regression test checks the animation, static fallback, screen states and offline asset caching.

## V24 — compact live cube preview, matching the home reference

The V23 animated cube was placed under the headline in a full-width mobile row, making it significantly larger than the supplied original preview. In V24 the **animated** showcase stays in the same compact top-right **side slot next to the 'Find the way out' headline** used by the previous static illustration. Intro copy and the Play/Levels buttons now occupy the full-width row below the headline and cube on phones. Desktop layouts retain a compact side preview. The status chips were removed to match the clean reference. The independent canvas uses a fit-to-bounds perspective camera calculated from all eight rotated cube corners, preventing the cube from clipping on 160–340 px canvas widths during tilt. Home stays within the viewport when practical, with its accessible internal-scroll fallback for small or zoomed screens. All 100 levels, player progress, scores, five hearts, gameplay, and offline support are unchanged. Regression tests cover DOM order, compact responsive positioning, and projection bounds on mobile/desktop sizes.

## V25 — stability and generator performance

V25 reuses the advanced generator's own face occupancy Set to check an arrow candidate's head-exit ray. This replaces two redundant candidate calls that rebuilt an occupancy Map on every attempt; public `getBlocker()` and the actual gameplay collision rules are unchanged. Fixed V24 fingerprints verify that all **100 original level layouts** retain exactly the same arrow IDs, faces, grid paths, ordering, arrow totals and difficulty configuration. A new single-pass `tests/levels-stability.test.cjs` verifies all levels' geometry, exact counts, and a legal reverse-construction solution, with generation timings and heap/RSS diagnostics. Run `node --test tests/*.test.cjs`. The offline cache and asset references are refreshed to V25. No player save, UI, scoring, arrow rendering or level content is changed.


## V26 — mobile readability and safer controls (candidate)

- Optional **Focus face** button renders only the cube face nearest the viewer; rotating automatically switches the visible face. This is view-only and does not alter collisions, puzzles, hearts or scores.
- Accessible zoom buttons allow **100%, 110%, or 120%** magnification, with camera and projected tap targets scaling together; zoom is limited to avoid excessive cropping.
- Two-pointer interactions cancel a pending single-finger action. If a touch begins on one arrow but releases over another, the ambiguous tap is ignored rather than costing a heart.
- Landscape layouts below 500 px viewport height can use a shorter play stage instead of the former fixed 360 px minimum.
- V26 adds regression checks for the view controls and landscape rules. V25 fixed hashes continue to protect all 100 existing puzzles.
- No changes to existing level generation, save format, scoring, hints, arrow geometry or the Home layout. Real-device playtesting at Levels 15, 60 and 100 remains required before merging.


## V27 — interactive tutorial (candidate)

- A separate four-step **practice cube** introduces rotation, blocked exit lanes, head-first arrow release, and the existing hint concept.
- First-time players see the tutorial before normal Level 1. Returning players with completed levels, higher unlocks or scores are not interrupted.
- **Skip tutorial** and **Replay interactive tutorial** controls are available; completion is recorded under a separate browser-local flag, without changing existing player saves.
- Tutorial actions use a small independent board, `Core.getBlocker()`, `Core.availableArrows()`, and `Core.getEscapeShape()`; there are no heart penalties, scores, unlocks, or changes to production levels.
- The tutorial is rendered with a small self-contained Canvas module. It works offline through the updated service-worker precache.
- Existing Level 1–100 board fingerprints remain frozen from V24. Node and browser regression tests are required before merge.
