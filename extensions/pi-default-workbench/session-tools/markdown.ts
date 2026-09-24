import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { copyToClipboard, getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildRecords, parseExportArgs, recordsMarkdown } from "./records.ts";

export async function exportMarkdown(args: string, ctx: ExtensionContext): Promise<void> {
  const options = parseExportArgs(args);
  const entries = options.all ? ctx.sessionManager.getEntries() : ctx.sessionManager.getBranch();
  const records = buildRecords(entries, options);
  if (!records.length) { ctx.ui.notify("No matching session content to export.", "info"); return; }
  const markdown = `# Session export\n\nScope: ${options.all ? "all branches, in file order; not a single conversation" : "current branch"}\n\n${recordsMarkdown(records, options.all)}`;
  if (options.save) {
    const directory = join(getAgentDir(), "pi-sessions-extracted");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.md`);
    await writeFile(path, markdown, { encoding: "utf8", mode: 0o600, flag: "wx" });
    ctx.ui.notify(`Saved ${records.length} records to ${path}`, "info");
  } else {
    await copyToClipboard(markdown);
    ctx.ui.notify(`Copied ${records.length} records as Markdown.`, "info");
  }
}
