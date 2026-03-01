/**
 * app.js
 *
 * Top-level controller. Wires together chain.js, renderer.js, dragDrop.js,
 * xacroGenerator.js and viewer.js.
 *
 * All UI event callbacks that don't belong to a specific module live here.
 */

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
//----Color mode
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  document.getElementById('theme-toggle').textContent = isLight ? '☾' : '☀';
}
// ── Segment event callbacks (called from renderer-generated innerHTML) ────────
function onRemoveSegment(id) {
  removeSegment(id);
  renderChain();
  if (!getSegment(selectedId)) renderConfigPanel(null);
}

function onSetJointType(id, jtype) {
  applySegmentProps(id, { jointType: jtype });
  renderChain();
  selectSegment(id);
}

function onApplyProps(id) {
  const get = elId => { const el = document.getElementById(elId); return el ? parseFloat(el.value) : undefined; };
  const seg = getSegment(id);
  if (!seg) return;
  const p = seg.props;

  const updates = {};
  if (p.phi      !== undefined) updates.phi      = get('cp_phi')      ?? p.phi;
  if (p.height   !== undefined) updates.height   = get('cp_height')   ?? p.height;
  if (p.lower    !== undefined) updates.lower    = get('cp_lower')    ?? p.lower;
  if (p.upper    !== undefined) updates.upper    = get('cp_upper')    ?? p.upper;
  if (p.effort   !== undefined) updates.effort   = get('cp_effort')   ?? p.effort;
  if (p.velocity !== undefined) updates.velocity = get('cp_velocity') ?? p.velocity;

  applySegmentProps(id, updates);
  renderChain();
  selectSegment(id);
  showToast('PROPERTIES APPLIED');
}

// ── Header buttons ────────────────────────────────────────────────────────────
function onClearChain() {
  if (chain.length === 0) return;
  if (!confirm('Clear the entire chain?')) return;
  clearChain();
  renderChain();
  renderConfigPanel(null);
  showToast('CHAIN CLEARED');
}

function onExportXacro() {
  if (chain.length === 0) { showToast('ADD ELEMENTS TO THE CHAIN FIRST'); return; }
  document.getElementById('modal-code').innerHTML = syntaxHighlight(buildXacro());
  document.getElementById('xacro-modal').classList.add('open');
}

function onDownloadXacro() {
  if (chain.length === 0) { showToast('ADD ELEMENTS TO THE CHAIN FIRST'); return; }
  const a  = document.createElement('a');
  a.href   = URL.createObjectURL(new Blob([buildXacro()], { type: 'text/xml' }));
  a.download = 'aly_arm.xacro';
  a.click();
  showToast('DOWNLOADING...');
}

function onCopyXacro() {
  if (chain.length === 0) return;
  navigator.clipboard.writeText(buildXacro()).then(() => showToast('COPIED TO CLIPBOARD'));
}

// ── Xacro modal ───────────────────────────────────────────────────────────────
function closeXacroModal(e) {
  if (!e || e.target === document.getElementById('xacro-modal')) closeXacroModalDirect();
}
function closeXacroModalDirect() {
  document.getElementById('xacro-modal').classList.remove('open');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('light');
  document.getElementById('theme-toggle').textContent = '☾';
  
  loadExampleChain();
  renderChain();
});

