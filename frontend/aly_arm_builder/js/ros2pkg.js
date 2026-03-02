/**
 * ros2pkg.js
 *
 * Generates a complete ROS2 robot description package as a zip file.
 *
 * Package structure:
 *   {pkg_name}/
 *     ├── launch/
 *     │     └── display.launch.py
 *     ├── meshes/          (empty, placeholder — user copies their meshes here)
 *     ├── urdf/
 *     │     └── {pkg_name}.urdf.xacro
 *     ├── CMakeLists.txt
 *     ├── package.xml
 *     └── README.md
 *
 * Requires JSZip:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
 */

async function onDownloadROS2Pkg() {
  if (chain.length === 0) { showToast('ADD ELEMENTS TO THE CHAIN FIRST'); return; }

  // Package name derived from robot name input or default
  const pkgName  = (document.getElementById('robot_name_input')?.value.trim() || 'aly_arm') + '_description';
  const robotName = pkgName.replace('_description', '');

  // Generate xacro with package:// paths instead of localhost
  const xacroContent = buildXacroForPkg(pkgName);

  const zip = new JSZip();
  const root = zip.folder(pkgName);

  // ── urdf/ ────────────────────────────────────────────────────────────────
  root.folder('urdf').file(`${robotName}.urdf.xacro`, xacroContent);

  // ── meshes/ (empty placeholder) ──────────────────────────────────────────
  root.folder('meshes').file('.gitkeep', '');

  // ── launch/display.launch.py ─────────────────────────────────────────────
  root.folder('launch').file('display.launch.py', generateLaunchFile(pkgName, robotName));

  // ── CMakeLists.txt ────────────────────────────────────────────────────────
  root.file('CMakeLists.txt', generateCMakeLists(pkgName));

  // ── package.xml ───────────────────────────────────────────────────────────
  root.file('package.xml', generatePackageXml(pkgName));

  // ── README.md ─────────────────────────────────────────────────────────────
  root.file('README.md', generateReadme(pkgName, robotName));

  // ── Download ──────────────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${pkgName}.zip`;
  a.click();
  showToast('ROS2 PACKAGE DOWNLOADING...');
}

// ── Build xacro with package:// mesh paths ────────────────────────────────────
function buildXacroForPkg(pkgName) {
  // Temporarily override mesh URL base
  const original = window._meshBase;
  window._meshBase = `package://${pkgName}/meshes/`;
  const xacro = buildXacro().replace(
    /http:\/\/localhost:8000\/meshes\//g,
    `package://${pkgName}/meshes/`
  );
  window._meshBase = original;
  return xacro;
}

// ── launch/display.launch.py ──────────────────────────────────────────────────
function generateLaunchFile(pkgName, robotName) {
  return `import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
import xacro


def generate_launch_description():
    pkg_share = get_package_share_directory('${pkgName}')
    xacro_file = os.path.join(pkg_share, 'urdf', '${robotName}.urdf.xacro')

    # Process xacro
    robot_description_config = xacro.process_file(xacro_file)
    robot_description = {'robot_description': robot_description_config.toxml()}

    # Robot State Publisher
    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        output='screen',
        parameters=[robot_description]
    )

    # Joint State Publisher GUI
    joint_state_publisher_gui = Node(
        package='joint_state_publisher_gui',
        executable='joint_state_publisher_gui',
        output='screen'
    )

    # RViz
    rviz_config = os.path.join(pkg_share, 'launch', '${robotName}.rviz')
    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        output='screen',
        arguments=['-d', rviz_config] if os.path.exists(rviz_config) else []
    )

    return LaunchDescription([
        robot_state_publisher,
        joint_state_publisher_gui,
        rviz_node,
    ])
`;
}

// ── CMakeLists.txt ────────────────────────────────────────────────────────────
function generateCMakeLists(pkgName) {
  return `cmake_minimum_required(VERSION 3.8)
project(${pkgName})

find_package(ament_cmake REQUIRED)

install(
  DIRECTORY launch meshes urdf
  DESTINATION share/\${PROJECT_NAME}
)

ament_package()
`;
}

// ── package.xml ───────────────────────────────────────────────────────────────
function generatePackageXml(pkgName) {
  return `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${pkgName}</name>
  <version>0.1.0</version>
  <description>ROS2 robot description package for ${pkgName}</description>
  <maintainer email="user@example.com">User</maintainer>
  <license>MIT</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <exec_depend>robot_state_publisher</exec_depend>
  <exec_depend>joint_state_publisher_gui</exec_depend>
  <exec_depend>rviz2</exec_depend>
  <exec_depend>xacro</exec_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
`;
}

// ── README.md ─────────────────────────────────────────────────────────────────
function generateReadme(pkgName, robotName) {
  return `# ${pkgName}

ROS2 robot description package generated by **ALY ARM Builder**.

## Setup

1. Copy your mesh files into the \`meshes/\` directory
2. Copy this package into your ROS2 workspace \`src/\` folder
3. Build:

\`\`\`bash
cd ~/ros2_ws
colcon build --packages-select ${pkgName}
source install/setup.bash
\`\`\`

## Launch

\`\`\`bash
ros2 launch ${pkgName} display.launch.py
\`\`\`

This will open RViz with the robot model and a Joint State Publisher GUI
to interactively move the joints.

## Package Structure

\`\`\`
${pkgName}/
  ├── launch/
  │     └── display.launch.py
  ├── meshes/          ← copy your .dae mesh files here
  ├── urdf/
  │     └── ${robotName}.urdf.xacro
  ├── CMakeLists.txt
  └── package.xml
\`\`\`
`;
}