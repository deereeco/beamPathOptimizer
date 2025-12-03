/**
 * Results Graph - Canvas-based visualization of optimization iterations
 * Displays cost vs iteration with hover/click/double-click interactions
 */

export class ResultsGraph {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.snapshots = [];
        this.bestIndex = -1;

        // Interaction state
        this.hoveredIndex = -1;
        this.selectedIndex = -1;

        // Callbacks
        this.onHover = null;      // (snapshot, index) => void
        this.onClick = null;      // (snapshot, index) => void
        this.onDoubleClick = null; // (snapshot, index) => void

        // Graph styling
        this.padding = { top: 20, right: 20, bottom: 40, left: 60 };
        this.colors = {
            background: '#1a1a2e',
            grid: '#2d2d44',
            axis: '#6b7280',
            line: '#ef4444',
            point: '#ef4444',
            hovered: '#f97316',
            selected: '#22c55e',
            best: '#fbbf24',
            text: '#9ca3af'
        };

        // Bind event handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);

        // Add event listeners
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('dblclick', this.handleDoubleClick);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    }

    /**
     * Set the snapshots data and render
     */
    setData(snapshots) {
        this.snapshots = snapshots || [];
        this.findBestIndex();
        this.render();
    }

    /**
     * Find the index of the best (lowest cost) snapshot
     */
    findBestIndex() {
        if (this.snapshots.length === 0) {
            this.bestIndex = -1;
            return;
        }

        this.bestIndex = 0;
        let bestCost = this.snapshots[0].cost;
        for (let i = 1; i < this.snapshots.length; i++) {
            if (this.snapshots[i].cost < bestCost) {
                bestCost = this.snapshots[i].cost;
                this.bestIndex = i;
            }
        }
    }

    /**
     * Get graph area dimensions
     */
    getGraphArea() {
        return {
            x: this.padding.left,
            y: this.padding.top,
            width: this.canvas.width - this.padding.left - this.padding.right,
            height: this.canvas.height - this.padding.top - this.padding.bottom
        };
    }

    /**
     * Convert data coordinates to canvas coordinates
     */
    dataToCanvas(dataX, dataY, minCost, maxCost, maxIteration) {
        const area = this.getGraphArea();
        const x = area.x + (dataX / maxIteration) * area.width;
        const y = area.y + area.height - ((dataY - minCost) / (maxCost - minCost)) * area.height;
        return { x, y };
    }

    /**
     * Convert canvas coordinates to data index
     */
    canvasToDataIndex(canvasX, canvasY) {
        if (this.snapshots.length === 0) return -1;

        const area = this.getGraphArea();

        // Check if click is within graph area
        if (canvasX < area.x || canvasX > area.x + area.width ||
            canvasY < area.y || canvasY > area.y + area.height) {
            return -1;
        }

        // Find the nearest snapshot
        const maxIteration = this.snapshots[this.snapshots.length - 1].iteration;
        const costs = this.snapshots.map(s => s.cost);
        const minCost = Math.min(...costs);
        const maxCost = Math.max(...costs);
        const costRange = maxCost - minCost || 1;

        let nearestIndex = -1;
        let nearestDistance = Infinity;

        for (let i = 0; i < this.snapshots.length; i++) {
            const snapshot = this.snapshots[i];
            const point = this.dataToCanvas(snapshot.iteration, snapshot.cost, minCost, maxCost + costRange * 0.1, maxIteration);
            const distance = Math.sqrt(
                Math.pow(canvasX - point.x, 2) +
                Math.pow(canvasY - point.y, 2)
            );

            if (distance < nearestDistance && distance < 20) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }

        return nearestIndex;
    }

    /**
     * Handle mouse move for hover effect
     */
    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale mouse coordinates to match canvas internal resolution
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

        const index = this.canvasToDataIndex(x, y);

        if (index !== this.hoveredIndex) {
            this.hoveredIndex = index;
            this.render();

            if (this.onHover) {
                this.onHover(index >= 0 ? this.snapshots[index] : null, index);
            }
        }
    }

    /**
     * Handle click for selection
     */
    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale mouse coordinates to match canvas internal resolution
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

        const index = this.canvasToDataIndex(x, y);

        if (index >= 0) {
            this.selectedIndex = index;
            this.render();

            if (this.onClick) {
                this.onClick(this.snapshots[index], index);
            }
        }
    }

    /**
     * Handle double-click for preview
     */
    handleDoubleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale mouse coordinates to match canvas internal resolution
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

        const index = this.canvasToDataIndex(x, y);

        if (index >= 0 && this.onDoubleClick) {
            this.onDoubleClick(this.snapshots[index], index);
        }
    }

    /**
     * Handle mouse leave
     */
    handleMouseLeave() {
        if (this.hoveredIndex !== -1) {
            this.hoveredIndex = -1;
            this.render();

            if (this.onHover) {
                this.onHover(null, -1);
            }
        }
    }

    /**
     * Render the graph
     */
    render() {
        const ctx = this.ctx;
        const area = this.getGraphArea();

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.snapshots.length === 0) {
            ctx.fillStyle = this.colors.text;
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No optimization data', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Calculate ranges
        const costs = this.snapshots.map(s => s.cost);
        const minCost = Math.min(...costs);
        const maxCost = Math.max(...costs);
        const costRange = maxCost - minCost || 1;
        const maxIteration = this.snapshots[this.snapshots.length - 1].iteration;

        // Add 10% padding to top of cost range
        const displayMaxCost = maxCost + costRange * 0.1;

        // Draw grid
        this.drawGrid(area, minCost, displayMaxCost, maxIteration);

        // Draw axes
        this.drawAxes(area, minCost, displayMaxCost, maxIteration);

        // Draw line connecting points
        ctx.beginPath();
        ctx.strokeStyle = this.colors.line;
        ctx.lineWidth = 1.5;

        for (let i = 0; i < this.snapshots.length; i++) {
            const snapshot = this.snapshots[i];
            const point = this.dataToCanvas(snapshot.iteration, snapshot.cost, minCost, displayMaxCost, maxIteration);

            if (i === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        }
        ctx.stroke();

        // Draw points
        for (let i = 0; i < this.snapshots.length; i++) {
            const snapshot = this.snapshots[i];
            const point = this.dataToCanvas(snapshot.iteration, snapshot.cost, minCost, displayMaxCost, maxIteration);

            // Determine point color and size
            let color = this.colors.point;
            let radius = 3;

            if (i === this.bestIndex) {
                color = this.colors.best;
                radius = 5;
            }
            if (i === this.selectedIndex) {
                color = this.colors.selected;
                radius = 6;
            }
            if (i === this.hoveredIndex) {
                color = this.colors.hovered;
                radius = 7;
            }

            // Draw point
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw highlight ring for special points
            if (i === this.bestIndex || i === this.selectedIndex || i === this.hoveredIndex) {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Draw "Best" label
        if (this.bestIndex >= 0) {
            const bestSnapshot = this.snapshots[this.bestIndex];
            const bestPoint = this.dataToCanvas(bestSnapshot.iteration, bestSnapshot.cost, minCost, displayMaxCost, maxIteration);

            ctx.fillStyle = this.colors.best;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('BEST', bestPoint.x, bestPoint.y - 15);
        }
    }

    /**
     * Draw grid lines
     */
    drawGrid(area, minCost, maxCost, maxIteration) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;

        // Horizontal grid lines (5 lines)
        for (let i = 0; i <= 5; i++) {
            const y = area.y + (i / 5) * area.height;
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.width, y);
            ctx.stroke();
        }

        // Vertical grid lines (5 lines)
        for (let i = 0; i <= 5; i++) {
            const x = area.x + (i / 5) * area.width;
            ctx.beginPath();
            ctx.moveTo(x, area.y);
            ctx.lineTo(x, area.y + area.height);
            ctx.stroke();
        }
    }

    /**
     * Draw axes and labels
     */
    drawAxes(area, minCost, maxCost, maxIteration) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.axis;
        ctx.lineWidth = 2;

        // Y-axis
        ctx.beginPath();
        ctx.moveTo(area.x, area.y);
        ctx.lineTo(area.x, area.y + area.height);
        ctx.stroke();

        // X-axis
        ctx.beginPath();
        ctx.moveTo(area.x, area.y + area.height);
        ctx.lineTo(area.x + area.width, area.y + area.height);
        ctx.stroke();

        // Labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '11px monospace';

        // Y-axis labels
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const value = maxCost - (i / 5) * (maxCost - minCost);
            const y = area.y + (i / 5) * area.height;
            ctx.fillText(value.toFixed(0), area.x - 5, y + 4);
        }

        // X-axis labels
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const value = (i / 5) * maxIteration;
            const x = area.x + (i / 5) * area.width;
            ctx.fillText(Math.round(value).toString(), x, area.y + area.height + 15);
        }

        // Axis titles
        ctx.font = 'bold 12px monospace';
        ctx.fillText('Iteration', area.x + area.width / 2, area.y + area.height + 32);

        ctx.save();
        ctx.translate(15, area.y + area.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('Cost', 0, 0);
        ctx.restore();
    }

    /**
     * Set selected index programmatically
     */
    setSelectedIndex(index) {
        this.selectedIndex = index;
        this.render();
    }

    /**
     * Get the currently selected snapshot
     */
    getSelectedSnapshot() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.snapshots.length) {
            return this.snapshots[this.selectedIndex];
        }
        return null;
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }
}

export default ResultsGraph;
