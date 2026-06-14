import config from "@/config";

/**
 * Social profile URLs for schema.org `sameAs`, derived from configured socials.
 * Only http(s) profile links are included (mailto/tel are excluded).
 */
export function getAuthorSameAs(): string[] {
  return config.socials
    .map(social => social.url)
    .filter(url => /^https?:\/\//.test(url));
}

/**
 * schema.org `Person` for the site author.
 * Used as both `author` and `publisher` in BlogPosting / WebSite structured data.
 */
export function getPersonSchema() {
  const { author, profile } = config.site;
  const sameAs = getAuthorSameAs();
  return {
    "@type": "Person",
    name: author,
    ...(profile && { url: profile }),
    ...(sameAs.length > 0 && { sameAs }),
  };
}
