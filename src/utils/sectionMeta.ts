/** Section (category) accent + label metadata for The JVM Index. */
export const SECTION_KEYS = [
  "jvm", "java", "kotlin", "gradle", "spring", "cloud", "web", "cloud-native",
] as const;

/** Maps a post `section` value to its accent CSS variable.
 *  cloud-native reuses the DS `cloud` accent; web has its own. */
export const SECTION_ACCENT: Record<string, string> = {
  jvm: "var(--color-section-jvm)",
  java: "var(--color-section-java)",
  kotlin: "var(--color-section-kotlin)",
  gradle: "var(--color-section-gradle)",
  spring: "var(--color-section-spring)",
  cloud: "var(--color-section-cloud)",
  "cloud-native": "var(--color-section-cloud)",
  web: "var(--color-section-web)",
};

export function sectionAccent(section?: string): string {
  return (section && SECTION_ACCENT[section]) || "var(--color-text-primary)";
}

export function hasAccent(section?: string): boolean {
  return !!(section && SECTION_ACCENT[section]);
}
