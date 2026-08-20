import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { ensureConfigExists, loadConfig, type PolishedTuiConfig } from "./matugen-footer/config";
import { installFooter } from "./matugen-footer/footer";
import { invalidateUsageTotalsCache } from "./matugen-footer/format";
import { emptyGitStatus, readGitStatus } from "./matugen-footer/git";
import { LiveContextController as FooterLiveContextController } from "./matugen-footer/live-context";
import { readPackageVersionResult } from "./matugen-footer/package-version";
import { applyProjectRefreshToState } from "./matugen-footer/project-state";
import { createProjectRefreshScheduler, startProjectRefreshInterval } from "./matugen-footer/project-refresh";
import { readRuntimeInfo } from "./matugen-footer/runtime";
import { SessionLifecycle } from "./matugen-footer/session-lifecycle";
import { createInitialState, syncState, type FooterState } from "./matugen-footer/state";

// Compatibility exports for the existing direct footer-core fixtures.
export {
  detectGitOperation,
  parseGitPorcelain,
  ProjectRefreshScheduler,
  LiveContextController,
} from "./matugen-footer-core.mjs";

type ProjectRefreshTarget = {
  cwd: string;
  generation: number;
};

function isTuiContext(ctx: ExtensionContext): boolean {
  return ctx.hasUI && ((ctx as ExtensionContext & { mode?: string }).mode ?? "tui") === "tui";
}

export default function matugenChrome(pi: ExtensionAPI): void {
  const state: FooterState = createInitialState(emptyGitStatus());
  const lifecycle = new SessionLifecycle();
  let config: PolishedTuiConfig = loadConfig();
  let requestRender: (() => void) | undefined;
  let stopRefreshInterval = () => {};
  let previousCwd: string | undefined;
  let activeContext: ExtensionContext | undefined;
  let agentActive = false;
  let pulseController: ((enabled: boolean) => void) | undefined;

  const refresh = () => {
    if (lifecycle.isCurrent()) requestRender?.();
  };
  const liveContext = new FooterLiveContextController(lifecycle, refresh);
  const projectRefresh = createProjectRefreshScheduler<ProjectRefreshTarget>(async ({ cwd, generation }) => {
    if (!lifecycle.isCurrent(generation)) return;
    const format = config.footerFormat ?? "";
    const needCommit = config.footerSegments.gitCommit || /\$\{?(?:git_commit|commit|git_tag|tag)\b/.test(format);
    const needMetrics = config.footerSegments.gitMetrics || /\$\{?(?:git_metrics|git_added|git_deleted)\b/.test(format);
    const needPackage = config.footerSegments.packageVersion || /\$\{?(?:package|package_version)\b/.test(format);
    const [git, runtime, packageVersion] = await Promise.all([
      readGitStatus(cwd, {
        readExactTag: needCommit && config.gitCommit.showTag,
        readMetrics: needMetrics,
        ignoreSubmodules: config.gitMetrics.ignoreSubmodules,
      }),
      readRuntimeInfo(cwd),
      needPackage ? readPackageVersionResult(cwd) : Promise.resolve(undefined),
    ]);
    if (!lifecycle.isCurrent(generation)) return;
    previousCwd = applyProjectRefreshToState(state, {
      cwd,
      previousCwd,
      git,
      runtime,
      packageVersion,
    });
  }, refresh);

  const scheduleProjectRefresh = (ctx: ExtensionContext, options: { force?: boolean } = {}) => {
    const generation = lifecycle.currentGeneration();
    if (!lifecycle.isCurrent(generation)) return;
    projectRefresh.schedule({ cwd: ctx.cwd, generation }, options);
  };

  const syncFooter = (ctx: ExtensionContext, project = false) => {
    if (!lifecycle.isCurrent() || !ctx.hasUI) return;
    syncState(state, ctx, config.icons.cacheHit);
    if (project) scheduleProjectRefresh(ctx);
    refresh();
  };

  const cleanup = (ctx?: ExtensionContext) => {
    lifecycle.shutdown();
    liveContext.clear();
    projectRefresh.stop();
    stopRefreshInterval();
    stopRefreshInterval = () => {};
    requestRender = undefined;
    pulseController = undefined;
    agentActive = false;
    previousCwd = undefined;
    if (ctx && isTuiContext(ctx)) ctx.ui.setFooter(undefined);
    activeContext = undefined;
  };

  const install = (ctx: ExtensionContext) => {
    cleanup(activeContext);
    if (!isTuiContext(ctx)) return;
    lifecycle.start();
    liveContext.clear();
    state.sessionStartEpoch = Date.now();
    invalidateUsageTotalsCache();
    ensureConfigExists();
    config = loadConfig();
    activeContext = ctx;
    syncState(state, ctx, config.icons.cacheHit);
    if (!config.features.statusLine) return;

    installFooter(ctx, state, () => config, {
      setRequestRender(fn) {
        requestRender = fn;
      },
      scheduleProjectRefresh,
      getLiveContext: () => liveContext.get(),
      setPulseController(fn) {
        pulseController = fn;
      },
    });
    pulseController?.(agentActive);
    stopRefreshInterval = startProjectRefreshInterval(config.projectRefreshIntervalMs, () => {
      if (activeContext) scheduleProjectRefresh(activeContext);
    });
    refresh();
    lifecycle.defer(() => scheduleProjectRefresh(ctx, { force: true }));
  };

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_shutdown", (_event, ctx) => cleanup(ctx));
  pi.on("agent_start", (_event, ctx) => {
    agentActive = true;
    pulseController?.(true);
    liveContext.clear();
    syncFooter(ctx);
  });
  pi.on("agent_end", (_event, ctx) => {
    agentActive = false;
    pulseController?.(false);
    liveContext.clear();
    syncFooter(ctx, true);
  });
  pi.on("model_select", (_event, ctx) => {
    liveContext.clear();
    syncFooter(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => syncFooter(ctx));
  pi.on("message_update", (event) => {
    liveContext.update((event as { message?: unknown }).message ?? event);
  });
  pi.on("message_end", (event, ctx) => {
    const message = (event as { message?: { role?: string; stopReason?: string } }).message;
    if (message?.role === "assistant" && (message.stopReason === "error" || message.stopReason === "aborted")) {
      liveContext.clear();
    }
    invalidateUsageTotalsCache();
    syncFooter(ctx, true);
  });
  pi.on("tool_execution_start", (_event, ctx) => {
    liveContext.clear();
    syncFooter(ctx);
  });
  pi.on("tool_execution_end", (_event, ctx) => syncFooter(ctx, true));
  pi.on("session_compact", (_event, ctx) => {
    liveContext.clear();
    invalidateUsageTotalsCache();
    syncFooter(ctx, true);
  });
  pi.on("session_tree", (_event, ctx) => {
    liveContext.clear();
    invalidateUsageTotalsCache();
    syncFooter(ctx, true);
  });
}
