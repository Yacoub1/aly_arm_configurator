/**
 * xacroGenerator.js
 *
 * Generates xacro/URDF from the current chain state.
 *
 * Exact origin rules derived from reference aly_arm_8_.xacro:
 *
 * motor_assembly_p — FIRST (from holder_link):
 *   joint xyz="0.0 0 ${j1_z}"       rpy="0 ${phi} 0"
 *   visual rpy="1.57 0 0"
 *
 * rack — FIRST prismatic (from motor_assembly_p):
 *   joint xyz="0.045 0 0.030"        rpy="1.570 0 1.57"
 *   visual rpy="0 0 0"
 *
 * passive — after rack (postPrismatic, first passive):
 *   joint xyz="0 0 0.0036"           rpy="0 0 ${phi}"
 *   visual rpy="0 0 0"
 *   THEN emits intermediate joint:
 *     joint xyz="0 0 0.036"          rpy="0 -1.5 0"  → empty link
 *     joint xyz="0 0 0"              rpy="0 0 ${phi_next}" → motor_assembly link
 *
 * motor_assembly — FIRST (from holder_link, revolute path):
 *   joint xyz="0 0 ${j1_z}"         rpy="0 ${phi} 0"
 *   visual rpy="1.57 0 0"
 *
 * motor_assembly — SUBSEQUENT (from passive, revolute path):
 *   joint xyz="0.036 0 0"            rpy="0 ${phi} 0"
 *   visual rpy="3.14 0 0"
 *
 * motor_assembly — after postPrismatic passive (handled inside passive case):
 *   emitted as part of the passive two-joint block
 *   joint xyz="0 0 0"               rpy="0 0 ${phi}"
 *   visual rpy="0 0 0"
 *
 * active — FIRST revolute (joint_0, from motor_assembly):
 *   joint xyz="0.019500 0 -0.0040"  rpy="3.140 0 0"
 *   visual rpy="0 0 0"
 *
 * active — after postPrismatic (from motor_assembly after passive):
 *   joint xyz="0.019500 -0.003 0.000" rpy="1.57 0 0"
 *   visual rpy="0 0 0"
 *
 * active — SUBSEQUENT revolute (joint_1+):
 *   joint xyz="0.019500 0.0040 0"   rpy="-1.57 0 0"
 *   visual rpy="0 0 0"
 *
 * passive — normal (after active, revolute path):
 *   joint xyz="0.036 0 0"           rpy="${phi} 0 0"
 *   visual rpy="0 1.57 0"
 *
 * rack — subsequent (not first prismatic):
 *   joint xyz="0.045 -0.030 0.0"    rpy="3.14 -1.57 0"
 *   visual rpy="0 0 0"
 *
 * pen_holder:
 *   joint xyz="0 0.020 0.022"       rpy="0 0 ${phi2}"
 *   visual rpy="0 0 0"
 */

function buildXacro() {
  const j0x       = parseFloat(document.getElementById('j0_x_input').value) || 0.003;
  const baseRoll  = parseFloat(document.getElementById('base_roll').value)   || 0;
  const basePitch = parseFloat(document.getElementById('base_pitch').value)  || 0;
  const baseYaw   = parseFloat(document.getElementById('base_yaw').value)    || 0;
  const f = v => parseFloat(v).toFixed(4);

  // j1_z + holder mesh from chain[0]
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

  // ── State variables ────────────────────────────────────────────────────────
  let body             = '';
  let parentLink       = 'holder_link';
  let cfgIdx           = 0;
  let dofIdx           = 0;
  let linkCounter      = 1;
  let isFirstMotorAssembly = true;
  let isFirstRevolute      = true;
  let isFirstPrismatic     = false;
  let postPrismatic        = false;  // true after rack is emitted
  let afterPostPrismatic   = false;  // true after the passive+intermediate block
  let prevRole             = null;
  let lastRackName = null;

  // ── Helper: emit a standard joint+link block ───────────────────────────────
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

  // ── Helper: emit an empty link ─────────────────────────────────────────────
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

  // ── Main chain loop ────────────────────────────────────────────────────────
  chain.forEach((seg, segIdx) => {
    const def     = ELEMENT_DEFS[seg.type];
    const p       = seg.props;
    const phiInfo = segPhiMap[segIdx];

    def.subLinks.forEach(sl => {

      // ── holder: link only ────────────────────────────────────────────────
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

      // ── Resolve joint type ───────────────────────────────────────────────
      const slJtype = sl.jointAfter || 'fixed';
      const jtype   = (slJtype !== 'fixed' && p.jointType) ? p.jointType : slJtype;
      const isDOF   = jtype !== 'fixed';

      // ── Child link name ──────────────────────────────────────────────────
      const childName = sl.role === 'pen_holder'  ? 'pen_holder_link'
                      : sl.role === 'tool_flange' ? 'tool_flange_link'
                      : `link_${linkCounter++}`;

      // ── Axis + limits ────────────────────────────────────────────────────
      const axisLimit = isDOF ? `
    <axis xyz="${sl.jointAxis || '0 0 1'}"/>
    <limit effort="${f(p.effort ?? 10)}" lower="${f(p.lower ?? -1.25)}" upper="${f(p.upper ?? 1.20)}" velocity="${f(p.velocity ?? 1.0)}"/>` : '';

      // ── Per-role logic ───────────────────────────────────────────────────
      switch (sl.role) {

        // ── motor_assembly_p ───────────────────────────────────────────────
        case 'motor_assembly_p': {
          let originStr, visRpy;
          if (isFirstMotorAssembly) {
            originStr = `<origin xyz="0.0 0 \${j1_z}" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
            isFirstMotorAssembly = false;
            isFirstPrismatic = true;
          } else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 0 \${${phiInfo.main}}"/>`;
            visRpy    = '3.14 0 0';
          }
          const jName = `config_joint_${cfgIdx++}`;
          emitJointLink(jName, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, visRpy);
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── motor_assembly ─────────────────────────────────────────────────
        case 'motor_assembly': {
          // If we just came out of postPrismatic passive block,
          // the motor_assembly was already emitted there — skip it
          if (afterPostPrismatic) {
            // don't emit, don't increment cfgIdx
            // just update parentLink to what the passive block set it to
            prevRole = sl.role;
            break;
          }
          
          let originStr, visRpy;
          if (isFirstMotorAssembly) {
            originStr = `<origin xyz="0 0 \${j1_z}" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
            isFirstMotorAssembly = false;
          } else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '3.14 0 0';
          }
          const jName = `config_joint_${cfgIdx++}`;
          emitJointLink(jName, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, visRpy);
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── active ─────────────────────────────────────────────────────────
        case 'active': {
          let originStr;
          if (isFirstRevolute && jtype === 'revolute' && !afterPostPrismatic) {
            originStr = `<origin xyz="0.019500 0 -0.0040" rpy="3.140 0 0"/>`;
            isFirstRevolute = false;
          } else if (afterPostPrismatic) {
            originStr = `<origin xyz="0.019500 -0.003 0.000" rpy="1.57 0 0"/>`;
            afterPostPrismatic = false;
            isFirstRevolute    = false;
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

        // ── rack ───────────────────────────────────────────────────────────
        case 'rack': {
          let originStr;
          if (isFirstPrismatic) {
            originStr = `<origin xyz="0.045 0 0.030" rpy="1.570 0 1.57"/>`;
            isFirstPrismatic = false;
          } else {
            originStr = `<origin xyz="0.045 -0.030 0.0" rpy="3.14 -1.57 0"/>`;
          }
          const jName = `joint_${dofIdx++}`;
          emitJointLink(jName, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, '0 0 0');
          lastRackName = childName;
          parentLink    = childName;
          postPrismatic = true;
          prevRole      = sl.role;
          break;
        }

        // ── passive ────────────────────────────────────────────────────────
        case 'passive': {
          if (postPrismatic) {
            // ── Post-prismatic passive: 3-part block ───────────────────────
            // Part 1: passive hirth joint + link
            const passiveJName = `config_joint_${cfgIdx++}`;
            const passiveOrigin = `<origin xyz="0 0 0.0036" rpy="0 0 \${${phiInfo.main}}"/>`;
            emitJointLink(passiveJName, 'fixed', parentLink, childName, passiveOrigin, '', sl.mesh, '0 0 0');

            // Part 2: intermediate empty link
            const intName  = `${childName}_int`;
            const intJName = `config_joint_${cfgIdx++}`;
            emitEmptyLink(intJName, childName, intName, `<origin xyz="0 0 0.036" rpy="0 -1.5 0"/>`);

            // Part 3: motor_assembly link with phi as yaw (uses NEXT segment's phi)
            // The next segment in the chain should be a joint_revolute —
            // we look ahead to get its phi
            const nextSegIdx  = segIdx + 1;
            const nextPhiInfo = segPhiMap[nextSegIdx];
            const motorName   = `link_${linkCounter++}`;
            const motorJName  = `config_joint_${cfgIdx++}`;
            const motorOrigin = `<origin xyz="0 0 0" rpy="0 0 \${${nextPhiInfo?.main ?? phiInfo.main}}"/>`;
            emitJointLink(motorJName, 'fixed', intName, motorName, motorOrigin, '', 'motor_assembly.dae', '0 0 0');

            parentLink       = motorName;
            postPrismatic    = false;
            afterPostPrismatic = true;
            prevRole         = sl.role;

          } else {
            // ── Normal revolute path ───────────────────────────────────────
            const originStr = `<origin xyz="0.036 0 0" rpy="\${${phiInfo.main}} 0 0"/>`;
            const jName     = `config_joint_${cfgIdx++}`;
            emitJointLink(jName, 'fixed', parentLink, childName, originStr, '', sl.mesh, '0 1.57 0');
            parentLink = childName;
            prevRole   = sl.role;
          }
          break;
        }

        // ── pen_holder ─────────────────────────────────────────────────────
        case 'pen_holder': {
          const originStr = `<origin xyz="0 0.020 0.022" rpy="0 0 \${${phiInfo.penHolder ?? 'phi_1'}}"/>`;
          const jName     = `config_joint_${cfgIdx++}`;
          emitJointLink(jName, 'fixed', parentLink, childName, originStr, '', sl.mesh, '0 0 0');
          parentLink = childName;
          prevRole   = sl.role;
          break;
        }

        // ── tool_flange / fallback ─────────────────────────────────────────
        default: {
          const originStr = `<origin xyz="0 0 0" rpy="0 0 \${${phiInfo.main ?? 'phi_1'}}"/>`;
          const jName     = isDOF ? `joint_${dofIdx++}` : `config_joint_${cfgIdx++}`;
          emitJointLink(jName, jtype, parentLink, childName, originStr, axisLimit, sl.mesh, '0 0 0');
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