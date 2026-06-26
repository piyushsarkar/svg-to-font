import path from "path";
import { buildGlyphs, fixSvgString, optimizeSvgString } from "./helpers/buildGlyphs";
import { createSvgFont, createTTF } from "./helpers/fonts";
import { callerDir, writeFile } from "./helpers/utils";
import { processInput } from "./helpers/processInput";
import { createLogger } from "./helpers/logger";

/**
 * Options used to generate a single icon font from a directory of SVGs.
 */
export type GenerateFontOptions = {
  /**
   * Source of the SVG icons. Accepts any of:
   * - **Local directory** — every `.svg` file in the folder becomes an icon.
   * - **Local `.svg` file** — generates a font with that single icon.
   * - **HTTPS SVG URL** — the file is fetched and used as the single icon.
   * - **Git / GitHub repo URL** — the repo is shallow-cloned and all `.svg`
   *   files found anywhere in it are collected into the font.
   *
   * Pass an array to merge icons from multiple sources into a single font.
   */
  input: string | string[];
  /** Name of the generated font (also used as the output file name). @default "icon-font" */
  fontName?: string;
  /** Directory where the generated font files are written. Required unless `input` is a single local directory, in which case it defaults to that directory. */
  output?: string;
  /** Directory where the glyphmap JSON files are written. Defaults to `output`. */
  glyphmapDir?: string;
  /** Whether to run the SVG fixer before generating the font. Defaults to `true`. */
  fixSvg?: boolean;
  /** Whether to run SVGO optimization on each SVG before generating the font. Defaults to `true`. */
  optimizeSvg?: boolean;
  /** Trace resolution used by the SVG fixer. Defaults to `800`. */
  traceResolution?: number;
  /** Font height passed to svgicons2svgfont. Defaults to `1000`. */
  fontHeight?: number;
  /** Whether to normalize icons. Defaults to `false`. */
  normalize?: boolean;
  /**
   * Override the directory used to resolve relative `input`, `output`, and `glyphmapDir`
   * paths. Defaults to the calling file's own directory (auto-detected from the call stack).
   */
  cwd?: string;
  /** Suppress console logging. Defaults to `false`. */
  silent?: boolean;
};

// ─── generateFont ─────────────────────────────────────────────────────────────

/**
 * Generate a single icon font (and its glyphmap) from any of these sources:
 *
 * - **Local directory** — every `.svg` file in the folder becomes an icon.
 * - **Local `.svg` file** — generates a font containing just that one icon.
 * - **HTTPS SVG URL** — the file is fetched and used as the single icon source.
 * - **Git / GitHub repo URL** — the repo is cloned (shallow), all `.svg` files
 *   found anywhere in it are collected and turned into the font.
 *
 * When `output` is omitted the font is written next to the source, but only
 * when the input is a single local directory — for all other source types
 * (remote URL, git repo, local file, or multiple sources) `output` is required.
 */
export const generateFont = async (
  options: GenerateFontOptions,
): Promise<{ glyphmap: Record<string, number>; ttfBuffer: Buffer }> => {
  const cwd = options.cwd ?? callerDir();
  const fontName = options.fontName ?? "icon-font";
  const logger = createLogger(fontName, options.silent);
  const shouldFixSvg = options.fixSvg !== false;

  if (!options.output) {
    throw new Error("`output` is required when the input is not a local directory");
  }

  const svgCollection = await processInput(options.input, cwd, logger);

  if (shouldFixSvg) logger.step("Processing SVGs");
  const { glyphs, glyphmap } = await buildGlyphs({
    svgCollection,
    transform: async (svg, index) => {
      logger.progressReplace(index, svgCollection.length, svg.name);
      let result = shouldFixSvg
        ? await fixSvgString(svg.content, options.traceResolution)
        : svg.content;
      if (options.optimizeSvg !== false) result = optimizeSvgString(result);
      return result;
    },
  });
  if (shouldFixSvg) logger.done("SVGs Processing complete");

  logger.step(`Generating font`, `[${fontName}.ttf]`);

  const svgFont = await createSvgFont(glyphs, {
    fontName,
    fontHeight: options.fontHeight ?? 1000,
    normalize: options.normalize ?? false,
  });
  const ttfBuffer = await createTTF(svgFont);

  if (options.output) {
    const outputDist = path.resolve(cwd, options.output);
    const glyphmapDist = options.glyphmapDir ? path.resolve(cwd, options.glyphmapDir) : outputDist;

    await writeFile(path.join(outputDist, `${fontName}.ttf`), ttfBuffer);
    await writeFile(
      path.join(glyphmapDist, `${fontName}.json`),
      JSON.stringify(glyphmap, null, 2),
      "utf-8",
    );

    const glyphCount = Object.keys(glyphmap).length;
    const outRel = path.relative(cwd, outputDist) || ".";
    logger.done(`Font ${fontName} generated`, `→ ${outRel}  (${glyphCount} glyphs)`);
  }
  return { glyphmap, ttfBuffer };
};
