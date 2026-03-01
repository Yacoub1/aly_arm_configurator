/**
 * renderer.js
 *
 * Renders the chain array as DOM elements inside #chain-canvas.
 * Also renders the right-hand config panel when a segment is selected.
 */

// ── Chain canvas ──────────────────────────────────────────────────────────────
function renderChain() {
  const canvas = document.getElementById('chain-canvas');

  // Remove all dynamic children; keep #chain-base and #base-connector
  [...canvas.querySelectorAll('.chain-segment, .drop-zone, .chain-connector:not(#base-connector)')]
    .forEach(el => el.remove());

  chain.forEach((seg, idx) => {
    canvas.appendChild(makeDZ(`dz-${idx}`));
    canvas.appendChild(makeConnector('fixed'));
    canvas.appendChild(makeSegmentEl(seg, idx));
  });

  canvas.appendChild(makeDZ('drop-zone-end'));
}

// ── Drop zone element ─────────────────────────────────────────────────────────
function makeDZ(id) {
  const dz = document.createElement('div');
  dz.className  = 'drop-zone';
  dz.id         = id;
  dz.textContent= '＋ Drop element here';
  dz.ondragover = e => dzDragOver(e, id);
  dz.ondragleave= e => dzDragLeave(e, id);
  dz.ondrop     = e => dzDrop(e, id);
  return dz;
}

// ── Connector pill ────────────────────────────────────────────────────────────
function makeConnector(jtype) {
  const color = jtype === 'revolute'  ? 'var(--accent2)'
              : jtype === 'prismatic' ? '#ffd700'
              : 'var(--muted)';
  const div = document.createElement('div');
  div.className = 'chain-connector';
  div.innerHTML = `
    <div class="connector-line"></div>
    <div class="connector-label" style="border-color:${color};color:${color}">${jtype}</div>
    <div class="connector-line"></div>`;
  return div;
}

// ── Segment block ─────────────────────────────────────────────────────────────
function makeSegmentEl(seg, idx) {
  const def      = ELEMENT_DEFS[seg.type];
  const jtype    = seg.props.jointType ?? def.subLinks[0]?.jointAfter ?? 'fixed';
  const isSelected = seg.id === selectedId;

  const el = document.createElement('div');
  el.className  = 'chain-segment' + (isSelected ? ' selected' : '');
  el.dataset.id = seg.id;

  const segLabel   = `SEG-${String(idx + 1).padStart(2, '0')}`;
  const propSummary = buildPropSummary(seg);

  // Sub-link rows
  const subHTML = def.subLinks.map((sl, si) => {
    const indent  = si === 0 ? '└─' : '   └─';
    const jt      = si === def.subLinks.length - 1 ? jtype : 'fixed';
    const linkName= resolveRoleName(sl.role, idx);
    return `
      <div class="sub-link">
        <span class="sub-link-indent">${indent}</span>
        <div class="sub-link-dot" style="background:${seg.color}"></div>
        <span class="sub-link-name" style="color:${seg.color}">${linkName}</span>
        <span class="sub-link-joint jt-${jt}">${jt}</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="seg-header" draggable="true"
         ondragstart="segDragStart(event,${seg.id})"
         ondragend="segDragEnd(event,${seg.id})"
         onclick="selectSegment(${seg.id})">
      <span class="seg-drag-handle" title="Drag to reorder">⠿</span>
      <div class="seg-color-bar" style="background:${seg.color}"></div>
      <div class="seg-title">
        <div class="seg-type">${seg.label}</div>
        <div class="seg-idx">${segLabel} · ${propSummary}</div>
      </div>
      <div class="seg-actions">
        <button class="seg-btn"     onclick="event.stopPropagation();selectSegment(${seg.id})">cfg</button>
        <button class="seg-btn del" onclick="event.stopPropagation();onRemoveSegment(${seg.id})">✕</button>
      </div>
    </div>
    <div class="seg-body">${subHTML}</div>`;

  return el;
}

// ── Property summary line ─────────────────────────────────────────────────────
function buildPropSummary(seg) {
  const p     = seg.props;
  const parts = [];
  if (p.phi    !== undefined) parts.push(`φ=${parseFloat(p.phi).toFixed(3)}`);
  if (p.lower  !== undefined) parts.push(`[${p.lower}, ${p.upper}]`);
  if (p.height !== undefined) parts.push(`h=${(p.height * 1000) | 0}mm`);
  return parts.join(' · ');
}

// ── Config panel ──────────────────────────────────────────────────────────────
function selectSegment(id) {
  selectedId = id;
  document.querySelectorAll('.chain-segment').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.chain-segment[data-id="${id}"]`)?.classList.add('selected');
  renderConfigPanel(getSegment(id));
}

function renderConfigPanel(seg) {
  const empty   = document.getElementById('cp-empty');
  const content = document.getElementById('cp-content');

  if (!seg) {
    empty.style.display   = '';
    content.style.display = 'none';
    content.innerHTML     = '';
    return;
  }

  empty.style.display   = 'none';
  content.style.display = 'block';

  const p     = seg.props;
  const jtype = p.jointType ?? ELEMENT_DEFS[seg.type].subLinks[0]?.jointAfter ?? 'fixed';

  let html = `<div class="cp-section">
    <div class="cp-section-title">${seg.label}</div>`;

  if (p.phi !== undefined) {
    html += `
    <div class="cp-field">
      <label>Config Offset φ (rad)</label>
      <input type="number" id="cp_phi" value="${p.phi}" step="0.001">
    </div>`;
  }

  if (p.height !== undefined) {
    html += `
    <div class="cp-field">
      <label>Height (m)</label>
      <input type="number" id="cp_height" value="${p.height}" step="0.001">
    </div>`;
  }

  html += `</div>`;

  if (p.lower !== undefined) {
    html += `
    <div class="cp-section">
      <div class="cp-section-title">Joint</div>
      <div class="cp-field">
        <label>Type</label>
        <div class="cp-joint-type">
          <button class="jtype-btn ${jtype === 'revolute'  ? 'active-rev'  : ''}" onclick="onSetJointType(${seg.id},'revolute')">Revolute</button>
          <button class="jtype-btn ${jtype === 'prismatic' ? 'active-pris' : ''}" onclick="onSetJointType(${seg.id},'prismatic')">Prismatic</button>
        </div>
      </div>
      <div class="cp-row">
        <div class="cp-field"><label>Lower</label>   <input type="number" id="cp_lower"    value="${p.lower}"    step="0.01"></div>
        <div class="cp-field"><label>Upper</label>   <input type="number" id="cp_upper"    value="${p.upper}"    step="0.01"></div>
      </div>
      <div class="cp-row">
        <div class="cp-field"><label>Effort (Nm)</label><input type="number" id="cp_effort"   value="${p.effort}"   step="0.1"></div>
        <div class="cp-field"><label>Velocity</label>  <input type="number" id="cp_velocity" value="${p.velocity}" step="0.01"></div>
      </div>
    </div>`;
  }

  html += `<button class="apply-btn" onclick="onApplyProps(${seg.id})">Apply Changes</button>`;
  content.innerHTML = html;
}
