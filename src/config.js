// SPDX-License-Identifier: AGPL-3.0-or-later
// All tunable numbers of the game. Logic and shaders read values from here only.

export const CONFIG = {
  render: {
    width: 320,
    height: 200,
    maxScale: 2, // enhanced mode: index buffer x2 (the overlay stays 320x200)
    displayAspect: 4 / 3,
    fovDeg: 70, // horizontal
    near: 0.5, // m; larger values keep coplanar details (windows, lights) apart in the depth buffer
    far: 2000,
    clearRamp: 'sky',
    clearLevel: 9,
    wireRamp: 'lights',
    wireLevel: 15,
  },
  palette: {
    baseLevel: 11, // level at which a ramp reaches its base color
    darkFloor: 0.12, // brightness factor of level 0
    whiteMix: 0.7, // how far level 15 goes towards white
  },
  loop: {
    maxDt: 0.1,
    step: 1 / 60, // fixed update step in seconds
    maxSteps: 5, // per frame; beyond this the accumulator is dropped
  },
  input: {
    steerRate: 3, // keyboard steering build-up, full lock per second
    steerReturn: 5, // keyboard steering return to center, per second
    deadzone: 0.15, // gamepad stick
    menuStick: 0.6, // stick deflection that counts as a menu direction
  },
  physics: {
    gravity: 9.81,
    lowSpeed: 4, // m/s, below this the kinematic steering model is used
    latDamp: 8, // 1/s, lateral velocity decay in the kinematic model
    stopSpeed: 0.3, // m/s, "standing still" for gear logic
    minLateralShare: 0.6, // lateral grip always left while braking or accelerating (keeps the car steerable)
    accelSmooth: 8, // 1/s, smoothing of accelerations used by cameras
    rpmSmooth: 12, // 1/s
    engineBrakeSpeed: 1, // m/s below which engine braking fades out
    locateWindow: 6, // samples searched around the last known track position
    barrierMargin: 1, // m kept between the car center and a barrier
    barrierScrub: 0.98, // speed factor per step while scraping a barrier
    surfaces: {
      asphalt: { grip: 1, rolling: 1 },
      shoulder: { grip: 0.9, rolling: 2.5 },
      gravel: { grip: 0.72, rolling: 3 },
      grass: { grip: 0.6, rolling: 7 },
    },
  },
  traffic: {
    pool: 10, // vehicles around the player at density 1
    lane: 2, // m from the centerline to a lane center (right-hand traffic)
    laneTolerance: 1.6, // m, vehicles closer than this laterally share a lane
    spawnAhead: 760, // m, beyond the fog
    spawnSpread: 120, // m of random extra distance when spawning ahead
    spawnBehind: 280, // m, beyond the mirror distance
    behindShare: 0.3, // share of same-direction vehicles spawned behind the player
    oncomingShare: 0.5,
    despawnMargin: 120, // m beyond the spawn distances where vehicles are recycled
    minSpawnGap: 45, // m of free lane required around a spawn point
    edgeMargin: 30, // m kept from both ends of the track
    accel: 2.5, // m/s^2
    brake: 7,
    latAccel: 3.5, // m/s^2, comfortable cornering
    latSpeed: 1.8, // m/s of lane change
    followTime: 1.4, // s of headway
    followMin: 8, // m
    followGain: 0.5, // m/s slower per m inside the safe gap
    brakeReserve: 0.6, // share of the full braking used when planning to stop behind something
    overtakePatience: 4, // s stuck behind a slower vehicle before considering a pass
    overtakeChance: 0.25, // per second once patience ran out
    overtakeSlower: 3, // m/s slower than cruise counts as stuck
    overtakeClear: 260, // m of free oncoming lane required
    overtakeAbort: 90, // m to an oncoming vehicle that aborts a pass
    overtakeBoost: 1.2, // cruise speed factor while passing
    overtakeMaxCurve: 0.003, // rad/m
    passMargin: 12, // m of free own lane needed to pull back in
    stunTime: 1.5, // s a vehicle stays stopped after being hit
    hitSlowdown: 0.6, // speed factor when hit by the player
    idleTime: 6, // s standing still before a vehicle far from the player is recycled
    idleDistance: 150, // m
    wait: 1, // s between spawn attempts
    paints: ['paint1', 'paint2', 'paint3', 'paint4', 'gray', 'brick'],
  },
  rival: {
    difficulty: 'normal',
    levels: {
      easy: { latAccel: 5.5, topSpeed: 52, accel: 4.2 },
      normal: { latAccel: 6.8, topSpeed: 60, accel: 5 },
      hard: { latAccel: 8.2, topSpeed: 66, accel: 5.8 },
    },
    paint: 'paint2',
    brake: 7.5, // m/s^2
    lookAhead: 260, // m scanned for upcoming curves
    lookStep: 10,
    lineLook: 35, // m ahead whose curvature sets the racing line
    lineCurve: 0.004, // rad/m at which the line is fully on the inside
    lineMargin: 1.3, // m kept from the asphalt edge
    straightU: 1.5, // m, position on straights (right lane)
    latSpeed: 3, // m/s
    avoidGap: 30, // m (+ 1 s of travel) ahead in which a vehicle counts as blocking
    avoidBand: 1.9, // m lateral
    avoidClear: 200, // m of free oncoming lane needed to pass there
    avoidBehind: 8, // m that must be free beside the rival
    finishMargin: 60, // m before the end of the track where the rival stops
    startU: -2, // m, grid position next to the player
    stopReach: 3, // m from the station point that counts as stopped there
    stopSpeed: 0.5, // m/s
  },
  police: {
    topSpeed: 62, // m/s, a little below the player's car: escape is possible on straights
    latAccel: 8, // m/s^2 in curves, close to the player's grip
    accel: 6.5, // m/s^2
    brake: 8, // m/s^2
    latSpeed: 3.5, // m/s of lane change
    activateDistance: 900, // m, parked cars exist only this close to the player (beyond the fog)
    parkOffset: 0.5, // share of the shoulder the parked car stands on
    escapeDistance: 450, // m ahead of the police that ends a chase
    followGap: 15, // m, the police car does not close in further while behind
    passGap: 25, // m, closer than this it tries to overtake
    passClear: 150, // m of free lane needed to overtake in the oncoming lane
    passAhead: 12, // m ahead of the player before cutting in
    blockSlow: 4, // m/s below the player's speed while blocking
    waitDistance: 60, // m, if the player drops this far back the blocking car stops
    stopSpeed: 2, // m/s, the player counts as stopped
    stopDistance: 90, // m, police this close to a stopped player (ahead or behind) writes a ticket
    detectorExtra: 350, // m the radar detector senses beyond the radar range
    penalty: 10, // s added per ticket
    maxStops: 3, // tickets that end the race
    ticketTime: 6, // s the ticket screen stays without confirmation
    flashPeriod: 0.25, // s per phase of the light bar
    beacon: { radius: 22, strength: 0.9, height: 1.1, reach: 300 }, // night: flashing light on the surroundings
    lookAhead: 200, // m scanned for curves
    lookStep: 10,
  },
  lighthouse: { beamSpeed: 1.2, beamRange: 1500 }, // rad/s, m
  crash: {
    speed: 12, // m/s of impact that wrecks the car
    duration: 2.5, // s before the restart
    penalty: 5, // s added to the race time
    backStep: 5, // m, search step for a safe restart point
    maxBack: 150,
    clearBehind: 80, // m of own lane free behind the restart point
    clearAhead: 25,
    oncomingClear: 220, // m without a vehicle coming the wrong way in the player's lane
    crackLines: 14,
    crackIndex: 14,
  },
  // Speed units: factor from m/s, label, speedometer full scale.
  units: {
    // Distances (gap to the rival) use meters or yards ('M' / 'Y' after the number).
    kmh: { factor: 3.6, label: 'KM/H', gaugeMax: 280, distanceFactor: 1, distanceChar: 77 },
    mph: { factor: 2.23694, label: 'MPH', gaugeMax: 175, distanceFactor: 1.09361, distanceChar: 89 },
  },
  hud: { x: 228, y: 6, index: 15 },
  station: {
    textX: 8, textY: 12, lineHeight: 12,
    mapX: 176, mapY: 12, mapW: 136, mapH: 176, mapStep: 20, // samples per map line segment
    pixelAspect: 1.2, // buffer pixels are this much taller than wide on screen
    backLevel: 1, frameLevel: 3,
    stop: 30, // m before the end of a section where the station stop triggers
  },
  citation: {
    columns: 21, margin: 4, feed: 12, top: 8, lineHeight: 10, lineTime: 0.12, holeSpacing: 10,
    paperRamp: 'paint4', paperLevel: 15, barRamp: 'roadLine', barLevel: 13,
    inkRamp: 'gray', inkLevel: 3, holeRamp: 'gray', holeLevel: 1,
  },
  detector: { x: 18, y: 146, chaseX: 250, chaseY: 186, bars: 5, ledRamp: 'paint1', ledLevel: 14, offIndex: 3, blinkBase: 2, blinkGain: 10 },
  collision: {
    carRadius: 0.9, // m, the car is two circles of this radius...
    carOffset: 1.2, // ...this far ahead of and behind its center
    restitution: 0.2,
    vehicleRange: 9, // m, vehicles further than this from the car are not tested
    stunSpeed: 3, // m/s of impact that makes an AI vehicle stop for a moment
    friction: 0.4, // speed lost along the obstacle per m/s of impact
    spinStopSpeed: 10, // m/s of impact that cancels all yaw rate
  },
  race: {
    startS: 10, // m
    startU: 2, // m right of the centerline
  },
  camera: {
    cockpit: {
      x: -0.35, y: 1.05, z: 0.1, // eye: right, above ground contact, forward of the car center
      swayLat: 0.004, // m of head shift per m/s^2
      swayLong: 0.003,
      rollGain: 0.004, // rad of body roll per m/s^2
      pitchGain: 0.004,
    },
    chase: { distance: 6.5, height: 2.4, lookAhead: 4, lookHeight: 1, lag: 6 },
    top: { height: 28, behind: 10, lookAhead: 8 }, // m above, behind and ahead of the car
    // Roadside camera: stands beside the road `ahead` m in front of the car, `side` m from the
    // edge, `height` m above the ground; moves on once the car is `passed` m beyond it.
    roadside: { ahead: 70, side: 4, height: 2.5, passed: 35, maxDistance: 150, lookHeight: 0.8 },
    clearance: 0.6, // m kept between an outside camera and the ground
    losSamples: 12, // ground samples between camera and car; a hill in between pulls the camera in
    modes: ['cockpit', 'chase', 'top', 'roadside'], // order of the camera key
  },
  mirror: {
    x: 112, y: 6, w: 96, h: 24, // overlay pixels, y from the top
    fovDeg: 50,
    distance: 200, // m
    fogStart: 0.6,
    eyeHeight: 1.15,
  },
  cockpit: {
    dashTop: 138,
    dashIndex: 2, dashEdgeIndex: 5, frameIndex: 1,
    pillarTop: 16, pillarBottom: 4, roofHeight: 3,
    hoodTop: 120, hoodHalfTop: 96, hoodSlope: 3, hoodLevel: 9, hoodEdgeLevel: 12, hoodNightLevel: 2,
    binnacleTop: 128, binnacleHalf: 88,
    gaugeRadius: 26, gaugeY: 168, tachX: 108, speedoX: 212,
    gaugeFaceIndex: 1, gaugeRimIndex: 6, tickIndex: 13, textIndex: 12,
    needleRamp: 'paint1', needleLevel: 13,
    sweepStartDeg: 135, sweepDeg: 270,
    tachMax: 8000, tachTicks: 8, speedoTicks: 7,
    needleRate: 14, // 1/s smoothing of displayed values
    gearX: 156, gearY: 148, speedX: 148, speedY: 164,
  },
  debug: {
    refreshSec: 0.25,
    contextRestoreMs: 1000,
    textIndex: 15,
    backIndex: 1,
  },
  renderScene: {
    moveSpeed: 6, // m/s
    mouseSens: 0.004, // rad/px
    pitchLimitDeg: 85,
    spinSpeed: 0.7, // rad/s
    stressCars: 93,
    stressColumns: 10,
    stressSpacing: 5, // m
  },
  track: {
    step: 6, // m between centerline samples
    easeLength: 60, // m over which piece parameters blend
    shoulder: 1.5, // m
    edgeLine: 0.2, // m
    centerLine: 0.2, // m
    dashPeriod: 3, // center line dash pattern in samples
    dashOn: 1,
    asphaltLevel: 10,
    lineLevel: 14,
    shoulderLevel: 10,
    bridgeShoulderLevel: 11,
    gravelLevel: 10,
    stationFlat: 250, // m of level ground before a station
    stationFade: 120, // m over which it blends into the hills
    junctionGap: 11, // m between centerlines below which a branch still overlaps the main road
    signBefore: 130, // m before a curve or fork where its warning sign stands
    signCurve: 0.004, // rad/m of curvature that gets a warning sign
    signSpacing: 250, // m, minimum distance between two automatic curve signs
  },
  terrain: {
    offsets: [12, 50, 160], // m beyond the shoulder edge
    blend: [0.1, 0.55, 1], // how much of the hill height each column takes
    levels: [12, 11, 10],
    amplitude: 25, // m
    hillBias: 0.35, // hill = bias + (1 - bias) * noise, noise in -1..1
    waves: [[0.0071, 0.0043, 0], [0.011, -0.0083, 1.3], [0.0037, 0.0041, 2.1]], // [fx, fz, phase]
    minScale: 0.02, // terrain strips squeezed by other roads or tight curves never vanish entirely
    edgeMargin: 0, // m kept from the halfway line to a neighbouring road
    squeezeSlope: 1, // m the terrain room may grow per m along the road
    skirtDepth: 12, // m of wall hanging below the outer terrain edge
    skirtLevel: 6,
    bridgeDepth: 12, // m from the bridge deck down to the water
    wallOffset: 0.5, // m, lateral size of the bridge side wall
    tunnelRise: 9, // m of hill above the road where it runs through a tunnel
    cutLevel: 9, // rock level of the cutting slopes at tunnel portals
    canyonRise: 24, // m of rock wall on both sides of a canyon road
    canyonWall: 2.5, // m beyond the shoulder where the wall reaches its top
    canyonLevel: 11,
    lakeDepth: 1.5, // m from the road down to a lake surface
    lakeShore: 1.5, // m of beach beyond the shoulder
    mountainRise: [12, 70, 150], // m per column on the mountain side of a lake or cliff road
    cliffEdge: 1.5, // m of rock beyond the shoulder before a precipice drops
    seaColumns: [1.5, 7, 160], // m beyond the shoulder: cliff edge, foot of the sea cliff, open sea
    seaDrop: [1.5, 34, 34], // m below the road per column (the last one is the sea level)
    seaLevel: 9,
    rampNear: 70, // m of room below which terrain between two roads is a plain ramp
    rampFar: 170, // m of room above which the terrain keeps its own shape
    cliffDrop: [6, 110, 220], // m per column below the road on the precipice side
    wallLevel: 9,
    waterLevel: 10,
  },
  chunk: {
    length: 200, // m
  },
  draw: {
    distance: 700, // m, fog is full here and chunks beyond are culled
    fogStart: 0.55, // fraction of distance where fog begins
  },
  sky: {
    ramp: 'sky',
    horizonLevel: 14,
    zenithLevel: 8,
    range: 0.6, // sine of the elevation where the zenith level is reached
    sharpness: 3, // >1 narrows the dithered transition between bands
    groundRamp: 'grass', // infinite ground plane below the horizon
    groundLevel: 9,
    groundDrop: 15, // m below the lowest point of the track
    mountainRamp: 'sky',
    mountainLit: 11,
    mountainShade: 10,
    mountainSegments: 48,
    mountainRadius: 1000, // m, must stay below render.far
    mountainBase: -0.12, // foot of the ring, below the horizon so no haze gap shows when looking downhill
    mountainMin: 0.02, // peak height as a fraction of the radius
    mountainMax: 0.1,
    seed: 91,
  },
  // Camera on the road centerline (render tests).
  driveCam: {
    eyeHeight: 1.2, // m
    lookAhead: 15, // m
  },
  scenery: {
    seed: 1991,
    distance: 400, // m, scenery of chunks beyond this is not drawn
    mirrorDistance: 150,
    edgeMargin: 2, // m kept from the outer terrain edge
    bridgeLimit: 0.05, // land objects are skipped where the bridge blend exceeds this
    tunnelLimit: 0.3, // ...or the tunnel blend exceeds this
    pierSpacing: 30, // m between bridge piers
  },
  zones: {
    blendLength: 300, // m over which the palette fades between two zones
    blendSteps: 64, // palette re-upload granularity during a fade
  },
  time: {
    day: { light: { dir: [0.35, -0.8, -0.5], ambient: 0.4, diffuse: 0.6 }, tint: [1, 1, 1] },
    sunset: {
      light: { dir: [0.8, -0.35, -0.3], ambient: 0.45, diffuse: 0.5 },
      tint: [1, 0.85, 0.72],
      sky: { zenith: [70, 80, 150], horizon: [250, 160, 80] },
    },
    night: {
      light: { dir: [-0.3, -0.8, 0.4], ambient: 0.2, diffuse: 0.12 },
      tint: [1, 1, 1],
      darkTint: [0.45, 0.55, 0.95], // color the dark levels drift towards
      darkLevels: 9, // levels below this get the dark tint
      sky: { zenith: [4, 6, 20], horizon: [24, 30, 60] },
    },
  },
  headlights: {
    range: 110, // m
    innerDeg: 15, // full brightness inside this half angle
    outerDeg: 21, // no light beyond this half angle; the band between is dithered
    strength: 0.85, // added to the lighting factor (1 = fully lit)
    forward: 2, // m from the car center to the lamps
    height: 0.6, // m above the ground
    sectors: 16, // angular slices of the wedge with their own reach (light blocked by buildings)
    blockBias: 0.5, // m the light reaches past the blocking surface
    blockFade: 1.5, // m over which blocked light fades (dithered)
    facingMin: -0.02, // faces turned further away from the lamp than this stay unlit
    // Headlights of the nearest AI vehicles: they fade in with distance (fadeEnd -> fadeStart, m)
    // and over time after being picked (glowRate per second), so they never pop in.
    others: { max: 6, range: 80, strength: 0.45, fadeStart: 120, fadeEnd: 260, glowRate: 1.5 },
    emitFogStart: 0.85, // emissive faces stay clear of fog until this fraction of the fog end
  },
  streetLights: {
    max: 8, // nearest lamps that light their surroundings at once
    radius: 11, // m, horizontal reach of the pool of light under a lamp
    strength: 0.75, // added to the lighting factor right under the lamp
    focusAhead: 30, // m in front of the camera around which the nearest lamps are picked
    searchRadius: 150, // m around that point
  },
  renderTest: {
    maxDiffRatio: 0.005,
  },
  // Weather variants: palette (colors drift to gray by `desat` and darken by `dark`; the sky by
  // `skyDesat`, `skyFlat` makes all sky levels the horizon color), draw distance factor, fog start
  // (fraction of the distance, used when below draw.fogStart), road grip factor, wet asphalt color.
  weather: {
    clear: { desat: 0, dark: 1, skyDesat: 0, skyFlat: 0, distance: 1, fogStart: 1, grip: 1, mountains: true },
    rain: {
      desat: 0.35, dark: 0.78, skyDesat: 0.85, skyFlat: 0.3, distance: 0.75, fogStart: 0.45, grip: 0.72, mountains: true,
      asphalt: [62, 66, 80], // wet: darker and bluish
    },
    fog: { desat: 0.5, dark: 0.92, skyDesat: 1, skyFlat: 1, distance: 0.3, fogStart: 0.12, grip: 0.95, mountains: false },
    rainOverlay: {
      streaks: 70, // falling rain lines on screen
      streakLength: 6, streakSpeed: 420, streakSlant: 0.25, // px, px/s, x per y
      streakIndex: 13, // palette index (light gray)
      drops: 90, // drops on the windshield at most
      dropRate: 25, // new drops per second standing still
      dropRateSpeed: 1.2, // extra drops per second per m/s
      dropIndex: 12, dropHighlight: 14,
      dropLife: 2.5, // s before a drop the wipers missed runs off
      wiperPeriod: 1.3, // s per full wipe (there and back)
      wiperSweepDeg: 150,
      wiperLength: 118, // px
      wiperPivots: [[96, 124], [196, 124]], // px in the overlay
      wiperIndex: 1,
    },
  },
  pause: { x: 40, y: 40, w: 240, itemX: 20, itemY: 22, valueX: 96, padding: 6 }, // pause menu box, overlay pixels
  // Menus (title, setup, results): row height and tap areas in overlay pixels, text colors,
  // default settings (saved settings and URL parameters override them).
  menu: {
    row: 9, hitMargin: 12, valueTapSplit: 40, textIndex: 12, selectedIndex: 255,
    defaults: {
      car: 0, time: 'day', weather: 'clear', gearbox: 'auto', difficulty: 'normal', units: 'kmh', res: 1, lastName: 'AAA',
      volMaster: 8, volMusic: 7, volEffects: 10, // 0..volumeSteps
    },
    volumeSteps: 10,
  },
  // Controls screen: key column width in characters, layout in overlay pixels.
  controls: { titleY: 8, menuX: 16, menuY: 24, valueX: 128, keyWidth: 11 },
  showroom: {
    fovDeg: 45, eye: [5.6, 2.3, -7.6], targetY: 0.45, time: 'sunset', groundLevel: 5,
    cycleRamp: 'sunset', cycleStep: 0.08, // s per color-cycling step
    paletteKey: 1000000, // palette keys of the showroom (never used by the world)
  },
  title: {
    logoScale: 3, logoY: 14, stripes: 3, stripeY: 39, stripeGap: 4, stripeHeight: 2,
    menuX: 92, menuY: 122, valueX: 180, spin: 0.5, lift: 0, // rad/s, m
    recordsX: 30, recordsY: 40, recordsH: 150,
    footerX: 4, footer: 'ARROWS + ENTER, PAD OR TAP',
  },
  setup: {
    panelY: 96, menuX: 14, menuY: 101, valueX: 110, lift: -1.6,
    infoX: 4, infoY: 4, blurbY: 77, infoBoxH: 13, barBoxW: 126,
    barX: 196, barY: 4, barLabels: ['SPEED', 'ACCEL', 'GRIP', 'STABLE'], barLabelWidth: 7, barWidth: 60,
    barRamp: 'paint3', barLevel: 13, barFloor: 0.15,
    // Grip and stability bars: a 35 m/s run with the wheel turned (and flicked), part throttle.
    rating: { speed: 35, gear: 4, throttle: 0.6, steer: 1, seconds: 2.1 },
  },
  results: { x: 8, y: 6, nameY: 136, nameX: 150, slot: 12, doneX: 200, menuX: 120, menuY: 160 },
  records: { size: 10 }, // entries per track
  // Historical mode (F3): rendering at 15 FPS (physics stays at 60 Hz), shorter draw distance.
  history: { fps: 15, distance: 0.6 },
  // On-screen touch buttons, overlay pixels; `label` is drawn centered.
  touch: {
    index: 15,
    drive: [
      { action: 'left', x: 2, y: 140, w: 44, h: 58, label: '<' },
      { action: 'right', x: 50, y: 140, w: 44, h: 58, label: '>' },
      { action: 'throttle', x: 270, y: 100, w: 48, h: 54, label: 'GAS' },
      { action: 'brake', x: 270, y: 158, w: 48, h: 40, label: 'BRK' },
      { action: 'camera', x: 2, y: 40, w: 34, h: 18, label: 'CAM' },
      { action: 'replay', x: 2, y: 62, w: 34, h: 18, label: 'R' },
      { action: 'pause', x: 284, y: 50, w: 34, h: 18, label: 'II' },
    ],
    driveManual: [
      { action: 'left', x: 2, y: 140, w: 44, h: 58, label: '<' },
      { action: 'right', x: 50, y: 140, w: 44, h: 58, label: '>' },
      { action: 'throttle', x: 270, y: 100, w: 48, h: 54, label: 'GAS' },
      { action: 'brake', x: 270, y: 158, w: 48, h: 40, label: 'BRK' },
      { action: 'gearUp', x: 222, y: 100, w: 44, h: 22, label: '+' },
      { action: 'gearDown', x: 222, y: 126, w: 44, h: 22, label: '-' },
      { action: 'camera', x: 2, y: 40, w: 34, h: 18, label: 'CAM' },
      { action: 'replay', x: 2, y: 62, w: 34, h: 18, label: 'R' },
      { action: 'pause', x: 284, y: 50, w: 34, h: 18, label: 'II' },
    ],
    menu: [
      { action: 'left', x: 2, y: 160, w: 40, h: 38, label: '<' },
      { action: 'right', x: 46, y: 160, w: 40, h: 38, label: '>' },
      { action: 'up', x: 190, y: 160, w: 40, h: 38, label: '^' },
      { action: 'down', x: 234, y: 160, w: 40, h: 38, label: 'V' },
      { action: 'confirm', x: 278, y: 160, w: 40, h: 38, label: 'OK' },
      { action: 'camera', x: 2, y: 40, w: 34, h: 18, label: 'CAM' },
      { action: 'pause', x: 284, y: 50, w: 34, h: 18, label: 'II' },
    ],
  },
  replay: {
    seconds: 60, // recorded history
    fastSpeed: 4, // playback speed while left/right is held
    autoSwitch: 4, // s between automatic camera changes
    autoModes: ['chase', 'roadside', 'top', 'roadside', 'cockpit'], // order of the automatic camera
    hintX: 150, // px, key hints in the replay bar
    jump: 50, // m the car may move between two frames before the road is searched again
  },
  audio: {
    volume: { master: 0.8, music: 0.3, sfx: 0.6, engine: 0.35, ambient: 0.4 },
    timerMs: 25, // sequencer timer period
    lookahead: 0.1, // s of notes scheduled ahead
    startDelay: 0.05, // s between a song change and its first note
    smooth: 0.03, // s, time constant of continuous sound changes (setTargetAtTime)
    noiseSeconds: 2, // length of the white-noise buffer (>= 1)
    // Engine: gain and filter cutoff (Hz) grow with load (throttle 0-1) and rpm; the per-car
    // character (cylinders, wave, FM ratio/index, sub level, base cutoff) lives in cars.js.
    engine: { idleGain: 0.45, loadGain: 0.55, cutoffPerRpm: 0.25, cutoffLoad: 900, q: 2, indexIdle: 0.4, indexLoad: 1 },
    // Tyre squeal from sideways sliding speed (m/s) between start and full, above minSpeed m/s.
    squeal: { start: 1.2, full: 4, minSpeed: 5, freq: 1700, sweep: 400, q: 9, gain: 0.35 },
    // Siren: wail centre freq and sweep (Hz) at `rate` Hz; loudness and brightness fall with
    // distance (ref m); Doppler from the radial speed.
    siren: { freq: 900, sweep: 300, rate: 0.45, gain: 0.45, ref: 30, cutoff: 700, cutoffNear: 4000, speedOfSound: 343, maxDist: 700 },
    sirenSmooth: 4, // 1/s, smoothing of the radial speed fed to the Doppler shift
    detector: { freq: 2400, length: 0.03 }, // Hz, s per beep
    horn: { freqs: [392, 466], gain: 0.25, cutoff: 1800 },
    // Hits (impact speed m/s) below a crash: loudness from min to full, never under `floor`.
    hit: { min: 1.5, full: 10, floor: 0.25, crunch: 0.6, cooldown: 0.3 },
    crash: { glassNotes: 5, glassLow: 2200, glassHigh: 4200, glassStep: 0.04 },
    rain: { freq: 3000, q: 0.4, gain: 0.5 },
  },
};
