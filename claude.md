# Beam Path Optimizer - Project Reference

## Overview

A 2D GUI application for optimizing laser beam path component placement on an optical table. Built with vanilla JavaScript/HTML5 Canvas for easy distribution (runs directly in browser, no build step required).

**To run:** Serve the directory with any HTTP server (e.g., `python -m http.server 8000`) and open `index.html` in a browser. ES Modules require HTTP serving - file:// URLs won't work.

---

## Features

### Core Canvas & Components
- HTML5 Canvas with pan (drag with shift or middle mouse) and zoom (scroll wheel)
- Grid background with major/minor lines
- 7 component types: Source, Mirror, Beam Splitter, Lens, Waveplate, Filter, Detector
- Click-to-place components from the toolbar palette
- Drag components to reposition
- Selection with click, multi-select with Ctrl+click or drag selection box
- Property panel for editing selected component attributes

### Beam Paths
- Graph-based beam path model (segments connect component ports)
- "Connect" tool to draw beam connections between components
- Beam splitters create two output ports (reflected/transmitted)
- Color coding by branch level (red → orange → yellow → green)
- Line thickness represents beam power
- Direction arrows on beam segments

### Constraints & Zones
- **Keep-out zones**: Rectangular areas where components cannot be placed (red, semi-transparent)
- **Mounting zone**: Target area for center of mass (green, semi-transparent)
- **Component mount zones**: Per-component keep-out areas for physical mounts
  - Enable/disable per component
  - Separate X/Y padding (rectangular shape)
  - X/Y offset from component center
- Zones can be selected, moved, resized, and deleted
- Constraint violation detection with status bar feedback

### Center of Mass (CoM)
- Calculated from component positions weighted by mass
- Displayed as crosshair on canvas
- Status bar shows if CoM is inside mounting zone
- Optimizer targets getting CoM into mounting zone

### Optimization
- **Algorithm**: Simulated Annealing
- **Adaptive parameters**: Scales based on number of movable components
- **Early stopping**: Converges when no improvement found
- **Cost function** (weighted sum):
  - CoM distance to mounting zone (default 50%)
  - Footprint/bounding box area (default 25%)
  - Total beam path length (default 25%)
  - Penalties for constraint violations (high multiplier)
- **UI feedback**:
  - Progress bar
  - Status text (what's happening)
  - Improvement percentage
  - Iteration count
  - CoM distance
  - Violation count
- **Workflow**: Start → Pause/Resume → Accept or Revert results

### File I/O
- Save to JSON (downloads file)
- Load from JSON (file picker)
- Unsaved changes warning before destructive actions
- Full state serialization/deserialization

### Undo/Redo
- History stack for all state-changing actions
- Ctrl+Z / Ctrl+Y keyboard shortcuts

---

## File Structure

```
/beamPathOptimizer/
├── index.html              # Main HTML layout
├── claude.md               # This reference file
├── css/
│   └── styles.css          # All styles (CSS variables, layout, components)
├── js/
│   ├── main.js             # App initialization, event handling, UI bindings
│   ├── state.js            # Redux-like store, actions, reducer
│   ├── models/
│   │   ├── Component.js    # Component class, types, factory method
│   │   └── BeamPath.js     # BeamSegment and BeamPath graph structure
│   ├── render/
│   │   ├── Renderer.js     # Main render orchestrator
│   │   ├── ComponentRenderer.js  # Component drawing
│   │   ├── BeamRenderer.js       # Beam path drawing
│   │   └── ConstraintRenderer.js # Zone and CoM drawing
│   └── optimization/
│       ├── Optimizer.js    # Simulated annealing implementation
│       └── CostFunction.js # Cost calculations
```

---

## Data Models

### Component
```javascript
{
  id: "mirror_001",
  type: "mirror",           // mirror | beam_splitter | lens | waveplate | filter | source | detector
  name: "M1",
  position: { x: 300, y: 200 },
  angle: 45,                // degrees
  size: { width: 25, height: 5 },
  mass: 120,                // grams
  reflectance: 1.0,         // 0-1 (beam splitters < 1)
  transmittance: 0.0,       // 1 - reflectance
  isFixed: false,           // locked from optimizer
  mountZone: {              // component's physical mount keep-out
    enabled: false,
    paddingX: 15,           // mm padding in X direction
    paddingY: 15,           // mm padding in Y direction
    offsetX: 0,             // mm offset from component center
    offsetY: 0
  }
}
```

### BeamSegment
```javascript
{
  id: "seg_001",
  sourceId: "source_001",
  targetId: "mirror_001",
  sourcePort: "output",     // output | reflected | transmitted
  targetPort: "input"
}
```

### Constraints
```javascript
{
  workspace: { width: 600, height: 600 },
  keepOutZones: [
    { id: "koz_001", name: "...", bounds: { x, y, width, height }, isActive: true }
  ],
  mountingZone: { bounds: { x, y, width, height }, name: "..." }
}
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| H | Pan tool |
| C | Connect beam tool |
| R | Rotate selected components 90° clockwise |
| M | Place mirror |
| S | Place source (Ctrl+S = save) |
| Delete/Backspace | Delete selected |
| Escape | Clear selection, return to select tool |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| +/= | Zoom in |
| - | Zoom out |
| Shift+drag | Pan canvas |
| Scroll wheel | Zoom at cursor |

---

## Optimization Algorithm Details

### Simulated Annealing Parameters
```javascript
{
  initialTemp: 100,
  finalTemp: 0.1,
  coolingRate: 0.98-0.99,      // Adaptive based on component count
  iterationsPerTemp: 10-25,    // Adaptive
  maxIterations: 500-5000,     // Adaptive (movableCount * 300, capped)
  initialStepSize: 50,         // mm - how far to move components
  minStepSize: 1,              // mm
  earlyStopIterations: 200-500 // Stop if no improvement
}
```

### Runtime Behavior
- **200 iterations per animation frame** for responsive UI
- **Live preview every 400 iterations** to reduce render overhead
- **Error-tolerant**: Callbacks wrapped in try/catch to prevent freezing
- **Early stopping**: Converges when no improvement found for N iterations
- Typical 6-component optimization completes in a few seconds

### Cost Function
```
Total = w_com * C_com + w_footprint * C_footprint + w_path * C_pathLength + Penalties

C_com = squared distance from CoM to mounting zone center (0 if inside)
C_footprint = bounding box area of all components
C_pathLength = sum of all beam segment lengths
Penalties = 1000 * overlap_area for each constraint violation
```

### Acceptance Probability
```
if (newCost < currentCost) accept
else accept with probability exp(-(newCost - currentCost) / temperature)
```

---

## Save File Format (JSON)

```javascript
{
  formatVersion: "1.0.0",
  document: { name, description, createdAt, modifiedAt },
  workspace: { width, height },
  components: [ /* array of component objects */ ],
  beamPaths: { segments: {...}, outgoing: {...}, incoming: {...} },
  constraints: { keepOutZones: [...], mountingZone: {...} }
}
```

---

## Status Bar

Shows real-time information:
- **CoM**: Current center of mass position
- **Mount Zone**: "OK" (green) if CoM inside, "OUTSIDE" (red) if not, "Not defined" if no zone
- **Violations**: Count of constraint violations (keep-out overlaps, boundary violations)
- **Components**: Total component count
- **Zoom**: Current zoom level
- **Cursor**: Mouse position in workspace coordinates

---

## CSS Variables (Theming)

Key variables in `:root` (css/styles.css):
```css
--bg-primary: #1a1a2e;      /* Main background */
--bg-secondary: #16213e;    /* Panels, toolbar */
--accent: #3b82f6;          /* Primary action color */
--success: #22c55e;         /* Good status */
--danger: #ef4444;          /* Bad status, delete */
--canvas-bg: #0d1117;       /* Canvas background */
```

---

## Development Notes

- **No build step**: Pure ES Modules, runs directly in browser
- **State management**: Redux-like pattern with single state tree and reducer
- **Rendering**: Immediate mode canvas rendering, re-renders on state change
- **Component detection**: Uses `containsPoint()` method for hit testing
- **Optimizer runs async**: Uses `requestAnimationFrame` for non-blocking updates

---

## Feature Implementation Progress

### Phase 1: Optimizer Features - COMPLETED
- [x] **Fixed Angle Checkbox**: Added `isAngleFixed` property to components, checkbox in UI, prevents angle changes during optimization
- [x] **Angle Optimization**: Optimizer now changes component angles in 90-degree increments from initial angle
- [x] **Beam Collision Detection**: Added `calculateBeamCollisionPenalty()` - beams cannot pass through other components or keep-out zones (penalty: 1500 per collision)
- [x] **Post-Optimization Selection Clear**: Selection is cleared after optimization completes to keep optimizer buttons visible

### Phase 2: General UI Features - COMPLETED
- [x] **Zone Icons**: Added box icons (&#9634;) to Keep-Out and Mount Zone buttons
- [x] **Right Panel Layout**: Panel now shows EITHER properties OR optimizer section, never both
- [x] **Default Angles**: Components now default to 0 degrees (sources, lenses, etc.) or 45 degrees (mirrors, beam splitters) via `DEFAULT_ANGLES` constant
- [x] **Source Emission Direction**: Sources rotate based on `emissionAngle` - the pointy end now faces the emission direction
- [x] **Movement Constraints**: Moving components that would break beam angle constraints is blocked, components snap back with warning toast

### Phase 3: Beam Tools - COMPLETED
- [x] **Rename Connect Tool**: Changed from "Connect" to "Add Beams" in UI
- [x] **Beam Segment Selection**: Click on beam segments in connect mode to select them (Ctrl+click for multi-select)
- [x] **Beam Segment Box Selection**: Drag selection box in connect mode to select multiple segments
- [x] **Beam Segment Deletion**: Press Delete/Backspace to delete selected beam segments
- [x] **Segment Highlighting**: Selected segments show blue glow, hovered segments show lighter glow

### Phase 4: Version Control - COMPLETED
- [x] **Version Display**: Version badge shown in top left toolbar (currently V1.1)
- [x] **Version Tracking**: `APP_VERSION` constant in state.js with `toString()` and `toFileFormat()` methods
- [x] **Version Comparison**: `compareVersions()` and `needsMigration()` utilities added
- [x] **File Format**: Save files now include `formatVersion` and `appVersion`
- [x] **Migration Prompt**: When opening older files, user is prompted to update to current version
- [x] **Version Log**: `versionlog.txt` tracks all changes and improvements between versions

### Files Modified
| File | Changes |
|------|---------|
| `js/models/Component.js` | `isAngleFixed` property, `DEFAULT_ANGLES` constant |
| `js/optimization/Optimizer.js` | Angle tracking maps, `angleMovableIds`, `performAngleIteration()` |
| `js/optimization/CostFunction.js` | `calculateBeamCollisionPenalty()` with line-segment intersection |
| `js/main.js` | UI bindings, version display, file version handling, panel toggling, movement constraints (`validateMovementForBeamConstraints()`, `showMovementWarning()`), segment selection (`getSegmentAtPosition()`, `getSegmentsInBox()`) |
| `js/state.js` | `APP_VERSION`, `compareVersions()`, `needsMigration()`, segment selection actions (`SELECT_SEGMENT`, `SELECT_MULTIPLE_SEGMENTS`) |
| `js/render/Renderer.js` | Source emission direction fix (rotate by `emissionAngle`), segment highlighting (selected/hovered glow) |
| `index.html` | Version badge, zone icons, tool rename, Fixed Angle checkbox |
| `css/styles.css` | `.version-badge` styling |

### All Features Complete
All features from `Features to Add.txt` have been implemented across 4 phases.

---

## Phase 5: Constrained Optimizer & Results View - COMPLETED

### Problem Statement (Solved)
The previous optimizer had issues:
1. ~~Beams become diagonal when they should remain at proper angles~~ ✅ Fixed
2. ~~Relative beam angles not preserved when components move/rotate~~ ✅ Fixed
3. ~~No visibility into optimization~~ ✅ Fixed with Results View

### Core Constraint (Implemented)
> "Components should be able to move anywhere and rotate as long as the initial input and output angles of each component with respect to the beam is preserved."

**Implementation:**
```
BEFORE:                           AFTER (valid):
    beam at 0° (right)               beam at 90° (down)
         →                                ↓
        [M] mirror at 45°               [M] mirror at 135°
         ↓                                →
    beam at 90° (down)               beam at 0° (right)

Input angle relative to mirror: 45°   Input angle relative to mirror: 45° ✓
Output angle relative to mirror: 45°  Output angle relative to mirror: 45° ✓
```

The optimizer now calculates and stores **relative beam angles** at initialization and preserves them throughout optimization.

### Feature 1: Constrained Optimizer

#### Key Algorithms

**Relative Angle Calculation** (at init):
```javascript
For each component in beam path:
  relativeInputAngle = incomingBeamAngle - componentAngle
  For each output port:
    relativeOutputAngle = outputBeamAngle - componentAngle
  Store in relativeBeamAngles Map
```

**Constrained Position Move** (performIteration):
```javascript
1. Pick random segment to adjust
2. Calculate new target position
3. Option A: Translate all downstream components by same displacement
4. Option B: Rotate downstream components around moved component
5. Evaluate cost for both options
6. Pick lower cost option
7. Apply SA acceptance criteria
```

**Constrained Angle Move** (performAngleIteration):
```javascript
1. Pick random component, new angle (90° increment)
2. For each output port:
   newOutputAngle = newComponentAngle + relativeOutputAngle
   Move target along new direction (preserve segment length)
   Recursively adjust downstream via repositionDownstreamForRotation()
3. Apply SA acceptance criteria
```

#### Files Modified

| File | Changes |
|------|---------|
| `js/physics/BeamPhysics.js` | Added `normalizeAngleDiff()` utility |
| `js/optimization/Optimizer.js` | Added `relativeBeamAngles` Map, `calculateRelativeBeamAngles()`, `tryMoveWithTranslation()`, `tryMoveWithRotation()`, `repositionDownstreamForRotation()`, snapshot storage |

### Feature 2: Results View Mode

#### Implementation
- **Snapshot Storage**: Captures state every 10 iterations
- **Graph Component**: Canvas-based cost vs iteration graph with hover/click/double-click interactions
- **Preview Mode**: View any iteration's layout without modifying actual state
- **Split-Screen Comparison**: Toggle to see original vs selected side-by-side
- **Apply Workflow**: Apply any iteration, not just the best

#### User Interaction Flow
```
1. Run optimization
2. Click "View Results" after optimization completes
3. Hover over graph → tooltip shows iteration/cost
4. Click on graph → selects that iteration
5. Double-click → preview that layout on canvas (with yellow indicator)
6. "Preview Selected" button → also enters preview mode
7. "Apply This Layout" → applies selected snapshot permanently
8. Split-screen checkbox → shows original vs selected side-by-side
9. Press Escape → exit preview mode
10. "Close Results View" → return to normal mode
```

#### UI Components
```
┌─────────────────────────────────────────────────────────────────────┐
│  Optimization Results                                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Cost vs Iteration Graph (canvas)                            │  │
│  │  - Red line connecting points                                │  │
│  │  - Yellow marker for BEST iteration                          │  │
│  │  - Green marker for selected iteration                       │  │
│  │  - Orange marker for hovered point                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Hover: "Iteration 1523, Cost: 1234.5"                             │
│  Selected: Iteration 1523 (Cost: 1234.5)                           │
│                                                                     │
│  [Preview Selected] [Apply This Layout]                            │
│                                                                     │
│  ☐ Split-screen comparison                                         │
│                                                                     │
│  [Close Results View]                                              │
└─────────────────────────────────────────────────────────────────────┘
```

#### Files Modified/Created

| File | Changes |
|------|---------|
| `js/render/ResultsGraph.js` | **NEW** - Canvas graph with hover/click/dblclick, best marker |
| `js/render/Renderer.js` | Added `renderPreview()`, `renderComparison()`, `drawPreviewIndicator()` |
| `js/optimization/Optimizer.js` | Added `snapshots[]`, `originalLayout`, `captureSnapshot()`, `getSnapshots()`, `getOriginalLayout()`, `getBestSnapshot()`, `applySnapshot()` |
| `js/main.js` | Added results view state, `setupResultsViewControls()`, `openResultsView()`, `closeResultsView()`, preview/apply methods, updated `render()` for preview modes |
| `index.html` | Added results section with graph canvas, buttons, split-screen checkbox |
| `css/styles.css` | Added results view styling, split-screen overlay, preview indicator |

### All Phase 5 Features Complete ✅

| Feature | Status |
|---------|--------|
| Relative angle calculation | ✅ Implemented |
| Constrained position moves | ✅ Implemented |
| Constrained angle moves | ✅ Implemented |
| Snapshot storage | ✅ Every 10 iterations |
| Results graph UI | ✅ Canvas-based |
| Hover/click/double-click | ✅ Full interaction |
| Preview mode | ✅ With yellow indicator |
| Split-screen comparison | ✅ Original vs Selected |
| Apply any iteration | ✅ No warning |
| Escape to exit preview | ✅ Keyboard support |

---

## Phase 6: UI Polish & Component Proportions - COMPLETED (V1.1)

### Feature 1: Accurate Component Proportions

**Problem**: Waveplates and filters appeared as squares in both the palette and default placement, but should be thin rectangles like mirrors (transmission optics are thin).

**Solution**:
- Updated default sizes in `ComponentDefaults` (Component.js)
  - Waveplate: 20×20mm → 20×5mm
  - Filter: 20×20mm → 20×5mm
- Updated CSS for palette icons to show proportional shapes
  - All component icons now match their actual aspect ratios
  - Beam splitters and detectors remain square (physically accurate)

### Feature 2: Drag-and-Drop Component Placement

**Problem**: Two-click workflow (click palette → click canvas) was not intuitive. Users didn't understand they needed to click again on the canvas.

**Solution**: Full drag-and-drop implementation from palette to canvas.

**Implementation Details**:

1. **Palette Button Events**:
   - `mousedown` on component button starts tracking
   - 5px movement threshold before drag begins (prevents accidental drags)

2. **Drag State**:
   ```javascript
   this.isDraggingFromPalette = false;
   this.dragComponentType = null;
   this.dragPreviewElement = null;
   this.paletteMouseStart = { x, y };
   ```

3. **Visual Preview**:
   - Creates floating div that follows cursor
   - Shows component icon and name
   - Blue border by default
   - Green border when over canvas (indicates valid drop zone)
   - Displays snapped grid coordinates below preview

4. **Grid Snap Feedback**:
   - Calculates world position from screen coordinates
   - Applies `BeamPhysics.snapToGrid()` with 25mm grid
   - Shows exact coordinates where component will be placed
   - Makes grid snapping immediately visible to user

5. **Drop Handling**:
   - Only places component if dropped on canvas
   - Automatically snaps to grid
   - Cleans up preview element
   - Resets drag state

**User Experience Improvements**:
- Component buttons show `cursor: grab` / `cursor: grabbing`
- Smooth dragging with visual feedback
- Clear indication of valid drop zones
- Grid snap is now discoverable through interaction

#### Files Modified

| File | Changes |
|------|---------|
| `js/models/Component.js` | Updated `ComponentDefaults` sizes for waveplate and filter |
| `js/main.js` | Added drag state variables, `handlePaletteDrag()`, `handlePaletteDrop()`, `createDragPreview()`, `removeDragPreview()` |
| `css/styles.css` | Added `.component-drag-preview` styling, `.over-canvas` state, grab/grabbing cursors, proportional icon sizes |
| `js/state.js` | Bumped `APP_VERSION` to 1.1 |
| `versionlog.txt` | Created version log for user-facing change tracking |
| `claude.md` | Updated documentation to reflect V1.1 changes |

### All Phase 6 Features Complete ✅

| Feature | Status |
|---------|--------|
| Accurate waveplate/filter proportions | ✅ Implemented |
| Proportional palette icons | ✅ All 7 components |
| Drag from palette | ✅ 5px threshold |
| Visual drag preview | ✅ Follows cursor |
| Drop zone indication | ✅ Green border over canvas |
| Grid snap preview | ✅ Shows coordinates |
| Component placement | ✅ Auto-snaps to grid |
| Version bump to 1.1 | ✅ Complete |
| Version log created | ✅ versionlog.txt |

---

## Phase 7: V1.2 Feature Update - COMPLETED

### Feature Implementation Progress

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **R Key Rotation Shortcut** | ✅ Done | Press R to rotate selected component 90° |
| 2 | **Right Pane Centering** | ✅ Done | Center-align all items in properties panel |
| 3 | **Rename Tools → Navigation** | ✅ Done | Simple HTML text change |
| 4 | **Global Grid Settings** | ✅ Done | Toggle + slider (1-50mm) |
| 5 | **Draggable Right Panel Divider** | ✅ Done | Resize panel width (180-400px) |
| 6 | **Right Panel Text Size Slider** | ✅ Done | 80%-150% range, persists to localStorage |
| 7 | **Workspace Background** | ✅ Done | Solid color or image file, path saved in JSON |
| 8 | **Multiple Wavelengths** | ✅ Done | 6 presets + custom, multi-color segments |

### Detailed Plan
See: `Plans/V1.2-Features-Plan.md`

### Files Modified
| File | Changes |
|------|---------|
| `index.html` | Left panel restructure (Navigation, Beams, Components, Zones, Grid), Settings modal, wavelength controls |
| `css/styles.css` | Right pane centering, panel resize handle, wavelength UI, settings modal, grid controls |
| `js/state.js` | Grid state, wavelength state (6 presets), background state, new action types, version bump to 1.2 |
| `js/main.js` | R key handler, grid controls, panel resize, text size slider, settings modal, wavelength selector |
| `js/models/BeamPath.js` | `wavelengthIds` array support on BeamSegment |
| `js/render/Renderer.js` | Multi-color segment rendering, background color/image rendering |

### All Phase 7 Features Complete ✅

Version 1.2 released - see `versionlog.txt` for full changelog.
