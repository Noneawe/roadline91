# CHANGELOG

## [Stage 10] 2026-10-01 – button mapping
### Added
- CONTROLS screen (from the title menu): the list of driving actions (throttle, brake, steer left and right, gears, horn, camera, look back, replay, pause) with their key and pad button. Enter or a tap on a row waits for the next key or pad button and assigns it; Esc cancels. A key already used by another action is swapped (that action gets the previous key), so no action is ever left unbound. RESET DEFAULTS restores the defaults. Saved with the settings (`keys`, `pad`).
- Menu keys (arrows, Enter, Esc, Backspace; D-pad, A, B) as well as F1–F4 and M are fixed – they cannot be lost or reassigned.
- The same screen in the pause menu (CONTROLS between EFFECTS and QUIT TO MENU): it opens over the pause menu, BACK or Backspace returns to it; new bindings work as soon as the race resumes.
### Changed
- Steering has its own actions `steerLeft` / `steerRight` (previously shared with the menu `left` / `right`); the touch arrows still steer.

## [Stage 10] 2026-10-01 – volume in the menus
### Added
- Title screen: VOLUME (overall), MUSIC and EFFECTS (effects, engine, ambience), each in 11 steps 0–10 shown as a bar; changes are heard immediately and saved with the settings (`volMaster`, `volMusic`, `volEffects`). The levels scale the values of `CONFIG.audio.volume`; muting with M and `?mute=1` still works.
- The same three sliders in the pause menu (RESUME, RESTART, VOLUME, MUSIC, EFFECTS, QUIT TO MENU); shared `volumeItems` in `state/menu.js`; the pause menu now uses the shared menu handling (including taps on rows).

## [Stage 10] 2026-10-01 – menus, records, optimization, mobile
### Added
- Title screen: logo with palette color cycling (the `sunset` ramp rotates in the palette texture), a car turning in a "showroom" under a sunset sky, START RACE / RECORDS / FULLSCREEN menu, record table.
- Setup screen (`state/setup.js`): car (turning model, description, SPEED/ACCEL/GRIP/STABLE bars – grip and stability measured by a physics simulation), track, time of day, weather, gearbox, rival difficulty, units (km/h / mph, also on the speedometer, HUD, citation and the gap to the rival in yards), resolution 320×200 / 640×400. Settings saved in `localStorage`.
- Three new cars (`models/sportsCars.js`, 250–286 triangles, LOD 64): **Aurora MR** (mid-engine, V12: the fastest – 262 km/h, 0–100 in 4.9 s – and the most nervous), **Breeze R** (light roadster, inline-4: best in corners, 198 km/h), **Kestrel S** (sedan, inline-6: the most stable, `rainLoss` 0.55 – it loses only 55% of the rain's grip reduction). Each has its own engine sound. The rival drives the next car of the list.
- Pause (Esc/P/Start): RESUME / RESTART / QUIT TO MENU; hiding the tab pauses the race.
- Results screen: section splits of the player and the rival, result, number of police stops; a top-ten time asks for a 3-letter name (keyboard, pad, touch); records in `localStorage` (only full runs from section 1 without being busted).
- Historical mode (F3): the picture is drawn 15 times per second with physics at 60 Hz, draw distance ×0.6.
- Enhanced mode: 640×400 index buffer (`renderer.setScale`), the overlay stays 320×200 (the present pass scales both separately), the mirror is scaled accordingly.
- Touch: on-screen buttons in the overlay (throttle, brake, steering, camera, replay, pause; gears with the manual gearbox; arrows and OK in station/pause/replay menus), taps on menu rows, fullscreen and an attempt to lock landscape orientation on the first touch, a "ROTATE TO LANDSCAPE" message in portrait. Pad: D-pad and left stick in menus.
- `?race=1` (start without the menu), `?units=mph`; with `?debug=1` the app object is `window.roadline`.
### Changed
- `Math.hypot` replaced everywhere with `hypot2`/`hypot3` (no allocation): allocations while driving dropped from about 1.9 MB/s to about 0.6 MB/s.
- Changing screens frees all GL buffers of the previous scene (`renderer.releaseAll`); building a race is preceded by a "LOADING" frame.
- The physics test "torque at 4000 rpm = 295" generalized to the curve interpolation of every car; the slide test takes the car's grip into account.
- Unused CONFIG entries removed (`driveCam.speed/accel/maxSpeed`, `hud.shadowIndex`, `cockpit.unitX/unitY`).
### Known issues (whole project)
- Performance measured only in headless Chromium with the software renderer (SwiftShader): 60 FPS at 320×200, about 48 FPS at 640×400. Not measured on a hardware GPU or on a phone.
- Gamepad controls not tested on a physical device; touch checked only with synthetic events.
- A gamepad does not start the audio (browsers do not treat it as a user gesture) – a key press or touch is needed.
- About 0.6 MB/s of short-lived allocations remain while driving (numbers in physics object fields, replay recording); they cause rare, short young-generation collections.
- One track (the TRACK option has one value); weather and starting time of day are chosen before the race, the weather does not change during it.
- The replay does not show the cracked windshield or the citation screen.
- Background mountains are visible over the sea too.
- Traffic, rival and police never take the branches; a police car does not return to patrol after a chase.
- AI vehicles drive "on rails" (no sliding); AI does not collide with scenery.
- Only `blocksLight` solids block light; terrain, trees and cars cast no shadows. Only the 8 nearest street lamps light the ground.
- Collisions are flat (2D); bushes can be driven through.
- Chunks have no LOD (the mirror only uses a shorter distance and car LODs).
- No steering wheel in the cockpit; wheels neither steer nor spin.
- The road width of the whole track = the width of the first section; power line wires do not exactly meet the next pole in curves.
- Render goldens generated on SwiftShader.
- Music and engine sound judged by measurements, not by listening.
- Menus (not the race) build strings every frame.

## [Stage 9] 2026-10-01 – cameras, replays, weather
### Added
- Cameras: cockpit, chase, top, roadside (C cycles). Outside cameras never enter the terrain: a hill between the camera and the car pulls the camera in front of it, and the camera always stays ≥ `camera.clearance` above the ground (checked along the whole track: 8040 positions, no penetration). In tunnels the top and roadside cameras fall back to the chase camera.
- `game/replay.js`: ring buffer of the last 60 s (one frame per physics step: the player's car with rpm and gear, all AI vehicles with their looks and beacons, the clock, the time of day). Key **R** (pad: Back) while driving, at a station and after the end of the race; in the replay: P pause, ←/→ rewind/fast forward ×4, C camera (AUTO switches cameras every 4 s), R/Enter back. The race state after returning is identical to before (tested).
- `?weather=rain|fog`, `game/weather.js` and `applyWeather` in the palette:
  - rain: darker, muted palette, wet asphalt (a different asphalt ramp color), grip ×0.72 (braking 100–0: 35.5 m → 47.7 m; the rival brakes and corners proportionally softer), shorter visibility, rain streaks in the overlay, drops on the windshield and two wipers, rain sound;
  - fog: visibility ×0.3, dithered fog from 12% of the distance, flat gray sky, no background mountains, the plane below the horizon in the fog color.
- `replay` action in `engine/input.js`.
### Changed
- `world.locateCar` split out of `constrainCar` (used by the replay); `createGround` takes a grip factor and has `follow()`.
- The cockpit mirror is always cleared in the overlay (rain and cracks never cover it).
### Known issues
- The weather is fixed for the whole race (menu choice – stage 10); `?weather=` is the only way for now.
- The replay does not show the cracked windshield or the citation screen.

## [Stage 8] 2026-10-01 – FM sound
### Added
- `audio/mixer.js`: one AudioContext created on the first interaction (key, mouse, touch), channels `music`, `sfx`, `engine`, `ambient` under a shared master, volumes in `CONFIG.audio.volume`. `?mute=1` and the **M** key mute. A hidden tab suspends the context. Any audio error turns audio off and never breaks the game loop.
- `audio/fm.js`: two-operator FM voices (modulator → carrier `frequency`), ADSR envelopes of level and modulation index, pitch drop (drums), filtered noise voices; nodes disconnected when a note ends.
- `audio/sequencer.js`: patterns compiled to events, lookahead scheduling (25 ms timer, 100 ms window on `audioCtx.currentTime`), looping, late notes skipped instead of played in a burst.
- `audio/songs.js`: instrument bank as data and 3 original songs: `menu` (100 BPM, D major, FM piano), `drive` (140 BPM, A minor, arpeggio and lead), `results` (120 BPM, C major, FM brass).
- `audio/sfx.js`: engine (continuous oscillators: FM sawtooth + sub-octave through a filter; firing frequency from rpm, timbre and volume from load, changes via `setTargetAtTime`), tyre squeal from sideways sliding speed, siren with Doppler shift and distance attenuation, radar detector beeps (same rhythm as the LED), horn, hits and crashes (thump, crunch, glass), gear change clunk, rain (noise; level supplied by the game – stage 9).
- Per-car engine character in `cars.js` (`sound`: cylinders, wave, FM ratio and index, sub-octave, filter).
- The race scene exposes a `sound` state (continuous values and event counters); `main.js` passes it to the audio every frame. Music: driving – `drive`, station screen – `menu`, finish and game over – `results`.
- Tests: note names, song compilation, lookahead scheduling (every note exactly once, in order, looping), Doppler and attenuation, the scene's `sound` state.
### Known issues
- No title screen yet (stage 10) – the `menu` song plays on the station screen.
- Rain has a sound but there is no weather yet (stage 9) – the level is always 0.
- Sound judged only by measurements (levels, Doppler), not by listening in a browser with a GPU.

## [Stage 7] 2026-10-01 – the rival stops at stations
### Fixed
- The rival passed stations at full speed while the player restarted from 0 km/h after the station screen. Now the rival brakes to a stop at the same station point and starts from standstill (`rival.stopReach`, `rival.stopSpeed`). The rival's ideal time (normal) went from 760 s to 820 s.

## [Stage 7] 2026-10-01 – coast with a cliff and a lighthouse
### Added
- Section 1 before the station: 1.2 km of road along a cliff edge (piece flag `sea: 'left' | 'right'`): rocky edge with a guard rail, a vertical wall of about 34 m and open sea below; zone `seaCliff` (light rock, sea up to the horizon – the plane below the horizon becomes water at sea level).
- Lighthouse (white and red tower, lantern lit at night) with a keeper's house; a rotating beam at night.
- Face flag `DITHER` (Bayer screen-door transparency, every other pixel) – used by the lighthouse beam.
### Known issues
- Background mountains are visible over the sea too (the mountain ring is shared by the whole track).

## [Stage 7] 2026-09-30 – mountain pass with hairpins above a drop
### Added
- Section 2: a pass – 4 hairpins (radius about 50 m) one above the other on a steep slope, about 2 km and 120 m up. A drop on the valley side (rock edge and wall, valley floor over 200 m below) with a guard rail, the mountainside on the other; from the upper hairpins the road below is visible. Piece flag `cliff: 'left' | 'right'`.
- Terrain between roads lying close together (hairpins, branches) is a flat ramp joining their heights halfway – no steps, walls or gaps (this also improved branch junctions).
### Changed
- The old serpentines and two hairpins of the climb replaced by the pass; hand-placed guard rails removed from the data (the drop has its own). Sparser objects in the snow zone (hairpins are close together, so more of them are visible at once).
- A zone may shorten the visibility (`distance` in `data/zones.js`); snow: 480 m of mountain haze.
- The track centerline sampled every 6 m (was 5 m): about 17% fewer terrain triangles, keeping the pass within the 20,000 budget (maximum measured about 19,700).
- All world goldens regenerated.

## [Stage 7] 2026-09-30 – climate levels: snow, canyon, redwoods, lake
### Added
- Zone per track piece (`zone` in a piece): palette, hills and objects change in the middle of a section.
- Section 2: foothills → snow on the climb and summit (snow, snowy spruces, drifts, cabins; tunnel under the summit) → descent into a dry landscape with a gorge under a bridge → winding canyon with red rock walls (`canyon: true`) → desert. Station "Canyon Gas".
- Section 3: dense redwood forest (new giant tree model), station "Redwood Gas".
- Section 5 starts with a road above a mountain lake: water with a guard rail on the left, a steep forested mountain on the right (`lake: 'left'`).
- New zones `snow`, `canyon`, `redwood`, `lake`; models `snowPine`, `snowBank`, `redwood`.
### Fixed
- Teleporting in tests (and restarting) clears the station and citation screens.

## [Stage 7] 2026-09-30 – scenery: tunnels, bridges, parking lots, new objects
### Added
- Tunnels through hills (piece flag `tunnel: true`): the terrain rises over the road, tunnel segments with a hill cover, portals at both ends, rocky cuttings at the entrances. Three tunnels: a headland on the coast, the mountains, a mesa in the desert (the previous gallery in the mountains replaced).
- Bridges: automatic railings and piers on every bridge; new bridges over a gorge in the mountains and over a river in the forest.
- Parking lots: at every station (paved lot with lines, parked cars), rest areas on the coast and the highway (flag `flat: true` levels the terrain; at stations the terrain levels automatically), a parking lot in the town.
- New objects (4–40 triangles): fence, hay bales, billboard, highway gantry, water tower, wind pump, dead tree, log pile, lifeguard tower, picnic table, mailbox, cabin, birch, parked cars (traffic LOD models with their own paint per batch). Rules in the zones.
### Fixed
- Junctions: a branch is drawn whole and its cross-section is clipped to the edge of the main road's lane (no overlapping road surfaces); the terrain reaches exactly the line halfway between the roads and the flattening grows gradually (no holes or walls).
- Flickering windows, doors, lights and plates: details 10 cm off the wall and a 0.5 m camera near plane (better depth precision).
- After a citation the police car drove into the middle of the lane and blocked the road; now it pulls over to the shoulder.

## [Stage 7] 2026-09-30 – full track, stations, branches
### Added
- 38.7 km track: 6 sections (coast, mountains with hairpins and a tunnel, forest, suburbs with a bridge, highway, desert), each ending at a station. An ideal run of the player's car takes about 10.6 min.
- Two branches: a gravel shortcut through the forest (about 7% faster with ideal driving, less grip) and an asphalt route through a town. Branches are separate roads (`world/roads.js`) with their own geometry, terrain, objects and physics; the car moves between roads smoothly (nearest centerline).
- The terrain of every road ends halfway to the neighbouring road (also in hairpins), flattens when squeezed and has "skirts" under its edge.
- Stations: split, total time, comparison with the rival, time of day for the next section (←/→, Enter), route map with branches, stations and position; finish at the last station (result, Enter = restart).
- Automatic signs before sharp curves and branches (new sign `signFork`), station buildings from the `station` field.
- `world/validate.js`: data and geometry validator (zones, objects, vehicles, stations, branch closure and angle, no road coming too close to itself); in the tests and at start with `?debug=1`.
- Spatial grid (`engine/grid.js`) for collisions, street lamp light and headlight blocking.
- Gravel surface (`physics.surfaces.gravel`), `?section=N` starts at section N.
### Changed
- Branch data format (CLAUDE.md section 11.1): a `branches` list with one alternative road and a rejoin point instead of a `left`/`right` pair.
- Terrain strips as triangles (exact normals), lighter tunnel model, sparser forest (triangle budget with longer zones).
- All world and race goldens regenerated (new track); new: `fork`, `gravel`, `gravelCockpit`, `station`, `forkAerial`, `townAerial`.
### Fixed
- A light push on an AI vehicle blocked it forever (continuous "stun"); now only impacts > 3 m/s stun.
### Known issues
- In the triangle between the main road and the start of a branch the joint of terrain strips is sometimes visible (dark skirt line, small gaps in the distance).
- Traffic, rival and police never take the branches; the asphalt branch through the town is also slightly faster (about 7%).
- The test autopilot could get stuck at the end of a tunnel in `?god=1` mode (no restart after an impact) – needs checking in the game.

## [Stage 6] 2026-09-30 – citation as a printout
### Changed
- The citation screen is a 1990s dot-matrix printout: tractor-feed paper with perforation and sprocket holes, alternating bars, text printed line by line, the sheet feeds up from the bottom (`cockpit/citation.js`, `CONFIG.citation`). Fictional agency, citation number, date 07/14/91, time according to the time of day, car, speed and limit, penalty, stop number, signature line; on the third stop "BUSTED / RACE IS OVER".
- New golden `ticketPrinting` (while printing); `ticket` regenerated.

## [Stage 6] 2026-09-30 – beacon light at night
### Added
- At night the nearest chasing police car (up to 300 m) tints the surroundings red and blue in the rhythm of the light bar: faces turned to the beacon within 22 m switch to the beacon color ramp with a dithered falloff (the palette cannot mix colors). `CONFIG.police.beacon`.
- Goldens `nightPolice`, `nightPoliceChase`; `nightTraffic` regenerated.

## [Stage 6] 2026-09-30 – police
### Added
- `ai/police.js`: police cars from section data (`police: [{ pos, side, radarRange, limit }]`), parked on the shoulder; the radar catches a car faster than the limit within range. Chase: waiting until the player has passed, following, overtaking in the opposite lane (when free), cutting in and slowing down. Stopping near the police car = citation; escape after a 450 m lead.
- Police car: sedan with a light bar, three light bar variants switched every 0.25 s (red / blue emissive); `sirenOn` flag for the stage 8 sound.
- Radar detector in the cockpit (and in the outside view): an LED blinking faster and faster and bars; signal 350 m before the radar range.
- Citation screen (speed, limit, +10 s penalty, number of stops), the third stop ends the race (Enter = restart). `?god=1` disables the police.
- `cornerSpeed` (shared speed planning of the rival and the police), goldens `policeParked`, `policeChase`, `ticket`.
### Fixed
- `fillRect` with fractional coordinates drew into the wrong row.
- After a teleport the car kept the height of the previous place (until it moved).
### Known issues
- The police car has no siren (sound in stage 8).
- A police car that finished a chase or gave a citation does not return to patrol in that run.

## [Stage 5] 2026-09-30 – smooth appearance of other cars' lights
### Fixed
- The light pool of an oncoming car appeared suddenly (entering the nearest four within 300 m). Now the strength grows with distance (from 260 m to full at 120 m) and ramps up over time after the car is picked; up to 6 cars at once.

## [Stage 5] 2026-09-30 – headlights of other cars
### Added
- At night the 4 AI vehicles nearest to the player (traffic and rival) light their surroundings with their headlights: the same cone as the player's, 80 m range, weaker light (`CONFIG.headlights.others`), not blocked by buildings.
- Golden `nightTraffic`; night and `traffic` goldens regenerated.
### Known issues
- Farther vehicles only have glowing headlights, without a light pool.

## [Stage 5] 2026-09-30 – traffic, collisions, AI rival
### Added
- `models/traffic.js`, `carBody.js`: sedan, wagon, van, truck + box LODs; LOD for the Vektor GT. The mirror always draws vehicles in LOD.
- `ai/traffic.js`: a pool of up to 10 vehicles around the player, both directions, lane keeping, slowing down in curves and behind slower vehicles, rare overtaking, density and types from section data (`traffic`).
- `ai/rival.js`: rival with speed planning for curves (braking ahead), an inside racing line, avoiding traffic; difficulty `easy|normal|hard` in CONFIG.
- `game/collision.js`: player collisions with vehicles (moving rectangles); `game/race.js`: safe restart point.
- A crash above a 12 m/s impact: cracked windshield, stop, restart at a safe spot after 2.5 s, +5 s penalty.
- HUD: race time and distance to the rival; `?god=1` disables crashes.
- Render goldens `crash`, `traffic`; race scene goldens regenerated (HUD).
### Known issues
- AI vehicles drive "on rails" (position along the track + lane); they do not slide and do not react physically to an impact except by slowing down.
- AI does not collide with scenery (it never leaves the road); AI headlights do not light the road.
- The rival and traffic stop before the end of the track; the end of the track still restarts the run (until stage 7).

## [Stage 4] 2026-09-30 – street lamp light
### Added
- Street lamps and the station canopy light their surroundings at night: the 8 lamps nearest to a point 30 m ahead of the camera brighten the road, terrain, objects and the car below them (11 m radius, dithered falloff). Lamp positions from the models' `light` field, selection in `world/scenery.js` (`buildLights`, `selectLights`), computed in the world shader.
- Goldens `nightRoad`, `nightChase`, `nightHouse`, `nightHouseCockpit` regenerated.
### Known issues
- Farther lamps (beyond the nearest 8) only glow; the light pool appears when a lamp enters the nearest eight.
- Street lamp light is not blocked by obstacles and has no visible beam in the air.

## [Stage 4] 2026-09-30 – headlights no longer shine through obstacles
### Fixed
- Headlights lit everything in a 2D wedge regardless of obstacles and height. Now: a 3D cone (with the car's pitch), faces turned away from the lamp stay unlit, the reach in 16 wedge sectors is shortened by buildings and tunnel walls (`castLight` in `game/collision.js`, models with `blocksLight`).
- Goldens `nightCockpit`, `nightChase` regenerated; new `nightHouse`, `nightHouseCockpit`.
### Known issues
- Only solids marked `blocksLight` block light (house, apartment block, barn, shop, tunnel); terrain, trees and other cars cast no shadows.

## [Stage 5, part] 2026-09-30 – collisions with scenery
### Added
- `game/collision.js`: collisions of the player's car with `solid` objects (trees, rocks, poles, signs, street lamps, guard rails, houses, barn, station, tunnel walls, bridge truss). The car is two circles, objects are circles and rotated rectangles; push-out, slight bounce, friction along the obstacle.
- Model colliders with a center offset (`center`) and a list of solids (tunnel).
### Known issues
- No crash screen, time penalty or restart yet (rest of stage 5); an impact only stops or bounces the car.
- Bushes can be driven through on purpose. Collision is flat (2D): object height does not matter.

## [Stage 4] 2026-09-30 – scenery, zones, time of day
### Added
- `models/scenery.js`: 20 low-poly objects (conifer + cheap far variant, tree, palm, bush, cactus, rock, power pole, 3 signs, guard rail, street lamp, house, apartment block, barn, gas station, shop, tunnel, bridge truss) with colliding ones marked (`solid`, `collider`).
- `world/scenery.js`: placement from data rules and a seeded RNG; instanced drawing (`Renderer.addInstances/drawInstances`, `INSTANCED` variant of the world shader).
- `data/zones.js`: 6 zones (coast, mountains, forest, suburbs, highway, desert) with their own ramps, hill heights and object sets; smooth palette transition at zone borders.
- Time of day `?time=day|sunset|night`: palette variants (`applyTime`), directional light per time.
- Night: headlight wedge in the world shader (dithered edge), `NIGHT_ONLY` flag (street lamps, windows, station canopy), emissive lights beyond the fog.
- `?section=N` (start at a section), `?seed=N` (scenery seed). 12 new render goldens.
### Changed
- The test track split into 6 sections (one per zone); `buildPath(track)` joins the sections.
- Terrain: 3 columns per side (was 4); chunk distance measured to the road centerline, not to the bounding sphere; mirror 200 m.
- All world goldens regenerated (zones, scenery).
### Known issues
- 45–52 FPS in the forest with the software renderer (SwiftShader); not measured on a hardware GPU.
- Scenery objects are not drawn in wireframe mode and have no per-object culling (only per chunk).
- The tunnel is a concrete gallery standing on the terrain, without a hillside over it; street lamps do not light the road.
- Power line wires are modelled straight: in curves they do not exactly meet the next pole.
- The road width of the whole track = the width of the first section.

## [Stage 3] 2026-09-30 – horizon fix
### Fixed
- A gap (band of fog color) between the end of the terrain and the mountains when driving downhill: the mountain ring now reaches below the horizon (`sky.mountainBase`), and the sky pass draws an infinite ground plane below the horizon fading into the fog (`sky.groundRamp`, `groundLevel`, `groundDrop`).
- World goldens regenerated; new golden `downhill`.

## [Stage 3] 2026-09-30 – handling fix
### Fixed
- Braking took almost all lateral grip (the car did not turn and slid sideways): at least 60% always remains (`physics.minLateralShare`), the brakes load the axles in proportion to their load.
- Easy spins: yaw damping (`yawDamping`), only part of the drive force takes grip from the rear axle (`powerOversteer`).
### Changed
- Shoulder grip 0.8 → 0.9, grass 0.55 → 0.6.
- Slide test: understeer when entering too fast, a slide after a steering flick and the counter-steer, no spin on asphalt, sliding on grass.

## [Stage 3] 2026-09-30 – car, physics, cockpit
### Added
- `vehicle/`: driving model (engine with a torque curve, 5 gears + reverse, automatic and manual, resistances, gravity on slopes, bicycle model with slip angles and a friction circle), Vektor GT parameters.
- `world/surface.js`: height and surface type under the wheels (asphalt, shoulder, grass), location on the track; bridge and terrain edge barriers.
- `camera/cameras.js`: cockpit with body sway, chase camera (C), look back (V), mirror.
- `cockpit/cockpit.js`: windshield frame, hood, dashboard, tachometer and speedometer with needles, gear indicator, digital speed.
- Rear-view mirror: `Renderer.beginMirror/endMirror` (scissor + viewport, mirrored, shorter distance).
- `engine/input.js` (keyboard + Gamepad API → actions), `engine/loop.js` (fixed 60 Hz step).
- `state/race.js`, `draw2d`: line and ellipse, `font`: `drawChar`, `drawNumber`; render goldens `cockpit`, `chase`; `?gearbox=manual`.
### Changed
- The default scene is the race (`state/race.js`); the temporary drive scene of stage 2 removed.
- `mat4FromYawPitch` with an optional roll.
### Known issues
- The mirror has no lower LOD: chunks and cars have no LOD variants yet (only a shorter distance).
- No steering wheel in the cockpit; the car's wheels neither steer nor spin visually.
- With the automatic gearbox, holding the brake after stopping engages reverse.
- The end of the track moves the car back to the start (until stage 7).
- Gamepad not tested on a physical device.

## [Stage 2] 2026-09-30 – road, terrain, camera
### Added
- `world/track.js`: sampling of the track centerline from pieces (smoothed curvature, grade, banking), road cross-section: asphalt, edge lines, dashed center line, shoulder.
- `world/terrain.js`: terrain strip with hills on both sides, bridge over water (walls + water surface).
- `world/chunks.js`: 200 m chunks, frustum culling (sphere) and distance from CONFIG.
- Sky (`shaders/sky.js`) with dithered bands, background mountains (`world/sky.js`), raster fog in the world shader.
- 5.05 km test track (`data/track-main.js`), drive-through scene (`state/driveScene.js`, default; ↑/↓ changes speed).
- `engine/rng.js`, frustum planes in `math3d.js`, render goldens: `road`, `curve`, `climb`, `bridge`, `fog`, `sky`.
### Changed
- `Renderer.beginFrame(viewProj, eye)`, new `setFog`, `disableFog`, `drawSky`, `drawBackdrop`.
- Renderer test scene only with `?scene=render`.
- Fog computed per pixel from the interpolated position (section 8.5 updated).
### Known issues
- The bridge is an embankment with walls over water, with no clearance underneath and no railings.
- The terrain strip is 160 m wide; the track cannot come back closer to itself than about 350 m (no validator until stage 7).
- Wireframe mode does not apply fog.

## [Stage 1] 2026-09-30 – Vektor GT fender fix
### Fixed
- The front wheel stuck out above the hood: fender and hood line raised at the front (+4 to +10 cm).
- Goldens `car`, `carRear`, `nearclip`, `scene` regenerated.

## [Stage 1] 2026-09-30 – Vektor GT details
### Added
- Headlights and tail lights (emissive), rear bumper, 12×6 inch license plate.
### Changed
- Vektor GT: 238 triangles (was 216). Goldens `car`, `carRear`, `scene` regenerated.

## [Stage 1] 2026-09-30 – WebGL2 renderer with a palette index buffer
### Added
- WebGL2 context (options from 8.7), error screen without WebGL2, context loss and restore (F4).
- R8UI 320×200 index buffer + 24-bit depth, 16×16 palette, present pass with a 4:3 letterbox, `?rawpal=1`.
- Shaders `world` (flat shading, 4×4 Bayer dithering, flat varyings), `wire`, `present`.
- CPU overlay, `draw2d`, 8×8 font (5×7 glyphs), debug overlay (FPS, CPU, GPU, triangles, draw calls; F1).
- `math3d`, model loader, models: cube, pyramid, ground, Vektor GT.
- Renderer test scene (camera: mouse + WASD/arrows, F2 wireframe, `?stress=1`).
- `tools/test.mjs`, `tools/build.mjs`, `tests/render.html` with 6 goldens in `tools/golden/`.
### Known issues
- Render goldens generated on SwiftShader (headless Chromium); not verified on a hardware GPU.
- 60 FPS at 20,000 triangles measured only with the software renderer.
- Not yet: `?res=2`, F3, instancing, fog, flags other than `EMIT` – they belong to later stages.
