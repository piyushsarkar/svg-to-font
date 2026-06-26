import { Readable } from "stream";
import svg2ttf from "svg2ttf";
import { SVGIcons2SVGFontStream, type SVGIcons2SVGFontStreamOptions } from "svgicons2svgfont";
import type { Glyph } from "./buildGlyphs";

/**
 * Stream glyphs through `svgicons2svgfont` to produce an SVG font string
 */
export async function createSvgFont(
  glyphs: Glyph[],
  options: Partial<SVGIcons2SVGFontStreamOptions>,
): Promise<string> {
  const svgFontString = await new Promise<string>((resolve, reject) => {
    const fontStream = new SVGIcons2SVGFontStream({
      fontName: options.fontName,
      fontHeight: options.fontHeight,
      normalize: options.normalize,
    });

    const chunks: string[] = [];
    fontStream.on("data", (chunk: Buffer | string) =>
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8")),
    );
    fontStream.on("end", () => resolve(chunks.join("")));
    fontStream.on("error", reject);

    for (const glyph of glyphs) {
      const glyphStream = Readable.from([glyph.svgContent]) as Readable & {
        metadata?: { unicode: string[]; name: string };
      };
      glyphStream.metadata = {
        unicode: [String.fromCodePoint(glyph.unicode)],
        name: glyph.name,
      };
      fontStream.write(glyphStream);
    }

    fontStream.end();
  });

  return svgFontString;
}

/**
 * Create the TTF font buffer from the SVG font string.
 */
export async function createTTF(svgFontString: string): Promise<Buffer> {
  const ttf = svg2ttf(svgFontString, { ts: 0 });
  return Buffer.from(ttf.buffer);
}
