import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { cubeStl, DESK_ARM, type ArmJoint, type ArmPart } from './robotImport.fixtures';

const XACRO_NS = 'xmlns:xacro="http://www.ros.org/wiki/xacro"';
const PKG = 'desk_arm_description';
const v = (p: number[]) => p.join(' ');

function fusionLink(p: ArmPart): string {
  return `<link name="${p.link}">
  <inertial><origin xyz="${v(p.at)}" rpy="0 0 0"/><mass value="\${${p.massKg * 1000} / 1000}"/></inertial>
  <visual>
    <origin xyz="${v(p.at)}" rpy="0 0 0"/>
    <geometry><mesh filename="package://${PKG}/meshes/${p.link}.stl"/></geometry>
    <material name="silver"/>
  </visual>
</link>
<joint name="${p.link}_fixed" type="fixed"><parent link="${p.body}"/><child link="${p.link}"/></joint>`;
}

function fusionJoint(j: ArmJoint): string {
  return `<joint name="${j.name}" type="revolute">
  <origin xyz="${v(j.origin)}" rpy="0 0 0"/>
  <parent link="${j.parent}"/><child link="${j.child}"/>
  <axis xyz="0 1 0"/>
  <limit lower="\${${j.limits[0]}}" upper="${j.limits[1]}" effort="\${effort}" velocity="\${velocity}"/>
</joint>`;
}

const fusionTrans = (j: ArmJoint) => `<transmission name="${j.name}_tran">
  <type>transmission_interface/SimpleTransmission</type>
  <joint name="${j.name}"><hardwareInterface>hardware_interface/EffortJointInterface</hardwareInterface></joint>
  <actuator name="${j.name}_actr"><mechanicalReduction>1</mechanicalReduction></actuator>
</transmission>`;

export function fusionArmFiles(top = PKG): Record<string, Uint8Array> {
  const robot = `<?xml version="1.0" ?>
<robot name="desk_arm" ${XACRO_NS}>
<xacro:include filename="$(find ${PKG})/urdf/materials.xacro" />
<xacro:include filename="$(find ${PKG})/urdf/desk_arm.trans" />
<xacro:include filename="$(find ${PKG})/urdf/desk_arm.gazebo" />
<xacro:property name="effort" value="2.9"/>
<xacro:property name="velocity" value="\${effort + 1.8}"/>
${DESK_ARM.bodies.map((b) => `<link name="${b}"/>`).join('\n')}
${DESK_ARM.parts.map(fusionLink).join('\n')}
${DESK_ARM.joints.map(fusionJoint).join('\n')}
</robot>`;
  const files: Record<string, string | Uint8Array> = {
    [`${top}/package.xml`]: `<package><name>${PKG}</name></package>`,
    [`${top}/launch/display.launch`]: `<launch><param name="robot_description" command="xacro $(find ${PKG})/urdf/desk_arm.xacro"/></launch>`,
    [`${top}/urdf/desk_arm.xacro`]: robot,
    [`${top}/urdf/materials.xacro`]: `<?xml version="1.0" ?>
<robot name="desk_arm" ${XACRO_NS}>
<material name="silver"><color rgba="0.700 0.700 0.700 1.000"/></material>
</robot>`,
    [`${top}/urdf/desk_arm.trans`]: `<robot name="desk_arm" ${XACRO_NS}>${DESK_ARM.joints.map(fusionTrans).join('\n')}</robot>`,
    [`${top}/urdf/desk_arm.gazebo`]: `<robot name="desk_arm" ${XACRO_NS}>
<xacro:property name="body_color" value="Gazebo/Silver" />
<gazebo><plugin name="control" filename="libgazebo_ros_control.so"/></gazebo>
<gazebo reference="base_plate"><material>\${body_color}</material><selfCollide>true</selfCollide></gazebo>
</robot>`,
  };

  for (const p of DESK_ARM.parts) files[`${top}/meshes/${p.link}.stl`] = cubeStl(p.size);

  return Object.fromEntries(Object.entries(files).map(([k, b]) => [k, typeof b === 'string' ? strToU8(b) : b]));
}

const UR_MACRO = `<?xml version="1.0"?>
<robot ${XACRO_NS}>
  <xacro:property name="d1" value="0.1625"/>
  <xacro:property name="a2" value="-0.425"/>
  <xacro:property name="shoulder_height" value="\${d1}"/>
  <xacro:macro name="ur_link" params="prefix name mesh">
    <link name="\${prefix}\${name}">
      <visual><geometry><mesh filename="package://ur_description/meshes/\${mesh}.stl"/></geometry></visual>
    </link>
  </xacro:macro>
  <xacro:macro name="ur_joint" params="prefix name parent child *origin axis:='0 1 0' lower:=\${-2*pi} upper:=\${2*pi}">
    <joint name="\${prefix}\${name}" type="revolute">
      <parent link="\${prefix}\${parent}"/><child link="\${prefix}\${child}"/>
      <xacro:insert_block name="origin"/>
      <axis xyz="\${axis}"/>
      <limit lower="\${lower}" upper="\${upper}" effort="150" velocity="\${radians(180)}"/>
    </joint>
  </xacro:macro>
  <xacro:macro name="ur_robot" params="prefix parent fake:=false *origin">
    <joint name="\${prefix}base_joint" type="fixed">
      <parent link="\${parent}"/><child link="\${prefix}base_link"/>
      <xacro:insert_block name="origin"/>
    </joint>
    <xacro:ur_link prefix="\${prefix}" name="base_link" mesh="base"/>
    <xacro:ur_link prefix="\${prefix}" name="shoulder_link" mesh="shoulder"/>
    <xacro:ur_link prefix="\${prefix}" name="upper_arm_link" mesh="upperarm"/>
    <xacro:ur_joint prefix="\${prefix}" name="shoulder_pan_joint" parent="base_link" child="shoulder_link" axis="0 0 1">
      <origin xyz="0 0 \${shoulder_height}" rpy="0 0 0"/>
    </xacro:ur_joint>
    <xacro:ur_joint prefix="\${prefix}" name="shoulder_lift_joint" parent="shoulder_link" child="upper_arm_link"
      lower="\${-pi}" upper="\${pi}">
      <origin xyz="0 0 \${abs(a2) / 2}" rpy="0 \${pi / 2} 0"/>
    </xacro:ur_joint>
    <xacro:if value="\${fake}"><link name="\${prefix}fake_sensor"/></xacro:if>
    <xacro:unless value="\${fake}">
      <link name="\${prefix}tool0"/>
      <joint name="\${prefix}tool0_joint" type="fixed">
        <parent link="\${prefix}upper_arm_link"/><child link="\${prefix}tool0"/>
      </joint>
    </xacro:unless>
  </xacro:macro>
</robot>`;

const UR_TOP = `<?xml version="1.0"?>
<robot ${XACRO_NS} name="$(arg name)">
  <xacro:arg name="name" default="ur5e"/>
  <xacro:arg name="prefix" default="left_"/>
  <xacro:arg name="use_fake_hardware" default="false"/>
  <xacro:include filename="$(find ur_description)/urdf/ur_macro.xacro"/>
  <link name="world"/>
  <xacro:ur_robot prefix="$(arg prefix)" parent="world" fake="$(arg use_fake_hardware)">
    <origin xyz="0 0 0" rpy="0 0 0"/>
  </xacro:ur_robot>
</robot>`;

export function urArmFiles(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'ur_description/package.xml': strToU8('<package><name>ur_description</name></package>'),
    'ur_description/urdf/ur.urdf.xacro': strToU8(UR_TOP),
    'ur_description/urdf/ur_macro.xacro': strToU8(UR_MACRO),
  };

  for (const mesh of ['base', 'shoulder', 'upperarm']) files[`ur_description/meshes/${mesh}.stl`] = cubeStl(0.05);

  return files;
}
