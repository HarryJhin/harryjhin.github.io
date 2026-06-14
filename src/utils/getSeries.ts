import type { CollectionEntry } from "astro:content";
import config from "@/config";
import { postFilter } from "./postFilter";

export interface SeriesGroup {
  id: string;
  title: string;
  description?: string;
  /** Posts in this series, ordered by `series.order` ascending. */
  posts: CollectionEntry<"posts">[];
}

export interface SeriesContext {
  group: SeriesGroup;
  /** 0-based position of the current post within the series. */
  index: number;
  total: number;
  prev: CollectionEntry<"posts"> | null;
  next: CollectionEntry<"posts"> | null;
}

/** Publishable posts that belong to the given series id, ordered by series.order. */
function postsInSeries(
  posts: CollectionEntry<"posts">[],
  id: string
): CollectionEntry<"posts">[] {
  return posts
    .filter(postFilter)
    .filter(p => p.data.series?.slug === id)
    .sort((a, b) => {
      const ao = a.data.series?.order ?? 0;
      const bo = b.data.series?.order ?? 0;
      if (ao !== bo) return ao - bo;
      // Tie-break by publish date ascending for deterministic order.
      return (
        new Date(a.data.pubDatetime).getTime() -
        new Date(b.data.pubDatetime).getTime()
      );
    });
}

/**
 * All registered series that have at least one publishable post,
 * in `config.series` order. Index-page source.
 */
export function getSeriesList(
  posts: CollectionEntry<"posts">[]
): SeriesGroup[] {
  return config.series
    .map(s => ({ ...s, posts: postsInSeries(posts, s.id) }))
    .filter(g => g.posts.length > 0);
}

/** A single registered series by id, or undefined if not registered. */
export function getSeriesById(
  posts: CollectionEntry<"posts">[],
  id: string
): SeriesGroup | undefined {
  const meta = config.series.find(s => s.id === id);
  if (!meta) return undefined;
  return { ...meta, posts: postsInSeries(posts, id) };
}

/**
 * Series navigation context for a single post, or null when the post has no
 * series, references an unregistered series, or isn't found in its own group.
 */
export function getSeriesContext(
  post: CollectionEntry<"posts">,
  posts: CollectionEntry<"posts">[]
): SeriesContext | null {
  const slug = post.data.series?.slug;
  if (!slug) return null;

  const group = getSeriesById(posts, slug);
  if (!group) {
    if (import.meta.env.DEV) {
      console.warn(
        `[series] post "${post.id}" references unregistered series "${slug}". Add it to config.series.`
      );
    }
    return null;
  }

  const index = group.posts.findIndex(p => p.id === post.id);
  if (index === -1) return null;

  return {
    group,
    index,
    total: group.posts.length,
    prev: index > 0 ? group.posts[index - 1] : null,
    next: index < group.posts.length - 1 ? group.posts[index + 1] : null,
  };
}
