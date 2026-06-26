declare module "oslllo-svg-fixer" {
  const SVGFixer: {
    fixString(svg: string | Buffer, resolution?: number): Promise<string>;
  };
  export default SVGFixer;
}

declare module "svg2ttf" {
  interface Svg2TtfOptions {
    ts?: number;
    version?: string;
    copyright?: string;
    description?: string;
    id?: string;
    familyname?: string;
    url?: string;
  }
  export default function svg2ttf(
    svgFont: string,
    options?: Svg2TtfOptions,
  ): { buffer: ArrayLike<number> };
}
