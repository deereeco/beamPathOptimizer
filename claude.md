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
