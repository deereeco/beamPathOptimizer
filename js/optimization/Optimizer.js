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

        // Get list of movable component IDs
        this.movableIds = components
            .filter(c => !c.isFixed)
            .map(c => c.id);

        // Use adaptive parameters based on component count
        this.params = getAdaptiveParams(this.movableIds.length);

        this.temperature = this.params.initialTemp;
        this.stepSize = this.params.initialStepSize;
        this.iteration = 0;
        this.iterationsSinceImprovement = 0;
        this.acceptedMoves = 0;
        this.rejectedMoves = 0;

        // Store original positions
        this.originalPositions.clear();
        this.bestPositions.clear();
        this.currentPositions.clear();

        for (const comp of components) {
            const pos = { x: comp.position.x, y: comp.position.y };
            this.originalPositions.set(comp.id, { ...pos });
            this.bestPositions.set(comp.id, { ...pos });
            this.currentPositions.set(comp.id, { ...pos });
        }

        // Calculate initial cost
        const initialResult = calculateTotalCost(appState, this.weights);
        this.currentCost = initialResult.total;
        this.bestCost = this.currentCost;
        this.initialCost = this.currentCost;
        this.costBreakdown = initialResult;

        this.appState = appState;
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
     * Perform a single SA iteration
     */
    performIteration() {
        if (this.movableIds.length === 0) {
            return;
        }

        // Pick a random movable component
        const randomIndex = Math.floor(Math.random() * this.movableIds.length);
        const compId = this.movableIds[randomIndex];
        const currentPos = this.currentPositions.get(compId);

        // Generate a random move
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * this.stepSize;
        let newPos = {
            x: currentPos.x + distance * Math.cos(angle),
            y: currentPos.y + distance * Math.sin(angle)
        };

        // Clamp position to keep component within workspace
        const component = this.appState.components.get(compId);
        const workspace = this.appState.constraints.workspace;
        newPos = this.clampToWorkspace(component, newPos, workspace);

        // Apply grid snapping if enabled for this component
        if (component.snapToGrid !== false) {
            newPos = BeamPhysics.snapToGrid(newPos, 25);  // 25mm grid
        }

        // Handle fixed path length constraints
        newPos = this.constrainToFixedLengths(component, newPos);

        // Apply the move temporarily
        const oldPos = { ...component.position };
        component.position = newPos;
        this.currentPositions.set(compId, newPos);

        // Calculate new cost
        const newCostResult = calculateTotalCost(this.appState, this.weights);
        const newCost = newCostResult.total;

        // Decide whether to accept
        const deltaCost = newCost - this.currentCost;
        const accept = deltaCost < 0 ||
            Math.random() < Math.exp(-deltaCost / this.temperature);

        if (accept) {
            // Accept the move
            this.currentCost = newCost;
            this.acceptedMoves++;

            // Update best if improved
            if (newCost < this.bestCost) {
                this.bestCost = newCost;
                this.costBreakdown = newCostResult;
                this.iterationsSinceImprovement = 0;  // Reset early stop counter
                // Copy all current positions to best
                this.currentPositions.forEach((pos, id) => {
                    this.bestPositions.set(id, { ...pos });
                });
            }
        } else {
            // Reject - revert the move
            component.position = oldPos;
            this.currentPositions.set(compId, oldPos);
            this.rejectedMoves++;
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
}

export default Optimizer;
