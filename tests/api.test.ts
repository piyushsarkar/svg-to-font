import fs from "fs/promises";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import { generateFont } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_ICONS = path.join(__dirname, "fixtures/icons");
const OUTPUT_DIR = path.join(__dirname, "output");
const OUTPUT = path.join(OUTPUT_DIR, "generateFont");
const DEFAULT_FONT_NAME = "icon-font";

/** Serve a single SVG file over HTTP and return { url, close }. */
const serveSvg = (filePath: string): Promise<{ url: string; close: () => void }> =>
  new Promise((resolve, reject) => {
    const server = http.createServer(async (_, res) => {
      const content = await fs.readFile(filePath, "utf-8");
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(content);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Failed to get server address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/home.svg`,
        close: () => server.close(),
      });
    });
  });

describe("generateFont", () => {
  it("throws when the source path does not exist", async () => {
    await expect(generateFont({ input: "/non/existent/path", output: OUTPUT })).rejects.toThrow(
      "Source path does not exist",
    );
  });

  it("throws when the source is a non-SVG file", async () => {
    const tmpFile = path.join(__dirname, "fixtures", "test.txt");
    await expect(generateFont({ input: tmpFile, output: OUTPUT })).rejects.toThrow(
      "Source file must be an .svg file",
    );
  });

  it("generates a font from a directory of SVGs", async () => {
    const { glyphmap } = await generateFont({ input: SVG_ICONS, output: OUTPUT });
    expect(typeof glyphmap).toBe("object");
    expect(Object.keys(glyphmap).length).toBeGreaterThan(0);

    // the glyphmap JSON file must be written to output
    const raw = await fs.readFile(path.join(OUTPUT, `${DEFAULT_FONT_NAME}.json`), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });

  it("glyphmap keys match the SVG file names", async () => {
    const { glyphmap } = await generateFont({ input: SVG_ICONS, output: OUTPUT });

    const expectedKeys = ["arrow-right", "home", "star"];
    for (const key of expectedKeys) {
      expect(glyphmap).toHaveProperty(key);
    }

    // every value in the glyphmap must be a number
    for (const val of Object.values(glyphmap)) {
      expect(typeof val).toBe("number");
    }
  });

  it("generates a font from a single SVG file", async () => {
    const { glyphmap } = await generateFont({
      input: path.join(SVG_ICONS, "home.svg"),
      fontName: "single-icon",
      output: OUTPUT,
    });

    expect(Object.keys(glyphmap)).toContain("home");
  });

  it("writes the glyphmap and font to separate directories", async () => {
    const glyphmapDir = path.join(OUTPUT, "separate-dir/glyphmap");
    const outDir = path.join(OUTPUT, "separate-dir/font");
    await fs.mkdir(glyphmapDir, { recursive: true });

    const { glyphmap } = await generateFont({ input: SVG_ICONS, output: outDir, glyphmapDir });

    const raw = await fs.readFile(path.join(glyphmapDir, `${DEFAULT_FONT_NAME}.json`), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });
});

describe("generateFont (HTTPS SVG URL)", () => {
  it("fetches a remote SVG and generates a font from it", async () => {
    const { url, close } = await serveSvg(path.join(SVG_ICONS, "home.svg"));
    try {
      const { glyphmap } = await generateFont({
        input: url,
        fontName: "url-icon",
        output: OUTPUT,
      });

      expect(Object.keys(glyphmap)).toContain("home");
      const raw = await fs.readFile(path.join(OUTPUT, "url-icon.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(glyphmap);
    } finally {
      close();
    }
  });

  it("throws when the remote URL returns a non-200 status", async () => {
    // Use a local server that always 404s
    const server = http.createServer((_, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}/missing.svg`;

    try {
      await expect(
        generateFont({ input: url, fontName: "err-icon", output: OUTPUT }),
      ).rejects.toThrow("Failed to fetch SVG");
    } finally {
      server.close();
    }
  });
});

describe("generateFont (multiple sources)", () => {
  it("merges icons from two local directories into a single font", async () => {
    // Build two separate dirs — each with a different subset of the fixture SVGs.
    const dirA = path.join(OUTPUT_DIR, "multi-src", "dir-a");
    const dirB = path.join(OUTPUT_DIR, "multi-src", "dir-b");
    const outDir = path.join(OUTPUT_DIR, "multi-src", "out");
    await fs.rm(path.join(OUTPUT_DIR, "multi-src"), { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(dirA, { recursive: true }),
      fs.mkdir(dirB, { recursive: true }),
      fs.mkdir(outDir, { recursive: true }),
    ]);

    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirA, "home.svg"));
    await fs.copyFile(path.join(SVG_ICONS, "star.svg"), path.join(dirB, "star.svg"));

    const { glyphmap } = await generateFont({
      input: [dirA, dirB],
      fontName: "merged-icons",
      output: outDir,
      fixSvg: false,
    });

    expect(glyphmap).toHaveProperty("home");
    expect(glyphmap).toHaveProperty("star");
    expect(typeof glyphmap["home"]).toBe("number");
    expect(typeof glyphmap["star"]).toBe("number");

    const raw = await fs.readFile(path.join(outDir, "merged-icons.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });

  it("deduplicates icons with the same filename across sources", async () => {
    // Both dirs have a file named home.svg — flattenSvgs renames the second to home-1.svg.
    const dirA = path.join(OUTPUT_DIR, "multi-src-dedup", "dir-a");
    const dirB = path.join(OUTPUT_DIR, "multi-src-dedup", "dir-b");
    const outDir = path.join(OUTPUT_DIR, "multi-src-dedup", "out");
    await fs.rm(path.join(OUTPUT_DIR, "multi-src-dedup"), { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(dirA, { recursive: true }),
      fs.mkdir(dirB, { recursive: true }),
      fs.mkdir(outDir, { recursive: true }),
    ]);

    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirA, "home.svg"));
    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirB, "home.svg"));

    const { glyphmap } = await generateFont({
      input: [dirA, dirB],
      fontName: "dedup-icons",
      output: outDir,
      fixSvg: false,
    });

    expect(glyphmap).toHaveProperty("home");
    // Duplicate gets the -1 suffix
    expect(glyphmap).toHaveProperty("home-1");
  });
});
