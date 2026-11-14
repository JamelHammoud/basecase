import { Matrix3, Matrix4, Vector3 } from 'three';
import type { Port, PortVec } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { sheetOf } from '../sheet/materials';

function transformedPort(port: Port, matrix: Matrix4): Port {
  const linear = new Matrix3().setFromMatrix4(matrix);
  const axis = new Vector3(...port.axis).normalize();
  const depthScale = axis.clone().applyMatrix3(linear).length();
  const axisTransform = port.kind === 'face' ? new Matrix3().getNormalMatrix(matrix) : linear;

  return {
    ...port,
    position: new Vector3(...port.position).applyMatrix4(matrix).toArray() as PortVec,
    axis: axis.applyMatrix3(axisTransform).normalize().toArray() as PortVec,
    ...(port.ref ? { ref: new Vector3(...port.ref).transformDirection(matrix).toArray() as PortVec } : {}),
    ...(port.depthMm !== undefined ? { depthMm: port.depthMm * depthScale } : {}),
  };
}

export function sheetPorts(part: ScenePart, ports: Port[]): Port[] {
  if (!part.cad || (!sheetOf(part) && !part.sheetTransform)) return ports;

  const { dimensions, cad } = part;
  const scale = new Matrix4().makeScale(
    dimensions.width / cad.baseSize[0],
    dimensions.height / cad.baseSize[1],
    dimensions.depth / cad.baseSize[2],
  );
  const matrix = part.sheetTransform ? new Matrix4().fromArray(part.sheetTransform).multiply(scale) : scale;

  return ports.map((port) => transformedPort(port, matrix));
}
