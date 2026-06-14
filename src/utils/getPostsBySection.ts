import type { CollectionEntry } from "astro:content";
import config from "@/config";
import { getSortedPosts } from "./getSortedPosts";

export interface SectionGroup {
  id: string;
  label: string;
  posts: CollectionEntry<"posts">[];
}

const ETC: Omit<SectionGroup, "posts"> = { id: "etc", label: "기타" };

/**
 * 정렬된 글을 config.sections 순서대로 그룹화한다.
 * section 값이 없거나 등록되지 않은 글은 맨 뒤 "기타(etc)" 그룹으로.
 * 빈 그룹은 제외한다.
 *
 * @param excludeIds 인덱스에서 제외할 글 id(예: 리드로 이미 쓴 글)
 */
export function getPostsBySection(
  posts: CollectionEntry<"posts">[],
  excludeIds: string[] = []
): SectionGroup[] {
  const exclude = new Set(excludeIds);
  const sorted = getSortedPosts(posts).filter(p => !exclude.has(p.id));

  const groups: SectionGroup[] = config.sections.map(s => ({
    ...s,
    posts: [],
  }));
  const etc: SectionGroup = { ...ETC, posts: [] };
  const known = new Map(groups.map(g => [g.id, g]));

  for (const post of sorted) {
    const sec = post.data.section;
    (sec && known.has(sec) ? known.get(sec)! : etc).posts.push(post);
  }

  return [...groups, etc].filter(g => g.posts.length > 0);
}
