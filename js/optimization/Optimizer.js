/**
 * Simulated Annealing Optimizer for beam path component placement
 */

import { calculateTotalCost } from './CostFunction.js';
import * as BeamPhysics from '../physics/BeamPhysics.js';

/**
 * Default optimizer parameters
 */
export const DEFAULT_PARAMS = {
    initialTemp: 100,
    finalTemp: 0.1,
    coolingRate: 0.99,
    iterationsPerTemp: 20,
    maxIterations: 10000,
    initialStepSize: 50,  // mm
    minStepSize: 1,       // mm
    earlyStopIterations: 1000  // Stop if no improvement for this many iterations
};

/**
 * Get adaptive parameters based on number of movable components
 */
export function getAdaptiveParams(movableCount) {
    // Scale iterations based on complexity
    const baseIterations = Math.max(500, movableCount * 300);

    return {
        ...DEFAULT_PARAMS,
        maxIterations: Math.min(baseIterations, 5000),
        iterationsPerTemp: Math.max(10, movableCount * 5),
        coolingRate: movableCount <= 5 ? 0.98 : 0.99,
        earlyStopIterations: Math.max(200, movableCount * 100)
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

        // Store relative beam angles for constrained optimization
        // Each component stores its beam input/output angles relative to its own orientation
        this.relativeBeamAngles = new Map();

        // Snapshot storage for Results View (Feature 2)
        this.snapshots = [];                 // Array of iteration snapshots
        this.originalLayout = null;          // Layout before optimization started

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

        // Calculate initial cost
        const initialResult = calculateTotalCost(appState, this.weights);
        this.currentCost = initialResult.total;
        this.bestCost = this.currentCost;
        this.initialCost = this.currentCost;
        this.costBreakdown = initialResult;

        this.appState = appState;

        // Calculate relative beam angles for constrained optimization
        this.calculateRelativeBeamAngles();

        // Store original layout for Results View
        this.snapshots = [];
        this.originalLayout = this.captureSnapshot(0);
    }

    /**
     * Calculate and store relative beam angles for each component.
     * These are the beam input/output angles relative to the component's own orientation.
     * This allows us to preserve the beam geometry when components rotate.
     */
    calculateRelativeBeamAngles() {
        this.relativeBeamAngles.clear();

        const segments = this.appState.beamPath.getAllSegments();
        if (segments.length === 0) return;

        // Process each component that's in the beam path
        const components = this.appState.components;

        for (const [compId, component] of components) {
            const relativeAngles = {
                inputs: [],   // Array of { fromId, relativeAngle }
                outputs: []   // Array of { toId, port, relativeAngle }
            };

            const compAngle = component.angle;

            // Get incoming beam angles
            const incomingSegments = this.appState.beamPath.getIncomingSegments(compId);
            for (const segment of incomingSegments) {
                const sourceComp = components.get(segment.sourceId);
                if (sourceComp) {
                    const sourcePos = sourceComp.position;
                    const targetPos = component.position;
                    const beamAngle = BeamPhysics.calculateBeamAngle(sourcePos, targetPos);
                    if (beamAngle !== null) {
                        // Relative angle: beam angle from the component's reference frame
                        const relativeInputAngle = BeamPhysics.normalizeAngleDiff(beamAngle - compAngle);
                        relativeAngles.inputs.push({
                            fromId: segment.sourceId,
                            relativeAngle: relativeInputAngle
                        });
                    }
                }
            }

            // Get outgoing beam angles
            const outgoingSegments = this.appState.beamPath.getOutgoingSegments(compId);
            for (const segment of outgoingSegments) {
                const targetComp = components.get(segment.targetId);
                if (targetComp) {
                    const sourcePos = component.position;
                    const targetPos = targetComp.position;
                    const beamAngle = BeamPhysics.calculateBeamAngle(sourcePos, targetPos);
                    if (beamAngle !== null) {
                        // Relative angle: output beam angle from the component's reference frame
                        const relativeOutputAngle = BeamPhysics.normalizeAngleDiff(beamAngle - compAngle);
                        relativeAngles.outputs.push({
                            toId: segment.targetId,
                            port: segment.sourcePort,
                            relativeAngle: relativeOutputAngle
                        });
                    }
                }
            }

            this.relativeBeamAngles.set(compId, relativeAngles);
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
     * Try moving a component by translating all downstream components by the same displacement.
     * Returns the resulting cost and the new positions, without actually applying them.
     */
    tryMoveWithTranslation(targetId, newTargetPos, downstreamIds) {
        const workspace = this.appState.constraints.workspace;
        const targetComp = this.appState.components.get(targetId);
        const oldTargetPos = this.currentPositions.get(targetId);

        if (!targetComp || !oldTargetPos) return { cost: Infinity, positions: null };

        // Calculate displacement
        const displacement = {
            x: newTargetPos.x - oldTargetPos.x,
            y: newTargetPos.y - oldTargetPos.y
        };

        // Temporarily apply the move to calculate cost
        const tempPositions = new Map();

        // Move the target
        let snappedTargetPos = targetComp.snapToGrid !== false
            ? BeamPhysics.snapToGrid(newTargetPos, 25)
            : newTargetPos;
        snappedTargetPos = this.clampToWorkspace(targetComp, snappedTargetPos, workspace);
        tempPositions.set(targetId, snappedTargetPos);

        // Move downstream components by the same displacement
        for (const downId of downstreamIds) {
            const downComp = this.appState.components.get(downId);
            if (downComp && !downComp.isFixed) {
                const downOldPos = this.currentPositions.get(downId);
                if (downOldPos) {
                    let downNewPos = {
                        x: downOldPos.x + displacement.x,
                        y: downOldPos.y + displacement.y
                    };
                    if (downComp.snapToGrid !== false) {
                        downNewPos = BeamPhysics.snapToGrid(downNewPos, 25);
                    }
                    downNewPos = this.clampToWorkspace(downComp, downNewPos, workspace);
                    tempPositions.set(downId, downNewPos);
                }
            }
        }

        // Temporarily apply positions to calculate cost
        const savedPositions = new Map();
        tempPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) {
                savedPositions.set(id, { ...comp.position });
                comp.position = pos;
            }
        });

        const costResult = calculateTotalCost(this.appState, this.weights);

        // Restore original positions
        savedPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) comp.position = pos;
        });

        return { cost: costResult.total, costResult, positions: tempPositions };
    }

    /**
     * Try moving a component by rotating all downstream components around the new position.
     * This preserves the relative beam angles from the component's perspective.
     * Returns the resulting cost and the new positions, without actually applying them.
     */
    tryMoveWithRotation(sourceId, targetId, newTargetPos, downstreamIds) {
        const workspace = this.appState.constraints.workspace;
        const targetComp = this.appState.components.get(targetId);
        const sourceComp = this.appState.components.get(sourceId);
        const oldTargetPos = this.currentPositions.get(targetId);
        const sourcePos = this.currentPositions.get(sourceId);

        if (!targetComp || !sourceComp || !oldTargetPos || !sourcePos) {
            return { cost: Infinity, positions: null, angles: null };
        }

        // Calculate old and new beam angles from source to target
        const oldBeamAngle = BeamPhysics.calculateBeamAngle(sourcePos, oldTargetPos);
        const newBeamAngle = BeamPhysics.calculateBeamAngle(sourcePos, newTargetPos);

        if (oldBeamAngle === null || newBeamAngle === null) {
            return { cost: Infinity, positions: null, angles: null };
        }

        // The rotation angle needed
        const rotationAngle = BeamPhysics.normalizeAngleDiff(newBeamAngle - oldBeamAngle);

        // Temporarily apply the move and rotation to calculate cost
        const tempPositions = new Map();
        const tempAngles = new Map();

        // Move the target to new position
        let snappedTargetPos = targetComp.snapToGrid !== false
            ? BeamPhysics.snapToGrid(newTargetPos, 25)
            : newTargetPos;
        snappedTargetPos = this.clampToWorkspace(targetComp, snappedTargetPos, workspace);
        tempPositions.set(targetId, snappedTargetPos);

        // Rotate target's angle if it's not a transmission component that should stay aligned
        if (!targetComp.isAngleFixed) {
            const oldAngle = this.currentAngles.get(targetId) ?? targetComp.angle;
            const newAngle = BeamPhysics.normalizeAngle(oldAngle + rotationAngle);
            tempAngles.set(targetId, newAngle);
        }

        // Rotate downstream components around the target's NEW position
        for (const downId of downstreamIds) {
            const downComp = this.appState.components.get(downId);
            if (downComp) {
                // Rotate position around new target position
                if (!downComp.isFixed) {
                    const downOldPos = this.currentPositions.get(downId);
                    if (downOldPos) {
                        let downNewPos = this.rotatePointAroundPivot(downOldPos, snappedTargetPos, rotationAngle);
                        if (downComp.snapToGrid !== false) {
                            downNewPos = BeamPhysics.snapToGrid(downNewPos, 25);
                        }
                        downNewPos = this.clampToWorkspace(downComp, downNewPos, workspace);
                        tempPositions.set(downId, downNewPos);
                    }
                }

                // Rotate angle
                if (!downComp.isAngleFixed) {
                    const oldDownAngle = this.currentAngles.get(downId) ?? downComp.angle;
                    const newDownAngle = BeamPhysics.normalizeAngle(oldDownAngle + rotationAngle);
                    tempAngles.set(downId, newDownAngle);
                }
            }
        }

        // Temporarily apply positions and angles to calculate cost
        const savedPositions = new Map();
        const savedAngles = new Map();

        tempPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) {
                savedPositions.set(id, { ...comp.position });
                comp.position = pos;
            }
        });

        tempAngles.forEach((angle, id) => {
            const comp = this.appState.components.get(id);
            if (comp) {
                savedAngles.set(id, comp.angle);
                comp.angle = angle;
            }
        });

        const costResult = calculateTotalCost(this.appState, this.weights);

        // Restore original positions and angles
        savedPositions.forEach((pos, id) => {
            const comp = this.appState.components.get(id);
            if (comp) comp.position = pos;
        });

        savedAngles.forEach((angle, id) => {
            const comp = this.appState.components.get(id);
            if (comp) comp.angle = angle;
        });

        return { cost: costResult.total, costResult, positions: tempPositions, angles: tempAngles };
    }

    /**
     * Apply a set of positions and angles to the actual components and current state
     */
    applyTrialMove(positions, angles = null) {
        if (positions) {
            positions.forEach((pos, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    comp.position = pos;
                    this.currentPositions.set(id, pos);
                }
            });
        }

        if (angles) {
            angles.forEach((angle, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    comp.angle = angle;
                    this.currentAngles.set(id, angle);
                }
            });
        }
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

        // Run many iterations per frame - 200 is fast enough to feel responsive
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

            // Store snapshot for Results View (sample every 10 iterations for efficiency)
            if (this.iteration % 10 === 0) {
                this.snapshots.push(this.captureSnapshot(this.iteration));
            }

            // Cool down periodically
            if (this.iteration % this.params.iterationsPerTemp === 0) {
                this.temperature *= this.params.coolingRate;
                // Reduce step size as we cool
                this.stepSize = Math.max(
                    this.params.minStepSize,
                    this.stepSize * this.params.coolingRate
                );
            }
        }

        // Calculate improvement percentage
        const improvement = this.initialCost > 0
            ? ((this.initialCost - this.bestCost) / this.initialCost) * 100
            : 0;

        // Report progress (wrapped in try/catch to prevent freezing)
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
                    acceptRate: this.acceptedMoves / (this.acceptedMoves + this.rejectedMoves) * 100,
                    costBreakdown: this.costBreakdown,
                    iterationsSinceImprovement: this.iterationsSinceImprovement
                });
            }

            // Notify step callback with best positions for live preview
            // Only update every few frames to reduce render overhead
            if (this.onStep && this.iteration % 400 === 0) {
                this.onStep(this.bestPositions);
            }
        } catch (err) {
            console.error('Error in optimizer callback:', err);
        }

        // Schedule next batch (always, even if callbacks fail)
        this.animationFrameId = requestAnimationFrame(() => this.runStep());
    }

    /**
     * Perform a single SA iteration - constrained optimization that preserves beam geometry.
     * For each move, tries both translation and rotation options, picking the lower cost.
     */
    performIteration() {
        const canMovePosition = this.movableIds.length > 0;
        const canMoveAngle = this.angleMovableIds.length > 0;

        if (!canMovePosition && !canMoveAngle) {
            return;
        }

        // Decide whether to move position or angle
        // 30% chance for angle if both are available
        const moveAngle = canMoveAngle && (!canMovePosition || Math.random() < 0.3);

        if (moveAngle) {
            this.performAngleIteration();
            return;
        }

        // Get all beam segments
        const segments = this.appState.beamPath.getAllSegments();
        if (segments.length === 0) {
            // No beam path - fall back to simple position move
            this.performSimplePositionMove();
            return;
        }

        // Pick a random segment to adjust
        const segmentIndex = Math.floor(Math.random() * segments.length);
        const segment = segments[segmentIndex];

        const sourceComp = this.appState.components.get(segment.sourceId);
        const targetComp = this.appState.components.get(segment.targetId);

        if (!sourceComp || !targetComp || targetComp.isFixed) {
            // Can't adjust - try simple move instead
            this.performSimplePositionMove();
            return;
        }

        const sourcePos = this.currentPositions.get(segment.sourceId);
        const targetPos = this.currentPositions.get(segment.targetId);

        if (!sourcePos || !targetPos) return;

        // Calculate current segment direction and length
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);

        if (currentLength < 1) return;

        // Generate a random perturbation
        // Either: change length along current direction, or move perpendicular
        const moveType = Math.random();

        let newTargetPos;

        if (moveType < 0.7) {
            // 70%: Change segment length (along current direction)
            const lengthChange = (Math.random() - 0.5) * 2 * this.stepSize;
            const newLength = Math.max(25, currentLength + lengthChange);
            const dirX = dx / currentLength;
            const dirY = dy / currentLength;
            newTargetPos = {
                x: sourcePos.x + dirX * newLength,
                y: sourcePos.y + dirY * newLength
            };
        } else {
            // 30%: Random displacement (allows exploring different angles)
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * this.stepSize;
            newTargetPos = {
                x: targetPos.x + distance * Math.cos(angle),
                y: targetPos.y + distance * Math.sin(angle)
            };
        }

        // Get downstream components
        const downstreamIds = this.getDownstreamComponents(segment.targetId);

        // Store original state for potential revert
        const savedPositions = new Map();
        const savedAngles = new Map();
        savedPositions.set(segment.targetId, { ...targetComp.position });
        this.currentPositions.forEach((pos, id) => {
            savedPositions.set(id, { ...pos });
        });
        this.currentAngles.forEach((angle, id) => {
            savedAngles.set(id, angle);
        });

        // Try both options and pick the best one
        const translationResult = this.tryMoveWithTranslation(segment.targetId, newTargetPos, downstreamIds);
        const rotationResult = this.tryMoveWithRotation(segment.sourceId, segment.targetId, newTargetPos, downstreamIds);

        // Pick the better option
        let bestOption = null;
        let bestCost = Infinity;
        let bestCostResult = null;

        if (translationResult.cost < rotationResult.cost) {
            bestOption = { positions: translationResult.positions, angles: null };
            bestCost = translationResult.cost;
            bestCostResult = translationResult.costResult;
        } else if (rotationResult.cost < Infinity) {
            bestOption = { positions: rotationResult.positions, angles: rotationResult.angles };
            bestCost = rotationResult.cost;
            bestCostResult = rotationResult.costResult;
        }

        if (!bestOption || bestCost === Infinity) {
            return;  // No valid move found
        }

        // Decide whether to accept using simulated annealing
        const deltaCost = bestCost - this.currentCost;
        const accept = deltaCost < 0 ||
            Math.random() < Math.exp(-deltaCost / this.temperature);

        if (accept) {
            // Apply the move
            this.applyTrialMove(bestOption.positions, bestOption.angles);
            this.currentCost = bestCost;
            this.acceptedMoves++;

            // Update best if improved
            if (bestCost < this.bestCost) {
                this.bestCost = bestCost;
                this.costBreakdown = bestCostResult;
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
     * Simple position move for components not in beam path
     */
    performSimplePositionMove() {
        if (this.movableIds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.movableIds.length);
        const compId = this.movableIds[randomIndex];
        const currentPos = this.currentPositions.get(compId);
        const component = this.appState.components.get(compId);

        if (!currentPos || !component) return;

        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * this.stepSize;
        let newPos = {
            x: currentPos.x + distance * Math.cos(angle),
            y: currentPos.y + distance * Math.sin(angle)
        };

        const workspace = this.appState.constraints.workspace;
        newPos = this.clampToWorkspace(component, newPos, workspace);

        if (component.snapToGrid !== false) {
            newPos = BeamPhysics.snapToGrid(newPos, 25);
        }

        const oldPos = { ...component.position };
        component.position = newPos;
        this.currentPositions.set(compId, newPos);

        const newCostResult = calculateTotalCost(this.appState, this.weights);
        const newCost = newCostResult.total;

        const deltaCost = newCost - this.currentCost;
        const accept = deltaCost < 0 ||
            Math.random() < Math.exp(-deltaCost / this.temperature);

        if (accept) {
            this.currentCost = newCost;
            this.acceptedMoves++;

            if (newCost < this.bestCost) {
                this.bestCost = newCost;
                this.costBreakdown = newCostResult;
                this.iterationsSinceImprovement = 0;
                this.currentPositions.forEach((pos, id) => {
                    this.bestPositions.set(id, { ...pos });
                });
                this.currentAngles.forEach((angle, id) => {
                    this.bestAngles.set(id, angle);
                });
            }
        } else {
            component.position = oldPos;
            this.currentPositions.set(compId, oldPos);
            this.rejectedMoves++;
        }
    }

    /**
     * Rotate a point around a pivot point by a given angle (in degrees)
     */
    rotatePointAroundPivot(point, pivot, angleDeg) {
        const rad = BeamPhysics.degToRad(angleDeg);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Translate to origin
        const dx = point.x - pivot.x;
        const dy = point.y - pivot.y;

        // Rotate
        const newX = dx * cos - dy * sin;
        const newY = dx * sin + dy * cos;

        // Translate back
        return {
            x: newX + pivot.x,
            y: newY + pivot.y
        };
    }

    /**
     * Get all components connected downstream from a component (recursively)
     * Returns a Set of component IDs
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
     * Perform a single angle optimization iteration
     * Angles are only changed in 90-degree increments from the original angle
     * When angle changes, downstream components are repositioned along the new beam direction
     * while preserving their relative beam angles from their own perspective.
     */
    performAngleIteration() {
        if (this.angleMovableIds.length === 0) {
            return;
        }

        // Pick a random angle-movable component
        const randomIndex = Math.floor(Math.random() * this.angleMovableIds.length);
        const compId = this.angleMovableIds[randomIndex];
        const component = this.appState.components.get(compId);
        const currentAngle = this.currentAngles.get(compId);
        const originalAngle = this.originalAngles.get(compId);

        // Get valid angles for this component type
        const validAngles = component.getValidAngles();

        // Filter to only allow 90-degree increments from the original angle
        const allowedAngles = validAngles.filter(angle => {
            const diff = ((angle - originalAngle) % 360 + 360) % 360;
            return diff === 0 || diff === 90 || diff === 180 || diff === 270;
        });

        if (allowedAngles.length <= 1) {
            return;  // No angle options available
        }

        // Pick a random new angle (different from current)
        const otherAngles = allowedAngles.filter(a => a !== currentAngle);
        if (otherAngles.length === 0) return;

        const newAngle = otherAngles[Math.floor(Math.random() * otherAngles.length)];
        const angleDelta = newAngle - currentAngle;

        // Store old state for potential revert
        const oldAngle = component.angle;
        const savedPositions = new Map();
        const savedAngles = new Map();

        // Save all current positions and angles
        this.currentPositions.forEach((pos, id) => {
            savedPositions.set(id, { ...pos });
        });
        this.currentAngles.forEach((angle, id) => {
            savedAngles.set(id, angle);
        });

        // Apply the angle change to the component
        component.angle = newAngle;
        this.currentAngles.set(compId, newAngle);

        // Get the relative beam angles for this component
        const relativeAngles = this.relativeBeamAngles.get(compId);
        const workspace = this.appState.constraints.workspace;

        // Recursively reposition downstream components along the rotated beam path
        // preserving segment lengths and relative angles
        if (relativeAngles && relativeAngles.outputs.length > 0) {
            this.repositionDownstreamForRotation(compId, angleDelta, workspace);
        }

        // Calculate new cost
        const newCostResult = calculateTotalCost(this.appState, this.weights);
        const newCost = newCostResult.total;

        // Decide whether to accept
        const deltaCost = newCost - this.currentCost;
        const accept = deltaCost < 0 ||
            Math.random() < Math.exp(-deltaCost / this.temperature);

        if (accept) {
            // Accept the angle change
            this.currentCost = newCost;
            this.acceptedMoves++;

            // Update best if improved
            if (newCost < this.bestCost) {
                this.bestCost = newCost;
                this.costBreakdown = newCostResult;
                this.iterationsSinceImprovement = 0;
                this.currentPositions.forEach((pos, id) => {
                    this.bestPositions.set(id, { ...pos });
                });
                this.currentAngles.forEach((angle, id) => {
                    this.bestAngles.set(id, angle);
                });
            }
        } else {
            // Reject - revert all positions and angles
            component.angle = oldAngle;

            savedPositions.forEach((pos, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    comp.position = pos;
                    this.currentPositions.set(id, pos);
                }
            });

            savedAngles.forEach((angle, id) => {
                const comp = this.appState.components.get(id);
                if (comp) {
                    comp.angle = angle;
                    this.currentAngles.set(id, angle);
                }
            });

            this.rejectedMoves++;
        }
    }

    /**
     * Recursively reposition downstream components when a component rotates.
     * Preserves segment lengths and rotates component angles to maintain their
     * relative beam input/output angles from their own perspective.
     */
    repositionDownstreamForRotation(compId, angleDelta, workspace, visited = new Set()) {
        if (visited.has(compId)) return;
        visited.add(compId);

        const component = this.appState.components.get(compId);
        const compPos = this.currentPositions.get(compId);
        const relativeAngles = this.relativeBeamAngles.get(compId);

        if (!component || !compPos || !relativeAngles) return;

        // For each outgoing beam segment
        const outgoingSegments = this.appState.beamPath.getOutgoingSegments(compId);

        for (const segment of outgoingSegments) {
            const targetComp = this.appState.components.get(segment.targetId);
            if (!targetComp || targetComp.isFixed) continue;

            const targetOldPos = this.currentPositions.get(segment.targetId);
            if (!targetOldPos) continue;

            // Find the relative output angle for this segment
            const outputInfo = relativeAngles.outputs.find(o => o.toId === segment.targetId);
            if (!outputInfo) continue;

            // Calculate the current segment length
            const dx = targetOldPos.x - compPos.x;
            const dy = targetOldPos.y - compPos.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength < 1) continue;

            // Calculate new absolute output beam direction
            // The component rotated by angleDelta, so the absolute output direction rotates too
            const currentCompAngle = this.currentAngles.get(compId);
            const newAbsoluteOutputAngle = BeamPhysics.normalizeAngle(currentCompAngle + outputInfo.relativeAngle);

            // Calculate new target position along the rotated beam direction
            const dirVec = BeamPhysics.angleToVector(newAbsoluteOutputAngle);
            let newTargetPos = {
                x: compPos.x + dirVec.x * segmentLength,
                y: compPos.y + dirVec.y * segmentLength
            };

            // Apply grid snapping and workspace constraints
            if (targetComp.snapToGrid !== false) {
                newTargetPos = BeamPhysics.snapToGrid(newTargetPos, 25);
            }
            newTargetPos = this.clampToWorkspace(targetComp, newTargetPos, workspace);

            // Update target component position
            targetComp.position = newTargetPos;
            this.currentPositions.set(segment.targetId, newTargetPos);

            // Rotate the target component's angle by the same delta
            // This preserves its relative beam input angle from its own perspective
            if (!targetComp.isAngleFixed) {
                const oldTargetAngle = this.currentAngles.get(segment.targetId) ?? targetComp.angle;
                const newTargetAngle = BeamPhysics.normalizeAngle(oldTargetAngle + angleDelta);
                targetComp.angle = newTargetAngle;
                this.currentAngles.set(segment.targetId, newTargetAngle);
            }

            // Recursively reposition this target's downstream components
            this.repositionDownstreamForRotation(segment.targetId, angleDelta, workspace, visited);
        }
    }

    /**
     * Clamp a position so the component (and its mount zone) stays within workspace
     */
    clampToWorkspace(component, pos, workspace) {
        // Get component's half-dimensions from its bounding box at origin
        const originalPos = component.position;
        component.position = { x: 0, y: 0 };
        const bbox = component.getBoundingBox();
        component.position = originalPos;

        // Component extents relative to its center position
        const compLeft = bbox.minX;
        const compRight = bbox.maxX;
        const compTop = bbox.minY;
        const compBottom = bbox.maxY;

        // Start with component bounds
        let minX = -compLeft;
        let maxX = workspace.width - compRight;
        let minY = -compTop;
        let maxY = workspace.height - compBottom;

        // If component has mount zone, expand the constraints
        if (component.mountZone && component.mountZone.enabled) {
            const padding = component.mountZone.padding || { x: 10, y: 10 };
            const offset = component.mountZone.offset || { x: 0, y: 0 };

            // Mount zone extends beyond component bounds
            const mountLeft = compLeft - padding.x + offset.x;
            const mountRight = compRight + padding.x + offset.x;
            const mountTop = compTop - padding.y + offset.y;
            const mountBottom = compBottom + padding.y + offset.y;

            minX = Math.max(minX, -mountLeft);
            maxX = Math.min(maxX, workspace.width - mountRight);
            minY = Math.max(minY, -mountTop);
            maxY = Math.min(maxY, workspace.height - mountBottom);
        }

        // Clamp the position
        return {
            x: Math.max(minX, Math.min(maxX, pos.x)),
            y: Math.max(minY, Math.min(maxY, pos.y))
        };
    }

    /**
     * Constrain position based on fixed path length constraints
     * If an incoming or outgoing segment has a fixed length, constrain the position
     */
    constrainToFixedLengths(component, proposedPos) {
        const beamPath = this.appState.beamPath;

        // Get incoming segments with fixed length
        const incomingSegments = beamPath.getIncomingSegments(component.id);
        for (const segment of incomingSegments) {
            if (segment.isFixedLength && segment.fixedLength !== null) {
                const sourceComp = this.appState.components.get(segment.sourceId);
                if (sourceComp) {
                    // Constrain to circle at fixed distance from source
                    const fixedDist = segment.fixedLength;
                    const sourcePos = sourceComp.position;

                    // Calculate direction from source to proposed position
                    const dx = proposedPos.x - sourcePos.x;
                    const dy = proposedPos.y - sourcePos.y;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);

                    if (currentDist > 0) {
                        // Project to the fixed distance
                        proposedPos = {
                            x: sourcePos.x + (dx / currentDist) * fixedDist,
                            y: sourcePos.y + (dy / currentDist) * fixedDist
                        };
                    }
                }
            }
        }

        // Get outgoing segments with fixed length
        const outgoingSegments = beamPath.getOutgoingSegments(component.id);
        for (const segment of outgoingSegments) {
            if (segment.isFixedLength && segment.fixedLength !== null) {
                const targetComp = this.appState.components.get(segment.targetId);
                if (targetComp && !targetComp.isFixed) {
                    // The target needs to move too, but we handle that through
                    // the cost function penalty - it will naturally converge
                }
            }
        }

        return proposedPos;
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
     * Apply a snapshot to the current state.
     * Used by Results View to preview or apply a selected iteration.
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
