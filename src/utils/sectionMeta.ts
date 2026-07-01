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

/** Display label (Title Case) per section key. */
export const SECTION_LABEL: Record<string, string> = {
  jvm: "JVM",
  java: "Java",
  kotlin: "Kotlin",
  gradle: "Gradle",
  spring: "Spring",
  cloud: "Cloud",
  "cloud-native": "Cloud Native",
  web: "Web",
};

export function sectionLabel(section?: string): string {
  return (section && SECTION_LABEL[section]) || section || "";
}

/** One-line Korean description per section key. */
export const SECTION_BLURB: Record<string, string> = {
  jvm: "플랫폼 그 자체. 바이트코드, GC, 가상 스레드, JVM 내부.",
  java: "언어의 진화. JDK 릴리스, 언어 기능, 표준 라이브러리.",
  kotlin: "간결함과 실용주의. 코루틴, 멀티플랫폼, DSL.",
  gradle: "빌드의 과학. 설정 캐시, 의존성 관리, 빌드 성능.",
  spring: "애플리케이션의 기반. Boot, 관측성, 생태계 통합.",
  cloud: "배포와 운영. 컨테이너, 서버리스, 네이티브 이미지.",
  "cloud-native":
    "컨테이너에서 쿠버네티스까지. 배포·운영·CNCF 생태계를 JVM 관점에서.",
  web: "요청과 응답. Spring MVC/WebFlux, HTTP, 표준 웹 스택.",
};

export function sectionBlurb(section?: string): string | undefined {
  return section ? SECTION_BLURB[section] : undefined;
}
