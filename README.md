# Beam Path Optimizer

A web-based tool for designing and optimizing optical beam paths on a breadboard. Place optical components, connect them with laser beams, and use simulated annealing optimization to find optimal component placements.

**Current Version: 1.2**

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

### Multiple Wavelengths / Beam Colors
- Select wavelength before adding beams (Beams section in left panel)
- **6 preset wavelengths**: 633nm HeNe (red), 532nm Nd:YAG (green), 1064nm IR, 405nm Violet, 780nm GaAs, 850nm VCSEL
- Add custom wavelengths via the gear button
- Beam segments can display multiple colors for co-aligned beams

### Workspace Settings
- **Background**: Choose solid color or image file via Settings (gear icon in toolbar)
- **Grid**: Toggle grid snapping on/off globally, adjust grid size (1-50mm) in the Grid section

### Constraint Overrides
Each component has checkboxes to relax constraints when needed:
- **Snap to grid** - When checked, component positions snap to grid (default: ON)
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
- **Relative beam angles are preserved** - When components move or rotate, their input/output beam angles relative to their own orientation are maintained

### Results View
After optimization completes, click "View Results" to explore the optimization history:
- **Cost vs Iteration Graph** - Visual timeline of the optimization process
- **Hover** - See iteration number and cost for any point
- **Click** - Select an iteration to inspect
- **Double-click** - Preview that iteration's layout on the canvas
- **Apply This Layout** - Apply any iteration, not just the best
- **Split-screen comparison** - Toggle to see original vs selected side-by-side
- **Press Escape** - Exit preview mode and return to current layout

### Zones
- **Mounting Zone** - Target area for center of mass (green)
- **Keep-out Zones** - Areas where components cannot be placed (red)

### UI Features
- **Drag-and-drop** components from palette to canvas
- **Pan and zoom** navigation (scroll wheel, shift+drag)
- **Multi-select** components (Ctrl+click or drag box)
- **Resizable right panel** - drag divider to adjust width
- **Adjustable text size** - slider at top of properties panel (80-150%)
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Save/Load projects as JSON
- Real-time center of mass display
- Constraint violation warnings

## Usage

### Getting Started
1. Open `index.html` in a web browser (serve via HTTP server for ES modules)
2. Drag a component from the left panel onto the canvas
3. Components snap to grid automatically (grid size adjustable in Grid section)
4. Use the Properties panel on the right to adjust component settings

### Creating Beam Connections
1. Select a wavelength in the Beams section (left panel)
2. Click the "Add Beams" tool
3. Click on a source component, then click on a target component
4. If the connection is physically valid, a beam segment is created

### Running the Optimizer
1. Place your components and create beam connections
2. Set any components as "Fixed" that shouldn't move
3. Adjust optimization weights (CoM, Footprint, Path Length)
4. Click "Start" to begin optimization
5. When complete, choose:
   - **Accept** - Apply the best result found
   - **Revert** - Undo all changes
   - **View Results** - Explore the optimization history

### Using Results View
1. After optimization, click "View Results"
2. The graph shows cost vs iteration - lower is better
3. Hover over points to see details
4. Click to select, double-click to preview on canvas
5. Use split-screen checkbox to compare original vs selected
6. Click "Apply This Layout" to apply any iteration you like
7. Press Escape or "Close Results View" to exit

### Keyboard Shortcuts
- `V` - Select tool
- `H` - Pan tool
- `C` - Add Beams (connect) tool
- `M` - Place mirror
- `S` - Place source
- `R` - Rotate selected component(s) 90° clockwise
- `Delete` / `Backspace` - Delete selected
- `Ctrl+Z` - Undo
- `Ctrl+Y` / `Ctrl+Shift+Z` - Redo
- `Ctrl+S` - Save project
- `+` / `-` - Zoom in/out
- `Escape` - Cancel operation / Clear selection / Exit preview mode

## File Structure

```
beamPathOptimizer/
├── index.html              # Main HTML file
├── README.md               # This file
├── claude.md               # Developer reference documentation
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
    │   ├── Optimizer.js    # Simulated annealing optimizer (with constrained moves)
    │   └── CostFunction.js # Cost function calculations
    └── render/
        ├── Renderer.js     # Canvas rendering (includes preview modes)
        └── ResultsGraph.js # Optimization results graph visualization
```

## Technical Details

### Coordinate System
- Origin (0,0) is at top-left of workspace
- X increases to the right
- Y increases downward
- Default workspace: 600mm x 600mm
- Default grid size: 25mm (configurable 1-50mm)

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

## Version History

See `versionlog.txt` for detailed changelog of all versions.

## License
MIT License
