# ALY ARM — Robot Builder

Drag-and-drop ROS2 xacro chain configurator.  
Open `index.html` in any modern browser — no build step, no dependencies.

## File Structure

```
aly_arm_builder/
├── index.html          ← entry point (markup only)
│
├── css/
│   ├── tokens.css      ← CSS custom properties, resets, keyframes
│   ├── header.css      ← top bar + action buttons
│   ├── palette.css     ← left palette panel
│   ├── canvas.css      ← center chain canvas + segment blocks
│   └── panels.css      ← config panel, modals, toast
│
└── js/
    ├── elementDefs.js  ← ELEMENT_DEFS catalogue (palette items → sub-links)
    ├── chain.js        ← chain state: add / remove / reorder / resolveRoleName
    ├── dragDrop.js     ← palette drag + drop zone + segment reorder
    ├── renderer.js     ← DOM rendering: chain canvas + config panel
    ├── xacroGenerator.js ← buildXacro() + syntaxHighlight()
    ├── viewer.js       ← 3D viewer modal (POST xacro to backend)
    └── app.js          ← top-level controller, event callbacks, DOMContentLoaded
```

## Usage

1. Open `index.html` in a browser
2. Drag elements from the palette onto the chain canvas
3. Click a segment to configure its φ offset, joint limits, etc.
4. Click **Preview Xacro** to inspect the generated XML
5. Click **↓ Download** to save `aly_arm.xacro`
6. Click **▶ View Robot** to send the xacro to a local 3D viewer backend

## Viewer Backend Contract

```
POST <endpoint>
Content-Type: text/xml
Body: raw xacro XML

Response JSON (one of):
  { "url":   "http://..." }   → loaded in iframe.src
  { "html":  "<html>..."  }   → loaded in iframe.srcdoc
  { "error": "message"    }   → shown as error state
```

## Extending

**Add a new element type:** edit `js/elementDefs.js` and add a palette item in `index.html`.  
**Change chain logic:** `js/chain.js` — pure data, no DOM.  
**Change rendering:** `js/renderer.js` — only touches the DOM.  
**Change xacro output:** `js/xacroGenerator.js` — only string-building.
