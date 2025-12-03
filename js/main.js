/**
 * Beam Path Optimizer - Main Application Entry Point
 */

import { Component, ComponentType, ComponentNames } from './models/Component.js';
import { BeamSegment, BeamPath } from './models/BeamPath.js';
import { Store, actions, createInitialState, APP_VERSION, needsMigration } from './state.js';
import { Renderer } from './render/Renderer.js';
import { ResultsGraph } from './render/ResultsGraph.js';
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

        // Results View state
        this.resultsGraph = null;
        this.isResultsViewOpen = false;
        this.previewSnapshot = null;
        this.isSplitScreenMode = false;

        // Drag from palette state
        this.isDraggingFromPalette = false;
        this.dragComponentType = null;
        this.dragPreviewElement = null;
        this.paletteMouseStart = null;

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

        // Set version display
        const versionEl = document.getElementById('app-version');
        if (versionEl) {
            versionEl.textContent = APP_VERSION.toString();
        }

        console.log('Beam Path Optimizer initialized', APP_VERSION.toString());
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

        // Component buttons (drag-and-drop from palette)
        document.querySelectorAll('.component-btn[data-component]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.paletteMouseStart = { x: e.clientX, y: e.clientY };
                this.dragComponentType = btn.dataset.component;
            });
        });

        // Document-level mouse handlers for palette drag
        document.addEventListener('mousemove', (e) => this.handlePaletteDrag(e));
        document.addEventListener('mouseup', (e) => this.handlePaletteDrop(e));

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

        // Grid controls
        this.setupGridControls();

        // Panel resize handle
        this.setupPanelResize();

        // Panel text size control
        this.setupPanelTextSize();

        // Settings modal
        this.setupSettingsModal();

        // Wavelength controls
        this.setupWavelengthControls();

        // Property panel inputs
        this.setupPropertyInputs();

        // Delete button
        document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-duplicate')?.addEventListener('click', () => this.duplicateSelected());

        // Zone property inputs
        this.setupZonePropertyInputs();

        // Segment property inputs
        this.setupSegmentPropertyInputs();

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
            'prop-fixed': 'isFixed',
            'prop-angle-fixed': 'isAngleFixed'
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

                // Clamp angle to 0-180° range
                if (propPath === 'angle') {
                    value = Math.max(0, Math.min(180, value));
                }

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
     * Set up grid controls
     */
    setupGridControls() {
        const btnGridSettings = document.getElementById('btn-grid-settings');
        const gridModal = document.getElementById('grid-modal');
        const closeModal = document.getElementById('close-grid-modal');

        // Open modal
        btnGridSettings?.addEventListener('click', () => {
            this.syncGridModalFromState();
            gridModal?.classList.remove('hidden');
        });

        // Close modal
        closeModal?.addEventListener('click', () => {
            gridModal?.classList.add('hidden');
        });

        // Close on backdrop click
        gridModal?.addEventListener('click', (e) => {
            if (e.target === gridModal) {
                gridModal.classList.add('hidden');
            }
        });

        // Grid visible toggle
        const gridVisibleCheckbox = document.getElementById('grid-visible-modal');
        gridVisibleCheckbox?.addEventListener('change', (e) => {
            this.store.dispatch(actions.setGridSettings({ visible: e.target.checked }));
        });

        // Grid enabled toggle
        const gridEnabledCheckbox = document.getElementById('grid-enabled-modal');
        gridEnabledCheckbox?.addEventListener('change', (e) => {
            this.store.dispatch(actions.setGridSettings({ enabled: e.target.checked }));
        });

        // Grid size slider
        const gridSizeSlider = document.getElementById('grid-size-slider-modal');
        const gridSizeInput = document.getElementById('grid-size-input-modal');
        const gridSizeValue = document.getElementById('grid-size-value-modal');

        gridSizeSlider?.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10);
            if (gridSizeInput) gridSizeInput.value = size;
            if (gridSizeValue) gridSizeValue.textContent = size;
            this.store.dispatch(actions.setGridSettings({ size }));
        });

        // Grid size input
        gridSizeInput?.addEventListener('change', (e) => {
            let size = parseInt(e.target.value, 10);
            size = Math.max(1, Math.min(50, size)); // Clamp to 1-50
            e.target.value = size;
            if (gridSizeSlider) gridSizeSlider.value = size;
            if (gridSizeValue) gridSizeValue.textContent = size;
            this.store.dispatch(actions.setGridSettings({ size }));
        });
    }

    syncGridModalFromState() {
        const grid = this.store.getState().grid;
        const gridVisibleCheckbox = document.getElementById('grid-visible-modal');
        const gridEnabledCheckbox = document.getElementById('grid-enabled-modal');
        const gridSizeSlider = document.getElementById('grid-size-slider-modal');
        const gridSizeInput = document.getElementById('grid-size-input-modal');
        const gridSizeValue = document.getElementById('grid-size-value-modal');

        if (gridVisibleCheckbox) gridVisibleCheckbox.checked = grid.visible;
        if (gridEnabledCheckbox) gridEnabledCheckbox.checked = grid.enabled;
        if (gridSizeSlider) gridSizeSlider.value = grid.size;
        if (gridSizeInput) gridSizeInput.value = grid.size;
        if (gridSizeValue) gridSizeValue.textContent = grid.size;
    }

    /**
     * Set up panel resize handle
     */
    setupPanelResize() {
        const handle = document.getElementById('panel-resize-handle');
        const panel = document.getElementById('properties-panel');
        if (!handle || !panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        // Load saved width from localStorage
        const savedWidth = localStorage.getItem('panelWidth');
        if (savedWidth) {
            const width = parseInt(savedWidth, 10);
            if (width >= 180 && width <= 400) {
                panel.style.width = `${width}px`;
            }
        }

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('resizing');
            document.body.classList.add('resizing-panel');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            // Calculate new width (inverted because we're resizing from left edge of panel)
            const deltaX = startX - e.clientX;
            let newWidth = startWidth + deltaX;

            // Clamp to min/max
            newWidth = Math.max(180, Math.min(400, newWidth));

            panel.style.width = `${newWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('resizing');
                document.body.classList.remove('resizing-panel');

                // Save to localStorage
                localStorage.setItem('panelWidth', panel.offsetWidth);

                // Re-render canvas to adjust for new size
                this.renderer.handleResize();
                this.render();
            }
        });
    }

    /**
     * Set up panel text size control
     */
    setupPanelTextSize() {
        const slider = document.getElementById('panel-text-size');
        const valueDisplay = document.getElementById('panel-text-size-value');
        if (!slider) return;

        // Load saved value from localStorage
        const savedSize = localStorage.getItem('panelTextSize');
        if (savedSize) {
            const size = parseInt(savedSize, 10);
            if (size >= 80 && size <= 150) {
                slider.value = size;
                if (valueDisplay) valueDisplay.textContent = size;
                document.documentElement.style.setProperty('--panel-text-scale', size / 100);
            }
        }

        slider.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10);
            if (valueDisplay) valueDisplay.textContent = size;
            document.documentElement.style.setProperty('--panel-text-scale', size / 100);
            localStorage.setItem('panelTextSize', size);
        });
    }

    /**
     * Set up settings modal
     */
    setupSettingsModal() {
        const modal = document.getElementById('settings-modal');
        const btnSettings = document.getElementById('btn-settings');
        const btnClose = document.getElementById('close-settings');
        const bgTypeRadios = document.querySelectorAll('input[name="bg-type"]');
        const bgColorInput = document.getElementById('bg-color');
        const bgColorValue = document.getElementById('bg-color-value');
        const bgImageInput = document.getElementById('bg-image');
        const btnChooseImage = document.getElementById('btn-choose-image');
        const bgImageName = document.getElementById('bg-image-name');
        const btnClearImage = document.getElementById('btn-clear-image');

        // Open modal
        btnSettings?.addEventListener('click', () => {
            // Sync UI with current state
            const state = this.store.getState();
            const bg = state.background || {};

            // Set radio button
            bgTypeRadios.forEach(radio => {
                radio.checked = radio.value === (bg.type || 'color');
            });

            // Set color
            if (bgColorInput && bg.color) {
                bgColorInput.value = bg.color;
                if (bgColorValue) bgColorValue.textContent = bg.color;
            }

            // Set image name
            if (bgImageName) {
                bgImageName.textContent = bg.imagePath || 'No image selected';
            }

            // Show/hide clear button
            if (btnClearImage) {
                btnClearImage.classList.toggle('hidden', !bg.imagePath);
            }

            modal?.classList.remove('hidden');
        });

        // Close modal
        btnClose?.addEventListener('click', () => {
            modal?.classList.add('hidden');
        });

        // Close on backdrop click
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });

        // Background type change
        bgTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.store.dispatch(actions.setBackground({ type: e.target.value }));
            });
        });

        // Background color change
        bgColorInput?.addEventListener('input', (e) => {
            const color = e.target.value;
            if (bgColorValue) bgColorValue.textContent = color;
            this.store.dispatch(actions.setBackground({ color }));
        });

        // Choose image button
        btnChooseImage?.addEventListener('click', () => {
            bgImageInput?.click();
        });

        // Image file selected
        bgImageInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.store.dispatch(actions.setBackground({
                        type: 'image',
                        imagePath: file.name,
                        imageData: img
                    }));

                    // Update UI
                    if (bgImageName) bgImageName.textContent = file.name;
                    if (btnClearImage) btnClearImage.classList.remove('hidden');

                    // Set radio to image
                    bgTypeRadios.forEach(radio => {
                        radio.checked = radio.value === 'image';
                    });
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Clear image
        btnClearImage?.addEventListener('click', () => {
            this.store.dispatch(actions.setBackground({
                type: 'color',
                imagePath: null,
                imageData: null
            }));

            // Update UI
            if (bgImageName) bgImageName.textContent = 'No image selected';
            btnClearImage?.classList.add('hidden');
            if (bgImageInput) bgImageInput.value = '';

            // Set radio to color
            bgTypeRadios.forEach(radio => {
                radio.checked = radio.value === 'color';
            });
        });

        // Reset background to default
        const btnResetBackground = document.getElementById('btn-reset-background');
        btnResetBackground?.addEventListener('click', () => {
            this.store.dispatch(actions.setBackground({
                type: 'color',
                color: '#0d1117',
                imagePath: null,
                imageData: null
            }));

            // Sync UI
            if (bgColorInput) bgColorInput.value = '#0d1117';
            if (bgColorValue) bgColorValue.textContent = '#0d1117';
            bgTypeRadios.forEach(radio => {
                radio.checked = radio.value === 'color';
            });
            if (bgImageName) bgImageName.textContent = 'No image selected';
            if (btnClearImage) btnClearImage.classList.add('hidden');
            if (bgImageInput) bgImageInput.value = '';

            this.showToast('Background reset to default', 'success');
        });

        // Opacity slider
        const bgOpacitySlider = document.getElementById('bg-opacity');
        const bgOpacityValue = document.getElementById('bg-opacity-value');
        bgOpacitySlider?.addEventListener('input', (e) => {
            const opacity = parseInt(e.target.value, 10);
            if (bgOpacityValue) bgOpacityValue.textContent = opacity;

            const state = this.store.getState();
            this.store.dispatch(actions.setBackground({
                ...state.background,
                opacity
            }));
        });

        // Sync opacity from state when modal opens
        this.store.subscribe(() => {
            const bg = this.store.getState().background;
            if (bgOpacitySlider && bg.opacity !== undefined) {
                bgOpacitySlider.value = bg.opacity;
            }
            if (bgOpacityValue && bg.opacity !== undefined) {
                bgOpacityValue.textContent = bg.opacity;
            }
        });
    }

    /**
     * Set up wavelength controls
     */
    setupWavelengthControls() {
        const wavelengthSelect = document.getElementById('active-wavelength');
        const btnManage = document.getElementById('btn-manage-wavelengths');

        // Initial population
        this.updateWavelengthDropdown();

        // Wavelength selection change
        wavelengthSelect?.addEventListener('change', (e) => {
            this.store.dispatch(actions.setActiveWavelength(e.target.value));
        });

        // Manage wavelengths button - opens modal
        btnManage?.addEventListener('click', () => {
            this.openWavelengthModal();
        });

        // Subscribe to state changes to update dropdown
        this.store.subscribe(() => {
            this.updateWavelengthDropdown();
        });
    }

    /**
     * Open wavelength management modal
     */
    openWavelengthModal() {
        const modal = document.getElementById('wavelength-modal');
        modal?.classList.remove('hidden');
        this.renderWavelengthList();

        // Close modal handlers
        document.getElementById('close-wavelength-modal')?.addEventListener('click', () => {
            modal?.classList.add('hidden');
        });

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        // Add new wavelength
        document.getElementById('btn-add-wavelength')?.addEventListener('click', () => {
            this.addNewWavelength();
        });
    }

    /**
     * Render wavelength list in modal
     */
    renderWavelengthList() {
        const list = document.getElementById('wavelength-list');
        if (!list) return;

        const wavelengths = this.store.getState().wavelengths || [];

        list.innerHTML = wavelengths.map(w => `
            <div class="wavelength-item" data-id="${w.id}">
                <div class="swatch" style="background-color: ${w.color}"></div>
                <input type="text" class="name" value="${w.name}" readonly data-id="${w.id}">
                <input type="color" class="color-picker hidden" value="${w.color}" data-id="${w.id}">
                <div class="actions">
                    <button class="edit-btn" data-id="${w.id}">Edit</button>
                    <button class="save-btn hidden" data-id="${w.id}">Save</button>
                    <button class="cancel-btn hidden" data-id="${w.id}">Cancel</button>
                    <button class="delete-btn delete" data-id="${w.id}" ${w.isPreset ? 'disabled' : ''}>Delete</button>
                </div>
            </div>
        `).join('');

        this.attachWavelengthItemHandlers();
    }

    /**
     * Attach event handlers to wavelength items
     */
    attachWavelengthItemHandlers() {
        // Edit buttons
        document.querySelectorAll('.wavelength-item .edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editWavelength(btn.dataset.id));
        });

        // Save buttons
        document.querySelectorAll('.wavelength-item .save-btn').forEach(btn => {
            btn.addEventListener('click', () => this.saveWavelength(btn.dataset.id));
        });

        // Cancel buttons
        document.querySelectorAll('.wavelength-item .cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => this.cancelEditWavelength());
        });

        // Delete buttons
        document.querySelectorAll('.wavelength-item .delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteWavelength(btn.dataset.id));
        });
    }

    /**
     * Add new wavelength
     */
    addNewWavelength() {
        const nameInput = document.getElementById('new-wavelength-name');
        const colorInput = document.getElementById('new-wavelength-color');

        const name = nameInput?.value.trim();
        const color = colorInput?.value;

        if (!name) {
            this.showToast('Wavelength name required', 'warning');
            return;
        }

        this.store.dispatch(actions.addWavelength(name, color));
        this.renderWavelengthList();

        // Clear inputs
        if (nameInput) nameInput.value = '';
        if (colorInput) colorInput.value = '#ff0000';

        this.showToast(`Added wavelength: ${name}`, 'success');
    }

    /**
     * Edit wavelength - enable editing mode
     */
    editWavelength(id) {
        const item = document.querySelector(`.wavelength-item[data-id="${id}"]`);
        if (!item) return;

        const nameInput = item.querySelector('.name');
        const colorPicker = item.querySelector('.color-picker');
        const editBtn = item.querySelector('.edit-btn');
        const saveBtn = item.querySelector('.save-btn');
        const cancelBtn = item.querySelector('.cancel-btn');

        // Enable editing
        nameInput?.removeAttribute('readonly');
        colorPicker?.classList.remove('hidden');
        editBtn?.classList.add('hidden');
        saveBtn?.classList.remove('hidden');
        cancelBtn?.classList.remove('hidden');
    }

    /**
     * Save wavelength changes
     */
    saveWavelength(id) {
        const item = document.querySelector(`.wavelength-item[data-id="${id}"]`);
        if (!item) return;

        const nameInput = item.querySelector('.name');
        const colorPicker = item.querySelector('.color-picker');

        const name = nameInput?.value.trim();
        const color = colorPicker?.value;

        if (!name) {
            this.showToast('Wavelength name required', 'warning');
            return;
        }

        this.store.dispatch(actions.updateWavelength(id, { name, color }));
        this.renderWavelengthList();
        this.showToast('Wavelength updated', 'success');
    }

    /**
     * Cancel wavelength editing
     */
    cancelEditWavelength() {
        this.renderWavelengthList(); // Re-render to reset
    }

    /**
     * Delete wavelength
     */
    deleteWavelength(id) {
        const wavelengths = this.store.getState().wavelengths || [];
        const wavelength = wavelengths.find(w => w.id === id);

        if (wavelength?.isPreset) {
            this.showToast('Cannot delete preset wavelengths', 'warning');
            return;
        }

        if (confirm(`Delete wavelength "${wavelength?.name}"?`)) {
            this.store.dispatch(actions.deleteWavelength(id));
            this.renderWavelengthList();
            this.showToast('Wavelength deleted', 'success');
        }
    }

    /**
     * Update wavelength dropdown from state
     */
    updateWavelengthDropdown() {
        const select = document.getElementById('active-wavelength');
        if (!select) return;

        const state = this.store.getState();
        const wavelengths = state.wavelengths || [];
        const activeId = state.activeWavelengthId;

        // Clear and repopulate
        select.innerHTML = '';
        wavelengths.forEach(w => {
            const option = document.createElement('option');
            option.value = w.id;
            option.textContent = w.name;
            option.style.color = w.color;
            if (w.id === activeId) option.selected = true;
            select.appendChild(option);
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
     * Set up segment property input bindings
     */
    setupSegmentPropertyInputs() {
        // Add wavelength to segment
        document.getElementById('btn-add-segment-wavelength')?.addEventListener('click', () => {
            const state = this.store.getState();
            const selectedSegmentIds = state.ui.selection.selectedSegmentIds || [];
            if (selectedSegmentIds.length === 0) return;

            const selectEl = document.getElementById('segment-wavelength-select');
            const wavelengthId = selectEl?.value;
            if (!wavelengthId) return;

            // Add wavelength to all selected segments
            selectedSegmentIds.forEach(segmentId => {
                const segment = state.beamPath.segments.get(segmentId);
                if (segment) {
                    const currentWavelengthIds = segment.wavelengthIds || [];
                    if (!currentWavelengthIds.includes(wavelengthId)) {
                        const newWavelengthIds = [...currentWavelengthIds, wavelengthId];
                        this.store.dispatch(actions.updateSegmentWavelengths(segmentId, newWavelengthIds));
                    }
                }
            });

            // Reset dropdown
            selectEl.value = '';
        });

        // Delete segment button
        document.getElementById('btn-delete-segment')?.addEventListener('click', () => {
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

        // View Results button
        document.getElementById('btn-view-results')?.addEventListener('click', () => {
            this.openResultsView();
        });

        // Set up results view controls
        this.setupResultsViewControls();

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
     * Set up results view controls
     */
    setupResultsViewControls() {
        // Preview Selected button
        document.getElementById('btn-preview-selected')?.addEventListener('click', () => {
            this.previewSelectedSnapshot();
        });

        // Apply This Layout button
        document.getElementById('btn-apply-selected')?.addEventListener('click', () => {
            this.applySelectedSnapshot();
        });

        // Close Results View button
        document.getElementById('btn-close-results')?.addEventListener('click', () => {
            this.closeResultsView();
        });

        // Split-screen checkbox
        document.getElementById('results-split-screen')?.addEventListener('change', (e) => {
            this.isSplitScreenMode = e.target.checked;
            this.render();
        });
    }

    /**
     * Open the results view panel
     */
    openResultsView() {
        const snapshots = this.optimizer.getSnapshots();
        if (snapshots.length === 0) {
            alert('No optimization data available.');
            return;
        }

        // Show results section
        document.getElementById('results-section')?.classList.remove('hidden');
        this.isResultsViewOpen = true;

        // Initialize results graph if not already done
        const graphCanvas = document.getElementById('results-graph');
        if (graphCanvas && !this.resultsGraph) {
            this.resultsGraph = new ResultsGraph(graphCanvas);

            // Set up graph callbacks
            this.resultsGraph.onHover = (snapshot, index) => {
                this.updateResultsTooltip(snapshot);
            };

            this.resultsGraph.onClick = (snapshot, index) => {
                this.selectResultsSnapshot(snapshot, index);
            };

            this.resultsGraph.onDoubleClick = (snapshot, index) => {
                this.previewSnapshot = snapshot;
                this.render();
            };
        }

        // Load data into graph
        if (this.resultsGraph) {
            this.resultsGraph.setData(snapshots);
        }

        // Reset preview state
        this.previewSnapshot = null;
        this.isSplitScreenMode = false;
        document.getElementById('results-split-screen').checked = false;
    }

    /**
     * Close the results view panel
     */
    closeResultsView() {
        document.getElementById('results-section')?.classList.add('hidden');
        this.isResultsViewOpen = false;
        this.previewSnapshot = null;
        this.isSplitScreenMode = false;
        this.render();
    }

    /**
     * Update the tooltip when hovering over graph
     */
    updateResultsTooltip(snapshot) {
        const tooltipEl = document.getElementById('results-tooltip');
        if (!tooltipEl) return;

        if (snapshot) {
            tooltipEl.textContent = `Iteration ${snapshot.iteration}, Cost: ${snapshot.cost.toFixed(1)}`;
            tooltipEl.classList.add('active');
        } else {
            tooltipEl.textContent = 'Hover over graph to see iteration details';
            tooltipEl.classList.remove('active');
        }
    }

    /**
     * Select a snapshot from the results graph
     */
    selectResultsSnapshot(snapshot, index) {
        const selectedInfoEl = document.getElementById('selected-iteration-info');
        const previewBtn = document.getElementById('btn-preview-selected');
        const applyBtn = document.getElementById('btn-apply-selected');

        if (snapshot) {
            selectedInfoEl.textContent = `Iteration ${snapshot.iteration} (Cost: ${snapshot.cost.toFixed(1)})`;
            previewBtn.disabled = false;
            applyBtn.disabled = false;
        } else {
            selectedInfoEl.textContent = 'None';
            previewBtn.disabled = true;
            applyBtn.disabled = true;
        }
    }

    /**
     * Preview the selected snapshot
     */
    previewSelectedSnapshot() {
        if (!this.resultsGraph) return;

        const snapshot = this.resultsGraph.getSelectedSnapshot();
        if (snapshot) {
            this.previewSnapshot = snapshot;
            this.render();
        }
    }

    /**
     * Apply the selected snapshot to the actual state
     */
    applySelectedSnapshot() {
        if (!this.resultsGraph) return;

        const snapshot = this.resultsGraph.getSelectedSnapshot();
        if (!snapshot) return;

        // Apply the snapshot positions and angles
        this.optimizer.applySnapshot(snapshot, this.store.getState().components);

        // Recalculate and render
        this.store.dispatch(actions.markDirty());
        this.previewSnapshot = null;
        this.render();

        // Close results view
        this.closeResultsView();
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

        // Store original positions and angles for revert
        this.originalPositionsBeforeOptimize = new Map();
        this.originalAnglesBeforeOptimize = new Map();
        state.components.forEach((comp, id) => {
            this.originalPositionsBeforeOptimize.set(id, { ...comp.position });
            this.originalAnglesBeforeOptimize.set(id, comp.angle);
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

        // Apply best angles found
        const bestAngles = this.optimizer.getBestAngles();
        bestAngles.forEach((angle, id) => {
            const comp = this.store.getState().components.get(id);
            if (comp) {
                comp.angle = angle;
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
        // Positions and angles are already applied, just reset UI
        this.originalPositionsBeforeOptimize = null;
        this.originalAnglesBeforeOptimize = null;
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

        // Revert angles
        if (this.originalAnglesBeforeOptimize) {
            this.originalAnglesBeforeOptimize.forEach((angle, id) => {
                const comp = this.store.getState().components.get(id);
                if (comp) {
                    comp.angle = angle;
                }
            });
            this.originalAnglesBeforeOptimize = null;
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

        // Clear selection so optimizer buttons remain visible in the panel
        this.store.dispatch(actions.clearSelection());

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
                const wasAlreadySelected = state.ui.selection.selectedIds.includes(clickedComponent.id);

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
                } else if (!wasAlreadySelected) {
                    // Regular click on unselected component - select just this one
                    this.store.dispatch(actions.selectComponent(clickedComponent.id));
                }
                // If component was already selected (and no Ctrl), keep the current selection
                // This allows dragging multiple selected components together
                // Start dragging
                this.isDragging = true;
                this.dragStart = worldPos;
                this.dragComponent = clickedComponent;
                // Store original positions for beam constraint validation
                // IMPORTANT: We must determine which components will ACTUALLY be dragged,
                // not use stale state.ui.selection (which hasn't updated yet from the dispatch above)
                this.dragOriginalPositions = new Map();

                // Always include the clicked component
                this.dragOriginalPositions.set(clickedComponent.id, { ...clickedComponent.position });

                // For multi-select drag: if Ctrl was held OR if the clicked component was already selected,
                // include other previously selected components
                if ((e.ctrlKey || e.metaKey) || wasAlreadySelected) {
                    state.ui.selection.selectedIds.forEach(id => {
                        if (id !== clickedComponent.id) {
                            const comp = state.components.get(id);
                            if (comp) {
                                this.dragOriginalPositions.set(id, { ...comp.position });
                            }
                        }
                    });
                }
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
            // Beam connection mode - can select segments or create new connections
            // IMPORTANT: Prioritize component clicks over segment clicks
            // (segments end at components, so clicking a component would otherwise select the segment)

            if (clickedComponent && clickedComponent.canOutputBeam()) {
                // Start creating new connection from this component
                this.connectingFrom = clickedComponent;
                console.log('Connecting from:', clickedComponent.name);
            } else if (clickedComponent && clickedComponent.canReceiveBeam()) {
                // Clicked on a component that can only receive (like detector with no outgoing)
                // Check for segment selection instead
                const clickedSegment = this.getSegmentAtPosition(worldPos.x, worldPos.y);
                if (clickedSegment) {
                    if (e.ctrlKey || e.metaKey) {
                        const currentSelected = [...(state.ui.selection.selectedSegmentIds || [])];
                        const idx = currentSelected.indexOf(clickedSegment.id);
                        if (idx > -1) {
                            currentSelected.splice(idx, 1);
                        } else {
                            currentSelected.push(clickedSegment.id);
                        }
                        this.store.dispatch(actions.selectMultipleSegments(currentSelected));
                    } else {
                        this.store.dispatch(actions.selectSegment(clickedSegment.id));
                    }
                }
            } else {
                // No component clicked - check for segment selection
                const clickedSegment = this.getSegmentAtPosition(worldPos.x, worldPos.y);
                if (clickedSegment) {
                    // Ctrl+click for multi-select segments
                    if (e.ctrlKey || e.metaKey) {
                        const currentSelected = [...(state.ui.selection.selectedSegmentIds || [])];
                        const idx = currentSelected.indexOf(clickedSegment.id);
                        if (idx > -1) {
                            currentSelected.splice(idx, 1);
                        } else {
                            currentSelected.push(clickedSegment.id);
                        }
                        this.store.dispatch(actions.selectMultipleSegments(currentSelected));
                    } else {
                        // Regular click - select single segment
                        this.store.dispatch(actions.selectSegment(clickedSegment.id));
                    }
                } else {
                    // Clicked on empty area in connect mode - start selection box for segments
                    this.store.dispatch(actions.clearSelection());
                    this.isSelectionBoxDragging = true;
                    this.selectionBoxStart = worldPos;
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
                if (selectedIds.length > 1 && selectedIds.includes(this.dragComponent.id) && this.dragOriginalPositions) {
                    // Calculate total delta from ORIGINAL drag start position
                    const dx = worldPos.x - this.dragStart.x;
                    const dy = worldPos.y - this.dragStart.y;

                    // Use original positions to calculate new positions
                    // This avoids issues with stale state during multiple dispatches
                    this.dragOriginalPositions.forEach((origPos, id) => {
                        const comp = state.components.get(id);
                        if (comp && !comp.isFixed) {
                            let newPos = {
                                x: origPos.x + dx,
                                y: origPos.y + dy
                            };
                            // Apply grid snapping if enabled globally and for this component
                            const gridEnabled = state.grid?.enabled !== false;
                            if (gridEnabled && comp.snapToGrid !== false) {
                                newPos = BeamPhysics.snapToGrid(newPos, state.grid?.size || 25);
                            }
                            this.store.dispatch(actions.moveComponent(id, newPos));
                        }
                    });
                    // NOTE: Don't update dragStart - we use original positions and total delta
                } else {
                    // Single component drag - position follows mouse directly
                    let newPos = { x: worldPos.x, y: worldPos.y };
                    const gridEnabled = state.grid?.enabled !== false;
                    if (gridEnabled && this.dragComponent.snapToGrid !== false) {
                        newPos = BeamPhysics.snapToGrid(newPos, state.grid?.size || 25);
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
            // Hover detection for components, zones, and segments
            const hovered = this.getComponentAtPosition(worldPos.x, worldPos.y);
            const hoveredZone = !hovered ? this.getZoneAtPosition(worldPos.x, worldPos.y) : null;
            // Only check for segment hover in connect mode
            const hoveredSegment = (state.ui.tool === 'connect' && !hovered && !hoveredZone)
                ? this.getSegmentAtPosition(worldPos.x, worldPos.y)
                : null;

            const currentHovered = state.ui.selection.hoveredId;
            const currentHoveredZone = state.ui.selection.hoveredZoneId;
            const currentHoveredSegment = state.ui.selection.hoveredSegmentId;

            if (hovered?.id !== currentHovered ||
                hoveredZone?.id !== currentHoveredZone ||
                hoveredSegment?.id !== currentHoveredSegment) {
                // Update hover state (without adding to history)
                const newState = {
                    ...state,
                    ui: {
                        ...state.ui,
                        selection: {
                            ...state.ui.selection,
                            hoveredId: hovered?.id || null,
                            hoveredZoneId: hoveredZone?.id || null,
                            hoveredSegmentId: hoveredSegment?.id || null
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
            // Validate beam constraints before finalizing drag
            if (this.dragOriginalPositions && this.dragOriginalPositions.size > 0) {
                const validation = this.validateMovementForBeamConstraints(this.dragOriginalPositions);
                if (!validation.valid) {
                    // Snap back to original positions
                    this.dragOriginalPositions.forEach((origPos, id) => {
                        const comp = state.components.get(id);
                        if (comp) {
                            comp.position = { ...origPos };
                        }
                    });
                    this.store.dispatch(actions.recalculate());
                    this.render();
                    // Show warning
                    this.showMovementWarning(validation.error);
                }
            }
            this.isDragging = false;
            this.dragComponent = null;
            this.dragZone = null;
            this.dragZoneOffset = null;
            this.dragOriginalPositions = null;
        }

        // Handle selection box completion
        if (this.isSelectionBoxDragging) {
            const box = state.ui.selectionBox;
            if (box) {
                // Calculate box size to distinguish between click and drag
                const boxWidth = Math.abs(box.endX - box.startX);
                const boxHeight = Math.abs(box.endY - box.startY);
                const isClick = boxWidth < 5 && boxHeight < 5; // Less than 5mm = click, not drag

                // Only select components if user actually dragged (not just clicked)
                if (!isClick) {
                    // In connect mode, select segments; otherwise select components
                    if (state.ui.tool === 'connect') {
                        const selectedSegmentIds = this.getSegmentsInBox(box);
                        if (selectedSegmentIds.length > 0) {
                            this.store.dispatch(actions.selectMultipleSegments(selectedSegmentIds));
                        }
                    } else {
                        const selectedIds = this.getComponentsInBox(box);
                        if (selectedIds.length > 0) {
                            this.store.dispatch(actions.selectMultiple(selectedIds));
                        }
                    }
                }
                // If it was just a click (isClick = true), selection was already cleared in mouseDown
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
                // Exit preview mode if active
                if (this.previewSnapshot) {
                    this.previewSnapshot = null;
                    this.render();
                    break;
                }
                // Close results view if open
                if (this.isResultsViewOpen) {
                    this.closeResultsView();
                    break;
                }
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
            case 'r':
            case 'R':
                this.rotateSelectedComponents();
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
     * Calculate distance from a point to a line segment
     * @returns {number} Distance in world units
     */
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Get beam segment at world position (within threshold)
     * @returns {BeamSegment | null}
     */
    getSegmentAtPosition(x, y, threshold = 8) {
        const state = this.store.getState();
        const segments = state.beamPath.getAllSegments();
        const components = state.components;
        const zoom = state.ui.viewport.zoom;

        // Adjust threshold based on zoom
        const adjustedThreshold = threshold / zoom;

        let closestSegment = null;
        let closestDistance = Infinity;

        for (const segment of segments) {
            const source = components.get(segment.sourceId);
            const target = components.get(segment.targetId);
            if (!source || !target) continue;

            const dist = this.pointToSegmentDistance(
                x, y,
                source.position.x, source.position.y,
                target.position.x, target.position.y
            );

            if (dist < adjustedThreshold && dist < closestDistance) {
                closestDistance = dist;
                closestSegment = segment;
            }
        }

        return closestSegment;
    }

    /**
     * Get all beam segments within a bounding box
     * @returns {string[]} Array of segment IDs
     */
    getSegmentsInBox(box) {
        const state = this.store.getState();
        const segments = state.beamPath.getAllSegments();
        const components = state.components;
        const selected = [];

        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);

        for (const segment of segments) {
            const source = components.get(segment.sourceId);
            const target = components.get(segment.targetId);
            if (!source || !target) continue;

            // Check if segment midpoint is in box (simple check)
            const midX = (source.position.x + target.position.x) / 2;
            const midY = (source.position.y + target.position.y) / 2;

            if (midX >= minX && midX <= maxX && midY >= minY && midY <= maxY) {
                selected.push(segment.id);
            }
        }

        return selected;
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
     * Validate if component movement maintains valid beam constraints
     * @param {Map} originalPositions - Map of component IDs to their original positions
     * @returns {{ valid: boolean, error: string | null }}
     */
    validateMovementForBeamConstraints(originalPositions) {
        const state = this.store.getState();
        const beamPath = state.beamPath;
        const components = state.components;

        // For each moved component, check if any connected beams are now invalid
        for (const [compId, origPos] of originalPositions) {
            const comp = components.get(compId);
            if (!comp) continue;

            // Check incoming beam segments
            const incomingSegments = beamPath.getIncomingSegments(compId);
            for (const segment of incomingSegments) {
                const sourceComp = components.get(segment.sourceId);
                if (!sourceComp) continue;

                // Calculate new beam angle from source to target
                const newAngle = BeamPhysics.calculateBeamAngle(sourceComp.position, comp.position);
                if (newAngle === null) continue;

                // Get expected output angle from source
                let incomingAngleToSource = null;
                if (sourceComp.type === 'source') {
                    incomingAngleToSource = sourceComp.emissionAngle || 0;
                } else {
                    // Get from upstream segment
                    const sourceIncoming = beamPath.getIncomingSegments(sourceComp.id);
                    if (sourceIncoming.length > 0) {
                        const upstreamSource = components.get(sourceIncoming[0].sourceId);
                        if (upstreamSource) {
                            incomingAngleToSource = BeamPhysics.calculateBeamAngle(upstreamSource.position, sourceComp.position);
                        }
                    }
                }

                if (incomingAngleToSource !== null) {
                    const expectedAngle = BeamPhysics.getOutputDirection(sourceComp, incomingAngleToSource, segment.sourcePort);
                    if (expectedAngle !== null) {
                        // Calculate deviation
                        const deviation = Math.abs(BeamPhysics.normalizeAngle(newAngle - expectedAngle));
                        const normalizedDev = Math.min(deviation, 360 - deviation);

                        // If deviation is too large, reject the move
                        if (normalizedDev > BeamPhysics.ANGLE_TOLERANCE) {
                            return {
                                valid: false,
                                error: `Movement would break beam connection from ${sourceComp.name} to ${comp.name}. Beam angle deviation: ${normalizedDev.toFixed(1)}°`
                            };
                        }
                    }
                }
            }

            // Check outgoing beam segments
            const outgoingSegments = beamPath.getOutgoingSegments(compId);
            for (const segment of outgoingSegments) {
                const targetComp = components.get(segment.targetId);
                if (!targetComp) continue;

                // Skip if target was also moved (relative position maintained)
                if (originalPositions.has(segment.targetId)) continue;

                // Calculate new beam angle from source to target
                const newAngle = BeamPhysics.calculateBeamAngle(comp.position, targetComp.position);
                if (newAngle === null) continue;

                // Get expected output angle from this component
                let incomingAngle = null;
                if (comp.type === 'source') {
                    incomingAngle = comp.emissionAngle || 0;
                } else {
                    const compIncoming = beamPath.getIncomingSegments(comp.id);
                    if (compIncoming.length > 0) {
                        const upstreamSource = components.get(compIncoming[0].sourceId);
                        if (upstreamSource) {
                            incomingAngle = BeamPhysics.calculateBeamAngle(upstreamSource.position, comp.position);
                        }
                    }
                }

                if (incomingAngle !== null) {
                    const expectedAngle = BeamPhysics.getOutputDirection(comp, incomingAngle, segment.sourcePort);
                    if (expectedAngle !== null) {
                        const deviation = Math.abs(BeamPhysics.normalizeAngle(newAngle - expectedAngle));
                        const normalizedDev = Math.min(deviation, 360 - deviation);

                        if (normalizedDev > BeamPhysics.ANGLE_TOLERANCE) {
                            return {
                                valid: false,
                                error: `Movement would break beam connection from ${comp.name} to ${targetComp.name}. Beam angle deviation: ${normalizedDev.toFixed(1)}°`
                            };
                        }
                    }
                }
            }
        }

        return { valid: true, error: null };
    }

    /**
     * Show a warning toast for movement constraint violation
     */
    showMovementWarning(message) {
        // Create toast element if it doesn't exist
        let toast = document.getElementById('movement-warning-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'movement-warning-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: #ef4444;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(toast);
        }

        // Show the toast
        toast.textContent = message;
        toast.style.opacity = '1';

        // Hide after 4 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 4000);
    }

    /**
     * Handle dragging a component from the palette
     */
    handlePaletteDrag(e) {
        if (!this.dragComponentType || !this.paletteMouseStart) return;

        // Check if we've moved enough to start dragging (5px threshold)
        const dx = e.clientX - this.paletteMouseStart.x;
        const dy = e.clientY - this.paletteMouseStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!this.isDraggingFromPalette && distance > 5) {
            // Start dragging - create preview element
            this.isDraggingFromPalette = true;
            this.createDragPreview(this.dragComponentType);
        }

        if (this.isDraggingFromPalette && this.dragPreviewElement) {
            // Update preview position
            this.dragPreviewElement.style.left = `${e.clientX}px`;
            this.dragPreviewElement.style.top = `${e.clientY}px`;

            // Check if over canvas and show snapped position
            const rect = this.canvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const state = this.store.getState();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldPos = this.renderer.screenToWorld(screenX, screenY, state.ui.viewport);
                const gridSize = state.grid?.size || 25;
                const gridEnabled = state.grid?.enabled !== false;
                const snappedPos = gridEnabled ? BeamPhysics.snapToGrid(worldPos, gridSize) : worldPos;

                // Update preview to show snapped position hint
                this.dragPreviewElement.classList.add('over-canvas');
                this.dragPreviewElement.dataset.snapped = `(${Math.round(snappedPos.x)}, ${Math.round(snappedPos.y)})`;
            } else {
                this.dragPreviewElement.classList.remove('over-canvas');
            }
        }
    }

    /**
     * Handle dropping a component from the palette
     */
    handlePaletteDrop(e) {
        if (this.isDraggingFromPalette && this.dragComponentType) {
            // Check if dropped on canvas
            const rect = this.canvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const state = this.store.getState();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldPos = this.renderer.screenToWorld(screenX, screenY, state.ui.viewport);
                const gridSize = state.grid?.size || 25;
                const gridEnabled = state.grid?.enabled !== false;
                const snappedPos = gridEnabled ? BeamPhysics.snapToGrid(worldPos, gridSize) : worldPos;

                this.placeComponent(this.dragComponentType, snappedPos);
            }
        }

        // Clean up
        this.removeDragPreview();
        this.isDraggingFromPalette = false;
        this.dragComponentType = null;
        this.paletteMouseStart = null;
    }

    /**
     * Create a visual preview element for dragging
     */
    createDragPreview(componentType) {
        this.removeDragPreview(); // Clean up any existing preview

        const preview = document.createElement('div');
        preview.className = 'component-drag-preview';
        preview.innerHTML = `
            <span class="comp-icon ${componentType}"></span>
            <span class="comp-name">${ComponentNames[componentType] || componentType}</span>
        `;
        document.body.appendChild(preview);
        this.dragPreviewElement = preview;
    }

    /**
     * Remove the drag preview element
     */
    removeDragPreview() {
        if (this.dragPreviewElement) {
            this.dragPreviewElement.remove();
            this.dragPreviewElement = null;
        }
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

        // Get active wavelength for new beam
        const activeWavelengthId = state.activeWavelengthId;

        // Create the segment with physics data
        const segment = new BeamSegment({
            sourceId: source.id,
            targetId: target.id,
            sourcePort,
            targetPort: 'input',
            direction: validation.beamDirection,
            directionAngle: validation.beamAngle,
            isValid: true,
            wavelengthIds: activeWavelengthId ? [activeWavelengthId] : []
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
     * Delete selected components, zones, or beam segments
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

        // Delete selected beam segments
        if (state.ui.selection.type === 'segment') {
            const segmentIds = state.ui.selection.selectedSegmentIds || [];
            segmentIds.forEach(id => {
                this.store.dispatch(actions.deleteBeamSegment(id));
            });
            // Clear selection after deletion
            this.store.dispatch(actions.clearSelection());
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
     * Rotate selected components by 90 degrees clockwise
     */
    rotateSelectedComponents() {
        const state = this.store.getState();

        // Only works for component selection
        if (state.ui.selection.type !== 'component' || state.ui.selection.selectedIds.length === 0) {
            return;
        }

        let fixedCount = 0;
        let rotatedCount = 0;

        state.ui.selection.selectedIds.forEach(id => {
            const component = state.components.get(id);
            if (component) {
                if (component.isAngleFixed) {
                    fixedCount++;
                } else {
                    // Rotate 90 degrees clockwise, wrap at 360
                    const newAngle = (component.angle + 90) % 360;
                    this.store.dispatch(actions.updateComponent(id, { angle: newAngle }));
                    rotatedCount++;
                }
            }
        });

        // Show feedback
        if (fixedCount > 0 && rotatedCount === 0) {
            this.showToast('Cannot rotate: angle is fixed', 'warning');
        } else if (fixedCount > 0) {
            this.showToast(`Rotated ${rotatedCount} component(s), ${fixedCount} fixed`, 'warning');
        }
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

                // Check for version migration
                const currentVersion = APP_VERSION.toFileFormat();
                const fileVersion = json.formatVersion;

                if (needsMigration(fileVersion, currentVersion)) {
                    const shouldMigrate = confirm(
                        `This file was created with an older version (${fileVersion}).\n\n` +
                        `Current version: ${currentVersion}\n\n` +
                        `Would you like to update it to the current format?\n` +
                        `(Your original file will not be modified until you save)`
                    );

                    if (shouldMigrate) {
                        console.log(`Migrating file from ${fileVersion} to ${currentVersion}`);
                        json.formatVersion = currentVersion;
                    }
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
            formatVersion: APP_VERSION.toFileFormat(),
            appVersion: APP_VERSION.toString(),
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
        const selectedSegmentIds = state.ui.selection.selectedSegmentIds || [];
        const selectionType = state.ui.selection.type;

        const noSelection = document.getElementById('no-selection');
        const componentProps = document.getElementById('component-properties');
        const zoneProps = document.getElementById('zone-properties');
        const segmentProps = document.getElementById('segment-properties');
        const selectionSection = document.getElementById('selection-info');
        const optimizerSection = document.getElementById('optimizer-section');

        // Hide all property panels first
        noSelection.classList.add('hidden');
        componentProps.classList.add('hidden');
        zoneProps.classList.add('hidden');
        segmentProps.classList.add('hidden');

        // Toggle between properties and optimizer sections
        const hasSelection = (selectionType === 'component' && selectedId && state.components.has(selectedId)) ||
                             (selectionType === 'zone' && selectedZoneId) ||
                             (selectionType === 'segment' && selectedSegmentIds.length > 0);

        if (hasSelection) {
            // Show properties section, hide optimizer
            selectionSection.classList.remove('hidden');
            optimizerSection.classList.add('hidden');
        } else {
            // Show optimizer section, hide properties
            selectionSection.classList.add('hidden');
            optimizerSection.classList.remove('hidden');
        }

        if (selectionType === 'component' && selectedId && state.components.has(selectedId)) {
            // Show component properties
            const component = state.components.get(selectedId);

            componentProps.classList.remove('hidden');

            document.getElementById('prop-name').value = component.name;
            document.getElementById('prop-type').textContent = ComponentNames[component.type] || component.type;
            document.getElementById('prop-x').value = component.position.x.toFixed(1);
            document.getElementById('prop-y').value = component.position.y.toFixed(1);

            // Normalize angle to 0-180° range for display
            const displayAngle = component.angle > 180 ? component.angle % 180 : component.angle;
            document.getElementById('prop-angle').value = displayAngle;
            document.getElementById('prop-angle-slider').value = displayAngle;

            document.getElementById('prop-mass').value = component.mass;
            document.getElementById('prop-width').value = component.size.width;
            document.getElementById('prop-height').value = component.size.height;
            document.getElementById('prop-fixed').checked = component.isFixed;
            document.getElementById('prop-angle-fixed').checked = component.isAngleFixed;

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
        } else if (selectionType === 'segment' && selectedSegmentIds.length > 0) {
            // Show segment properties
            const segmentId = selectedSegmentIds[0]; // For now, show first selected segment
            const segment = state.beamPath.segments.get(segmentId);

            if (segment) {
                segmentProps.classList.remove('hidden');

                // Get source and target component names
                const sourceComp = state.components.get(segment.sourceId);
                const targetComp = state.components.get(segment.targetId);

                document.getElementById('segment-prop-source').textContent = sourceComp ? sourceComp.name : 'Unknown';
                document.getElementById('segment-prop-target').textContent = targetComp ? targetComp.name : 'Unknown';
                document.getElementById('segment-prop-length').textContent = segment.pathLength.toFixed(1) + ' mm';

                // Populate wavelengths list
                this.updateSegmentWavelengthsList(segment, state.wavelengths);

                // Populate wavelength dropdown
                this.updateSegmentWavelengthDropdown(segment, state.wavelengths);
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
     * Update segment wavelengths list display
     */
    updateSegmentWavelengthsList(segment, wavelengths) {
        const listEl = document.getElementById('segment-wavelengths-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        if (!segment.wavelengthIds || segment.wavelengthIds.length === 0) {
            listEl.innerHTML = '<div style="font-size: 11px; color: var(--text-secondary); padding: 8px;">No wavelengths</div>';
            return;
        }

        segment.wavelengthIds.forEach(wlId => {
            const wavelength = wavelengths.find(w => w.id === wlId);
            if (wavelength) {
                const item = document.createElement('div');
                item.className = 'segment-wavelength-item';
                item.innerHTML = `
                    <div class="swatch" style="background-color: ${wavelength.color}"></div>
                    <span class="name">${wavelength.name}</span>
                    <button class="remove-btn" data-wavelength-id="${wlId}" title="Remove">&times;</button>
                `;
                listEl.appendChild(item);

                // Add remove handler
                item.querySelector('.remove-btn').addEventListener('click', () => {
                    this.removeWavelengthFromSegment(segment.id, wlId);
                });
            }
        });
    }

    /**
     * Update segment wavelength dropdown
     */
    updateSegmentWavelengthDropdown(segment, wavelengths) {
        const selectEl = document.getElementById('segment-wavelength-select');
        if (!selectEl) return;

        // Clear existing options except first
        selectEl.innerHTML = '<option value="">Add wavelength...</option>';

        // Add wavelengths that are not already on the segment
        const segmentWavelengthIds = segment.wavelengthIds || [];
        wavelengths.forEach(wl => {
            if (!segmentWavelengthIds.includes(wl.id)) {
                const option = document.createElement('option');
                option.value = wl.id;
                option.textContent = wl.name;
                selectEl.appendChild(option);
            }
        });
    }

    /**
     * Remove a wavelength from the selected segment(s)
     */
    removeWavelengthFromSegment(segmentId, wavelengthId) {
        const state = this.store.getState();
        const segment = state.beamPath.segments.get(segmentId);
        if (!segment) return;

        const newWavelengthIds = segment.wavelengthIds.filter(id => id !== wavelengthId);
        this.store.dispatch(actions.updateSegmentWavelengths(segmentId, newWavelengthIds));
    }

    /**
     * Render the canvas
     */
    render() {
        const state = this.store.getState();

        // Check if we're in preview mode or split-screen mode
        if (this.isSplitScreenMode && this.previewSnapshot) {
            // Split-screen comparison: original vs selected
            const originalLayout = this.optimizer.getOriginalLayout();
            this.renderer.renderComparison(state, originalLayout, this.previewSnapshot);
        } else if (this.previewSnapshot) {
            // Preview mode: show snapshot with indicator
            this.renderer.renderPreview(state, this.previewSnapshot);
        } else {
            // Normal rendering
            this.renderer.render(state);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BeamPathOptimizerApp();
});

export default BeamPathOptimizerApp;
