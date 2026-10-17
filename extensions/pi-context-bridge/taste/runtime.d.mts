import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export interface TasteOptions {
  role?: "main" | "sub" | "independent";
  providers?: string[] | null;
  modelIdPattern?: RegExp;
  completedResultTypes?: string[];
}
export function createTasteExtension(options?: TasteOptions): ExtensionFactory;
declare const tasteExtension: ExtensionFactory;
export default tasteExtension;
