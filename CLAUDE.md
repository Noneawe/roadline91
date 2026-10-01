# CLAUDE.md – ROADLINE '91 (WebGL2 edition)

This file is the main source of knowledge about the project. Read it in full before the first code change. If a user request contradicts this file, follow the request but point out the contradiction in the report.

---

## 1. About the project

**ROADLINE '91** (working title) is a browser racing game in the style of the early polygon racers from around 1990. Full 3D models made of simple, flat-shaded polygons, no textures. Rendering uses **WebGL2**, but the whole pipeline is designed so that the picture is indistinguishable from a game of the era:

- rendering into a **320×200** buffer, displayed at a 4:3 aspect ratio,
- every pixel is a **256-color palette index**, not an RGB color,
- flat shading with dithering in the low-resolution grid,
- no filtering, anti-aliasing or effects from outside the era.

Main features:

- a point-to-point route through varied terrain, divided by gas stations (checkpoints), with branches and shortcuts,
- cockpit view with working gauges and a rear-view mirror,
- 4 fictional sports cars from the late 80s / early 90s,
- two-way traffic, an AI rival,
- police with radars, chases, radar detector,
- time of day, rain, fog,
- outside cameras and replays,
- FM-synthesis style music and sound effects.

Goal: a smooth (60 FPS) game true to the era, working offline, also on weaker devices and phones, easy to tune by editing data rather than logic.

License: **AGPL-3.0-or-later** (see `LICENSE`). Every source file starts with an `SPDX-License-Identifier` line.

---

## 2. How we work

The project is built in 10 stages described in section 17. The user starts work with a request such as **"Implement stage 3"**. Then:

1. Read the stage description and its Definition of Done.
2. Do only that stage. Do not implement features of later stages "along the way". If something from a future stage needs preparation now, add a minimal hook and describe it in the report.
3. Follow the workflow of section 18 and finish with the report of section 19.

The user may also ask for a **"Review"** – then perform the review of section 18.4 without changing code.

---

## 3. Overriding rules (never break them)

1. **Original content only.** Fictional cars without the names, logos or characteristic silhouettes of real brands. No names of existing games, publishers or series in code, UI, comments or file names. Original music, no imitation of known melodies.
2. **No runtime dependencies.** Plain JavaScript (ES2020+, ES modules), WebGL2, Web Audio API. No libraries or GL helpers (Three.js, Babylon, regl, twgl, PicoGL and the like), no CDNs.
3. **The look of the era is mandatory.** The rules of section 8.1 apply. In particular: no image textures on 3D geometry, no linear filtering, MSAA, mipmaps, per-pixel lighting, shadows, bloom, HDR or smooth gradients outside the palette. If an effect requires breaking these rules, report it instead of adding it.
4. **No external assets.** Models, 2D graphics, font, shaders and sound are defined or generated in code. No PNG, OBJ, GLSL, MP3, WAV or TTF files at runtime (screenshots in `docs/` are documentation, not game assets).
5. **Do not break what works.** Every change keeps the features of completed stages. A regression means the task is not finished.
6. **No placeholders.** Never leave `// ...rest unchanged`, empty functions pretending to be done, or a `TODO` in place of existing logic.
7. **Parameters in CONFIG.** Keep all tunable numbers in `src/config.js`. No magic numbers in logic or shaders (pass values as uniforms or constants injected at compile time).
8. **Honesty.** Never claim something was tested when it was not. Never hide known problems.

---

## 4. Stage status

Update after completing a stage (`[ ]` → `[x]`) with the date. Tick a stage only when all criteria of section 17 are met.

- [x] Stage 1 – WebGL2 renderer with a palette index buffer (2026-09-30)
- [x] Stage 2 – road, terrain, camera (2026-09-30)
- [x] Stage 3 – car, physics, cockpit (2026-09-30)
- [x] Stage 4 – scenery, zones, time of day (2026-09-30)
- [x] Stage 5 – traffic, collisions, AI rival (2026-09-30)
- [x] Stage 6 – police (2026-09-30)
- [x] Stage 7 – full route, stations, branches (2026-09-30)
- [x] Stage 8 – FM sound (2026-10-01)
- [x] Stage 9 – cameras, replays, weather (2026-10-01)
- [ ] Stage 10 – menus, records, optimization, mobile (code done 2026-10-01; to be ticked after verification on a phone and with a gamepad)

---

## 5. Commands

Requirements: a browser with WebGL2, Node.js 18+ (only for the build and tests, no npm packages).

```bash
# Development (ES modules need an HTTP server)
python3 -m http.server 8080
# game: http://localhost:8080/index.html
# render tests: http://localhost:8080/tests/render.html

# Build into a single file (modules and shaders inlined)
node tools/build.mjs
# output: dist/roadline91.html – works when opened from disk (file://)

# Logic tests (node:assert, no framework)
node tools/test.mjs
```

Do not add a `package.json` with dependencies. The tools in `tools/` use only built-in Node modules.

The GitHub Pages site is built by `.github/workflows/pages.yml`: it runs the tests and the build, then publishes `site/index.html` (landing page), `play.html` (the built game) and `docs/screenshots/`.

### URL parameters (debug)

| Parameter | Effect |
|---|---|
| `?debug=1` | debug overlay (FPS, CPU/GPU frame time, triangles, draw calls, position, speed, rpm); the app object is available as `window.roadline` |
| `?scene=render` | renderer test scene of stage 1 |
| `?stress=1` | renderer test scene: extra grid of cars up to the 20,000 triangle budget |
| `?section=3` | start at the given track section |
| `?car=2` | car choice (0–3) |
| `?time=night` | time of day: `day`, `sunset`, `night` |
| `?weather=rain` | weather: `clear`, `rain`, `fog` |
| `?gearbox=manual` | manual gearbox (E/Q); automatic by default |
| `?units=mph` | mph units |
| `?seed=1234` | fixed RNG seed |
| `?mute=1` | audio muted |
| `?god=1` | no collisions, no police |
| `?wire=1` | wireframe mode |
| `?res=2` | internal resolution ×2 (640×400) – "enhanced" mode |
| `?rawpal=1` | index buffer shown as grayscale (palette diagnostics) |
| `?race=1` | start the race directly with the saved settings (no menu); any of `section`, `car`, `time`, `weather`, `gearbox`, `god`, `seed` also skips the menu |

Without these parameters the game starts at the title screen. Settings (car, time of day, weather, gearbox, difficulty, units, resolution, volumes, key bindings) and records live in `localStorage` (`roadline91.settings`, `roadline91.records`); URL parameters override settings without saving them.

Keys: **F1** toggles the debug overlay, **F2** wireframe, **F3** historical mode (15 FPS), **F4** simulates a WebGL context loss, **M** mutes the sound.

---

## 6. Directory structure

```
/
├── CLAUDE.md
├── CHANGELOG.md
├── README.md
├── LICENSE                 ← AGPL-3.0 text (the project is AGPL-3.0-or-later)
├── index.html
├── .github/workflows/pages.yml ← tests, build, GitHub Pages deployment
├── site/index.html         ← landing page of the GitHub Pages site
├── docs/screenshots/       ← screenshots for README and the site
├── tests/
│   └── render.html         ← render tests in the browser
├── src/
│   ├── main.js             ← bootstrap, game loop, screen switching, settings
│   ├── config.js           ← CONFIG
│   ├── storage.js          ← localStorage settings and records
│   ├── state/              ← screens: title, setup (car + options), controls, race
│   │                         (stations, pause, citation, replay), results (+ name entry),
│   │                         shared menu.js and showroom.js, renderScene (test scene)
│   ├── engine/
│   │   ├── loop.js         ← fixed timestep
│   │   ├── input.js        ← keyboard, gamepad, touch → actions, remapping
│   │   ├── rng.js          ← mulberry32
│   │   ├── grid.js         ← spatial grid
│   │   └── math3d.js       ← vec3, mat4 (Float32Array), allocation-free helpers
│   ├── gfx/
│   │   ├── gl.js           ← WebGL2 context, extensions, context loss
│   │   ├── program.js      ← shader compilation and linking, location cache
│   │   ├── targets.js      ← index framebuffer (R8UI) + depth
│   │   ├── palette.js      ← 256 palette, ramps, time-of-day and weather variants
│   │   ├── mesh.js         ← VBO/VAO from models, instancing
│   │   ├── renderer.js     ← pass orchestration, viewports, mirror, enhanced scale
│   │   ├── overlay.js      ← CPU 2D buffer (Uint8Array) + texture upload
│   │   ├── draw2d.js       ← 2D primitives in the overlay buffer
│   │   ├── font.js         ← 8×8 bitmap font
│   │   └── shaders/        ← GLSL sources as template strings in .js
│   │       ├── world.js    ← 3D geometry → palette index
│   │       ├── sky.js      ← sky and background fog in index space
│   │       ├── bayer.js    ← shared Bayer matrix
│   │       ├── wire.js     ← wireframe
│   │       └── present.js  ← indices + overlay → palette → screen
│   ├── models/             ← model definitions as data + loader (sportsCars.js: CAR_MODELS)
│   ├── world/
│   │   ├── track.js        ← road data from pieces
│   │   ├── roads.js        ← main road and branches
│   │   ├── terrain.js      ← terrain around the road
│   │   ├── surface.js      ← height and surface under the wheels
│   │   ├── scenery.js      ← object placement
│   │   ├── sky.js          ← background mountains
│   │   ├── chunks.js       ← chunks, frustum, distance
│   │   ├── validate.js     ← track validator
│   │   └── world.js        ← world state, environment, drawing
│   ├── vehicle/            ← physics.js, drivetrain.js, cars.js
│   ├── ai/                 ← traffic.js, rival.js, police.js
│   ├── game/               ← race.js, collision.js, replay.js, weather.js
│   ├── cockpit/            ← dashboard, gauges, citation, station screen, touch buttons
│   ├── camera/             ← cockpit, chase, top, roadside
│   ├── audio/              ← mixer.js, fm.js, sequencer.js, songs.js, sfx.js
│   └── data/               ← track-main.js, zones.js
├── tools/
│   ├── build.mjs
│   ├── test.mjs
│   └── golden/             ← golden index buffer dumps (.bin) for tests/render.html
└── dist/                   ← generated, not committed, never edit by hand
```

Rules:

- One module = one responsibility.
- `gfx/` knows nothing about the game. It takes meshes, matrices, a camera, a palette and the overlay buffer.
- `render` never changes game state, `update` never draws.
- `engine/math3d.js`, `models/`, `vehicle/`, `world/track.js`, `world/terrain.js` (geometry data, no GL) and the validators must not touch `window`, `document` or WebGL, so they can be tested in Node. Building vertex data (Float32Array) is separate from uploading it to the GPU.

---

## 7. Code conventions

- ES modules, `const`/`let`, no `var`. Plain objects and functions; classes only for things with a lifecycle (vehicles, states, GL resources).
- Everything in the repository is **in English**: identifiers, comments, UI, `CLAUDE.md`, `CHANGELOG.md`, `README.md`. Reports to the user are written in the user's language.
- `camelCase` variables and functions, `PascalCase` classes, `UPPER_SNAKE_CASE` constants.
- Every file starts with the SPDX line and a 1–3 sentence comment on its purpose.
- Exported functions have JSDoc with types.
- Functions up to about 60 lines.
- **No allocation in the hot loop.** Temporary vectors and matrices from pools. Uniforms sent from preallocated `Float32Array`s. Use `hypot2`/`hypot3` instead of `Math.hypot`.
- No `console.log` in production code; diagnostics through the debug overlay, active only with `?debug=1`.
- Exceptions in audio and storage must never stop the game loop.

### GLSL conventions

- `#version 300 es`, `precision highp float;`, `precision highp usampler2D;` for integer textures.
- Shaders as template strings in `gfx/shaders/*.js`, exported as `{ vs, fs }`. Constants from CONFIG injected as `#define` at compile time or passed as uniforms.
- Names: attributes `a_`, uniforms `u_`, varyings `v_`.
- Every shader has a header comment: inputs, outputs, purpose.
- Compile and link errors are always reported with the log and line number (shown on screen in debug mode).
- Uniform and attribute locations are looked up once, at link time.

---

## 8. Renderer – specification

### 8.1 Rules of the era look

- Internal resolution **320×200** (optionally ×2 in "enhanced" mode, with the same rules).
- The world render outputs **palette indices**, not colors.
- 256-color palette with brightness ramps (8.3).
- Flat shading: one brightness level per face, computed from the face normal and one directional light.
- Dithering only with a 4×4 Bayer pattern in the pixel grid of the index buffer.
- None of: linear filtering, MSAA, mipmaps, textures on 3D geometry, per-pixel lighting, dynamic shadows, post-processing effects beyond those described here.
- Fog and distance fading done by dithering in index space (8.5), never by blending colors.

### 8.2 Render targets

- **Index buffer:** `R8UI` 320×200 texture + `DEPTH_COMPONENT24` renderbuffer. All 3D and sky passes write a `uint` palette index here (`layout(location=0) out uint o_index;`).
- **2D overlay:** `Uint8Array(320*200)` drawn on the CPU (cockpit, HUD, font, raindrops, cracked windshield, menus), uploaded every frame with `texSubImage2D` into an `R8UI` texture. Index `0` = transparent. In enhanced mode the overlay stays 320×200.
- **Palette:** `RGBA8` 256×1 texture, updated when the palette changes (time of day, zone, color cycling).
- **Bayer:** constants in the shader (16-value array) – no texture.
- All textures use `NEAREST` filters, no mipmaps, `CLAMP_TO_EDGE`.
- Integer textures are read only with `texelFetch`.

### 8.3 Palette

- 256 colors: **16 ramps × 16 brightness levels**. Index = `ramp * 16 + level`, `level 0` = darkest.
- Index `0` is reserved: transparent in the overlay, black in the world.
- Ramps (fixed order, names in `palette.js`): black/gray, asphalt, road lines, grass, forest, sand, rock, water, sky, sunset, paint 1–4, brick, lights (emissive).
- Palette variants for time of day and weather are generated on the CPU from the base palette. Transitions interpolate palette colors (never indices); the result is uploaded to the palette texture.
- Emissive colors ignore lighting and fog up to a set distance.

### 8.4 Passes in a frame

1. **Bind the index buffer**, 320×200 viewport (×scale), `clearBufferuiv` and depth clear.
2. **Sky** (`sky.js`): fullscreen triangle without depth writes; index from gradient bands depending on screen height and camera angle, transitions dithered; an infinite ground plane below the horizon.
3. **Background mountains:** flat polygons at "infinite" distance, no depth writes.
4. **3D world** (`world.js`): static chunks, instanced objects, vehicles. Depth test and write, backface culling (`gl.CULL_FACE`), double-sided faces in a separate draw call.
5. **Road lines:** on the asphalt with a minimal geometry offset.
6. **Rear-view mirror:** the same buffer, `scissor` + viewport on the mirror rectangle, depth cleared in that area, shorter draw distance and lower LOD.
7. **Wireframe** (optional): `gl.LINES` from a separate edge buffer.
8. **CPU overlay:** `Uint8Array` upload to the texture.
9. **Present** (`present.js`): bind the default framebuffer, viewport with a 4:3 letterbox, fullscreen triangle; the shader fetches the overlay – if ≠ 0 it is used, otherwise the world index; then fetches the palette and writes the color.

### 8.5 World shader

Per-vertex input (non-indexed geometry – every triangle has its own 3 vertices):

- `a_pos` (vec3),
- `a_normal` (vec3) – face normal, identical for the 3 vertices,
- `a_ramp` (uint), `a_baseLevel` (uint), `a_flags` (uint).

Instanced objects additionally have the model matrix as 4 `vec4` attributes with `vertexAttribDivisor = 1` (program variant with `#define INSTANCED`; without it the matrix is the `u_model` uniform).

Vertex shader:

- computes `level = ambient + diffuse * max(0, dot(n_world, -lightDir))` as a float on the 0–15 scale (relative to `a_baseLevel`),
- passes ramp and level as `flat` varyings and the position relative to the camera as an ordinary (interpolated) varying; the fog factor is computed in the fragment shader from the length of that vector (`flat` fog would show seams on quad diagonals – provoking vertex).

Fragment shader:

- Bayer threshold from `gl_FragCoord.xy` (index buffer grid),
- `level` rounded up or down by its fractional part and the threshold (brightness dithering),
- fog: if `fog > Bayer threshold`, output the fog/sky ramp index, otherwise the object index ("raster" fog, as in the era),
- flags: `EMIT` (1) skips lighting and fog up to 85% of the distance, `NIGHT_ONLY` (2) – face drawn only at night, `DITHER` (4) – screen-door transparency,
- headlights (night): the lighting factor grows in a wedge in front of the car (uniforms `u_lampRel`, `u_lampDir`, `u_lamp`) before level dithering, so the wedge edge is dithered; the cone is 3D, faces turned away from the lamp stay unlit, and the reach in 16 wedge sectors (`u_lampReach`) is shortened on the CPU by buildings and walls (`castLight`) – the only exception to the dynamic shadow ban of 8.1, added at the user's request,
- headlights of other vehicles (night): up to 6 nearest AI cars (`u_carLamp*`), the same cone, no blocking,
- police beacon (night): faces within a radius switch with dithering to the beacon color ramp (`u_beacon*`),
- street lamps (night): up to 8 nearest lamps (`u_lights`) brighten the faces below them within a radius from CONFIG, also before level dithering,
- output: `o_index = ramp * 16u + uint(level)`.

### 8.6 Geometry organization

- The world is divided into **chunks** along the track (200 m). Each chunk has one VBO with road and terrain, built once at load time.
- Repeated objects (trees, poles, signs) are drawn with **instancing** (`drawArraysInstanced`), one draw call per object type and chunk.
- Vehicles: one VBO per model (+ LOD), model matrix and paint color as uniforms.
- Budget: **≤ 300 draw calls** per frame including the mirror.

### 8.7 WebGL context

- WebGL2 is required; without it – a readable message screen, no "silent" failure and no WebGL1 fallback.
- The context is created with `antialias: false`, `depth: false` (depth only in the index buffer), `alpha: false`, `preserveDrawingBuffer: false`, `powerPreference: 'high-performance'`.
- `webglcontextlost` / `webglcontextrestored`: pause the game, rebuild all GL resources from CPU data, resume. Every GL resource must be rebuildable. Changing screens frees the previous scene's buffers (`renderer.releaseAll`).

---

## 9. Coordinate system and units

- World unit: **1 = 1 meter**.
- Right-handed system: **X right, Y up, Z backwards** (the camera looks along `-Z`), as in WebGL.
- Projection from a horizontal FOV in CONFIG and the **4:3 display** aspect (not 320:200), so the picture is not stretched.
- Angles in radians in code; in track data and CONFIG in degrees.
- Speed internally in m/s, in the UI in km/h or mph.
- Time in seconds.

---

## 10. Model format

Models in `src/models/` as data:

```js
export const WEDGE_COUPE = {
  name: 'wedgeCoupe',
  verts: [
    [-0.9, 0.3, 2.1], // [x, y, z] in meters, y = 0 at axle height
    // ...
  ],
  faces: [
    // [vertex indices CCW seen from outside, ramp, base level, flags]
    [0, 1, 2, 'body', 10, 0],
    [2, 3, 4, 5, 'glass', 4, 0], // quad, triangulated at load time
    [6, 7, 8, 'lights', 15, EMIT],
  ],
  lod: [{ dist: 120, model: 'wedgeCoupeLod' }],
  collider: { type: 'box', size: [1.8, 1.2, 4.3] },
};
```

- The `'body'` ramp is a placeholder replaced by a uniform with the paint color.
- Flags: `EMIT` (1), `NIGHT_ONLY` (2), `DITHER` (4, Bayer screen-door transparency).
- The loader (no GL, testable in Node) triangulates polygons, computes face normals and bounding spheres, validates indices and builds the non-indexed `Float32Array`/`Uint8Array` vertex data in the layout of 8.5. `gfx/mesh.js` only uploads that data to the GPU.
- Triangle budgets: player and rival cars 150–400, traffic 80–200, scenery objects 4–40, far LOD ≤ 50% of the base model. WebGL has headroom, but **low-poly is part of the style** – do not raise model detail beyond these budgets.

### Cars (fictional)

| No. | Name | Character |
|---|---|---|
| 0 | Vektor GT | wedge coupé with pop-up lamps, all-rounder |
| 1 | Aurora MR | low mid-engine GT, the fastest, nervous |
| 2 | Breeze R | light roadster, great in corners, low top speed |
| 3 | Kestrel S | sports sedan, stable, good in the rain |

Names and silhouettes must stay original. Never base models on specific real cars.

---

## 11. Track format

The track lives in `src/data/track-main.js` as a list of sections:

```js
export const TRACK = {
  name: 'Coastline to Sierra',
  sections: [
    {
      id: 1, zone: 'coast', station: 'Seaside Gas',
      pieces: [
        // len: m, curve: deg/100 m (+ right), grade: %, bank: deg
        { len: 400, curve: 0, grade: 0, bank: 0 },
        { len: 250, curve: 12, grade: 2, bank: 4 },
        { len: 300, curve: -8, grade: -3, bank: -3, bridge: true },
      ],
      width: 8,
      scenery: [
        { rule: 'every', spacing: 25, obj: 'palm', side: 'both', offset: [7, 15] },
        { rule: 'at', pos: 900, obj: 'signCurveRight', side: 'right', offset: 5 },
      ],
      traffic: { density: 0.5, types: ['sedan', 'van'] },
      police: [{ pos: 1200, side: 'right', radarRange: 250, limit: 90 }],
      branches: [],
    },
  ],
};
```

A piece may have its own zone (`zone: 'snow'`), different from the section's – the zone's palette, hills and objects change smoothly in the middle of a section. Piece flags:

- `canyon: true` – steep rock walls on both sides, acting as a barrier,
- `lake: 'left' | 'right'` – lake with a guard rail on that side, a high mountain on the other,
- `sea: 'left' | 'right'` – cliff above the sea with a guard rail on that side,
- `cliff: 'left' | 'right'` – drop with a guard rail on that side, mountainside on the other; terrain between neighbouring roads or hairpins is a flat ramp joining their heights,
- `bridge: true` – bridge over water; railings and piers are placed automatically,
- `tunnel: true` – terrain rises over the road by `terrain.tunnelRise`; tunnel segments and portals are placed automatically,
- `flat: true` – leveled terrain, e.g. a rest area.

The terrain before every station levels itself, and the station has buildings and a parking lot with cars.

### 11.0 Scenery rules

Fields of a `scenery` rule: `rule` (`every` | `at`), `obj` (name from `models/scenery.js`), `side` (`left` | `right` | `both` | `center`), `offset` (m from the shoulder edge, a number or `[min, max]`); for `every`: `spacing`, optionally `from`, `to` (m from the start of the section), `jitter` (0–1, random shift along the road); for `at`: `pos`; optionally `where` (`land` by default, `bridge`, `any`). A zone (`data/zones.js`) adds its own rules to every section. Sections are joined into one centerline in the order of the `sections` array.

### 11.1 Branches

The main road is all sections joined in order. A branch is a separate road that leaves the main road and rejoins it:

```js
branches: [
  { at: 1000, side: 'left', surface: 'gravel', // m from the section start, side, 'asphalt' | 'gravel'
    pieces: [...], scenery: [...],              // as in a section; zone = the section's (or `zone`)
    rejoin: { section: 3, pos: 2000 } },        // rejoin point on the main road
]
```

- The branch pieces must roughly reach the rejoin point; the builder closes the rest (≤ 8% of the length) with a gentle bend, a larger error is reported by the validator. The angle at the rejoin point ≤ 35°.
- Where a branch overlaps the main road (< `junctionGap`), it is drawn 10 cm lower, so it looks as if it peels off.
- The terrain of every road ends halfway to the nearest other road (or another part of the same road, e.g. in a hairpin) and flattens when squeezed; the terrain strip edges have "skirts" covering gaps.
- Traffic, the rival and the police drive only on the main road; on a branch the player's progress is mapped proportionally between the fork and the rejoin point.
- Signs before curves (curvature ≥ `signCurve`) and before branches are placed automatically from the geometry; so is the gas station at the end of every section with a `station` field.

### 11.2 Rules

- Logic must not contain conditions on specific section IDs.
- Height and curvature transitions between pieces are smoothed (easing); the data describes target values.
- The validator (`world/validate.js`, section 16.1) runs in the tests and at start in debug mode (first error in the debug overlay).
- Physics and AI use the track data on the CPU (sampling height and normal), never GPU data.

---

## 12. Driving model

Arcade-sim: believable but fun.

- **Engine:** torque curve as a list of points (rpm → Nm), linearly interpolated; ignition cut at the redline.
- **Gearbox:** 5 gears + reverse, ratios per car; automatic by rpm thresholds; manual with keys.
- **Longitudinal forces:** drive, rolling resistance, air drag (∝ v²), brakes, gravity component on slopes.
- **Lateral forces:** simplified bicycle model with front/rear slip angles and a grip limit depending on surface and weather; slides can be countered.
- **Road banking** reduces the required lateral force.
- **Surface contact:** height and normal sampled under the 4 wheels; body roll and dive are visual only.
- All coefficients in CONFIG and `cars.js` (including `rainLoss`: the share of the rain's grip loss a car suffers).

---

## 13. Audio

- One `AudioContext`, created on the first interaction; everything in `try/catch`.
- `GainNode` channels: `music`, `sfx`, `engine`, `ambient`; the player sets overall, music and effects volume in the menus.
- **FM synthesis:** a modulator oscillator connected to the carrier oscillator's `frequency`, ADSR envelopes with `setValueAtTime` / `linearRampToValueAtTime`. Instruments as data.
- **Sequencer:** lookahead scheduling on `audioCtx.currentTime` (a timer every ~25 ms schedules notes ~100 ms ahead).
- Engine: continuous oscillators, frequency and timbre from rpm and load, changes via `setTargetAtTime`.
- Siren with Doppler effect.
- One-shot effect nodes are disconnected when they finish.

---

## 14. Controls

Input is mapped to **actions**. Game logic reads actions only. Default bindings:

| Action | Keyboard | Gamepad |
|---|---|---|
| `throttle` | ↑ / W | RT / A |
| `brake` | ↓ / S | LT / B |
| `steerLeft` / `steerRight` | ← → / A D | left stick (analog), D-pad |
| `gearUp` / `gearDown` | E / Q | RB / LB |
| `horn` | H | L3 |
| `camera` | C | Y |
| `lookBack` | V | R3 |
| `replay` | R | Back |
| `pause` | Esc / P | Start |
| `confirm` | Enter | A |
| `back` | Esc / Backspace | B |
| `up` / `down` / `left` / `right` (menus) | ↑ ↓ ← → / WASD | D-pad, left stick |

- Driving actions (`throttle`, `brake`, `steerLeft`, `steerRight`, `gearUp`, `gearDown`, `horn`, `camera`, `lookBack`, `replay`, `pause`) can be remapped on the CONTROLS screen (title menu and pause menu; keyboard and gamepad, saved with the settings). Menu keys, F1–F4 and M are fixed.
- In a replay: P pause, ←/→ rewind/fast forward, C camera, R/Enter exit.
- Keyboard steering builds up and returns to zero (CONFIG); stick steering is analog with a dead zone.
- Gamepads may be connected and disconnected during the game.
- Touch: on-screen buttons drawn in the overlay, mapped to the same actions; menu rows can be tapped.

---

## 15. Performance

Budgets:

- **Mid-range desktop:** stable 60 FPS, CPU frame time < 6 ms.
- **Mid-range phone:** 60 FPS at 320×200, at least 30 FPS in ×2 mode.
- Up to **20,000 triangles** per frame including the mirror.
- **≤ 300 draw calls** per frame.
- No GC pauses while driving.
- `dist/roadline91.html` < 1.5 MB.

Mandatory techniques:

- static geometry in VBOs built once (per chunk),
- instancing for repeated objects,
- per-chunk and per-object culling (sphere vs frustum) on the CPU,
- LOD for cars and dense objects,
- minimal state changes: draw calls sorted by program and VAO,
- no `readPixels`, `getError` or synchronous queries in the game loop (`getError` only in debug mode),
- one overlay upload (64 KB) per frame, no texture reallocation.

The draw distance may be larger than in a software renderer, but pop-in remains part of the style (values in CONFIG, moderate by default). Historical mode (F3): rendering at 15 FPS (physics still 60 Hz), draw distance × 0.6. GPU time in the debug overlay is measured with `EXT_disjoint_timer_query_webgl2` when available, otherwise "N/D". For changes affecting performance, report measurements before and after (FPS, frame time, triangles, draw calls).

---

## 16. Testing

### 16.1 Automatic tests (`node tools/test.mjs`)

- 3D math: matrices, inverse, lookAt, 4:3 projection,
- model loader: valid indices, triangulation, normals, vertex layout of 8.5, triangle budgets,
- road and terrain geometry: continuous edges between chunks, no degenerate triangles,
- palette: 256 entries, correct ramps, monotonic brightness within a ramp, correct time-of-day and weather variants,
- track validation: continuity, branches, stations, existence of zones, objects and models,
- physics: top speed in every gear, braking distance, 0–100 km/h within the ranges of `cars.js`, handling, distinct car characters,
- audio sequencing, replay, cameras, menus, storage, key remapping,
- determinism: same seed → same results.

### 16.2 Render tests (`tests/render.html`)

A browser page renders reference scenes (cube, car, road pieces, sky, fog, cockpit, night, weather...) into the index buffer, reads it back with `readPixels` (format `RGBA_INTEGER`, type `UNSIGNED_INT`) and compares it with the goldens in `tools/golden/`:

- allowed difference: **≤ 0.5% of pixels** (GPU differences at triangle edges),
- also checked: all indices belong to the palette, ramp histogram matches the golden, no pixels with index 0 in the world area,
- PASS/FAIL per scene with a difference preview. The "Save as golden" button downloads a `.bin` file; always describe golden updates and their reason in the report.

### 16.3 Manual smoke test

1. Start from the title screen into a race without console or GL errors.
2. Driving: straight, curve, serpentine, climb, bridge.
3. A slide and the counter-steer in a curve.
4. Collision with a car and with an object, restart after a crash.
5. Pause, resume, switching tabs and back.
6. Context loss (F4) and restore – the game comes back without errors.
7. Radar and chase.
8. Station and branch.
9. Sound after interaction, muting, volume settings.
10. Replay, camera changes, rain, fog.
11. Build and run `dist/` from `file://`.
12. Visual comparison with the style: sharp pixels, no blur, no colors outside the palette (`?rawpal=1`).

If you cannot run a browser, say so plainly and list the points for the user to verify.

---

## 17. Stages

### Stage 1 – WebGL2 renderer with a palette index buffer

**Scope:** `gfx/gl.js` (WebGL2 context with the options of 8.7, error screen without WebGL2, context loss and restore, F4 for tests); `gfx/program.js` (compilation, linking, error reporting with lines); `gfx/targets.js` (R8UI 320×200 index buffer + depth); `gfx/palette.js` (16×16 palette, 256×1 texture, `?rawpal=1`); shaders `world.js` (flat shading, Bayer dithering, `flat` varyings, index output), `present.js` (4:3 letterbox, palette lookup), `wire.js`; `gfx/overlay.js`, `draw2d.js`, `font.js` (CPU overlay and 8×8 font; the debug overlay uses this path); `engine/math3d.js` and the model loader without GL, with Node tests; test models: cube, pyramid, Vektor GT (150–250 triangles); `?scene=render`: rotating objects, mouse and keyboard camera, objects crossing the near plane, wireframe; `tests/render.html` with the first goldens.

**Definition of Done:** sharp, pixelated picture at 4:3 without blur at any window size; `?rawpal=1` confirms every world pixel is a valid palette index; flat shading and dithering visible in the 320×200 grid (not the screen's); context loss (F4) and restore work; 60 FPS at 20,000 triangles; Node tests and `tests/render.html` pass.

### Stage 2 – road, terrain, camera

**Scope:** `world/track.js` (road mesh data from pieces, section 11: asphalt, center and edge lines, shoulder); `world/terrain.js` (terrain strip with hills fitted to the road); `world/chunks.js` (chunks with VBOs, frustum culling and distance from CONFIG); sky (`sky.js`) with dithered bands, background mountains; raster fog dithered at the distance limit; a ~5 km test track: straight, curves, serpentine, climb, descent, bridge; a temporary camera driving along the road.

**Definition of Done:** continuous road without gaps between pieces and chunks; road lines without z-fighting at any distance; banking and grades look natural; pop-in at a fixed distance, masked by dithered fog; 60 FPS looking along a long straight.

### Stage 3 – car, physics, cockpit

**Scope:** `vehicle/` (driving model of section 12, Vektor GT parameters); contact with road and terrain, less grip off the asphalt; `camera/` (cockpit with sway, chase camera); `cockpit/` (pixel-art dashboard in the CPU overlay, tachometer and speedometer with needles, gear indicator); rear-view mirror (render into an index buffer rectangle with `scissor`, shorter distance and lower LOD); `engine/input.js` (keyboard and Gamepad API).

**Definition of Done:** entering a curve too fast ends in a counterable slide; the car slows uphill and speeds up downhill; needles move smoothly, gears work in automatic and manual; the mirror works, FPS ≥ 60, draw calls within budget; physics tests pass, no regressions in stages 1–2.

### Stage 4 – scenery, zones, time of day

**Scope:** low-poly object library (conifers and deciduous trees, palms, bushes, cacti, rocks, power poles, signs, guard rails, buildings, barn, gas station, tunnel, truss bridge); `world/scenery.js` (placement from data rules and a seeded RNG, instanced drawing); `data/zones.js` (coast, mountains, desert, forest, suburbs, highway zones with their own ramps and object sets, smooth palette transitions); time of day: day, sunset, night (palette variants); night: headlights as a brightness boost in a wedge in front of the car (computed in the world shader, still in index space and dithered), object lights as emissive points, street lamps; colliding objects marked in the data.

**Definition of Done:** every zone has a clear color character; times of day work in every zone without "broken" colors; night is readable and playable, the headlight wedge has a dithered, not smooth, edge; 60 FPS and the draw call budget in the densest forest.

### Stage 5 – traffic, collisions, AI rival

**Scope:** models: sedan, wagon, van, truck (+ LOD); `ai/traffic.js` (two-way traffic, lane keeping, slowing down, rare overtaking, a vehicle pool around the player); `game/collision.js` (OBB or simplified shapes; player ↔ traffic, rival, objects); a high-speed crash: cracked windshield in the overlay, stop, restart at a safe spot, time penalty; `ai/rival.js` (rival with an optimal line, braking before curves, avoiding traffic, difficulty in CONFIG); HUD: distance to the rival.

**Definition of Done:** no vehicles passing through each other; the rival drives believably and never cuts through terrain; a restart never puts the player inside an obstacle or in front of an oncoming car; the rival can be beaten on normal difficulty.

### Stage 6 – police

**Scope:** `ai/police.js` (police cars from track data, radar range, limit); radar detector in the cockpit (LED and growing signal); chase: flashing beacons (emissive faces toggled alternately), siren, attempts to overtake and block; stop: citation screen, time penalty; escape after a distance from CONFIG; three stops end the race.

**Definition of Done:** the detector gives a real chance to slow down; escape is possible but demanding; the police car never teleports or passes through traffic.

### Stage 7 – full route, stations, branches

**Scope:** `data/track-main.js` (6 sections in different zones, each ending at a station); `station` state (split time, comparison with the rival, time of day for the next section, route map); at least 2 branches, including a gravel shortcut; signs announcing curves and branches; track validator in the tests and at start in debug mode.

**Definition of Done:** a full run takes about fifteen minutes; branches join the rest of the route smoothly; the shortcut gives a real but not obvious gain; the track can be edited without changing logic.

### Stage 8 – FM sound

**Scope:** `audio/fm.js`, `sequencer.js`, `songs.js` (3 original songs – menu, driving, results – in the style of FM sound cards); engine dependent on rpm and load, a different character per car; effects: tyre squeal, crash, siren with Doppler, radar detector, horn, rain, gear change; separate volumes, mute, start after interaction.

**Definition of Done:** the music sounds musical and of its era; the engine has no clicks and changes smoothly; the siren clearly approaches and recedes; no AudioContext errors.

### Stage 9 – cameras, replays, weather

**Scope:** cameras: cockpit, chase, top, roadside (automatic switching in replays); `game/replay.js` (ring buffer of the last 60 s, playback with pause, rewind and camera changes); `game/weather.js`: rain (drops in the overlay, darker palette variant, wet asphalt as a different ramp, less grip, wipers), fog (shorter distance, stronger dithered fog).

**Definition of Done:** a faithful replay without drifting positions; cameras never pass through terrain; rain clearly changes the driving; fog keeps the dithered look without smooth transitions.

### Stage 10 – menus, records, optimization, mobile

**Scope:** title screen with a rotating car and palette color cycling (shifting palette texture entries); choice of car (the 4 cars of section 10), track, time of day, weather, gearbox, difficulty, units and resolution (×1 / ×2); pause, results screen with split times, records in localStorage; historical mode (F3); touch controls, landscape orientation, fullscreen, resize; optimization per section 15; cleanup: dead code, comments, complete CONFIG, CHANGELOG with known bugs.

**Definition of Done:** the whole menu works with keyboard, gamepad and touch; every car has a clearly different driving character; records survive a page reload; the performance budgets of section 15 are met on desktop and phone; the list of known problems is honest.

---

## 18. Workflow

### 18.1 Before a change

1. Read this file and `CHANGELOG.md`.
2. Read the modules involved and their dependencies. Do not guess the APIs of existing functions.
3. Run `node tools/test.mjs` to know the starting state.
4. If the request is ambiguous in a way that changes the result, ask one specific question. Decide minor matters yourself and describe them in the report.

### 18.2 During

- Small steps, tests after every larger step.
- Do not refactor code outside the scope; describe problems in the report.
- A change of the model, vertex or track format requires updating sections 8.5, 10 or 11 and the validators.
- Check every new shader or pass with `?rawpal=1` and `?wire=1`.

### 18.3 After a change

1. Logic tests green; render tests green or a clear note that the user has to run them.
2. `node tools/build.mjs` without errors.
3. The smoke test of section 16.3, or a clear note that it was not done.
4. An entry in `CHANGELOG.md`.
5. Update section 4 if a stage is complete.
6. Report (section 19).

### 18.4 Review (on the request "Review")

Without changing code, review the project and list:

- regressions of features of completed stages,
- allocations in the render and update loops,
- violations of the era look (section 8.1): filtering, colors outside the palette, smooth gradients, effects outside the specification,
- GL resources that would not be rebuilt after a context loss,
- unnecessary GL state changes, excess draw calls, synchronous calls in the loop,
- places breaking the rules of section 3 and the conventions of section 7,
- discrepancies between the code and this file.

---

## 19. Report format (in the user's language)

```
## Summary
One or two sentences: what was done.
## Changes
- file: what and why
## Tests
- automatic: result
- render: result (updated goldens and the reason, if any)
- manual: what was checked, what the user has to verify
## Performance
- FPS / frame time / triangles / draw calls before and after (if relevant)
## Design decisions
- decision: reason
## Known limitations and risks
- what is not perfect, what was not done, possible regressions
## Next steps
- at most 3 points
```

---

## 20. CHANGELOG.md

```
## [Stage N] YYYY-MM-DD – short title
### Added / Changed / Fixed / Known issues
```

Newest entries at the top.

---

## 21. Known pitfalls

- **Blurry picture** – no `NEAREST` on the buffer texture or the canvas scaled by CSS with smoothing; set `image-rendering: pixelated` and draw the present pass at the target size.
- **Dithering "swims" when resizing the window** – the Bayer threshold computed from `gl_FragCoord` in the screen framebuffer instead of the index buffer. Dither only in passes rendering into the index buffer.
- **Black picture with R8UI** – an integer texture needs `usampler2D`, `texelFetch`, `NEAREST` filters and a `uint` fragment output; clear it with `clearBufferuiv`, not `clear`.
- **Incomplete framebuffer** – check `checkFramebufferStatus` at creation and after a context restore.
- **Flat varyings taking the value of another vertex** – WebGL uses the last vertex of the triangle (provoking vertex); with non-indexed geometry and identical face data the problem does not occur.
- **Z-fighting of road lines** – `polygonOffset` or a minimal offset of the line geometry above the asphalt.
- **Stretched picture** – projection computed for 320:200 instead of 4:3.
- **Broken palette transitions** – interpolate palette colors, not indices.
- **FPS drops in the mirror** – shorter distance and lower LOD, shared VBOs.
- **Context loss on mobile** – frequent when switching apps; every resource must be rebuildable from CPU data.
- **`getError` in the loop** – forces a GPU sync; debug only.
- **Car "floating" above the road** – sample the height under the wheels, take banking into account.
- **No sound** – AudioContext `suspended`; `resume()` after an interaction.
- **Invisible gamepad** – poll `navigator.getGamepads()` every frame.
- **Death spiral after switching tabs** – limit the update steps and reset the accumulator.
- **localStorage unavailable** – the game runs without saving.
- **`Math.hypot` in hot loops** – allocates; use `hypot2`/`hypot3`.
- **The build breaks modules or shaders** – dependency order, name clashes, special characters in template strings; test `dist/` from `file://`.

---

## 22. Glossary

| Term | Meaning |
|---|---|
| Index buffer | R8UI 320×200 texture where every pixel is a palette color number |
| Present pass | final pass turning indices into colors and scaling the picture to the screen |
| Overlay | 2D buffer drawn on the CPU (cockpit, HUD, font, menus), applied in the present pass |
| Ramp | 16 shades of one color in the palette |
| Flat shading | one color for the whole triangle, depending on its angle to the light |
| Bayer dithering | a regular 4×4 threshold pattern simulating intermediate shades |
| Raster fog | fog done by dithering between the object color and the fog |
| Instancing | drawing many copies of a model with one draw call |
| Chunk | a piece of the world with its own VBO, the culling unit |
| LOD | a simplified model version for large distances |
| Piece | a stretch of track with constant target parameters |
| Section | the part of the track between stations |
| Color cycling | animation by shifting colors in the palette |
| Historical mode | 15 FPS and a shorter draw distance, as on hardware of the era |
| Enhanced mode | internal resolution ×2, keeping the palette and dithering |
