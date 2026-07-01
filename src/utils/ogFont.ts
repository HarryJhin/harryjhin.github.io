import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read the vendored otf directly instead of relying on import.meta.url:
// Astro's build flattens OG routes into dist/.prerender/chunks/, which
// breaks any path computed relative to the module's own bundled location.
// astro build/check/dev all run from the project root, so cwd is stable.
const dir = join(process.cwd(), "src/assets/fonts/pretendard/og");

export function loadOgFonts() {
  return {
    regular: readFileSync(join(dir, "Pretendard-Regular.otf")),
    bold: readFileSync(join(dir, "Pretendard-Bold.otf")),
  };
}
