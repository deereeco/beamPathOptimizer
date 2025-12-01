/**
 * Component types and their default properties
 */
export const ComponentType = {
    SOURCE: 'source',
    MIRROR: 'mirror',
    BEAM_SPLITTER: 'beam_splitter',
    LENS: 'lens',
    WAVEPLATE: 'waveplate',
    FILTER: 'filter',
    DETECTOR: 'detector'
};

/**
 * Default properties for each component type
 * Mount zone properties:
 *   - enabled: whether the mount zone is active
 *   - paddingX: padding in the X direction (left and right)
 *   - paddingY: padding in the Y direction (top and bottom)
 *   - offsetX: offset of the zone center from the component center (X)
 *   - offsetY: offset of the zone center from the component center (Y)
 */
export const ComponentDefaults = {
    [ComponentType.SOURCE]: {
        size: { width: 40, height: 20 },
        mass: 200,
        reflectance: 0,
        transmittance: 0,
        color: '#ef4444',
        ports: { output: true },
        mountZone: { enabled: false, paddingX: 15, paddingY: 15, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.MIRROR]: {
        size: { width: 25, height: 5 },
        mass: 120,
        reflectance: 1.0,
        transmittance: 0,
        color: '#3b82f6',
        ports: { input: true, reflected: true },
        mountZone: { enabled: false, paddingX: 10, paddingY: 10, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.BEAM_SPLITTER]: {
        size: { width: 25, height: 25 },
        mass: 85,
        reflectance: 0.5,
        transmittance: 0.5,
        color: '#8b5cf6',
        ports: { input: true, reflected: true, transmitted: true },
        mountZone: { enabled: false, paddingX: 12, paddingY: 12, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.LENS]: {
        size: { width: 8, height: 30 },
        mass: 60,
        reflectance: 0.02,
        transmittance: 0.98,
        color: '#06b6d4',
        ports: { input: true, transmitted: true },
        mountZone: { enabled: false, paddingX: 8, paddingY: 8, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.WAVEPLATE]: {
        size: { width: 20, height: 20 },
        mass: 40,
        reflectance: 0.01,
        transmittance: 0.99,
        color: '#f59e0b',
        ports: { input: true, transmitted: true },
        mountZone: { enabled: false, paddingX: 10, paddingY: 10, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.FILTER]: {
        size: { width: 20, height: 20 },
        mass: 30,
        reflectance: 0.1,
        transmittance: 0.9,
        color: '#22c55e',
        ports: { input: true, transmitted: true },
        mountZone: { enabled: false, paddingX: 8, paddingY: 8, offsetX: 0, offsetY: 0 }
    },
    [ComponentType.DETECTOR]: {
        size: { width: 20, height: 20 },
        mass: 150,
        reflectance: 0,
        transmittance: 0,
        color: '#64748b',
        ports: { input: true },
        mountZone: { enabled: false, paddingX: 12, paddingY: 12, offsetX: 0, offsetY: 0 }
    }
};

/**
 * Human-readable names for component types
 */
export const ComponentNames = {
    [ComponentType.SOURCE]: 'Source',
    [ComponentType.MIRROR]: 'Mirror',
    [ComponentType.BEAM_SPLITTER]: 'Beam Splitter',
    [ComponentType.LENS]: 'Lens',
    [ComponentType.WAVEPLATE]: 'Waveplate',
    [ComponentType.FILTER]: 'Filter',
    [ComponentType.DETECTOR]: 'Detector'
};

/**
 * Generate a unique ID
 */
let idCounter = 0;
export function generateId(prefix = 'comp') {
    return `${prefix}_${Date.now()}_${++idCounter}`;
}

/**
 * Component class representing an optical element
 */
export class Component {
    constructor(props) {
        const defaults = ComponentDefaults[props.type] || ComponentDefaults[ComponentType.MIRROR];

        this.id = props.id || generateId(props.type);
        this.type = props.type;
        this.name = props.name || this.generateDefaultName();

        // Position and orientation
        this.position = props.position || { x: 0, y: 0 };
        this.angle = props.angle ?? 45;

        // Physical properties
        this.size = props.size || { ...defaults.size };
        this.mass = props.mass ?? defaults.mass;

        // Optical properties
        this.reflectance = props.reflectance ?? defaults.reflectance;
        this.transmittance = props.transmittance ?? defaults.transmittance;

        // Visual
        this.color = props.color || defaults.color;

        // Constraints
        this.isFixed = props.isFixed || false;

        // Mount zone (keep-out zone for the component's physical mount)
        const defaultMountZone = defaults.mountZone || { enabled: false, padding: 10 };
        this.mountZone = props.mountZone
            ? { ...defaultMountZone, ...props.mountZone }
            : { ...defaultMountZone };

        // Metadata
        this.notes = props.notes || '';
        this.createdAt = props.createdAt || new Date().toISOString();
        this.modifiedAt = props.modifiedAt || new Date().toISOString();
    }

    /**
     * Generate a default name based on type and counter
     */
    generateDefaultName() {
        const prefix = {
            [ComponentType.SOURCE]: 'S',
            [ComponentType.MIRROR]: 'M',
            [ComponentType.BEAM_SPLITTER]: 'BS',
            [ComponentType.LENS]: 'L',
            [ComponentType.WAVEPLATE]: 'WP',
            [ComponentType.FILTER]: 'F',
            [ComponentType.DETECTOR]: 'D'
        }[this.type] || 'C';

        return `${prefix}${idCounter}`;
    }

    /**
     * Get the ports available for this component type
     */
    getPorts() {
        return ComponentDefaults[this.type]?.ports || {};
    }

    /**
     * Check if this component can receive input beams
     */
    canReceiveBeam() {
        return this.getPorts().input === true;
    }

    /**
     * Check if this component can output beams
     */
    canOutputBeam() {
        const ports = this.getPorts();
        return ports.output || ports.reflected || ports.transmitted;
    }

    /**
     * Check if this component splits the beam
     */
    splitsBeam() {
        const ports = this.getPorts();
        return ports.reflected && ports.transmitted;
    }

    /**
     * Get bounding box corners (accounting for rotation)
     */
    getBoundingBox() {
        const halfW = this.size.width / 2;
        const halfH = this.size.height / 2;
        const rad = (this.angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Calculate rotated corners
        const corners = [
            { x: -halfW, y: -halfH },
            { x: halfW, y: -halfH },
            { x: halfW, y: halfH },
            { x: -halfW, y: halfH }
        ].map(c => ({
            x: this.position.x + c.x * cos - c.y * sin,
            y: this.position.y + c.x * sin + c.y * cos
        }));

        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);

        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys),
            corners
        };
    }

    /**
     * Get mount zone bounding box (expanded from component bounding box by padding)
     * Supports separate X/Y padding and offset from component center
     * Returns null if mount zone is not enabled
     */
    getMountZoneBounds() {
        if (!this.mountZone || !this.mountZone.enabled) {
            return null;
        }

        // Support both old 'padding' property and new paddingX/paddingY
        const paddingX = this.mountZone.paddingX ?? this.mountZone.padding ?? 10;
        const paddingY = this.mountZone.paddingY ?? this.mountZone.padding ?? 10;
        const offsetX = this.mountZone.offsetX ?? 0;
        const offsetY = this.mountZone.offsetY ?? 0;

        const bbox = this.getBoundingBox();

        // Calculate center of component bounding box
        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;

        // Apply offset to get mount zone center
        const mountCenterX = centerX + offsetX;
        const mountCenterY = centerY + offsetY;

        // Calculate mount zone dimensions (component size + padding on each side)
        const compWidth = bbox.maxX - bbox.minX;
        const compHeight = bbox.maxY - bbox.minY;
        const mountWidth = compWidth + 2 * paddingX;
        const mountHeight = compHeight + 2 * paddingY;

        // Calculate bounds from center
        const minX = mountCenterX - mountWidth / 2;
        const minY = mountCenterY - mountHeight / 2;
        const maxX = mountCenterX + mountWidth / 2;
        const maxY = mountCenterY + mountHeight / 2;

        return {
            x: minX,
            y: minY,
            width: mountWidth,
            height: mountHeight,
            minX,
            minY,
            maxX,
            maxY
        };
    }

    /**
     * Check if this component's mount zone overlaps with another component or its mount zone
     */
    mountZoneOverlaps(other) {
        const myMountBounds = this.getMountZoneBounds();
        if (!myMountBounds) return false;

        // Check against other component's body
        const otherBBox = other.getBoundingBox();
        if (this.boundsOverlap(myMountBounds, {
            minX: otherBBox.minX, minY: otherBBox.minY,
            maxX: otherBBox.maxX, maxY: otherBBox.maxY
        })) {
            return { type: 'component', componentId: other.id };
        }

        // Check against other component's mount zone
        const otherMountBounds = other.getMountZoneBounds();
        if (otherMountBounds && this.boundsOverlap(myMountBounds, otherMountBounds)) {
            return { type: 'mountZone', componentId: other.id };
        }

        return false;
    }

    /**
     * Check if two axis-aligned bounding boxes overlap
     */
    boundsOverlap(a, b) {
        return !(a.maxX < b.minX || a.minX > b.maxX ||
                 a.maxY < b.minY || a.minY > b.maxY);
    }

    /**
     * Check if a point is inside the component (accounting for rotation)
     */
    containsPoint(px, py) {
        // Transform point to component's local coordinate system
        const dx = px - this.position.x;
        const dy = py - this.position.y;
        const rad = (-this.angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        const halfW = this.size.width / 2;
        const halfH = this.size.height / 2;

        return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
    }

    /**
     * Get output direction vector based on angle and port
     */
    getOutputDirection(port = 'reflected') {
        const rad = (this.angle * Math.PI) / 180;

        if (this.type === ComponentType.SOURCE) {
            // Source outputs along its angle direction
            return { x: Math.cos(rad), y: Math.sin(rad) };
        }

        if (port === 'transmitted') {
            // Transmitted beam continues in input direction
            return null; // Will be calculated based on input beam
        }

        // Reflected beam: perpendicular to mirror surface
        // Mirror surface is along the angle, reflected is perpendicular
        return {
            x: Math.cos(rad + Math.PI / 2),
            y: Math.sin(rad + Math.PI / 2)
        };
    }

    /**
     * Clone the component with a new ID
     */
    clone() {
        return new Component({
            ...this.toJSON(),
            id: generateId(this.type),
            name: this.name + ' (copy)',
            position: { ...this.position }
        });
    }

    /**
     * Update properties
     */
    update(props) {
        const updatableProps = ['name', 'position', 'angle', 'size', 'mass',
                                'reflectance', 'transmittance', 'isFixed', 'notes', 'mountZone'];

        for (const key of updatableProps) {
            if (props[key] !== undefined) {
                if (typeof props[key] === 'object') {
                    this[key] = { ...this[key], ...props[key] };
                } else {
                    this[key] = props[key];
                }
            }
        }

        // Keep reflectance + transmittance <= 1 for beam splitters
        if (props.reflectance !== undefined) {
            this.transmittance = Math.min(this.transmittance, 1 - this.reflectance);
        }
        if (props.transmittance !== undefined) {
            this.reflectance = Math.min(this.reflectance, 1 - this.transmittance);
        }

        this.modifiedAt = new Date().toISOString();
        return this;
    }

    /**
     * Serialize to plain object for JSON
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            position: { ...this.position },
            angle: this.angle,
            size: { ...this.size },
            mass: this.mass,
            reflectance: this.reflectance,
            transmittance: this.transmittance,
            isFixed: this.isFixed,
            mountZone: { ...this.mountZone },
            notes: this.notes,
            createdAt: this.createdAt,
            modifiedAt: this.modifiedAt
        };
    }

    /**
     * Create component from plain object
     */
    static fromJSON(json) {
        return new Component(json);
    }

    /**
     * Factory method to create component by type
     */
    static create(type, position, props = {}) {
        return new Component({
            type,
            position,
            ...props
        });
    }
}

export default Component;
