import { readFile, rm } from "node:fs/promises";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

type AnyTool = ToolDefinition<any, any>;
type PreviewDetails = { paths?: unknown } | undefined;
type PngValidation = { paths: string[]; invalid: string[] };

export async function validatePngPaths(details: PreviewDetails): Promise<PngValidation> {
  const paths = Array.isArray(details?.paths)
    ? details.paths.filter((path): path is string => typeof path === "string" && path.length > 0)
    : [];
  const invalid: string[] = [];
  for (const path of paths) {
    try {
      const bytes = await readFile(path);
      if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        invalid.push(path);
      }
    } catch {
      invalid.push(path);
    }
  }
  return { paths, invalid };
}

async function removeArtifacts(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true })));
}

export function adaptPreviewTool(tool: AnyTool): AnyTool {
  if (tool.name !== "preview_export") return tool;
  const execute = tool.execute;
  return {
    ...tool,
    async execute(...args: Parameters<typeof execute>) {
      const params = args[1] as Parameters<typeof execute>[1] & { format?: unknown; open?: unknown };
      if (params.format !== "png") return execute(...args);

      const executeWithParams = (nextParams: Parameters<typeof execute>[1]) => execute(
        args[0], nextParams, args[2], args[3], args[4],
      );
      const requestedOpen = params.open === true;
      const validationParams = requestedOpen ? { ...params, open: false } : params;

      let result = await executeWithParams(validationParams);
      let validation = await validatePngPaths(result.details as PreviewDetails);
      if (validation.paths.length === 0 || validation.invalid.length > 0) {
        await removeArtifacts(validation.paths);
        result = await executeWithParams(validationParams);
        validation = await validatePngPaths(result.details as PreviewDetails);
      }

      if (validation.paths.length === 0 || validation.invalid.length > 0) {
        await removeArtifacts(validation.paths);
        throw new Error(
          `Preview PNG validation failed after cache retry: ${validation.invalid.join(", ") || "no output paths"}`,
        );
      }

      if (!requestedOpen) return result;
      const opened = await executeWithParams(params);
      const openedValidation = await validatePngPaths(opened.details as PreviewDetails);
      if (openedValidation.paths.length === 0 || openedValidation.invalid.length > 0) {
        await removeArtifacts(openedValidation.paths);
        throw new Error(
          `Preview PNG validation failed before opening: ${openedValidation.invalid.join(", ") || "no output paths"}`,
        );
      }
      return opened;
    },
  } as AnyTool;
}
