/**
 * Application state management using reducer pattern
 */

import { Component, ComponentType } from './models/Component.js';
import { BeamPath, BeamSegment } from './models/BeamPath.js';
import * as BeamPhysics from './physics/BeamPhysics.js';
import * as FoldGeometry from './physics/FoldGeometry.js';

/**
 * Application version
 * Format: V{major}.{minor}
 * Minor increments for each release, resets to 0 and major++ when minor reaches 100
 */
export const APP_VERSION = {
    major: 1,
    minor: 6,
    toString() {
        return `V${this.major}.${this.minor}`;
    },
    toFileFormat() {
        return `${this.major}.${this.minor}`;
    }
};

/**
 * Compare two version strings
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
    const parseVersion = (v) => {
        const match = v.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!match) return { major: 0, minor: 0, patch: 0 };
        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3] || '0', 10)
        };
    };

    const va = parseVersion(a);
    const vb = parseVersion(b);

    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
}

/**
 * Check if file needs migration
 */
export function needsMigration(fileVersion, currentVersion) {
    return compareVersions(fileVersion, currentVersion) < 0;
}

/**
 * Action types
 */
export const ActionType = {
    // Component actions
    ADD_COMPONENT: 'ADD_COMPONENT',
    UPDATE_COMPONENT: 'UPDATE_COMPONENT',
    DELETE_COMPONENT: 'DELETE_COMPONENT',
    MOVE_COMPONENT: 'MOVE_COMPONENT',
    ROTATE_CONSTRAINED_PAIR: 'ROTATE_CONSTRAINED_PAIR',

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
    SELECT_SEGMENT: 'SELECT_SEGMENT',
    SELECT_MULTIPLE_SEGMENTS: 'SELECT_MULTIPLE_SEGMENTS',
    CLEAR_SELECTION: 'CLEAR_SELECTION',

    // Zone actions
    MOVE_ZONE: 'MOVE_ZONE',
    UPDATE_MOUNTING_ZONE: 'UPDATE_MOUNTING_ZONE',
    DELETE_MOUNTING_ZONE: 'DELETE_MOUNTING_ZONE',

    // UI actions
    SET_TOOL: 'SET_TOOL',
    SET_VIEWPORT: 'SET_VIEWPORT',
    SET_WORKSPACE_SIZE: 'SET_WORKSPACE_SIZE',
    TOGGLE_LABELS: 'TOGGLE_LABELS',
    TOGGLE_AUTO_PROPAGATE: 'TOGGLE_AUTO_PROPAGATE',

    // Grid actions
    SET_GRID_SETTINGS: 'SET_GRID_SETTINGS',

    // Background actions
    SET_BACKGROUND: 'SET_BACKGROUND',

    // Wavelength actions
    ADD_WAVELENGTH: 'ADD_WAVELENGTH',
    UPDATE_WAVELENGTH: 'UPDATE_WAVELENGTH',
    DELETE_WAVELENGTH: 'DELETE_WAVELENGTH',
    SET_ACTIVE_WAVELENGTH: 'SET_ACTIVE_WAVELENGTH',
    UPDATE_SEGMENT_WAVELENGTHS: 'UPDATE_SEGMENT_WAVELENGTHS',

    // Document actions
    NEW_DOCUMENT: 'NEW_DOCUMENT',
    LOAD_DOCUMENT: 'LOAD_DOCUMENT',
    UPDATE_DOCUMENT_NAME: 'UPDATE_DOCUMENT_NAME',
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
                type: null,           // 'component' | 'zone' | 'segment' | null
                selectedIds: [],      // component IDs when type='component'
                selectedZoneId: null, // zone ID when type='zone' (format: 'keepout:id' or 'mounting')
                selectedSegmentIds: [], // beam segment IDs when type='segment'
                hoveredId: null,
                hoveredZoneId: null,
                hoveredSegmentId: null
            },
            selectionBox: null,       // { startX, startY, endX, endY } for drag selection
            placingComponent: null, // Component type being placed
            connectingFrom: null,   // Source component/port for beam connection
            labelsVisible: true,    // Global label visibility toggle
            autoPropagate: false    // Automatically propagate beams to components they intersect
        },

        // Grid settings
        grid: {
            enabled: true,   // Global grid snapping on/off
            visible: false,  // Show/hide grid lines visually
            size: 25         // Grid size in mm (1-50)
        },

        // Workspace background
        background: {
            type: 'color',       // 'color' or 'image'
            color: '#0d1117',    // Default canvas-bg color
            imagePath: null,     // Path to image file (for save/load)
            imageData: null,     // Runtime only: loaded image data (not saved)
            imageDataURL: null,  // Data URL (base64) for persistence
            opacity: 100         // Opacity for background image (0-100%)
        },

        // Wavelengths (beam colors)
        wavelengths: [
            { id: 'w1', name: '633nm HeNe', color: '#ff0000', isPreset: true },
            { id: 'w2', name: '532nm Nd:YAG', color: '#00ff00', isPreset: true },
            { id: 'w3', name: '1064nm IR', color: '#ff00ff', isPreset: true },
            { id: 'w4', name: '405nm Violet', color: '#8800ff', isPreset: true },
            { id: 'w5', name: '780nm GaAs', color: '#cc0044', isPreset: true },
            { id: 'w6', name: '850nm VCSEL', color: '#990066', isPreset: true }
        ],
        activeWavelengthId: 'w1'  // Currently selected wavelength for new beams
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
 * Determine movement mode for fold-constrained lens pair
 * @param {Object} lens1 - First lens component
 * @param {Object} lens2 - Second lens component
 * @returns {string} - 'BOTH_FIXED', 'SYNCHRONIZED', or 'DYNAMIC_FOLD'
 */
function determineMovementMode(lens1, lens2) {
    const bothMovable = !lens1.isFixed && !lens2.isFixed;
    const bothFixed = lens1.isFixed && lens2.isFixed;

    if (bothFixed) return 'BOTH_FIXED';
    if (bothMovable) return 'SYNCHRONIZED';
    return 'DYNAMIC_FOLD';
}

/**
 * Recalculate movable lens position when mirror is dragged
 * Maintains path length constraint
 */
function recalculateLensPositionFromMirror(
    fixedLens, movableLens, mirrorPosition,
    foldCount, targetPathLength,
    mirrorIds, draggedMirrorId, components
) {
    if (foldCount === 1) {
        // 1 fold: fixedLens → mirror → movableLens
        // Calculate distance from fixed lens to mirror
        const dx1 = mirrorPosition.x - fixedLens.position.x;
        const dy1 = mirrorPosition.y - fixedLens.position.y;
        const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

        // Remaining distance for second segment
        const dist2 = targetPathLength - dist1;

        if (dist2 < 0) {
            // Path length too short
            return null;
        }

        // Calculate direction from mirror (90° turn from incoming beam)
        const incomingAngle = Math.atan2(dy1, dx1);
        const outgoingAngle = incomingAngle + Math.PI / 2; // 90° turn

        // Calculate lens position
        const lensPos = {
            x: mirrorPosition.x + dist2 * Math.cos(outgoingAngle),
            y: mirrorPosition.y + dist2 * Math.sin(outgoingAngle)
        };

        return {
            lensPosition: lensPos,
            otherMirrorPositions: null
        };
    } else if (foldCount === 2) {
        // 2 folds: fixedLens → mirror1 → mirror2 → movableLens
        // This is more complex - need to maintain Z-shape
        // For simplicity, maintain equal segment lengths

        const segmentLength = targetPathLength / 3;

        // Find which mirror was dragged
        const mirror1Id = mirrorIds[0];
        const mirror2Id = mirrorIds[1];
        const mirror1 = components.get(mirror1Id);
        const mirror2 = components.get(mirror2Id);

        if (draggedMirrorId === mirror1Id) {
            // Dragged first mirror
            // Calculate direction from fixed lens to mirror1
            const dx1 = mirrorPosition.x - fixedLens.position.x;
            const dy1 = mirrorPosition.y - fixedLens.position.y;
            const angle1 = Math.atan2(dy1, dx1);

            // Second segment perpendicular
            const angle2 = angle1 + Math.PI / 2;
            const mirror2Pos = {
                x: mirrorPosition.x + segmentLength * Math.cos(angle2),
                y: mirrorPosition.y + segmentLength * Math.sin(angle2)
            };

            // Third segment parallel to first
            const lensPos = {
                x: mirror2Pos.x + segmentLength * Math.cos(angle1),
                y: mirror2Pos.y + segmentLength * Math.sin(angle1)
            };

            return {
                lensPosition: lensPos,
                otherMirrorPositions: new Map([[mirror2Id, mirror2Pos]])
            };
        } else if (draggedMirrorId === mirror2Id) {
            // Dragged second mirror
            // Work backwards from movable lens
            const dx3 = mirrorPosition.x - fixedLens.position.x;
            const dy3 = mirrorPosition.y - fixedLens.position.y;
            const angle1 = Math.atan2(dy3, dx3);

            // Calculate lens position (parallel to first segment)
            const lensPos = {
                x: mirrorPosition.x + segmentLength * Math.cos(angle1),
                y: mirrorPosition.y + segmentLength * Math.sin(angle1)
            };

            // First mirror stays where it is (for now - simplified)
            return {
                lensPosition: lensPos,
                otherMirrorPositions: null
            };
        }
    }

    return null;
}

/**
 * Calculate mirror positions given both lens positions (for drag operations)
 * Maintains target path length by repositioning mirrors
 * @param {Object} fixedLens - Fixed lens component
 * @param {Object} movableLens - Movable lens component at new position
 * @param {number} foldCount - Number of folds (1 or 2)
 * @param {number} targetPathLength - Target path length to maintain
 * @param {Array} mirrorIds - Array of mirror IDs
 * @param {Map} components - Components map
 * @returns {Object|null} { mirrorPositions: [{id, position, angle}], valid: boolean, error: string }
 */
function recalculateMirrorPositionsFromLens(
    fixedLens, movableLens, foldCount, targetPathLength, mirrorIds, components
) {
    const dx = movableLens.position.x - fixedLens.position.x;
    const dy = movableLens.position.y - fixedLens.position.y;
    const isHorizontalMajor = Math.abs(dx) > Math.abs(dy);

    if (foldCount === 1) {
        // 1 fold: L-shaped path
        // Mirror at corner connecting fixed and movable lenses

        let mirrorPos, mirrorAngle;

        if (isHorizontalMajor) {
            // Horizontal then vertical L
            mirrorPos = {
                x: movableLens.position.x,  // Corner at movable's X
                y: fixedLens.position.y      // and fixed's Y
            };

            // Calculate actual path length
            const dist1 = Math.abs(movableLens.position.x - fixedLens.position.x);
            const dist2 = Math.abs(movableLens.position.y - fixedLens.position.y);
            const actualLength = dist1 + dist2;

            // Check if path length matches (within tolerance)
            const tolerance = Math.max(targetPathLength * 0.05, 5.0);
            if (Math.abs(actualLength - targetPathLength) > tolerance) {
                return {
                    valid: false,
                    error: `Path length ${actualLength.toFixed(1)}mm ≠ target ${targetPathLength.toFixed(1)}mm`,
                    mirrorPositions: null
                };
            }

            // Mirror angle for proper reflection
            mirrorAngle = dx > 0 ? (dy > 0 ? 45 : 315) : (dy > 0 ? 135 : 225);

        } else {
            // Vertical then horizontal L
            mirrorPos = {
                x: fixedLens.position.x,      // Corner at fixed's X
                y: movableLens.position.y     // and movable's Y
            };

            // Calculate actual path length
            const dist1 = Math.abs(movableLens.position.y - fixedLens.position.y);
            const dist2 = Math.abs(movableLens.position.x - fixedLens.position.x);
            const actualLength = dist1 + dist2;

            // Check if path length matches (within tolerance)
            const tolerance = Math.max(targetPathLength * 0.05, 5.0);
            if (Math.abs(actualLength - targetPathLength) > tolerance) {
                return {
                    valid: false,
                    error: `Path length ${actualLength.toFixed(1)}mm ≠ target ${targetPathLength.toFixed(1)}mm`,
                    mirrorPositions: null
                };
            }

            // Mirror angle for proper reflection
            mirrorAngle = dy > 0 ? (dx > 0 ? 45 : 135) : (dx > 0 ? 315 : 225);
        }

        return {
            valid: true,
            error: null,
            mirrorPositions: [{
                id: mirrorIds[0],
                position: mirrorPos,
                angle: mirrorAngle
            }]
        };

    } else if (foldCount === 2) {
        // 2 folds: U-shaped path
        // More complex - need to solve for mirror positions

        const segmentLength = targetPathLength / 3;
        let mirror1Pos, mirror2Pos, mirror1Angle, mirror2Angle;

        if (isHorizontalMajor) {
            // Horizontal U-shape
            // Check if geometry is possible
            const requiredHorizontalSpan = 2 * segmentLength; // out and back
            const actualHorizontalSpan = Math.abs(dx);

            if (actualHorizontalSpan > requiredHorizontalSpan) {
                return {
                    valid: false,
                    error: `Horizontal span ${actualHorizontalSpan.toFixed(1)}mm too large for U-shape`,
                    mirrorPositions: null
                };
            }

            // Mirror 1: segmentLength away from fixed lens horizontally
            mirror1Pos = {
                x: fixedLens.position.x + (dx > 0 ? segmentLength : -segmentLength),
                y: fixedLens.position.y
            };

            // Mirror 2: segmentLength away vertically from mirror 1
            const verticalDir = dy > 0 ? 1 : -1;
            mirror2Pos = {
                x: mirror1Pos.x,
                y: mirror1Pos.y + verticalDir * segmentLength
            };

            // Verify target position matches expected U-shape end
            const expectedTargetX = mirror2Pos.x + (dx > 0 ? -segmentLength : segmentLength);
            const expectedTargetY = mirror2Pos.y;

            const targetDistX = Math.abs(movableLens.position.x - expectedTargetX);
            const targetDistY = Math.abs(movableLens.position.y - expectedTargetY);
            const targetDist = Math.sqrt(targetDistX * targetDistX + targetDistY * targetDistY);

            if (targetDist > 10.0) { // 10mm tolerance
                return {
                    valid: false,
                    error: `Target position doesn't match U-shape geometry`,
                    mirrorPositions: null
                };
            }

            // Mirror angles
            mirror1Angle = dx > 0 ? (dy > 0 ? 45 : 315) : (dy > 0 ? 135 : 225);
            mirror2Angle = dx > 0 ? (dy > 0 ? 135 : 225) : (dy > 0 ? 45 : 315);

        } else {
            // Vertical U-shape
            const requiredVerticalSpan = 2 * segmentLength;
            const actualVerticalSpan = Math.abs(dy);

            if (actualVerticalSpan > requiredVerticalSpan) {
                return {
                    valid: false,
                    error: `Vertical span ${actualVerticalSpan.toFixed(1)}mm too large for U-shape`,
                    mirrorPositions: null
                };
            }

            // Mirror 1: segmentLength away vertically
            mirror1Pos = {
                x: fixedLens.position.x,
                y: fixedLens.position.y + (dy > 0 ? segmentLength : -segmentLength)
            };

            // Mirror 2: segmentLength away horizontally
            const horizontalDir = dx > 0 ? 1 : -1;
            mirror2Pos = {
                x: mirror1Pos.x + horizontalDir * segmentLength,
                y: mirror1Pos.y
            };

            // Verify target position
            const expectedTargetX = mirror2Pos.x;
            const expectedTargetY = mirror2Pos.y + (dy > 0 ? -segmentLength : segmentLength);

            const targetDistX = Math.abs(movableLens.position.x - expectedTargetX);
            const targetDistY = Math.abs(movableLens.position.y - expectedTargetY);
            const targetDist = Math.sqrt(targetDistX * targetDistX + targetDistY * targetDistY);

            if (targetDist > 10.0) {
                return {
                    valid: false,
                    error: `Target position doesn't match U-shape geometry`,
                    mirrorPositions: null
                };
            }

            // Mirror angles
            mirror1Angle = dy > 0 ? (dx > 0 ? 45 : 135) : (dx > 0 ? 315 : 225);
            mirror2Angle = dy > 0 ? (dx > 0 ? 315 : 225) : (dx > 0 ? 45 : 135);
        }

        return {
            valid: true,
            error: null,
            mirrorPositions: [
                { id: mirrorIds[0], position: mirror1Pos, angle: mirror1Angle },
                { id: mirrorIds[1], position: mirror2Pos, angle: mirror2Angle }
            ]
        };
    }

    return null;
}

/**
 * Validate path length constraints before a component move
 * @param {string} componentId - ID of component being moved
 * @param {object} newPosition - Proposed new position {x, y}
 * @param {object} newAngle - Proposed new angle (optional, for rotations)
 * @param {object} state - Current state
 * @returns {object} { valid: boolean, error: string|null, violatedConstraints: array }
 */
function validatePathLengthConstraints(componentId, newPosition, newAngle, state) {
    const component = state.components.get(componentId);
    if (!component) {
        return { valid: true, error: null, violatedConstraints: [] };
    }

    const violatedConstraints = [];

    // Create temporary component with new position/angle for validation
    const tempComponent = new Component(component.toJSON());
    if (newPosition) tempComponent.update({ position: newPosition });
    if (newAngle !== undefined && newAngle !== null) tempComponent.update({ angle: newAngle });

    // Create temporary components map with the updated component
    const tempComponents = new Map(state.components);
    tempComponents.set(componentId, tempComponent);

    // Temporarily update beamPath to recalculate segment lengths
    const tempBeamPath = new BeamPath();
    tempBeamPath.segments = new Map(state.beamPath.segments);
    tempBeamPath.outgoing = new Map(state.beamPath.outgoing);
    tempBeamPath.incoming = new Map(state.beamPath.incoming);
    tempBeamPath.recalculatePathLengths(tempComponents);

    // Check constraints FROM this component TO other components
    if (component.pathLengthConstraints && component.pathLengthConstraints.length > 0) {
        for (const constraint of component.pathLengthConstraints) {
            const targetComponent = state.components.get(constraint.targetComponentId);
            if (!targetComponent) continue;

            // Calculate new path length with temporary position
            const newPathLength = tempBeamPath.calculatePathLengthBetween(
                componentId,
                constraint.targetComponentId
            );

            if (newPathLength === null) {
                // No beam path exists - constraint is inactive, don't block
                continue;
            }

            const tolerance = constraint.tolerance || BeamPhysics.PATH_LENGTH_TOLERANCE;
            const deviation = Math.abs(newPathLength - constraint.targetPathLength);

            if (deviation > tolerance) {
                violatedConstraints.push({
                    sourceId: componentId,
                    targetId: constraint.targetComponentId,
                    targetName: targetComponent.name,
                    currentLength: newPathLength,
                    targetLength: constraint.targetPathLength,
                    deviation: deviation
                });
            }
        }
    }

    // Check constraints FROM other components TO this component
    for (const [otherId, otherComp] of state.components) {
        if (otherId === componentId) continue;
        if (!otherComp.pathLengthConstraints || otherComp.pathLengthConstraints.length === 0) continue;

        for (const constraint of otherComp.pathLengthConstraints) {
            if (constraint.targetComponentId !== componentId) continue;

            // Calculate new path length
            const newPathLength = tempBeamPath.calculatePathLengthBetween(
                otherId,
                componentId
            );

            if (newPathLength === null) {
                // No beam path exists - constraint is inactive, don't block
                continue;
            }

            const tolerance = constraint.tolerance || BeamPhysics.PATH_LENGTH_TOLERANCE;
            const deviation = Math.abs(newPathLength - constraint.targetPathLength);

            if (deviation > tolerance) {
                violatedConstraints.push({
                    sourceId: otherId,
                    targetId: componentId,
                    targetName: otherComp.name,
                    currentLength: newPathLength,
                    targetLength: constraint.targetPathLength,
                    deviation: deviation
                });
            }
        }
    }

    if (violatedConstraints.length > 0) {
        const firstViolation = violatedConstraints[0];
        const error = `Movement blocked: Would violate path length constraint with ${firstViolation.targetName}\n` +
                     `Current: ${firstViolation.currentLength.toFixed(1)} mm, Target: ${firstViolation.targetLength.toFixed(1)} mm ` +
                     `(Deviation: ${firstViolation.deviation.toFixed(1)} mm)`;

        return { valid: false, error, violatedConstraints };
    }

    return { valid: true, error: null, violatedConstraints: [] };
}

/**
 * Recalculate geometry for beam segments originating from a component
 * This updates segments that have explicit endpoints (go to workspace boundary)
 * when the source component moves or rotates
 */
function recalculateBeamSegmentsFromComponent(componentId, component, beamPath, workspace, components) {
    const segments = beamPath.getOutgoingSegments(componentId);
    if (!segments || segments.length === 0) return beamPath;

    // Create new BeamPath by cloning
    const newBeamPath = new BeamPath();
    newBeamPath.segments = new Map(beamPath.segments);
    newBeamPath.outgoing = new Map(beamPath.outgoing);
    newBeamPath.incoming = new Map(beamPath.incoming);

    segments.forEach(segment => {
        // Only recalculate segments that go to workspace boundary (no targetId)
        if (segment.targetId) return;

        // Find incoming beam angle (if this component receives a beam)
        let incomingAngle = null;
        const incomingSegments = beamPath.getIncomingSegments(componentId);
        if (incomingSegments && incomingSegments.length > 0) {
            const incomingSeg = incomingSegments[0];
            const sourceComp = components.get(incomingSeg.sourceId);
            if (sourceComp) {
                incomingAngle = BeamPhysics.calculateBeamAngle(sourceComp.position, component.position);
            }
        }

        // Calculate new output angle
        const outputAngle = BeamPhysics.getOutputDirection(component, incomingAngle, segment.sourcePort);
        if (outputAngle === null) return;

        // Calculate new endpoint at workspace boundary
        const boundaryPoint = findWorkspaceBoundaryIntersection(
            component.position,
            outputAngle,
            workspace
        );

        // Update segment with new geometry
        const segmentData = segment.toJSON();
        segmentData.endPoint = boundaryPoint;
        segmentData.direction = BeamPhysics.angleToVector(outputAngle);
        segmentData.directionAngle = outputAngle;

        const updatedSegment = BeamSegment.fromJSON(segmentData);
        newBeamPath.segments.set(segment.id, updatedSegment);
    });

    return newBeamPath;
}

/**
 * Find where a beam intersects the workspace boundary
 */
function findWorkspaceBoundaryIntersection(start, angle, workspace) {
    const dir = BeamPhysics.angleToVector(angle);
    const halfW = workspace.width / 2;
    const halfH = workspace.height / 2;

    // Workspace boundaries
    const boundaries = [
        { x1: -halfW, y1: -halfH, x2: halfW, y2: -halfH },  // Top
        { x1: halfW, y1: -halfH, x2: halfW, y2: halfH },    // Right
        { x1: halfW, y1: halfH, x2: -halfW, y2: halfH },    // Bottom
        { x1: -halfW, y1: halfH, x2: -halfW, y2: -halfH }   // Left
    ];

    let closestPoint = null;
    let closestDist = Infinity;

    boundaries.forEach(boundary => {
        const intersection = lineIntersection(
            start.x, start.y,
            start.x + dir.x * 10000, start.y + dir.y * 10000,
            boundary.x1, boundary.y1, boundary.x2, boundary.y2
        );

        if (intersection) {
            const dist = Math.hypot(intersection.x - start.x, intersection.y - start.y);
            if (dist > 1 && dist < closestDist) {  // Must be at least 1mm away
                closestDist = dist;
                closestPoint = intersection;
            }
        }
    });

    return closestPoint || { x: start.x + dir.x * 1000, y: start.y + dir.y * 1000 };
}

/**
 * Calculate line intersection point
 */
function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }

    return null;
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

            // Validate path length constraints if position or angle is changing
            if (updates.position !== undefined || updates.angle !== undefined) {
                const validation = validatePathLengthConstraints(
                    componentId,
                    updates.position || component.position,
                    updates.angle !== undefined ? updates.angle : component.angle,
                    state
                );
                if (!validation.valid) {
                    console.warn('Update blocked by path length constraint:', validation.error);
                    newState.lastValidationError = validation.error;
                    return newState;
                }
            }

            newState.components = new Map(state.components);
            const updatedComponent = new Component(component.toJSON());
            updatedComponent.update(updates);
            newState.components.set(componentId, updatedComponent);

            // Recalculate beam geometry if position or angle changed
            if (updates.position !== undefined || updates.angle !== undefined) {
                newState.beamPath = recalculateBeamSegmentsFromComponent(
                    componentId,
                    updatedComponent,
                    state.beamPath,
                    state.constraints.workspace,
                    newState.components
                );
            }

            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.MOVE_COMPONENT: {
            const { componentId, position, skipConstraints } = action;
            const component = state.components.get(componentId);
            if (!component) return state;

            // NEW: Check for foldable constraints (manual fold system)
            if (!skipConstraints) {
                // Check if this component is a lens with foldable constraints
                const foldableConstraints = component.pathLengthConstraints?.filter(c => c.mode === 'foldable') || [];

                if (foldableConstraints.length > 0 && component.type === 'lens') {
                    // Lens with fold constraints - handle synchronized movement
                    for (const constraint of foldableConstraints) {
                        const partner = state.components.get(constraint.targetComponentId);
                        if (!partner) continue;

                        // Check if both are movable or both are fixed
                        if (component.isFixed && partner.isFixed) {
                            // Both fixed - block movement
                            newState.lastValidationError = 'Both lenses are fixed';
                            return newState;
                        }

                        if (!component.isFixed && !partner.isFixed) {
                            // Both movable - synchronized movement
                            const delta = {
                                x: position.x - component.position.x,
                                y: position.y - component.position.y
                            };

                            if (newState.components === state.components) {
                                newState.components = new Map(state.components);
                            }

                            // Move both lenses
                            const movedPrimary = new Component(component.toJSON());
                            movedPrimary.update({ position });
                            newState.components.set(componentId, movedPrimary);

                            const movedPartner = new Component(partner.toJSON());
                            movedPartner.update({
                                position: {
                                    x: partner.position.x + delta.x,
                                    y: partner.position.y + delta.y
                                }
                            });
                            newState.components.set(constraint.targetComponentId, movedPartner);

                            // Move all mirrors by same delta
                            (constraint.mirrorIds || []).forEach(mirrorId => {
                                const mirror = state.components.get(mirrorId);
                                if (mirror) {
                                    const movedMirror = new Component(mirror.toJSON());
                                    movedMirror.update({
                                        position: {
                                            x: mirror.position.x + delta.x,
                                            y: mirror.position.y + delta.y
                                        }
                                    });
                                    newState.components.set(mirrorId, movedMirror);
                                }
                            });

                            // Recalculate beam geometry
                            newState.beamPath = recalculateBeamSegmentsFromComponent(
                                componentId, movedPrimary, state.beamPath,
                                state.constraints.workspace, newState.components
                            );
                            newState.beamPath = recalculateBeamSegmentsFromComponent(
                                constraint.targetComponentId, movedPartner, newState.beamPath,
                                state.constraints.workspace, newState.components
                            );

                            newState.document = { ...state.document, isDirty: true };
                            return newState;
                        }

                        // One fixed, one movable - recalculate mirror positions to maintain path length
                        const fixedLens = component.isFixed ? component : partner;
                        const movableLens = component.isFixed ? partner : component;
                        const newMovablePosition = component.isFixed ? partner.position : position;

                        // Create temp movable lens at new position for calculation
                        const tempMovable = new Component(movableLens.toJSON());
                        tempMovable.update({ position: newMovablePosition });

                        // Calculate new mirror positions
                        const mirrorResult = recalculateMirrorPositionsFromLens(
                            fixedLens,
                            tempMovable,
                            constraint.foldCount,
                            constraint.targetPathLength,
                            constraint.mirrorIds || [],
                            state.components
                        );

                        if (!mirrorResult || !mirrorResult.valid) {
                            // Cannot maintain path length - block movement
                            newState.lastValidationError = mirrorResult?.error || 'Cannot maintain path length';
                            return newState;
                        }

                        // Valid - update movable lens and mirrors
                        if (newState.components === state.components) {
                            newState.components = new Map(state.components);
                        }

                        const movedLens = new Component(component.toJSON());
                        movedLens.update({ position });
                        newState.components.set(componentId, movedLens);

                        // Update all mirrors
                        mirrorResult.mirrorPositions.forEach(mirrorUpdate => {
                            const mirror = state.components.get(mirrorUpdate.id);
                            if (mirror) {
                                const movedMirror = new Component(mirror.toJSON());
                                movedMirror.update({
                                    position: mirrorUpdate.position,
                                    angle: mirrorUpdate.angle
                                });
                                newState.components.set(mirrorUpdate.id, movedMirror);
                            }
                        });

                        // Recalculate beam geometry
                        newState.beamPath = recalculateBeamSegmentsFromComponent(
                            componentId, movedLens, state.beamPath,
                            state.constraints.workspace, newState.components
                        );

                        // Also recalculate from all mirrors
                        (constraint.mirrorIds || []).forEach(mirrorId => {
                            const mirror = newState.components.get(mirrorId);
                            if (mirror) {
                                newState.beamPath = recalculateBeamSegmentsFromComponent(
                                    mirrorId, mirror, newState.beamPath,
                                    state.constraints.workspace, newState.components
                                );
                            }
                        });

                        newState.document = { ...state.document, isDirty: true };
                        return newState; // Exit early, don't fall through to old validation
                    }
                }

                // Check if this component is a mirror belonging to a fold constraint
                if (component.type === 'mirror') {
                    // Find if this mirror belongs to any fold constraint
                    let constraintInfo = null;

                    state.components.forEach((comp, id) => {
                        const constraints = comp.pathLengthConstraints?.filter(c => c.mode === 'foldable') || [];
                        constraints.forEach(constraint => {
                            if (constraint.mirrorIds?.includes(componentId)) {
                                constraintInfo = {
                                    source: comp,
                                    sourceId: id,
                                    target: state.components.get(constraint.targetComponentId),
                                    targetId: constraint.targetComponentId,
                                    constraint: constraint
                                };
                            }
                        });
                    });

                    if (constraintInfo) {
                        const { source, sourceId, target, targetId, constraint } = constraintInfo;

                        // Find which lens is movable
                        const fixedLens = source.isFixed ? source : target.isFixed ? target : null;
                        const movableLens = !source.isFixed ? source : !target.isFixed ? target : null;
                        const movableLensId = !source.isFixed ? sourceId : !target.isFixed ? targetId : null;

                        if (fixedLens && movableLens && movableLensId) {
                            // Recalculate movable lens position to maintain path length
                            const result = recalculateLensPositionFromMirror(
                                fixedLens, movableLens, position,
                                constraint.foldCount, constraint.targetPathLength,
                                constraint.mirrorIds, componentId, state.components
                            );

                            if (result) {
                                if (newState.components === state.components) {
                                    newState.components = new Map(state.components);
                                }

                                // Move mirror
                                const movedMirror = new Component(component.toJSON());
                                movedMirror.update({ position });
                                newState.components.set(componentId, movedMirror);

                                // Move movable lens
                                const movedLens = new Component(movableLens.toJSON());
                                movedLens.update({ position: result.lensPosition });
                                newState.components.set(movableLensId, movedLens);

                                // Update other mirrors if needed
                                if (result.otherMirrorPositions) {
                                    result.otherMirrorPositions.forEach((pos, mirrorId) => {
                                        const otherMirror = state.components.get(mirrorId);
                                        if (otherMirror && mirrorId !== componentId) {
                                            const movedOtherMirror = new Component(otherMirror.toJSON());
                                            movedOtherMirror.update({ position: pos });
                                            newState.components.set(mirrorId, movedOtherMirror);
                                        }
                                    });
                                }

                                // Recalculate beam geometry
                                newState.beamPath = recalculateBeamSegmentsFromComponent(
                                    movableLensId, movedLens, state.beamPath,
                                    state.constraints.workspace, newState.components
                                );

                                newState.document = { ...state.document, isDirty: true };
                                return newState;
                            }
                        }
                    }
                }
            }

            // Check for fold-based constraints (auto mode - OLD SYSTEM)
            if (!skipConstraints && component.pathLengthConstraints) {
                const foldConstraints = component.pathLengthConstraints.filter(c => c.foldMode === 'auto');

                for (const constraint of foldConstraints) {
                    const target = state.components.get(constraint.targetComponentId);
                    if (!target) continue;

                    const mode = determineMovementMode(component, target);

                    if (mode === 'BOTH_FIXED') {
                        // Both components are fixed, block movement
                        newState.lastValidationError = 'Both components in fold constraint are fixed';
                        return newState;
                    }

                    if (mode === 'SYNCHRONIZED') {
                        // Move both lenses by same delta
                        const delta = {
                            x: position.x - component.position.x,
                            y: position.y - component.position.y
                        };

                        // Create new components map if not already done
                        if (newState.components === state.components) {
                            newState.components = new Map(state.components);
                        }

                        // Move primary component
                        const movedPrimary = new Component(component.toJSON());
                        movedPrimary.update({ position });
                        newState.components.set(componentId, movedPrimary);

                        // Move target component by same delta
                        const newTargetPos = {
                            x: target.position.x + delta.x,
                            y: target.position.y + delta.y
                        };
                        const movedTarget = new Component(target.toJSON());
                        movedTarget.update({ position: newTargetPos });
                        newState.components.set(constraint.targetComponentId, movedTarget);

                        // Recalculate beam geometry for both components
                        newState.beamPath = recalculateBeamSegmentsFromComponent(
                            componentId,
                            movedPrimary,
                            state.beamPath,
                            state.constraints.workspace,
                            newState.components
                        );
                        newState.beamPath = recalculateBeamSegmentsFromComponent(
                            constraint.targetComponentId,
                            movedTarget,
                            newState.beamPath,
                            state.constraints.workspace,
                            newState.components
                        );

                        newState.document = { ...state.document, isDirty: true };
                        return newState; // Movement handled, exit early
                    }

                    if (mode === 'DYNAMIC_FOLD') {
                        // Validate fold geometry for new position
                        const tempComponent = new Component(component.toJSON());
                        tempComponent.update({ position });

                        const geometry = FoldGeometry.calculate(
                            tempComponent,
                            target,
                            constraint.targetPathLength
                        );

                        if (!geometry.valid) {
                            // Block movement, geometry is invalid
                            newState.lastValidationError = `Fold geometry invalid: ${geometry.error}`;
                            return newState;
                        }
                        // Geometry is valid, allow movement to proceed
                    }
                }
            }

            // Validate path length constraints before moving (unless skipConstraints is true)
            if (!skipConstraints) {
                const validation = validatePathLengthConstraints(componentId, position, null, state);
                if (!validation.valid) {
                    console.warn('Movement blocked by path length constraint:', validation.error);
                    // Store validation error in state for UI feedback
                    newState.lastValidationError = validation.error;
                    return newState;
                }
            }

            newState.components = new Map(state.components);
            const movedComponent = new Component(component.toJSON());
            movedComponent.update({ position });
            newState.components.set(componentId, movedComponent);

            // Apply alignment constraints (move constrained components too)
            // Skip if this move was triggered by a constraint (to avoid infinite loops)
            if (!skipConstraints && movedComponent.alignmentConstraints && movedComponent.alignmentConstraints.length > 0) {
                const deltaX = position.x - component.position.x;
                const deltaY = position.y - component.position.y;

                movedComponent.alignmentConstraints.forEach(constraint => {
                    const constrainedComponent = newState.components.get(constraint.componentId);
                    if (!constrainedComponent) return;

                    let newConstrainedPos = { ...constrainedComponent.position };

                    if (constraint.type === 'vertical') {
                        // Vertical alignment: match X coordinate
                        newConstrainedPos.x = position.x;
                    } else if (constraint.type === 'horizontal') {
                        // Horizontal alignment: match Y coordinate
                        newConstrainedPos.y = position.y;
                    }

                    // Move the constrained component (with skipConstraints to avoid loops)
                    const updatedConstrained = new Component(constrainedComponent.toJSON());
                    updatedConstrained.update({ position: newConstrainedPos });
                    newState.components.set(constraint.componentId, updatedConstrained);

                    // Recalculate beam geometry for constrained component
                    newState.beamPath = recalculateBeamSegmentsFromComponent(
                        constraint.componentId,
                        updatedConstrained,
                        newState.beamPath,
                        state.constraints.workspace,
                        newState.components
                    );
                });
            }

            // Recalculate beam geometry after move
            newState.beamPath = recalculateBeamSegmentsFromComponent(
                componentId,
                movedComponent,
                newState.beamPath,
                state.constraints.workspace,
                newState.components
            );

            newState.document = { ...state.document, isDirty: true };
            break;
        }

        case ActionType.DELETE_COMPONENT: {
            const { componentId } = action;
            if (!state.components.has(componentId)) return state;

            newState.components = new Map(state.components);
            newState.components.delete(componentId);

            // Remove alignment constraints that reference this component from all other components
            newState.components.forEach((component, id) => {
                let needsUpdate = false;
                const updatedComponent = new Component(component.toJSON());

                if (component.alignmentConstraints && component.alignmentConstraints.length > 0) {
                    const filteredConstraints = component.alignmentConstraints.filter(c => c.componentId !== componentId);
                    if (filteredConstraints.length !== component.alignmentConstraints.length) {
                        updatedComponent.alignmentConstraints = filteredConstraints;
                        needsUpdate = true;
                    }
                }

                // Remove path length constraints that reference this component
                if (component.pathLengthConstraints && component.pathLengthConstraints.length > 0) {
                    const filteredPathConstraints = component.pathLengthConstraints.filter(
                        c => c.targetComponentId !== componentId
                    );
                    if (filteredPathConstraints.length !== component.pathLengthConstraints.length) {
                        updatedComponent.pathLengthConstraints = filteredPathConstraints;
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    newState.components.set(id, updatedComponent);
                }
            });

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

        case ActionType.ROTATE_CONSTRAINED_PAIR: {
            const { componentId, angleDelta } = action;
            const component = state.components.get(componentId);
            if (!component) return state;

            // Check for fold-based constraints
            const foldConstraints = component.pathLengthConstraints?.filter(c => c.foldMode === 'auto') || [];

            if (foldConstraints.length === 0) {
                // No fold constraints, just rotate the component normally
                newState.components = new Map(state.components);
                const rotatedComponent = new Component(component.toJSON());

                if (!rotatedComponent.isAngleFixed) {
                    rotatedComponent.update({ angle: component.angle + angleDelta });
                    newState.components.set(componentId, rotatedComponent);

                    // Recalculate beam geometry
                    newState.beamPath = recalculateBeamSegmentsFromComponent(
                        componentId,
                        rotatedComponent,
                        state.beamPath,
                        state.constraints.workspace,
                        newState.components
                    );

                    newState.document = { ...state.document, isDirty: true };
                }
                break;
            }

            // Rotate component and all fold-constrained partners by same angle
            newState.components = new Map(state.components);
            const componentsToRotate = new Set([componentId]);

            // Collect all fold-constrained partners
            foldConstraints.forEach(constraint => {
                componentsToRotate.add(constraint.targetComponentId);
            });

            // Rotate all components in the set
            componentsToRotate.forEach(id => {
                const comp = state.components.get(id);
                if (!comp || comp.isAngleFixed) return;

                const rotatedComp = new Component(comp.toJSON());
                rotatedComp.update({ angle: comp.angle + angleDelta });
                newState.components.set(id, rotatedComp);

                // Recalculate beam geometry for this component
                newState.beamPath = recalculateBeamSegmentsFromComponent(
                    id,
                    rotatedComp,
                    newState.beamPath,
                    state.constraints.workspace,
                    newState.components
                );
            });

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

        case ActionType.SELECT_SEGMENT: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: action.segmentId ? 'segment' : null,
                    selectedIds: [],
                    selectedZoneId: null,
                    selectedSegmentIds: action.segmentId ? [action.segmentId] : []
                }
            };
            break;
        }

        case ActionType.SELECT_MULTIPLE_SEGMENTS: {
            newState.ui = {
                ...state.ui,
                selection: {
                    ...state.ui.selection,
                    type: action.segmentIds.length > 0 ? 'segment' : null,
                    selectedIds: [],
                    selectedZoneId: null,
                    selectedSegmentIds: action.segmentIds
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
                    selectedZoneId: null,
                    selectedSegmentIds: []
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

        case ActionType.TOGGLE_LABELS: {
            newState.ui = {
                ...state.ui,
                labelsVisible: !state.ui.labelsVisible
            };
            break;
        }

        case ActionType.TOGGLE_AUTO_PROPAGATE: {
            newState.ui = {
                ...state.ui,
                autoPropagate: !state.ui.autoPropagate
            };
            break;
        }

        // ===== Grid Actions =====
        case ActionType.SET_GRID_SETTINGS: {
            newState.grid = {
                ...state.grid,
                ...action.settings
            };
            break;
        }

        // ===== Background Actions =====
        case ActionType.SET_BACKGROUND: {
            newState.background = {
                ...state.background,
                ...action.background
            };
            break;
        }

        // ===== Wavelength Actions =====
        case ActionType.ADD_WAVELENGTH: {
            const newId = 'w' + Date.now();
            newState.wavelengths = [
                ...state.wavelengths,
                { id: newId, name: action.name, color: action.color, isPreset: false }
            ];
            break;
        }

        case ActionType.UPDATE_WAVELENGTH: {
            newState.wavelengths = state.wavelengths.map(w =>
                w.id === action.id ? { ...w, ...action.updates } : w
            );
            break;
        }

        case ActionType.DELETE_WAVELENGTH: {
            newState.wavelengths = state.wavelengths.filter(w => w.id !== action.id);
            // If active wavelength was deleted, switch to first one
            if (state.activeWavelengthId === action.id && newState.wavelengths.length > 0) {
                newState.activeWavelengthId = newState.wavelengths[0].id;
            }
            break;
        }

        case ActionType.SET_ACTIVE_WAVELENGTH: {
            newState.activeWavelengthId = action.id;
            break;
        }

        case ActionType.UPDATE_SEGMENT_WAVELENGTHS: {
            // Update wavelengths for a beam segment
            const segment = state.beamPath.segments.get(action.segmentId);
            if (segment) {
                segment.wavelengthIds = action.wavelengthIds;
                newState.beamPath = state.beamPath; // Trigger re-render
            }
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

        case ActionType.UPDATE_DOCUMENT_NAME: {
            newState.document = {
                ...state.document,
                name: action.name,
                isDirty: true
            };
            break;
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
    rotateConstrainedPair: (componentId, angleDelta) => ({ type: ActionType.ROTATE_CONSTRAINED_PAIR, componentId, angleDelta }),

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
    selectSegment: (segmentId) => ({ type: ActionType.SELECT_SEGMENT, segmentId }),
    selectMultipleSegments: (segmentIds) => ({ type: ActionType.SELECT_MULTIPLE_SEGMENTS, segmentIds }),
    clearSelection: () => ({ type: ActionType.CLEAR_SELECTION }),

    setTool: (tool) => ({ type: ActionType.SET_TOOL, tool }),
    setViewport: (viewport) => ({ type: ActionType.SET_VIEWPORT, viewport }),
    setWorkspaceSize: (width, height) => ({ type: ActionType.SET_WORKSPACE_SIZE, width, height }),
    toggleLabels: () => ({ type: ActionType.TOGGLE_LABELS }),
    toggleAutoPropagate: () => ({ type: ActionType.TOGGLE_AUTO_PROPAGATE }),
    setGridSettings: (settings) => ({ type: ActionType.SET_GRID_SETTINGS, settings }),
    setBackground: (background) => ({ type: ActionType.SET_BACKGROUND, background }),

    addWavelength: (name, color) => ({ type: ActionType.ADD_WAVELENGTH, name, color }),
    updateWavelength: (id, updates) => ({ type: ActionType.UPDATE_WAVELENGTH, id, updates }),
    deleteWavelength: (id) => ({ type: ActionType.DELETE_WAVELENGTH, id }),
    setActiveWavelength: (id) => ({ type: ActionType.SET_ACTIVE_WAVELENGTH, id }),
    updateSegmentWavelengths: (segmentId, wavelengthIds) => ({ type: ActionType.UPDATE_SEGMENT_WAVELENGTHS, segmentId, wavelengthIds }),

    newDocument: () => ({ type: ActionType.NEW_DOCUMENT }),
    loadDocument: (state) => ({ type: ActionType.LOAD_DOCUMENT, state }),
    updateDocumentName: (name) => ({ type: ActionType.UPDATE_DOCUMENT_NAME, name }),
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
