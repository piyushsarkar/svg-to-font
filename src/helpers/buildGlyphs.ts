import SVGFixer from "oslllo-svg-fixer";
import { optimize } from "svgo";

export type Glyph = { name: string; unicode: number; svgContent: string };

export type BuildGlyphsResult = {
  glyphs: Glyph[];
  glyphmap: Record<string, number>;
};

/** A transform applied to each SVG string before it becomes a glyph. */
export type SvgTransform = (svgEntry: SvgEntry, index: number) => string | Promise<string>;

export type SvgEntry = { name: string; content: string };

/**
 * Fix an SVG string using the SVG fixer (oslllo-svg-fixer).
 *
 * @param svgContent - Raw SVG markup to fix.
 * @param traceResolution - Trace resolution passed to the fixer. Defaults to `800`.
 */
export async function fixSvgString(svgContent: string, traceResolution = 800): Promise<string> {
  return String(await SVGFixer.fixString(svgContent, traceResolution));
}

/**
 * Optimize an SVG string using SVGO with the `preset-default` plugin.
 *
 * @param svgContent - Raw SVG markup to optimize.
 */
export function optimizeSvgString(svgContent: string): string {
  return optimize(svgContent, { plugins: ["preset-default"] }).data;
}

/**
 * Assign Unicode codepoints to each SVG entry and run each through the
 * provided `transform` pipeline.
 *
 * Codepoints are assigned sequentially starting at `0xE001` in the same order
 * as the input `svgs` array. Entries are expected to be pre-validated and
 * deduplicated (see {@link processInput}).
 */
export async function buildGlyphs({
  svgCollection,
  transform,
}: {
  svgCollection: SvgEntry[];
  transform?: SvgTransform;
}): Promise<BuildGlyphsResult> {
  const total = svgCollection.length;
  let codepoint = 0xe001;
  const glyphmap: Record<string, number> = {};
  const glyphs: Glyph[] = [];

  for (let i = 0; i < total; i++) {
    const entry = svgCollection[i]!;
    const unicode = codepoint++;
    glyphmap[entry.name] = unicode;
    const svgContent = transform ? await transform(entry, i) : entry.content;
    glyphs.push({ name: entry.name, unicode, svgContent });
  }

  return { glyphs, glyphmap };
}
