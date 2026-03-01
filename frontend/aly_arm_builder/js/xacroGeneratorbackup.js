/**
 * xacroGenerator.js
 *
 * Generates xacro/URDF from the current chain state.
 *
 * Template always hardcodes:
 *   world → base_link (world_joint)
 *   base_link → holder_link (base_holder_joint, xyz="${j0_x} 0 0")
 *
 * chain[0] MUST be a holder variant. Its role='holder' emits ONLY
 * the <link name="holder_link"> — the joint is already in the template.
 *
 * All other segments emit interleaved <joint>…<link> pairs.
 *
 * Origin rules (from reference aly_arm.xacro):
 *
 *   motor_assembly — FIRST (parent = holder_link):
 *     joint xyz="0 0 ${j1_z}"        rpy="0 ${phi} 0"
 *     visual rpy="1.57 0 0"
 *
 *   motor_assembly — SUBSEQUENT (parent = passive):
 *     joint xyz="0.036 0 0"           rpy="0 ${phi} 0"
 *     visual rpy="3.14 0 0"
 *
 *   motor_assembly_p (parent = passive):
 *     joint xyz="0.036 0 0"           rpy="0 0 ${phi}"   ← yaw
 *     visual rpy="3.14 0 0"
 *
 *   active — FIRST revolute (joint_0):
 *     joint xyz="0.019500 0 -0.0040"  rpy="3.140 0 0"
 *     visual rpy="0 0 0"
 *
 *   active — SUBSEQUENT revolute (joint_1+):
 *     joint xyz="0.019500 0.0040 0"   rpy="-1.57 0 0"
 *     visual rpy="0 0 0"
 *
 *   active — prismatic (any):
 *     joint xyz="0.019500 0.0040 0"   rpy="-1.57 0 0"
 *     visual rpy="0 0 0"
 *
 *   passive:
 *     joint xyz="0.036 0 0"           rpy="${phi} 0 0"
 *     visual rpy="0 1.57 0"
 *
 *   rack (child of active from joint_prismatic):
 *     joint xyz="0.045 -0.030 0.0"    rpy="3.14 -1.57 0"
 *     visual rpy="0 0 0"
 *
 *   pen_holder:
 *     joint xyz="0 0.020 0.022"       rpy="0 0 ${phi2}"
 *     visual rpy="0 0 0"
 */

function buildXacro() {
  const j0x       = parseFloat(document.getElementById('j0_x_input').value) || 0.001;
  const baseRoll  = parseFloat(document.getElementById('base_roll').value)   || 0;
  const basePitch = parseFloat(document.getElementById('base_pitch').value)  || 0;
  const baseYaw   = parseFloat(document.getElementById('base_yaw').value)    || 0;
  const f = v => parseFloat(v).toFixed(4);

  // j1_z from the holder segment height
  const holderSeg = chain.find(s => ELEMENT_DEFS[s.type]?.subLinks[0]?.role === 'holder');
  const j1z       = holderSeg?.props?.height ?? 0.0804;
  const holderMesh = holderSeg
    ? ELEMENT_DEFS[holderSeg.type].subLinks[0].mesh
    : 'base_motorholder_90deg_V4-Body.dae';

  // ── phi properties ─────────────────────────────────────────────────────────
  // holder has no phi.
  // rack_pen has no main phi but has phi2 for pen_holder.
  // All other segments have one main phi.
  const propLines = [
    `  <xacro:property name="j0_x" value="${f(j0x)}" />`,
    `  <xacro:property name="j1_z" value="${f(j1z)}" />`,
  ];

  let phiCounter = 1;
  const segPhiMap = [];  // one entry per chain segment

  chain.forEach((seg) => {
    const role0 = ELEMENT_DEFS[seg.type]?.subLinks[0]?.role;
    const entry  = { main: null, penHolder: null };

    if (role0 === 'holder') {
      // no phi for holder
    } else if (seg.type === 'rack_pen') {
      // rack_pen: only pen_holder needs a phi (phi2)
      const phi2Name = `phi_${phiCounter++}`;
      propLines.push(`  <xacro:property name="${phi2Name}" value="${f(seg.props.phi2 ?? 0)}" />`);
      entry.penHolder = phi2Name;
    } else {
      // all other segments: one main phi
      const phiName = `phi_${phiCounter++}`;
      propLines.push(`  <xacro:property name="${phiName}" value="${f(seg.props.phi ?? 0)}" />`);
      entry.main = phiName;
    }

    segPhiMap.push(entry);
  });

  // ── Build interleaved joint+link body ─────────────────────────────────────
  let body        = '';
  let parentLink  = 'holder_link';
  let cfgIdx      = 0;
  let dofIdx      = 0;
  let linkCounter = 1;
  let isFirstMotorAssembly = true;
  let isFirstRevolute      = true; 
  let isFirstPrismatic_r     = true; 
  let isFirstPrismatic_m     = false; 
  let prevRole = null
  let postPrismatic  = false;
  let intermediate = false;
  let intermediateStr = '';

  chain.forEach((seg, segIdx) => {
    const def     = ELEMENT_DEFS[seg.type];
    const p       = seg.props;
    const phiInfo = segPhiMap[segIdx];

    def.subLinks.forEach(sl => {

      // ── holder: emit <link> only, joint is in the template ────────────────
      if (sl.role === 'holder') {
        body += `
  <link name="holder_link">
    <visual>
      <origin xyz="0 0 0" rpy="0  0 3.14"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0  0 3.14"/>
      <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
    </collision>
  </link>
`;
        return; // no joint, parentLink stays 'holder_link'
      }

      // ── All other roles: emit joint + link ────────────────────────────────
      const slJtype = sl.jointAfter || 'fixed';
      const jtype   = (slJtype !== 'fixed' && p.jointType) ? p.jointType : slJtype;
      const isDOF   = jtype !== 'fixed';

      const jointName = isDOF ? `joint_${dofIdx}` : `config_joint_${cfgIdx}`;

      const childName = sl.role === 'rack'        ? 'rack_link'
                      : sl.role === 'pen_holder'  ? 'pen_holder_link'
                      : sl.role === 'tool_flange' ? 'tool_flange_link'
                      : `link_${linkCounter++}`;

      // ── Origin + visual RPY ────────────────────────────────────────────────
      let originStr;
      let visRpy = '0 0 0';

      switch (sl.role) {

        case 'motor_assembly':
          if (isFirstMotorAssembly && !(postPrismatic)) {
            originStr = `<origin xyz="0 0 \${j1_z}" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
          } else if (postPrismatic) {
              intermediate = true;
              const intermediateName = `link_${linkCounter++}_int`;
              intermediateStr = `
              <joint name="config_joint_${cfgIdx}" type="fixed">
                <parent link="${parentLink}"/>
                <child link="${intermediateName}"/>
                <origin xyz="0 0 0.036" rpy="0 -1.57 0"/>
              </joint>

              <link name="${intermediateName}"/>
            `;
              cfgIdx++;
              parentLink = intermediateName;  
              postPrismatic = false;
          }else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 \${${phiInfo.main}} 0"/>`;
            visRpy    = '3.14 0 0';
          }
          isFirstMotorAssembly = false;
          const jointName = isDOF ? `joint_${dofIdx}` : `config_joint_${cfgIdx}`;
          break;

        case 'motor_assembly_p':
          if (isFirstMotorAssembly) {
            originStr = `<origin xyz="0.0 0 \${j1_z}" rpy="0  \${${phiInfo.main}} 0"/>`;
            visRpy    = '1.57 0 0';
            isFirstPrismatic_m   = true; 
          } else {
            originStr = `<origin xyz="0.036 0 0" rpy="0 0  \${${phiInfo.main}}"/>`;
            visRpy    = '3.14 0 0';

          }
          isFirstMotorAssembly = false;
          break;


        case 'active':
          // First revolute active has a unique origin; prismatic and subsequent revolute share the other
          if (isFirstRevolute && jtype === 'revolute') {
            originStr = `<origin xyz="0.019500 0 -0.0040" rpy="3.140 0 0"/>`;
            isFirstRevolute = false;
          } else {
            originStr = `<origin xyz="0.019500 0.0040 0" rpy="-1.57 0 0"/>`;
            if (jtype === 'revolute') isFirstRevolute = false;
          }
          visRpy = '0 0 0';
          prevRole = sl.role;
          break;

        case 'passive':
          if (prevRole == "active") {
            originStr = `<origin xyz="0.036 0 0" rpy="\${${phiInfo.main}} 0 0"/>`;
            visRpy    = '0 1.57 0';
          } else {
            originStr = `<origin xyz="0 0 0.0036" rpy="0 0 \${${phiInfo.main}}"/>`;
            visRpy    = '0 0 0';
          }
          break;
        case 'rack':
          postPrismatic = true;
          if (isJFirstPrismatic_r && jtype === 'prismatic' && (isFirstPrismatic_m)){
            originStr = `<origin xyz="0.045 0 0.030" rpy="1.57 0 1.57"/>`;
            visRpy    = '0 0 0';
            isFirstPrismatic_r = false;
            isFirstPrismatic_m = false; 
          } else{
            originStr = `<origin xyz="0.045 -0.030 0.0" rpy="3.14 -1.57 0"/>`;
            visRpy    = '0 0 0';
          }
          prevRole = sl.role;
          break;

        case 'pen_holder':
          originStr = `<origin xyz="0 0.020 0.022" rpy="0 0 \${${phiInfo.penHolder ?? 'phi_1'}}"/>`;
          visRpy    = '0 0 0';
          break;

        default:
          originStr = `<origin xyz="0 0 0" rpy="0 0 \${${phiInfo.main ?? 'phi_1'}}"/>`;
          visRpy    = '0 0 0';
      }

      // ── Axis + limits ──────────────────────────────────────────────────────
      const axisLimit = isDOF ? `
    <axis xyz="${sl.jointAxis || '0 0 1'}"/>
    <limit effort="${f(p.effort ?? 10)}" lower="${f(p.lower ?? -1.25)}" upper="${f(p.upper ?? 1.20)}" velocity="${f(p.velocity ?? 1.0)}"/>` : '';

      // ── Emit ──────────────────────────────────────────────────────────────
      if (intermediate){
          body += intermediateStr;
          body += `
          <joint name="${jointName}" type="${jtype}">
            <parent link="${parentLink}"/>
            <child link="${childName}"/>
            ${originStr}${axisLimit}
          </joint>

          <link name="${childName}">
            <visual>
              <origin xyz="0 0 0" rpy="${visRpy}"/>
              <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
            </visual>
            <collision>
              <origin xyz="0 0 0" rpy="${visRpy}"/>
              <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
            </collision>
          </link>
        `;
    } else {
      body += `
      <joint name="${jointName}" type="${jtype}">
        <parent link="${parentLink}"/>
        <child link="${childName}"/>
        ${originStr}${axisLimit}
      </joint>

      <link name="${childName}">
        <visual>
          <origin xyz="0 0 0" rpy="${visRpy}"/>
          <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
        </visual>
        <collision>
          <origin xyz="0 0 0" rpy="${visRpy}"/>
          <geometry><mesh filename="http://localhost:8000/meshes/${sl.mesh}" scale="1 1 1"/></geometry>
        </collision>
      </link>
    `;
    }

      if (isDOF) dofIdx++; else cfgIdx++;
      parentLink = childName;
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