import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import config from "@/config";

/**
 * llms.txt — a Markdown index for LLM/AI answer engines (GEO).
 * Lists published posts so generative engines can discover and cite content
 * from verified source rather than guessing. Drafts/scheduled posts are excluded
 * via getSortedPosts().
 */
export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection("posts");
  const sortedPosts = getSortedPosts(posts);

  const lines = [
    `# ${config.site.title}`,
    "",
    `> ${config.site.description}`,
    "",
    `Author: ${config.site.author}`,
    "",
    "## Posts",
    "",
    ...sortedPosts.map(({ data, id, filePath }) => {
      const url = new URL(getPostUrl(id, filePath, config.site.lang), site).href;
      return `- [${data.title}](${url}): ${data.description}`;
    }),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
