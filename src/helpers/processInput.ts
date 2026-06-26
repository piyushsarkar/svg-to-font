import path from "path";
import fs from "fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { isGitSource, isSvgUrl, findSvgs, parseGitHubTreeUrl, isValidSvgContent } from "./utils";
import type { Logger } from "./logger";
import type { SvgEntry } from "./buildGlyphs";

const gunzipAsync = promisify(gunzip);

/**
 * Resolve one or more source strings into a deduplicated, validated list of
 * `{ name, content }` SVG entries and a sensible default output directory.
 *
 * Supported source types per entry:
 * - **HTTPS SVG URL** — fetched directly; content returned in-memory.
 * - **GitHub `/tree/<branch>/<path>` URL** — tarball downloaded and only SVGs
 *   under the given subdirectory are extracted in-memory.
 * - **GitHub repo URL** — tarball downloaded and all SVGs extracted in-memory.
 * - **Local `.svg` file** — read directly.
 * - **Local directory** — all `.svg` files read from disk.
 *
 * Throws if `output` is omitted for non-local-directory or multi-source inputs.
 */
export async function processInput(
  input: string | string[],
  cwd: string,
  logger: Logger,
): Promise<SvgEntry[]> {
  const sources = Array.isArray(input) ? input : [input];
  let svgEntries: SvgEntry[];

  if (sources.length === 1) {
    logger.step("Resolving source", sources[0]!);
    svgEntries = await resolveOne(sources[0]!, cwd, logger);
    logger.done("Source resolved", `${svgEntries.length} SVGs found`);
  } else {
    logger.step(`Resolving ${sources.length} sources`);
    svgEntries = [];
    for (const [i, src] of sources.entries()) {
      logger.progress(i + 1, sources.length, src);
      const svg = await resolveOne(src, cwd, logger);
      svgEntries.push(...svg);
    }
    logger.done(`${sources.length} sources merged`, `(${svgEntries.length} SVGs)`);
  }

  // Filter invalid SVGs and deduplicate names
  const seenNames = new Set<string>();
  const svgCollection: SvgEntry[] = [];
  for (const entry of svgEntries) {
    if (!isValidSvgContent(entry.content)) continue;
    let name = entry.name;
    let i = 1;
    while (seenNames.has(name)) name = `${entry.name}-${i++}`;
    seenNames.add(name);
    svgCollection.push({ name, content: entry.content });
  }

  return svgCollection;
}

// ─── Per-source resolver ──────────────────────────────────────────────────────

type ResolvedOne = SvgEntry[];

const resolveOne = async (src: string, cwd: string, logger: Logger): Promise<ResolvedOne> => {
  if (isSvgUrl(src)) return resolveHttpSvg(src, cwd, logger);
  if (isGitSource(src)) return resolveGitSource(src, cwd, logger);
  return resolveLocalSource(src, cwd);
};

// ─── HTTP SVG ─────────────────────────────────────────────────────────────────

const resolveHttpSvg = async (src: string, cwd: string, logger: Logger): Promise<ResolvedOne> => {
  logger.sub("Fetching", src);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch SVG: ${res.status} ${res.statusText}`);
  const content = await res.text();
  const name = path.basename(decodeURIComponent(new URL(src).pathname), ".svg") || "icon";
  return [{ name, content }];
};

// ─── GitHub tarball ───────────────────────────────────────────────────────────

const isGitHubHttpUrl = (s: string) =>
  /^https?:\/\/github\.com\//i.test(s) && !s.toLowerCase().endsWith(".svg");

const parseGitHubUrl = (
  src: string,
): { owner: string; repo: string; branch: string; subPath: string } | null => {
  const tree = parseGitHubTreeUrl(src);
  if (tree) {
    const m = tree.cloneUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
    if (!m) return null;
    return { owner: m[1]!, repo: m[2]!, branch: tree.branch, subPath: tree.subPath };
  }
  const m = src.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1]!, repo: m[2]!, branch: "HEAD", subPath: "" };
  return null;
};

const nullTermStr = (buf: Buffer): string => {
  const end = buf.indexOf(0);
  return buf.subarray(0, end >= 0 ? end : buf.length).toString("utf-8");
};

const extractSvgFromTarGz = async (buffer: Buffer, svgPrefix: string): Promise<SvgEntry[]> => {
  const tar = await gunzipAsync(buffer);
  const results: SvgEntry[] = [];
  const prefix = svgPrefix && !svgPrefix.endsWith("/") ? `${svgPrefix}/` : svgPrefix;
  let offset = 0;
  let pendingPath: string | null = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const typeflag = String.fromCharCode(header[156] ?? 48);
    const sizeOctal = nullTermStr(header.subarray(124, 136)).trim();
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    offset += 512;

    if (isNaN(size) || size < 0) break;

    const dataBlocks = Math.ceil(size / 512) * 512;
    const data = tar.subarray(offset, offset + size);
    offset += dataBlocks;

    // PAX extended header — extract `path` attribute
    if (typeflag === "x" || typeflag === "g") {
      const m = data.toString("utf-8").match(/\d+ path=([^\n]+)\n/);
      if (m) pendingPath = m[1]!;
      continue;
    }

    // GNU long filename
    if (typeflag === "L") {
      pendingPath = nullTermStr(data);
      continue;
    }

    if (typeflag !== "0" && typeflag !== "\0") {
      pendingPath = null;
      continue;
    }

    let fullPath: string;
    if (pendingPath) {
      fullPath = pendingPath;
      pendingPath = null;
    } else {
      const nameField = nullTermStr(header.subarray(0, 100));
      const ustarPrefix = nullTermStr(header.subarray(345, 500));
      fullPath = ustarPrefix ? `${ustarPrefix}/${nameField}` : nameField;
    }

    // Strip the root archive directory (e.g. "repo-main/")
    const slashIdx = fullPath.indexOf("/");
    const relativePath = slashIdx >= 0 ? fullPath.slice(slashIdx + 1) : fullPath;

    if (!relativePath.toLowerCase().endsWith(".svg")) continue;
    if (prefix && !relativePath.startsWith(prefix)) continue;

    const content = data.toString("utf-8");
    if (!isValidSvgContent(content)) continue;

    const name = path.basename(relativePath, path.extname(relativePath));
    results.push({ name, content });
  }

  return results;
};

const resolveGitHubTarball = async (
  src: string,
  cwd: string,
  logger: Logger,
): Promise<ResolvedOne> => {
  const info = parseGitHubUrl(src);
  if (!info) throw new Error(`Could not parse GitHub URL: ${src}`);

  const { owner, repo, branch, subPath } = info;
  const tarballUrl = `https://github.com/${owner}/${repo}/archive/${branch === "HEAD" ? "HEAD" : `refs/heads/${branch}`}.tar.gz`;
  logger.sub("Downloading tarball", tarballUrl + (subPath ? `  (path: ${subPath})` : ""));

  const res = await fetch(tarballUrl);
  if (!res.ok) throw new Error(`Failed to download tarball: ${res.status} ${res.statusText}`);

  const svgCollection = await extractSvgFromTarGz(Buffer.from(await res.arrayBuffer()), subPath);

  if (svgCollection.length === 0) {
    throw new Error(
      `No SVG files found in ${subPath ? `"${subPath}" in repository` : "repository"}: ${src}`,
    );
  }
  logger.sub(`${svgCollection.length} SVGs found`);
  return svgCollection;
};

// ─── Git dispatch ─────────────────────────────────────────────────────────────

const resolveGitSource = async (src: string, cwd: string, logger: Logger): Promise<ResolvedOne> => {
  if (isGitHubHttpUrl(src)) return resolveGitHubTarball(src, cwd, logger);
  throw new Error(`Only GitHub HTTPS URLs are supported as git sources. Got: ${src}`);
};

// ─── Local file / directory ───────────────────────────────────────────────────

const resolveLocalSource = async (src: string, cwd: string): Promise<ResolvedOne> => {
  const SOURCE = path.resolve(cwd, src);
  let stats;
  try {
    stats = await fs.stat(SOURCE);
  } catch {
    throw new Error(`Source path does not exist: ${SOURCE}`);
  }

  const isFile = stats.isFile();
  if (isFile && !SOURCE.toLowerCase().endsWith(".svg")) {
    throw new Error(`Source file must be an .svg file: ${SOURCE}`);
  }

  if (isFile) {
    const content = await fs.readFile(SOURCE, "utf-8");
    const name = path.basename(SOURCE, path.extname(SOURCE));
    return [{ name, content }];
  }

  const svgPaths = await findSvgs(SOURCE);
  const svgCollection = await Promise.all(
    svgPaths.map(async (p) => ({
      name: path.basename(p, path.extname(p)),
      content: await fs.readFile(p, "utf-8"),
    })),
  );
  return svgCollection;
};
