import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function registerCodeOutline(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "code_outline",
    label: "Code outline",
    description: "Read a local TypeScript/JavaScript file's function, class, type and method signatures with line ranges, without function bodies. Use before reading large source files. Syntax only, no call graph or type resolution. Paginate using offset; read the indicated lines for implementation details.",
    parameters: Type.Object({
      path: Type.String({ description: "Source file path relative to the working directory or absolute" }),
      offset: Type.Optional(Type.Integer({ minimum: 0, description: "Zero-based declaration offset; default 0" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "Maximum declarations; default 80" })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const { outlineFile } = await import("./outline.ts");
      const result = await outlineFile(params, ctx.cwd, signal);
      const { text, ...details } = result;
      return { content: [{ type: "text", text }], details };
    },
  });
}
