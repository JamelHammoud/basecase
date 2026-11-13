#!/usr/bin/env bash
set -eo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends liburdfdom-tools libxml2-utils curl >/dev/null
curl -fsSL -o /tmp/package_format3.xsd http://download.ros.org/schema/package_format3.xsd

source "/opt/ros/$ROS_DISTRO/setup.bash"
cd /ws

for xml in src/*/package.xml; do
  xmllint --noout --schema /tmp/package_format3.xsd "$xml"
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
