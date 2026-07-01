import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://harryjhin.github.io/",
    title: "The JVM Index",
    description:
      "Cloud-native, seen from the JVM — notes on Spring, Kotlin, and the path to Kubernetes.",
    author: "주진현",
    profile: "https://github.com/HarryJhin",
    ogImage: "default-og.jpg",
    lang: "ko",
    timezone: "Asia/Seoul",
    dir: "ltr",
    googleVerification: "K96gRROTJ9F2yWJx8QjCzGdRUjsPf-_jrRbAOXKNtG0",
    googleAnalyticsId: "G-JLEWMZB16C",
  },
  posts: {
    perPage: 6,
    perIndex: 5,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: false,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/HarryJhin/harryjhin.github.io/edit/main/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/HarryJhin" },
    { name: "linkedin", url: "https://www.linkedin.com/in/harryjhin" },
    { name: "medium", url: "https://joojinhyun.medium.com" },
    { name: "mail", url: "mailto:joojinhyun00@gmail.com" },
  ],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
  sections: [
    { id: "spring", label: "spring" },
    { id: "kotlin", label: "kotlin" },
    { id: "jvm", label: "jvm" },
    { id: "cloud-native", label: "cloud-native" },
    { id: "web", label: "web" },
  ],
  series: [
    {
      id: "spring-web-boot4",
      title: "Spring Web 다시 읽기",
      description:
        "Spring Boot 4·Framework 7의 Web 변경점을 표준 관점에서 따라가는 7부작.",
    },
    {
      id: "cncf-from-jvm",
      title: "JVM에서 본 클라우드 네이티브",
      description:
        "Spring Boot 컨테이너를 Kubernetes에 올리는 개발자가 실제로 만나는 CNCF 프로젝트를 순서대로 따라가는 10부작.",
    },
  ],
});
