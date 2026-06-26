import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

// ─── Source-type detection ────────────────────────────────────────────────────

/** True for any http/https URL. */
export const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * True when the source looks like a git repository:
 *  - ends with `.git`
 *  - is a github.com URL (without a trailing `.svg`)
 *  - uses the `git@` SSH syntax
 */
export const isGitSource = (s: string) =>
  s.endsWith(".git") ||
  (/^https?:\/\/github\.com\//i.test(s) && !s.toLowerCase().endsWith(".svg")) ||
  /^git@/i.test(s);

/** True when the source is a direct HTTP URL pointing at a single SVG. */
export const isSvgUrl = (s: string) =>
  isHttpUrl(s) && !isGitSource(s) && s.toLowerCase().endsWith(".svg");

/**
 * If `src` is a GitHub `/tree/<branch>/<subpath>` URL, returns
 * `{ cloneUrl, subPath, branch }`. Otherwise returns `null`.
 *
 * @example
 * parseGitHubTreeUrl("https://github.com/lucide-icons/lucide/tree/main/icons")
 * // → { cloneUrl: "https://github.com/lucide-icons/lucide", subPath: "icons", branch: "main" }
 */
export const parseGitHubTreeUrl = (
  src: string,
): { cloneUrl: string; subPath: string; branch: string } | null => {
  const m = src.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/([^/]+)\/(.+)/i);
  if (!m) return null;
  return { cloneUrl: m[1], subPath: m[3], branch: m[2] };
};

// ─── SVG file helpers ─────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([".git", "node_modules", ".cache", ".yarn", "__pycache__"]);

/** Recursively collect every `.svg` file under `dir`, skipping common non-source directories. */
export const findSvgs = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findSvgs(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".svg")) {
      results.push(full);
    }
  }
  return results;
};

/** Returns true when an SVG string has a real `<svg>` root element (not just inside a comment). */
export const isValidSvgContent = (raw: string): boolean => {
  const content = raw
    .replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .trim();
  return content.length > 0 && /<svg[\s>]/i.test(content) && /<\/svg>/i.test(content);
};

/** Returns true when the file content has a real `<svg>` root element (not just inside a comment). */
export const isValidSvg = async (filePath: string): Promise<boolean> => {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return isValidSvgContent(raw);
  } catch {
    return false;
  }
};

/**
 * Copy SVG files into a flat staging directory. When two files share the same
 * base name, the later one gets a numeric suffix to avoid clobbering.
 * Files that do not contain a valid SVG root element are silently skipped.
 */
export const flattenSvgs = async (svgPaths: string[], destDir: string): Promise<void> => {
  const seen = new Set<string>();
  for (const svgPath of svgPaths) {
    if (!(await isValidSvg(svgPath))) continue;
    const ext = path.extname(svgPath);
    let name = path.basename(svgPath);
    if (seen.has(name)) {
      const base = path.basename(svgPath, ext);
      let i = 1;
      while (seen.has(`${base}-${i}${ext}`)) i++;
      name = `${base}-${i}${ext}`;
    }
    seen.add(name);
    await fs.copyFile(svgPath, path.join(destDir, name));
  }
};

/**
 * Write `content` to `filePath`, creating parent directories as needed.
 */
export const writeFile = async (
  filePath: string,
  content: string | Buffer | NodeJS.ArrayBufferView,
  encoding?: BufferEncoding,
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, encoding ? { encoding } : undefined);
};

/** Returns the directory of the file that called `generateFont`. */
export function callerDir(): string {
  const lines = (new Error().stack ?? "").split("\n");
  const ownFile = import.meta.url;
  for (const line of lines) {
    const m = line.match(/\(?(file:\/\/.*?):\d+:\d+\)?$/);
    if (!m) continue;
    const fileUrl = m[1]!;
    if (fileUrl === ownFile) continue;
    try {
      return path.dirname(fileURLToPath(fileUrl));
    } catch {
      continue;
    }
  }
  return process.cwd();
}
