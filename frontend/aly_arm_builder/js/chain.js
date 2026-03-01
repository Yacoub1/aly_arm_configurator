/**
 * chain.js
 *
 * Owns the live chain array and all mutations.
 * Pure data — no DOM (that lives in renderer.js).
 *
 * RULE: chain[0] must always be a holder variant
 *       (motor_holder_90_77 / motor_holder_90_56 / motor_holder_0).
 */

let chain      = [];
let selectedId = null;
let nextId     = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSegment(id)  { return chain.find(s => s.id === id) ?? null; }
function getChainCopy()  { return chain.map(s => ({ ...s, props: { ...s.props } })); }

// ── Mutations ─────────────────────────────────────────────────────────────────
function addSegment(type, insertIdx) {
  const def = ELEMENT_DEFS[type];
  if (!def) return null;
  const seg = {
    id:    nextId++,
    type,
    label: def.label,
    color: def.color,
    props: { ...def.defaults },
  };
  chain.splice(insertIdx, 0, seg);
  return seg;
}

function removeSegment(id) {
  const idx = chain.findIndex(s => s.id === id);
  if (idx === -1) return false;
  chain.splice(idx, 1);
  if (selectedId === id) selectedId = null;
  return true;
}

function reorderSegment(id, toIdx) {
  const fromIdx = chain.findIndex(s => s.id === id);
  if (fromIdx === -1) return;
  const [seg] = chain.splice(fromIdx, 1);
  const adjusted = toIdx > fromIdx ? toIdx - 1 : toIdx;
  chain.splice(adjusted, 0, seg);
}

function clearChain() {
  chain      = [];
  selectedId = null;
}

function applySegmentProps(id, newProps) {
  const seg = getSegment(id);
  if (!seg) return;
  Object.assign(seg.props, newProps);
}

// ── Default chain matching reference aly_arm.xacro ────────────────────────────
function loadExampleChain() {
  const initial = [
    // chain[0]: holder — sets holder_link mesh and j1_z height
    { type: 'motor_holder_90_77', props: { height: 0.0804 } },
    // 3x revolute DOF + passive hirth connectors
    { type: 'joint_revolute',     props: { phi: 0.0,   lower: -1.25, upper: 1.20,  effort: 10, velocity: 1.0, jointType: 'revolute'  } },
    { type: 'passive_link',       props: { phi: 1.570 } },
    { type: 'joint_revolute',     props: { phi: 0.0,   lower: -1.25, upper: 1.20,  effort: 10, velocity: 1.0, jointType: 'revolute'  } },
    { type: 'passive_link',       props: { phi: 1.570 } },
    { type: 'joint_revolute',     props: { phi: 0.0,   lower: -1.25, upper: 1.20,  effort: 10, velocity: 1.0, jointType: 'revolute'  } },
    { type: 'passive_link',       props: { phi: 1.570 } },
    // prismatic DOF + end effector
    { type: 'joint_prismatic',    props: { phi: 1.570, lower: 0.0,   upper: 0.045, effort: 10, velocity: 1.0, jointType: 'prismatic' } },
    { type: 'rack_pen',           props: { phi2: 0.0,  lower: 0.0,   upper: 0.045, effort: 10, velocity: 1.0, jointType: 'prismatic' } },
  ];
  initial.forEach(s => {
    const seg = addSegment(s.type, chain.length);
    if (seg) Object.assign(seg.props, s.props);
  });
}

// ── Link name resolution (used by renderer for display only) ──────────────────
function resolveRoleName(role, segIdx) {
  const map = {
    holder:          'holder_link',
    motor_assembly:  `link_motor_${segIdx}`,
    motor_assembly_p:`link_motor_p_${segIdx}`,
    active:          `link_active_${segIdx}`,
    passive:         `link_passive_${segIdx}`,
    rack:            'rack_link',
    pen_holder:      'pen_holder_link',
    tool_flange:     'tool_flange_link',
  };
  return map[role] ?? `link_${role}_${segIdx}`;
}