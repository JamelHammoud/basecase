import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createInfiniteGrid } from '../three/infiniteGrid';
import { Coplanar, findInterferences, Interference } from '../three/interference';
import { MeshMeasure, measureTriangles, worldTriangles } from '../three/meshMeasure';
import { useComponentMeshVersion } from '../three/componentMeshes';
import {
  buildPartGroup,
  convertScenePartToSculptMesh,
} from '../three/buildPartMesh';
import {
  applySculptStrokeOnGeometry,
  buildBufferGeometryFromSculptData,
  extractSculptDataFromGeometry,
} from '../three/sculptAndBooleanEngine';
import {
  CameraPreset,
  ScenePart,
  SculptMeshData,
  SculptSettings,
  TrackpadGestureMode,
  TransformMode,
} from '../types/robotics';

/** Camera distance limits (mm). Far enough to frame a full-size humanoid. */
const MIN_DIST = 25;
const MAX_DIST = 12000;
const FAR_PLANE = 80000;

export interface Viewport3DHandle {
  captureScreenshot: () => string;
  setCameraPreset: (preset: CameraPreset) => void;
  focusSelected: () => void;
  zoomBy: (factor: number) => void;
  /** What's under a screen point: a part hit or the ground plane */
  pickAt: (
    clientX: number,
    clientY: number
  ) => { partId: string | null; point: [number, number, number] } | null;
  /** Renders framed views of the model (reference images and gizmos hidden) for the agent */
  /** Views: iso, front, side, top, back, or `az:<deg>,el:<deg>` (agent frame: az 0 = front, 90 = the left side) */
  captureViews: (views: string[], onlyIds?: string[], opts?: { silhouette?: boolean }) => Array<{ view: string; dataUrl: string }>;
  /** Visible solid parts that pass through each other (mesh-level), deepest first, and flush same-facing surfaces; onlyIds = pairs involving these */
  interference: (onlyIds?: string[]) => { interferences: Interference[]; coplanar: Coplanar[] };
  /** Exact world-space volume, area and bounds of each part's mesh (scene frame, mm); all parts when ids is omitted */
  measureParts: (ids?: string[]) => Record<string, MeshMeasure>;
  /** Triangles of one part in its own frame (the part's rotation and position removed, scale kept), mm */
  partTriangles: (id: string) => Float32Array | null;
  /**
   * A servo's output (world): the center of the topmost cap of its mesh (spline or horn, catalog
   * servos are oriented output up) and its local +Y axis
   */
  servoOutput: (id: string) => { point: [number, number, number]; axis: [number, number, number] } | null;
  /** Turns `moving` parts about an axis to each angle and reports mesh clashes with the parts that stay put */
  sweepClashes: (
    moving: string[],
    origin: [number, number, number],
    axis: [number, number, number],
    anglesDeg: number[]
  ) => Array<{ a: string; b: string; depthMm: number; angle: number }>;
  /** Smoothly frames every visible part (keeps the current viewing direction) */
  frameAll: () => void;
  /** Pops the given parts in with a short scale animation */
  animateSpawn: (ids: string[]) => void;
  /** Shows parts moved by their joints (rest → posed motion per part); null returns the modeled pose */
  setPose: (deltas: Map<string, THREE.Matrix4> | null) => void;
  /** Bounds of parts in the modeled pose (scene mm) */
  restBounds: (ids: string[]) => { min: [number, number, number]; max: [number, number, number] } | null;
  /** Parts that pass through each other in the pose on the canvas */
  posedInterference: (onlyIds?: string[]) => Interference[];
  /** Lowest point of the posed parts (scene y, mm) */
  posedFloor: () => number | null;
  /** Projects world points (mm) to pixel positions inside the viewport */
  projectPoints: (
    points: Array<[number, number, number]>
  ) => Array<{ x: number; y: number; visible: boolean }>;
}

interface Viewport3DProps {
  parts: ScenePart[];
  /** Ordered selection; the first id is the primary (e.g. boolean base) */
  selectedPartIds: string[];
  transformMode: TransformMode;
  sculptSettings: SculptSettings;
  snapStepMm: number;
  snapAngleDeg: number;
  trackpadMode: TrackpadGestureMode;
  showGrid: boolean;
  blueprintDataUrl?: string | null;
  /** `additive` is true for Shift/⌘-click (toggle in selection); `drill` for a double-click into a group */
  onSelectPart: (id: string | null, additive?: boolean, drill?: boolean) => void;
  /** Batch transform commit when several parts move together */
  /** Shift-drag marquee: ids of unlocked parts whose screen bounds touch the box */
  onMarqueeSelect?: (ids: string[]) => void;
  onUpdatePartsTransform?: (
    updates: Array<{
      id: string;
      position: [number, number, number];
      rotation: [number, number, number];
      dimensions?: ScenePart['dimensions'];
    }>
  ) => void;
  onUpdatePartTransform: (
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
    dimensions?: ScenePart['dimensions']
  ) => void;
  onCommitSculptMesh: (id: string, sculptMesh: SculptMeshData) => void;
  /** When true, clicks drop annotation pins instead of selecting */
  annotateMode?: boolean;
  onPlaceAnnotation?: (point: [number, number, number], partId: string | null) => void;
  /** A background scene tab: skip the render loop (captures still render on demand) */
  paused?: boolean;
  /** Rest → posed motion per part (posing); edits made while posed are mapped back to the modeled pose */
  pose?: Map<string, THREE.Matrix4> | null;
  /** Pose tool: the joint to turn (posed pivot and axis) */
  poseJoint?: { id: string; type: 'revolute' | 'prismatic'; origin: THREE.Vector3; axis: THREE.Vector3 } | null;
  /** Pose tool drag: change of the joint's value since the drag began (degrees or mm) */
  onPoseJoint?: (id: string, delta: number, phase: 'start' | 'move' | 'end') => void;
}


/** Hardware and real components are exact parts: the scale gizmo never resizes them */
const hasFixedSize = (p: ScenePart) => p.kind === 'hardware' || p.kind === 'component' || p.kind === 'mesh';

export const Viewport3D = React.forwardRef<Viewport3DHandle, Viewport3DProps>(
  (
    {
      parts,
      selectedPartIds,
      transformMode,
      sculptSettings,
      snapStepMm,
      snapAngleDeg,
      trackpadMode,
      showGrid,
      blueprintDataUrl,
      onSelectPart,
      onUpdatePartTransform,
      onCommitSculptMesh,
      onUpdatePartsTransform,
      onMarqueeSelect,
      annotateMode = false,
      onPlaceAnnotation,
      paused = false,
      pose = null,
      poseJoint = null,
      onPoseJoint,
    },
    ref
  ) => {
    const componentMeshVersion = useComponentMeshVersion();
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const annotateModeRef = useRef(annotateMode);
    const onPlaceAnnotationRef = useRef(onPlaceAnnotation);
    useEffect(() => {
      annotateModeRef.current = annotateMode;
      onPlaceAnnotationRef.current = onPlaceAnnotation;
    }, [annotateMode, onPlaceAnnotation]);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const orbitRef = useRef<OrbitControls | null>(null);
    const transformRef = useRef<TransformControls | null>(null);
    const partsRootRef = useRef<THREE.Group | null>(null);
    const gridGroupRef = useRef<THREE.Group | null>(null);
    const blueprintMeshRef = useRef<THREE.Mesh | null>(null);
    const brushCursorRef = useRef<THREE.Group | null>(null);
    const partMapRef = useRef<Map<string, THREE.Group>>(new Map());

    const [isSpacePressed, setIsSpacePressed] = useState(false);
    // Holding Shift while using the gizmo turns snapping off (smooth motion)
    const shiftHeldRef = useRef(false);
    const snapRef = useRef({ step: snapStepMm, angle: snapAngleDeg });
    snapRef.current = { step: snapStepMm, angle: snapAngleDeg };
    const [snapBypassed, setSnapBypassed] = useState(false);

    /** Re-applies gizmo snapping; Shift held = free. Reads refs only, so it's safe from any closure. */
    const applySnaps = () => {
      const tc = transformRef.current;
      if (!tc) return;
      const free = shiftHeldRef.current;
      const { step, angle } = snapRef.current;
      // Posing turns in 1° (or 1 mm) steps
      const posing = transformModeRef.current === 'pose';
      tc.setTranslationSnap(!free && step > 0 ? (posing ? 1 : step) : null);
      tc.setRotationSnap(!free && angle > 0 ? THREE.MathUtils.degToRad(posing ? 1 : angle) : null);
      tc.setScaleSnap(free ? null : 0.05);
      setSnapBypassed(free && isDraggingGizmoRef.current);
    };
    const isDraggingGizmoRef = useRef(false);
    const isSculptingStrokeRef = useRef(false);
    const activeSculptMeshRef = useRef<{
      partId: string;
      mesh: THREE.Mesh;
      partWidth: number;
      partHeight: number;
      partDepth: number;
      lastLocalHit: THREE.Vector3;
    } | null>(null);

    const partsDataRef = useRef<ScenePart[]>(parts);
    partsDataRef.current = parts;
    const selectedPartId = selectedPartIds[0] ?? null;
    const selectedIdRef = useRef<string | null>(selectedPartId);
    selectedIdRef.current = selectedPartId;
    const selectedIdsRef = useRef<string[]>(selectedPartIds);
    selectedIdsRef.current = selectedPartIds;
    // Latest callbacks (the scene setup effect runs once)
    const callbacksRef = useRef({ onSelectPart, onUpdatePartTransform, onUpdatePartsTransform, onCommitSculptMesh, onMarqueeSelect, onPoseJoint });
    callbacksRef.current = { onSelectPart, onUpdatePartTransform, onUpdatePartsTransform, onCommitSculptMesh, onMarqueeSelect, onPoseJoint };
    // Posing: each part's rest → posed motion, applied on top of its modeled placement
    const poseRef = useRef<Map<string, THREE.Matrix4>>(new Map());
    const poseJointRef = useRef(poseJoint);
    poseJointRef.current = poseJoint;
    const jointPivotRef = useRef<THREE.Object3D | null>(null);
    const poseDragRef = useRef<{ quaternion: THREE.Quaternion; position: THREE.Vector3 } | null>(null);

    /** Places every part group at its modeled pose moved by its joints */
    const applyPose = () => {
      const m = new THREE.Matrix4();
      for (const [id, group] of partMapRef.current) {
        const rp = group.userData.restPosition as THREE.Vector3 | undefined;
        const rq = group.userData.restQuaternion as THREE.Quaternion | undefined;
        if (!rp || !rq) continue;
        if (transformRef.current?.dragging && transformRef.current.object === group) continue;
        const delta = poseRef.current.get(id);
        if (!delta) {
          group.position.copy(rp);
          group.quaternion.copy(rq);
        } else {
          m.compose(rp, rq, new THREE.Vector3(1, 1, 1)).premultiply(delta);
          const sc = new THREE.Vector3();
          m.decompose(group.position, group.quaternion, sc);
        }
        group.updateMatrixWorld(true);
      }
    };
    /** Runs fn with every part in the modeled pose */
    const withRest = <T,>(fn: () => T): T => {
      if (!poseRef.current.size) return fn();
      const saved = poseRef.current;
      poseRef.current = new Map();
      applyPose();
      try {
        return fn();
      } finally {
        poseRef.current = saved;
        applyPose();
      }
    };
    /** A posed placement mapped back to the modeled pose */
    const toRest = (id: string, position: THREE.Vector3, quaternion: THREE.Quaternion) => {
      const delta = poseRef.current.get(id);
      if (!delta) return { position: position.clone(), quaternion: quaternion.clone() };
      const m = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)).premultiply(delta.clone().invert());
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.decompose(p, q, sc);
      return { position: p, quaternion: q };
    };
    const marqueeElRef = useRef<HTMLDivElement | null>(null);
    // Multi-selection pivot the gizmo attaches to
    const pivotRef = useRef<THREE.Object3D | null>(null);
    // id → start time for agent "pop in" animations
    const spawnAnimRef = useRef(new Map<string, number>());
    const frameAnimRef = useRef<{
      start: number;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
    } | null>(null);
    const pivotStartRef = useRef<{
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      items: Array<{ id: string; obj: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }>;
    } | null>(null);
    const transformModeRef = useRef<TransformMode>(transformMode);
    transformModeRef.current = transformMode;
    const sculptSettingsRef = useRef<SculptSettings>(sculptSettings);
    sculptSettingsRef.current = sculptSettings;
    const trackpadModeRef = useRef<TrackpadGestureMode>(trackpadMode);
    trackpadModeRef.current = trackpadMode;

    useImperativeHandle(ref, () => ({
      captureScreenshot: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const tc = transformRef.current;
        const cursor = brushCursorRef.current;
        if (!renderer || !scene || !camera) return '';
        const helper = tc?.getHelper();
        const prevVisible = helper ? helper.visible : true;
        const prevCursor = cursor ? cursor.visible : false;
        if (helper) helper.visible = false;
        if (cursor) cursor.visible = false;
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        if (helper) helper.visible = prevVisible;
        if (cursor) cursor.visible = prevCursor;
        renderer.render(scene, camera);
        return dataUrl;
      },
      setCameraPreset: (preset: CameraPreset) => {
        const cam = cameraRef.current;
        const orbit = orbitRef.current;
        if (!cam || !orbit) return;
        const target = orbit.target.clone();
        const dist = 240;
        switch (preset) {
          case 'top':
            cam.position.set(target.x, target.y + dist, target.z + 0.01);
            break;
          case 'front':
            cam.position.set(target.x, target.y + 35, target.z + dist);
            break;
          case 'right':
            cam.position.set(target.x + dist, target.y + 35, target.z);
            break;
          case 'isometric':
          case 'perspective':
          default:
            cam.position.set(target.x + 165, target.y + 135, target.z + 175);
            break;
        }
        cam.lookAt(target);
        orbit.update();
      },
      focusSelected: () => {
        const cam = cameraRef.current;
        const orbit = orbitRef.current;
        if (!cam || !orbit) return;
        const selId = selectedIdRef.current;
        if (selId) {
          const obj = partMapRef.current.get(selId);
          if (obj) {
            orbit.target.copy(obj.position);
            orbit.update();
            return;
          }
        }
        orbit.target.set(0, 15, 0);
        cam.position.set(165, 135, 175);
        orbit.update();
      },
      captureViews: (views, onlyIds, opts) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const root = partsRootRef.current;
        const mainCam = cameraRef.current;
        if (!renderer || !scene || !root || !mainCam) return [];
        const tc = transformRef.current;
        const helper = tc?.getHelper();
        const cursor = brushCursorRef.current;
        const hidden: THREE.Object3D[] = [];
        const hide = (o?: THREE.Object3D | null) => {
          if (o && o.visible) {
            o.visible = false;
            hidden.push(o);
          }
        };
        hide(helper);
        hide(cursor);
        // Reference photos would confuse the comparison
        for (const child of root.children) {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (part?.kind === 'image_plane') hide(child);
          else if (onlyIds?.length && !onlyIds.includes(child.userData.partId)) hide(child);
        }
        const box = new THREE.Box3();
        root.children.forEach((c) => c.visible && box.expandByObject(c));
        if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 50, 50));
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 20);
        const cam = new THREE.PerspectiveCamera(24, mainCam.aspect, 1, 10000);
        const dist = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.08;
        const dirs: Record<string, THREE.Vector3> = {
          iso: new THREE.Vector3(0.9, 0.7, 1.2),
          front: new THREE.Vector3(0, 0.08, 1),
          back: new THREE.Vector3(0, 0.08, -1),
          side: new THREE.Vector3(1, 0.08, 0),
          top: new THREE.Vector3(0, 1, 0.001),
        };
        const out: Array<{ view: string; dataUrl: string }> = [];
        // Review lighting: a headlight and a lifted background so dark parts show their detail
        const headlight = new THREE.DirectionalLight(0xffffff, 2.4);
        scene.add(headlight, headlight.target);
        const prevBackground = scene.background;
        const prevExposure = renderer.toneMappingExposure;
        scene.background = new THREE.Color('#2c2c2c');
        renderer.toneMappingExposure = prevExposure * 1.35;
        // Silhouette mode: flat white parts on black, nothing else in the frame (for measuring)
        const silhouetteMat = opts?.silhouette ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : null;
        const hiddenForSilhouette: THREE.Object3D[] = [];
        if (silhouetteMat) {
          scene.background = new THREE.Color('#000000');
          scene.overrideMaterial = silhouetteMat;
          for (const child of scene.children) {
            if (child !== root && child.visible) {
              child.visible = false;
              hiddenForSilhouette.push(child);
            }
          }
          root.traverse((o) => {
            if ((o as THREE.LineSegments).isLineSegments && o.visible) {
              o.visible = false;
              hiddenForSilhouette.push(o);
            }
          });
        }
        for (const view of views) {
          const custom = /^az:(-?[\d.]+),el:(-?[\d.]+)$/.exec(view);
          let dir: THREE.Vector3;
          if (custom) {
            // Agent frame (front −Y, left +X, Z up) → scene (x, z, −y)
            const az = THREE.MathUtils.degToRad(Number(custom[1]));
            const el = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, Number(custom[2]))));
            dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          } else dir = (dirs[view] ?? dirs.iso).clone().normalize();
          cam.position.copy(center).addScaledVector(dir, dist);
          cam.near = dist / 100;
          cam.far = dist * 10;
          cam.lookAt(center);
          cam.updateProjectionMatrix();
          headlight.position.copy(cam.position).add(new THREE.Vector3(0, radius * 0.6, 0));
          headlight.target.position.copy(center);
          renderer.render(scene, cam);
          out.push({ view, dataUrl: renderer.domElement.toDataURL('image/png') });
        }
        scene.remove(headlight, headlight.target);
        headlight.dispose();
        if (silhouetteMat) {
          scene.overrideMaterial = null;
          silhouetteMat.dispose();
          hiddenForSilhouette.forEach((o) => (o.visible = true));
        }
        scene.background = prevBackground;
        renderer.toneMappingExposure = prevExposure;
        hidden.forEach((o) => (o.visible = true));
        renderer.render(scene, mainCam);
        return out;
      },
      interference: (onlyIds) => {
        const root = partsRootRef.current;
        if (!root) return { interferences: [], coplanar: [] };
        const objects = root.children.flatMap((child) => {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (!part || !part.visible || part.role !== 'solid' || part.kind === 'image_plane') return [];
          return [{ id: part.id, object: child }];
        });
        return withRest(() => findInterferences(objects, 0.3, 400, onlyIds));
      },
      posedInterference: (onlyIds) => {
        const root = partsRootRef.current;
        if (!root) return [];
        const objects = root.children.flatMap((child) => {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (!part || !part.visible || part.role !== 'solid' || part.kind === 'image_plane') return [];
          return [{ id: part.id, object: child }];
        });
        return findInterferences(objects, 0.3, 400, onlyIds).interferences;
      },
      posedFloor: () => {
        const root = partsRootRef.current;
        if (!root) return null;
        const box = new THREE.Box3();
        for (const child of root.children) {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (part && part.role === 'solid' && part.kind !== 'image_plane') box.expandByObject(child);
        }
        return box.isEmpty() ? null : box.min.y;
      },
      setPose: (deltas) => {
        poseRef.current = deltas ?? new Map();
        applyPose();
      },
      restBounds: (ids) =>
        withRest(() => {
          const box = new THREE.Box3();
          for (const id of ids) {
            const obj = partMapRef.current.get(id);
            if (obj) box.expandByObject(obj);
          }
          if (box.isEmpty()) return null;
          return { min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] };
        }),
      measureParts: (ids) => withRest(() => {
        const root = partsRootRef.current;
        const out: Record<string, MeshMeasure> = {};
        if (!root) return out;
        const want = ids ? new Set(ids) : null;
        for (const child of root.children) {
          const id = child.userData.partId as string | undefined;
          if (!id || (want && !want.has(id))) continue;
          const tris = worldTriangles(child);
          if (tris.length) out[id] = measureTriangles(tris);
        }
        return out;
      }),
      partTriangles: (id) => {
        const child = partsRootRef.current?.children.find((c) => c.userData.partId === id);
        if (!child) return null;
        const tris = worldTriangles(child);
        // Undo the part's placement (keep its size), so axis-aligned build directions are the model's own axes
        const t = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        child.matrixWorld.decompose(t, q, sc);
        const inv = new THREE.Matrix4().compose(t, q, new THREE.Vector3(1, 1, 1)).invert();
        const v = new THREE.Vector3();
        for (let i = 0; i < tris.length; i += 3) {
          v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(inv);
          tris[i] = v.x;
          tris[i + 1] = v.y;
          tris[i + 2] = v.z;
        }
        return tris;
      },
      servoOutput: (id) => withRest(() => {
        const child = partsRootRef.current?.children.find((c) => c.userData.partId === id);
        if (!child) return null;
        child.updateWorldMatrix(true, true);
        const t = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        child.matrixWorld.decompose(t, q, sc);
        const toLocal = new THREE.Matrix4().compose(t, q, new THREE.Vector3(1, 1, 1)).invert();
        const tris = worldTriangles(child);
        if (!tris.length) return null;
        const v = new THREE.Vector3();
        let top = -Infinity;
        const local: number[] = [];
        for (let i = 0; i < tris.length; i += 3) {
          v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(toLocal);
          local.push(v.x, v.y, v.z);
          if (v.y > top) top = v.y;
        }
        let n = 0;
        const c = new THREE.Vector3();
        for (let i = 0; i < local.length; i += 3) {
          if (local[i + 1] < top - 0.6) continue;
          c.x += local[i];
          c.z += local[i + 2];
          n++;
        }
        c.set(c.x / n, top, c.z / n).applyQuaternion(q).add(t);
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
        return { point: c.toArray() as [number, number, number], axis: axis.toArray() as [number, number, number] };
      }),
      sweepClashes: (moving, origin, axis, anglesDeg) => withRest(() => {
        const root = partsRootRef.current;
        if (!root) return [];
        const movingSet = new Set(moving);
        const objects = root.children.flatMap((child) => {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (!part || part.role !== 'solid' || part.kind === 'image_plane') return [];
          return [{ id: part.id, object: child }];
        });
        const movers = objects.filter((o) => movingSet.has(o.id)).map((o) => o.object);
        const saved = movers.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone() }));
        const o3 = new THREE.Vector3(...origin);
        const ax = new THREE.Vector3(...axis).normalize();
        const out: Array<{ a: string; b: string; depthMm: number; angle: number }> = [];
        // Pairs that already clash in the modeled pose are check_scene's to report, not the sweep's
        const baseline = new Set(findInterferences(objects, 0.3, 300, moving).interferences.map((f) => [f.a, f.b].sort().join('|')));
        try {
          for (const angle of anglesDeg) {
            const rot = new THREE.Quaternion().setFromAxisAngle(ax, THREE.MathUtils.degToRad(angle));
            for (const s of saved) {
              s.o.position.copy(s.p).sub(o3).applyQuaternion(rot).add(o3);
              s.o.quaternion.copy(rot).multiply(s.q);
              s.o.updateMatrixWorld(true);
            }
            // The floor counts as an obstacle too
            let low: { id: string; y: number } | null = null;
            for (const s of saved) {
              const y = new THREE.Box3().setFromObject(s.o).min.y;
              if (!low || y < low.y) low = { id: s.o.userData.partId as string, y };
            }
            if (low && low.y < -1) out.push({ a: low.id, b: 'floor', depthMm: Math.round(-low.y * 10) / 10, angle });
            const found = findInterferences(objects, 0.3, 300, moving).interferences;
            for (const f of found) {
              if (movingSet.has(f.a) === movingSet.has(f.b) || baseline.has([f.a, f.b].sort().join('|'))) continue;
              out.push({ a: movingSet.has(f.a) ? f.a : f.b, b: movingSet.has(f.a) ? f.b : f.a, depthMm: f.depthMm, angle });
            }
          }
        } finally {
          for (const s of saved) {
            s.o.position.copy(s.p);
            s.o.quaternion.copy(s.q);
            s.o.updateMatrixWorld(true);
          }
        }
        return out;
      }),
      frameAll: () => {
        const cam = cameraRef.current;
        const orbit = orbitRef.current;
        const root = partsRootRef.current;
        if (!cam || !orbit || !root) return;
        const box = new THREE.Box3();
        for (const child of root.children) {
          const part = partsDataRef.current.find((p) => p.id === child.userData.partId);
          if (part?.kind !== 'image_plane') box.expandByObject(child);
        }
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 30);
        const dir = cam.position.clone().sub(orbit.target).normalize();
        const dist = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.15;
        frameAnimRef.current = {
          start: performance.now(),
          fromTarget: orbit.target.clone(),
          toTarget: center,
          fromPos: cam.position.clone(),
          toPos: center.clone().addScaledVector(dir, Math.min(Math.max(dist, 60), MAX_DIST)),
        };
      },
      animateSpawn: (ids) => {
        const now = performance.now();
        ids.forEach((id) => spawnAnimRef.current.set(id, now));
      },
      pickAt: (clientX, clientY) => {
        const cam = cameraRef.current;
        const el = mountRef.current;
        const root = partsRootRef.current;
        if (!cam || !el || !root) return null;
        const rect = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, cam);
        const meshes: THREE.Object3D[] = [];
        root.traverse((c) => {
          if (c instanceof THREE.Mesh) meshes.push(c);
        });
        const hit = ray.intersectObjects(meshes, false)[0];
        if (hit) {
          return {
            partId: (hit.object.userData.partId as string | undefined) ?? null,
            point: [hit.point.x, hit.point.y, hit.point.z],
          };
        }
        const p = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) {
          return { partId: null, point: [p.x, 0, p.z] };
        }
        return null;
      },
      projectPoints: (points) => {
        const cam = cameraRef.current;
        const el = mountRef.current;
        if (!cam || !el) return points.map(() => ({ x: 0, y: 0, visible: false }));
        const w = el.clientWidth;
        const h = el.clientHeight;
        const v = new THREE.Vector3();
        return points.map(([x, y, z]) => {
          v.set(x, y, z).project(cam);
          return {
            x: (v.x * 0.5 + 0.5) * w,
            y: (-v.y * 0.5 + 0.5) * h,
            visible: v.z > -1 && v.z < 1,
          };
        });
      },
      zoomBy: (factor: number) => {
        const cam = cameraRef.current;
        const orbit = orbitRef.current;
        if (!cam || !orbit) return;
        const offset = cam.position.clone().sub(orbit.target);
        offset.multiplyScalar(factor);
        const len = offset.length();
        if (len >= MIN_DIST && len <= MAX_DIST) {
          cam.position.copy(orbit.target).add(offset);
          orbit.update();
        }
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#1b1b1b');
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        42,
        container.clientWidth / Math.max(1, container.clientHeight),
        1,
        FAR_PLANE
      );
      camera.position.set(170, 135, 180);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Studio Lighting
      // A soft studio room to reflect, like the Parts thumbnails: dark plastic shows its
      // shape through highlights, and metal horns and screws stop rendering black
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      scene.environment = envMap;
      scene.environmentIntensity = 0.5;

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x18181b, 1.0);
      hemiLight.position.set(0, 300, 0);
      scene.add(hemiLight);

      // A soft fill from just above the camera, so faces turned away from the key light
      // (the far side of a servo) never go flat black
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
      scene.add(fillLight, fillLight.target);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.35);
      dirLight.position.set(140, 260, 160);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 20;
      dirLight.shadow.camera.far = 700;
      const d = 180;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.bias = -0.0005;
      scene.add(dirLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
      rimLight.position.set(-160, 120, -140);
      scene.add(rimLight);

      // Workbench Grid Group
      const gridGroup = new THREE.Group();
      gridGroupRef.current = gridGroup;

      const shadowPlaneGeo = new THREE.PlaneGeometry(60000, 60000);
      shadowPlaneGeo.rotateX(-Math.PI / 2);
      const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.32 });
      const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
      shadowPlane.receiveShadow = true;
      shadowPlane.position.y = -0.05;
      gridGroup.add(shadowPlane);

      const infiniteGrid = createInfiniteGrid();
      gridGroup.add(infiniteGrid.mesh);

      scene.add(gridGroup);

      // Parts container
      const partsRoot = new THREE.Group();
      partsRootRef.current = partsRoot;
      scene.add(partsRoot);

      // 3D Sculpt Brush Ring Cursor (visible when hovering over a part in Sculpt Mode)
      const brushCursor = new THREE.Group();
      brushCursor.visible = false;
      const ringGeo = new THREE.RingGeometry(0.92, 1.0, 40);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x0d99ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.raycast = () => {};
      brushCursor.add(ringMesh);

      const innerDotGeo = new THREE.CircleGeometry(0.08, 20);
      const innerDot = new THREE.Mesh(innerDotGeo, ringMat);
      innerDot.raycast = () => {};
      brushCursor.add(innerDot);

      const normalStemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0.55),
      ]);
      const normalStem = new THREE.Line(
        normalStemGeo,
        new THREE.LineBasicMaterial({ color: 0x0d99ff, depthTest: false })
      );
      normalStem.raycast = () => {};
      brushCursor.add(normalStem);

      scene.add(brushCursor);
      brushCursorRef.current = brushCursor;

      // OrbitControls
      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.target.set(0, 18, 0);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.12;
      orbit.enableZoom = false;
      orbit.minDistance = MIN_DIST;
      orbit.maxDistance = MAX_DIST;
      orbit.maxPolarAngle = Math.PI * 0.495;
      orbit.update();
      orbitRef.current = orbit;

      // TransformControls
      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setSize(0.95);
      transformRef.current = transformControls;
      scene.add(transformControls.getHelper());

      const pivot = new THREE.Object3D();
      pivot.name = 'selection-pivot';
      scene.add(pivot);
      pivotRef.current = pivot;

      // Pose tool: a single ring (or arrow) on the joint's axis
      const jointPivot = new THREE.Object3D();
      jointPivot.name = 'joint-pivot';
      scene.add(jointPivot);
      jointPivotRef.current = jointPivot;
      const poseDelta = () => {
        const start = poseDragRef.current;
        const j = poseJointRef.current;
        if (!start || !j) return 0;
        if (j.type === 'prismatic') return jointPivot.position.clone().sub(start.position).dot(j.axis.clone().normalize());
        const rel = start.quaternion.clone().invert().multiply(jointPivot.quaternion);
        return THREE.MathUtils.radToDeg(2 * Math.atan2(rel.x, rel.w));
      };
      transformControls.addEventListener('mouseDown', () => {
        const j = poseJointRef.current;
        if (transformControls.object !== jointPivot || !j) return;
        poseDragRef.current = { quaternion: jointPivot.quaternion.clone(), position: jointPivot.position.clone() };
        callbacksRef.current.onPoseJoint?.(j.id, 0, 'start');
      });
      transformControls.addEventListener('objectChange', () => {
        const j = poseJointRef.current;
        if (transformControls.object !== jointPivot || !j || !poseDragRef.current) return;
        callbacksRef.current.onPoseJoint?.(j.id, poseDelta(), 'move');
      });
      transformControls.addEventListener('mouseUp', () => {
        const j = poseJointRef.current;
        if (transformControls.object !== jointPivot || !j || !poseDragRef.current) return;
        callbacksRef.current.onPoseJoint?.(j.id, poseDelta(), 'end');
        poseDragRef.current = null;
      });

      // Multi-selection: remember where everything started, then move parts with the pivot
      transformControls.addEventListener('mouseDown', () => {
        if (transformControls.object !== pivot) return;
        pivotStartRef.current = {
          position: pivot.position.clone(),
          quaternion: pivot.quaternion.clone(),
          scale: pivot.scale.clone(),
          items: selectedIdsRef.current.flatMap((id) => {
            const obj = partMapRef.current.get(id);
            const part = partsDataRef.current.find((p) => p.id === id);
            if (!obj || !part || part.locked) return [];
            return [{ id, obj, position: obj.position.clone(), quaternion: obj.quaternion.clone() }];
          }),
        };
      });

      transformControls.addEventListener('objectChange', () => {
        const start = pivotStartRef.current;
        if (transformControls.object !== pivot || !start) return;
        const dq = pivot.quaternion.clone().multiply(start.quaternion.clone().invert());
        const ds = new THREE.Vector3(
          pivot.scale.x / start.scale.x,
          pivot.scale.y / start.scale.y,
          pivot.scale.z / start.scale.z
        );
        for (const it of start.items) {
          const offset = it.position.clone().sub(start.position);
          offset.multiply(ds).applyQuaternion(dq);
          it.obj.position.copy(pivot.position).add(offset);
          it.obj.quaternion.copy(dq).multiply(it.quaternion);
          it.obj.scale.copy(ds);
        }
      });

      transformControls.addEventListener('mouseUp', () => {
        const start = pivotStartRef.current;
        if (transformControls.object !== pivot || !start) return;
        pivotStartRef.current = null;
        const free = shiftHeldRef.current;
        const r = (v: number) => (free ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);
        const deg = (rad: number) => {
          const d = THREE.MathUtils.radToDeg(rad);
          return free ? Math.round(d * 10) / 10 : Math.round(d);
        };
        const dim = (v: number) => Math.max(free ? 0.5 : 2, free ? Math.round(v * 10) / 10 : Math.round(v));
        const updates = start.items.map((it) => {
          const part = partsDataRef.current.find((p) => p.id === it.id)!;
          const rest = toRest(it.id, it.obj.position, it.obj.quaternion);
          const e = new THREE.Euler().setFromQuaternion(rest.quaternion, 'XYZ');
          const scaled = transformControls.getMode() === 'scale';
          return {
            id: it.id,
            position: [r(rest.position.x), r(rest.position.y), r(rest.position.z)] as [number, number, number],
            rotation: [
              deg(e.x),
              deg(e.y),
              deg(e.z),
            ] as [number, number, number],
            dimensions: scaled && !hasFixedSize(part)
              ? {
                  ...part.dimensions,
                  width: dim(part.dimensions.width * it.obj.scale.x),
                  height: dim(part.dimensions.height * it.obj.scale.y),
                  depth: dim(part.dimensions.depth * it.obj.scale.z),
                }
              : undefined,
          };
        });
        callbacksRef.current.onUpdatePartsTransform?.(updates);
      });

      transformControls.addEventListener('dragging-changed', (event) => {
        const dragging = Boolean(event.value);
        isDraggingGizmoRef.current = dragging;
        orbit.enabled = !dragging;
        setSnapBypassed(dragging && shiftHeldRef.current);

        if (!dragging && transformControls.object && transformControls.object !== jointPivotRef.current) {
          const obj = transformControls.object;
          const partId = obj.userData.partId;
          const currentPart = partsDataRef.current.find((p) => p.id === partId);
          if (currentPart) {
            // Free (Shift) moves keep 0.1 precision; snapped moves round as before
            const free = shiftHeldRef.current;
            const qPos = (v: number) => (free ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);
            const qDeg = (r: number) => {
              const d = THREE.MathUtils.radToDeg(r);
              return free ? Math.round(d * 10) / 10 : Math.round(d);
            };
            const qDim = (v: number) => Math.max(free ? 0.5 : 2, free ? Math.round(v * 10) / 10 : Math.round(v));
            const rest = toRest(partId, obj.position, obj.quaternion);
            const restRot = new THREE.Euler().setFromQuaternion(rest.quaternion, 'XYZ');
            const newPos: [number, number, number] = [qPos(rest.position.x), qPos(rest.position.y), qPos(rest.position.z)];
            const newRot: [number, number, number] = [qDeg(restRot.x), qDeg(restRot.y), qDeg(restRot.z)];
            if (transformControls.getMode() === 'scale' && !hasFixedSize(currentPart)) {
              const newDims = {
                ...currentPart.dimensions,
                width: qDim(currentPart.dimensions.width * obj.scale.x),
                height: qDim(currentPart.dimensions.height * obj.scale.y),
                depth: qDim(currentPart.dimensions.depth * obj.scale.z),
              };
              obj.scale.set(1, 1, 1);
              callbacksRef.current.onUpdatePartTransform(partId, newPos, newRot, newDims);
            } else {
              callbacksRef.current.onUpdatePartTransform(partId, newPos, newRot);
            }
          }
        }
      });

      const domEl = renderer.domElement;

      // MacBook Trackpad Wheel / Pinch / Two-Finger Scroll Handler
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
          const zoomSpeed = 0.0085;
          const factor = Math.exp(e.deltaY * zoomSpeed);
          const offset = camera.position.clone().sub(orbit.target);
          offset.multiplyScalar(factor);
          const dist = offset.length();
          if (dist >= MIN_DIST && dist <= MAX_DIST) {
            camera.position.copy(orbit.target).add(offset);
            orbit.update();
          }
          return;
        }

        const wantsPan =
          e.shiftKey || trackpadModeRef.current === 'pan-scroll';

        if (wantsPan) {
          const distance = camera.position.distanceTo(orbit.target);
          const panScale = distance * 0.0016;
          const right = new THREE.Vector3();
          const up = new THREE.Vector3();
          camera.matrix.extractBasis(right, up, new THREE.Vector3());
          const panOffset = new THREE.Vector3()
            .addScaledVector(right, e.deltaX * panScale)
            .addScaledVector(up, -e.deltaY * panScale);
          camera.position.add(panOffset);
          orbit.target.add(panOffset);
          orbit.update();
        } else {
          const spherical = new THREE.Spherical();
          const offset = camera.position.clone().sub(orbit.target);
          spherical.setFromVector3(offset);
          const rotateSpeed = 0.0055;
          spherical.theta -= e.deltaX * rotateSpeed;
          spherical.phi = Math.max(
            0.08,
            Math.min(Math.PI * 0.49, spherical.phi - e.deltaY * rotateSpeed)
          );
          spherical.makeSafe();
          offset.setFromSpherical(spherical);
          camera.position.copy(orbit.target).add(offset);
          orbit.update();
        }
      };

      domEl.addEventListener('wheel', handleWheel, { passive: false });

      // Raycasting helper for parts
      const raycastParts = (clientX: number, clientY: number) => {
        const rect = domEl.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        const meshes: THREE.Mesh[] = [];
        partsRoot.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshes.push(child);
          }
        });

        const hits = raycaster.intersectObjects(meshes, false);
        return hits.length > 0 ? hits[0] : null;
      };

      let pointerDownPos = { x: 0, y: 0 };

      const handlePointerDown = (e: PointerEvent) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        if (annotateModeRef.current) return;

        if (transformModeRef.current === 'sculpt' && e.button === 0) {
          const hit = raycastParts(e.clientX, e.clientY);
          if (hit && hit.object instanceof THREE.Mesh) {
            const hitPartId = hit.object.userData.partId;
            const part = partsDataRef.current.find((p) => p.id === hitPartId);
            if (part && !part.locked) {
              if (selectedIdRef.current !== part.id) {
                callbacksRef.current.onSelectPart(part.id);
              }
              orbit.enabled = false;
              isSculptingStrokeRef.current = true;

              let sculptMeshObj = hit.object as THREE.Mesh;
              const partGroup = partMapRef.current.get(part.id);

              // If the part wasn't yet converted to a welded sculptable mesh, convert it on-the-fly!
              if (!sculptMeshObj.userData.isSculptTarget && partGroup) {
                const weldedData = convertScenePartToSculptMesh(part);
                const newGeo = buildBufferGeometryFromSculptData(
                  weldedData,
                  part.dimensions.width,
                  part.dimensions.height,
                  part.dimensions.depth
                );
                const mat = (sculptMeshObj.material as THREE.Material).clone();
                partGroup.clear();
                const replacementMesh = new THREE.Mesh(newGeo, mat);
                replacementMesh.castShadow = true;
                replacementMesh.receiveShadow = true;
                replacementMesh.userData.partId = part.id;
                replacementMesh.userData.isSculptTarget = true;
                partGroup.add(replacementMesh);
                sculptMeshObj = replacementMesh;
              } else {
                // Remove static CAD edge lines during active clay sculpting so edges don't stay stale
                const oldEdges = sculptMeshObj.getObjectByName('cad-edges');
                if (oldEdges) sculptMeshObj.remove(oldEdges);
              }

              const localHit = sculptMeshObj.worldToLocal(hit.point.clone());
              const localNormal = hit.face
                ? hit.face.normal.clone()
                : new THREE.Vector3(0, 1, 0);

              applySculptStrokeOnGeometry(
                sculptMeshObj.geometry,
                localHit,
                localNormal,
                new THREE.Vector3(0, 0, 0),
                sculptSettingsRef.current,
                e.altKey
              );

              activeSculptMeshRef.current = {
                partId: part.id,
                mesh: sculptMeshObj,
                partWidth: part.dimensions.width,
                partHeight: part.dimensions.height,
                partDepth: part.dimensions.depth,
                lastLocalHit: localHit,
              };
            }
          }
        }
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (transformModeRef.current !== 'sculpt') {
          if (brushCursor.visible) brushCursor.visible = false;
          return;
        }

        const hit = raycastParts(e.clientX, e.clientY);
        if (hit && hit.object instanceof THREE.Mesh) {
          const radius = sculptSettingsRef.current.radiusMm;
          brushCursor.visible = true;
          brushCursor.position.copy(hit.point);
          brushCursor.scale.set(radius, radius, radius);

          if (hit.face) {
            const worldNormal = hit.face.normal
              .clone()
              .transformDirection(hit.object.matrixWorld)
              .normalize();
            const targetQuat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              worldNormal
            );
            brushCursor.quaternion.copy(targetQuat);
          }

          // If dragging a sculpt stroke on this part, deform vertices in real time!
          if (isSculptingStrokeRef.current && activeSculptMeshRef.current) {
            const active = activeSculptMeshRef.current;
            const localHit = active.mesh.worldToLocal(hit.point.clone());
            const dragDelta = localHit.clone().sub(active.lastLocalHit);
            const localNormal = hit.face
              ? hit.face.normal.clone()
              : new THREE.Vector3(0, 1, 0);

            applySculptStrokeOnGeometry(
              active.mesh.geometry,
              localHit,
              localNormal,
              dragDelta,
              sculptSettingsRef.current,
              e.altKey
            );
            active.lastLocalHit.copy(localHit);
          }
        } else {
          brushCursor.visible = false;
        }
      };

      const handlePointerUp = (e: PointerEvent) => {
        if (isSculptingStrokeRef.current) {
          isSculptingStrokeRef.current = false;
          orbit.enabled = true;
          if (activeSculptMeshRef.current) {
            const { partId, mesh, partWidth, partHeight, partDepth } =
              activeSculptMeshRef.current;
            const updatedSculptData = extractSculptDataFromGeometry(
              mesh.geometry,
              partWidth,
              partHeight,
              partDepth
            );
            activeSculptMeshRef.current = null;
            callbacksRef.current.onCommitSculptMesh(partId, updatedSculptData);
          }
          return;
        }

        if (isDraggingGizmoRef.current) return;
        // Only a primary click changes selection; right-click is for the context menu
        if (e.button !== 0) return;
        const moveDist = Math.hypot(
          e.clientX - pointerDownPos.x,
          e.clientY - pointerDownPos.y
        );
        if (moveDist > 5) return;

        if (annotateModeRef.current && e.button === 0) {
          const hit = raycastParts(e.clientX, e.clientY);
          if (hit) {
            const pid = (hit.object.userData.partId as string | undefined) ?? null;
            onPlaceAnnotationRef.current?.([hit.point.x, hit.point.y, hit.point.z], pid);
            return;
          }
          // Fall back to the ground plane (Y = 0)
          const rect = domEl.getBoundingClientRect();
          const ndc = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          const ray = new THREE.Raycaster();
          ray.setFromCamera(ndc, camera);
          const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const p = new THREE.Vector3();
          if (ray.ray.intersectPlane(ground, p)) {
            onPlaceAnnotationRef.current?.([p.x, 0, p.z], null);
          }
          return;
        }

        const hit = raycastParts(e.clientX, e.clientY);
        if (hit) {
          const hitPartId = hit.object.userData.partId;
          if (hitPartId) {
            callbacksRef.current.onSelectPart(hitPartId, e.shiftKey || e.metaKey);
            return;
          }
        }
        if (!e.shiftKey && !e.metaKey) callbacksRef.current.onSelectPart(null);
      };

      // Double-click drills into a group: selects just the part under the pointer
      const handleDoubleClick = (e: MouseEvent) => {
        if (e.button !== 0 || e.shiftKey || e.metaKey) return;
        if (annotateModeRef.current || transformModeRef.current === 'sculpt') return;
        if (transformControls.axis) return;
        if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) return;
        const hitPartId = raycastParts(e.clientX, e.clientY)?.object.userData.partId as string | undefined;
        if (hitPartId) callbacksRef.current.onSelectPart(hitPartId, false, true);
      };

      // Shift-drag marquee. Runs in the capture phase so it can switch off
      // OrbitControls (which would otherwise Shift-pan) before it sees the event.
      let marquee: { x0: number; y0: number; x1: number; y1: number; active: boolean } | null = null;

      const drawMarquee = () => {
        const el = marqueeElRef.current;
        if (!el) return;
        if (!marquee?.active) {
          el.style.display = 'none';
          return;
        }
        const rect = domEl.getBoundingClientRect();
        const left = Math.min(marquee.x0, marquee.x1) - rect.left;
        const top = Math.min(marquee.y0, marquee.y1) - rect.top;
        el.style.display = 'block';
        el.style.transform = `translate(${left}px, ${top}px)`;
        el.style.width = `${Math.abs(marquee.x1 - marquee.x0)}px`;
        el.style.height = `${Math.abs(marquee.y1 - marquee.y0)}px`;
      };

      const handleMarqueeDown = (e: PointerEvent) => {
        if (!e.shiftKey || e.button !== 0) return;
        if (annotateModeRef.current || transformModeRef.current === 'sculpt') return;
        // Shift-dragging a gizmo handle is a free (unsnapped) transform, not a box select
        if (transformControls.axis) return;
        orbit.enabled = false;
        marquee = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
        domEl.setPointerCapture(e.pointerId);
      };

      const handleMarqueeMove = (e: PointerEvent) => {
        if (!marquee) return;
        if (isDraggingGizmoRef.current) {
          marquee = null;
          drawMarquee();
          return;
        }
        marquee.x1 = e.clientX;
        marquee.y1 = e.clientY;
        if (!marquee.active && Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) > 5) {
          marquee.active = true;
        }
        drawMarquee();
      };

      const handleMarqueeUp = () => {
        if (!marquee) return;
        const m = marquee;
        marquee = null;
        drawMarquee();
        if (!isDraggingGizmoRef.current) orbit.enabled = true;
        if (!m.active) return; // a plain Shift-click toggles via the normal click path

        const rect = domEl.getBoundingClientRect();
        const box = {
          minX: Math.min(m.x0, m.x1) - rect.left,
          maxX: Math.max(m.x0, m.x1) - rect.left,
          minY: Math.min(m.y0, m.y1) - rect.top,
          maxY: Math.max(m.y0, m.y1) - rect.top,
        };
        // A part is hit when one of its (sampled) vertices lands in the box, or
        // when a ray through the box hits it — so round parts select by their
        // silhouette, not their bounding box, and big parts select from inside.
        const hitSet = new Set<string>();
        const v = new THREE.Vector3();
        for (const [id, obj] of partMapRef.current) {
          const part = partsDataRef.current.find((p) => p.id === id);
          if (!part || part.locked || !part.visible) continue;
          obj.updateWorldMatrix(true, true);
          let found = false;
          obj.traverse((child) => {
            if (found || !(child instanceof THREE.Mesh)) return;
            const pos = child.geometry.getAttribute('position');
            if (!pos) return;
            const stride = Math.max(1, Math.floor(pos.count / 600));
            for (let i = 0; i < pos.count; i += stride) {
              v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld).project(camera);
              if (v.z >= 1) continue;
              const px = (v.x * 0.5 + 0.5) * rect.width;
              const py = (-v.y * 0.5 + 0.5) * rect.height;
              if (px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY) {
                found = true;
                return;
              }
            }
          });
          if (found) hitSet.add(id);
        }
        const raycaster = new THREE.Raycaster();
        const meshes: THREE.Object3D[] = [];
        partsRoot.traverse((c) => {
          if (c instanceof THREE.Mesh) meshes.push(c);
        });
        const steps = 6;
        for (let gx = 0; gx <= steps; gx++) {
          for (let gy = 0; gy <= steps; gy++) {
            const sx = box.minX + ((box.maxX - box.minX) * gx) / steps;
            const sy = box.minY + ((box.maxY - box.minY) * gy) / steps;
            raycaster.setFromCamera(
              new THREE.Vector2((sx / rect.width) * 2 - 1, -(sy / rect.height) * 2 + 1),
              camera
            );
            for (const h of raycaster.intersectObjects(meshes, false)) {
              const pid = h.object.userData.partId as string | undefined;
              const part = pid ? partsDataRef.current.find((p) => p.id === pid) : undefined;
              if (part && !part.locked && part.visible) hitSet.add(part.id);
            }
          }
        }
        const hits = [...hitSet];
        callbacksRef.current.onMarqueeSelect?.(hits);
      };

      domEl.addEventListener('pointerdown', handleMarqueeDown, { capture: true });
      domEl.addEventListener('pointermove', handleMarqueeMove);
      domEl.addEventListener('pointerup', handleMarqueeUp);
      domEl.addEventListener('pointercancel', handleMarqueeUp);

      domEl.addEventListener('pointerdown', handlePointerDown);
      domEl.addEventListener('pointermove', handlePointerMove);
      domEl.addEventListener('pointerup', handlePointerUp);
      domEl.addEventListener('dblclick', handleDoubleClick);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift' && !shiftHeldRef.current) {
          shiftHeldRef.current = true;
          applySnaps();
        }
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        if (e.code === 'Space') {
          setIsSpacePressed(true);
          orbit.mouseButtons.LEFT = THREE.MOUSE.PAN;
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift' && shiftHeldRef.current) {
          shiftHeldRef.current = false;
          applySnaps();
        }
        if (e.code === 'Space') {
          setIsSpacePressed(false);
          orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        }
      };

      const handleBlur = () => {
        if (!shiftHeldRef.current) return;
        shiftHeldRef.current = false;
        applySnaps();
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleBlur);

      const resizeObserver = new ResizeObserver(() => {
        if (!container) return;
        const w = container.clientWidth;
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObserver.observe(container);

      let reqId = 0;
      const animate = () => {
        reqId = requestAnimationFrame(animate);
        if (pausedRef.current) return;
        infiniteGrid.update(camera, orbit.target);
        // Keep shadows sharp up close and covering big robots far away
        {
          const dist = camera.position.distanceTo(orbit.target);
          const half = Math.min(4000, Math.max(180, dist * 0.9));
          const sc = dirLight.shadow.camera;
          if (Math.abs(sc.right - half) > half * 0.15) {
            sc.left = -half;
            sc.right = half;
            sc.top = half;
            sc.bottom = -half;
            sc.far = Math.max(700, half * 5);
            sc.updateProjectionMatrix();
            // Offset along the normal by ~1.5 shadow-map texels, so big scenes don't get acne specks
            dirLight.shadow.normalBias = ((2 * half) / dirLight.shadow.mapSize.width) * 1.5;
          }
          dirLight.position.set(orbit.target.x + half * 0.78, half * 1.45, orbit.target.z + half * 0.9);
          dirLight.target.position.set(orbit.target.x, 0, orbit.target.z);
          dirLight.target.updateMatrixWorld();
          fillLight.position.copy(camera.position).add(camera.up.clone().multiplyScalar(dist * 0.35));
          fillLight.target.position.copy(orbit.target);
          fillLight.target.updateMatrixWorld();
        }
        const fa = frameAnimRef.current;
        if (fa) {
          const t = Math.min(1, (performance.now() - fa.start) / 700);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          orbit.target.lerpVectors(fa.fromTarget, fa.toTarget, e);
          camera.position.lerpVectors(fa.fromPos, fa.toPos, e);
          if (t >= 1) frameAnimRef.current = null;
        }
        orbit.update();
        camera.near = Math.max(0.5, camera.position.distanceTo(orbit.target) / 400);
        camera.updateProjectionMatrix();
        if (spawnAnimRef.current.size) {
          const now = performance.now();
          for (const [id, start] of spawnAnimRef.current) {
            const obj = partMapRef.current.get(id);
            const t = Math.min(1, (now - start) / 420);
            // easeOutBack: a little overshoot reads as "placed"
            const c = 1.6;
            const k = t === 1 ? 1 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
            if (obj) obj.scale.setScalar(Math.max(0.001, k));
            if (t >= 1) spawnAnimRef.current.delete(id);
          }
        }
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(reqId);
        resizeObserver.disconnect();
        domEl.removeEventListener('wheel', handleWheel);
        domEl.removeEventListener('pointerdown', handleMarqueeDown, { capture: true });
        domEl.removeEventListener('pointermove', handleMarqueeMove);
        domEl.removeEventListener('pointerup', handleMarqueeUp);
        domEl.removeEventListener('pointercancel', handleMarqueeUp);
        domEl.removeEventListener('pointerdown', handlePointerDown);
        domEl.removeEventListener('pointermove', handlePointerMove);
        domEl.removeEventListener('pointerup', handlePointerUp);
        domEl.removeEventListener('dblclick', handleDoubleClick);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleBlur);
        transformControls.dispose();
        orbit.dispose();
        envMap.dispose();
        renderer.dispose();
        // Free the WebGL context now: each open scene tab holds one, and browsers cap them
        renderer.forceContextLoss();
      };
    }, []);

    // Sync grid visibility
    useEffect(() => {
      if (gridGroupRef.current) {
        gridGroupRef.current.visible = showGrid;
      }
    }, [showGrid]);

    // Sync Blueprint Underlay Image
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;

      if (blueprintMeshRef.current) {
        scene.remove(blueprintMeshRef.current);
        blueprintMeshRef.current = null;
      }

      if (!blueprintDataUrl) return;

      const loader = new THREE.TextureLoader();
      loader.load(blueprintDataUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const imgAspect =
          (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1);
        const planeW = 140 * (imgAspect >= 1 ? 1 : imgAspect);
        const planeD = 140 * (imgAspect >= 1 ? 1 / imgAspect : 1);
        const geo = new THREE.PlaneGeometry(planeW, planeD);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 0.12;
        mesh.raycast = () => {};
        scene.add(mesh);
        blueprintMeshRef.current = mesh;
      });
    }, [blueprintDataUrl]);

    /** Pose tool: one ring about the joint's axis (an arrow for a slider), 1° / 1 mm steps; Shift is free */
    const attachJointGizmo = () => {
      const tc = transformRef.current;
      const pivot = jointPivotRef.current;
      if (!tc || !pivot) return;
      const j = poseJoint;
      if (!j) {
        tc.detach();
        return;
      }
      if (poseDragRef.current) return;
      pivot.position.copy(j.origin);
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), j.axis.clone().normalize());
      pivot.updateMatrixWorld(true);
      tc.setMode(j.type === 'prismatic' ? 'translate' : 'rotate');
      tc.setSpace('local');
      tc.showX = true;
      tc.showY = false;
      tc.showZ = false;
      const free = shiftHeldRef.current;
      tc.setRotationSnap(free ? null : THREE.MathUtils.degToRad(1));
      tc.setTranslationSnap(free ? null : 1);
      if (tc.object !== pivot) tc.attach(pivot);
    };

    /** One part → gizmo on the part; several → gizmo on a pivot at their center */
    const attachGizmo = () => {
      const tc = transformRef.current;
      const pivot = pivotRef.current;
      if (!tc || !pivot) return;
      // Undo the pose gizmo's single-axis, local-space setup
      tc.showX = tc.showY = tc.showZ = true;
      tc.setSpace('world');
      const movable = selectedPartIds
        .map((id) => ({ obj: partMapRef.current.get(id), part: parts.find((p) => p.id === id) }))
        .filter((x): x is { obj: THREE.Group; part: ScenePart } => !!x.obj && !!x.part && !x.part.locked);
      if (movable.length === 0) {
        tc.detach();
      } else if (movable.length === 1 && selectedPartIds.length === 1) {
        tc.attach(movable[0].obj);
      } else {
        const box = new THREE.Box3();
        movable.forEach((m) => box.expandByObject(m.obj));
        box.getCenter(pivot.position);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);
        tc.attach(pivot);
      }
    };

    // Pose: place parts (before the gizmo effect below measures them) whenever the pose or the parts change
    useEffect(() => {
      poseRef.current = pose ?? new Map();
      applyPose();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pose]);

    // Sync TransformMode & Snapping
    useEffect(() => {
      const tc = transformRef.current;
      const cursor = brushCursorRef.current;
      if (!tc) return;

      if (transformMode === 'sculpt') {
        tc.detach();
      } else if (transformMode === 'pose') {
        if (cursor) cursor.visible = false;
        attachJointGizmo();
      } else {
        if (cursor) cursor.visible = false;
        tc.setMode(transformMode);
        applySnaps();

        attachGizmo();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transformMode, snapStepMm, snapAngleDeg, selectedPartIds, parts, poseJoint, pose]);


    // Rebuild 3D parts when `parts` or `selectedPartId` changes
    useEffect(() => {
      const partsRoot = partsRootRef.current;
      const tc = transformRef.current;
      if (!partsRoot || !tc) return;

      tc.detach();
      partsRoot.clear();
      partMapRef.current.clear();

      for (const part of parts) {
        if (!part.visible) continue;
        const isSelected = selectedPartIds.includes(part.id);
        const group = buildPartGroup(part, isSelected);
        group.userData.restPosition = group.position.clone();
        group.userData.restQuaternion = group.quaternion.clone();
        partsRoot.add(group);
        partMapRef.current.set(part.id, group);
      }
      applyPose();
      if (transformMode === 'pose') attachJointGizmo();
      else if (transformMode !== 'sculpt') attachGizmo();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parts, selectedPartIds, transformMode, componentMeshVersion]);

    return (
      <div className="relative w-full h-full select-none overflow-hidden bg-[#1b1b1b]">
        <div
          ref={mountRef}
          className={`w-full h-full ${
            isSpacePressed
              ? 'cursor-grab active:cursor-grabbing'
              : annotateMode
                ? 'cursor-comment'
                : transformMode === 'sculpt'
                ? 'cursor-crosshair'
                : 'cursor-default'
          }`}
        />
        {snapBypassed && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 glass-menu rounded-full h-8 px-3.5 flex items-center text-[12.5px] text-white/85 pointer-events-none animate-fade-in">
            Snapping off
          </div>
        )}
        {/* Shift-drag selection box */}
        <div
          ref={marqueeElRef}
          aria-hidden
          className="absolute left-0 top-0 rounded-[3px] border border-[#0d99ff] bg-[#0d99ff]/[0.12] pointer-events-none"
          style={{ display: 'none' }}
        />
      </div>
    );
  }
);
