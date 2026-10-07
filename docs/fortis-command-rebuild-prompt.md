# Prompt: Build "Fortis Command" — a 3D drone C2 console over real Dhaka airport imagery

You are building a single-page, browser-only demo of a drone command-and-control (C2) console called **Fortis Command** (brand FORTIS, product "Fortis Mission Engine"). It should look and work like a professional defence C2 product (dense dark layout, track lists, tasking, 3D map, mission planner), but carry only Fortis branding — no other company's name or logo. Everything runs in the browser with simulated tracks and telemetry, drawn over REAL satellite imagery and elevation of Hazrat Shahjalal International Airport (VGHS), Dhaka, Bangladesh.

## 1. Deliverable and technical constraints
- One HTML file (inline CSS + JS) plus two data files served next to it: `dhaka_sat.jpg` and `dhaka_h.png`, loaded with relative URLs.
- Only external script: three.js r128 UMD from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. Fonts from Google Fonts: Chakra Petch 600/700 (brand), IBM Plex Sans 400/500/600 (UI), IBM Plex Mono 400/500 (numbers, clock, coordinates). No other network calls at runtime (assume a sandbox that blocks map tile servers).
- Plain JavaScript, no frameworks. Never use alert/confirm/prompt — build confirmations into the page.
- Must work at 1500×920 desktop and at 400 px phone width with no horizontal scroll.

## 2. Real map data (prepare offline in Python: rasterio, pyproj, numpy, Pillow)
- Area: 16 km × 16 km centred on lat 23.8433, lon 90.3978. Reproject everything to `+proj=aeqd +lat_0=23.8433 +lon_0=90.3978 +datum=WGS84 +units=m`, extent −8000…+8000 m on both axes, north up.
- Imagery: Sentinel-2 L2A scene `S2A_46QBM_20251218_0_L2A` (cloud 0.001 %) from the public AWS bucket `sentinel-cogs`, prefix `sentinel-s2-l2a-cogs/46/Q/BM/2025/12/S2A_46QBM_20251218_0_L2A/`. Read `TCI.tif` with `/vsicurl/`, warp to 1600×1600 (10 m/px, Lanczos). Stretch each channel between its 0.5 and 99.6 percentiles, gamma 0.9, saturation ×1.25, contrast ×1.08, upscale to 2048×2048 (Lanczos), unsharp mask (radius 1.4, 70 %, threshold 2). Save as `dhaka_sat.jpg`, quality 86 (≈1.8 MB).
- Water: warp `B03.tif` and `B08.tif` to the same 1600 grid. NDWI = (B03 − B08)/(B03 + B08); water where NDWI > 0.05.
- Elevation: Copernicus DEM GLO-30 tile `Copernicus_DSM_COG_10_N23_00_E090_00_DEM/Copernicus_DSM_COG_10_N23_00_E090_00_DEM.tif` from bucket `copernicus-dem-30m`, warped bilinear to 1025×1025.
- Height grid in world units (10 m): h = clip(dem, 0, 40) / 10. Resample the water mask to 1025, median-filter 3×3; water cells h = −0.4, land h = max(h, 0.05). Encode as 8-bit grayscale PNG `dhaka_h.png`: v = round((h + 0.4) / 4.4 × 255). In the browser draw it to a canvas and decode h = v / 255 × 4.4 − 0.4.
- Show this attribution on the map, bottom-left: "Contains modified Copernicus Sentinel data (18 Dec 2025) · Copernicus DEM GLO-30 · © ESA".

## 3. World model and coordinates
- 1 world unit = 10 m. x = east, z = south. The world spans −800…+800. Pixel (px, py) on the 1600 px image → world (px − 800, py − 800).
- lat = 23.8433 − z·10/111320; lon = 90.3978 + x·10/(111320·cos 23.8433°). Show coordinates as `23.84311°, 90.39780°`.
- Heights: Float32 grid 1025×1025 with bilinear lookup. Terrain vertical exaggeration default 3 (Layers slider 1–6, step 0.5). Air entities sit at ground + altitude_m / 10 × 2.
- Features in image pixels:
  - Runway 14/32 from (703,665) to (895,925), width 6 units (heading ≈ 144°).
  - "VGHS NO-FLY ZONE": rectangle aligned with the runway, centred at the runway midpoint + (22, −12) units, half-length 290, half-width 140 units.
  - "NAI 2": rectangle (1335,680)–(1480,800).
  - Airport road: (855,600) (900,660) (945,720) (985,790) (1005,850) (1015,900) (1030,960) (1040,1000).
  - Text labels on the map: "HAZRAT SHAHJALAL INTL · VGHS" (905,735), "UTTARA" (520,470), "TURAG RIVER" (150,980), "BALU RIVER" (1560,470), "TEJGAON · VGTJ" (640,1450), "PURBACHAL EXPRESSWAY" (1330,915), "KURIL" (1060,1030).
- Boat routes: take these hand-traced lines, densify every 8 px, snap each point to the nearest water pixel within 14 px, smooth with a 1-2-1 filter, convert to world units.
  - Turag river: (322,420) (310,500) (305,580) (280,650) (230,710) (210,760) (190,830) (200,900) (220,940) (210,1000) (190,1070) (200,1140) (225,1180) (230,1240)
  - Uttara lake loop: (262,712) (300,700) (322,725) (328,790) (305,845) (275,860) (255,830) (250,770)
  - Balu river: (1532,505) (1572,560) (1585,620) (1585,700) (1575,780) (1568,860)
  - A boat counts as "on water" if any grid cell within ±3 cells is water.

## 4. Visual design (single dark theme)
- Colours: bg #0a0b0d, bg-2 #0e1012, panel #131518, panel-2 #181b1f, hover #1f2328, line #24282e, line-2 #30363e, text #e6e8eb, muted #8c939c, dim #5d646d.
- Affiliation: friend #2fd3ee (cyan), assumed friend #7fe0a6, hostile #ff4b4b, suspect #ff9a26, unknown #f1d24a, neutral #4fdc8a. Status: ok #3ddc84, warn #f5b700. Task button #f7b500 with near-black text. Sensor cones #7d86ff. UI accent #3d8bfd.
- MIL-STD-2525-style SVG symbols: hostile = diamond, suspect = dashed diamond, unknown = quatrefoil, neutral = square, friend = circle; inner glyph by domain (air, ground, sea, radar tower). Own assets: dark cyan-ringed circle with a heading arrow that rotates with the vehicle and the camera.
- Logo: cyan shield outline with a white "F". Section headers in small uppercase with letter-spacing; numbers tabular.

## 5. Layout (CSS grid, full viewport)
- Rows: top bar 42 px · vehicle bar 50 px · main · dock. Columns: icon rail 46 px · left panel 330 px · map · right panel 316 px. The dock spans under left panel + map + right panel.
- Top bar: logo, "FORTIS" wordmark, grid icon + "LIVE", chip "● OP SKY SHIELD · VGHS", live clock "Online TUE 06 OCT 2026 18:44:01 ZULU" (mono, UTC + simulated time), alerts bell with red count and dropdown ("Mark all read"), right-panel toggle, operator menu.
- Icon rail: Tracks, Assets, Layers, then Mission planner, Video, Timeline. Clicking the active one collapses that panel/dock.
- ≤1180 px: the right panel becomes a toggle and the minimap hides. ≤760 px: single-column page — header, sticky horizontally scrolling vehicle bar, map at 58vh, sticky tab bar [Tracks | Asset | Planner | Video] that switches the section shown below.

## 6. 3D map (three.js)
- Terrain: PlaneGeometry 1600×1600 with 256×256 segments, heights from the grid × exaggeration, MeshLambertMaterial with the satellite CanvasTexture (max anisotropy). Hemisphere light 0xf4f6ff / 0x5a5240 at 1.12 + directional light 0.28. Fog 0x3a4450 from 1700 to 4200. Transparent renderer over a CSS sky gradient #0b0f15 → #1d2733 → #3a4756.
- Water plane at y = −0.15 (#1b4a63, opacity .42, Phong). A flat outer ground ring (#3e4034) around the 16 km square.
- Draped overlay: a second mesh sharing the terrain shape (y = max(h,0) + 0.3) textured with a 1024² canvas, redrawn when something changes and every 4 frames for the radar sweep. It draws: optional 1 km grid with longitude labels; no-fly zone (purple fill α .09, diagonal hatch, #b39dff outline); NAI 2 (dashed yellow); SENTRY-1 radar (dashed 4.6 km ring, half-range ring, gradient wedge rotating 40°/s); ROVER-1 rotating sensor fans; plan areas (lawnmower/perimeter boxes, spiral squares, orbit/sector circles, waypoint dots); measure line.
- Tactical base map option built in the browser from the imagery: dark blue-grey luminance, water #081c2c with cyan #2fd3ee edges, runway outline.
- Camera: custom orbit controller (target x/z, distance 80–2600, polar 4–80°, azimuth) with smoothing. Left-drag pans, right- or shift-drag rotates and tilts, wheel zooms toward the cursor, two fingers pinch/rotate/tilt. 2D/3D button (polar 0.5° north-up vs 56°), compass button resets north, vertical zoom slider with + and −. Opening view: target pixel (1010,860), distance 1250, azimuth 340°, polar 54°.
- Ground picking by ray-marching the height field (not mesh raycasting); used for the cursor readout "Cursor: lat, lon · elev m", clicks, drag-drops and dragging markers.
- HTML markers projected every frame (symbol + name pill, z-index by depth, `width:max-content`). Labels toggle. Double-click a marker to zoom to it.
- Per entity: a small low-poly box model (needed for the video feeds), altitude stem + ground ring for air tracks, breadcrumb trail (240 points, every second), and for own assets a translucent sensor cone (#7d86ff pyramid + edges) to its look point; footprint half-size ≤ 26 units; hide the cone beyond 520 units.
- Task lines: yellow 3D line from asset to target with a pill label "168° · 2.07 km".
- Minimap 170 px at bottom right (imagery, entity dots, planner route, camera footprint; click to jump), FPS readout, automatic scale bar (50 m … 5 km). Map toolbar: "Map", drop pin, measure (two clicks → distance · bearing), labels toggle, search box (track ID/name or "lat, lon" → fly there and drop a pin).

## 7. Entities and simulation
- Sim clock = real UTC at load + simulated seconds. Speed 1×/2×/4×/8× and pause.
- Own assets:

| ID | Name | Type | Start / behaviour | Numbers |
|---|---|---|---|---|
| ST-1 | SENTRY-1 | Radar tower (fixed) | pixel (700,622) | radar range 4.6 km |
| FX-01 | HAWK-1 | Quadcopter ISR | executing the preloaded mission (§10) | 15 m/s, 120 m, battery 78 %, drain 0.021 %/s, FOV 26° |
| FX-02 | FALCON-2 | VTOL fixed-wing | orbit radius 2.3 km around pixel (1150,560) at 450 m; at start tasked "Recce Orbit" on H-13 | 27 m/s, turn 16°/s, battery 66 % |
| FG-11 | ROVER-1 | UGV 6×6 | back-and-forth patrol on the airport road | 8 m/s |
| FS-21 | MARINER-1 | USV 7 m | loop around Uttara lake | 6 m/s |

  Drone home pad: pixel (1180,872).
- Tracks:
  - H-13, H-16, H-17 — hostile small UAS (multirotor) at 110/125/140 m, 11 m/s, back and forth along pixels (1430,760) (1300,790) (1150,815) (1045,800) (995,760) (1040,705) (1160,720) (1310,755), each offset by i × (7,9).
  - V-21 — suspect pickup truck driving the airport road in reverse, 9 m/s.
  - W001 — suspect country boat on the Turag, 2.5 m/s. RB-12 — assumed-friend river patrol boat on the Balu, 5 m/s.
  - UNK-07 — unknown small UAS that appears at t = 26 s over Uttara and flies a figure-8 around pixel (640,590) at 90 m (raises an alert).
  - A4C8E2 — neutral airliner arriving on runway 14: starts 6.5 km out on the extended centreline, 3° glide path (altitude = distance × tan 3° + 15 m), 75 m/s, lands, decelerates, repeats.
  - A71F09 — neutral airliner departing runway 14: takeoff roll from the threshold, lifts off after 1.9 km, climbs at 13 % to 1800 m at 80 m/s, repeats. Both airliners are sourced from ADS-B.
- Motion: heading turn-rate limits (quads fly straight to points, fixed-wing fly by heading), climb limits, roll/pitch for the attitude indicator, battery drain, link % from distance to home, low-battery alert at 20 %, auto-return under 15 % (setting).
- Detection every second: source = ADS-B, "Radar (ST-1)" inside 4.6 km, or "EO (FX-02)"-style when inside a camera footprint; track quality 0–15; "Live" or "N s ago".
- Alerts: on start "3 Hostile Tracks Identified — Small UAS group · x km E of runway 14/32" (top-centre banner, red border, click flies to the track); when any non-ADS-B air track enters the no-fly zone: "H-13 entered VGHS no-fly zone".
- Asset modes: MISSION, PATROL, HOLD, TASK, RTL, LANDING, LANDED, IDLE. Keep a mode history for the timeline. Every important action goes into an event log.

## 8. Panels
Left panel, tabs Tracks / Assets / Layers:
- Tracks: search box; filter chips All, Hostile, Suspicious, Unknown, Neutral, Assumed Friend; collapsible groups with counts. Each row: symbol, breadcrumb "Air Vehicle › Small UAS · multirotor", large ID, affiliation in colour, "RS: EO (FX-02) · 853 m SE of HAWK-1", Live indicator, yellow "Task" mini button, and "✓ Task: Recce Orbit · FALCON-2" when tasked. Update values in place; only rebuild the list when membership changes.
- Track detail (click a row or a map symbol): back/close; tools (center map, camera follow, copy coordinates); breadcrumb; big ID; affiliation dropdown (recolours the track everywhere and logs it); SRC / ID / TQ; **Sensor View** (live mini render from whichever asset camera is on the track, with a yellow target box, or a "Point nearest camera" button); Tasks cards (EXECUTING, elapsed time, View / Complete / Cancel); Track Data grid (location, speed km/h or kn, altitude MSL and AGL, heading, environment, distance and bearing from the selected asset, last updated, time since creation); footer with "⋯" menu and a large yellow **Task ▾** button. The task menu: asset chips (air assets plus same-domain vehicles), ETA and distance, and options Investigate / Follow / Recce Orbit / Monitor with one-line descriptions.
- Assets: list with battery bar, mode, current task, "On screen" / "Hidden · click to show".
- Layers: base map Satellite / Tactical, terrain exaggeration slider, switches for labels, 1 km grid, zones, sensor coverage, track history, altitude stems, planned routes, task lines.

Right panel, tabs Asset / Tasks:
- One card per vehicle on screen. With one vehicle the card is full; with several they stack compactly and the selected one is full. Click the name to expand, ✕ to hide. Card: symbol, name, "ID · type", ONLINE pill; big numbers ALT m AGL / SPEED km/h / BATTERY % (ground and sea: speed + heading); Activity ("Mission · step 2/6", "Step 2 of 6 · Lawnmower", progress bar); attitude indicator SVG (blue/brown horizon that rolls and pitches, yellow aircraft symbol) with heading/climb/roll/pitch; location, link, home distance, endurance in minutes; sensor switches (EO camera, IR/thermal, laser rangefinder, radar, ADS-B receiver, Remote ID); buttons Hold/Resume/Launch, RTL, Land/Stop; "Open mission plan", "Open sensor video".
- Tasks tab: active and recent task cards.

## 9. Vehicle selector bar (show one vehicle, add more by clicking)
- A strip above the map with a chip per vehicle: symbol, name, status line ("Mission · step 2/6 · 78%"), ✓ when on screen, + when hidden. Right side: "N of 5 on screen", "Show one", "Show all".
- Start with only HAWK-1 on screen. Clicking a hidden vehicle adds it and fits the camera to all shown vehicles. Clicking a shown vehicle hides it (at least one must stay).
- Hidden vehicles keep running but disappear from: the map (marker, model, trail, cone, routes, task lines, radar overlay), the right panel, the planner's "Plan for" list, video tiles, timeline lanes and the minimap. Selecting a hidden vehicle anywhere (map, assets list, tasking) shows it automatically.

## 10. Mission planner (bottom dock, 248 px tall)
Three columns: palette 200 px · plan line · inspector 270 px.
- Palette and defaults:
  - Navigate: Waypoint (120 m, 15 m/s), Orbit (radius 300 m, 2 laps, clockwise), Loiter (60 s)
  - Search pattern: Lawnmower (900 × 600 m, 150 m lanes, rotation 0°), Expanding Square (800 m box, 120 m legs), Sector Search (radius 450 m, three petals), Perimeter (900 × 600 m)
  - Action: Capture Photo, Record Video (30 s), Rangefind
  - Recovery: Return Home, Land
- Four ways to add a step: click a palette item (placed at the map view centre), drag it onto the map (placed at the drop point), drag it into the plan line (blue insertion marker), or toggle **Click to add** and click the map to append waypoints (Esc ends).
- Plan line: horizontal cards with number, icon, name, summary ("120 m · 1300×1000 m · 200 m lanes"), lat/lon, status (DRAFT / PENDING / ACK / EXECUTING / PAUSED / COMPLETE). Drag to reorder, ✕ to delete, double-click to fly there.
- On the map: numbered markers at altitude with drop lines; drag a marker to move the step and the route updates live. The route is a 3D line following terrain at the step altitude; search areas are draped on the ground.
- Inspector: help text for the step type, location + ground elevation, sliders (altitude 20–500 m, speed 3–30 m/s, radius 50–1500 m, laps 1–5, duration 10–600 s, width/length 100–2500 m, lane spacing 30–400 m, box 100–2000 m, rotation 0–179°), CW/CCW, Show on map, Duplicate, Remove. The Delete key removes the selected step.
- Header: "Plan for" (vehicles on screen), stats (steps, km, minutes, battery −%, "remaining" while executing), Templates (Area search over NAI 2; Airport perimeter patrol outside the no-fly zone; Turag river patrol; Point inspection at Kuril; Lake search expanding square over Uttara lake; Clear plan), and buttons Upload & Execute (yellow; shows "Uploading…" for 1.2 s, cards show ACK, then executes), Pause, Resume, Abort (returns home).
- Validation chips: red (disables Upload) when the route enters the VGHS no-fly zone, a step is outside the area, a USV step is not on water, a UGV step is in water, or battery at the end is under 5 %; amber for altitude under 40 m, battery reserve under 20 %, or no recovery step; green "Plan checks passed".
- Execution expands steps into a flight path (orbit circles, back-and-forth lanes, square spiral, three-petal sector, rectangle, actions/holds at the previous point, return home, land), logs each completed step, shows toasts for photos and rangefinding, and ends in HOLD or LANDED. Editing is blocked while executing ("Pause the mission to edit its plan").
- Preloaded HAWK-1 plan, already executing step 2: Waypoint halfway from home to NAI 2 → Lawnmower 1300 × 1000 m, 200 m lanes, over NAI 2 → Capture Photo → Orbit radius 300 m at pixel (1300,930) → Return Home → Land.

## 11. Video and timeline (dock tabs)
- Video: one tile per on-screen vehicle that has a camera, in an N-column grid. Each tile renders the same three.js scene from the vehicle's camera with its own WebGLRenderer (every other frame), with C2 graphics hidden. Modes EO / WH (white-hot: grayscale + contrast) / BH (black-hot: inverted), zoom − / +, snapshot (flash + log entry), REC with timer, scanlines, reticle, HUD (name, mode, FOV, target lat/lon, azimuth/elevation, slant range, UTC), and coloured boxes around tracks in view labelled like "H-13 · 2.15 km".
- Timeline: mission clock, play/pause, speed control, SVG ruler (last 20 min + 2.5 min ahead, minute ticks, "HHMMZ" labels every 5 min), one lane per on-screen vehicle with coloured mode bars, event dots, green LIVE playhead, and a scrollable event log (click an event to fly to its entity).

## 12. Quality bar
- Boot screen with progress messages ("Loading Dhaka satellite imagery…", "Building 3D terrain…") and a readable error if three.js or the data files fail.
- No horizontal overflow at 400 px; markers must not stretch; dropdowns inside the dock open downward so they are not clipped.
- Test in a headless browser, served over http so the data files load: boots with no console errors; add and hide vehicles; drag a pattern onto the map and into the plan line; load a template; upload and execute; task a track; check the video and timeline tabs; check the phone layout.
