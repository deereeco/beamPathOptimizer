/**
 * Application state management using reducer pattern
 */

import { Component, ComponentType } from './models/Component.js';
import { BeamPath } from './models/BeamPath.js';

/**
 * Action types
 */
export const ActionType = {
    // Component actions
    ADD_COMPONENT: 'ADD_COMPONENT',
    UPDATE_COMPONENT: 'UPDATE_COMPONENT',
    DELETE_COMPONENT: 'DELETE_COMPONENT',
    MOVE_COMPONENT: 'MOVE_COMPONENT',

    // Beam path actions
    ADD_BEAM_SEGMENT: 'ADD_BEAM_SEGMENT',
    DELETE_BEAM_SEGMENT: 'DELETE_BEAM_SEGMENT',

    // Constraint actions
    ADD_KEEPOUT_ZONE: 'ADD_KEEPOUT_ZONE',
    UPDATE_KEEPOUT_ZONE: 'UPDATE_KEEPOUT_ZONE',
    DELETE_KEEPOUT_ZONE: 'DELETE_KEEPOUT_ZONE',
    SET_MOUNTING_ZONE: 'SET_MOUNTING_ZONE',

    // Selection actions
    SELECT_COMPONENT: 'SELECT_COMPONENT',
    SELECT_MULTIPLE: 'SELECT_MULTIPLE',
    SELECT_ZONE: 'SELECT_ZONE',
    CLEAR_SELECTION: 'CLEAR_SELECTION',

    // Zone actions
    MOVE_ZONE: 'MOVE_ZONE',
    UPDATE_MOUNTING_ZONE: 'UPDATE_MOUNTING_ZONE',
    DELETE_MOUNTING_ZONE: 'DELETE_MOUNTING_ZONE',

    // UI actions
    SET_TOOL: 'SET_TOOL',
    SET_VIEWPORT: 'SET_VIEWPORT',
    SET_WORKSPACE_SIZE: 'SET_WORKSPACE_SIZE',

    // Document actions
    NEW_DOCUMENT: 'NEW_DOCUMENT',
    LOAD_DOCUMENT: 'LOAD_DOCUMENT',
    MARK_DIRTY: 'MARK_DIRTY',
    MARK_CLEAN: 'MARK_CLEAN',

    // Utility actions
    RECALCULATE: 'RECALCULATE'
};

/**
 * Create initial application state
 */
export function createInitialState() {
    return {
        // Document metadata
        document: {
            name: 'Untitled',
            description: '',
            isDirty: false,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
        },

        // Components indexed by ID
        components: new Map(),

        // Beam path graph
        beamPath: new BeamPath(),

        // Constraints
        constraints: {
            keepOutZones: [],
            mountingZone: null,
            workspace: { width: 600, height: 600 }
        },

        // Calculated values (derived)
        calculated: {
            centerOfMass: null,
            totalMass: 0,
            isCoMInMountingZone: false,
            constraintViolations: [],
            totalPathLength: 0
        },

        // UI state
        ui: {
            tool: 'select', // select, pan, connect, keepout, mounting, [component types]
            viewport: {
                panX: 0,
                panY: 0,
                zoom: 1.0
            },
            selection: {
                type: null,           // 'component' | 'zone' | null
                selectedIds: [],      // component IDs when type='component'
                selectedZoneId: null, // zone ID when type='zone' (format: 'keepout:id' or 'mounting')
                hoveredId: null,
                hoveredZoneId: null
            },
            selectionBox: null,       // { startX, startY, endX, endY } for drag selection
            placingComponent: null, // Component type being placed
            connectingFrom: null    // Source component/port for beam connection
        }
    };
}

/**
 * Calculate center of mass from components
 */
export function calculateCenterOfMass(components) {
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;

    components.forEach(comp => {
        totalMass += comp.mass;
        weightedX += comp.mass * comp.position.x;
        weightedY += comp.mass * comp.position.y;
    });

    if (totalMass === 0) {
        return { position: null, totalMass: 0 };
    }

    return {
        position: {
            x: weightedX / totalMass,
            y: weightedY / totalMass
        },
        totalMass
    };
}

/**
 * Check if a point is inside a rectangular zone
 */
export function isPointInZone(point, zone) {
    if (!point || !zone) return false;
    return (
        point.x >= zone.x &&
        point.x <= zone.x + zone.width &&
        point.y >= zone.y &&
        point.y <= zone.y + zone.height
    );
}

/**
 * Check if a component overlaps with a zone
 */
export function componentOverlapsZone(component, zone) {
    const bbox = component.getBoundingBox();
    return !(
        bbox.maxX < zone.x ||
        bbox.minX > zone.x + zone.width ||
        bbox.maxY < zone.y ||
        bbox.minY > zone.y + zone.height
    );
}

/**
 * Check all constraint violations
 */
export function checkConstraintViolations(components, constraints) {
    const violations = [];
    const componentArray = Array.isArray(components) ? components : Array.from(components);

    componentArray.forEach(comp => {
        // Check keep-out zones
        constraints.keepOutZones.forEach(zone => {
            if (zone.isActive && componentOverlapsZone(comp, zone.bounds)) {
                violations.push({
                    type: 'keepout',
                    componentId: comp.id,
                    zoneId: zone.id,
                    message: `${comp.name} overlaps keep-out zone "${zone.name}"`
                });
            }
        });

        // Check workspace boundaries
        const bbox = comp.getBoundingBox();
        if (bbox.minX < 0 || bbox.minY < 0 ||
            bbox.maxX > constraints.workspace.width ||
            bbox.maxY > constraints.workspace.height) {
            violations.push({
                type: 'boundary',
                componentId: comp.id,
                message: `${comp.name} is outside workspace boundaries`
            });
        }

        // Check mount zone violations
        if (comp.mountZone && comp.mountZone.enabled) {
            const mountBounds = comp.getMountZoneBounds();
            if (mountBounds) {
                // Check mount zone against keep-out zones
                constraints.keepOutZones.forEach(zone => {
                    if (zone.isActive && boundsOverlap(mountBounds, {
                        minX: zone.bounds.x,
                        minY: zone.bounds.y,
                        maxX: zone.bounds.x + zone.bounds.width,
                        maxY: zone.bounds.y + zone.bounds.height
                    })) {
                        violations.push({
                            type: 'mountZone',
                            componentId: comp.id,
                            zoneId: zone.id,
                            message: `${comp.name}'s mount zone overlaps keep-out zone "${zone.name}"`
                        });
                    }
                });

                // Check mount zone against other components and their mount zones
                componentArray.forEach(other => {
                    if (other.id === comp.id) return;

                    // Check against other component's body
                    const otherBBox = other.getBoundingBox();
                    if (boundsOverlap(mountBounds, otherBBox)) {
                        // Only add if not already reported from other side
                        const alreadyReported = violations.some(v =>
                            v.type === 'mountZone' &&
                            v.componentId === other.id &&
                            v.otherComponentId === comp.id
                        );
                        if (!alreadyReported) {
                            violations.push({
                                type: 'mountZone',
                                componentId: comp.id,
                                otherComponentId: other.id,
                                message: `${comp.name}'s mount zone overlaps ${other.name}`
                            });
                        }
                    }

                    // Check against other component's mount zone
                    if (other.mountZone && other.mountZone.enabled) {
                        const otherMountBounds = other.getMountZoneBounds();
                        if (otherMountBounds && boundsOverlap(mountBounds, otherMountBounds)) {
                            // Only add if not already reported from other side
                            const alreadyReported = violations.some(v =>
                                v.type === 'mountZone' &&
                                v.componentId === other.id &&
                                v.otherComponentId === comp.id
                            );
                            if (!alreadyReported) {
                                violations.push({
                                    type: 'mountZone',
                                    componentId: comp.id,
                                    otherComponentId: other.id,
                                    message: `${comp.name}'s mount zone overlaps ${other.name}'s mount zone`
                                });
                            }
                        }
                    }
                });

                // Check mount zone against workspace boundaries
                if (mountBounds.minX < 0 || mountBounds.minY < 0 ||
                    mountBounds.maxX > constraints.workspace.width ||
                    mountBounds.maxY > constraints.workspace.height) {
                    violations.push({
                        type: 'mountZone',
                        componentId: comp.id,
                        message: `${comp.name}'s mount zone is outside workspace boundaries`
                    });
                }
            }
        }
    });

    return violations;
}

/**
 * Check if two axis-aligned bounding boxes overlap
 */
function boundsOverlap(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX ||
             a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Recalculate derived state values
 */
export function recalculateDerivedState(state) {
    const components = Array.from(state.components.values());

    // Calculate center of mass
    const { position: comPosition, totalMass } = calculateCenterOfMass(components);
    state.calculated.centerOfMass = comPosition;
    state.calculated.totalMass = totalMass;

    // Check if CoM is in mounting zone
    state.calculated.isCoMInMountingZone = isPointInZone(
        comPosition,
        state.constraints.mountingZone?.bounds
    );

    // Check constraint violations
    state.calculated.constraintViolations = checkConstraintViolations(
        components,
        state.constraints
    );

    // Recalculate path lengths
    state.beamPath.recalculatePathLengths(components);
    state.calculated.totalPathLength = state.beamPath.getTotalPathLength();

    return state;
}

/**
 * State reducer
 */
export function reducer(state, action) {
    let newState = { ...state };

    switch (action.type) {
        // ===== Component Actions =====
        case ActionType.ADD_COMPONENT: {
            const component = action.component instanceof Component
                ? action.component
                : new Component(action.component);

            newState.components = new Map(state.components);
            newState.components.set(component.id, component);
            newState.document = { ...state.document, isDirty: true };

            // Auto-select the new component
            newState.ui = {
                ...state.ui,
                selection: { ...state.ui.selection, selectedIds: [component.id] }
            };
            break;
        }

        case ActionType.UPDATE_COMPONENT: {
            const { componentId, updates } = action;
            const component = state.components.get(componentId);
            if (!component) return state;

            newState.components = new Map(state.components);
            const updatedComponent = new Component(component.toJSON());
            updatedComponent.update(updates);
            newState.components.set(componentId, updatedComponent);
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.MOVE_COMPONENT: {
            const { componentId, position } = action;
            const component = state.components.get(componentId);
            if (!component) return state;

            newState.components = new Map(state.components);
            const movedComponent = new Component(component.toJSON());
            movedComponent.update({ position });
            newState.components.set(componentId, movedComponent);
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.DELETE_COMPONENT: {
            const { componentId } = action;
            if (!state.components.has(componentId)) return state;

            newState.components = new Map(state.components);
            newState.components.delete(componentId);

            // Remove connected beam segments
            newState.beamPath = new BeamPath();
            state.beamPath.getAllSegments().forEach(seg => {
                if (seg.sourceId !== componentId && seg.targetId !== componentId) {
                    newState.beamPath.addSegment(seg);
                }
            });

            // Clear selection if deleted component was selected
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    selectedIds: state.ui.selection.selectedIds.filter(id => id !== componentId)
                }
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        // ===== Beam Path Actions =====
        case ActionType.ADD_BEAM_SEGMENT: {
            newState.beamPath = new BeamPath();
            state.beamPath.getAllSegments().forEach(seg => {
                newState.beamPath.addSegment(seg);
            });
            newState.beamPath.addSegment(action.segment);
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.DELETE_BEAM_SEGMENT: {
            newState.beamPath = new BeamPath();
            state.beamPath.getAllSegments().forEach(seg => {
                if (seg.id !== action.segmentId) {
                    newState.beamPath.addSegment(seg);
                }
            });
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        // ===== Constraint Actions =====
        case ActionType.ADD_KEEPOUT_ZONE: {
            newState.constraints = {
                ...state.constraints,
                keepOutZones: [...state.constraints.keepOutZones, action.zone]
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.UPDATE_KEEPOUT_ZONE: {
            newState.constraints = {
                ...state.constraints,
                keepOutZones: state.constraints.keepOutZones.map(zone => {
                    if (zone.id !== action.zoneId) return zone;
                    return {
                        ...zone,
                        ...action.updates,
                        bounds: action.updates.bounds
                            ? { ...zone.bounds, ...action.updates.bounds }
                            : zone.bounds
                    };
                })
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.DELETE_KEEPOUT_ZONE: {
            newState.constraints = {
                ...state.constraints,
                keepOutZones: state.constraints.keepOutZones.filter(
                    zone => zone.id !== action.zoneId
                )
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.SET_MOUNTING_ZONE: {
            newState.constraints = {
                ...state.constraints,
                mountingZone: action.zone
            };
            newState.document = { ...state.document, isDirty: true };
            // Auto-select the new zone
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: 'zone',
                    selectedIds: [],
                    selectedZoneId: 'mounting'
                }
            };
            break;
        }

        case ActionType.UPDATE_MOUNTING_ZONE: {
            if (!state.constraints.mountingZone) return state;
            newState.constraints = {
                ...state.constraints,
                mountingZone: {
                    ...state.constraints.mountingZone,
                    ...action.updates,
                    bounds: action.updates.bounds
                        ? { ...state.constraints.mountingZone.bounds, ...action.updates.bounds }
                        : state.constraints.mountingZone.bounds
                }
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.DELETE_MOUNTING_ZONE: {
            newState.constraints = {
                ...state.constraints,
                mountingZone: null
            };
            newState.ui = {
                ...state.ui,
                selection: { ...state.ui.selection, type: null, selectedZoneId: null }
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.MOVE_ZONE: {
            const { zoneId, position } = action;
            if (zoneId === 'mounting') {
                if (!state.constraints.mountingZone) return state;
                newState.constraints = {
                    ...state.constraints,
                    mountingZone: {
                        ...state.constraints.mountingZone,
                        bounds: {
                            ...state.constraints.mountingZone.bounds,
                            x: position.x,
                            y: position.y
                        }
                    }
                };
            } else if (zoneId.startsWith('keepout:')) {
                const id = zoneId.replace('keepout:', '');
                newState.constraints = {
                    ...state.constraints,
                    keepOutZones: state.constraints.keepOutZones.map(zone =>
                        zone.id === id
                            ? { ...zone, bounds: { ...zone.bounds, x: position.x, y: position.y } }
                            : zone
                    )
                };
            }
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        // ===== Selection Actions =====
        case ActionType.SELECT_COMPONENT: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: action.componentId ? 'component' : null,
                    selectedIds: action.componentId ? [action.componentId] : [],
                    selectedZoneId: null
                }
            };
            break;
        }

        case ActionType.SELECT_MULTIPLE: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: action.componentIds.length > 0 ? 'component' : null,
                    selectedIds: action.componentIds,
                    selectedZoneId: null
                }
            };
            break;
        }

        case ActionType.SELECT_ZONE: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: action.zoneId ? 'zone' : null,
                    selectedIds: [],
                    selectedZoneId: action.zoneId
                }
            };
            break;
        }

        case ActionType.CLEAR_SELECTION: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: null,
                    selectedIds: [],
                    selectedZoneId: null
                },
                selectionBox: null
            };
            break;
        }

        // ===== UI Actions =====
        case ActionType.SET_TOOL: {
            newState.ui = {
                ...state.ui,
                tool: action.tool,
                placingComponent: null,
                connectingFrom: null
            };
            break;
        }

        case ActionType.SET_VIEWPORT: {
            newState.ui = {
                ...state.ui,
                viewport: { ...state.ui.viewport, ...action.viewport }
            };
            break;
        }

        case ActionType.SET_WORKSPACE_SIZE: {
            newState.constraints = {
                ...state.constraints,
                workspace: { width: action.width, height: action.height }
            };
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        // ===== Document Actions =====
        case ActionType.NEW_DOCUMENT: {
            return createInitialState();
        }

        case ActionType.LOAD_DOCUMENT: {
            // Will be implemented in FileIO
            return action.state;
        }

        case ActionType.MARK_DIRTY: {
            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.MARK_CLEAN: {
            newState.document = { ...state.document, isDirty: false };
            break;
        }

        case ActionType.RECALCULATE: {
            // Just trigger recalculation without any state changes
            break;
        }

        default:
            return state;
    }

    // Recalculate derived values after state changes
    return recalculateDerivedState(newState);
}

/**
 * Action creators
 */
export const actions = {
    addComponent: (component) => ({ type: ActionType.ADD_COMPONENT, component }),
    updateComponent: (componentId, updates) => ({ type: ActionType.UPDATE_COMPONENT, componentId, updates }),
    moveComponent: (componentId, position) => ({ type: ActionType.MOVE_COMPONENT, componentId, position }),
    deleteComponent: (componentId) => ({ type: ActionType.DELETE_COMPONENT, componentId }),

    addBeamSegment: (segment) => ({ type: ActionType.ADD_BEAM_SEGMENT, segment }),
    deleteBeamSegment: (segmentId) => ({ type: ActionType.DELETE_BEAM_SEGMENT, segmentId }),

    addKeepOutZone: (zone) => ({ type: ActionType.ADD_KEEPOUT_ZONE, zone }),
    updateKeepOutZone: (zoneId, updates) => ({ type: ActionType.UPDATE_KEEPOUT_ZONE, zoneId, updates }),
    deleteKeepOutZone: (zoneId) => ({ type: ActionType.DELETE_KEEPOUT_ZONE, zoneId }),
    setMountingZone: (zone) => ({ type: ActionType.SET_MOUNTING_ZONE, zone }),
    updateMountingZone: (updates) => ({ type: ActionType.UPDATE_MOUNTING_ZONE, updates }),
    deleteMountingZone: () => ({ type: ActionType.DELETE_MOUNTING_ZONE }),
    moveZone: (zoneId, position) => ({ type: ActionType.MOVE_ZONE, zoneId, position }),

    selectComponent: (componentId) => ({ type: ActionType.SELECT_COMPONENT, componentId }),
    selectMultiple: (componentIds) => ({ type: ActionType.SELECT_MULTIPLE, componentIds }),
    selectZone: (zoneId) => ({ type: ActionType.SELECT_ZONE, zoneId }),
    clearSelection: () => ({ type: ActionType.CLEAR_SELECTION }),

    setTool: (tool) => ({ type: ActionType.SET_TOOL, tool }),
    setViewport: (viewport) => ({ type: ActionType.SET_VIEWPORT, viewport }),
    setWorkspaceSize: (width, height) => ({ type: ActionType.SET_WORKSPACE_SIZE, width, height }),

    newDocument: () => ({ type: ActionType.NEW_DOCUMENT }),
    loadDocument: (state) => ({ type: ActionType.LOAD_DOCUMENT, state }),
    markDirty: () => ({ type: ActionType.MARK_DIRTY }),
    markClean: () => ({ type: ActionType.MARK_CLEAN }),
    recalculate: () => ({ type: ActionType.RECALCULATE })
};

/**
 * Simple store implementation
 */
export class Store {
    constructor(initialState) {
        this.state = initialState || createInitialState();
        this.listeners = new Set();
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
    }

    getState() {
        return this.state;
    }

    dispatch(action) {
        const oldState = this.state;
        this.state = reducer(this.state, action);

        // Add to history for undo (skip UI-only actions)
        const skipHistory = [
            ActionType.SELECT_COMPONENT,
            ActionType.SELECT_MULTIPLE,
            ActionType.CLEAR_SELECTION,
            ActionType.SET_TOOL,
            ActionType.SET_VIEWPORT
        ];

        if (!skipHistory.includes(action.type)) {
            // Truncate any redo history
            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push({ action, prevState: oldState });
            this.historyIndex++;

            // Limit history size
            if (this.history.length > this.maxHistory) {
                this.history.shift();
                this.historyIndex--;
            }
        }

        // Notify listeners
        this.listeners.forEach(listener => listener(this.state, action));
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    canUndo() {
        return this.historyIndex >= 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    undo() {
        if (!this.canUndo()) return;

        const { prevState } = this.history[this.historyIndex];
        this.historyIndex--;
        this.state = recalculateDerivedState(prevState);

        this.listeners.forEach(listener => listener(this.state, { type: 'UNDO' }));
    }

    redo() {
        if (!this.canRedo()) return;

        this.historyIndex++;
        const { action } = this.history[this.historyIndex];
        this.state = reducer(this.state, action);

        this.listeners.forEach(listener => listener(this.state, { type: 'REDO' }));
    }
}

export default Store;
