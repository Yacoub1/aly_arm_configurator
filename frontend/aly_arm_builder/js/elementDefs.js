/**
 * elementDefs.js
 *
 * Full tree structure:
 *
 *   world ──[fixed]──► base_link ──[fixed]──► holder_link        (template hardcoded)
 *     └─[fixed]──► motor_assembly                                  (joint_revolute[0])
 *         └─[revolute]──► active_link                              (joint_revolute[1])
 *             └─[fixed]──► passive_link                            (passive_link)
 *                 └─[fixed]──► motor_assembly        (next joint_revolute or joint_prismatic)
 *                     └─[revolute|prismatic]──► active_link
 *                         └─ ...
 *                         └─[fixed]──► rack_link                  (rack_pen[0])
 *                             └─[fixed]──► pen_holder_link        (rack_pen[1])
 *
 * Role reference (used by xacroGenerator.js switch):
 *   holder          — base motor holder, emits <link> ONLY (joint is hardcoded in template)
 *   motor_assembly  — revolute motor assembly (fixed joint)
 *   motor_assembly_p— prismatic motor assembly (fixed joint, phi → yaw)
 *   active          — active hirth coupler (revolute DOF joint)
 *   passive         — passive hirth coupler (fixed joint)
 *   rack            — rack output (prismatic DOF joint)
 *   pen_holder      — pen holder (fixed joint)
 *   tool_flange     — generic end effector (fixed joint)
 */

const ELEMENT_DEFS = {

  // ── Base Holders (MUST be first element in chain) ────────────────────────────
  // Role 'holder': emits <link> only — no joint (joint is hardcoded in template)
  motor_holder_90_77: {
    label: 'Motor Holder 90° (77mm)',
    color: '#44ff88',
    subLinks: [
      { role: 'holder', mesh: 'base_motorholder_90deg_V4-Body.dae' },
    ],
    defaults: { height: 0.0804 },
  },

  motor_holder_90_56: {
    label: 'Motor Holder 90° (56mm)',
    color: '#44ff88',
    subLinks: [
      { role: 'holder', mesh: 'base_motorholder_90deg_V4-Body.dae' },
    ],
    defaults: { height: 0.060 },
  },

  motor_holder_0: {
    label: 'Motor Holder 0° (inline)',
    color: '#88ff44',
    subLinks: [
      { role: 'holder', mesh: 'base_motorholder_90deg_V4-Body.dae' },
    ],
    defaults: { height: 0.0804 },
  },

  // ── DOF Modules ──────────────────────────────────────────────────────────────
  // joint_revolute:  motor_assembly (fixed) → active (revolute DOF)
  joint_revolute: {
    label: 'Revolute Joint Module',
    color: '#ff6b35',
    subLinks: [
      { role: 'motor_assembly', mesh: 'motor_assembly.dae',                            jointAfter: 'fixed'    },
      { role: 'active',         mesh: 'lnk_active_0deg_hirth_18d0_V2_a2plus-Part.dae', jointAfter: 'revolute', jointAxis: '0 0 1' },
    ],
    defaults: { phi: 0.0, lower: -1.25, upper: 1.20, effort: 10.0, velocity: 1.0, jointType: 'revolute' },
  },

  // joint_prismatic: motor_assembly_p (fixed) → active (prismatic DOF)
  joint_prismatic: {
    label: 'Prismatic Joint Module',
    color: '#ffd700',
    subLinks: [
      { role: 'motor_assembly_p', mesh: 'motor_assembly_presmatic_joint.dae',           jointAfter: 'fixed'     },
      { role: 'rack',       mesh: 'rack_assebmly-Part.dae',   jointAfter: 'prismatic', jointAxis: '0 0 1' },
    ],
    defaults: { phi: 0.0, lower: 0.0, upper: 0.045, effort: 10.0, velocity: 1.0, jointType: 'prismatic' },
  },

  // ── Connectors ───────────────────────────────────────────────────────────────
  passive_link: {
    label: 'Passive Hirth Link',
    color: '#00e5ff',
    subLinks: [
      { role: 'passive', mesh: 'lnk_passive_0deg_hirth_18_V3-Body.dae', jointAfter: 'fixed' },
    ],
    defaults: { phi: 1.570 },
  },

  // ── End Effectors ─────────────────────────────────────────────────────────────
  // rack_pen: rack (prismatic DOF from active of joint_prismatic) → pen_holder (fixed)
  rack_pen: {
    label: 'Rack + Pen Holder',
    color: '#bb88ff',
    subLinks: [
      { role: 'pen_holder', mesh: 'pen_holder_assembly.dae',  jointAfter: 'fixed' },
    ],
    defaults: { phi2: 0.0 },
  },

  tool_flange: {
    label: 'Tool Flange',
    color: '#ff88bb',
    subLinks: [
      { role: 'tool_flange', mesh: 'tool_flange.dae', jointAfter: 'fixed' },
    ],
    defaults: { phi: 0.0 },
  },
};