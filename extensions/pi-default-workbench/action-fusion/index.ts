/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
/**
 * Optional follow-up commands for Pi's built-in edit and write tools.
 * Adapted from SoL-Pi Action Fusion; see the workbench README and LICENSE here.
 * Schemas, argument preparation and renderers come from the host definitions.
 */
import {
  type BashToolOptions,
  createEditToolDefinition,
  createWriteToolDefinition,
  type EditToolDetails,
  type EditToolOptions,
  type ExtensionAPI,
  type ExtensionFactory,
  type WriteToolOptions,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveToolPath } from "./file-queue.ts";
import { createThenRunSchema, executeMutationThenRun, type ThenRunInput } from "./then-run.ts";

const EDIT_THEN_RUN_DESCRIPTION =
  "Command to run next on this file after the edit succeeds — e.g. run, build, start/restart, install, or check it; optional timeout in seconds. Skipped if the edit fails; a non-zero exit is reported but keeps the edit.";
const WRITE_THEN_RUN_DESCRIPTION =
  "Command to run next on this file after the write succeeds — e.g. run, build, start/restart, install, or check it; optional timeout in seconds. Skipped if the write fails; a non-zero exit is reported but keeps the write.";

export interface ActionFusionOptions {
  readonly bashOptions?: BashToolOptions;
  readonly editOptions?: EditToolOptions;
  readonly writeOptions?: WriteToolOptions;
}

function memoizeByCwd<T>(create: (cwd: string) => T): (cwd: string) => T {
  const cache = new Map<string, T>();
  return (cwd) => {
    const cached = cache.get(cwd);
    if (cached) return cached;
    const created = create(cwd);
    cache.set(cwd, created);
    return created;
  };
}

export function createActionFusionExtension(options: ActionFusionOptions = {}): ExtensionFactory {
  const baseEdit = memoizeByCwd((cwd: string) => createEditToolDefinition(cwd, options.editOptions));
  const baseWrite = memoizeByCwd((cwd: string) => createWriteToolDefinition(cwd, options.writeOptions));

  return (pi: ExtensionAPI) => {
    const editTemplate = baseEdit(process.cwd());
    const writeTemplate = baseWrite(process.cwd());
    const editParameters = Type.Object({
      ...editTemplate.parameters.properties,
      then_run: createThenRunSchema(EDIT_THEN_RUN_DESCRIPTION),
    });
    const writeParameters = Type.Object({
      ...writeTemplate.parameters.properties,
      then_run: createThenRunSchema(WRITE_THEN_RUN_DESCRIPTION),
    });

    pi.registerTool<typeof editParameters, EditToolDetails | undefined>({
      ...editTemplate,
      parameters: editParameters,
      async execute(toolCallId, input, signal, onUpdate, ctx) {
        const { then_run, ...editInput } = input as typeof input & { then_run?: ThenRunInput };
        return executeMutationThenRun({
          toolCallId,
          absolutePath: resolveToolPath(ctx.cwd, input.path),
          thenRun: then_run,
          bashOptions: options.bashOptions,
          signal,
          ctx,
          mutate: () => baseEdit(ctx.cwd).execute(toolCallId, editInput, signal, onUpdate, ctx),
        });
      },
      renderCall: (args, theme, context) => baseEdit(context.cwd).renderCall!(args, theme, context),
      renderResult: (result, options, theme, context) => baseEdit(context.cwd).renderResult!(result, options, theme, context),
    });

    pi.registerTool<typeof writeParameters, undefined>({
      ...writeTemplate,
      parameters: writeParameters,
      async execute(toolCallId, input, signal, onUpdate, ctx) {
        const { then_run, ...writeInput } = input as typeof input & { then_run?: ThenRunInput };
        return executeMutationThenRun({
          toolCallId,
          absolutePath: resolveToolPath(ctx.cwd, input.path),
          thenRun: then_run,
          bashOptions: options.bashOptions,
          signal,
          ctx,
          mutate: () => baseWrite(ctx.cwd).execute(toolCallId, writeInput, signal, onUpdate, ctx),
        });
      },
      renderCall: (args, theme, context) => baseWrite(context.cwd).renderCall!(args, theme, context),
      renderResult: (result, options, theme, context) => baseWrite(context.cwd).renderResult!(result, options, theme, context),
    });
  };
}

export default function registerActionFusion(pi: ExtensionAPI): void {
  createActionFusionExtension()(pi);
}
