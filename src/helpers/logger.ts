import pc from "picocolors";

export type Logger = ReturnType<typeof createLogger>;

/** Creates a logger that prefixes every message with `[fontName]` and respects `silent`. */
export function createLogger(fontName: string, silent?: boolean) {
  const prefix = pc.dim(`[${fontName}]`);
  const isTTY = process.stdout.isTTY ?? false;
  let rewriteActive = false;

  const print = (msg: string) => {
    if (silent) return;
    if (rewriteActive) {
      process.stdout.write(`\r\x1b[K`);
      rewriteActive = false;
    }
    console.log(msg);
  };

  return {
    /** `◆ Bold label  dim detail` — marks the start of a pipeline step. */
    step: (label: string, detail?: string) =>
      print(pc.cyan("◆ ") + prefix + " " + pc.bold(label) + (detail ? "  " + pc.dim(detail) : "")),

    /** `✔ Green label  dim detail` — marks successful completion of a step. */
    done: (label: string, detail?: string) =>
      print(
        pc.green("✔ ") +
          prefix +
          " " +
          pc.green(pc.bold(label)) +
          (detail ? pc.dim("  " + detail) : ""),
      ),

    /** `  ↳ Bold label  dim detail` — marks a sub-action within a step. */
    sub: (label: string, detail?: string) =>
      print(pc.dim("  ↳ ") + prefix + " " + pc.bold(label) + (detail ? "  " + pc.dim(detail) : "")),

    /** `  [n/total]  dim src` — marks progress through a list. */
    progress: (current: number, total: number, src: string) =>
      print(pc.dim(`  [${prefix}] [${current}/${total}]`) + "  " + pc.dim(src)),

    /**
     * Like `progress` but overwrites the same terminal line each call (TTY only).
     * Any subsequent `step`, `done`, `sub`, or `progress` call automatically
     * clears the rewritten line first.
     */
    progressReplace: (current: number, total: number, name: string) => {
      if (silent) return;
      const line = pc.dim(`  [${current}/${total}]`) + "  " + pc.dim(name);
      if (isTTY) {
        rewriteActive = true;
        process.stdout.write(`\r\x1b[K${line}`);
      } else {
        print(line);
      }
    },
  };
}
