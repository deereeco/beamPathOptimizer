/**
 * Simulated Annealing Optimizer for beam path component placement
 *
 * CONSTRAINT-FIRST APPROACH:
 * - Beam angles are HARD constraints - moves that violate them are rejected entirely
 * - Only allows moves that preserve beam geometry by construction
 * - Validates workspace bounds and overlaps before accepting any move
 */

import { calculateTotalCost } from './CostFunction.js';
import * as BeamPhysics from '../physics/BeamPhysics.js';

/**
 * Default optimizer parameters
 */
export const DEFAULT_PARAMS = {
    initialTemp: 100,
    finalTemp: 0.1,
    coolingRate: 0.995,
    iterationsPerTemp: 20,
    maxIterations: 10000,
    initialStepSize: 50,  // mm
    minStepSize: 2,       // mm
    earlyStopIterations: 1500  // Stop if no improvement for this many iterations
};

/**
 * Get adaptive parameters based on number of movable components
 */
export function getAdaptiveParams(movableCount) {
    // Scale iterations based on complexity
    const baseIterations = Math.max(1000, movableCount * 500);

    return {
        ...DEFAULT_PARAMS,
        maxIterations: Math.min(baseIterations, 8000),
        iterationsPerTemp: Math.max(15, movableCount * 5),
        coolingRate: movableCount <= 5 ? 0.995 : 0.997,
        earlyStopIterations: Math.max(500, movableCount * 150)
    };
}

/**
 * Optimizer states
 */
export const OptimizerState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished'
};

/**
 * Simulated Annealing Optimizer
 */
export class Optimizer {
    constructor(params = {}) {
        this.params = { ...DEFAULT_PARAMS, ...params };
        this.state = OptimizerState.IDLE;

        // Optimization state
        this.temperature = this.params.initialTemp;
        this.stepSize = this.params.initialStepSize;
        this.iteration = 0;
        this.bestCost = Infinity;
        this.currentCost = Infinity;
        this.initialCost = Infinity;
        this.iterationsSinceImprovement = 0;
        this.acceptedMoves = 0;
        this.rejectedMoves = 0;

        // Cost breakdown for display
        this.costBreakdown = { com: 0, footprint: 0, pathLength: 0, penalty: 0 };

        // Store positions
        this.originalPositions = new Map();  // Before optimization started
        this.bestPositions = new Map();      // Best found so far
        this.currentPositions = new Map();   // Current working positions

        // Store angles for angle optimization
        this.originalAngles = new Map();     // Before optimization started
        this.bestAngles = new Map();         // Best angles found so far
        this.currentAngles = new Map();      // Current working angles

        // Store initial beam segment lengths and angles for reference
        this.initialSegmentLengths = new Map();
        this.initialSegmentAngles = new Map();

        // Snapshot storage for Results View
        this.snapshots = [];
        this.originalLayout = null;

        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
        this.onStep = null;

        // Animation frame ID for cancellation
        this.animationFrameId = null;

        // Weights (will be set when starting)
        this.weights = { com: 0.5, footprint: 0.25, pathLength: 0.25 };
    }

    /**
     * Initialize the optimizer with current state
     */
    initialize(appState, weights) {
        this.weights = weights;

        const components = Array.from(appState.components.values());

        // Get list of movable component IDs (position can change)
        this.movableIds = components
            .filter(c => !c.isFixed)
            .map(c => c.id);

        // Get list of angle-movable component IDs (angle can change)
        this.angleMovableIds = components
            .filter(c => !c.isAngleFixed)
            .map(c => c.id);

        // Use adaptive parameters based on component count
        this.params = getAdaptiveParams(this.movableIds.length);

        this.temperature = this.params.initialTemp;
        this.stepSize = this.params.initialStepSize;
        this.iteration = 0;
        this.iterationsSinceImprovement = 0;
        this.acceptedMoves = 0;
        this.rejectedMoves = 0;

        // Store original positions and angles
        this.originalPositions.clear();
        this.bestPositions.clear();
        this.currentPositions.clear();
        this.originalAngles.clear();
        this.bestAngles.clear();
        this.currentAngles.clear();

        for (const comp of components) {
            const pos = { x: comp.position.x, y: comp.position.y };
            this.originalPositions.set(comp.id, { ...pos });
            this.bestPositions.set(comp.id, { ...pos });
            this.currentPositions.set(comp.id, { ...pos });

            // Store angles
            this.originalAngles.set(comp.id, comp.angle);
            this.bestAngles.set(comp.id, comp.angle);
            this.currentAngles.set(comp.id, comp.angle);
        }

        // Store initial segment lengths
        this.calculateInitialSegmentLengths(appState);

        // Calculate initial cost
        const initialResult = calculateTotalCost(appState, this.weights);
        this.currentCost = initialResult.total;
        this.bestCost = this.currentCost;
        this.initialCost = this.currentCost;
        this.costBreakdown = initialResult;

        this.appState = appState;

        // Store original layout for Results View
        this.snapshots = [];
        this.originalLayout = this.captureSnapshot(0);
    }

    /**
     * Calculate and store initial segment lengths and angles
     * These are the ACTUAL angles in the initial layout, which we want to preserve
     */
    calculateInitialSegmentLengths(appState) {
        this.initialSegmentLengths.clear();
        this.initialSegmentAngles.clear();
        const segments = appState.beamPath.getAllSegments();

        for (const segment of segments) {
            const sourceComp = appState.components.get(segment.sourceId);
            const targetComp = appState.components.get(segment.targetId);

            if (sourceComp && targetComp) {
                const dx = targetComp.position.x - sourceComp.position.x;
                const dy = targetComp.position.y - sourceComp.position.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                this.initialSegmentLengths.set(segment.id, length);

                // Store the actual beam angle from the initial layout
                if (length > 0.01) {
                    const angle = BeamPhysics.vectorToAngle({ x: dx, y: dy });
                    this.initialSegmentAngles.set(segment.id, angle);
                }
            }
        }
    }

    /**
     * Capture a snapshot of the current state for the Results View
     */
    captureSnapshot(iteration) {
        const positions = new Map();
        const angles = new Map();

        this.currentPositions.forEach((pos, id) => {
            positions.set(id, { ...pos });
        });
        this.currentAngles.forEach((angle, id) => {
            angles.set(id, angle);
        });

        return {
            iteration,
            cost: this.currentCost,
            costBreakdown: { ...this.costBreakdown },
            positions,
            angles
        };
    }

    /**
     * Start optimization
     */
    start(appState, weights) {
        if (this.state === OptimizerState.RUNNING) {
            return;
        }

        this.initialize(appState, weights);
        this.state = OptimizerState.RUNNING;
        this.runStep();
    }

    /**
     * Pause optimization
     */
    pause() {
        if (this.state === OptimizerState.RUNNING) {
            this.state = OptimizerState.PAUSED;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }

    /**
     * Resume optimization
     */
    resume() {
        if (this.state === OptimizerState.PAUSED) {
            this.state = OptimizerState.RUNNING;
            this.runStep();
        }
    }

    /**
     * Stop optimization
     */
    stop() {
        this.state = OptimizerState.IDLE;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Run a batch of optimization steps
     */
    runStep() {
        if (this.state !== OptimizerState.RUNNING) {
            return;
        }

        // Run many iterations per frame
        const iterationsPerFrame = 200;

        for (let i = 0; i < iterationsPerFrame; i++) {
            // Check stopping conditions
            if (this.iteration >= this.params.maxIterations ||
                this.temperature < this.params.finalTemp) {
                this.finish('maxIterations');
                return;
            }

            // Early stopping if no improvement
            if (this.iterationsSinceImprovement >= this.params.earlyStopIterations) {
                this.finish('earlyStop');
                return;
            }

            this.performIteration();
            this.iteration++;
            this.iterationsSinceImprovement++;

            // Store snapshot for Results View (sample every 10 iterations)
            if (this.iteration % 10 === 0) {
                this.snapshots.push(this.captureSnapshot(this.iteration));
            }

            // Cool down periodically
            if (this.iteration % this.params.iterationsPerTemp === 0) {
                this.temperature *= this.params.coolingRate;
                // Reduce step size as we cool
                this.stepSize = Math.max(
                    this.params.minStepSize,
                    this.stepSize * 0.998
                );
            }
        }

        // Calculate improvement percentage
        const improvement = this.initialCost > 0
            ? ((this.initialCost - this.bestCost) / this.initialCost) * 100
            : 0;

        // Report progress
        try {
            if (this.onProgress) {
                const progress = this.iteration / this.params.maxIterations;
                this.onProgress({
                    progress,
                    iteration: this.iteration,
                    maxIterations: this.params.maxIterations,
                    temperature: this.temperature,
                    currentCost: this.currentCost,
                    bestCost: this.bestCost,
                    initialCost: this.initialCost,
                    improvement,
                    stepSize: this.stepSize,
                    acceptRate: this.acceptedMoves / (this.acceptedMoves + this.rejectedMoves + 1) * 100,
                    costBreakdown: this.costBreakdown,
                    iterationsSinceImprovement: this.iterationsSinceImprovement
                });
            }

            // Live preview every few frames
            if (this.onStep && this.iteration % 400 === 0) {
                this.onStep(this.bestPositions);
            }
        } catch (err) {
            console.error('Error in optimizer callback:', err);
        }

        // Schedule next batch
        this.animationFrameId = requestAnimationFrame(() => this.runStep());
    }

    /**
     * Perform a single optimization iteration using constraint-preserving moves
     */
    performIteration() {
        const segments = this.appState.beamPath.getAllSegments();
        const hasBeamPath = segments.length > 0;
        const canMoveAngle = this.angleMovableIds.length > 0;

        if (this.movableIds.length === 0 && !canMoveAngle) {
            return;
        }

        // Choose move type based on what's available
        // Move types:
        // 1. Stretch segment (move component along beam direction) - preserves angles
        // 2. Rotate component (90° increments) - cascades to downstream
        // 3. Translate chain (move connected group together) - preserves geometry

        const rand = Math.random();

        if (hasBeamPath) {
            if (rand < 0.50) {
                // 50%: Stretch a segment (move along beam direction)
                this.performStretchMove(segments);
            } else if (rand < 0.75 && canMoveAngle) {
                // 25%: Rotate a component
                this.performRotateMove();
            } else {
                // 25%: Translate a chain
                this.performTranslateChainMove(segments);
            }
        } else {
            // No beam path - just do simple position moves
            this.performSimplePositionMove();
        }
    }

    /**
     * MOVE TYPE 1: Stretch a beam segment
     * Moves the target component along the beam direction (forward or backward)
     * This preserves beam angles by construction
     */
    performStretchMove(segments) {
        if (segments.length === 0) return;

        // Pick a random segment
        const segment = segments[Math.floor(Math.random() * segments.length)];
        const targetComp = this.appState.components.get(segment.targetId);
        const sourceComp = this.appState.components.get(segment.sourceId);

        if (!targetComp || !sourceComp || targetComp.isFixed) return;

        const sourcePos = this.currentPositions.get(segment.sourceId);
        const targetPos = this.currentPositions.get(segment.targetId);

        if (!sourcePos || !targetPos) return;

        // Calculate current beam direction
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);

        if (currentLength < 1) return;

        // Normalize direction
        const dirX = dx / currentLength;
        const dirY = dy / currentLength;

        // Generate length change
        const lengthChange = (Math.random() - 0.5) * 2 * this.stepSize;
        const newLength = Math.max(25, currentLength + lengthChange);

        // Calculate new target position along beam direction
        let newTargetPos = {
            x: sourcePos.x + dirX * newLength,
            y: sourcePos.y + dirY * newLength
        };

        // Snap to grid
        newTargetPos = BeamPhysics.snapToGrid(newTargetPos, 25);

        // Get downstream components
        const downstreamIds = this.getDownstreamComponents(segment.targetId);

        // Calculate displacement
        const displacement = {
            x: newTargetPos.x - targetPos.x,
            y: newTargetPos.y - targetPos.y
        };

        // Try the move
        const result = this.tryMove(segment.targetId, newTargetPos, downstreamIds, displacement);

        if (result.valid) {
            this.acceptOrRejectMove(result);
        } else {
            this.rejectedMoves++;
        }
    }

    /**
     * MOVE TYPE 2: Rotate a component by 90 degrees
     * Repositions all downstream components along new beam directions
     */
    performRotateMove() {
        if (this.angleMovableIds.length === 0) return;

        // Pick a random component that can rotate
        const compId = this.angleMovableIds[Math.floor(Math.random() * this.angleMovableIds.length)];
        const component = this.appState.components.get(compId);
        const currentAngle = this.currentAngles.get(compId);
        const originalAngle = this.originalAngles.get(compId);

        if (!component) return;

        // Get valid angles
        const validAngles = component.getValidAngles();

        // Filter to 90-degree increments from original
        const allowedAngles = validAngles.filter(angle => {
            const diff = ((angle - originalAngle) % 360 + 360) % 360;
            return diff === 0 || diff === 90 || diff === 180 || diff === 270;
        });

        if (allowedAngles.length <= 1) return;

        // Pick a different angle
        const otherAngles = allowedAngles.filter(a => Math.abs(a - currentAngle) > 1);
        if (otherAngles.length === 0) return;

        const newAngle = otherAngles[Math.floor(Math.random() * otherAngles.length)];
        const angleDelta = newAngle - currentAngle;

        // Try rotating with downstream repositioning
        const result = this.tryRotateWithDownstream(compId, newAngle, angleDelta);

        if (result.valid) {
            this.acceptOrRejectMove(result);
        } else {
            this.rejectedMoves++;
        }
    }

    /**
     * MOVE TYPE 3: Translate a connected chain of components
     * Moves a component and all downstream components by the same displacement
     * Uses grid-aligned displacements to preserve angles exactly
     */
    performTranslateChainMove(segments) {
        if (this.movableIds.length === 0) return;

        // Pick a random movable component
        const compId = this.movableIds[Math.floor(Math.random() * this.movableIds.length)];
        const component = this.appState.components.get(compId);
        const currentPos = this.currentPositions.get(compId);

        if (!component || !currentPos) return;

        // Generate GRID-ALIGNED displacement to preserve angles exactly
        // Pick random direction (cardinal or diagonal) and random number of grid steps
        const gridSize = 25;
        const maxSteps = Math.max(1, Math.floor(this.stepSize / gridSize));
        const steps = Math.floor(Math.random() * maxSteps) + 1;

        // 8 possible directions: cardinal (4) + diagonal (4)
        const directions = [
            { x: 1, y: 0 },   // right
            { x: -1, y: 0 },  // left
            { x: 0, y: 1 },   // down
            { x: 0, y: -1 },  // up
            { x: 1, y: 1 },   // diagonal
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: -1, y: -1 }
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];

        const displacement = {
            x: dir.x * steps * gridSize,
            y: dir.y * steps * gridSize
        };

        const newPos = {
            x: currentPos.x + displacement.x,
            y: currentPos.y + displacement.y
        };

        // Get all downstream components
        const downstreamIds = this.getDownstreamComponents(compId);

        // Try moving the whole chain
        const result = this.tryMoveChain(compId, newPos, downstreamIds, displacement);

        if (result.valid) {
            this.acceptOrRejectMove(result);
        } else {
            this.rejectedMoves++;
        }
    }

    /**
     * Simple position move for components not in beam path
     */
    performSimplePositionMove() {
        if (this.movableIds.length === 0) return;

        const compId = this.movableIds[Math.floor(Math.random() * this.movableIds.length)];
        const currentPos = this.currentPositions.get(compId);
        const component = this.appState.components.get(compId);

        if (!currentPos || !component) return;

        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * this.stepSize;
        let newPos = {
            x: currentPos.x + distance * Math.cos(angle),
            y: currentPos.y + distance * Math.sin(angle)
        };

        newPos = BeamPhysics.snapToGrid(newPos, 25);

        const result = this.tryMove(compId, newPos, new Set(), { x: 0, y: 0 });

        if (result.valid) {
            this.acceptOrRejectMove(result);
        } else {
            this.rejectedMoves++;
        }
    }

    /**
     * Try a move and validate it
     * Returns { valid, cost, costResult, positions, angles } or { valid: false }
     */
    tryMove(targetId, newTargetPos, downstreamIds, displacement) {
        const workspace = this.appState.constraints.workspace;
        const targetComp = this.appState.components.get(targetId);

        if (!targetComp) return { valid: false };

        // Build new positions map
        const newPositions = new Map();

        // Clamp target position to workspace
        const clampedTargetPos = this.clampToWorkspace(targetComp, newTargetPos, workspace);
        newPositions.set(targetId, clampedTargetPos);

        // Recalculate actual displacement after clamping
        const targetOldPos = this.currentPositions.get(targetId);
        const actualDisplacement = {
            x: clampedTargetPos.x - targetOldPos.x,
            y: clampedTargetPos.y - targetOldPos.y
        };

        // Move downstream components by the SAME displacement (no independent snapping!)
        for (const downId of downstreamIds) {
            const downComp = this.appState.components.get(downId);
            if (downComp && !downComp.isFixed) {
                const downOldPos = this.currentPositions.get(downId);
                if (downOldPos) {
                    let downNewPos = {
                        x: downOldPos.x + actualDisplacement.x,
                        y: downOldPos.y + actualDisplacement.y
                    };
                    downNewPos = this.clampToWorkspace(downComp, downNewPos, workspace);
                    newPositions.set(downId, downNewPos);
                }
            }
        }

        // Validate the move
        if (!this.validateMove(newPositions, null)) {
            return { valid: false };
        }

        // Calculate cost
        const costResult = this.calculateCostWithPositions(newPositions, null);

        return {
            valid: true,
            cost: costResult.total,
            costResult,
            positions: newPositions,
            angles: null
        };
    }

    /**
     * Try moving a chain (component + all downstream) by displacement
     * Displacement should be grid-aligned to preserve angles exactly
     */
    tryMoveChain(compId, newPos, downstreamIds, displacement) {
        const workspace = this.appState.constraints.workspace;
        const component = this.appState.components.get(compId);

        if (!component) return { valid: false };

        const newPositions = new Map();

        // Move the main component
        const clampedPos = this.clampToWorkspace(component, newPos, workspace);
        newPositions.set(compId, clampedPos);

        // Check if main component was clamped - if so, adjust displacement
        const actualDisplacement = {
            x: clampedPos.x - this.currentPositions.get(compId).x,
            y: clampedPos.y - this.currentPositions.get(compId).y
        };

        // Move all downstream by the SAME displacement (no independent snapping!)
        for (const downId of downstreamIds) {
            const downComp = this.appState.components.get(downId);
            if (downComp && !downComp.isFixed) {
                const downOldPos = this.currentPositions.get(downId);
                if (downOldPos) {
                    let downNewPos = {
                        x: downOldPos.x + actualDisplacement.x,
                        y: downOldPos.y + actualDisplacement.y
                    };
                    downNewPos = this.clampToWorkspace(downComp, downNewPos, workspace);
                    newPositions.set(downId, downNewPos);
                }
            }
        }

        // Validate
        if (!this.validateMove(newPositions, null)) {
            return { valid: false };
        }

        // Calculate cost
        const costResult = this.calculateCostWithPositions(newPositions, null);

        return {
            valid: true,
            cost: costResult.total,
            costResult,
            positions: newPositions,
            angles: null
        };
    }

    /**
     * Try rotating a component and repositioning downstream
     */
    tryRotateWithDownstream(compId, newAngle, angleDelta) {
        const workspace = this.appState.constraints.workspace;
        const component = this.appState.components.get(compId);
        const compPos = this.currentPositions.get(compId);

        if (!component || !compPos) return { valid: false };

        const newPositions = new Map();
        const newAngles = new Map();

        // Set new angle for the component
        newAngles.set(compId, newAngle);

        // Reposition downstream components along new beam directions
        const visited = new Set([compId]);
        this.repositionDownstreamForRotation(compId, newAngle, angleDelta, workspace, newPositions, newAngles, visited);

        // Validate
        if (!this.validateMove(newPositions, newAngles)) {
            return { valid: false };
        }

        // Calculate cost
        const costResult = this.calculateCostWithPositions(newPositions, newAngles);

        return {
            valid: true,
            cost: costResult.total,
            costResult,
            positions: newPositions,
            angles: newAngles
        };
    }

    /**
     * Recursively reposition downstream components after a rotation
     */
    repositionDownstreamForRotation(compId, newCompAngle, angleDelta, workspace, newPositions, newAngles, visited) {
        const component = this.appState.components.get(compId);
        const compPos = newPositions.get(compId) || this.currentPositions.get(compId);

        if (!component || !compPos) return;

        // Get outgoing segments
        const outgoingSegments = this.appState.beamPath.getOutgoingSegments(compId);

        for (const segment of outgoingSegments) {
            const targetComp = this.appState.components.get(segment.targetId);
            if (!targetComp || targetComp.isFixed || visited.has(segment.targetId)) continue;

            visited.add(segment.targetId);

            const targetOldPos = this.currentPositions.get(segment.targetId);
            if (!targetOldPos) continue;

            // Get current segment length
            const dx = targetOldPos.x - compPos.x;
            const dy = targetOldPos.y - compPos.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength < 1) continue;

            // Calculate old beam angle
            const oldBeamAngle = BeamPhysics.vectorToAngle({ x: dx, y: dy });

            // New beam angle rotates by same delta
            const newBeamAngle = BeamPhysics.normalizeAngle(oldBeamAngle + angleDelta);

            // Calculate new target position
            const dirVec = BeamPhysics.angleToVector(newBeamAngle);
            let newTargetPos = {
                x: compPos.x + dirVec.x * segmentLength,
                y: compPos.y + dirVec.y * segmentLength
            };

            newTargetPos = BeamPhysics.snapToGrid(newTargetPos, 25);
            newTargetPos = this.clampToWorkspace(targetComp, newTargetPos, workspace);

            newPositions.set(segment.targetId, newTargetPos);

            // Rotate target's angle too
            if (!targetComp.isAngleFixed) {
                const oldTargetAngle = this.currentAngles.get(segment.targetId) ?? targetComp.angle;
                const newTargetAngle = BeamPhysics.normalizeAngle(oldTargetAngle + angleDelta);
                newAngles.set(segment.targetId, newTargetAngle);
            }

            // Recurse
            const targetNewAngle = newAngles.get(segment.targetId) || this.currentAngles.get(segment.targetId);
            this.repositionDownstreamForRotation(segment.targetId, targetNewAngle, angleDelta, workspace, newPositions, newAngles, visited);
        }
    }

    /**
     * Validate a proposed move
     * Returns true if the move satisfies basic constraints:
     * - All components within workspace
     * - No severe component overlaps
     *
     * Note: Beam angle preservation is handled by the move types themselves:
     * - Stretch moves along beam direction (angle preserved by construction)
     * - Translate moves everything together (angles preserved)
     * - Rotate explicitly repositions downstream (angles intentionally changed)
     */
    validateMove(newPositions, newAngles) {
        const workspace = this.appState.constraints.workspace;
        const components = this.appState.components;

        // Create temporary position map
        const tempPositions = new Map(this.currentPositions);
        if (newPositions) {
            newPositions.forEach((pos, id) => tempPositions.set(id, pos));
        }

        // Check 1: All components within workspace
        const margin = 15;
        for (const [id, pos] of tempPositions) {
            const comp = components.get(id);
            if (!comp) continue;

            if (pos.x < margin || pos.y < margin ||
                pos.x > workspace.width - margin || pos.y > workspace.height - margin) {
                return false;
            }
        }

        // Check 2: No severe component overlaps
        const compList = Array.from(components.values());
        for (let i = 0; i < compList.length; i++) {
            for (let j = i + 1; j < compList.length; j++) {
                const comp1 = compList[i];
                const comp2 = compList[j];

                const pos1 = tempPositions.get(comp1.id);
                const pos2 = tempPositions.get(comp2.id);

                if (!pos1 || !pos2) continue;

                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Minimum distance based on component sizes
                const size1 = Math.max(comp1.size.width, comp1.size.height);
                const size2 = Math.max(comp2.size.width, comp2.size.height);
                const minDist = (size1 + size2) * 0.25;

                if (dist < minDist) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Calculate cost with temporary positions and angles
     */
    calculateCostWithPositions(newPositions, newAngles) {
        // Temporarily apply positions
        const savedPositions = new Map();
        const savedAngles = new Map();

        if (newPositions) {
            newPositions.forEach((pos, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    savedPositions.set(id, { ...comp.position });
                    comp.position = pos;
                }
            });
        }

        if (newAngles) {
            newAngles.forEach((angle, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    savedAngles.set(id, comp.angle);
                    comp.angle = angle;
                }
            });
        }

        // Calculate cost
        const costResult = calculateTotalCost(this.appState, this.weights);

        // Restore
        savedPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) comp.position = pos;
        });

        savedAngles.forEach((angle, id) => {
            const comp = this.appState.components.get(id);
            if (comp) comp.angle = angle;
        });

        return costResult;
    }

    /**
     * Accept or reject a move using simulated annealing criteria
     */
    acceptOrRejectMove(result) {
        const deltaCost = result.cost - this.currentCost;
        const accept = deltaCost < 0 || Math.random() < Math.exp(-deltaCost / this.temperature);

        if (accept) {
            // Apply the move
            if (result.positions) {
                result.positions.forEach((pos, id) => {
                    const comp = this.appState.components.get(id);
                    if (comp) {
                        comp.position = pos;
                        this.currentPositions.set(id, pos);
                    }
                });
            }

            if (result.angles) {
                result.angles.forEach((angle, id) => {
                    const comp = this.appState.components.get(id);
                    if (comp) {
                        comp.angle = angle;
                        this.currentAngles.set(id, angle);
                    }
                });
            }

            this.currentCost = result.cost;
            this.acceptedMoves++;

            // Update best if improved
            if (result.cost < this.bestCost) {
                this.bestCost = result.cost;
                this.costBreakdown = result.costResult;
                this.iterationsSinceImprovement = 0;

                this.currentPositions.forEach((pos, id) => {
                    this.bestPositions.set(id, { ...pos });
                });
                this.currentAngles.forEach((angle, id) => {
                    this.bestAngles.set(id, angle);
                });
            }
        } else {
            this.rejectedMoves++;
        }
    }

    /**
     * Get all components downstream from a component
     */
    getDownstreamComponents(compId, visited = new Set()) {
        if (visited.has(compId)) return visited;

        const outgoing = this.appState.beamPath.getOutgoingSegments(compId);
        for (const segment of outgoing) {
            if (!visited.has(segment.targetId)) {
                visited.add(segment.targetId);
                this.getDownstreamComponents(segment.targetId, visited);
            }
        }
        return visited;
    }

    /**
     * Clamp position to workspace bounds
     */
    clampToWorkspace(component, pos, workspace) {
        const margin = Math.max(component.size.width, component.size.height) / 2 + 10;

        return {
            x: Math.max(margin, Math.min(workspace.width - margin, pos.x)),
            y: Math.max(margin, Math.min(workspace.height - margin, pos.y))
        };
    }

    /**
     * Finish optimization
     */
    finish(reason = 'complete') {
        this.state = OptimizerState.FINISHED;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Apply best positions
        this.bestPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) {
                comp.position = { ...pos };
            }
        });

        // Apply best angles
        this.bestAngles.forEach((angle, id) => {
            const comp = this.appState.components.get(id);
            if (comp) {
                comp.angle = angle;
            }
        });

        const improvement = this.initialCost > 0
            ? ((this.initialCost - this.bestCost) / this.initialCost) * 100
            : 0;

        if (this.onComplete) {
            this.onComplete({
                reason,
                iteration: this.iteration,
                maxIterations: this.params.maxIterations,
                initialCost: this.initialCost,
                bestCost: this.bestCost,
                improvement,
                costBreakdown: this.costBreakdown
            });
        }
    }

    /**
     * Get original positions (for revert)
     */
    getOriginalPositions() {
        return new Map(this.originalPositions);
    }

    /**
     * Get best positions found
     */
    getBestPositions() {
        return new Map(this.bestPositions);
    }

    /**
     * Get original angles (for revert)
     */
    getOriginalAngles() {
        return new Map(this.originalAngles);
    }

    /**
     * Get best angles found
     */
    getBestAngles() {
        return new Map(this.bestAngles);
    }

    /**
     * Apply positions to components
     */
    applyPositions(positions, components) {
        positions.forEach((pos, id) => {
            const comp = components.get(id);
            if (comp) {
                comp.position = { ...pos };
            }
        });
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Get progress info
     */
    getProgress() {
        return {
            state: this.state,
            progress: this.iteration / this.params.maxIterations,
            iteration: this.iteration,
            maxIterations: this.params.maxIterations,
            temperature: this.temperature,
            currentCost: this.currentCost,
            bestCost: this.bestCost
        };
    }

    /**
     * Get all snapshots for Results View
     */
    getSnapshots() {
        return this.snapshots;
    }

    /**
     * Get the original layout (before optimization started)
     */
    getOriginalLayout() {
        return this.originalLayout;
    }

    /**
     * Get a snapshot at a specific index
     */
    getSnapshotAt(index) {
        if (index >= 0 && index < this.snapshots.length) {
            return this.snapshots[index];
        }
        return null;
    }

    /**
     * Find the best snapshot (lowest cost)
     */
    getBestSnapshot() {
        if (this.snapshots.length === 0) return null;

        let best = this.snapshots[0];
        for (const snapshot of this.snapshots) {
            if (snapshot.cost < best.cost) {
                best = snapshot;
            }
        }
        return best;
    }

    /**
     * Apply a snapshot to the current state
     */
    applySnapshot(snapshot, components) {
        if (!snapshot) return;

        // Apply positions
        snapshot.positions.forEach((pos, id) => {
            const comp = components.get(id);
            if (comp) {
                comp.position = { ...pos };
            }
        });

        // Apply angles
        snapshot.angles.forEach((angle, id) => {
            const comp = components.get(id);
            if (comp) {
                comp.angle = angle;
            }
        });
    }
}

export default Optimizer;
