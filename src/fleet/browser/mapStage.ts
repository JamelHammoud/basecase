import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
import { robotPosition } from './robotPosition';
import type { PreparedGeometry } from '../sites/facilityTypes';
import type { RegistryItem } from './client';
import { arrangeMapLabels } from './mapLabels';
import type { Registration } from '../sites/registration.mjs';

export interface MapLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  anchorX?: number;
  anchorY?: number;
}

export function createMapStage(options: {
  container: HTMLElement;
  geometry: PreparedGeometry | null;
  labels: (labels: MapLabel[]) => void;
}) {
  const { container, geometry } = options;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, geometry ? 1000000 : 20);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const controls = new OrbitControls(camera, renderer.domElement);
  const markers = new Map<string, THREE.Mesh>();
  const shape = new THREE.SphereGeometry(1, 12, 8);
  const materials = {
    reported: new THREE.MeshBasicMaterial({ color: '#0d99ff' }),
    estimated: new THREE.MeshBasicMaterial({ color: '#aaaaaa' }),
    stale: new THREE.MeshBasicMaterial({ color: '#fbbf24' }),
  };
  const point = new THREE.Vector3();
  let robots: RegistryItem[] = [];

  scene.background = new THREE.Color('#1b1b1b');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.append(renderer.domElement);
  camera.up.set(0, 0, 1);

  if (geometry) addFacility(scene, geometry, camera, controls);
  else addGlobe(scene, camera);

  const draw = () => {
    renderer.render(scene, camera);
    container.dataset.ready = 'true';
    options.labels(
      arrangeMapLabels(
        robots.flatMap((robot) => {
          const marker = markers.get(robot.id);

          if (!marker?.visible) return [];

          if (!geometry && marker.position.dot(camera.position) < 0) return [];

          point.copy(marker.position).project(camera);

          if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z > 1) return [];

          return [
            {
              id: robot.id,
              name: robot.name,
              x: ((point.x + 1) * container.clientWidth) / 2,
              y: ((1 - point.y) * container.clientHeight) / 2,
            },
          ];
        }),
        container.clientWidth,
        container.clientHeight,
      ),
    );
  };
  const resize = new ResizeObserver(() => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    draw();
  });

  resize.observe(container);
  controls.addEventListener('change', draw);

  return {
    update(next: RegistryItem[], registration: Registration | null = null) {
      const started = performance.now();

      robots = next;

      const ids = new Set(next.map((robot) => robot.id));

      for (const [id, marker] of markers) {
        if (ids.has(id)) continue;

        scene.remove(marker);
        markers.delete(id);
      }

      for (const robot of next) {
        const location = markerPosition(robot, Boolean(geometry), registration);
        let marker = markers.get(robot.id);

        if (!marker) {
          marker = new THREE.Mesh(shape, materials.reported);
          markers.set(robot.id, marker);
          scene.add(marker);
        }

        marker.visible = Boolean(location);
        marker.material = materials[poseState(robot)];

        if (location) marker.position.copy(location);

        const radius = geometry ? camera.position.distanceTo(controls.target) * 0.005 : 0.012;

        marker.scale.setScalar(radius);
      }

      draw();
      container.dataset.updateMs = String(performance.now() - started);
      container.dataset.markerCount = String(markers.size);
      container.dataset.updateCount = String(Number(container.dataset.updateCount ?? 0) + 1);
    },
    dispose() {
      resize.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points))
          return;

        object.geometry.dispose();

        for (const item of Array.isArray(object.material) ? object.material : [object.material]) item.dispose();
      });
      shape.dispose();
      Object.values(materials).forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function markerPosition(robot: RegistryItem, local: boolean, registration: Registration | null = null) {
  const pose = robot.pose;

  if (robot.kind === 'site' && !pose && robot.registration && !local) {
    const origin = robot.registration.controls[0];

    return new THREE.Vector3()
      .fromArray(origin.local)
      .applyMatrix4(new THREE.Matrix4().fromArray(robot.registration.matrix))
      .multiplyScalar(1 / 6378137);
  }

  if (!pose) return null;

  const location = robotPosition(robot);

  if (!location) return null;

  const ecef = WGS84_ELLIPSOID.getCartographicToPosition(
    (location.latitude * Math.PI) / 180,
    (location.longitude * Math.PI) / 180,
    location.altitudeM,
    new THREE.Vector3(),
  );

  if (!local) return ecef.multiplyScalar(1 / 6378137);

  if (!registration) return null;

  return ecef.applyMatrix4(new THREE.Matrix4().fromArray(registration.matrix).invert());
}

function addGlobe(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.995, 48, 32),
    new THREE.MeshBasicMaterial({ color: '#333333', wireframe: true }),
  );

  scene.add(globe);
  camera.position.set(2.8, 1.8, 1.4);
  camera.lookAt(0, 0, 0);
}

function addFacility(
  scene: THREE.Scene,
  data: PreparedGeometry,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
) {
  const mesh = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(data.positions, 3));

  mesh.setIndex(new THREE.BufferAttribute(data.indices, 1));
  scene.add(new THREE.Mesh(mesh, new THREE.MeshBasicMaterial({ color: '#777777', side: THREE.DoubleSide })));
  scene.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(data.lines, 3)),
      new THREE.LineBasicMaterial({ color: '#bbbbbb' }),
    ),
  );
  scene.add(
    new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(data.points, 3)),
      new THREE.PointsMaterial({ color: '#aaaaaa', size: 0.04 }),
    ),
  );

  const bounds = new THREE.Box3(
    new THREE.Vector3().fromArray(data.bounds.min),
    new THREE.Vector3().fromArray(data.bounds.max),
  );
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);

  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 0.6, -radius * 0.8, radius));
  camera.lookAt(center);
}

function poseState(robot: RegistryItem): 'reported' | 'estimated' | 'stale' {
  if (robot.pose?.observedAt && Date.now() - Date.parse(robot.pose.observedAt) > 60000) return 'stale';

  return robot.pose?.quality ?? 'reported';
}
