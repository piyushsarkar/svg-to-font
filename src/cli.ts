#!/usr/bin/env -S node --disable-warning=DEP0040
import { defineCommand, runMain } from "citty";
import pc from "picocolors";
import { generateFont } from "./generate";

const main = defineCommand({
  meta: {
    name: "icon-fonts-generator",
    description: "Generate icon fonts from SVG directories, files, URLs, or repos",
  },
  args: {
    input: {
      type: "string",
      description:
        "SVG source — local dir/file, HTTPS SVG URL, or GitHub/git repo URL (repeatable, paired with --name)",
      valueHint: "source",
    },
    name: {
      type: "string",
      description: "Font name paired with each --input (repeatable)",
      valueHint: "fontName",
    },
    output: {
      type: "string",
      description: "Output directory (default: source folder / cwd)",
      valueHint: "dir",
    },
    glyphmapDir: {
      type: "string",
      description: "Glyphmap directory (default: <out-dir>)",
      valueHint: "dir",
    },
    traceResolution: {
      type: "string",
      description: `SVG fixer trace resolution (default: 800)`,
      valueHint: "n",
    },
    fontHeight: {
      type: "string",
      description: `Font height (default: 1000)`,
      valueHint: "n",
    },
    fix: {
      type: "boolean",
      description: "Run the SVG-fixing step",
      negativeDescription: "Skip the SVG-fixing step",
      default: true,
    },
    normalize: {
      type: "boolean",
      description: "Normalize icons",
      default: false,
    },
    silent: {
      type: "boolean",
      description: "Suppress logging",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.input) {
      console.error(pc.red("No --input provided.") + " Pass --input and --name.");
      process.exitCode = 1;
      return;
    }

    if (!args.name) {
      console.error(pc.red("No --name provided.") + " Pass a font name with --name.");
      process.exitCode = 1;
      return;
    }

    try {
      return await generateFont({
        input: args.input,
        fontName: args.name,
        output: args.output,
        glyphmapDir: args.glyphmapDir,
        traceResolution: args.traceResolution ? Number(args.traceResolution) : undefined,
        fontHeight: args.fontHeight ? Number(args.fontHeight) : undefined,
        fixSvg: args.fix,
        normalize: args.normalize,
        silent: args.silent,
      });
    } catch (err) {
      console.error(pc.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  },
});

runMain(main);
