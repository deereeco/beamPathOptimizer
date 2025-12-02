# Beam Path Optimizer

A web-based tool for designing and optimizing optical beam paths on a breadboard. Place optical components, connect them with laser beams, and use simulated annealing optimization to find optimal component placements.

## Features

### Component Types
- **Source** - Laser light source with configurable emission direction
- **Mirror** - Reflects beam at angles (45° or 135° by default)
- **Beam Splitter** - Partially reflects and transmits light; supports shallow angles (5-10°)
- **Lens** - Transmits beam straight through; supports fixed path length constraints
- **Waveplate** - Transmits beam straight through
- **Filter** - Transmits beam straight through
- **Detector** - Terminal component that receives light

### Beam Physics Constraints
Realistic optical constraints are enforced:
- **Mirrors** snap to 45° or 135° angles (grid-locked)
- **Transmission components** (lenses, waveplates, filters) must be perpendicular to the beam
- **Beam splitters** support standard angles or shallow angles for specific applications
- **Invalid connections are blocked** with clear error messages

### Constraint Overrides
Each component has checkboxes to relax constraints when needed:
- **Snap to grid** - When checked, component positions snap to 25mm grid (default: ON)
- **Allow any angle** - When checked, component can use any 15° increment (default: OFF)

### Path Length Constraints
For lenses and beam splitters, you can specify fixed distances:
- **Input distance** - Fixed path length before the component
- **Output distance** - Fixed path length after the component
- **Reflected distance** - Fixed path length for reflected beam (beam splitters only)

### Optimization
Simulated annealing optimizer minimizes a weighted cost function:
- **Center of Mass** - Keep system CoM within mounting zone
- **Footprint** - Minimize total system footprint
- **Path Length** - Minimize total beam path length

The optimizer respects all constraints:
- Fixed components stay in place
- Grid snapping is applied per-component
- Fixed path lengths are maintained

### Zones
- **Mounting Zone** - Target area for center of mass (green)
- **Keep-out Zones** - Areas where components cannot be placed (red)

### Other Features
- Pan and zoom navigation
- Multi-select components (Shift+click or drag box)
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Save/Load projects as JSON
- Real-time center of mass display
- Constraint violation warnings

## Usage

### Getting Started
1. Open `index.html` in a web browser
2. Select a component type from the toolbar
3. Click on the canvas to place the component
4. Use the Properties panel to adjust component settings

### Creating Beam Connections
1. Click the "Connect" tool in the toolbar
2. Click on a source component
3. Click on a target component
4. If the connection is physically valid, a beam segment is created

### Running the Optimizer
1. Place your components and create beam connections
2. Set any components as "Fixed" that shouldn't move
3. Adjust optimization weights (CoM, Footprint, Path Length)
4. Click "Start" to begin optimization
5. Click "Apply" to keep results or "Revert" to undo

### Keyboard Shortcuts
- `Delete` / `Backspace` - Delete selected component
- `Ctrl+Z` - Undo
- `Ctrl+Shift+Z` - Redo
- `Ctrl+S` - Save project
- `Ctrl+O` - Open project
- `Escape` - Cancel current operation / Clear selection

## File Structure

```
beamPathOptimizer/
├── index.html              # Main HTML file
├── css/
│   └── styles.css          # Application styles
└── js/
    ├── main.js             # Application entry point
    ├── state.js            # State management (Redux-like)
    ├── models/
    │   ├── Component.js    # Component class and types
    │   └── BeamPath.js     # Beam path graph structure
    ├── physics/
    │   └── BeamPhysics.js  # Beam physics calculations
    ├── optimization/
    │   ├── Optimizer.js    # Simulated annealing optimizer
    │   └── CostFunction.js # Cost function calculations
    └── render/
        └── Renderer.js     # Canvas rendering
```

## Technical Details

### Coordinate System
- Origin (0,0) is at top-left of workspace
- X increases to the right
- Y increases downward
- Default workspace: 600mm x 600mm
- Grid size: 25mm

### Angle Convention
- 0° points right (+X direction)
- 90° points down (+Y direction)
- Angles increase clockwise

### Component Angles
- Mirrors/Beam splitters: Angle defines the surface orientation
- Sources: Angle defines emission direction
- Transmission components: Angle defines surface perpendicular to beam

## Browser Compatibility
Tested on modern browsers with ES6 module support:
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License
MIT License
