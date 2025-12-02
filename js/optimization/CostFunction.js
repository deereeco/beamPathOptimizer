/**
 * Cost function for optimization
 * Calculates the total cost of a component configuration
 */

import * as BeamPhysics from '../physics/BeamPhysics.js';

/**
 * Calculate the cost of center of mass position
 * Returns 0 if CoM is inside mounting zone, otherwise squared distance to zone center
 */
export function calculateCoMCost(centerOfMass, mountingZone) {
    if (!centerOfMass || !mountingZone) {
        return 0;
    }

    const zone = mountingZone.bounds;
    const zoneCenter = {
        x: zone.x + zone.width / 2,
        y: zone.y + zone.height / 2
    };

    // Check if CoM is inside the mounting zone
    const isInside = (
        centerOfMass.x >= zone.x &&
        centerOfMass.x <= zone.x + zone.width &&
        centerOfMass.y >= zone.y &&
        centerOfMass.y <= zone.y + zone.height
    );

    if (isInside) {
        return 0;
    }

    // Calculate squared distance to zone center
    const dx = centerOfMass.x - zoneCenter.x;
    const dy = centerOfMass.y - zoneCenter.y;
    return dx * dx + dy * dy;
}

/**
 * Calculate the footprint cost (bounding box area of all components)
 */
export function calculateFootprintCost(components) {
    if (components.length === 0) {
        return 0;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const comp of components) {
        const bbox = comp.getBoundingBox();
        minX = Math.min(minX, bbox.minX);
        minY = Math.min(minY, bbox.minY);
        maxX = Math.max(maxX, bbox.maxX);
        maxY = Math.max(maxY, bbox.maxY);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Return area (normalized by dividing by 10000 to keep scale reasonable)
    return (width * height) / 10000;
}

/**
 * Calculate the total path length cost
 */
export function calculatePathLengthCost(beamPath, components) {
    const componentMap = new Map();
    components.forEach(c => componentMap.set(c.id, c));

    let totalLength = 0;
    const segments = beamPath.getAllSegments();

    for (const segment of segments) {
        const source = componentMap.get(segment.sourceId);
        const target = componentMap.get(segment.targetId);

        if (source && target) {
            const dx = target.position.x - source.position.x;
            const dy = target.position.y - source.position.y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }
    }

    // Normalize by dividing by 100 to keep scale reasonable
    return totalLength / 100;
}

/**
 * Calculate penalty for constraint violations
 */
export function calculatePenalty(components, constraints) {
    let penalty = 0;
    const PENALTY_MULTIPLIER = 1000;

    for (const comp of components) {
        const bbox = comp.getBoundingBox();

        // Workspace boundary violations
        if (bbox.minX < 0 || bbox.minY < 0 ||
            bbox.maxX > constraints.workspace.width ||
            bbox.maxY > constraints.workspace.height) {
            penalty += PENALTY_MULTIPLIER;
        }

        // Keep-out zone violations
        for (const zone of constraints.keepOutZones) {
            if (!zone.isActive) continue;

            const zb = zone.bounds;
            const overlaps = !(
                bbox.maxX < zb.x ||
                bbox.minX > zb.x + zb.width ||
                bbox.maxY < zb.y ||
                bbox.minY > zb.y + zb.height
            );

            if (overlaps) {
                penalty += PENALTY_MULTIPLIER;
            }
        }

        // Mount zone violations (if component has mount zone enabled)
        if (comp.mountZone && comp.mountZone.enabled) {
            const mountBounds = comp.getMountZoneBounds();
            if (mountBounds) {
                // Check mount zone against workspace boundaries
                if (mountBounds.minX < 0 || mountBounds.minY < 0 ||
                    mountBounds.maxX > constraints.workspace.width ||
                    mountBounds.maxY > constraints.workspace.height) {
                    penalty += PENALTY_MULTIPLIER * 0.5;
                }

                // Check mount zone against keep-out zones
                for (const zone of constraints.keepOutZones) {
                    if (!zone.isActive) continue;

                    const zb = zone.bounds;
                    const overlaps = !(
                        mountBounds.maxX < zb.x ||
                        mountBounds.minX > zb.x + zb.width ||
                        mountBounds.maxY < zb.y ||
                        mountBounds.minY > zb.y + zb.height
                    );

                    if (overlaps) {
                        penalty += PENALTY_MULTIPLIER * 0.5;
                    }
                }

                // Check mount zone against other components
                for (const other of components) {
                    if (other.id === comp.id) continue;

                    const otherBbox = other.getBoundingBox();
                    const overlaps = !(
                        mountBounds.maxX < otherBbox.minX ||
                        mountBounds.minX > otherBbox.maxX ||
                        mountBounds.maxY < otherBbox.minY ||
                        mountBounds.minY > otherBbox.maxY
                    );

                    if (overlaps) {
                        penalty += PENALTY_MULTIPLIER * 0.3;
                    }

                    // Check against other component's mount zone
                    if (other.mountZone && other.mountZone.enabled) {
                        const otherMount = other.getMountZoneBounds();
                        if (otherMount) {
                            const mountOverlaps = !(
                                mountBounds.maxX < otherMount.minX ||
                                mountBounds.minX > otherMount.maxX ||
                                mountBounds.maxY < otherMount.minY ||
                                mountBounds.minY > otherMount.maxY
                            );

                            if (mountOverlaps) {
                                penalty += PENALTY_MULTIPLIER * 0.2;
                            }
                        }
                    }
                }
            }
        }
    }

    // Check for component-component overlaps
    for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
            const bbox1 = components[i].getBoundingBox();
            const bbox2 = components[j].getBoundingBox();

            const overlaps = !(
                bbox1.maxX < bbox2.minX ||
                bbox1.minX > bbox2.maxX ||
                bbox1.maxY < bbox2.minY ||
                bbox1.minY > bbox2.maxY
            );

            if (overlaps) {
                penalty += PENALTY_MULTIPLIER * 2;
            }
        }
    }

    return penalty;
}

/**
 * Calculate beam angle violation penalty
 * Penalizes segments where beam direction doesn't match physics expectations
 */
export function calculateBeamAnglePenalty(beamPath, components) {
    let penalty = 0;
    const ANGLE_PENALTY_MULTIPLIER = 500;  // Per degree of deviation

    const componentMap = new Map();
    components.forEach(c => componentMap.set(c.id, c));

    const segments = beamPath.getAllSegments();

    // Build incoming angle map
    const incomingAngles = new Map();

    // First, find all source components and set their emission angles
    for (const comp of components) {
        if (comp.type === 'source') {
            incomingAngles.set(comp.id, comp.emissionAngle || 0);
        }
    }

    // Process segments to propagate angles
    for (const segment of segments) {
        const source = componentMap.get(segment.sourceId);
        const target = componentMap.get(segment.targetId);

        if (!source || !target) continue;

        // Get incoming angle to source
        let incomingAngle = incomingAngles.get(source.id);

        // If source is a source component, use emission angle
        if (source.type === 'source') {
            incomingAngle = source.emissionAngle || 0;
        }

        // If we don't have an incoming angle, we can't validate
        if (incomingAngle === undefined || incomingAngle === null) continue;

        // Calculate expected output angle
        const expectedAngle = BeamPhysics.getOutputDirection(source, incomingAngle, segment.sourcePort);
        if (expectedAngle === null) continue;

        // Calculate actual beam angle
        const actualAngle = BeamPhysics.calculateBeamAngle(source.position, target.position);
        if (actualAngle === null) continue;

        // Calculate deviation
        const deviation = BeamPhysics.calculateSegmentAngleDeviation(segment, componentMap, incomingAngle);

        // Add penalty proportional to deviation
        if (deviation > BeamPhysics.ANGLE_TOLERANCE) {
            penalty += ANGLE_PENALTY_MULTIPLIER * (deviation / 90);  // Normalize by max deviation
        }

        // Store the actual angle for the target (for downstream calculation)
        incomingAngles.set(target.id, actualAngle);
    }

    return penalty;
}

/**
 * Calculate fixed path length violation penalty
 * Heavily penalizes segments with fixed length that don't match the constraint
 */
export function calculateFixedLengthPenalty(beamPath, components) {
    let penalty = 0;
    const FIXED_LENGTH_PENALTY_MULTIPLIER = 2000;

    const componentMap = new Map();
    components.forEach(c => componentMap.set(c.id, c));

    const segments = beamPath.getAllSegments();

    for (const segment of segments) {
        if (!segment.isFixedLength || segment.fixedLength === null) continue;

        const source = componentMap.get(segment.sourceId);
        const target = componentMap.get(segment.targetId);

        if (!source || !target) continue;

        // Calculate actual distance
        const dx = target.position.x - source.position.x;
        const dy = target.position.y - source.position.y;
        const actualLength = Math.sqrt(dx * dx + dy * dy);

        // Calculate deviation from fixed length
        const deviation = Math.abs(actualLength - segment.fixedLength);

        // Add heavy penalty for any deviation
        if (deviation > 0.1) {  // 0.1mm tolerance
            penalty += FIXED_LENGTH_PENALTY_MULTIPLIER * (deviation / segment.fixedLength);
        }
    }

    return penalty;
}

/**
 * Calculate total cost with weights
 */
export function calculateTotalCost(state, weights) {
    const components = Array.from(state.components.values());
    const movableComponents = components.filter(c => !c.isFixed);

    if (movableComponents.length === 0) {
        return { total: 0, com: 0, footprint: 0, pathLength: 0, penalty: 0, beamAngle: 0, fixedLength: 0 };
    }

    // Calculate center of mass
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (const comp of components) {
        totalMass += comp.mass;
        weightedX += comp.mass * comp.position.x;
        weightedY += comp.mass * comp.position.y;
    }

    const centerOfMass = totalMass > 0
        ? { x: weightedX / totalMass, y: weightedY / totalMass }
        : null;

    // Calculate individual costs
    const comCost = calculateCoMCost(centerOfMass, state.constraints.mountingZone);
    const footprintCost = calculateFootprintCost(components);
    const pathLengthCost = calculatePathLengthCost(state.beamPath, components);
    const penalty = calculatePenalty(components, state.constraints);

    // Beam physics penalties
    const beamAnglePenalty = calculateBeamAnglePenalty(state.beamPath, components);
    const fixedLengthPenalty = calculateFixedLengthPenalty(state.beamPath, components);

    // Weighted total (beam physics penalties are added as hard constraints)
    const total = (
        weights.com * comCost +
        weights.footprint * footprintCost +
        weights.pathLength * pathLengthCost +
        penalty +
        beamAnglePenalty +
        fixedLengthPenalty
    );

    return {
        total,
        com: comCost,
        footprint: footprintCost,
        pathLength: pathLengthCost,
        penalty,
        beamAngle: beamAnglePenalty,
        fixedLength: fixedLengthPenalty
    };
}

export default {
    calculateCoMCost,
    calculateFootprintCost,
    calculatePathLengthCost,
    calculatePenalty,
    calculateBeamAnglePenalty,
    calculateFixedLengthPenalty,
    calculateTotalCost
};
