import type { FrameSet, ImageClass, TrainingFrame } from '../frameSet';
import { decodeSourceImage } from './imageDecode';
import { annotationPixels, boxPixels } from './sourceGeometry';
import {
  directory,
  imagePath,
  IMAGE_LIMITS,
  name,
  number,
  refuseImage,
  sourceBytes,
  sourceText,
  splitOf,
  type ImageSourceFiles,
} from './sourceFiles';

interface XmlNode {
  tag: string;
  text: string;
  children: XmlNode[];
}

function xmlTree(text: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) refuseImage();

  const root: XmlNode = { tag: '', text: '', children: [] };
  const stack = [root];
  const tokens =
    text
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?xml[^?]*\?>/, '')
      .match(/<[^>]*>|[^<]+/g) ?? [];

  if (tokens.length > 200_000) refuseImage();

  for (const token of tokens) {
    const current = stack.at(-1)!;

    if (!token.startsWith('<')) {
      current.text += token;

      continue;
    }

    if (token.startsWith('</') && (stack.length === 1 || token !== `</${current.tag}>`)) refuseImage();

    if (token.startsWith('</')) {
      stack.pop();

      continue;
    }

    const match =
      /^<([a-zA-Z_][\w.-]*)(?:\s+[a-zA-Z_][\w.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*(\/?)>$/.exec(token) ?? refuseImage();
    const child: XmlNode = { tag: match[1], text: '', children: [] };

    current.children.push(child);

    if (!match[2]) stack.push(child);

    if (stack.length > 16) refuseImage();
  }

  return xmlRoot(stack, root);
}

function xmlRoot(stack: XmlNode[], root: XmlNode): XmlNode {
  if (stack.length !== 1 || root.children.length !== 1 || root.children[0].tag !== 'annotation' || root.text.trim())
    refuseImage();

  return root.children[0];
}

function child(node: XmlNode, tag: string): XmlNode {
  const matches = node.children.filter((entry) => entry.tag === tag);

  return matches.length === 1 ? matches[0] : refuseImage();
}

function xmlText(node: XmlNode): string {
  if (node.children.length || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(node.text)) refuseImage();

  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  return name(node.text.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => entities[entity]));
}

async function vocSplits(files: ImageSourceFiles): Promise<Map<string, TrainingFrame['split']>> {
  const splits = new Map<string, TrainingFrame['split']>();

  for (const path of files.keys()) {
    const match = /(^|\/)ImageSets\/Main\/(train|val|test)\.txt$/i.exec(path);

    if (!match) continue;

    const entries = (await sourceText(files, path)).split(/\s+/).filter(Boolean);
    const split = splitOf(match[2]);

    if (entries.length > IMAGE_LIMITS.frames) refuseImage();

    for (const entry of entries) {
      const key = `${path.replace(/ImageSets\/Main\/(train|val|test)\.txt$/i, '')}${entry}`;

      if (splits.has(key) && splits.get(key) !== split) refuseImage();

      splits.set(key, split);
    }
  }

  return splits;
}

export async function readVoc(files: ImageSourceFiles): Promise<Pick<FrameSet, 'classes' | 'frames'>> {
  const classes: ImageClass[] = [];
  const frames: TrainingFrame[] = [];
  const splits = await vocSplits(files);
  const paths = [...files.keys()].filter((path) => /(^|\/)Annotations\/[^/]+\.xml$/i.test(path)).sort();

  if (paths.length > IMAGE_LIMITS.frames) refuseImage();

  for (const path of paths) {
    const xml = xmlTree(await sourceText(files, path));
    const root = directory(directory(path).replace(/\/$/, ''));
    const file = imagePath(files, xmlText(child(xml, 'filename')), [`${root}JPEGImages/`, root, directory(path)]);
    const decoded = await decodeSourceImage(await sourceBytes(files, file, IMAGE_LIMITS.image), files);
    const size = child(xml, 'size');

    if (
      Number(xmlText(child(size, 'width'))) !== decoded.width ||
      Number(xmlText(child(size, 'height'))) !== decoded.height
    )
      refuseImage();

    const objects = xml.children.filter((entry) => entry.tag === 'object');

    if (objects.length > IMAGE_LIMITS.annotations) refuseImage();

    const annotations = objects.map((object, i) => {
      const label = xmlText(child(object, 'name'));
      const category = classes.find((entry) => entry.name === label) ?? { id: classes.length, name: label };

      if (classes.length >= 1000 && !classes.includes(category)) refuseImage();

      if (!classes.includes(category)) classes.push(category);

      const bounds = child(object, 'bndbox');
      const [xmin, ymin, xmax, ymax] = ['xmin', 'ymin', 'xmax', 'ymax'].map((key) =>
        number(Number(xmlText(child(bounds, key)))),
      );
      const pixels = boxPixels([xmin - 1, ymin - 1, xmax - xmin + 1, ymax - ymin + 1], decoded.width, decoded.height);

      return annotationPixels({ ...decoded, pixels, instance: `instance-${i + 1}`, classId: category.id });
    });
    const key = path.slice(path.lastIndexOf('/') + 1).replace(/\.xml$/i, '');

    frames.push({
      ...decoded,
      id: 'pending',
      seed: 0,
      camera: 'image',
      split: splits.get(`${root}${key}`) ?? splitOf(path),
      annotations,
      depth: new Float32Array(decoded.width * decoded.height),
    });
  }

  return { classes, frames };
}
