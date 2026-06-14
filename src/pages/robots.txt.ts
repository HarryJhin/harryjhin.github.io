import type { APIRoute } from "astro";

/**
 * AI crawlers (training + search/retrieval). All are explicitly allowed:
 * GPTBot/ClaudeBot treat the absence of an explicit allow rule as an implicit
 * deny, so the wildcard rule alone is not enough to opt them in.
 */
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google / Apple / Common Crawl
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

const getRobotsTxt = (sitemapURL: URL, llmsURL: URL) => {
  const aiRules = AI_CRAWLERS.map(
    name => `User-agent: ${name}\nAllow: /\n`
  ).join("\n");

  return `User-agent: *
Allow: /

${aiRules}
Sitemap: ${sitemapURL.href}

# LLM-friendly content index (GEO)
# ${llmsURL.href}
`;
};

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL("sitemap-index.xml", site);
  const llmsURL = new URL("llms.txt", site);
  return new Response(getRobotsTxt(sitemapURL, llmsURL));
};
