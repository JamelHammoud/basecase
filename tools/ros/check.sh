#!/usr/bin/env bash
set -eo pipefail
trap 'chown -R "${HOST_UID:-0}:${HOST_GID:-0}" /ws' EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends liburdfdom-tools libxml2-utils curl >/dev/null
rep=https://raw.githubusercontent.com/ros-infrastructure/rep/11ca24a41f31480dfb9562ba99f2a5b93d3ebda5/xsd
mkdir -p /tmp/xsd
for xsd in package_format3.xsd package_common.xsd; do curl -fsSL -o "/tmp/xsd/$xsd" "$rep/$xsd"; done

source "/opt/ros/$ROS_DISTRO/setup.bash"
cd /ws

for xml in src/*/package.xml; do
  xmllint --noout --schema /tmp/xsd/package_format3.xsd "$xml"
done

colcon build --event-handlers console_cohesion+
source install/setup.bash

for xml in src/*/package.xml; do
  name=$(xmllint --xpath 'string(/package/name)' "$xml")
  share=$(ros2 pkg prefix --share "$name")
  echo "== $name"
  check_urdf "$share/urdf/robot.urdf"
  ros2 launch "$name" display.launch.py --show-args
  timeout 5 ros2 run robot_state_publisher robot_state_publisher \
    --ros-args -p robot_description:="$(cat "$share/urdf/robot.urdf")" >/tmp/rsp.log 2>&1 || true
  grep -q "Robot initialized" /tmp/rsp.log || { cat /tmp/rsp.log; exit 1; }
  if grep -q "WARN\|ERROR" /tmp/rsp.log; then cat /tmp/rsp.log; exit 1; fi
  for file in launch/display.launch.py rviz/display.rviz robot.xml joint_map.json; do
    test -f "$share/$file" || { echo "missing $share/$file"; exit 1; }
  done
  mesh=$(grep -o 'package://[^"]*' "$share/urdf/robot.urdf" | head -n 1)
  test -f "$share/${mesh#package://"$name"/}" || { echo "missing $mesh"; exit 1; }
done
