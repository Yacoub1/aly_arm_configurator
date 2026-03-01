/**
 * dragDrop.js
 *
 * Handles all drag-and-drop interactions:
 *   - Palette item → drop zone  (add new segment)
 *   - Segment header → drop zone (reorder existing segment)
 */

let dragFromPalette = null;  // type string when dragging from palette
let dragSourceId    = null;  // segment id when reordering

// ── Palette drag ──────────────────────────────────────────────────────────────
function paletteDragStart(e) {
  dragFromPalette = e.currentTarget.dataset.type;
  dragSourceId    = null;
  e.currentTarget.classList.add('dragging-source');
  e.dataTransfer.effectAllowed = 'copy';
}

function paletteDragEnd(e) {
  e.currentTarget.classList.remove('dragging-source');
  dragFromPalette = null;
}

// ── Drop zone handlers ────────────────────────────────────────────────────────
function dzDragOver(e, dzId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = dragSourceId ? 'move' : 'copy';
  document.getElementById(dzId)?.classList.add('drag-over');
}

function dzDragLeave(e, dzId) {
  document.getElementById(dzId)?.classList.remove('drag-over');
}

function dzDrop(e, dzId) {
  e.preventDefault();
  document.getElementById(dzId)?.classList.remove('drag-over');

  // Resolve insert index: 'drop-zone-end' → append; 'dz-{n}' → insert before n
  const insertIdx = dzId.startsWith('dz-')
    ? parseInt(dzId.replace('dz-', ''))
    : chain.length;

  if (dragFromPalette) {
    const seg = addSegment(dragFromPalette, insertIdx);
    if (seg) {
      renderChain();
      selectSegment(seg.id);
      showToast(seg.label.toUpperCase() + ' ADDED');
    }
  } else if (dragSourceId !== null) {
    reorderSegment(dragSourceId, insertIdx);
    renderChain();
    // Re-apply selection highlight after re-render
    if (selectedId) selectSegment(selectedId);
  }
}

// ── Segment reorder drag ──────────────────────────────────────────────────────
function segDragStart(e, id) {
  dragSourceId    = id;
  dragFromPalette = null;
  e.dataTransfer.effectAllowed = 'move';
  // Defer so the drag ghost image is captured before we dim it
  setTimeout(() => {
    document.querySelector(`.chain-segment[data-id="${id}"]`)?.classList.add('dragging');
  }, 0);
}

function segDragEnd(e, id) {
  dragSourceId = null;
  document.querySelector(`.chain-segment[data-id="${id}"]`)?.classList.remove('dragging');
}
