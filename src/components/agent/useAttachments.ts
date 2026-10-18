import React, { useState } from 'react';
import { ReferenceImageRecord } from '../../types/robotics';
import { AnalyzedImageFeatures } from '../../utils/imageTo3DAnalyzer';
import { EvidenceFolder, evidenceKind, PickedFolder, uploadEvidenceFolder } from '../../utils/evidenceFiles';

const MAX_IMAGES = 20;

export interface FolderChip extends Partial<EvidenceFolder> {
  key: string;
  name: string;
  done: number;
  total: number;
  ready: boolean;
}

type UploadImage = (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;

type SetChips = React.Dispatch<React.SetStateAction<FolderChip[]>>;

const pendingChip = (f: PickedFolder) => ({
  key: `${f.name}-${Date.now()}-${Math.random()}`,
  name: f.name,
  done: 0,
  total: f.files.length,
  ready: false,
  folder: f,
});

async function uploadChip(key: string, folder: PickedFolder, setChips: SetChips) {
  const drop = (prev: FolderChip[]) => prev.filter((c) => c.key !== key);

  try {
    const result = await uploadEvidenceFolder(folder, (done, total) =>
      setChips((prev) => prev.map((c) => (c.key === key ? { ...c, done, total } : c))),
    );

    setChips((prev) =>
      result.fileCount ? prev.map((c) => (c.key === key ? { ...c, ...result, ready: true } : c)) : drop(prev),
    );
  } catch {
    setChips(drop);
  }
}

const looseFolder = (rest: File[]): PickedFolder[] =>
  rest.length ? [{ name: 'Attached files', files: rest.map((file) => ({ file, relPath: file.name })) }] : [];

export function readyFolders(chips: FolderChip[]): EvidenceFolder[] {
  return chips
    .filter((f) => f.ready && f.id)
    .map((f) => ({
      id: f.id!,
      name: f.name,
      fileCount: f.fileCount ?? 0,
      imageCount: f.imageCount ?? 0,
      skipped: f.skipped ?? 0,
    }));
}

export function useAttachments({
  onUploadImage,
  promptRef,
}: {
  onUploadImage: UploadImage;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [images, setImages] = useState<ReferenceImageRecord[]>([]);
  const [folders, setFolders] = useState<FolderChip[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0 || folders.some((f) => !f.ready);

  const uploadFolders = async (picked: PickedFolder[]) => {
    const chips = picked.filter((f) => f.files.length).map(pendingChip);

    if (!chips.length) return;

    setFolders((prev) => [...prev, ...chips.map(({ folder: _f, ...c }) => c)]);
    await Promise.all(chips.map(({ key, folder }) => uploadChip(key, folder, setFolders)));
    promptRef.current?.focus();
  };

  const uploadImages = async (inline: File[]) => {
    setUploadingCount((n) => n + inline.length);

    const records = await Promise.all(
      inline.map((file) =>
        onUploadImage(file).then(
          ({ record }) => record,
          () => null,
        ),
      ),
    );

    setUploadingCount((n) => n - inline.length);
    setImages((prev) => [...prev, ...records.filter((r): r is ReferenceImageRecord => !!r)]);
  };

  const attachFiles = async (files: File[], picked: PickedFolder[] = []) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/') && evidenceKind(f) === 'image');
    const inline = imageFiles.slice(0, Math.max(0, MAX_IMAGES - images.length - uploadingCount));
    const rest = files.filter((f) => !inline.includes(f) && evidenceKind(f));
    const work: Promise<unknown>[] = [uploadFolders([...picked, ...looseFolder(rest)])];

    if (inline.length) work.push(uploadImages(inline));

    await Promise.all(work);
    promptRef.current?.focus();
  };

  const clear = () => {
    setImages([]);
    setFolders([]);
  };

  return {
    images,
    folders,
    uploadingCount,
    isUploading,
    uploadFolders,
    attachFiles,
    clear,
    removeImage: (id: string) => setImages((prev) => prev.filter((p) => p.id !== id)),
    removeFolder: (key: string) => setFolders((prev) => prev.filter((p) => p.key !== key)),
  };
}

export type Attachments = ReturnType<typeof useAttachments>;
