/**
 * xacroGenerator.js
 *
 * Generates xacro/URDF from the current chain state.
 *
 * Two reference examples drive all origin rules:
 *   - aly_arm.xacro    (revolute-first chain)
 *   - aly_arm_8_.xacro (prismatic-first chain with post-prismatic revolute)
 *
 * Key rules:
 *
 * motor_assembly_p — FIRST (from holder_link):
 *   joint xyz="0.0 0 ${j1_z}"  rpy="0 ${phi} 0"    visual rpy="1.57 0 0"
 *
 * motor_assembly_p — SUBSEQUENT:
 *   joint xyz="0.036 0 0"       rpy="0 0 ${phi}"    visual rpy="3.14 0 0"
 *
 * motor_assembly — FIRST (from holder_link):
 *   joint xyz="0 0 ${j1_z}"    rpy="0 ${phi} 0"    visual rpy="1.57 0 0"
 *
 * motor_assembly — SUBSEQUENT (from passive, normal revolute path):
 *   joint xyz="0.036 0 0"       rpy="0 ${phi} 0"    visual rpy="3.14 0 0"
 *
 * motor_assembly — afterPostPrismatic (from intermediate link):
 *   joint xyz="0 0 0"             rpy="0 0 ${phi}"    visual rpy="0 0 0"
 *   resets afterPostPrismatic=false
 *
 * motor_assembly_p — afterPostPrismatic (from intermediate link):
 *   joint xyz="0 0 0"             rpy="0 0 ${phi}"    visual rpy="3.14 0 0"
 *   resets afterPostPrismatic=false, sets isFirstPrismatic=true
 *
 * rack — FIRST prismatic (isFirstPrismatic=true):
 *   joint xyz="0.045 0 0.030"   rpy="1.570 0 1.57"  visual rpy="0 0 0"
 *
 * rack — SUBSEQUENT:
 *   joint xyz="0.045 -0.030 0.0" rpy="3.14 -1.57 0" visual rpy="0 0 0"
 *   sets postPrismatic=true
 *
 * active — FIRST revolute (!afterPostPrismatic):
 *   joint xyz="0.019500 0 -0.0040" rpy="3.140 0 0"  visual rpy="0 0 0"
 *
 * active — after postPrismatic:
 *   joint xyz="0.019500 -0.003 0.000" rpy="1.57 0 0" visual rpy="0 0 0"
 *
 * active — SUBSEQUENT revolute:
 *   joint xyz="0.019500 0.0040 0" rpy="-1.57 0 0"   visual rpy="0 0 0"
 *
 * passive — normal (after active):
 *   joint xyz="0.036 0 0"        rpy="${phi} 0 0"    visual rpy="0 1.57 0"
 *
 * passive — postPrismatic: emits 2-part block only (motor_assembly/motor_assembly_p handles itself):
 *   1. passive hirth:      xyz="0 0 0.0036"  rpy="0 0 ${phi}"  visual rpy="0 0 0"
 *   2. empty intermediate: xyz="0 0 0.036"   rpy="0 -1.5 0"
 *   sets afterPostPrismatic=true, postPrismatic=false, parentLink=intermediate
 */

function buildXacro() {
  const j0x       = parseFloat(document.getElementById('j0_x_input').value) || 0.003;
  const baseRoll  = parseFloat(document.getElementById('base_roll').value)   || 0;
  const basePitch = parseFloat(document.getElementById('base_pitch').value)  || 0;
  const baseYaw   = parseFloat(document.getElementById('base_yaw').value)    || 0;
  const f = v => parseFloat(v).toFixed(4);

  const holderSeg  = chain.find(s => ELEMENT_DEFS[s.type]?.subLinks[0]?.role === 'holder');
  const j1z        = holderSeg?.props?.height ?? 0.0804;
  const holderMesh = holderSeg
    ? ELEMENT_DEFS[holderSeg.type].subLinks[0].mesh
    : 'base_motorholder_90deg_V4-Body.dae';

  // ── phi properties ─────────────────────────────────────────────────────────
  const propLines = [
    `  <xacro:property name="j0_x" value="${f(j0x)}" />`,
    `  <xacro:property name="j1_z" value="${f(j1z)}" />`,
  ];

  let phiCounter = 1;
  const segPhiMap = [];

  chain.forEach((seg) => {
    const role0 = ELEMENT_DEFS[seg.type]?.subLinks[0]?.role;
    const entry  = { main: null, penHolder: null };
    if (role0 === 'holder') {
      // no phi
    } else if (seg.type === 'rack_pen') {
      const phi2Name = `phi_${phiCounter++}`;
      propLines.push(`  <xacro:property name="${phi2Name}" value="${f(seg.props.phi2 ?? 0)}" />`);
      entry.penHolder = phi2Name;
    } else {
      const phiName = `phi_${phiCounter++}`;
      propLines.push(`  <xacro:property name="${phiName}" value="${f(seg.props.phi ?? 0)}" />`);
      entry.main = phiName;
    }
    segPhiMap.push(entry);
  });

  // ── State ──────────────────────────────────────────────────────────────────
  let body                 = '';
  let parentLink           = 'holder_link';
  let cfgIdx               = 0;
  let dofIdx               = 0;
  let linkCounter          = 1;
  let isFirstMotorAssembly = true;
  let isFirstRevolute      = true;
  let isFirstPrismatic     = false;
  let postPrismatic        = false;
  let afterPostPrismatic   = false;
  let afterPrismaticMotor  = false;   // set by motor_assembly after consuming afterPostPrismatic
  let prevRole             = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function emitJointLink(jName, jType, parent, child, origin, axisLimit, mesh, vRpy) {
    body += `
  <joint name="${jName}" type="${jType}">
    <parent link="${parent}"/>
    <child link="${child}"/>
    ${origin}${axisLimit}
  </joint>

  <link name="${child}">
    <visual>
      <origin xyz="0 0 0" rpy="${vRpy}"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${mesh}" scale="1 1 1"/></geometry>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="${vRpy}"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${mesh}" scale="1 1 1"/></geometry>
    </collision>
  </link>
`;
  }

  function emitEmptyLink(jName, parent, child, origin) {
    body += `
  <joint name="${jName}" type="fixed">
    <parent link="${parent}"/>
    <child link="${child}"/>
    ${origin}
  </joint>

  <link name="${child}"/>
`;
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  chain.forEach((seg, segIdx) => {
    const def     = ELEMENT_DEFS[seg.type];
    const p       = seg.props;
    const phiInfo = segPhiMap[segIdx];

    def.subLinks.forEach(sl => {

      // ── holder: link only ──────────────────────────────────────────────────
      if (sl.role === 'holder') {
        body += `
  <link name="holder_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 3.14"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 3.14"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
    </collision>
  </link>
`;
        return;
      }

      // ── joint type ─────────────────────────────────────────────────────────
      const slJtype = sl.jointAfter || 'fixed';
      const jtype   = (slJtype !== 'fixed' && p.jointType) ? p.jointType : slJtype;
      const isDOF   = jtype !== 'fixed';

      // ── axis + limits ──────────────────────────────────────────────────────
      const axisLimit = isDOF ? `
    <axis xyz="${sl.jointAxis || '0 0 1'}"/>
    <limit effort="${f(p.effort ?? 10)}" lower="${f(p.lower ?? -1.25)}" upper="${f(p.upper ?? 1.20)}" velocity="${f(p.velocity ?? 1.0)}"/>` : '';

      // ── child name (always unique) ─────────────────────────────────────────
      const childName = sl.role === 'pen_holder'  ? `pen_holder_link_${linkCounter++}`
                      : sl.role === 'tool_flange' ? `tool_flange_link_${linkCounter++}`
                      : `link_${linkCounter++}`;

      // ── per-role ───────────────────────────────────────────────────────────
      switch (sl.role) {

        // ── motor_assembly_p ─────────────────────────────────────────────────
        case 'motor_assembly_p': {
          let originStr, visRpy;
          if (afterPostPrismatic) {
            // Coming from passive's intermediate link after a post-prismatic passive
            originStr          = `<origin xyz="0 0 0" rpy="0 0 \${${phiInfo.main}}"/>`;
            visRpy             = '3.14 0 0';
            afterPostPrismatic = false;
            isFirstMotorAssembly = false;
            // NOTE: do NOT set isFirstPrismatic — the rack that follows is always SUBSEQ
          } else if (isFirstMotorAssembly) {
            originStr = `<origin xyz="0.0 0 \${j1_z}" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
            isFirstMotorAssembly = false;
            isFirstPrismatic     = true;
          } else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 0 \${${phiInfo.main}}"/>`;
            visRpy    = '3.14 0 0';
          }
          emitJointLink(`config_joint_${cfgIdx++}`, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, visRpy);
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── motor_assembly ───────────────────────────────────────────────────
        case 'motor_assembly': {
          let originStr, visRpy;
          if (afterPostPrismatic) {
            // Coming from passive's intermediate link after a post-prismatic passive
            originStr          = `<origin xyz="0 0 0" rpy="0 0 \${${phiInfo.main}}"/>`;
            visRpy             = '0 0 0';
            afterPostPrismatic  = false;
            afterPrismaticMotor = true;   // active that follows needs special origin
            isFirstMotorAssembly = false;
          } else if (isFirstMotorAssembly) {
            originStr = `<origin xyz="0 0 \${j1_z}" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
            isFirstMotorAssembly = false;
          } else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '3.14 0 0';
          }
          emitJointLink(`config_joint_${cfgIdx++}`, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, visRpy);
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── active ───────────────────────────────────────────────────────────
        case 'active': {
          let originStr;
          if (afterPrismaticMotor) {
            originStr           = `<origin xyz="0.019500 -0.003 0.000" rpy="1.57 0 0"/>`;
            afterPrismaticMotor = false;
            isFirstRevolute     = false;
          } else if (afterPostPrismatic) {
            // active directly after rack (no motor_assembly in between)
            originStr          = `<origin xyz="0.019500 -0.003 0.000" rpy="1.57 0 0"/>`;
            afterPostPrismatic = false;
            isFirstRevolute    = false;
          } else if (isFirstRevolute && jtype === 'revolute') {
            originStr       = `<origin xyz="0.019500 0 -0.0040" rpy="3.140 0 0"/>`;
            isFirstRevolute = false;
          } else {
            originStr = `<origin xyz="0.019500 0.0040 0" rpy="-1.57 0 0"/>`;
            if (jtype === 'revolute') isFirstRevolute = false;
          }
          const jName = isDOF ? `joint_${dofIdx++}` : `config_joint_${cfgIdx++}`;
          emitJointLink(jName, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, '0 0 0');
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── rack ─────────────────────────────────────────────────────────────
        case 'rack': {
          let originStr;
          if (isFirstPrismatic) {
            originStr        = `<origin xyz="0.045 0 0.030" rpy="1.570 0 1.57"/>`;
            isFirstPrismatic = false;
          } else {
            originStr = `<origin xyz="0.045 -0.030 0.0" rpy="3.14 -1.57 0"/>`;
          }
          emitJointLink(`joint_${dofIdx++}`, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, '0 0 0');
          parentLink    = childName;
          postPrismatic = true;
          prevRole      = sl.role;
          break;
        }

        // ── passive ──────────────────────────────────────────────────────────
        case 'passive': {
          if (postPrismatic) {
            // 2-part block: passive hirth + empty intermediate
            // The motor_assembly / motor_assembly_p segment that follows
            // handles itself via the afterPostPrismatic flag.

            // Part 1: passive hirth
            emitJointLink(
              `config_joint_${cfgIdx++}`, 'fixed', parentLink, childName,
              `<origin xyz="0 0 0.0036" rpy="0 0 \${${phiInfo.main}}"/>`,
              '', sl.mesh, '0 0 0'
            );

            // Part 2: empty intermediate
            const intName = `${childName}_int`;
            emitEmptyLink(
              `config_joint_${cfgIdx++}`, childName, intName,
              `<origin xyz="0 0 0.036" rpy="0 -1.5 0"/>`
            );

            parentLink         = intName;
            postPrismatic      = false;
            afterPostPrismatic = true;
            prevRole           = sl.role;

          } else {
            // Normal revolute path
            emitJointLink(
              `config_joint_${cfgIdx++}`, 'fixed', parentLink, childName,
              `<origin xyz="0.036 0 0" rpy="\${${phiInfo.main}} 0 0"/>`,
              '', sl.mesh, '0 1.57 0'
            );
            parentLink = childName;
            prevRole   = sl.role;
          }
          break;
        }

        // ── pen_holder ────────────────────────────────────────────────────────
        case 'pen_holder': {
          emitJointLink(
            `config_joint_${cfgIdx++}`, 'fixed', parentLink, childName,
            `<origin xyz="0 0.020 0.022" rpy="0 0 \${${phiInfo.penHolder ?? 'phi_1'}}"/>`,
            '', sl.mesh, '0 0 0'
          );
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── tool_flange / fallback ────────────────────────────────────────────
        default: {
          const jName = isDOF ? `joint_${dofIdx++}` : `config_joint_${cfgIdx++}`;
          emitJointLink(
            jName, jtype, parentLink, childName,
            `<origin xyz="0 0 0" rpy="0 0 \${${phiInfo.main ?? 'phi_1'}}"/>`,
            axisLimit, sl.mesh, '0 0 0'
          );
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }
      }
    });
  });

  // ── Assemble ───────────────────────────────────────────────────────────────
  const propsBlock = `\n${propLines.join('\n')}\n`;

  return `<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="aly_arm">
${propsBlock}
  <link name="world"/>

  <joint name="world_joint" type="fixed">
    <parent link="world"/>
    <child link="base_link"/>
    <origin xyz="0 0 0" rpy="0 0 0"/>
  </joint>

  <link name="base_link">
    <visual>
      <geometry><mesh filename="http://localhost:8000/meshes/base_fixture-Body.dae" scale="1 1 1"/></geometry>
    </visual>
    <collision>
      <geometry><mesh filename="http://localhost:8000/meshes/base_fixture-Body.dae" scale="1 1 1"/></geometry>
    </collision>
  </link>

  <joint name="base_holder_joint" type="fixed">
    <parent link="base_link"/>
    <child link="holder_link"/>
    <origin xyz="\${j0_x} 0 0" rpy="${f(baseRoll)} ${f(basePitch)} ${f(baseYaw)}"/>
  </joint>
${body}
</robot>`;
}

// ── Syntax highlighting ────────────────────────────────────────────────────────
function syntaxHighlight(xml) {
  return xml
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(&lt;\/?[\w:]+)/g,  '<span class="xml-tag">$1</span>')
    .replace(/(\s[\w:]+)=/g,      '<span class="xml-attr">$1</span>=')
    .replace(/="([^"]*)"/g,       '="<span class="xml-value">$1</span>"')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>');
}