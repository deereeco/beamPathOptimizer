/**
 * Beam segment representing a connection between two components
 */
export class BeamSegment {
    constructor(props) {
        this.id = props.id || `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.sourceId = props.sourceId;
        this.targetId = props.targetId || null; // Can be null if beam terminates at workspace boundary
        this.sourcePort = props.sourcePort || 'output'; // output, reflected, transmitted
        this.targetPort = props.targetPort || 'input';

        // Optional endpoint for beams that terminate at workspace boundary
        this.endPoint = props.endPoint || null; // { x, y } - used when targetId is null

        // Beam properties (can be inherited/calculated)
        this.wavelength = props.wavelength || 632.8; // nm (HeNe default)
        this.power = props.power || 1.0; // relative power (0-1)
        this.pathLength = props.pathLength || 0; // calculated from positions

        // Visual properties
        this.color = props.color || '#ff0000';
        this.branchIndex = props.branchIndex || 0; // for color coding split beams
        this.wavelengthIds = props.wavelengthIds || []; // Array of wavelength IDs for multi-color display

        // === NEW: Beam Physics Properties ===

        // Direction vector (normalized) - calculated based on physics
        this.direction = props.direction || null;  // { x, y }

        // Direction angle in degrees (0-360)
        this.directionAngle = props.directionAngle ?? null;

        // Physics validation state
        this.isValid = props.isValid ?? true;
        this.validationError = props.validationError || null;

        // Fixed length constraint (for lenses and beam splitter reflected outputs)
        this.isFixedLength = props.isFixedLength || false;
        this.fixedLength = props.fixedLength ?? null;  // mm
    }

    /**
     * Update direction based on source and target positions
     * @param {Object} sourcePos - Source position {x, y}
     * @param {Object} targetPos - Target position {x, y}
     */
    updateDirection(sourcePos, targetPos) {
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
            this.direction = { x: dx / length, y: dy / length };
            this.directionAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        } else {
            this.direction = null;
            this.directionAngle = null;
        }
    }

    /**
     * Set validation state
     * @param {boolean} valid - Is the connection valid
     * @param {string|null} error - Error message if invalid
     */
    setValidation(valid, error = null) {
        this.isValid = valid;
        this.validationError = error;
    }

    /**
     * Set fixed length constraint
     * @param {boolean} isFixed - Whether length is fixed
     * @param {number|null} length - Fixed length in mm
     */
    setFixedLength(isFixed, length = null) {
        this.isFixedLength = isFixed;
        this.fixedLength = length;
    }

    toJSON() {
        return {
            id: this.id,
            sourceId: this.sourceId,
            targetId: this.targetId,
            sourcePort: this.sourcePort,
            targetPort: this.targetPort,
            endPoint: this.endPoint ? { ...this.endPoint } : null, // Workspace boundary endpoint
            wavelength: this.wavelength,
            power: this.power,
            pathLength: this.pathLength,
            branchIndex: this.branchIndex,
            wavelengthIds: this.wavelengthIds,
            // Beam physics properties
            direction: this.direction ? { ...this.direction } : null,
            directionAngle: this.directionAngle,
            isValid: this.isValid,
            validationError: this.validationError,
            isFixedLength: this.isFixedLength,
            fixedLength: this.fixedLength
        };
    }

    static fromJSON(json) {
        return new BeamSegment(json);
    }
}

/**
 * Colors for beam branches (splits)
 */
export const BRANCH_COLORS = [
    '#ff0000', // Primary - red
    '#ff8800', // 1st split - orange
    '#ffcc00', // 2nd split - yellow
    '#00cc00', // 3rd split - green
    '#00cccc', // 4th split - cyan
    '#0088ff', // 5th split - blue
];

/**
 * BeamPath graph managing all beam segments
 */
export class BeamPath {
    constructor() {
        // Segments indexed by ID
        this.segments = new Map();

        // Adjacency lists for fast traversal
        this.outgoing = new Map(); // componentId -> [segmentId, ...]
        this.incoming = new Map(); // componentId -> [segmentId, ...]
    }

    /**
     * Add a beam segment
     */
    addSegment(segment) {
        if (!(segment instanceof BeamSegment)) {
            segment = new BeamSegment(segment);
        }

        this.segments.set(segment.id, segment);

        // Update outgoing adjacency
        if (!this.outgoing.has(segment.sourceId)) {
            this.outgoing.set(segment.sourceId, []);
        }
        this.outgoing.get(segment.sourceId).push(segment.id);

        // Update incoming adjacency
        if (!this.incoming.has(segment.targetId)) {
            this.incoming.set(segment.targetId, []);
        }
        this.incoming.get(segment.targetId).push(segment.id);

        return segment;
    }

    /**
     * Remove a beam segment
     */
    removeSegment(segmentId) {
        const segment = this.segments.get(segmentId);
        if (!segment) return false;

        // Remove from outgoing
        const outList = this.outgoing.get(segment.sourceId);
        if (outList) {
            const idx = outList.indexOf(segmentId);
            if (idx > -1) outList.splice(idx, 1);
        }

        // Remove from incoming
        const inList = this.incoming.get(segment.targetId);
        if (inList) {
            const idx = inList.indexOf(segmentId);
            if (idx > -1) inList.splice(idx, 1);
        }

        this.segments.delete(segmentId);
        return true;
    }

    /**
     * Remove all segments connected to a component
     */
    removeSegmentsForComponent(componentId) {
        const toRemove = [];

        // Find all segments connected to this component
        this.segments.forEach((segment, id) => {
            if (segment.sourceId === componentId || segment.targetId === componentId) {
                toRemove.push(id);
            }
        });

        // Remove them
        toRemove.forEach(id => this.removeSegment(id));

        // Clean up adjacency maps
        this.outgoing.delete(componentId);
        this.incoming.delete(componentId);

        return toRemove.length;
    }

    /**
     * Get segment by ID
     */
    getSegment(segmentId) {
        return this.segments.get(segmentId);
    }

    /**
     * Get all segments as array
     */
    getAllSegments() {
        return Array.from(this.segments.values());
    }

    /**
     * Get outgoing segments from a component
     */
    getOutgoingSegments(componentId) {
        const ids = this.outgoing.get(componentId) || [];
        return ids.map(id => this.segments.get(id)).filter(Boolean);
    }

    /**
     * Get incoming segments to a component
     */
    getIncomingSegments(componentId) {
        const ids = this.incoming.get(componentId) || [];
        return ids.map(id => this.segments.get(id)).filter(Boolean);
    }

    /**
     * Check if a connection already exists
     */
    connectionExists(sourceId, targetId, sourcePort = null) {
        const outgoing = this.getOutgoingSegments(sourceId);
        return outgoing.some(seg =>
            seg.targetId === targetId &&
            (sourcePort === null || seg.sourcePort === sourcePort)
        );
    }

    /**
     * Calculate path length between two component positions
     */
    static calculateDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Recalculate all path lengths based on component positions
     */
    recalculatePathLengths(components) {
        const componentMap = new Map();
        components.forEach(c => componentMap.set(c.id, c));

        this.segments.forEach(segment => {
            const source = componentMap.get(segment.sourceId);
            const target = componentMap.get(segment.targetId);

            if (source && target) {
                segment.pathLength = BeamPath.calculateDistance(
                    source.position,
                    target.position
                );
            }
        });
    }

    /**
     * Get total path length of all segments
     */
    getTotalPathLength() {
        let total = 0;
        this.segments.forEach(segment => {
            total += segment.pathLength;
        });
        return total;
    }

    /**
     * Trace beam path from a source component
     * Returns array of paths, each path is array of segment IDs
     */
    traceFromSource(sourceId, maxDepth = 50) {
        const paths = [];
        const visited = new Set();

        const trace = (currentId, currentPath, depth) => {
            if (depth > maxDepth) return;
            if (visited.has(currentId)) return; // Prevent cycles

            const outgoing = this.outgoing.get(currentId) || [];

            if (outgoing.length === 0) {
                // End of path
                if (currentPath.length > 0) {
                    paths.push([...currentPath]);
                }
                return;
            }

            for (const segId of outgoing) {
                const segment = this.segments.get(segId);
                if (!segment) continue;

                visited.add(currentId);
                currentPath.push(segId);
                trace(segment.targetId, currentPath, depth + 1);
                currentPath.pop();
                visited.delete(currentId);
            }
        };

        trace(sourceId, [], 0);
        return paths;
    }

    /**
     * Calculate the total optical path length between two components
     * Traces beam path from source to target and sums segment lengths
     * @param {string} sourceId - Source component ID
     * @param {string} targetId - Target component ID
     * @returns {number|null} - Total path length in mm, or null if no path exists
     */
    calculatePathLengthBetween(sourceId, targetId) {
        if (!sourceId || !targetId) return null;
        if (sourceId === targetId) return 0;

        // Find all paths from source
        const allPaths = this.traceFromSource(sourceId);

        // Filter paths that end at targetId
        const validPaths = allPaths.filter(pathSegmentIds => {
            if (pathSegmentIds.length === 0) return false;

            const lastSegmentId = pathSegmentIds[pathSegmentIds.length - 1];
            const lastSegment = this.segments.get(lastSegmentId);

            return lastSegment && lastSegment.targetId === targetId;
        });

        if (validPaths.length === 0) {
            // No path exists between these components
            return null;
        }

        // Use the first valid path (primary path)
        // For beam splitters, this will be the transmitted path
        const primaryPath = validPaths[0];

        // Sum the path lengths of all segments in the path
        let totalLength = 0;
        for (const segmentId of primaryPath) {
            const segment = this.segments.get(segmentId);
            if (segment && segment.pathLength !== undefined) {
                totalLength += segment.pathLength;
            }
        }

        return totalLength;
    }

    /**
     * Check if a beam path exists between two components
     * @param {string} sourceId - Source component ID
     * @param {string} targetId - Target component ID
     * @returns {boolean} - True if path exists
     */
    pathExistsBetween(sourceId, targetId) {
        return this.calculatePathLengthBetween(sourceId, targetId) !== null;
    }

    /**
     * Assign branch indices and colors based on splits
     */
    assignBranchColors(sourceIds) {
        let branchCounter = 0;

        for (const sourceId of sourceIds) {
            const assignBranch = (componentId, branchIndex, power) => {
                const outgoing = this.outgoing.get(componentId) || [];

                for (let i = 0; i < outgoing.length; i++) {
                    const segment = this.segments.get(outgoing[i]);
                    if (!segment) continue;

                    // First output keeps current branch, additional outputs get new branches
                    const newBranchIndex = i === 0 ? branchIndex : ++branchCounter;
                    segment.branchIndex = newBranchIndex;
                    segment.color = BRANCH_COLORS[newBranchIndex % BRANCH_COLORS.length];

                    // Calculate power based on port
                    // (This is simplified - real calculation would need component data)

                    assignBranch(segment.targetId, newBranchIndex, power);
                }
            };

            assignBranch(sourceId, branchCounter++, 1.0);
        }
    }

    /**
     * Validate the beam path graph (structural validation)
     */
    validate() {
        const errors = [];

        // Check for orphaned segments
        this.segments.forEach((segment, id) => {
            if (!this.outgoing.has(segment.sourceId) &&
                !this.incoming.has(segment.sourceId)) {
                errors.push(`Segment ${id} has orphaned source: ${segment.sourceId}`);
            }
            if (!this.outgoing.has(segment.targetId) &&
                !this.incoming.has(segment.targetId)) {
                errors.push(`Segment ${id} has orphaned target: ${segment.targetId}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Update directions for all segments based on component positions
     * @param {Map|Array} components - Map or array of components
     */
    updateAllDirections(components) {
        const componentMap = components instanceof Map
            ? components
            : new Map(components.map(c => [c.id, c]));

        this.segments.forEach(segment => {
            const source = componentMap.get(segment.sourceId);
            const target = componentMap.get(segment.targetId);

            if (source && target) {
                segment.updateDirection(source.position, target.position);
            }
        });
    }

    /**
     * Get all segments with their validation state
     * @returns {Array} Segments with isValid status
     */
    getSegmentsWithValidation() {
        return Array.from(this.segments.values()).map(segment => ({
            ...segment,
            isValid: segment.isValid,
            validationError: segment.validationError
        }));
    }

    /**
     * Get count of valid/invalid segments
     * @returns {Object} { valid: number, invalid: number, total: number }
     */
    getValidationSummary() {
        let valid = 0;
        let invalid = 0;

        this.segments.forEach(segment => {
            if (segment.isValid) {
                valid++;
            } else {
                invalid++;
            }
        });

        return { valid, invalid, total: this.segments.size };
    }

    /**
     * Get all invalid segments
     * @returns {Array} Array of invalid segments
     */
    getInvalidSegments() {
        const invalid = [];
        this.segments.forEach(segment => {
            if (!segment.isValid) {
                invalid.push(segment);
            }
        });
        return invalid;
    }

    /**
     * Get all segments with fixed length constraints
     * @returns {Array} Array of segments with isFixedLength = true
     */
    getFixedLengthSegments() {
        const fixed = [];
        this.segments.forEach(segment => {
            if (segment.isFixedLength) {
                fixed.push(segment);
            }
        });
        return fixed;
    }

    /**
     * Apply fixed length constraints to segment path lengths
     * Updates pathLength to match fixedLength where applicable
     */
    applyFixedLengthConstraints() {
        this.segments.forEach(segment => {
            if (segment.isFixedLength && segment.fixedLength !== null) {
                segment.pathLength = segment.fixedLength;
            }
        });
    }

    /**
     * Clear all segments
     */
    clear() {
        this.segments.clear();
        this.outgoing.clear();
        this.incoming.clear();
    }

    /**
     * Serialize to plain object
     */
    toJSON() {
        return {
            segments: Array.from(this.segments.values()).map(s => s.toJSON())
        };
    }

    /**
     * Create from plain object
     */
    static fromJSON(json) {
        const beamPath = new BeamPath();
        if (json.segments) {
            json.segments.forEach(segJson => {
                beamPath.addSegment(BeamSegment.fromJSON(segJson));
            });
        }
        return beamPath;
    }
}

export default BeamPath;
