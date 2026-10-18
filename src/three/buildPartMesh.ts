import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CustomModelSubNode, ScenePart, SculptMeshData } from '../types/robotics';
import {
  applyDeformersToBufferGeometry,
  buildBufferGeometryFromSculptData,
  tessellateGeometryForSculpting,
  weldAndNormalizeGeometry,
} from './sculptAndBooleanEngine';
import { buildHardwarePieces } from './hardwareMesh';
import { getComponentMesh } from './componentMeshes';

/**
 * CAD files often paint black plastic pure black (the STS3215 case is #020202). Nothing
 * real is that dark, and at zero albedo no light shows its shape, so near-black colors
 * render as dark grey (black plastic is about #222). Hue and saturation are kept.
 */
const MIN_LIGHTNESS = 0.13;
function displayColor(hex: string): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.l < MIN_LIGHTNESS) color.setHSL(hsl.h, hsl.s, MIN_LIGHTNESS, THREE.SRGBColorSpace);
  return color;
}

function createMaterial(
  colorHex: string,
  role: ScenePart['role'],
  isSelected: boolean,
  customRoughness = 0.38,
  customMetalness = 0.12
): THREE.MeshStandardMaterial {
  if (role === 'cutout') {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ef4444'),
      transparent: true,
      opacity: isSelected ? 0.52 : 0.35,
      roughness: 0.3,
      metalness: 0.05,
      depthWrite: false,
    });
  }
  if (role === 'reference') {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex || '#06b6d4'),
      transparent: true,
      opacity: isSelected ? 0.85 : 0.65,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(colorHex || '#06b6d4'),
      emissiveIntensity: 0.25,
    });
  }
  const mat = new THREE.MeshStandardMaterial({
    color: displayColor(colorHex || '#e4e4e7'),
    roughness: customRoughness,
    metalness: customMetalness,
    // Faces sit a hair behind their edge lines, so outlines draw cleanly instead of
    // flickering against a surface they lie on (another part's face, a flush panel)
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  if (isSelected) {
    mat.emissive = new THREE.Color('#2563eb');
    mat.emissiveIntensity = 0.12;
  }
  return mat;
}

function addCrispEdges(
  mesh: THREE.Mesh,
  role: ScenePart['role'],
  isSelected: boolean,
  thresholdAngle = 22
) {
  const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const edgeColor = isSelected
    ? 0x0d99ff
    : role === 'cutout'
      ? 0xef4444
      : role === 'reference'
        ? 0x06b6d4
        : 0x3f3f46;
  const edgeMat = new THREE.LineBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: isSelected ? 0.98 : role === 'cutout' ? 0.85 : 0.38,
  });
  const lines = new THREE.LineSegments(edgesGeo, edgeMat);
  lines.name = 'cad-edges';
  lines.raycast = () => {};
  mesh.add(lines);
}

const imageTextureCache = new Map<string, THREE.Texture>();

/** Textures are cached by data URL so scene rebuilds don't reload photos */
function getImageTexture(url: string): THREE.Texture {
  let tex = imageTextureCache.get(url);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    imageTextureCache.set(url, tex);
  }
  return tex;
}

function makeSubMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  role: ScenePart['role'],
  isSelected: boolean,
  edgeThreshold = 22
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = role === 'solid';
  m.receiveShadow = role === 'solid';
  addCrispEdges(m, role, isSelected, edgeThreshold);
  return m;
}

function buildCustomSubNode(
  node: CustomModelSubNode,
  parentRole: ScenePart['role'],
  isSelected: boolean
): THREE.Object3D {
  const effectiveRole = parentRole === 'cutout' ? 'cutout' : node.role;
  const { width: w, height: h, depth: d } = node.dimensions;
  const mat = createMaterial(node.color, effectiveRole, isSelected);

  if (node.nodeType === 'sculpt_mesh' && node.sculptMesh) {
    const geo = buildBufferGeometryFromSculptData(node.sculptMesh, w, h, d);
    if (node.deformers) {
      applyDeformersToBufferGeometry(geo, node.deformers);
    }
    const mesh = makeSubMesh(geo, mat, effectiveRole, isSelected, 34);
    mesh.userData.isSculptTarget = true;
    mesh.position.set(node.position[0], node.position[1], node.position[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2])
    );
    return mesh;
  }

  if (node.nodeType === 'contour_extrude' && node.contour && node.contour.outerLoop.length >= 3) {
    const shape = new THREE.Shape();
    node.contour.outerLoop.forEach(([nx, nz], idx) => {
      const px = nx * w;
      const py = nz * d;
      if (idx === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    });
    shape.closePath();

    if (node.contour.holes) {
      for (const holeLoop of node.contour.holes) {
        if (holeLoop.length < 3) continue;
        const holePath = new THREE.Path();
        holeLoop.forEach(([hx, hz], idx) => {
          const px = hx * w;
          const py = hz * d;
          if (idx === 0) holePath.moveTo(px, py);
          else holePath.lineTo(px, py);
        });
        holePath.closePath();
        shape.holes.push(holePath);
      }
    }

    const extrudeDepth = Math.max(1, h);
    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeDepth,
      steps: 8,
      bevelEnabled: Boolean(node.contour.bevel),
      bevelThickness: Math.min(1.2, extrudeDepth * 0.08),
      bevelSize: Math.min(1.0, Math.min(w, d) * 0.03),
      bevelSegments: 2,
      curveSegments: 20,
    });
    extrudeGeo.rotateX(Math.PI / 2);
    extrudeGeo.translate(0, extrudeDepth / 2, 0);
    if (node.deformers) {
      applyDeformersToBufferGeometry(extrudeGeo, node.deformers);
    }

    const mesh = makeSubMesh(extrudeGeo, mat, effectiveRole, isSelected);
    mesh.position.set(node.position[0], node.position[1], node.position[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2])
    );
    return mesh;
  }

  if (node.nodeType === 'lathe' && node.lathe && node.lathe.profilePoints.length >= 2) {
    const maxR = Math.min(w, d);
    const pts = node.lathe.profilePoints.map(
      ([rNorm, yNorm]) => new THREE.Vector2(Math.max(0.5, rNorm * maxR), yNorm * h)
    );
    const latheGeo = new THREE.LatheGeometry(pts, node.lathe.segments || 32);
    latheGeo.center();
    if (node.deformers) {
      applyDeformersToBufferGeometry(latheGeo, node.deformers);
    }
    const mesh = makeSubMesh(latheGeo, mat, effectiveRole, isSelected);
    mesh.position.set(node.position[0], node.position[1], node.position[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2])
    );
    return mesh;
  }

  const syntheticPart: ScenePart = {
    id: node.id,
    name: node.name,
    kind: node.primitiveKind || 'box',
    category: 'primitives',
    role: effectiveRole,
    position: node.position,
    rotation: node.rotation,
    dimensions: node.dimensions,
    color: node.color,
    note: '',
    visible: true,
    locked: false,
    deformers: node.deformers,
  };
  return buildPartGroup(syntheticPart, isSelected);
}

export function buildPartGroup(part: ScenePart, isSelected: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = part.id;
  group.userData = { partId: part.id };

  const { width: w, height: h, depth: d, thickness = 4 } = part.dimensions;
  const primaryMat = createMaterial(part.color, part.role, isSelected);
  const darkAccentMat = createMaterial('#18181b', part.role, isSelected, 0.5, 0.2);
  const metalAccentMat = createMaterial('#d4d4d8', part.role, isSelected, 0.25, 0.65);
  const brassAccentMat = createMaterial('#eab308', part.role, isSelected, 0.3, 0.5);

  const hasDeformers =
    part.deformers &&
    (Math.abs(part.deformers.taper || 0) > 0.001 ||
      Math.abs(part.deformers.bendDeg || 0) > 0.1 ||
      Math.abs(part.deformers.twistDeg || 0) > 0.1 ||
      (part.deformers.roundness || 0) > 0.001);

  // If the part has sculpted clay vertices (`part.sculptMesh`), render the sculptable mesh directly!
  if (part.sculptMesh && part.sculptMesh.positions.length >= 9) {
    const geo = buildBufferGeometryFromSculptData(part.sculptMesh, w, h, d);
    if (hasDeformers) {
      applyDeformersToBufferGeometry(geo, part.deformers);
    }
    const mesh = makeSubMesh(geo, primaryMat, part.role, isSelected, 35);
    mesh.userData.isSculptTarget = true;
    group.add(mesh);
  } else {
    switch (part.kind) {
      case 'sculpt_mesh': {
        const fallbackGeo = new THREE.IcosahedronGeometry(0.5, 4);
        fallbackGeo.scale(w, h, d);
        if (hasDeformers) {
          applyDeformersToBufferGeometry(fallbackGeo, part.deformers);
        }
        const mesh = makeSubMesh(fallbackGeo, primaryMat, part.role, isSelected, 35);
        mesh.userData.isSculptTarget = true;
        group.add(mesh);
        break;
      }

      case 'custom_model': {
        if (part.customNodes && part.customNodes.length > 0) {
          const innerContainer = new THREE.Group();
          const allNormalizedExtrude = part.customNodes.every(
            (n) =>
              n.nodeType === 'contour_extrude' &&
              n.position[0] === 0 &&
              n.position[1] === 0 &&
              n.position[2] === 0
          );
          for (const node of part.customNodes) {
            if (
              allNormalizedExtrude ||
              (part.customNodes.length === 1 &&
                (node.nodeType === 'contour_extrude' ||
                  node.nodeType === 'lathe' ||
                  node.nodeType === 'sculpt_mesh'))
            ) {
              const scaledNode: CustomModelSubNode = {
                ...node,
                dimensions: { width: w, height: h, depth: d },
                color: part.color || node.color,
                deformers: part.deformers || node.deformers,
              };
              innerContainer.add(buildCustomSubNode(scaledNode, part.role, isSelected));
            } else {
              innerContainer.add(buildCustomSubNode(node, part.role, isSelected));
            }
          }
          if (part.customNodes.length > 1 && !allNormalizedExtrude) {
            const box = new THREE.Box3().setFromObject(innerContainer);
            const size = new THREE.Vector3();
            box.getSize(size);
            const sx = size.x > 0.1 ? w / size.x : 1;
            const sy = size.y > 0.1 ? h / size.y : 1;
            const sz = size.z > 0.1 ? d / size.z : 1;
            innerContainer.scale.set(sx, sy, sz);
          }
          group.add(innerContainer);
        } else {
          const geo = new THREE.BoxGeometry(w, h, d, 12, 16, 12);
          if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
          group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        }
        break;
      }

      case 'box':
      case 'cube':
      case 'hole_box': {
        const segs = hasDeformers ? 16 : 1;
        const geo = new THREE.BoxGeometry(w, h, d, segs, segs, segs);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        break;
      }

      case 'cylinder':
      case 'hole_cylinder': {
        const rx = w / 2;
        const rz = d / 2;
        const geo = new THREE.CylinderGeometry(rx, rx, h, 32, hasDeformers ? 16 : 1);
        geo.scale(1, 1, rz / Math.max(rx, 0.001));
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        const mesh = makeSubMesh(geo, primaryMat, part.role, isSelected);
        group.add(mesh);
        break;
      }

      case 'pivot_axis': {
        const r = Math.max(1.5, Math.min(w, d) / 2);
        const rodGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, h, 20);
        const rod = makeSubMesh(rodGeo, primaryMat, part.role, isSelected);
        group.add(rod);

        const coneGeo = new THREE.ConeGeometry(r * 1.35, Math.min(10, h * 0.15), 20);
        const topCone = makeSubMesh(coneGeo, primaryMat, part.role, isSelected);
        topCone.position.y = h / 2;
        group.add(topCone);

        const botCone = makeSubMesh(coneGeo, primaryMat, part.role, isSelected);
        botCone.rotation.x = Math.PI;
        botCone.position.y = -h / 2;
        group.add(botCone);

        const ringGeo = new THREE.TorusGeometry(r * 2.4, r * 0.28, 12, 28);
        const ring = makeSubMesh(ringGeo, primaryMat, part.role, isSelected);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        break;
      }

      case 'tube': {
        const outerR = Math.min(w, d) / 2;
        const wall = Math.min(thickness, outerR * 0.75);
        const innerR = Math.max(1, outerR - wall);
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, innerR, 0, Math.PI * 2, true);
        shape.holes.push(holePath);

        const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
          depth: h,
          steps: hasDeformers ? 14 : 1,
          bevelEnabled: false,
          curveSegments: 32,
        });
        extrudeGeo.rotateX(Math.PI / 2);
        extrudeGeo.center();
        if (hasDeformers) applyDeformersToBufferGeometry(extrudeGeo, part.deformers);
        const mesh = makeSubMesh(extrudeGeo, primaryMat, part.role, isSelected);
        group.add(mesh);
        break;
      }

      case 'sphere': {
        const geo = new THREE.SphereGeometry(0.5, 32, 24);
        geo.scale(w, h, d);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        const mesh = makeSubMesh(geo, primaryMat, part.role, isSelected);
        group.add(mesh);
        break;
      }

      case 'torus': {
        const tubeR = Math.max(1.5, h / 2);
        const mainR = Math.max(tubeR + 1, Math.min(w, d) / 2 - tubeR);
        const geo = new THREE.TorusGeometry(mainR, tubeR, 18, 36);
        geo.rotateX(Math.PI / 2);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        const mesh = makeSubMesh(geo, primaryMat, part.role, isSelected);
        group.add(mesh);
        break;
      }

      case 'cad_part': {
        const cad = part.cad;
        if (!cad || cad.positions.length < 9) break;
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(cad.positions, 3));
        geo.setIndex(cad.indices);
        // Smooth curved faces, keep crisp feature edges
        geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(32));
        const s = [w / cad.baseSize[0], h / cad.baseSize[1], d / cad.baseSize[2]].map((v) => (Number.isFinite(v) && v > 0 ? v : 1));
        geo.scale(s[0], s[1], s[2]);
        const mesh = new THREE.Mesh(geo, primaryMat);
        mesh.castShadow = part.role === 'solid';
        mesh.receiveShadow = part.role === 'solid';
        const edgeColor = isSelected ? 0x0d99ff : part.role === 'cutout' ? 0xef4444 : 0x18181b;
        const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: isSelected ? 0.95 : 0.55 });
        let edgeGeo: THREE.BufferGeometry;
        if (cad.edges && cad.edges.length >= 6) {
          edgeGeo = new THREE.BufferGeometry();
          edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(creaseEdgesOnly(cad.edges, cad.positions, cad.indices), 3));
          edgeGeo.scale(s[0], s[1], s[2]);
        } else {
          edgeGeo = new THREE.EdgesGeometry(geo, 30);
        }
        const lines = new THREE.LineSegments(edgeGeo, edgeMat);
        lines.name = 'cad-edges';
        lines.raycast = () => {};
        mesh.add(lines);
        group.add(mesh);
        break;
      }

      case 'mesh': {
        // A link of an imported robot: its published mesh, edges only when selected (dense meshes speckle)
        const src = part.mesh;
        if (!src || src.positions.length < 9) break;
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(src.positions, 3));
        geo.setIndex(src.indices);
        geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(30));
        const s = [w / src.baseSize[0], h / src.baseSize[1], d / src.baseSize[2]].map((v) => (Number.isFinite(v) && v > 0 ? v : 1));
        geo.scale(s[0], s[1], s[2]);
        const mesh = new THREE.Mesh(geo, primaryMat);
        mesh.castShadow = part.role === 'solid';
        mesh.receiveShadow = part.role === 'solid';
        if (isSelected || part.role === 'cutout') {
          const lines = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo, 35),
            new THREE.LineBasicMaterial({ color: isSelected ? 0x0d99ff : 0xef4444, transparent: true, opacity: 0.9 })
          );
          lines.raycast = () => {};
          mesh.add(lines);
        }
        group.add(mesh);
        break;
      }

      case 'component': {
        // Exact manufacturer mesh, shared across parts; never scaled
        const loaded = part.componentId ? getComponentMesh(part.componentId) : null;
        if (!loaded) {
          // Still loading: a faint box at the exact envelope keeps placement and picking working
          const geo = new THREE.BoxGeometry(w, h, d);
          const mat = createMaterial(part.color, part.role, isSelected);
          mat.transparent = true;
          mat.opacity = 0.25;
          mat.depthWrite = false;
          group.add(makeSubMesh(geo, mat, part.role, isSelected));
          break;
        }
        for (const piece of loaded.pieces) {
          const mat = part.role === 'solid'
            ? createMaterial(piece.color, part.role, isSelected, piece.roughness, piece.metalness)
            : primaryMat;
          const mesh = new THREE.Mesh(piece.geometry, mat);
          mesh.castShadow = part.role === 'solid';
          mesh.receiveShadow = part.role === 'solid';
          group.add(mesh);
        }
        // Manufacturer meshes read from shading alone. Their dense feature edges only draw for the
        // selection outline: unselected, they showed through shells as dark specks.
        if (isSelected || part.role === 'cutout') {
          const lines = new THREE.LineSegments(
            loaded.edges,
            new THREE.LineBasicMaterial({ color: isSelected ? 0x0d99ff : 0xef4444, transparent: true, opacity: 0.7 })
          );
          lines.raycast = () => {};
          group.add(lines);
        }
        break;
      }

      case 'hardware': {
        if (!part.hardware) break;
        const metal = createMaterial(part.color, part.role, isSelected, 0.3, 0.8);
        const dark = createMaterial('#111114', part.role, isSelected, 0.6, 0.3);
        const nylon = createMaterial('#ebe6d8', part.role, isSelected, 0.65, 0);
        for (const piece of buildHardwarePieces(part.hardware, { main: metal, dark, nylon })) {
          if (piece.edges) {
            // Like catalog components, fasteners only outline when selected (unselected, their
            // edges showed through the shells they sit in)
            if (isSelected || part.role === 'cutout') group.add(makeSubMesh(piece.geometry, piece.material, part.role, isSelected, 40));
            else {
              const m = new THREE.Mesh(piece.geometry, piece.material);
              m.castShadow = part.role === 'solid';
              m.receiveShadow = part.role === 'solid';
              group.add(m);
            }
          } else {
            const mesh = new THREE.Mesh(piece.geometry, piece.material);
            mesh.castShadow = part.role === 'solid';
            mesh.receiveShadow = part.role === 'solid';
            group.add(mesh);
          }
        }
        break;
      }

      case 'image_plane': {
        const opacity = part.opacity ?? 1;
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshBasicMaterial({
          map: part.imageDataUrl ? getImageTexture(part.imageDataUrl) : null,
          color: part.imageDataUrl ? 0xffffff : 0x3f3f46,
          side: THREE.DoubleSide,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity >= 1,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: isSelected ? 0x0d99ff : 0xffffff,
            transparent: true,
            opacity: isSelected ? 1 : 0.18,
          })
        );
        frame.raycast = () => {};
        mesh.add(frame);
        group.add(mesh);
        break;
      }

      case 'cone':
      case 'pyramid':
      case 'hex_prism': {
        const radial = part.kind === 'pyramid' ? 4 : part.kind === 'hex_prism' ? 6 : 48;
        const top = part.kind === 'hex_prism' ? 0.5 : 0;
        const geo = new THREE.CylinderGeometry(top, 0.5, 1, radial, hasDeformers ? 16 : 1);
        if (part.kind === 'pyramid') geo.rotateY(Math.PI / 4);
        // Pyramid base fills the footprint like a box; others fit inside it
        if (part.kind === 'pyramid') geo.scale(w * Math.SQRT2, h, d * Math.SQRT2);
        else geo.scale(w, h, d);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        break;
      }

      case 'capsule': {
        const r = 0.5;
        const geo = new THREE.CapsuleGeometry(r, 1, 12, 32);
        // CapsuleGeometry height = length + 2r; normalise to 1 then scale to the part box
        geo.scale(1, 1 / 2, 1);
        geo.scale(w, h, d);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        break;
      }

      case 'dome': {
        const geo = new THREE.SphereGeometry(0.5, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const base = new THREE.CircleGeometry(0.5, 48);
        base.rotateX(Math.PI / 2);
        geo.scale(w, h * 2, d);
        geo.translate(0, -h / 2, 0);
        base.scale(w, 1, d);
        base.translate(0, -h / 2, 0);
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        group.add(makeSubMesh(base, primaryMat, part.role, isSelected, 80));
        break;
      }

      case 'wedge': {
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, -h / 2);
        shape.lineTo(w / 2, -h / 2);
        shape.lineTo(-w / 2, h / 2);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: d,
          steps: hasDeformers ? 12 : 1,
          bevelEnabled: false,
        });
        geo.center();
        if (hasDeformers) applyDeformersToBufferGeometry(geo, part.deformers);
        group.add(makeSubMesh(geo, primaryMat, part.role, isSelected));
        break;
      }

      case 'servo': {
        const bodyW = w * 0.74;
        const bodyH = h * 0.82;
        const bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, d);
        const body = makeSubMesh(bodyGeo, primaryMat, part.role, isSelected);
        body.position.y = -h * 0.06;
        group.add(body);

        const earGeo = new THREE.BoxGeometry(w, Math.max(2.5, h * 0.08), d);
        const ears = makeSubMesh(earGeo, primaryMat, part.role, isSelected);
        ears.position.y = h * 0.14;
        group.add(ears);

        const shaftX = bodyW * 0.24;
        const bossR = Math.min(bodyW, d) * 0.28;
        const bossGeo = new THREE.CylinderGeometry(bossR, bossR, h * 0.14, 24);
        const boss = makeSubMesh(bossGeo, darkAccentMat, part.role, isSelected);
        boss.position.set(shaftX, h * 0.38, 0);
        group.add(boss);

        const hornGeo = new THREE.BoxGeometry(bodyW * 0.65, Math.max(2, h * 0.06), d * 0.36);
        const horn = makeSubMesh(hornGeo, metalAccentMat, part.role, isSelected);
        horn.position.set(shaftX, h * 0.47, 0);
        group.add(horn);

        const capGeo = new THREE.CylinderGeometry(bossR * 0.45, bossR * 0.45, h * 0.1, 16);
        const cap = makeSubMesh(capGeo, brassAccentMat, part.role, isSelected);
        cap.position.set(shaftX, h * 0.48, 0);
        group.add(cap);
        break;
      }

      case 'stepper_motor': {
        const bodyH = h * 0.72;
        const bodyGeo = new THREE.BoxGeometry(w, bodyH, d);
        const body = makeSubMesh(bodyGeo, primaryMat, part.role, isSelected);
        body.position.y = -h * 0.14;
        group.add(body);

        const bossR = Math.min(w, d) * 0.26;
        const bossGeo = new THREE.CylinderGeometry(bossR, bossR, h * 0.06, 24);
        const boss = makeSubMesh(bossGeo, metalAccentMat, part.role, isSelected);
        boss.position.y = bodyH / 2 - h * 0.14 + h * 0.03;
        group.add(boss);

        const shaftR = Math.max(2.5, Math.min(w, d) * 0.07);
        const shaftH = h * 0.28;
        const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftH, 20);
        const shaft = makeSubMesh(shaftGeo, metalAccentMat, part.role, isSelected);
        shaft.position.y = h / 2 - shaftH / 2;
        group.add(shaft);
        break;
      }

      case 'hinge_joint': {
        const baseH = h * 0.48;
        const baseGeo = new THREE.BoxGeometry(w, baseH, d);
        const base = makeSubMesh(baseGeo, primaryMat, part.role, isSelected);
        base.position.y = -h * 0.26;
        group.add(base);

        const topGeo = new THREE.BoxGeometry(w * 0.65, h * 0.52, d * 0.85);
        const top = makeSubMesh(topGeo, primaryMat, part.role, isSelected);
        top.position.y = h * 0.24;
        group.add(top);

        const pinR = Math.max(2, Math.min(h, d) * 0.12);
        const pinGeo = new THREE.CylinderGeometry(pinR, pinR, w * 1.18, 20);
        pinGeo.rotateZ(Math.PI / 2);
        const pin = makeSubMesh(pinGeo, metalAccentMat, part.role, isSelected);
        pin.position.y = 0;
        group.add(pin);
        break;
      }

      case 'linear_actuator': {
        const cylR = Math.min(w, d) * 0.42;
        const cylH = h * 0.62;
        const housingGeo = new THREE.CylinderGeometry(cylR, cylR, cylH, 24);
        const housing = makeSubMesh(housingGeo, primaryMat, part.role, isSelected);
        housing.position.y = -h * 0.19;
        group.add(housing);

        const rodR = cylR * 0.48;
        const rodH = h * 0.42;
        const rodGeo = new THREE.CylinderGeometry(rodR, rodR, rodH, 20);
        const rod = makeSubMesh(rodGeo, metalAccentMat, part.role, isSelected);
        rod.position.y = h * 0.25;
        group.add(rod);

        const tipGeo = new THREE.BoxGeometry(cylR * 1.1, h * 0.1, cylR * 1.1);
        const tip = makeSubMesh(tipGeo, darkAccentMat, part.role, isSelected);
        tip.position.y = h * 0.45;
        group.add(tip);
        break;
      }

      case 'l_bracket': {
        const t = Math.min(thickness, Math.min(w, h) * 0.35);
        const bottomGeo = new THREE.BoxGeometry(w, t, d);
        const bottom = makeSubMesh(bottomGeo, primaryMat, part.role, isSelected);
        bottom.position.set(0, -h / 2 + t / 2, 0);
        group.add(bottom);

        const vertH = h - t;
        const vertGeo = new THREE.BoxGeometry(t, vertH, d);
        const vert = makeSubMesh(vertGeo, primaryMat, part.role, isSelected);
        vert.position.set(-w / 2 + t / 2, t / 2, 0);
        group.add(vert);
        break;
      }

      case 'u_bracket': {
        const t = Math.min(thickness, Math.min(w, h) * 0.25);
        const bottomGeo = new THREE.BoxGeometry(w, t, d);
        const bottom = makeSubMesh(bottomGeo, primaryMat, part.role, isSelected);
        bottom.position.set(0, -h / 2 + t / 2, 0);
        group.add(bottom);

        const armH = h - t;
        const armGeo = new THREE.BoxGeometry(t, armH, d);
        const leftArm = makeSubMesh(armGeo, primaryMat, part.role, isSelected);
        leftArm.position.set(-w / 2 + t / 2, t / 2, 0);
        group.add(leftArm);

        const rightArm = makeSubMesh(armGeo, primaryMat, part.role, isSelected);
        rightArm.position.set(w / 2 - t / 2, t / 2, 0);
        group.add(rightArm);

        const holeR = Math.min(d, armH) * 0.16;
        const pegGeo = new THREE.CylinderGeometry(holeR, holeR, t * 1.2, 16);
        pegGeo.rotateZ(Math.PI / 2);
        const leftHole = makeSubMesh(pegGeo, darkAccentMat, part.role, isSelected);
        leftHole.position.set(-w / 2 + t / 2, h / 2 - d * 0.35, 0);
        group.add(leftHole);

        const rightHole = makeSubMesh(pegGeo, darkAccentMat, part.role, isSelected);
        rightHole.position.set(w / 2 - t / 2, h / 2 - d * 0.35, 0);
        group.add(rightHole);
        break;
      }

      case 'beam': {
        const barGeo = new THREE.BoxGeometry(w, h, d, 14, 4, 4);
        if (hasDeformers) applyDeformersToBufferGeometry(barGeo, part.deformers);
        const bar = makeSubMesh(barGeo, primaryMat, part.role, isSelected);
        group.add(bar);

        if (!hasDeformers) {
          const count = Math.max(2, Math.min(8, Math.floor(w / 16)));
          const spacing = w / (count + 1);
          const dotR = Math.min(h, d) * 0.2;
          const dotGeo = new THREE.CylinderGeometry(dotR, dotR, h * 1.03, 14);
          for (let i = 1; i <= count; i++) {
            const dot = makeSubMesh(dotGeo, darkAccentMat, part.role, isSelected);
            dot.position.x = -w / 2 + i * spacing;
            group.add(dot);
          }
        }
        break;
      }

      case 'standoff': {
        const r = Math.min(w, d) / 2;
        const hexGeo = new THREE.CylinderGeometry(r, r, h, 6);
        const hex = makeSubMesh(hexGeo, primaryMat, part.role, isSelected);
        group.add(hex);

        const boreGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, h * 1.02, 14);
        const bore = makeSubMesh(boreGeo, darkAccentMat, part.role, isSelected);
        group.add(bore);
        break;
      }

      case 'wheel': {
        const r = Math.min(w, d) / 2;
        const tireGeo = new THREE.CylinderGeometry(r, r, h, 32);
        const tire = makeSubMesh(tireGeo, primaryMat, part.role, isSelected);
        group.add(tire);

        const hubGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, h * 1.04, 24);
        const hub = makeSubMesh(hubGeo, metalAccentMat, part.role, isSelected);
        group.add(hub);

        const axleGeo = new THREE.CylinderGeometry(r * 0.16, r * 0.16, h * 1.08, 16);
        const axle = makeSubMesh(axleGeo, darkAccentMat, part.role, isSelected);
        group.add(axle);
        break;
      }

      case 'gripper': {
        const palmH = h * 0.34;
        const palmGeo = new THREE.BoxGeometry(w, palmH, d);
        const palm = makeSubMesh(palmGeo, primaryMat, part.role, isSelected);
        palm.position.y = -h / 2 + palmH / 2;
        group.add(palm);

        const fingerW = Math.max(4, w * 0.14);
        const fingerH = h - palmH;
        const fingerGeo = new THREE.BoxGeometry(fingerW, fingerH, d * 0.72);

        const leftFinger = makeSubMesh(fingerGeo, metalAccentMat, part.role, isSelected);
        leftFinger.position.set(-w * 0.32, palmH / 2, 0);
        group.add(leftFinger);

        const rightFinger = makeSubMesh(fingerGeo, metalAccentMat, part.role, isSelected);
        rightFinger.position.set(w * 0.32, palmH / 2, 0);
        group.add(rightFinger);

        const tipGeo = new THREE.BoxGeometry(fingerW * 1.5, fingerH * 0.25, d * 0.74);
        const leftTip = makeSubMesh(tipGeo, darkAccentMat, part.role, isSelected);
        leftTip.position.set(-w * 0.28, h / 2 - fingerH * 0.13, 0);
        group.add(leftTip);

        const rightTip = makeSubMesh(tipGeo, darkAccentMat, part.role, isSelected);
        rightTip.position.set(w * 0.28, h / 2 - fingerH * 0.13, 0);
        group.add(rightTip);
        break;
      }

      case 'bearing_block': {
        const flangeH = h * 0.28;
        const flangeGeo = new THREE.BoxGeometry(w, flangeH, d);
        const flange = makeSubMesh(flangeGeo, primaryMat, part.role, isSelected);
        flange.position.y = -h / 2 + flangeH / 2;
        group.add(flange);

        const housingR = Math.min(w * 0.32, h * 0.45);
        const housingGeo = new THREE.CylinderGeometry(housingR, housingR, d, 24);
        housingGeo.rotateX(Math.PI / 2);
        const housing = makeSubMesh(housingGeo, primaryMat, part.role, isSelected);
        housing.position.y = h * 0.06;
        group.add(housing);

        const boreGeo = new THREE.CylinderGeometry(housingR * 0.52, housingR * 0.52, d * 1.05, 20);
        boreGeo.rotateX(Math.PI / 2);
        const bore = makeSubMesh(boreGeo, darkAccentMat, part.role, isSelected);
        bore.position.y = h * 0.06;
        group.add(bore);
        break;
      }

      case 'camera_module': {
        const pcbD = d * 0.45;
        const pcbGeo = new THREE.BoxGeometry(w, h, pcbD);
        const pcb = makeSubMesh(pcbGeo, primaryMat, part.role, isSelected);
        pcb.position.z = -d / 2 + pcbD / 2;
        group.add(pcb);

        const lensR = Math.min(w, h) * 0.34;
        const lensD = d * 0.55;
        const lensGeo = new THREE.CylinderGeometry(lensR, lensR, lensD, 24);
        lensGeo.rotateX(Math.PI / 2);
        const lens = makeSubMesh(lensGeo, darkAccentMat, part.role, isSelected);
        lens.position.z = d / 2 - lensD / 2;
        group.add(lens);
        break;
      }

      case 'ultrasonic': {
        const pcbD = d * 0.25;
        const pcbGeo = new THREE.BoxGeometry(w, h, pcbD);
        const pcb = makeSubMesh(pcbGeo, primaryMat, part.role, isSelected);
        pcb.position.z = -d / 2 + pcbD / 2;
        group.add(pcb);

        const eyeR = Math.min(w * 0.18, h * 0.42);
        const eyeD = d * 0.75;
        const eyeGeo = new THREE.CylinderGeometry(eyeR, eyeR, eyeD, 24);
        eyeGeo.rotateX(Math.PI / 2);

        const leftEye = makeSubMesh(eyeGeo, metalAccentMat, part.role, isSelected);
        leftEye.position.set(-w * 0.26, 0, d / 2 - eyeD / 2);
        group.add(leftEye);

        const rightEye = makeSubMesh(eyeGeo, metalAccentMat, part.role, isSelected);
        rightEye.position.set(w * 0.26, 0, d / 2 - eyeD / 2);
        group.add(rightEye);
        break;
      }

      case 'pcb_board': {
        const boardGeo = new THREE.BoxGeometry(w, h * 0.35, d);
        const board = makeSubMesh(boardGeo, primaryMat, part.role, isSelected);
        board.position.y = -h * 0.32;
        group.add(board);

        const chipGeo = new THREE.BoxGeometry(w * 0.45, h * 0.65, d * 0.55);
        const chip = makeSubMesh(chipGeo, darkAccentMat, part.role, isSelected);
        chip.position.y = h * 0.15;
        group.add(chip);
        break;
      }
    }
  }

  group.position.set(part.position[0], part.position[1], part.position[2]);
  group.rotation.set(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2])
  );

  group.traverse((obj) => {
    obj.userData.partId = part.id;
  });

  return group;
}

/**
 * Converts ANY ScenePart into a high-resolution welded SculptMeshData so the user can sculpt on it with 3D Clay Brushes!
 */
export function convertScenePartToSculptMesh(part: ScenePart): SculptMeshData {
  if (part.sculptMesh && part.sculptMesh.positions.length >= 9) {
    // Subdivide one more pass if user wants finer detail
    const currentGeo = buildBufferGeometryFromSculptData(
      part.sculptMesh,
      part.dimensions.width,
      part.dimensions.height,
      part.dimensions.depth
    );
    const finer = tessellateGeometryForSculpting(currentGeo, 1);
    return weldAndNormalizeGeometry(finer);
  }

  // Build local-space geometry of the part
  const zeroedPart: ScenePart = {
    ...part,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  };
  const group = buildPartGroup(zeroedPart, false);
  group.updateMatrixWorld(true);

  const allCoords: number[] = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const g = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      g.applyMatrix4(child.matrixWorld);
      const subdivided = tessellateGeometryForSculpting(g, 2);
      const pos = subdivided.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) {
        vA.fromBufferAttribute(pos, i);
        vB.fromBufferAttribute(pos, i + 1);
        vC.fromBufferAttribute(pos, i + 2);
        allCoords.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
      }
    }
  });

  const combinedGeo = new THREE.BufferGeometry();
  combinedGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(allCoords, 3)
  );
  return weldAndNormalizeGeometry(combinedGeo);
}

/**
 * B-rep edges include smooth seams (loft sections, spline joins, tangent fillet boundaries) that a
 * CAD viewer wouldn't outline; drawing them striped lofted shells with contour lines. Keep a
 * segment only where the faces on either side meet at a crease (> 20°), or where the mesh has no
 * matching edge (keep, to be safe).
 */
function creaseEdgesOnly(edges: number[], positions: number[], indices: number[]): number[] {
  const key = (x: number, y: number, z: number) => `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
  const vkey = (i: number) => key(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const normals = new Map<string, THREE.Vector3[]>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [i0, i1, i2] = [indices[t], indices[t + 1], indices[t + 2]];
    a.fromArray(positions, i0 * 3);
    b.fromArray(positions, i1 * 3);
    c.fromArray(positions, i2 * 3);
    const n = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
    for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const ku = vkey(u), kv = vkey(v);
      const k = ku < kv ? `${ku}|${kv}` : `${kv}|${ku}`;
      const list = normals.get(k);
      if (list) list.push(n);
      else normals.set(k, [n]);
    }
  }
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(20));
  const out: number[] = [];
  for (let i = 0; i + 5 < edges.length; i += 6) {
    const k1 = key(edges[i], edges[i + 1], edges[i + 2]), k2 = key(edges[i + 3], edges[i + 4], edges[i + 5]);
    const list = normals.get(k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`);
    const smooth = list && list.length === 2 && list[0].dot(list[1]) > cosLimit;
    if (!smooth) for (let k = 0; k < 6; k++) out.push(edges[i + k]);
  }
  return out;
}
