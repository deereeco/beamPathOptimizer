# 🎨 Redesign: Manual Beam Drawing Workflow Specification

The goal is to completely remove the current manual beam drawing method and replace it with a new, path-based system.

---

## 1. Entering and Exiting Draw Mode

* **Enter Draw Mode**
    * **Input:** Click **"Draw Path"** button OR **`Ctrl + D`**
    * **Result:** Canvas elements dim slightly to indicate mode change. User can now place points.
* **Exit Draw Mode**
    * **Input:** Press **`Esc`** (when points are being placed) OR Press **`Esc`** again (immediately after placing final point)
    * **Result:** Exits the drawing mode.

## 2. Creating Path Points

The path is formed by a series of straight line segments connecting sequentially placed points:

* **Order of Creation:**
    * First Point: Establishes the start of the beam.
    * Second Point: Creates the first line segment.
    * Third Point: Creates the second line segment, and so on.
    * Continuation: User can add points until the `Esc` key is pressed.

### Point Placement Rules (Snapping)

* **Empty Space Placement**
    * **Snap Behavior:** Point is placed at the click location (subject to grid snapping).
    * **Visual Feedback:** Hover preview shows placement location.
* **On a Component Placement**
    * **Snap Behavior:** Point snaps to the **center** of the clicked component.
    * **Visual Feedback:** The snapped component becomes **undimmed** to confirm selection.

## 3. Smart Snapping Behavior

* **Grid Snapping**
    * **Default State:** **ON** upon entering Draw Mode.
    * **Toggle Shortcut:** **`G`**
    * **Integration:** Integrates with existing grid snap feature/settings.
* **Hover Preview:** Shows exactly where the next point will be placed before the click.

### Constraint Drawing based on Grid Snap

* **Grid Snap ON:** Only **horizontal or vertical** lines can be drawn from the previous point.
* **Grid Snap OFF:** Points can be placed anywhere, allowing for angled lines.

### Connection Points

* All points placed in the path must now act as a **connection point (or snap point)** for other components to attach or snap onto.
* **Visual Feedback:** Clear visual cues must be provided to show these snap points.

## 4. Line Properties

Each segment in the drawn path must have the following editable properties:

* **ID/Name:** A unique name or identifier.
* **Length:** The current distance value of the line segment.
* **Length Lock (Checkbox):**
    * **Checked:** Locks the line length, preventing it from changing even if an endpoint is dragged.
    * **Unchecked:** Allows the length to change when an endpoint is dragged.
* **Color (Wavelength):** Defined by wavelengths, consistent with existing beam properties.

## 5. Dimensions and Constraints

After completing the path, the user can set constraints.

### Constraint Types

1.  **Distance Constraint (Line Length):** Allows the user to set a fixed **value** for a line segment's length (property of the line).
2.  **Angle Constraint:** Allows the user to set a fixed **angle** between two adjacent line segments (constraint property of one line with respect to the other).

### Viewing Dimensions/Constraints

* **Toggle Control:** A button in the top-left of the center canvas OR keyboard shortcut **`D`**.
* **Functionality:** Hides or shows the dimension lines and angle constraints.
* **Movement:** Dimensions and constraints can be **moved around by the user** for better visual clarity.

## 6. Edge Case: Inserting a Point on an Existing Line

* **Action:** The user places a point by clicking directly on an existing line segment.
* **Effect:** The single line segment is split into two new line segments.
* **Warning & Constraint Handling:**
    * If the original line had an existing Distance Constraint or Angle Constraint, the user **must** receive an **"Are You Sure?"** warning.
    * **Warning Message:** "Placing this point will erase the existing distance/angle constraint(s) on this line. Continue?"
    * **Options:** **Yes** or **Cancel**.
    * **Result (Yes):** The line splits, and the original constraints are erased.
