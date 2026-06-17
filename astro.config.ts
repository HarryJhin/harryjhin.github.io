import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

// Mark markdown content images as lazy/async so off-screen figures don't
// block the initial render. Skips images that already set the attributes.
function rehypeImageLoading() {
  return (tree: unknown) => {
    const walk = (node: any) => {
      if (node?.type === "element" && node.tagName === "img") {
        node.properties ??= {};
        node.properties.loading ??= "lazy";
        node.properties.decoding ??= "async";
      }
      node?.children?.forEach(walk);
    };
    walk(tree);
  };
}

// Map each post URL to its `modDatetime ?? pubDatetime` so the sitemap can emit
// <lastmod>. This runs at config-eval time in plain Node, where `astro:content`
// is unavailable — so it reads the two frontmatter date lines directly instead
// of loading the collection. Posts are flat files, so slug = filename; a future
// nested post would simply miss its lastmod rather than get a wrong one.
function buildPostLastmod() {
  const postsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "src/content/posts"
  );
  const byPath = new Map<string, string>();
  let latest = 0;
  for (const file of readdirSync(postsDir)) {
    if (file.startsWith("_") || !/\.mdx?$/.test(file)) continue;
    const frontmatter = readFileSync(join(postsDir, file), "utf8").match(
      /^---\r?\n([\s\S]*?)\r?\n---/
    )?.[1];
    if (!frontmatter) continue;
    const read = (key: string) =>
      frontmatter
        .match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"))?.[1]
        ?.replace(/^["']|["']$/g, "");
    const mod = read("modDatetime");
    const stamp = mod && mod !== "null" ? mod : read("pubDatetime");
    const date = stamp ? new Date(stamp) : null;
    if (!date || Number.isNaN(date.valueOf())) continue;
    byPath.set(`/posts/${file.replace(/\.mdx?$/, "")}/`, date.toISOString());
    latest = Math.max(latest, date.valueOf());
  }
  return {
    byPath,
    latest: latest ? new Date(latest).toISOString() : undefined,
  };
}

const postLastmod = buildPostLastmod();

export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
      serialize(item) {
        const { pathname } = new URL(item.url);
        const postDate = postLastmod.byPath.get(pathname);
        if (postDate) {
          // Post detail page: its own modified/published date.
          item.lastmod = postDate;
        } else if (
          postLastmod.latest &&
          (pathname === "/" || /^\/posts\/(\d+\/)?$/.test(pathname))
        ) {
          // Home + paginated post listings refresh when the newest post lands.
          item.lastmod = postLastmod.latest;
        }
        return item;
      },
    }),
  ],
  i18n: {
    locales: ["ko"],
    defaultLocale: "ko",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [rehypeCallouts, rehypeImageLoading],
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
    {
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      provider: fontProviders.google(),
      // Latin body + headlines. Korean glyphs fall through to the OS serif
      // (generic `serif` in the token), so no Korean webfont is shipped.
      fallbacks: ["Georgia", "serif"],
      weights: [400, 600, 800],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
