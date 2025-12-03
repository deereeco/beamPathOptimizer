/**
 * Main canvas renderer for the beam path optimizer
 */

import { ComponentType, ComponentDefaults } from '../models/Component.js';
import { BRANCH_COLORS } from '../models/BeamPath.js';

/**
 * Renderer class handles all canvas drawing
 */
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Grid settings
        this.gridSize = 25; // mm
        this.showGrid = true;

        // Colors
        this.colors = {
            background: '#0d1117',
            gridMinor: '#1e293b',
            gridMajor: '#334155',
            workspace: '#1a1a2e',
            workspaceBorder: '#3b82f6',
            selection: '#3b82f6',
            selectionFill: 'rgba(59, 130, 246, 0.2)',
            hover: '#60a5fa',
            com: '#f59e0b',
            mountingZone: 'rgba(34, 197, 94, 0.15)',
            mountingZoneBorder: '#22c55e',
            keepOutZone: 'rgba(239, 68, 68, 0.2)',
            keepOutZoneBorder: '#ef4444',
            componentMountZone: 'rgba(255, 165, 0, 0.15)',
            componentMountZoneBorder: '#ffa500'
        };

        // Bind resize handler
        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);
        this.handleResize();
    }

    /**
     * Handle canvas resize
     */
    handleResize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Set canvas size to match container (with device pixel ratio for sharpness)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Scale context for device pixel ratio
        this.ctx.scale(dpr, dpr);

        // Store logical size
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Clear the canvas
     */
    clear() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Draw workspace background (color or image)
     */
    drawBackground(background, workspace, viewport) {
        if (!background) return;

        const ctx = this.ctx;
        ctx.save();
        this.applyViewportTransform(viewport);

        // Calculate workspace bounds (centered at origin)
        const halfW = workspace.width / 2;
        const halfH = workspace.height / 2;
        const x = -halfW;
        const y = -halfH;
        const width = workspace.width;
        const height = workspace.height;

        if (background.type === 'color' && background.color) {
            ctx.fillStyle = background.color;
            ctx.fillRect(x, y, width, height);
        } else if (background.type === 'image' && background.imageData) {
            try {
                // Apply opacity for background image
                const opacity = (background.opacity !== undefined) ? background.opacity / 100 : 1.0;
                ctx.globalAlpha = opacity;
                ctx.drawImage(background.imageData, x, y, width, height);
                ctx.globalAlpha = 1.0; // Reset
            } catch (e) {
                // If image fails to draw, fall back to color
                ctx.fillStyle = background.color || this.colors.background;
                ctx.fillRect(x, y, width, height);
            }
        }

        ctx.restore();
    }

    /**
     * Apply viewport transform (pan and zoom)
     */
    applyViewportTransform(viewport) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        this.ctx.translate(centerX + viewport.panX, centerY + viewport.panY);
        this.ctx.scale(viewport.zoom, viewport.zoom);
    }

    /**
     * Convert screen coordinates to world coordinates
     */
    screenToWorld(screenX, screenY, viewport) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        return {
            x: (screenX - centerX - viewport.panX) / viewport.zoom,
            y: (screenY - centerY - viewport.panY) / viewport.zoom
        };
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(worldX, worldY, viewport) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        return {
            x: worldX * viewport.zoom + centerX + viewport.panX,
            y: worldY * viewport.zoom + centerY + viewport.panY
        };
    }

    /**
     * Draw the workspace grid
     */
    drawGrid(workspace, viewport) {
        if (!this.showGrid) return;

        const ctx = this.ctx;
        const gridSize = this.gridSize * viewport.zoom;

        // Calculate visible area in world coordinates
        const topLeft = this.screenToWorld(0, 0, viewport);
        const bottomRight = this.screenToWorld(this.width, this.height, viewport);

        // Draw minor grid lines
        ctx.strokeStyle = this.colors.gridMinor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        // Vertical lines
        const startX = Math.floor(topLeft.x / this.gridSize) * this.gridSize;
        for (let x = startX; x <= bottomRight.x; x += this.gridSize) {
            const screen = this.worldToScreen(x, 0, viewport);
            ctx.moveTo(screen.x, 0);
            ctx.lineTo(screen.x, this.height);
        }

        // Horizontal lines
        const startY = Math.floor(topLeft.y / this.gridSize) * this.gridSize;
        for (let y = startY; y <= bottomRight.y; y += this.gridSize) {
            const screen = this.worldToScreen(0, y, viewport);
            ctx.moveTo(0, screen.y);
            ctx.lineTo(this.width, screen.y);
        }

        ctx.stroke();

        // Draw major grid lines (every 100mm)
        const majorGridSize = 100;
        ctx.strokeStyle = this.colors.gridMajor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Vertical major lines
        const majorStartX = Math.floor(topLeft.x / majorGridSize) * majorGridSize;
        for (let x = majorStartX; x <= bottomRight.x; x += majorGridSize) {
            const screen = this.worldToScreen(x, 0, viewport);
            ctx.moveTo(screen.x, 0);
            ctx.lineTo(screen.x, this.height);
        }

        // Horizontal major lines
        const majorStartY = Math.floor(topLeft.y / majorGridSize) * majorGridSize;
        for (let y = majorStartY; y <= bottomRight.y; y += majorGridSize) {
            const screen = this.worldToScreen(0, y, viewport);
            ctx.moveTo(0, screen.y);
            ctx.lineTo(this.width, screen.y);
        }

        ctx.stroke();
    }

    /**
     * Draw the workspace boundary
     */
    drawWorkspace(workspace, viewport, background) {
        const ctx = this.ctx;

        // Calculate workspace corners in screen coordinates
        const halfW = workspace.width / 2;
        const halfH = workspace.height / 2;

        const topLeft = this.worldToScreen(-halfW, -halfH, viewport);
        const bottomRight = this.worldToScreen(halfW, halfH, viewport);

        const w = bottomRight.x - topLeft.x;
        const h = bottomRight.y - topLeft.y;

        // Fill workspace area only if no custom background is set
        // (Check if background is default or if only default color is set)
        const hasCustomBackground = background && (
            (background.type === 'image' && background.imagePath) ||
            (background.type === 'color' && background.color !== '#0d1117')
        );

        if (!hasCustomBackground) {
            ctx.fillStyle = this.colors.workspace;
            ctx.fillRect(topLeft.x, topLeft.y, w, h);
        }

        // Draw border
        ctx.strokeStyle = this.colors.workspaceBorder;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(topLeft.x, topLeft.y, w, h);
        ctx.setLineDash([]);

        // Draw origin marker
        const origin = this.worldToScreen(0, 0, viewport);
        ctx.strokeStyle = this.colors.gridMajor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(origin.x - 10, origin.y);
        ctx.lineTo(origin.x + 10, origin.y);
        ctx.moveTo(origin.x, origin.y - 10);
        ctx.lineTo(origin.x, origin.y + 10);
        ctx.stroke();
    }

    /**
     * Draw keep-out zones
     */
    drawKeepOutZones(zones, viewport, selectedZoneId = null, hoveredZoneId = null) {
        const ctx = this.ctx;

        zones.forEach(zone => {
            if (!zone.isActive) return;

            const zoneIdKey = `keepout:${zone.id}`;
            const isSelected = selectedZoneId === zoneIdKey;
            const isHovered = hoveredZoneId === zoneIdKey;

            const topLeft = this.worldToScreen(zone.bounds.x, zone.bounds.y, viewport);
            const bottomRight = this.worldToScreen(
                zone.bounds.x + zone.bounds.width,
                zone.bounds.y + zone.bounds.height,
                viewport
            );

            const w = bottomRight.x - topLeft.x;
            const h = bottomRight.y - topLeft.y;

            // Fill
            ctx.fillStyle = this.colors.keepOutZone;
            ctx.fillRect(topLeft.x, topLeft.y, w, h);

            // Border - highlight if selected or hovered
            ctx.strokeStyle = isSelected ? this.colors.selection :
                             isHovered ? this.colors.hover : this.colors.keepOutZoneBorder;
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.setLineDash(isSelected ? [] : [4, 4]);
            ctx.strokeRect(topLeft.x, topLeft.y, w, h);
            ctx.setLineDash([]);

            // Selection handles when selected
            if (isSelected) {
                this.drawResizeHandles(ctx, topLeft.x, topLeft.y, w, h);
            }

            // Label
            ctx.fillStyle = this.colors.keepOutZoneBorder;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(zone.name || 'KEEP-OUT', topLeft.x + w / 2, topLeft.y + h / 2);
        });
    }

    /**
     * Draw resize handles for selected zone
     */
    drawResizeHandles(ctx, x, y, w, h) {
        const handleSize = 8;
        ctx.fillStyle = this.colors.selection;

        // Corner handles
        const handles = [
            { x: x, y: y },                     // top-left
            { x: x + w, y: y },                 // top-right
            { x: x + w, y: y + h },             // bottom-right
            { x: x, y: y + h },                 // bottom-left
            { x: x + w / 2, y: y },             // top-center
            { x: x + w, y: y + h / 2 },         // right-center
            { x: x + w / 2, y: y + h },         // bottom-center
            { x: x, y: y + h / 2 }              // left-center
        ];

        handles.forEach(handle => {
            ctx.fillRect(
                handle.x - handleSize / 2,
                handle.y - handleSize / 2,
                handleSize,
                handleSize
            );
        });
    }

    /**
     * Draw mounting zone
     */
    drawMountingZone(zone, viewport, selectedZoneId = null, hoveredZoneId = null) {
        if (!zone) return;

        const ctx = this.ctx;
        const isSelected = selectedZoneId === 'mounting';
        const isHovered = hoveredZoneId === 'mounting';

        const topLeft = this.worldToScreen(zone.bounds.x, zone.bounds.y, viewport);
        const bottomRight = this.worldToScreen(
            zone.bounds.x + zone.bounds.width,
            zone.bounds.y + zone.bounds.height,
            viewport
        );

        const w = bottomRight.x - topLeft.x;
        const h = bottomRight.y - topLeft.y;

        // Fill
        ctx.fillStyle = this.colors.mountingZone;
        ctx.fillRect(topLeft.x, topLeft.y, w, h);

        // Border - highlight if selected or hovered
        ctx.strokeStyle = isSelected ? this.colors.selection :
                         isHovered ? this.colors.hover : this.colors.mountingZoneBorder;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(topLeft.x, topLeft.y, w, h);

        // Selection handles when selected
        if (isSelected) {
            this.drawResizeHandles(ctx, topLeft.x, topLeft.y, w, h);
        }

        // Label
        ctx.fillStyle = this.colors.mountingZoneBorder;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name || 'MOUNT ZONE', topLeft.x + w / 2, topLeft.y + h / 2);

        // Center crosshair
        const centerX = topLeft.x + w / 2;
        const centerY = topLeft.y + h / 2;
        ctx.strokeStyle = this.colors.mountingZoneBorder;
        ctx.beginPath();
        ctx.moveTo(centerX - 8, centerY);
        ctx.lineTo(centerX + 8, centerY);
        ctx.moveTo(centerX, centerY - 8);
        ctx.lineTo(centerX, centerY + 8);
        ctx.stroke();
    }

    /**
     * Draw center of mass indicator
     */
    drawCenterOfMass(com, isInZone, viewport) {
        if (!com) return;

        const ctx = this.ctx;
        const screen = this.worldToScreen(com.x, com.y, viewport);

        const color = isInZone ? '#22c55e' : '#ef4444';

        // Draw crosshair
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x - 15, screen.y);
        ctx.lineTo(screen.x + 15, screen.y);
        ctx.moveTo(screen.x, screen.y - 15);
        ctx.lineTo(screen.x, screen.y + 15);
        ctx.stroke();

        // Draw circle
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        ctx.fillStyle = color;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('CoM', screen.x + 12, screen.y - 5);
    }

    /**
     * Draw component mount zone (keep-out zone around a component's physical mount)
     */
    drawComponentMountZone(component, isSelected, viewport, hasViolation = false) {
        const mountBounds = component.getMountZoneBounds();
        if (!mountBounds) return;

        const ctx = this.ctx;

        const topLeft = this.worldToScreen(mountBounds.x, mountBounds.y, viewport);
        const bottomRight = this.worldToScreen(
            mountBounds.x + mountBounds.width,
            mountBounds.y + mountBounds.height,
            viewport
        );

        const w = bottomRight.x - topLeft.x;
        const h = bottomRight.y - topLeft.y;

        // Fill - red tint if violation, orange otherwise
        ctx.fillStyle = hasViolation
            ? 'rgba(239, 68, 68, 0.2)'
            : this.colors.componentMountZone;
        ctx.fillRect(topLeft.x, topLeft.y, w, h);

        // Border
        ctx.strokeStyle = hasViolation
            ? this.colors.keepOutZoneBorder
            : (isSelected ? this.colors.selection : this.colors.componentMountZoneBorder);
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(topLeft.x, topLeft.y, w, h);
        ctx.setLineDash([]);
    }

    /**
     * Draw a single component
     */
    drawComponent(component, isSelected, isHovered, viewport, labelsVisible = true) {
        const ctx = this.ctx;
        const screen = this.worldToScreen(component.position.x, component.position.y, viewport);

        ctx.save();
        ctx.translate(screen.x, screen.y);

        // Rotate component based on its angle property (applies to all components including sources)
        ctx.rotate((component.angle * Math.PI) / 180);

        const halfW = (component.size.width * viewport.zoom) / 2;
        const halfH = (component.size.height * viewport.zoom) / 2;

        // Draw component shape based on type
        const defaults = ComponentDefaults[component.type];
        const color = component.color || defaults?.color || '#888';

        // Component body
        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? this.colors.selection :
                         isHovered ? this.colors.hover : '#ffffff44';
        ctx.lineWidth = isSelected ? 3 : 2;

        // Draw shape based on type
        switch (component.type) {
            case ComponentType.SOURCE:
                this.drawSourceShape(ctx, halfW, halfH, color);
                break;
            case ComponentType.DETECTOR:
                this.drawDetectorShape(ctx, halfW, halfH, color);
                break;
            case ComponentType.LENS:
                this.drawLensShape(ctx, halfW, halfH, color);
                break;
            case ComponentType.BEAM_SPLITTER:
                this.drawBeamSplitterShape(ctx, halfW, halfH, color);
                break;
            default:
                // Default rectangle (mirrors, waveplates, filters)
                ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
                ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
        }

        // Selection highlight
        if (isSelected) {
            ctx.fillStyle = this.colors.selectionFill;
            ctx.fillRect(-halfW - 4, -halfH - 4, halfW * 2 + 8, halfH * 2 + 8);
        }

        ctx.restore();

        // Draw label with smart positioning (pass background for contrast calculation)
        this.drawComponentLabel(ctx, component, screen, halfW, halfH, labelsVisible, this.currentBackground);

        // Draw fixed indicator
        if (component.isFixed) {
            ctx.fillStyle = '#f59e0b';
            ctx.font = '10px sans-serif';
            ctx.fillText('🔒', screen.x + halfW + 5, screen.y - halfH);
        }
    }

    /**
     * Draw component label with smart positioning
     */
    drawComponentLabel(ctx, component, screen, halfW, halfH, labelsVisible, background) {
        // Check if labels should be shown
        if (!labelsVisible || !component.labelVisible) {
            return;
        }

        // Calculate label position based on labelPosition setting
        const labelPos = this.calculateLabelPosition(component, screen, halfW, halfH);

        // Draw label with background for visibility
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const labelText = component.name;
        const textMetrics = ctx.measureText(labelText);
        const textWidth = textMetrics.width;
        const textHeight = 11; // font size
        const padding = 4;

        // Determine label colors based on background
        const labelColors = this.calculateLabelColors(component, background);

        // Draw background rectangle
        ctx.fillStyle = labelColors.background;
        ctx.fillRect(
            labelPos.x - textWidth / 2 - padding,
            labelPos.y - textHeight + 2,
            textWidth + padding * 2,
            textHeight + padding
        );

        // Draw text
        ctx.fillStyle = labelColors.text;
        ctx.fillText(labelText, labelPos.x, labelPos.y);
    }

    /**
     * Calculate label colors that contrast with workspace background
     */
    calculateLabelColors(component, background) {
        // If component has custom label background color, use it
        if (component.labelBackgroundColor && component.labelBackgroundColor !== 'auto') {
            const bgColor = component.labelBackgroundColor;
            const isDark = this.isColorDark(bgColor);
            return {
                background: bgColor,
                text: isDark ? '#ffffff' : '#000000'
            };
        }

        // Auto mode: contrast with workspace background
        const workspaceBgColor = background?.color || '#0d1117';
        const isWorkspaceDark = this.isColorDark(workspaceBgColor);

        if (isWorkspaceDark) {
            // Dark workspace: light label background, dark text
            return {
                background: 'rgba(255, 255, 255, 0.9)',
                text: workspaceBgColor
            };
        } else {
            // Light workspace: dark label background, light text
            return {
                background: 'rgba(0, 0, 0, 0.8)',
                text: workspaceBgColor
            };
        }
    }

    /**
     * Determine if a color is dark or light based on luminance
     */
    isColorDark(color) {
        // Parse color (handle hex, rgb, rgba)
        let r, g, b;

        if (color.startsWith('#')) {
            // Hex color
            const hex = color.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.substr(0, 2), 16);
                g = parseInt(hex.substr(2, 2), 16);
                b = parseInt(hex.substr(4, 2), 16);
            }
        } else if (color.startsWith('rgb')) {
            // RGB or RGBA
            const matches = color.match(/\d+/g);
            if (matches && matches.length >= 3) {
                r = parseInt(matches[0]);
                g = parseInt(matches[1]);
                b = parseInt(matches[2]);
            }
        } else {
            // Default to dark if we can't parse
            return true;
        }

        // Calculate relative luminance (ITU-R BT.709)
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

        // Threshold of 0.5 (darker than 50% is considered dark)
        return luminance < 0.5;
    }

    /**
     * Calculate label position based on component angle and labelPosition setting
     * For 'auto' mode, label is placed on the "short end" of the component
     */
    calculateLabelPosition(component, screen, halfW, halfH) {
        const offset = 14; // Distance from component edge
        let position = component.labelPosition || 'auto';

        // For 'auto' mode, determine best position based on component angle
        if (position === 'auto') {
            // Normalize angle to 0-360
            const angle = ((component.angle % 360) + 360) % 360;

            // Determine if component is more horizontal or vertical
            // For components at 0° or 180°, label should be top/bottom (perpendicular to long axis)
            // For components at 90° or 270°, label should be left/right
            if (angle >= 315 || angle < 45) {
                position = 'bottom'; // 0° - horizontal component, label below
            } else if (angle >= 45 && angle < 135) {
                position = 'right'; // 90° - vertical component, label to right
            } else if (angle >= 135 && angle < 225) {
                position = 'top'; // 180° - horizontal component, label above
            } else {
                position = 'left'; // 270° - vertical component, label to left
            }
        }

        // Calculate position based on direction
        switch (position) {
            case 'top':
                return { x: screen.x, y: screen.y - halfH - offset };
            case 'bottom':
                return { x: screen.x, y: screen.y + halfH + offset };
            case 'left':
                return { x: screen.x - halfW - 20, y: screen.y + 4 };
            case 'right':
                return { x: screen.x + halfW + 20, y: screen.y + 4 };
            default:
                return { x: screen.x, y: screen.y + halfH + offset };
        }
    }

    /**
     * Draw source shape (arrow pointing right)
     */
    drawSourceShape(ctx, halfW, halfH, color) {
        ctx.beginPath();
        ctx.moveTo(-halfW, -halfH);
        ctx.lineTo(halfW - halfH, -halfH);
        ctx.lineTo(halfW, 0);
        ctx.lineTo(halfW - halfH, halfH);
        ctx.lineTo(-halfW, halfH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw detector shape (square with filled circle)
     */
    drawDetectorShape(ctx, halfW, halfH, color) {
        ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

        // Inner circle
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(halfW, halfH) * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw lens shape (convex lens)
     */
    drawLensShape(ctx, halfW, halfH, color) {
        ctx.beginPath();
        ctx.ellipse(0, 0, halfW, halfH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw beam splitter shape (tilted square)
     */
    drawBeamSplitterShape(ctx, halfW, halfH, color) {
        ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

        // Diagonal line indicating splitting surface
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-halfW, halfH);
        ctx.lineTo(halfW, -halfH);
        ctx.stroke();
    }

    /**
     * Draw beam paths
     */
    drawBeamPaths(beamPath, components, viewport, selection = {}, wavelengths = []) {
        const ctx = this.ctx;
        const componentMap = new Map();
        components.forEach(c => componentMap.set(c.id, c));

        // Build wavelength lookup map
        const wavelengthMap = new Map();
        wavelengths.forEach(w => wavelengthMap.set(w.id, w));

        const selectedSegmentIds = selection.selectedSegmentIds || [];
        const hoveredSegmentId = selection.hoveredSegmentId;

        beamPath.getAllSegments().forEach(segment => {
            const source = componentMap.get(segment.sourceId);
            if (!source) return;

            // Determine end position: either target component or explicit endPoint
            let endWorldPos;
            if (segment.targetId) {
                const target = componentMap.get(segment.targetId);
                if (!target) return;
                endWorldPos = target.position;
            } else if (segment.endPoint) {
                // Beam terminates at workspace boundary
                endWorldPos = segment.endPoint;
            } else {
                return; // No valid endpoint
            }

            const startScreen = this.worldToScreen(source.position.x, source.position.y, viewport);
            const endScreen = this.worldToScreen(endWorldPos.x, endWorldPos.y, viewport);

            const isSelected = selectedSegmentIds.includes(segment.id);
            const isHovered = hoveredSegmentId === segment.id;

            // Line thickness based on power, but thicker if selected/hovered
            let thickness = Math.max(1, 3 * segment.power);
            if (isSelected) thickness += 2;
            else if (isHovered) thickness += 1;

            // Get colors from wavelengthIds or fallback to single color
            let colors = [];
            if (segment.wavelengthIds && segment.wavelengthIds.length > 0) {
                colors = segment.wavelengthIds
                    .map(id => wavelengthMap.get(id)?.color)
                    .filter(c => c);
            }
            if (colors.length === 0) {
                colors = [segment.color || BRANCH_COLORS[segment.branchIndex % BRANCH_COLORS.length]];
            }

            // Invalid segment styling
            if (segment.isValid === false) {
                colors = ['#ff4444'];  // Red for invalid
                ctx.setLineDash([5, 5]);  // Dashed line
            } else {
                ctx.setLineDash([]);  // Solid line
            }

            // Draw selection glow for selected segments
            if (isSelected) {
                ctx.strokeStyle = this.colors.selection;
                ctx.lineWidth = thickness + 4;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(startScreen.x, startScreen.y);
                ctx.lineTo(endScreen.x, endScreen.y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // Draw hover glow for hovered segments
            if (isHovered && !isSelected) {
                ctx.strokeStyle = this.colors.hover;
                ctx.lineWidth = thickness + 3;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(startScreen.x, startScreen.y);
                ctx.lineTo(endScreen.x, endScreen.y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            ctx.lineWidth = thickness;
            ctx.lineCap = 'round';

            // Draw multi-color line segments
            if (colors.length === 1) {
                // Single color - draw normal line
                ctx.strokeStyle = colors[0];
                ctx.beginPath();
                ctx.moveTo(startScreen.x, startScreen.y);
                ctx.lineTo(endScreen.x, endScreen.y);
                ctx.stroke();
            } else {
                // Multiple colors - divide line into equal segments
                const dx = endScreen.x - startScreen.x;
                const dy = endScreen.y - startScreen.y;
                const segmentCount = colors.length;

                for (let i = 0; i < segmentCount; i++) {
                    const t1 = i / segmentCount;
                    const t2 = (i + 1) / segmentCount;

                    const x1 = startScreen.x + dx * t1;
                    const y1 = startScreen.y + dy * t1;
                    const x2 = startScreen.x + dx * t2;
                    const y2 = startScreen.y + dy * t2;

                    ctx.strokeStyle = colors[i];
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }

            // Reset line dash
            ctx.setLineDash([]);

            // Draw arrow in the middle (use first color)
            this.drawArrow(ctx, startScreen, endScreen, colors[0]);

            // Draw path length label
            if (segment.pathLength > 0) {
                const midX = (startScreen.x + endScreen.x) / 2;
                const midY = (startScreen.y + endScreen.y) / 2;

                // Fixed length indicator
                if (segment.isFixedLength) {
                    ctx.fillStyle = '#f59e0b';  // Amber for fixed length
                    ctx.font = 'bold 9px sans-serif';
                    ctx.fillText(`🔒 ${segment.pathLength.toFixed(1)}mm`, midX, midY - 8);
                } else {
                    ctx.fillStyle = '#ffffff88';
                    ctx.font = '9px sans-serif';
                    ctx.fillText(`${segment.pathLength.toFixed(1)}mm`, midX, midY - 8);
                }
                ctx.textAlign = 'center';
            }
        });

        // Draw source emission direction indicators
        components.forEach(component => {
            if (component.type === 'source') {
                this.drawSourceEmissionIndicator(component, viewport);
            }
        });
    }

    /**
     * Draw source emission direction indicator
     */
    drawSourceEmissionIndicator(source, viewport) {
        const ctx = this.ctx;
        const screen = this.worldToScreen(source.position.x, source.position.y, viewport);

        // Get emission direction
        const emissionAngle = (source.emissionAngle || 0) * Math.PI / 180;
        const indicatorLength = 25;

        const endX = screen.x + Math.cos(emissionAngle) * indicatorLength;
        const endY = screen.y + Math.sin(emissionAngle) * indicatorLength;

        // Draw direction line
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrowhead
        const arrowSize = 6;
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowSize * Math.cos(emissionAngle - 0.5),
            endY - arrowSize * Math.sin(emissionAngle - 0.5)
        );
        ctx.lineTo(
            endX - arrowSize * Math.cos(emissionAngle + 0.5),
            endY - arrowSize * Math.sin(emissionAngle + 0.5)
        );
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw arrow in the middle of a beam segment
     */
    drawArrow(ctx, start, end, color) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowSize = 8;

        // Always use black for arrow direction indicator
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(
            midX + arrowSize * Math.cos(angle),
            midY + arrowSize * Math.sin(angle)
        );
        ctx.lineTo(
            midX + arrowSize * Math.cos(angle + 2.5),
            midY + arrowSize * Math.sin(angle + 2.5)
        );
        ctx.lineTo(
            midX + arrowSize * Math.cos(angle - 2.5),
            midY + arrowSize * Math.sin(angle - 2.5)
        );
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw axis indicator in bottom-left corner
     */
    drawAxisIndicator() {
        const ctx = this.ctx;
        const margin = 50;
        const axisLength = 40;
        const originX = margin;
        const originY = this.height - margin;

        // X axis (red, pointing right)
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + axisLength, originY);
        ctx.stroke();

        // X arrow head
        ctx.beginPath();
        ctx.moveTo(originX + axisLength, originY);
        ctx.lineTo(originX + axisLength - 8, originY - 4);
        ctx.lineTo(originX + axisLength - 8, originY + 4);
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        // X label
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('X', originX + axisLength + 10, originY + 4);

        // Y axis (green, pointing up)
        ctx.strokeStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX, originY - axisLength);
        ctx.stroke();

        // Y arrow head
        ctx.beginPath();
        ctx.moveTo(originX, originY - axisLength);
        ctx.lineTo(originX - 4, originY - axisLength + 8);
        ctx.lineTo(originX + 4, originY - axisLength + 8);
        ctx.closePath();
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        // Y label
        ctx.fillStyle = '#22c55e';
        ctx.fillText('Y', originX, originY - axisLength - 8);

        // Origin circle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(originX, originY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw selection box for drag-select
     */
    drawSelectionBox(selectionBox, viewport) {
        if (!selectionBox) return;

        const ctx = this.ctx;
        const start = this.worldToScreen(selectionBox.startX, selectionBox.startY, viewport);
        const end = this.worldToScreen(selectionBox.endX, selectionBox.endY, viewport);

        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        ctx.fillStyle = this.colors.selectionFill;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = this.colors.selection;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    /**
     * Main render method
     */
    render(state) {
        const { components, beamPath, constraints, calculated, ui, grid, background, wavelengths } = state;
        const { viewport, selection, selectionBox, labelsVisible } = ui;

        // Store background for label contrast calculation
        this.currentBackground = background;

        // Update grid size from state if provided
        if (grid && grid.size) {
            this.gridSize = grid.size;
        }

        // Clear canvas
        this.clear();

        // Draw background
        this.drawBackground(background, constraints.workspace, viewport);

        // Draw grid (only if enabled AND visible)
        if (grid && grid.visible) {
            this.drawGrid(constraints.workspace, viewport);
        }

        // Draw workspace boundary (pass background to avoid covering it)
        this.drawWorkspace(constraints.workspace, viewport, background);

        // Draw constraints (with selection state)
        this.drawKeepOutZones(constraints.keepOutZones, viewport, selection.selectedZoneId, selection.hoveredZoneId);
        this.drawMountingZone(constraints.mountingZone, viewport, selection.selectedZoneId, selection.hoveredZoneId);

        // Draw beam paths (with selection state for highlighting)
        this.drawBeamPaths(beamPath, Array.from(components.values()), viewport, selection, wavelengths);

        // Collect mount zone violations for highlighting
        const mountZoneViolations = new Set();
        calculated.constraintViolations.forEach(v => {
            if (v.type === 'mountZone') {
                mountZoneViolations.add(v.componentId);
                if (v.otherComponentId) mountZoneViolations.add(v.otherComponentId);
            }
        });

        // Draw component mount zones first (underneath components)
        components.forEach(component => {
            if (component.mountZone && component.mountZone.enabled) {
                const isSelected = selection.selectedIds.includes(component.id);
                const hasViolation = mountZoneViolations.has(component.id);
                this.drawComponentMountZone(component, isSelected, viewport, hasViolation);
            }
        });

        // Draw components
        components.forEach(component => {
            const isSelected = selection.selectedIds.includes(component.id);
            const isHovered = selection.hoveredId === component.id;
            this.drawComponent(component, isSelected, isHovered, viewport, labelsVisible);
        });

        // Draw center of mass
        this.drawCenterOfMass(
            calculated.centerOfMass,
            calculated.isCoMInMountingZone,
            viewport
        );

        // Draw selection box if dragging
        this.drawSelectionBox(selectionBox, viewport);

        // Draw axis indicator (always on top, in screen coordinates)
        this.drawAxisIndicator();
    }

    /**
     * Render the scene with preview positions/angles from a snapshot.
     * This temporarily applies snapshot positions for rendering without modifying actual state.
     */
    renderPreview(state, snapshot) {
        if (!snapshot) {
            this.render(state);
            return;
        }

        // Store original positions and angles
        const savedPositions = new Map();
        const savedAngles = new Map();

        state.components.forEach((comp, id) => {
            savedPositions.set(id, { ...comp.position });
            savedAngles.set(id, comp.angle);
        });

        // Apply snapshot positions and angles
        if (snapshot.positions) {
            snapshot.positions.forEach((pos, id) => {
                const comp = state.components.get(id);
                if (comp) comp.position = { ...pos };
            });
        }
        if (snapshot.angles) {
            snapshot.angles.forEach((angle, id) => {
                const comp = state.components.get(id);
                if (comp) comp.angle = angle;
            });
        }

        // Render
        this.render(state);

        // Draw preview mode indicator
        this.drawPreviewIndicator(snapshot.iteration, snapshot.cost);

        // Restore original positions and angles
        savedPositions.forEach((pos, id) => {
            const comp = state.components.get(id);
            if (comp) comp.position = pos;
        });
        savedAngles.forEach((angle, id) => {
            const comp = state.components.get(id);
            if (comp) comp.angle = angle;
        });
    }

    /**
     * Render a split-screen comparison between original and selected snapshot.
     */
    renderComparison(state, originalSnapshot, selectedSnapshot) {
        const ctx = this.ctx;
        const halfWidth = this.width / 2;

        // Save the current context state
        ctx.save();

        // Left side: Original layout
        ctx.beginPath();
        ctx.rect(0, 0, halfWidth, this.height);
        ctx.clip();

        if (originalSnapshot) {
            this.renderPreviewInternal(state, originalSnapshot, false);
        } else {
            this.render(state);
        }

        ctx.restore();
        ctx.save();

        // Right side: Selected snapshot
        ctx.beginPath();
        ctx.rect(halfWidth, 0, halfWidth, this.height);
        ctx.clip();

        // Offset the viewport to compensate for clipping
        if (selectedSnapshot) {
            this.renderPreviewInternal(state, selectedSnapshot, false);
        }

        ctx.restore();

        // Draw divider
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(halfWidth, 0);
        ctx.lineTo(halfWidth, this.height);
        ctx.stroke();

        // Draw labels
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';

        // Left label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(halfWidth / 2 - 40, 8, 80, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('ORIGINAL', halfWidth / 2, 24);

        // Right label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(halfWidth + halfWidth / 2 - 40, 8, 80, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('SELECTED', halfWidth + halfWidth / 2, 24);
    }

    /**
     * Internal render with snapshot positions (no indicator).
     */
    renderPreviewInternal(state, snapshot, showIndicator = false) {
        if (!snapshot) {
            this.render(state);
            return;
        }

        // Store original positions and angles
        const savedPositions = new Map();
        const savedAngles = new Map();

        state.components.forEach((comp, id) => {
            savedPositions.set(id, { ...comp.position });
            savedAngles.set(id, comp.angle);
        });

        // Apply snapshot positions and angles
        if (snapshot.positions) {
            snapshot.positions.forEach((pos, id) => {
                const comp = state.components.get(id);
                if (comp) comp.position = { ...pos };
            });
        }
        if (snapshot.angles) {
            snapshot.angles.forEach((angle, id) => {
                const comp = state.components.get(id);
                if (comp) comp.angle = angle;
            });
        }

        // Render
        this.render(state);

        if (showIndicator) {
            this.drawPreviewIndicator(snapshot.iteration, snapshot.cost);
        }

        // Restore original positions and angles
        savedPositions.forEach((pos, id) => {
            const comp = state.components.get(id);
            if (comp) comp.position = pos;
        });
        savedAngles.forEach((angle, id) => {
            const comp = state.components.get(id);
            if (comp) comp.angle = angle;
        });
    }

    /**
     * Draw preview mode indicator banner.
     */
    drawPreviewIndicator(iteration, cost) {
        const ctx = this.ctx;
        const text = `PREVIEW: Iteration ${iteration}, Cost: ${cost.toFixed(1)}`;
        const padding = 12;

        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(text).width;

        const boxWidth = textWidth + padding * 2;
        const boxHeight = 28;
        const x = (this.width - boxWidth) / 2;
        const y = 10;

        // Background
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x, y, boxWidth, boxHeight);

        // Border
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, boxWidth, boxHeight);

        // Text
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText(text, this.width / 2, y + 18);
    }

    /**
     * Cleanup
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
    }
}

export default Renderer;
