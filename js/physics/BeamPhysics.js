/**
 * BeamPhysics.js - Core physics calculations for laser beam path constraints
 *
 * Handles:
 * - Direction vectors for beam paths
 * - Reflection calculations for mirrors and beam splitters
 * - Validation of connections between components
 * - Angle constraints per component type
 */

import { ComponentType } from '../models/Component.js';

/**
 * Cardinal directions for beam paths (horizontal/vertical only)
 */
export const CARDINAL_DIRECTIONS = {
    RIGHT: { x: 1, y: 0, angle: 0 },
    DOWN: { x: 0, y: 1, angle: 90 },
    LEFT: { x: -1, y: 0, angle: 180 },
    UP: { x: 0, y: -1, angle: 270 }
};

/**
 * Valid cardinal angles for beam paths
 */
export const CARDINAL_ANGLES = [0, 90, 180, 270];

/**
 * Valid angles per component type
 * - Mirrors: 45 or 135 degrees (reflects beam by 90 degrees)
 * - Transmission components: 0, 90, 180, 270 (beam passes straight through)
 * - Sources: 0, 90, 180, 270 (emits in cardinal direction)
 * - Detectors: Any (accepts beam from any direction)
 */
export const VALID_ANGLES_BY_TYPE = {
    [ComponentType.SOURCE]: [0, 90, 180, 270],
    [ComponentType.MIRROR]: [45, 135],
    [ComponentType.BEAM_SPLITTER]: [45, 135],  // Default, can be overridden for shallow angle
    [ComponentType.LENS]: [0, 90, 180, 270],
    [ComponentType.WAVEPLATE]: [0, 90, 180, 270],
    [ComponentType.FILTER]: [0, 90, 180, 270],
    [ComponentType.DETECTOR]: [0, 45, 90, 135, 180, 225, 270, 315]  // Accepts any
};

/**
 * Angular tolerance for beam alignment validation (degrees)
 */
export const ANGLE_TOLERANCE = 5;

/**
 * Normalize an angle to 0-360 range
 */
export function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

/**
 * Normalize an angle difference to -180..180 range
 * This represents the shortest angular distance between two angles
 */
export function normalizeAngleDiff(angle) {
    angle = angle % 360;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    return angle;
}

/**
 * Convert degrees to radians
 */
export function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function radToDeg(radians) {
    return (radians * 180) / Math.PI;
}

/**
 * Normalize a direction vector to unit length
 */
export function normalizeVector(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}

/**
 * Calculate angle of a direction vector (in degrees, 0-360)
 */
export function vectorToAngle(v) {
    const angle = radToDeg(Math.atan2(v.y, v.x));
    return normalizeAngle(angle);
}

/**
 * Convert angle (degrees) to direction vector
 */
export function angleToVector(angleDeg) {
    const rad = degToRad(angleDeg);
    return { x: Math.cos(rad), y: Math.sin(rad) };
}

/**
 * Calculate angle between two vectors (in degrees)
 */
export function angleBetweenVectors(v1, v2) {
    const n1 = normalizeVector(v1);
    const n2 = normalizeVector(v2);
    const dot = n1.x * n2.x + n1.y * n2.y;
    // Clamp to handle floating point errors
    const clampedDot = Math.max(-1, Math.min(1, dot));
    return radToDeg(Math.acos(clampedDot));
}

/**
 * Get valid angles for a component type
 * @param {string} type - Component type
 * @param {boolean} isShallowAngle - For beam splitters, if shallow angle mode is enabled
 * @param {number} shallowAngle - Custom shallow angle value (degrees)
 * @param {boolean} allowAnyAngle - If true, return all common angles (user override)
 */
export function getValidAnglesForComponent(type, isShallowAngle = false, shallowAngle = 5, allowAnyAngle = false) {
    // If user has enabled "allow any angle", return all common angles
    if (allowAnyAngle) {
        return [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
                180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
    }

    if (type === ComponentType.BEAM_SPLITTER && isShallowAngle) {
        // Shallow angle beam splitter can have custom angles
        // Returns the shallow angle and its supplements for different orientations
        return [shallowAngle, 180 - shallowAngle, 180 + shallowAngle, 360 - shallowAngle];
    }
    return VALID_ANGLES_BY_TYPE[type] || [0, 90, 180, 270];
}

/**
 * Snap an angle to the nearest valid angle for the component type
 */
export function snapAngleToValid(angle, componentType, isShallowAngle = false, shallowAngle = 5) {
    const validAngles = getValidAnglesForComponent(componentType, isShallowAngle, shallowAngle);
    angle = normalizeAngle(angle);

    let closest = validAngles[0];
    let minDiff = Math.abs(normalizeAngle(angle - validAngles[0]));

    for (const validAngle of validAngles) {
        const diff = Math.min(
            Math.abs(normalizeAngle(angle - validAngle)),
            Math.abs(normalizeAngle(validAngle - angle))
        );
        if (diff < minDiff) {
            minDiff = diff;
            closest = validAngle;
        }
    }

    return closest;
}

/**
 * Check if an angle is valid for a component type
 */
export function isValidAngleForComponent(angle, componentType, isShallowAngle = false, shallowAngle = 5) {
    const validAngles = getValidAnglesForComponent(componentType, isShallowAngle, shallowAngle);
    angle = normalizeAngle(angle);

    for (const validAngle of validAngles) {
        if (Math.abs(normalizeAngle(angle - validAngle)) <= ANGLE_TOLERANCE) {
            return true;
        }
    }
    return false;
}

/**
 * Get the surface normal for a reflective component (mirror or beam splitter)
 * The surface runs along the component's angle, normal is perpendicular
 */
export function getSurfaceNormal(componentAngle) {
    // Surface is along the component angle
    // Normal is perpendicular (90 degrees rotated)
    const normalAngle = normalizeAngle(componentAngle + 90);
    return angleToVector(normalAngle);
}

/**
 * Calculate the reflection direction for a beam hitting a surface
 * Uses the reflection formula: R = D - 2(D·N)N
 * @param {Object} incomingDir - Incoming beam direction vector (normalized)
 * @param {Object} surfaceNormal - Surface normal vector (normalized)
 * @returns {Object} Reflected direction vector
 */
export function calculateReflectionDirection(incomingDir, surfaceNormal) {
    const d = normalizeVector(incomingDir);
    const n = normalizeVector(surfaceNormal);

    // D · N (dot product)
    const dot = d.x * n.x + d.y * n.y;

    // R = D - 2(D·N)N
    return normalizeVector({
        x: d.x - 2 * dot * n.x,
        y: d.y - 2 * dot * n.y
    });
}

/**
 * Calculate reflected beam direction for a mirror at a specific angle
 * @param {number} incomingAngle - Incoming beam angle (degrees)
 * @param {number} mirrorAngle - Mirror component angle (degrees)
 * @returns {number} Reflected beam angle (degrees)
 */
export function calculateMirrorReflection(incomingAngle, mirrorAngle) {
    const incomingDir = angleToVector(incomingAngle);
    const surfaceNormal = getSurfaceNormal(mirrorAngle);
    const reflectedDir = calculateReflectionDirection(incomingDir, surfaceNormal);
    return vectorToAngle(reflectedDir);
}

/**
 * Get the expected output direction from a component given input direction
 * @param {Object} component - Component object
 * @param {number} inputAngle - Incoming beam angle (degrees)
 * @param {string} outputPort - 'reflected' or 'transmitted'
 * @returns {number|null} Output beam angle (degrees), or null if invalid
 */
export function getOutputDirection(component, inputAngle, outputPort = 'reflected') {
    const type = component.type;

    switch (type) {
        case ComponentType.SOURCE:
            // Sources emit based on their angle (emission direction property)
            // Use emissionAngle if set, otherwise component angle snapped to cardinal
            const emissionAngle = component.emissionAngle ?? component.angle;
            return normalizeAngle(emissionAngle);

        case ComponentType.MIRROR:
            // Mirrors always reflect
            return calculateMirrorReflection(inputAngle, component.angle);

        case ComponentType.BEAM_SPLITTER:
            if (outputPort === 'transmitted') {
                // Transmitted beam continues straight through
                return normalizeAngle(inputAngle);
            } else {
                // Reflected beam
                const bsAngle = component.isShallowAngle ? component.shallowAngle : component.angle;
                return calculateMirrorReflection(inputAngle, bsAngle);
            }

        case ComponentType.LENS:
        case ComponentType.WAVEPLATE:
        case ComponentType.FILTER:
            // Transmission components pass beam straight through
            return normalizeAngle(inputAngle);

        case ComponentType.DETECTOR:
            // Detectors absorb - no output
            return null;

        default:
            return normalizeAngle(inputAngle);
    }
}

/**
 * Calculate beam direction from source to target position
 */
export function calculateBeamDirection(sourcePos, targetPos) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return null;  // Same position
    }

    return normalizeVector({ x: dx, y: dy });
}

/**
 * Calculate beam angle from source to target position
 */
export function calculateBeamAngle(sourcePos, targetPos) {
    const dir = calculateBeamDirection(sourcePos, targetPos);
    if (!dir) return null;
    return vectorToAngle(dir);
}

/**
 * Check if target position lies along a beam direction from source (within tolerance)
 * @param {Object} sourcePos - Source position {x, y}
 * @param {Object} targetPos - Target position {x, y}
 * @param {number} expectedAngle - Expected beam angle (degrees)
 * @param {number} tolerance - Angular tolerance (degrees)
 * @returns {boolean}
 */
export function isTargetOnBeamPath(sourcePos, targetPos, expectedAngle, tolerance = ANGLE_TOLERANCE) {
    const actualAngle = calculateBeamAngle(sourcePos, targetPos);
    if (actualAngle === null) return false;

    const diff = Math.abs(normalizeAngle(actualAngle - expectedAngle));
    // Handle wrap-around (e.g., 359 vs 1 degrees)
    const adjustedDiff = Math.min(diff, 360 - diff);

    return adjustedDiff <= tolerance;
}

/**
 * Check if a beam can hit a transmission component (lens, waveplate, filter)
 * Beam must pass through along the optical axis (parallel to component angle)
 *
 * For a lens at angle 0° (standing vertical, thin horizontally):
 *   - Optical axis is horizontal (0°/180°)
 *   - Beam should come from left or right
 * For a lens at angle 90° (laying flat, thin vertically):
 *   - Optical axis is vertical (90°/270°)
 *   - Beam should come from top or bottom
 */
export function canTransmissionComponentAccept(componentAngle, beamAngle, tolerance = ANGLE_TOLERANCE) {
    // The optical axis is along the component angle (the thin dimension)
    // Beam should be parallel to the optical axis (can come from either direction)
    const opticalAxis = normalizeAngle(componentAngle);

    // Beam can come from either direction along the optical axis
    const diff1 = Math.abs(normalizeAngle(beamAngle - opticalAxis));
    const diff2 = Math.abs(normalizeAngle(beamAngle - opticalAxis - 180));

    const adjustedDiff1 = Math.min(diff1, 360 - diff1);
    const adjustedDiff2 = Math.min(diff2, 360 - diff2);

    return adjustedDiff1 <= tolerance || adjustedDiff2 <= tolerance;
}

/**
 * Validate if a connection between two components is physically possible
 * @param {Object} sourceComp - Source component
 * @param {Object} targetComp - Target component
 * @param {string} sourcePort - Output port on source ('output', 'reflected', 'transmitted')
 * @param {number|null} incomingBeamAngle - Angle of beam entering source component (null for sources)
 * @param {Map} componentMap - Map of all components by ID
 * @returns {Object} { valid: boolean, error: string|null, beamAngle: number|null }
 */
export function validateConnection(sourceComp, targetComp, sourcePort, incomingBeamAngle, componentMap) {
    const result = {
        valid: false,
        error: null,
        beamAngle: null,
        beamDirection: null
    };

    // Check if either component has relaxed constraints
    const sourceRelaxed = sourceComp.allowAnyAngle || false;
    const targetRelaxed = targetComp.allowAnyAngle || false;
    const relaxedMode = sourceRelaxed || targetRelaxed;

    // Use wider tolerance when constraints are relaxed
    const tolerance = relaxedMode ? 30 : ANGLE_TOLERANCE;

    // 1. Determine output beam angle from source component
    let outputAngle;

    if (sourceComp.type === ComponentType.SOURCE) {
        // Sources emit in their emission direction
        outputAngle = sourceComp.emissionAngle ?? snapAngleToValid(sourceComp.angle, ComponentType.SOURCE);
    } else if (incomingBeamAngle !== null) {
        outputAngle = getOutputDirection(sourceComp, incomingBeamAngle, sourcePort);
    } else {
        // If source has allowAnyAngle, calculate direct angle to target
        if (sourceRelaxed) {
            outputAngle = calculateBeamAngle(sourceComp.position, targetComp.position);
        } else {
            result.error = 'Cannot determine beam direction: no incoming beam angle specified';
            return result;
        }
    }

    if (outputAngle === null) {
        result.error = `${sourceComp.name} cannot output a beam (terminal component)`;
        return result;
    }

    // 2. Check if target is along the beam path (with appropriate tolerance)
    if (!isTargetOnBeamPath(sourceComp.position, targetComp.position, outputAngle, tolerance)) {
        // If source allows any angle, skip this check
        if (!sourceRelaxed) {
            const actualAngle = calculateBeamAngle(sourceComp.position, targetComp.position);
            result.error = `Target ${targetComp.name} is not in beam path. Expected angle: ${outputAngle.toFixed(1)}°, actual: ${actualAngle?.toFixed(1) ?? 'N/A'}°`;
            return result;
        }
    }

    // 3. Check if target can accept beam from this direction
    const beamAngle = calculateBeamAngle(sourceComp.position, targetComp.position);

    // For transmission components, check that beam is along optical axis (skip if target has relaxed constraints)
    if (!targetRelaxed && [ComponentType.LENS, ComponentType.WAVEPLATE, ComponentType.FILTER].includes(targetComp.type)) {
        if (!canTransmissionComponentAccept(targetComp.angle, beamAngle, tolerance)) {
            result.error = `Beam must pass through ${targetComp.name} along its optical axis`;
            return result;
        }
    }

    // 4. Check for obstacles in the path (optional - can be expanded)
    // For now, we'll skip obstacle detection as it adds complexity

    result.valid = true;
    result.beamAngle = beamAngle;
    result.beamDirection = angleToVector(beamAngle);

    return result;
}

/**
 * Trace beam path through the optical system starting from a source
 * @param {Object} sourceComponent - Starting source component
 * @param {Object} beamPath - BeamPath graph
 * @param {Map} componentMap - Map of all components
 * @returns {Array} Array of traced path info
 */
export function traceBeamPath(sourceComponent, beamPath, componentMap) {
    const paths = [];

    const trace = (currentComp, currentAngle, currentPath, depth) => {
        if (depth > 50) return;  // Prevent infinite loops

        const outgoing = beamPath.getOutgoingSegments(currentComp.id);

        if (outgoing.length === 0) {
            // End of path
            if (currentPath.length > 0) {
                paths.push({
                    segments: [...currentPath],
                    terminalComponent: currentComp
                });
            }
            return;
        }

        for (const segment of outgoing) {
            const targetComp = componentMap.get(segment.targetId);
            if (!targetComp) continue;

            // Calculate output direction based on port
            const outputAngle = getOutputDirection(currentComp, currentAngle, segment.sourcePort);
            if (outputAngle === null) continue;

            // Calculate actual beam angle to target
            const beamAngle = calculateBeamAngle(currentComp.position, targetComp.position);

            currentPath.push({
                segmentId: segment.id,
                beamAngle: beamAngle,
                expectedAngle: outputAngle,
                isValid: isTargetOnBeamPath(currentComp.position, targetComp.position, outputAngle)
            });

            trace(targetComp, beamAngle, currentPath, depth + 1);
            currentPath.pop();
        }
    };

    // Start trace with source emission angle
    const emissionAngle = sourceComponent.emissionAngle ??
                          snapAngleToValid(sourceComponent.angle, ComponentType.SOURCE);
    trace(sourceComponent, emissionAngle, [], 0);

    return paths;
}

/**
 * Calculate the deviation between actual and expected beam angles
 * @param {Object} segment - BeamSegment
 * @param {Map} componentMap - Map of all components
 * @param {number|null} incomingAngle - Incoming beam angle to source component
 * @returns {number} Deviation in degrees (0 = perfect alignment)
 */
export function calculateSegmentAngleDeviation(segment, componentMap, incomingAngle) {
    const sourceComp = componentMap.get(segment.sourceId);
    const targetComp = componentMap.get(segment.targetId);

    if (!sourceComp || !targetComp) return 180;  // Max deviation if missing

    // Get expected output angle
    let expectedAngle;
    if (sourceComp.type === ComponentType.SOURCE) {
        expectedAngle = sourceComp.emissionAngle ??
                       snapAngleToValid(sourceComp.angle, ComponentType.SOURCE);
    } else if (incomingAngle !== null) {
        expectedAngle = getOutputDirection(sourceComp, incomingAngle, segment.sourcePort);
    } else {
        return 180;  // Can't calculate without incoming angle
    }

    if (expectedAngle === null) return 180;

    // Get actual angle
    const actualAngle = calculateBeamAngle(sourceComp.position, targetComp.position);
    if (actualAngle === null) return 180;

    // Calculate deviation
    const diff = Math.abs(normalizeAngle(actualAngle - expectedAngle));
    return Math.min(diff, 360 - diff);
}

/**
 * Snap position to grid
 * @param {Object} position - {x, y} position
 * @param {number} gridSize - Grid spacing (default 25mm)
 * @returns {Object} Snapped position
 */
export function snapToGrid(position, gridSize = 25) {
    return {
        x: Math.round(position.x / gridSize) * gridSize,
        y: Math.round(position.y / gridSize) * gridSize
    };
}

/**
 * Check if position is on grid
 */
export function isOnGrid(position, gridSize = 25, tolerance = 0.5) {
    const snapped = snapToGrid(position, gridSize);
    const dx = Math.abs(position.x - snapped.x);
    const dy = Math.abs(position.y - snapped.y);
    return dx <= tolerance && dy <= tolerance;
}

export default {
    CARDINAL_DIRECTIONS,
    CARDINAL_ANGLES,
    VALID_ANGLES_BY_TYPE,
    ANGLE_TOLERANCE,
    normalizeAngle,
    normalizeAngleDiff,
    degToRad,
    radToDeg,
    normalizeVector,
    vectorToAngle,
    angleToVector,
    angleBetweenVectors,
    getValidAnglesForComponent,
    snapAngleToValid,
    isValidAngleForComponent,
    getSurfaceNormal,
    calculateReflectionDirection,
    calculateMirrorReflection,
    getOutputDirection,
    calculateBeamDirection,
    calculateBeamAngle,
    isTargetOnBeamPath,
    canTransmissionComponentAccept,
    validateConnection,
    traceBeamPath,
    calculateSegmentAngleDeviation,
    snapToGrid,
    isOnGrid
};
