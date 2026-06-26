# svg-fonts

Generate icon fonts and glyphmaps from SVG icons — from a local folder, a single SVG file, an HTTPS URL, or a Git repository.

## Features

- **Multiple input sources** — local directory, single `.svg` file, HTTPS SVG URL, or any GitHub repo
- **Merge sources** — combine icons from multiple inputs into a single font
- **GitHub subdirectory support** — point directly at a `/tree/<branch>/<path>` URL
- **SVG auto-fixing** — broken or stroke-only SVGs are automatically normalized via [oslllo-svg-fixer](https://github.com/nicholidev/oslllo-svg-fixer)
- **SVG optimization** — each SVG is run through SVGO before glyph generation
- **Glyphmap generation** — JSON glyphmap file mapping icon names to Unicode code points (useful for React Native)
- **TTF font output** — generates a `.ttf` font file alongside the glyphmap
- **Programmatic API** — use as a library in your own build scripts

## Requirements

- Node.js **≥ 24**

## Installation

```bash
npm install svg-fonts
```

Or run directly with `npx`:

```bash
npx svg-fonts --input ./icons --name my-icons --output ./dist
```

## CLI Usage

```
svg-fonts [OPTIONS]
```

### Options

| Flag                     | Description                                                       | Default                     |
| ------------------------ | ----------------------------------------------------------------- | --------------------------- |
| `--input <source>`       | SVG source — local dir/file, HTTPS SVG URL, or GitHub repo URL    | _required_                  |
| `--name <fontName>`      | Name for the generated font                                       | _required_                  |
| `--output <dir>`         | Output directory                                                  | source dir (local dir only) |
| `--glyphmap-dir <dir>`   | Directory for glyphmap JSON                                       | same as `--output`          |
| `--font-height <n>`      | Font height for svgicons2svgfont                                  | `1000`                      |
| `--trace-resolution <n>` | SVG fixer trace resolution                                        | `800`                       |
| `--fix` / `--no-fix`     | Run the SVG-fixing step                                           | `true`                      |
| `--normalize`            | Normalize icons                                                   | `false`                     |
| `--silent`               | Suppress logging                                                  | `false`                     |

### Examples

**Generate from a local folder:**

```bash
svg-fonts --input ./svg-icons --name my-icons --output ./dist
```

**Generate from a GitHub repository:**

```bash
svg-fonts \
  --input https://github.com/lucide-icons/lucide/tree/main/icons \
  --name lucide \
  --output ./dist
```

## Programmatic API

```ts
import { generateFont } from "svg-fonts";

const { glyphmap, ttfBuffer } = await generateFont({
  input: "./svg-icons",
  fontName: "my-icons",
  output: "./dist",
});

console.log(glyphmap);
// { "home": 59905, "star": 59906, "arrow-right": 59907 }
console.log(ttfBuffer); // Buffer containing the TTF font
```

### `generateFont(options)`

Returns `Promise<{ glyphmap: Record<string, number>; ttfBuffer: Buffer }>` — the glyphmap (icon name → Unicode code point) and the raw TTF font as a `Buffer`.

#### Options

| Option            | Type                 | Default          | Description                                                    |
| ----------------- | -------------------- | ---------------- | -------------------------------------------------------------- |
| `input`           | `string \| string[]` | _required_       | SVG source(s) — local path, HTTPS URL, or GitHub URL           |
| `fontName`        | `string`             | `"icon-font"`    | Name of the generated font                                     |
| `output`          | `string`             | —                | Output directory (required for all non-local-dir inputs)       |
| `glyphmapDir`     | `string`             | same as `output` | Directory for glyphmap JSON                                    |
| `fixSvg`          | `boolean`            | `true`           | Run the SVG fixer before generating                            |
| `optimizeSvg`     | `boolean`            | `true`           | Run SVGO optimization on each SVG before generating            |
| `traceResolution` | `number`             | `800`            | Trace resolution for SVG fixer                                 |
| `fontHeight`      | `number`             | `1000`           | Font height for svgicons2svgfont                               |
| `normalize`       | `boolean`            | `false`          | Normalize icons                                                |
| `cwd`             | `string`             | caller's dir     | Working directory for resolving relative paths                 |
| `silent`          | `boolean`            | `false`          | Suppress console logging                                       |

## Supported Input Sources

| Source              | Example                                                    |
| ------------------- | ---------------------------------------------------------- |
| Local directory     | `./icons`                                                  |
| Local SVG file      | `./logo.svg`                                               |
| HTTPS SVG URL       | `https://example.com/icon.svg`                             |
| GitHub repo         | `https://github.com/user/repo`                             |
| GitHub subdirectory | `https://github.com/user/repo/tree/main/icons`             |
| Multiple sources    | `["./icons", "https://github.com/user/repo/tree/main/icons"]` |

> **Note:** Only GitHub HTTPS URLs are supported for remote repositories. SSH (`git@`) and non-GitHub git URLs are not supported.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run fmt
```

## License

[MIT](./LICENSE) © [Piyush Sarkar](https://github.com/piyushsarkar)
