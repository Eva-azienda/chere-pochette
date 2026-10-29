/**
 * Team photos (src/assets/team/*.jpg), optimised by Astro (astro:assets).
 *
 *   src/assets/team/<photo>.jpg  – portrait of one member, 4:5, where <photo> is the "photo" value
 *                                  in src/data/team.json (normally the member's slug)
 *   src/assets/team/group.jpg    – the group photo (home page + team page)
 *
 * A member whose "photo" is null – or whose file is missing – gets the initials avatar
 * (Monogram) instead, so a new member can be added before her photo exists.
 */
import type { ImageMetadata } from 'astro';
import type { TeamMember } from './catalog';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/team/*.jpg', { eager: true });

/** "../assets/team/eva-dallacqua.jpg" → "eva-dallacqua" */
const photos = new Map(
  Object.entries(files).map(([path, mod]) => [path.slice(path.lastIndexOf('/') + 1, -'.jpg'.length), mod.default]),
);

const warned = new Set<string>();

/** The member's portrait, or undefined when there is none (show the Monogram instead). */
export function teamPhoto(member: Pick<TeamMember, 'slug' | 'photo'>): ImageMetadata | undefined {
  if (!member.photo) return undefined;
  const photo = photos.get(member.photo);
  if (!photo && !warned.has(member.slug)) {
    warned.add(member.slug);
    console.warn(`[team] ${member.slug}: src/assets/team/${member.photo}.jpg not found – showing initials instead.`);
  }
  return photo;
}

/** The group photo of the whole team (src/assets/team/group.jpg). */
export const teamGroupPhoto: ImageMetadata | undefined = photos.get('group');
