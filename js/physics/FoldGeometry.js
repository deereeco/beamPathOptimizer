/**
 * FoldGeometry.js - Geometric calculations for fold-based path length constraints
 *
 * Handles calculations for 0, 1, and 2 fold configurations between lenses:
 * - 0 folds: Straight line (parallel lenses)
 * - 1 fold: L-shaped path (perpendicular lenses)
 * - 2 folds: Z-shaped path (opposite-facing lenses)
 */

import * as BeamPhysics from './BeamPhysics.js';

/**
 * Determine required fold count based on angular difference between lenses
 * @param {number} angle1 - First lens angle (degrees)
 * @param {number} angle2 - Second lens angle (degrees)
 * @returns {number} - 0, 1, or 2 folds required
 */
export function determineFoldCount(angle1, angle2) {
    let angleDiff = Math.abs(BeamPhysics.normalizeAngle(angle2) - BeamPhysics.normalizeAngle(angle1));
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff < 45) return 0;       // 0-45°: parallel lenses
    if (angleDiff < 135) return 1;      // 45-135°: perpendicular lenses
    return 2;                            // 135-180°: opposite-facing lenses
}

/**
 * Calculate geometry for zero-fold (straight line) configuration
 * @param {Object} lens1 - First lens {position: {x, y}, angle}
 * @param {Object} lens2 - Second lens {position: {x, y}, angle}
 * @param {number} targetLength - Target path length (mm)
 * @returns {Object|null} - Geometry result or null if invalid
 */
export function calculateZeroFold(lens1, lens2, targetLength) {
    const dx = lens2.position.x - lens1.position.x;
    const dy = lens2.position.y - lens1.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if path length matches distance (within tolerance)
    const lengthError = Math.abs(distance - targetLength);
    if (lengthError > Math.max(targetLength * 0.05, 5.0)) {  // 5% or 5mm tolerance, whichever is larger
        return {
            valid: false,
            error: `Distance ${distance.toFixed(1)}mm ≠ target ${targetLength.toFixed(1)}mm`,
            foldCount: 0,
            folds: [],
            segments: []
        };
    }

    // For 0-fold, just check that lenses are roughly parallel (already checked by determineFoldCount)
    // The straight line between them doesn't need to align with lens angles
    // This allows horizontal/vertical lenses at any positions

    return {
        valid: true,
        foldCount: 0,
        folds: [],
        segments: [{
            start: lens1.position,
            end: lens2.position,
            length: distance
        }],
        error: null
    };
}

/**
 * Calculate geometry for one-fold (L-shaped) configuration
 * @param {Object} lens1 - First lens {position: {x, y}, angle}
 * @param {Object} lens2 - Second lens {position: {x, y}, angle}
 * @param {number} targetLength - Target path length (mm)
 * @returns {Object|null} - Geometry result or null if invalid
 */
export function calculateOneFold(lens1, lens2, targetLength) {
    // Direction vectors for beam outputs
    const d1 = BeamPhysics.angleToVector(lens1.angle);
    const d2 = BeamPhysics.angleToVector(lens2.angle + 180);  // Input to lens2 (reversed)

    // Check perpendicularity (dot product should be ~0 for 90° bend)
    const dot = d1.x * d2.x + d1.y * d2.y;
    if (Math.abs(dot) > 0.2) {  // Allow some tolerance
        return {
            valid: false,
            error: 'Lenses not perpendicular for single fold',
            foldCount: 1,
            folds: [],
            segments: []
        };
    }

    // Solve parametric ray intersection: F = L1 + t1*d1 = L2 + t2*d2
    // With constraint: t1 + t2 = targetLength
    const dx = lens2.position.x - lens1.position.x;
    const dy = lens2.position.y - lens1.position.y;

    // Matrix determinant for 2D ray intersection
    const det = d1.x * d2.y - d1.y * d2.x;

    if (Math.abs(det) < 0.001) {
        return {
            valid: false,
            error: 'Rays are parallel (degenerate geometry)',
            foldCount: 1,
            folds: [],
            segments: []
        };
    }

    // Solve for t1 (distance from lens1 to fold)
    const t1 = (dx * d2.y - dy * d2.x) / det;
    const t2 = targetLength - t1;

    // Check if both segments are positive
    if (t1 < 0 || t2 < 0) {
        return {
            valid: false,
            error: `Invalid fold position: t1=${t1.toFixed(1)}, t2=${t2.toFixed(1)}`,
            foldCount: 1,
            folds: [],
            segments: []
        };
    }

    // Calculate fold position
    const fold = {
        x: lens1.position.x + t1 * d1.x,
        y: lens1.position.y + t1 * d1.y
    };

    // Verify the fold position from lens2's perspective
    const foldCheck = {
        x: lens2.position.x + t2 * d2.x,
        y: lens2.position.y + t2 * d2.y
    };

    const checkError = Math.sqrt(
        Math.pow(fold.x - foldCheck.x, 2) +
        Math.pow(fold.y - foldCheck.y, 2)
    );

    if (checkError > 1.0) {  // 1mm tolerance
        return {
            valid: false,
            error: `Fold position mismatch: ${checkError.toFixed(2)}mm`,
            foldCount: 1,
            folds: [fold],
            segments: []
        };
    }

    return {
        valid: true,
        foldCount: 1,
        folds: [fold],
        segments: [
            {
                start: lens1.position,
                end: fold,
                length: t1
            },
            {
                start: fold,
                end: lens2.position,
                length: t2
            }
        ],
        error: null
    };
}

/**
 * Calculate geometry for two-fold (Z-shaped) configuration
 * @param {Object} lens1 - First lens {position: {x, y}, angle}
 * @param {Object} lens2 - Second lens {position: {x, y}, angle}
 * @param {number} targetLength - Target path length (mm)
 * @returns {Object|null} - Geometry result or null if invalid
 */
export function calculateTwoFolds(lens1, lens2, targetLength) {
    // Direction vectors
    const d1 = BeamPhysics.angleToVector(lens1.angle);
    const d2 = BeamPhysics.angleToVector(lens2.angle + 180);  // Input to lens2

    // Check if lenses are opposite-facing (dot product should be ~-1)
    const dot = d1.x * d2.x + d1.y * d2.y;
    if (dot > -0.7) {
        return {
            valid: false,
            error: 'Lenses not opposite-facing for double fold',
            foldCount: 2,
            folds: [],
            segments: []
        };
    }

    // Perpendicular direction for middle segment (rotate d1 by 90°)
    const dp = { x: -d1.y, y: d1.x };

    // Project lens2-lens1 onto perpendicular to get middle segment length
    const dx = lens2.position.x - lens1.position.x;
    const dy = lens2.position.y - lens1.position.y;
    const tm = Math.abs(dx * dp.x + dy * dp.y);

    // Symmetric side segments
    const tSide = (targetLength - tm) / 2;

    if (tSide < 0) {
        return {
            valid: false,
            error: `Path too short: need ${tm.toFixed(1)}mm middle + positive sides`,
            foldCount: 2,
            folds: [],
            segments: []
        };
    }

    // Calculate first fold position
    const fold1 = {
        x: lens1.position.x + tSide * d1.x,
        y: lens1.position.y + tSide * d1.y
    };

    // Calculate second fold position
    const fold2 = {
        x: fold1.x + tm * dp.x,
        y: fold1.y + tm * dp.y
    };

    // Verify fold2 relative to lens2
    const expectedFold2 = {
        x: lens2.position.x + tSide * d2.x,
        y: lens2.position.y + tSide * d2.y
    };

    const checkError = Math.sqrt(
        Math.pow(fold2.x - expectedFold2.x, 2) +
        Math.pow(fold2.y - expectedFold2.y, 2)
    );

    if (checkError > 2.0) {  // 2mm tolerance for double fold
        return {
            valid: false,
            error: `Fold positions don't align: ${checkError.toFixed(2)}mm error`,
            foldCount: 2,
            folds: [fold1, fold2],
            segments: []
        };
    }

    return {
        valid: true,
        foldCount: 2,
        folds: [fold1, fold2],
        segments: [
            {
                start: lens1.position,
                end: fold1,
                length: tSide
            },
            {
                start: fold1,
                end: fold2,
                length: tm
            },
            {
                start: fold2,
                end: lens2.position,
                length: tSide
            }
        ],
        error: null
    };
}

/**
 * Master calculation function - auto-detects fold count and calculates geometry
 * @param {Object} lens1 - First lens {position: {x, y}, angle, type}
 * @param {Object} lens2 - Second lens {position: {x, y}, angle, type}
 * @param {number} targetLength - Target path length (mm)
 * @returns {Object} - Complete geometry result with validation
 */
export function calculate(lens1, lens2, targetLength) {
    // Validate inputs
    if (!lens1 || !lens2 || !targetLength) {
        return {
            valid: false,
            foldCount: 0,
            folds: [],
            segments: [],
            error: 'Invalid input parameters'
        };
    }

    // Auto-detect required fold count
    const foldCount = determineFoldCount(lens1.angle, lens2.angle);

    // Calculate geometry based on fold count
    let result;
    switch (foldCount) {
        case 0:
            result = calculateZeroFold(lens1, lens2, targetLength);
            break;
        case 1:
            result = calculateOneFold(lens1, lens2, targetLength);
            break;
        case 2:
            result = calculateTwoFolds(lens1, lens2, targetLength);
            break;
        default:
            result = {
                valid: false,
                foldCount: foldCount,
                folds: [],
                segments: [],
                error: `Unsupported fold count: ${foldCount}`
            };
    }

    return result;
}

/**
 * Check if fold geometry is solvable for given configuration
 * @param {Object} lens1 - First lens
 * @param {Object} lens2 - Second lens
 * @param {number} foldCount - Number of folds (0, 1, or 2)
 * @param {number} targetLength - Target path length
 * @returns {boolean} - True if geometry is solvable
 */
export function isGeometrySolvable(lens1, lens2, foldCount, targetLength) {
    const dx = lens2.position.x - lens1.position.x;
    const dy = lens2.position.y - lens1.position.y;
    const straightDistance = Math.sqrt(dx * dx + dy * dy);

    if (foldCount === 0) {
        // Straight path: distance must match target length
        return Math.abs(straightDistance - targetLength) < targetLength * 0.05;
    }

    if (foldCount === 1) {
        // L-path: target length must be >= Manhattan distance
        const manhattan = Math.abs(dx) + Math.abs(dy);
        return targetLength >= manhattan * 0.95;
    }

    if (foldCount === 2) {
        // Z-path: target length must be >= straight distance + some buffer
        return targetLength >= straightDistance * 1.1;
    }

    return false;
}
