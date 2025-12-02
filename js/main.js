/**
 * Beam Path Optimizer - Main Application Entry Point
 */

import { Component, ComponentType, ComponentNames } from './models/Component.js';
import { BeamSegment, BeamPath } from './models/BeamPath.js';
import { Store, actions, createInitialState } from './state.js';
import { Renderer } from './render/Renderer.js';
import { Optimizer, OptimizerState } from './optimization/Optimizer.js';
import * as BeamPhysics from './physics/BeamPhysics.js';

/**
 * Main Application Class
 */
class BeamPathOptimizerApp {
    constructor() {
        // Initialize store
        this.store = new Store(createInitialState());

        // Get canvas and initialize renderer
        this.canvas = document.getElementById('main-canvas');
        this.renderer = new Renderer(this.canvas);

        // Interaction state
        this.isDragging = false;
        this.dragStart = null;
        this.dragComponent = null;
        this.dragZone = null;          // Zone being dragged
        this.dragZoneOffset = null;    // Offset from zone top-left to click point
        this.isPanning = false;
        this.panStart = null;
        this.isSelectionBoxDragging = false;

        // Optimizer
        this.optimizer = new Optimizer();
        this.originalPositionsBeforeOptimize = null;
        this.selectionBoxStart = null;

        // Bind methods
        this.render = this.render.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);

        // Initialize
        this.setupEventListeners();
        this.setupUIBindings();

        // Subscribe to state changes
        this.store.subscribe(() => {
            this.render();
            this.updateUI();
        });

        // Initial render
        this.render();
        this.updateUI();

        console.log('Beam Path Optimizer initialized');
    }

    /**
     * Set up canvas event listeners
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseUp);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        document.addEventListener('keydown', this.handleKeyDown);
    }

    /**
     * Set up UI button and input bindings
     */
    setupUIBindings() {
        // Tool buttons
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
            });
        });

        // Component buttons (drag-and-drop or click-to-place)
        document.querySelectorAll('.component-btn[data-component]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.startPlacingComponent(btn.dataset.component);
            });
        });

        // Toolbar buttons
        document.getElementById('btn-new')?.addEventListener('click', () => this.newDocument());
        document.getElementById('btn-open')?.addEventListener('click', () => this.openDocument());
        document.getElementById('btn-save')?.addEventListener('click', () => this.saveDocument());
        document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());

        // Workspace size inputs
        document.getElementById('workspace-width')?.addEventListener('change', (e) => {
            const width = parseInt(e.target.value) || 600;
            const height = parseInt(document.getElementById('workspace-height').value) || 600;
            this.store.dispatch(actions.setWorkspaceSize(width, height));
        });
        document.getElementById('workspace-height')?.addEventListener('change', (e) => {
            const width = parseInt(document.getElementById('workspace-width').value) || 600;
            const height = parseInt(e.target.value) || 600;
            this.store.dispatch(actions.setWorkspaceSize(width, height));
        });

        // Zoom controls
        document.getElementById('zoom-in')?.addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoom-out')?.addEventListener('click', () => this.zoom(0.8));
        document.getElementById('zoom-fit')?.addEventListener('click', () => this.zoomFit());

        // Property panel inputs
        this.setupPropertyInputs();

        // Delete button
        document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-duplicate')?.addEventListener('click', () => this.duplicateSelected());

        // Zone property inputs
        this.setupZonePropertyInputs();

        // Optimizer controls
        this.setupOptimizerControls();
    }

    /**
     * Set up property panel input bindings
     */
    setupPropertyInputs() {
        const inputs = {
            'prop-name': 'name',
            'prop-x': 'position.x',
            'prop-y': 'position.y',
            'prop-angle': 'angle',
            'prop-angle-slider': 'angle',
            'prop-mass': 'mass',
            'prop-width': 'size.width',
            'prop-height': 'size.height',
            'prop-fixed': 'isFixed'
        };

        Object.entries(inputs).forEach(([inputId, propPath]) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            input.addEventListener('change', () => {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (!selectedId) return;

                const component = state.components.get(selectedId);
                if (!component) return;

                let value = input.type === 'checkbox' ? input.checked :
                           input.type === 'range' ? parseFloat(input.value) :
                           input.type === 'number' ? parseFloat(input.value) : input.value;

                // Apply angle constraints if updating angle and allowAnyAngle is false
                if (propPath === 'angle' && !component.allowAnyAngle) {
                    value = BeamPhysics.snapAngleToValid(
                        value,
                        component.type,
                        component.isShallowAngle,
                        component.shallowAngle
                    );
                    // Update the input to show the snapped value
                    input.value = value;
                    document.getElementById('prop-angle').value = value;
                    document.getElementById('prop-angle-slider').value = value;
                }

                // Handle nested properties
                const updates = {};
                if (propPath.includes('.')) {
                    const [parent, child] = propPath.split('.');
                    updates[parent] = { ...component[parent], [child]: value };
                } else {
                    updates[propPath] = value;
                }

                this.store.dispatch(actions.updateComponent(selectedId, updates));
            });

            // Sync angle slider and input
            if (inputId === 'prop-angle-slider') {
                input.addEventListener('input', () => {
                    document.getElementById('prop-angle').value = input.value;
                });
            }
            if (inputId === 'prop-angle') {
                input.addEventListener('input', () => {
                    document.getElementById('prop-angle-slider').value = input.value;
                });
            }
        });

        // Reflectance slider
        const reflectanceSlider = document.getElementById('prop-reflectance-slider');
        if (reflectanceSlider) {
            reflectanceSlider.addEventListener('input', () => {
                document.getElementById('prop-reflectance-value').textContent = reflectanceSlider.value;
            });
            reflectanceSlider.addEventListener('change', () => {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (!selectedId) return;

                const reflectance = parseFloat(reflectanceSlider.value) / 100;
                this.store.dispatch(actions.updateComponent(selectedId, {
                    reflectance,
                    transmittance: 1 - reflectance
                }));
            });
        }

        // Mount zone controls
        const mountEnabledCheckbox = document.getElementById('prop-mount-enabled');
        const mountDetailsControls = document.getElementById('mount-details-controls');

        if (mountEnabledCheckbox) {
            mountEnabledCheckbox.addEventListener('change', () => {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (!selectedId) return;

                const enabled = mountEnabledCheckbox.checked;
                this.store.dispatch(actions.updateComponent(selectedId, {
                    mountZone: { enabled }
                }));

                // Show/hide detail controls
                if (mountDetailsControls) {
                    mountDetailsControls.style.display = enabled ? 'flex' : 'none';
                }
            });
        }

        // Mount zone padding X
        document.getElementById('prop-mount-padding-x')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const paddingX = parseFloat(e.target.value) || 10;
            this.store.dispatch(actions.updateComponent(selectedId, {
                mountZone: { paddingX }
            }));
        });

        // Mount zone padding Y
        document.getElementById('prop-mount-padding-y')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const paddingY = parseFloat(e.target.value) || 10;
            this.store.dispatch(actions.updateComponent(selectedId, {
                mountZone: { paddingY }
            }));
        });

        // Mount zone offset X
        document.getElementById('prop-mount-offset-x')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const offsetX = parseFloat(e.target.value) || 0;
            this.store.dispatch(actions.updateComponent(selectedId, {
                mountZone: { offsetX }
            }));
        });

        // Mount zone offset Y
        document.getElementById('prop-mount-offset-y')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const offsetY = parseFloat(e.target.value) || 0;
            this.store.dispatch(actions.updateComponent(selectedId, {
                mountZone: { offsetY }
            }));
        });

        // === Beam Physics Controls ===
        this.setupBeamPhysicsControls();
    }

    /**
     * Set up beam physics property controls
     */
    setupBeamPhysicsControls() {
        // Source emission direction
        document.getElementById('prop-emission-angle')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const emissionAngle = parseInt(e.target.value) || 0;
            this.store.dispatch(actions.updateComponent(selectedId, { emissionAngle }));
        });

        // Shallow angle mode toggle
        const shallowEnabledCheckbox = document.getElementById('prop-shallow-enabled');
        const shallowAngleControls = document.getElementById('shallow-angle-controls');

        shallowEnabledCheckbox?.addEventListener('change', () => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const isShallowAngle = shallowEnabledCheckbox.checked;
            this.store.dispatch(actions.updateComponent(selectedId, {
                isShallowAngle,
                snapToGrid: !isShallowAngle  // Auto-disable grid snap for shallow angle
            }));

            if (shallowAngleControls) {
                shallowAngleControls.style.display = isShallowAngle ? 'block' : 'none';
            }

            // Update snap grid checkbox
            document.getElementById('prop-snap-grid').checked = !isShallowAngle;
        });

        // Shallow angle value
        document.getElementById('prop-shallow-angle')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const shallowAngle = parseFloat(e.target.value) || 5;
            this.store.dispatch(actions.updateComponent(selectedId, { shallowAngle }));
        });

        // Grid snap toggle
        document.getElementById('prop-snap-grid')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            this.store.dispatch(actions.updateComponent(selectedId, {
                snapToGrid: e.target.checked
            }));
        });

        // Allow any angle toggle
        document.getElementById('prop-allow-any-angle')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            this.store.dispatch(actions.updateComponent(selectedId, {
                allowAnyAngle: e.target.checked
            }));
        });

        // Path constraint enabled toggle
        const pathConstraintEnabled = document.getElementById('prop-path-constraint-enabled');
        const pathConstraintDetails = document.getElementById('path-constraint-details');

        pathConstraintEnabled?.addEventListener('change', () => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const enabled = pathConstraintEnabled.checked;
            this.store.dispatch(actions.updateComponent(selectedId, {
                pathConstraints: { enabled }
            }));

            if (pathConstraintDetails) {
                pathConstraintDetails.style.display = enabled ? 'block' : 'none';
            }
        });

        // Fix input distance checkbox
        const fixInputDist = document.getElementById('prop-fix-input-dist');
        const inputDistanceInput = document.getElementById('prop-input-distance');

        fixInputDist?.addEventListener('change', () => {
            inputDistanceInput.disabled = !fixInputDist.checked;
            if (!fixInputDist.checked) {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (selectedId) {
                    this.store.dispatch(actions.updateComponent(selectedId, {
                        pathConstraints: { inputDistance: null }
                    }));
                }
            }
        });

        inputDistanceInput?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const inputDistance = parseFloat(e.target.value) || null;
            this.store.dispatch(actions.updateComponent(selectedId, {
                pathConstraints: { inputDistance }
            }));
        });

        // Fix output distance checkbox (for lenses)
        const fixOutputDist = document.getElementById('prop-fix-output-dist');
        const outputDistanceInput = document.getElementById('prop-output-distance');

        fixOutputDist?.addEventListener('change', () => {
            outputDistanceInput.disabled = !fixOutputDist.checked;
            if (!fixOutputDist.checked) {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (selectedId) {
                    this.store.dispatch(actions.updateComponent(selectedId, {
                        pathConstraints: { outputDistance: null }
                    }));
                }
            }
        });

        outputDistanceInput?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const outputDistance = parseFloat(e.target.value) || null;
            this.store.dispatch(actions.updateComponent(selectedId, {
                pathConstraints: { outputDistance }
            }));
        });

        // Fix reflected distance checkbox (for beam splitters)
        const fixReflectedDist = document.getElementById('prop-fix-reflected-dist');
        const reflectedDistanceInput = document.getElementById('prop-reflected-distance');

        fixReflectedDist?.addEventListener('change', () => {
            reflectedDistanceInput.disabled = !fixReflectedDist.checked;
            if (!fixReflectedDist.checked) {
                const state = this.store.getState();
                const selectedId = state.ui.selection.selectedIds[0];
                if (selectedId) {
                    this.store.dispatch(actions.updateComponent(selectedId, {
                        pathConstraints: { reflectedDistance: null }
                    }));
                }
            }
        });

        reflectedDistanceInput?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const selectedId = state.ui.selection.selectedIds[0];
            if (!selectedId) return;

            const reflectedDistance = parseFloat(e.target.value) || null;
            this.store.dispatch(actions.updateComponent(selectedId, {
                pathConstraints: { reflectedDistance }
            }));
        });
    }

    /**
     * Set up zone property input bindings
     */
    setupZonePropertyInputs() {
        // Zone name
        document.getElementById('zone-prop-name')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId) return;

            if (zoneId === 'mounting') {
                this.store.dispatch(actions.updateMountingZone({ name: e.target.value }));
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                this.store.dispatch(actions.updateKeepOutZone(id, { name: e.target.value }));
            }
        });

        // Zone position X
        document.getElementById('zone-prop-x')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId) return;

            const x = parseFloat(e.target.value) || 0;
            if (zoneId === 'mounting') {
                this.store.dispatch(actions.updateMountingZone({ bounds: { x } }));
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                const zone = state.constraints.keepOutZones.find(z => z.id === id);
                if (zone) {
                    this.store.dispatch(actions.updateKeepOutZone(id, {
                        bounds: { ...zone.bounds, x }
                    }));
                }
            }
        });

        // Zone position Y
        document.getElementById('zone-prop-y')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId) return;

            const y = parseFloat(e.target.value) || 0;
            if (zoneId === 'mounting') {
                this.store.dispatch(actions.updateMountingZone({ bounds: { y } }));
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                const zone = state.constraints.keepOutZones.find(z => z.id === id);
                if (zone) {
                    this.store.dispatch(actions.updateKeepOutZone(id, {
                        bounds: { ...zone.bounds, y }
                    }));
                }
            }
        });

        // Zone width
        document.getElementById('zone-prop-width')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId) return;

            const width = parseFloat(e.target.value) || 10;
            if (zoneId === 'mounting') {
                this.store.dispatch(actions.updateMountingZone({ bounds: { width } }));
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                const zone = state.constraints.keepOutZones.find(z => z.id === id);
                if (zone) {
                    this.store.dispatch(actions.updateKeepOutZone(id, {
                        bounds: { ...zone.bounds, width }
                    }));
                }
            }
        });

        // Zone height
        document.getElementById('zone-prop-height')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId) return;

            const height = parseFloat(e.target.value) || 10;
            if (zoneId === 'mounting') {
                this.store.dispatch(actions.updateMountingZone({ bounds: { height } }));
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                const zone = state.constraints.keepOutZones.find(z => z.id === id);
                if (zone) {
                    this.store.dispatch(actions.updateKeepOutZone(id, {
                        bounds: { ...zone.bounds, height }
                    }));
                }
            }
        });

        // Zone active (keep-out zones only)
        document.getElementById('zone-prop-active')?.addEventListener('change', (e) => {
            const state = this.store.getState();
            const zoneId = state.ui.selection.selectedZoneId;
            if (!zoneId || !zoneId.startsWith('keepout:')) return;

            const id = zoneId.replace('keepout:', '');
            this.store.dispatch(actions.updateKeepOutZone(id, { isActive: e.target.checked }));
        });

        // Delete zone button
        document.getElementById('btn-delete-zone')?.addEventListener('click', () => {
            this.deleteSelected();
        });
    }

    /**
     * Set up optimizer control bindings
     */
    setupOptimizerControls() {
        // Weight sliders
        ['weight-com', 'weight-footprint', 'weight-path'].forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', () => {
                    slider.nextElementSibling.textContent = slider.value + '%';
                });
            }
        });

        // Start optimization button
        document.getElementById('btn-optimize')?.addEventListener('click', () => {
            this.startOptimization();
        });

        // Pause button
        document.getElementById('btn-pause-optimize')?.addEventListener('click', () => {
            this.pauseOptimization();
        });

        // Resume button
        document.getElementById('btn-resume-optimize')?.addEventListener('click', () => {
            this.resumeOptimization();
        });

        // Stop buttons
        document.getElementById('btn-stop-optimize')?.addEventListener('click', () => {
            this.stopOptimization();
        });
        document.getElementById('btn-stop-optimize-2')?.addEventListener('click', () => {
            this.stopOptimization();
        });

        // Accept button
        document.getElementById('btn-accept-optimize')?.addEventListener('click', () => {
            this.acceptOptimization();
        });

        // Revert button
        document.getElementById('btn-revert-optimize')?.addEventListener('click', () => {
            this.revertOptimization();
        });

        // Set up optimizer callbacks
        this.optimizer.onProgress = (progress) => {
            this.updateOptimizerProgress(progress);
        };

        this.optimizer.onStep = (positions) => {
            // Live preview: apply positions and re-render (skip full recalculate for speed)
            positions.forEach((pos, id) => {
                const comp = this.store.getState().components.get(id);
                if (comp) {
                    comp.position = { ...pos };
                }
            });
            // Just render, don't recalculate - that happens at the end
            this.render();
        };

        this.optimizer.onComplete = (result) => {
            this.onOptimizationComplete(result);
        };
    }

    /**
     * Get current optimization weights from sliders
     */
    getOptimizationWeights() {
        const comSlider = document.getElementById('weight-com');
        const footprintSlider = document.getElementById('weight-footprint');
        const pathSlider = document.getElementById('weight-path');

        const com = parseFloat(comSlider?.value || 50) / 100;
        const footprint = parseFloat(footprintSlider?.value || 25) / 100;
        const pathLength = parseFloat(pathSlider?.value || 25) / 100;

        // Normalize so they sum to 1
        const total = com + footprint + pathLength;
        return {
            com: com / total,
            footprint: footprint / total,
            pathLength: pathLength / total
        };
    }

    /**
     * Start optimization
     */
    startOptimization() {
        const state = this.store.getState();

        // Check if there are movable components
        const movableCount = Array.from(state.components.values())
            .filter(c => !c.isFixed).length;

        if (movableCount === 0) {
            alert('No movable components to optimize. Uncheck "Fixed Position" on components you want to move.');
            return;
        }

        // Store original positions for revert
        this.originalPositionsBeforeOptimize = new Map();
        state.components.forEach((comp, id) => {
            this.originalPositionsBeforeOptimize.set(id, { ...comp.position });
        });

        // Get weights and start
        const weights = this.getOptimizationWeights();
        this.optimizer.start(state, weights);

        // Update UI
        this.showOptimizerButtons('running');
        document.getElementById('optimizer-progress').classList.remove('hidden');
    }

    /**
     * Pause optimization
     */
    pauseOptimization() {
        this.optimizer.pause();
        this.showOptimizerButtons('paused');
    }

    /**
     * Resume optimization
     */
    resumeOptimization() {
        this.optimizer.resume();
        this.showOptimizerButtons('running');
    }

    /**
     * Stop optimization
     */
    stopOptimization() {
        this.optimizer.stop();

        // Apply best positions found
        const bestPositions = this.optimizer.getBestPositions();
        bestPositions.forEach((pos, id) => {
            const comp = this.store.getState().components.get(id);
            if (comp) {
                comp.position = { ...pos };
            }
        });

        this.store.dispatch(actions.recalculate());
        this.render();

        // Show accept/revert buttons
        this.showOptimizerButtons('finished');
    }

    /**
     * Accept optimization results
     */
    acceptOptimization() {
        // Positions are already applied, just reset UI
        this.originalPositionsBeforeOptimize = null;
        this.showOptimizerButtons('start');
        document.getElementById('optimizer-progress').classList.add('hidden');
        this.store.dispatch(actions.markDirty());
    }

    /**
     * Revert optimization results
     */
    revertOptimization() {
        if (this.originalPositionsBeforeOptimize) {
            this.originalPositionsBeforeOptimize.forEach((pos, id) => {
                const comp = this.store.getState().components.get(id);
                if (comp) {
                    comp.position = { ...pos };
                }
            });
            this.originalPositionsBeforeOptimize = null;
        }

        this.store.dispatch(actions.recalculate());
        this.render();

        this.showOptimizerButtons('start');
        document.getElementById('optimizer-progress').classList.add('hidden');
    }

    /**
     * Update optimizer progress UI
     */
    updateOptimizerProgress(progress) {
        // Update progress bar
        document.getElementById('opt-progress-bar').value = progress.progress * 100;

        // Update status text with meaningful information
        const statusText = document.getElementById('opt-status-text');
        if (progress.iterationsSinceImprovement > 100) {
            statusText.textContent = `Searching... (${progress.iterationsSinceImprovement} since improvement)`;
        } else if (progress.improvement > 0) {
            statusText.textContent = `Optimizing... found ${progress.improvement.toFixed(1)}% improvement`;
        } else {
            statusText.textContent = `Optimizing... (${Math.round(progress.progress * 100)}% complete)`;
        }

        // Update improvement percentage
        const improvementEl = document.getElementById('opt-improvement');
        improvementEl.textContent = `${progress.improvement.toFixed(1)}%`;
        improvementEl.className = 'opt-stat-value' + (progress.improvement > 5 ? ' good' : '');

        // Update iteration count
        document.getElementById('opt-iteration').textContent =
            `${progress.iteration}/${progress.maxIterations}`;

        // Update CoM distance from cost breakdown
        const comCostEl = document.getElementById('opt-com-cost');
        if (progress.costBreakdown && progress.costBreakdown.com !== undefined) {
            const comDist = Math.sqrt(progress.costBreakdown.com);
            comCostEl.textContent = comDist < 1 ? 'In zone' : `${comDist.toFixed(0)}mm`;
            comCostEl.className = 'opt-stat-value' + (comDist < 1 ? ' good' : '');
        }

        // Update violations count
        const penaltyEl = document.getElementById('opt-penalty');
        if (progress.costBreakdown && progress.costBreakdown.penalty !== undefined) {
            const violations = progress.costBreakdown.penalty > 0 ?
                Math.ceil(progress.costBreakdown.penalty / 1000) : 0;
            penaltyEl.textContent = violations.toString();
            penaltyEl.className = 'opt-stat-value' + (violations > 0 ? ' bad' : ' good');
        }
    }

    /**
     * Handle optimization complete
     */
    onOptimizationComplete(result) {
        console.log('Optimization complete:', result);

        // Do a full recalculate now that optimization is done
        this.store.dispatch(actions.recalculate());
        this.render();
        this.updateUI();

        // Update final status text
        const statusText = document.getElementById('opt-status-text');
        if (result.reason === 'earlyStop') {
            statusText.textContent = `Done! (converged after ${result.iteration} iterations)`;
        } else {
            statusText.textContent = `Done! (${result.improvement.toFixed(1)}% improvement)`;
        }

        this.showOptimizerButtons('finished');
    }

    /**
     * Show appropriate optimizer buttons for state
     */
    showOptimizerButtons(state) {
        const startBtns = document.getElementById('opt-buttons-start');
        const runningBtns = document.getElementById('opt-buttons-running');
        const pausedBtns = document.getElementById('opt-buttons-paused');
        const finishedBtns = document.getElementById('opt-buttons-finished');

        [startBtns, runningBtns, pausedBtns, finishedBtns].forEach(el => {
            if (el) el.classList.add('hidden');
        });

        switch (state) {
            case 'start':
                startBtns?.classList.remove('hidden');
                break;
            case 'running':
                runningBtns?.classList.remove('hidden');
                break;
            case 'paused':
                pausedBtns?.classList.remove('hidden');
                break;
            case 'finished':
                finishedBtns?.classList.remove('hidden');
                break;
        }
    }

    /**
     * Set the current tool
     */
    setTool(tool) {
        this.store.dispatch(actions.setTool(tool));

        // Update UI
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Update cursor
        this.canvas.style.cursor = tool === 'pan' ? 'grab' :
                                   tool === 'select' ? 'default' : 'crosshair';
    }

    /**
     * Start placing a new component
     */
    startPlacingComponent(componentType) {
        const state = this.store.getState();
        this.store.dispatch(actions.setTool(componentType));
        this.canvas.style.cursor = 'crosshair';
    }

    /**
     * Handle mouse down on canvas
     */
    handleMouseDown(e) {
        const state = this.store.getState();
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.renderer.screenToWorld(screenX, screenY, state.ui.viewport);

        const tool = state.ui.tool;

        // Check if clicking on a component
        const clickedComponent = this.getComponentAtPosition(worldPos.x, worldPos.y);
        // Check if clicking on a zone
        const clickedZone = this.getZoneAtPosition(worldPos.x, worldPos.y);

        if (tool === 'pan' || (e.button === 1) || (e.button === 0 && e.shiftKey && !e.ctrlKey)) {
            // Start panning
            this.isPanning = true;
            this.panStart = { x: screenX, y: screenY };
            this.canvas.style.cursor = 'grabbing';
        } else if (tool === 'select') {
            if (clickedComponent) {
                // Ctrl+click for multi-select
                if (e.ctrlKey || e.metaKey) {
                    const currentSelected = [...state.ui.selection.selectedIds];
                    const idx = currentSelected.indexOf(clickedComponent.id);
                    if (idx > -1) {
                        // Deselect if already selected
                        currentSelected.splice(idx, 1);
                    } else {
                        // Add to selection
                        currentSelected.push(clickedComponent.id);
                    }
                    this.store.dispatch(actions.selectMultiple(currentSelected));
                } else {
                    // Regular click - select single component
                    this.store.dispatch(actions.selectComponent(clickedComponent.id));
                }
                // Start dragging
                this.isDragging = true;
                this.dragStart = worldPos;
                this.dragComponent = clickedComponent;
            } else if (clickedZone) {
                // Clicked on a zone
                this.store.dispatch(actions.selectZone(clickedZone.id));
                // Start dragging zone
                this.isDragging = true;
                this.dragStart = worldPos;
                this.dragZone = clickedZone;
                this.dragZoneOffset = {
                    x: worldPos.x - clickedZone.zone.bounds.x,
                    y: worldPos.y - clickedZone.zone.bounds.y
                };
            } else {
                // Clicked on empty area - start selection box
                this.store.dispatch(actions.clearSelection());
                this.isSelectionBoxDragging = true;
                this.selectionBoxStart = worldPos;
                // Update state with selection box
                this.store.state = {
                    ...state,
                    ui: {
                        ...state.ui,
                        selectionBox: {
                            startX: worldPos.x,
                            startY: worldPos.y,
                            endX: worldPos.x,
                            endY: worldPos.y
                        }
                    }
                };
            }
        } else if (tool === 'connect') {
            // Beam connection mode
            if (clickedComponent && clickedComponent.canOutputBeam()) {
                this.connectingFrom = clickedComponent;
                console.log('Connecting from:', clickedComponent.name);
            }
        } else if (tool === 'keepout') {
            // Start drawing keep-out zone
            this.zoneStart = worldPos;
        } else if (tool === 'mounting') {
            // Start drawing mounting zone
            this.zoneStart = worldPos;
        } else if (Object.values(ComponentType).includes(tool)) {
            // Placing a new component
            this.placeComponent(tool, worldPos);
        }
    }

    /**
     * Handle mouse move on canvas
     */
    handleMouseMove(e) {
        const state = this.store.getState();
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.renderer.screenToWorld(screenX, screenY, state.ui.viewport);

        // Update cursor position in status bar
        document.getElementById('cursor-position').textContent =
            `(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)})`;

        if (this.isPanning) {
            // Pan the viewport
            const dx = screenX - this.panStart.x;
            const dy = screenY - this.panStart.y;
            this.store.dispatch(actions.setViewport({
                panX: state.ui.viewport.panX + dx,
                panY: state.ui.viewport.panY + dy
            }));
            this.panStart = { x: screenX, y: screenY };
        } else if (this.isSelectionBoxDragging) {
            // Update selection box
            const newState = {
                ...state,
                ui: {
                    ...state.ui,
                    selectionBox: {
                        startX: this.selectionBoxStart.x,
                        startY: this.selectionBoxStart.y,
                        endX: worldPos.x,
                        endY: worldPos.y
                    }
                }
            };
            this.store.state = newState;
            this.render();
        } else if (this.isDragging && this.dragComponent) {
            // Move component(s)
            if (!this.dragComponent.isFixed) {
                // If multiple components selected, move all of them
                const selectedIds = state.ui.selection.selectedIds;
                if (selectedIds.length > 1 && selectedIds.includes(this.dragComponent.id)) {
                    const dx = worldPos.x - this.dragStart.x;
                    const dy = worldPos.y - this.dragStart.y;
                    selectedIds.forEach(id => {
                        const comp = state.components.get(id);
                        if (comp && !comp.isFixed) {
                            let newPos = {
                                x: comp.position.x + dx,
                                y: comp.position.y + dy
                            };
                            // Apply grid snapping if enabled for this component
                            if (comp.snapToGrid !== false) {
                                newPos = BeamPhysics.snapToGrid(newPos, 25);
                            }
                            this.store.dispatch(actions.moveComponent(id, newPos));
                        }
                    });
                    this.dragStart = worldPos;
                } else {
                    // Apply grid snapping if enabled for this component
                    let newPos = { x: worldPos.x, y: worldPos.y };
                    if (this.dragComponent.snapToGrid !== false) {
                        newPos = BeamPhysics.snapToGrid(newPos, 25);
                    }
                    this.store.dispatch(actions.moveComponent(this.dragComponent.id, newPos));
                }
            }
        } else if (this.isDragging && this.dragZone) {
            // Move zone
            const newX = worldPos.x - this.dragZoneOffset.x;
            const newY = worldPos.y - this.dragZoneOffset.y;
            this.store.dispatch(actions.moveZone(this.dragZone.id, { x: newX, y: newY }));
        } else {
            // Hover detection for components and zones
            const hovered = this.getComponentAtPosition(worldPos.x, worldPos.y);
            const hoveredZone = !hovered ? this.getZoneAtPosition(worldPos.x, worldPos.y) : null;

            const currentHovered = state.ui.selection.hoveredId;
            const currentHoveredZone = state.ui.selection.hoveredZoneId;

            if (hovered?.id !== currentHovered || hoveredZone?.id !== currentHoveredZone) {
                // Update hover state (without adding to history)
                const newState = {
                    ...state,
                    ui: {
                        ...state.ui,
                        selection: {
                            ...state.ui.selection,
                            hoveredId: hovered?.id || null,
                            hoveredZoneId: hoveredZone?.id || null
                        }
                    }
                };
                // Direct state update for hover (not through dispatch to avoid history)
                this.store.state = newState;
                this.render();
            }
        }
    }

    /**
     * Handle mouse up on canvas
     */
    handleMouseUp(e) {
        const state = this.store.getState();
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.renderer.screenToWorld(screenX, screenY, state.ui.viewport);

        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = state.ui.tool === 'pan' ? 'grab' : 'default';
        }

        if (this.isDragging) {
            this.isDragging = false;
            this.dragComponent = null;
            this.dragZone = null;
            this.dragZoneOffset = null;
        }

        // Handle selection box completion
        if (this.isSelectionBoxDragging) {
            const box = state.ui.selectionBox;
            if (box) {
                const selectedIds = this.getComponentsInBox(box);
                if (selectedIds.length > 0) {
                    this.store.dispatch(actions.selectMultiple(selectedIds));
                }
            }
            // Clear selection box
            this.isSelectionBoxDragging = false;
            this.selectionBoxStart = null;
            this.store.state = {
                ...this.store.state,
                ui: {
                    ...this.store.state.ui,
                    selectionBox: null
                }
            };
            this.render();
        }

        // Handle beam connection completion
        if (this.connectingFrom) {
            const clickedComponent = this.getComponentAtPosition(worldPos.x, worldPos.y);
            if (clickedComponent && clickedComponent.id !== this.connectingFrom.id &&
                clickedComponent.canReceiveBeam()) {
                this.createBeamConnection(this.connectingFrom, clickedComponent);
            }
            this.connectingFrom = null;
        }

        // Handle zone drawing completion
        if (this.zoneStart) {
            const zone = {
                id: `zone_${Date.now()}`,
                name: state.ui.tool === 'keepout' ? 'Keep-Out Zone' : 'Mounting Zone',
                bounds: {
                    x: Math.min(this.zoneStart.x, worldPos.x),
                    y: Math.min(this.zoneStart.y, worldPos.y),
                    width: Math.abs(worldPos.x - this.zoneStart.x),
                    height: Math.abs(worldPos.y - this.zoneStart.y)
                },
                isActive: true
            };

            if (zone.bounds.width > 10 && zone.bounds.height > 10) {
                if (state.ui.tool === 'keepout') {
                    this.store.dispatch(actions.addKeepOutZone(zone));
                    // Auto-select the new keepout zone
                    this.store.dispatch(actions.selectZone(`keepout:${zone.id}`));
                } else if (state.ui.tool === 'mounting') {
                    this.store.dispatch(actions.setMountingZone(zone));
                    // Mounting zone auto-selects in state reducer
                }
            }

            this.zoneStart = null;
            this.setTool('select');
        }
    }

    /**
     * Handle mouse wheel for zooming
     */
    handleWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(factor);
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(e) {
        // Don't handle if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const state = this.store.getState();

        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                break;
            case 'Escape':
                this.store.dispatch(actions.clearSelection());
                this.setTool('select');
                break;
            case 'v':
            case 'V':
                this.setTool('select');
                break;
            case 'h':
            case 'H':
                this.setTool('pan');
                break;
            case 'c':
            case 'C':
                this.setTool('connect');
                break;
            case 'm':
            case 'M':
                this.startPlacingComponent(ComponentType.MIRROR);
                break;
            case 's':
            case 'S':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.saveDocument();
                } else {
                    this.startPlacingComponent(ComponentType.SOURCE);
                }
                break;
            case 'z':
            case 'Z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case 'y':
            case 'Y':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.redo();
                }
                break;
            case '+':
            case '=':
                this.zoom(1.2);
                break;
            case '-':
                this.zoom(0.8);
                break;
        }
    }

    /**
     * Get component at world position
     */
    getComponentAtPosition(x, y) {
        const state = this.store.getState();
        const components = Array.from(state.components.values());

        // Check in reverse order (top-most first)
        for (let i = components.length - 1; i >= 0; i--) {
            if (components[i].containsPoint(x, y)) {
                return components[i];
            }
        }
        return null;
    }

    /**
     * Get zone at world position
     * Returns { type: 'keepout' | 'mounting', id: string, zone: object } or null
     */
    getZoneAtPosition(x, y) {
        const state = this.store.getState();

        // Check mounting zone first (higher priority)
        const mountingZone = state.constraints.mountingZone;
        if (mountingZone) {
            const b = mountingZone.bounds;
            if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
                return { type: 'mounting', id: 'mounting', zone: mountingZone };
            }
        }

        // Check keep-out zones
        for (const zone of state.constraints.keepOutZones) {
            if (!zone.isActive) continue;
            const b = zone.bounds;
            if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
                return { type: 'keepout', id: `keepout:${zone.id}`, zone };
            }
        }

        return null;
    }

    /**
     * Get all components within a bounding box
     */
    getComponentsInBox(box) {
        const state = this.store.getState();
        const components = Array.from(state.components.values());
        const selected = [];

        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);

        for (const comp of components) {
            const pos = comp.position;
            if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                selected.push(comp.id);
            }
        }

        return selected;
    }

    /**
     * Place a new component
     */
    placeComponent(type, position) {
        const component = Component.create(type, position);
        this.store.dispatch(actions.addComponent(component));
        this.setTool('select');
    }

    /**
     * Create beam connection between components
     * Validates physics constraints before creating the connection
     */
    createBeamConnection(source, target) {
        const state = this.store.getState();

        // Determine output port
        let sourcePort = 'output';
        if (source.type === ComponentType.MIRROR) {
            sourcePort = 'reflected';
        } else if (source.type === ComponentType.BEAM_SPLITTER) {
            // Check if reflected port is already used
            const existingSegments = state.beamPath.getOutgoingSegments(source.id);
            const usedPorts = existingSegments.map(s => s.sourcePort);
            sourcePort = usedPorts.includes('reflected') ? 'transmitted' : 'reflected';
        } else if (source.splitsBeam && source.splitsBeam()) {
            sourcePort = 'transmitted';
        }

        // === Physics Validation ===

        // Determine incoming beam angle for non-source components
        let incomingBeamAngle = null;
        if (source.type !== ComponentType.SOURCE) {
            const incomingSegments = state.beamPath.getIncomingSegments(source.id);
            if (incomingSegments.length > 0) {
                // Get the incoming beam direction
                const incomingSegment = incomingSegments[0];
                const prevComponent = state.components.get(incomingSegment.sourceId);
                if (prevComponent) {
                    incomingBeamAngle = BeamPhysics.calculateBeamAngle(
                        prevComponent.position,
                        source.position
                    );
                }
            }
        }

        // Build component map for validation
        const componentMap = state.components;

        // Validate the connection using physics
        const validation = BeamPhysics.validateConnection(
            source,
            target,
            sourcePort,
            incomingBeamAngle,
            componentMap
        );

        if (!validation.valid) {
            // Show error message to user
            this.showConnectionError(validation.error);
            console.warn(`Connection blocked: ${validation.error}`);
            return;
        }

        // Create the segment with physics data
        const segment = new BeamSegment({
            sourceId: source.id,
            targetId: target.id,
            sourcePort,
            targetPort: 'input',
            direction: validation.beamDirection,
            directionAngle: validation.beamAngle,
            isValid: true
        });

        // Check if source component has fixed output distance constraint
        if (source.pathConstraints?.enabled) {
            const constraintDistance = sourcePort === 'reflected'
                ? source.pathConstraints.reflectedDistance
                : source.pathConstraints.outputDistance;

            if (constraintDistance !== null) {
                segment.setFixedLength(true, constraintDistance);
            }
        }

        // Check if target component has fixed input distance constraint
        if (target.pathConstraints?.enabled && target.pathConstraints.inputDistance !== null) {
            segment.setFixedLength(true, target.pathConstraints.inputDistance);
        }

        this.store.dispatch(actions.addBeamSegment(segment));
        console.log(`Connected ${source.name} -> ${target.name} (angle: ${validation.beamAngle?.toFixed(1)}°)`);
    }

    /**
     * Show connection error message to user
     */
    showConnectionError(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'connection-error-toast';
        toast.innerHTML = `
            <span class="error-icon">⚠️</span>
            <span class="error-message">Invalid connection: ${message}</span>
        `;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #dc2626;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        // Remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Delete selected components or zones
     */
    deleteSelected() {
        const state = this.store.getState();

        // Delete selected components
        if (state.ui.selection.type === 'component') {
            state.ui.selection.selectedIds.forEach(id => {
                this.store.dispatch(actions.deleteComponent(id));
            });
        }

        // Delete selected zone
        if (state.ui.selection.type === 'zone') {
            const zoneId = state.ui.selection.selectedZoneId;
            if (zoneId === 'mounting') {
                this.store.dispatch(actions.deleteMountingZone());
            } else if (zoneId && zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                this.store.dispatch(actions.deleteKeepOutZone(id));
            }
        }
    }

    /**
     * Duplicate selected components
     */
    duplicateSelected() {
        const state = this.store.getState();
        state.ui.selection.selectedIds.forEach(id => {
            const component = state.components.get(id);
            if (component) {
                const clone = component.clone();
                clone.position = {
                    x: component.position.x + 30,
                    y: component.position.y + 30
                };
                this.store.dispatch(actions.addComponent(clone));
            }
        });
    }

    /**
     * Zoom by factor
     */
    zoom(factor) {
        const state = this.store.getState();
        const newZoom = Math.max(0.1, Math.min(5, state.ui.viewport.zoom * factor));
        this.store.dispatch(actions.setViewport({ zoom: newZoom }));

        // Update zoom display
        document.getElementById('zoom-level').textContent = Math.round(newZoom * 100) + '%';
        document.getElementById('zoom-percent').textContent = Math.round(newZoom * 100) + '%';
    }

    /**
     * Zoom to fit workspace
     */
    zoomFit() {
        const state = this.store.getState();
        const workspace = state.constraints.workspace;

        const canvasWidth = this.renderer.width;
        const canvasHeight = this.renderer.height;

        const zoomX = (canvasWidth - 100) / workspace.width;
        const zoomY = (canvasHeight - 100) / workspace.height;
        const zoom = Math.min(zoomX, zoomY, 2);

        this.store.dispatch(actions.setViewport({ zoom, panX: 0, panY: 0 }));

        document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
        document.getElementById('zoom-percent').textContent = Math.round(zoom * 100) + '%';
    }

    /**
     * Undo last action
     */
    undo() {
        this.store.undo();
    }

    /**
     * Redo last undone action
     */
    redo() {
        this.store.redo();
    }

    /**
     * Create new document
     */
    newDocument() {
        if (this.store.getState().document.isDirty) {
            if (!confirm('You have unsaved changes. Create new document anyway?')) {
                return;
            }
        }
        this.store.dispatch(actions.newDocument());
        this.zoomFit();
    }

    /**
     * Open document from JSON file
     */
    openDocument() {
        // Check for unsaved changes
        if (this.store.getState().document.isDirty) {
            if (!confirm('You have unsaved changes. Open a new file anyway?')) {
                return;
            }
        }

        const input = document.getElementById('file-input');
        input.click();
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const json = JSON.parse(text);

                // Validate format version
                if (!json.formatVersion) {
                    throw new Error('Invalid file format: missing formatVersion');
                }

                // Reconstruct components as a Map
                const components = new Map();
                if (json.components && Array.isArray(json.components)) {
                    json.components.forEach(compJson => {
                        const component = Component.fromJSON(compJson);
                        components.set(component.id, component);
                    });
                }

                // Reconstruct beam path
                const beamPath = json.beamPaths
                    ? BeamPath.fromJSON(json.beamPaths)
                    : new BeamPath();

                // Reconstruct constraints
                const constraints = {
                    workspace: json.workspace || { width: 600, height: 600 },
                    keepOutZones: json.constraints?.keepOutZones || [],
                    mountingZone: json.constraints?.mountingZone || null
                };

                // Build the new state
                const newState = {
                    components,
                    beamPath,
                    constraints,
                    document: {
                        name: json.document?.name || file.name.replace('.json', ''),
                        description: json.document?.description || '',
                        createdAt: json.document?.createdAt || new Date().toISOString(),
                        modifiedAt: json.document?.modifiedAt || new Date().toISOString(),
                        isDirty: false
                    },
                    ui: {
                        tool: 'select',
                        viewport: { zoom: 1, panX: 0, panY: 0 },
                        selection: {
                            type: null,
                            selectedIds: [],
                            selectedZoneId: null,
                            hoveredId: null,
                            hoveredZoneId: null
                        },
                        selectionBox: null
                    },
                    calculated: {
                        centerOfMass: null,
                        isCoMInMountingZone: false,
                        constraintViolations: [],
                        totalPathLength: 0
                    }
                };

                // Load the document
                this.store.dispatch(actions.loadDocument(newState));

                // Recalculate derived values
                this.store.dispatch(actions.recalculate());

                // Update workspace size inputs in UI
                document.getElementById('workspace-width').value = constraints.workspace.width;
                document.getElementById('workspace-height').value = constraints.workspace.height;

                // Reset view
                this.zoomFit();
                this.updateUI();
                this.render();

                console.log('Loaded document:', json.document?.name || file.name);
            } catch (err) {
                console.error('Failed to load file:', err);
                alert('Failed to load file: ' + err.message);
            }

            // Reset file input so same file can be selected again
            input.value = '';
        };
    }

    /**
     * Save document (placeholder)
     */
    saveDocument() {
        const state = this.store.getState();

        const document = {
            formatVersion: '1.0.0',
            document: state.document,
            workspace: state.constraints.workspace,
            components: Array.from(state.components.values()).map(c => c.toJSON()),
            beamPaths: state.beamPath.toJSON(),
            constraints: {
                keepOutZones: state.constraints.keepOutZones,
                mountingZone: state.constraints.mountingZone
            }
        };

        const json = JSON.stringify(document, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = window.document.createElement('a');
        a.href = url;
        a.download = (state.document.name || 'beam-path') + '.json';
        a.click();

        URL.revokeObjectURL(url);
        this.store.dispatch(actions.markClean());
    }

    /**
     * Update UI based on state
     */
    updateUI() {
        const state = this.store.getState();

        // Update status bar
        const com = state.calculated.centerOfMass;
        document.getElementById('com-position').textContent =
            com ? `(${com.x.toFixed(1)}, ${com.y.toFixed(1)})` : '(-, -)';

        const mountStatus = document.getElementById('mount-status');
        if (!state.constraints.mountingZone) {
            mountStatus.textContent = 'Not defined';
            mountStatus.className = 'status-value';
        } else if (state.calculated.isCoMInMountingZone) {
            mountStatus.textContent = 'OK';
            mountStatus.className = 'status-value ok';
        } else {
            mountStatus.textContent = 'OUTSIDE';
            mountStatus.className = 'status-value fail';
        }

        const violations = state.calculated.constraintViolations.length;
        const violationCount = document.getElementById('violation-count');
        violationCount.textContent = violations.toString();
        violationCount.className = violations > 0 ? 'status-value has-violations' : 'status-value';

        document.getElementById('component-count').textContent = state.components.size.toString();

        // Update property panel
        const selectedId = state.ui.selection.selectedIds[0];
        const selectedZoneId = state.ui.selection.selectedZoneId;
        const selectionType = state.ui.selection.type;

        const noSelection = document.getElementById('no-selection');
        const componentProps = document.getElementById('component-properties');
        const zoneProps = document.getElementById('zone-properties');

        // Hide all panels first
        noSelection.classList.add('hidden');
        componentProps.classList.add('hidden');
        zoneProps.classList.add('hidden');

        if (selectionType === 'component' && selectedId && state.components.has(selectedId)) {
            // Show component properties
            const component = state.components.get(selectedId);

            componentProps.classList.remove('hidden');

            document.getElementById('prop-name').value = component.name;
            document.getElementById('prop-type').textContent = ComponentNames[component.type] || component.type;
            document.getElementById('prop-x').value = component.position.x.toFixed(1);
            document.getElementById('prop-y').value = component.position.y.toFixed(1);
            document.getElementById('prop-angle').value = component.angle;
            document.getElementById('prop-angle-slider').value = component.angle;
            document.getElementById('prop-mass').value = component.mass;
            document.getElementById('prop-width').value = component.size.width;
            document.getElementById('prop-height').value = component.size.height;
            document.getElementById('prop-fixed').checked = component.isFixed;

            // Reflectance (only for relevant components)
            const opticalProps = document.getElementById('optical-properties');
            if (component.type === ComponentType.BEAM_SPLITTER) {
                opticalProps.classList.remove('hidden');
                document.getElementById('prop-reflectance-slider').value = component.reflectance * 100;
                document.getElementById('prop-reflectance-value').textContent = Math.round(component.reflectance * 100);
            } else {
                opticalProps.classList.add('hidden');
            }

            // Mount zone controls
            const mountEnabled = component.mountZone?.enabled || false;
            const mountPaddingX = component.mountZone?.paddingX ?? component.mountZone?.padding ?? 10;
            const mountPaddingY = component.mountZone?.paddingY ?? component.mountZone?.padding ?? 10;
            const mountOffsetX = component.mountZone?.offsetX ?? 0;
            const mountOffsetY = component.mountZone?.offsetY ?? 0;

            document.getElementById('prop-mount-enabled').checked = mountEnabled;
            document.getElementById('prop-mount-padding-x').value = mountPaddingX;
            document.getElementById('prop-mount-padding-y').value = mountPaddingY;
            document.getElementById('prop-mount-offset-x').value = mountOffsetX;
            document.getElementById('prop-mount-offset-y').value = mountOffsetY;

            const mountDetailsControls = document.getElementById('mount-details-controls');
            if (mountDetailsControls) {
                mountDetailsControls.style.display = mountEnabled ? 'flex' : 'none';
            }

            // === Beam Physics Controls ===

            // Source emission direction (only for sources)
            const sourceEmissionGroup = document.getElementById('source-emission-group');
            if (component.type === ComponentType.SOURCE) {
                sourceEmissionGroup.style.display = 'block';
                document.getElementById('prop-emission-angle').value = component.emissionAngle || 0;
            } else {
                sourceEmissionGroup.style.display = 'none';
            }

            // Shallow angle mode (only for beam splitters)
            const shallowAngleGroup = document.getElementById('shallow-angle-group');
            if (component.type === ComponentType.BEAM_SPLITTER) {
                shallowAngleGroup.style.display = 'block';
                document.getElementById('prop-shallow-enabled').checked = component.isShallowAngle || false;
                document.getElementById('prop-shallow-angle').value = component.shallowAngle || 5;
                document.getElementById('shallow-angle-controls').style.display =
                    component.isShallowAngle ? 'block' : 'none';
            } else {
                shallowAngleGroup.style.display = 'none';
            }

            // Grid snap toggle
            document.getElementById('prop-snap-grid').checked = component.snapToGrid !== false;

            // Allow any angle toggle
            document.getElementById('prop-allow-any-angle').checked = component.allowAnyAngle || false;

            // Path length constraints (for lenses and beam splitters)
            const pathConstraintGroup = document.getElementById('path-constraint-group');
            if (component.type === ComponentType.LENS || component.type === ComponentType.BEAM_SPLITTER) {
                pathConstraintGroup.style.display = 'block';

                const constraints = component.pathConstraints || {};
                const isEnabled = constraints.enabled || false;

                document.getElementById('prop-path-constraint-enabled').checked = isEnabled;
                document.getElementById('path-constraint-details').style.display = isEnabled ? 'block' : 'none';

                // Input distance
                const hasInputDist = constraints.inputDistance !== null && constraints.inputDistance !== undefined;
                document.getElementById('prop-fix-input-dist').checked = hasInputDist;
                document.getElementById('prop-input-distance').value = constraints.inputDistance || '';
                document.getElementById('prop-input-distance').disabled = !hasInputDist;

                // Output distance (for lenses only)
                const outputRow = document.getElementById('output-distance-row');
                if (component.type === ComponentType.LENS) {
                    outputRow.style.display = 'flex';
                    const hasOutputDist = constraints.outputDistance !== null && constraints.outputDistance !== undefined;
                    document.getElementById('prop-fix-output-dist').checked = hasOutputDist;
                    document.getElementById('prop-output-distance').value = constraints.outputDistance || '';
                    document.getElementById('prop-output-distance').disabled = !hasOutputDist;
                } else {
                    outputRow.style.display = 'none';
                }

                // Reflected distance (for beam splitters only)
                const reflectedRow = document.getElementById('reflected-distance-row');
                if (component.type === ComponentType.BEAM_SPLITTER) {
                    reflectedRow.style.display = 'flex';
                    const hasReflectedDist = constraints.reflectedDistance !== null && constraints.reflectedDistance !== undefined;
                    document.getElementById('prop-fix-reflected-dist').checked = hasReflectedDist;
                    document.getElementById('prop-reflected-distance').value = constraints.reflectedDistance || '';
                    document.getElementById('prop-reflected-distance').disabled = !hasReflectedDist;
                } else {
                    reflectedRow.style.display = 'none';
                }
            } else {
                pathConstraintGroup.style.display = 'none';
            }
        } else if (selectionType === 'zone' && selectedZoneId) {
            // Show zone properties
            let zone = null;
            let zoneType = '';

            if (selectedZoneId === 'mounting') {
                zone = state.constraints.mountingZone;
                zoneType = 'Mounting Zone';
            } else if (selectedZoneId.startsWith('keepout:')) {
                const id = selectedZoneId.replace('keepout:', '');
                zone = state.constraints.keepOutZones.find(z => z.id === id);
                zoneType = 'Keep-Out Zone';
            }

            if (zone) {
                zoneProps.classList.remove('hidden');

                document.getElementById('zone-prop-name').value = zone.name || '';
                document.getElementById('zone-prop-type').textContent = zoneType;
                document.getElementById('zone-prop-x').value = zone.bounds.x.toFixed(1);
                document.getElementById('zone-prop-y').value = zone.bounds.y.toFixed(1);
                document.getElementById('zone-prop-width').value = zone.bounds.width.toFixed(1);
                document.getElementById('zone-prop-height').value = zone.bounds.height.toFixed(1);

                // Active checkbox only for keep-out zones
                const activeGroup = document.getElementById('zone-active-group');
                if (selectedZoneId.startsWith('keepout:')) {
                    activeGroup.classList.remove('hidden');
                    document.getElementById('zone-prop-active').checked = zone.isActive;
                } else {
                    activeGroup.classList.add('hidden');
                }
            } else {
                noSelection.classList.remove('hidden');
            }
        } else {
            noSelection.classList.remove('hidden');
        }

        // Update undo/redo buttons
        document.getElementById('btn-undo').disabled = !this.store.canUndo();
        document.getElementById('btn-redo').disabled = !this.store.canRedo();
    }

    /**
     * Render the canvas
     */
    render() {
        this.renderer.render(this.store.getState());
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BeamPathOptimizerApp();
});

export default BeamPathOptimizerApp;
