import { Euler, Matrix4, MathUtils, Quaternion, Vector3 } from 'three';
import { COMPONENT_BY_ID, componentSize } from '../data/components';
import type { ScenePart } from '../types/robotics';
import type { ElectronicsBoard } from './boardTypes';
import { boardProduct } from './boardProducts';
import { partMatrix } from '../utils/kinematicsMotion';

const componentId = (board: ElectronicsBoard, placement: ElectronicsBoard['placements'][number]) =>
  `board:${board.partId}:${placement.id}`;

export function boardComponents(host: ScenePart, board: ElectronicsBoard): ScenePart[] {
  return board.placements.flatMap((placement) => {
    const evidence = boardProduct(placement.productId);
    const catalogId = evidence?.catalogId;
    const product = catalogId && COMPONENT_BY_ID[catalogId];

    if (!product || !evidence?.modelOffset) return [];

    const transform = partMatrix(host)
      .multiply(
        new Matrix4().makeTranslation(
          placement.position[0],
          ((board.side === 'top' ? 1 : -1) * host.dimensions.height) / 2,
          placement.position[1],
        ),
      )
      .multiply(new Matrix4().makeRotationY((-placement.rotation * Math.PI) / 180));

    if (board.side === 'bottom') transform.multiply(new Matrix4().makeRotationX(Math.PI));

    transform.multiply(new Matrix4().makeTranslation(...evidence.modelOffset));

    const position = new Vector3();
    const rotation = new Quaternion();

    transform.decompose(position, rotation, new Vector3());

    const angles = new Euler().setFromQuaternion(rotation, 'XYZ');

    return [
      {
        id: componentId(board, placement),
        name: product.name,
        kind: 'component',
        componentId: product.id,
        category: 'structure',
        role: 'solid',
        position: position.toArray(),
        rotation: [angles.x, angles.y, angles.z].map(MathUtils.radToDeg) as ScenePart['rotation'],
        dimensions: componentSize(product.id),
        color: product.color,
        visible: host.visible,
        locked: true,
        note: '',
      },
    ];
  });
}

export function boardSelection(id: string | null, board: ElectronicsBoard | undefined) {
  return board?.placements.some((placement) => id === componentId(board, placement)) ? board.partId : id;
}

export function boardPoseOwners(board: ElectronicsBoard | undefined) {
  if (!board) return new Map<string, string>();

  return new Map(board.placements.map((placement) => [componentId(board, placement), board.partId]));
}
