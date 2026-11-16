import { galleryBundleBytes, type GalleryBundle } from '../gallery/galleryBundle';
import { SHARED_CASE_TAG, SHARED_ROBOT_FILE } from '../gallery/galleryLinks';
import { hubBridge, type HubPublished } from '../hub/hubBridge';
import { LEAGUE_ENTRY_FILE, parseLeagueSubmission } from '../leagues/entrySources';
import { hashBytes, hashValue, verifyEntryBundle, verifyManifest } from '../leagues/validation';
import type { LeagueEntry, LeagueManifest } from '../leagues/types';
import { validateEntry } from '../leagues/validation';

interface EntryOptions {
  bundle: GalleryBundle;
  manifest: LeagueManifest;
  now?: string;
}

const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const card = (tag: string) => new TextEncoder().encode(`---\ntags:\n- ${tag}\n---\n`);

function publicationRevision(published: HubPublished): string {
  if (!/^[a-f0-9]{40}$/.test(published.revision ?? ''))
    throw new Error('Hugging Face didn’t name a commit for the robot. Share the robot again.');

  return published.revision!;
}

function pinnedEntry(published: HubPublished, entry: LeagueEntry): LeagueEntry {
  return validateEntry({ ...entry, repo: published.repo, revision: publicationRevision(published) });
}

export async function enterLeague({ bundle, manifest, now = new Date().toISOString() }: EntryOptions) {
  await verifyManifest(manifest);

  const bytes = galleryBundleBytes(bundle);
  const bundleHash = await hashBytes(bytes);
  const candidate: LeagueEntry = {
    id: bundleHash,
    robotName: bundle.robot.name,
    repo: 'pending/pending',
    revision: '0'.repeat(40),
    bundleHash,
    enteredAt: now,
    budget: null,
  };

  await verifyEntryBundle(manifest, candidate, bytes);

  const published = await hubBridge.publish({
    name: bundle.slug,
    includeRevision: true,
    files: { [SHARED_ROBOT_FILE]: bytes, 'README.md': card(SHARED_CASE_TAG) },
  });
  const entry = pinnedEntry(published, candidate);
  const submission = parseLeagueSubmission({ league: manifest.id, manifestHash: await hashValue(manifest), entry });
  const identity = await hashValue(submission);

  const submitted = await hubBridge.publish({
    name: `${bundle.slug.slice(0, 55)}-entry-${identity.slice(0, 12)}`,
    includeRevision: true,
    files: { [LEAGUE_ENTRY_FILE]: bytesOf(submission), 'README.md': card('basecase-league-entry') },
  });

  return { ...submitted, revision: publicationRevision(submitted) };
}
