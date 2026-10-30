import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AXONHUB_PROVIDER = "manager";
const AXONHUB_HOST = "cpa.zonazcy.xyz";

function isAxonHubModel(model: { provider?: string; baseUrl?: string } | undefined): boolean {
  if (model?.provider !== AXONHUB_PROVIDER || !model.baseUrl) return false;
  try {
    return new URL(model.baseUrl).hostname.toLowerCase() === AXONHUB_HOST;
  } catch {
    return false;
  }
}

export class AxonHubAffinity {
  private readonly traceIds = new Map<string, string>();

  beginTurn(sessionId: string): string | undefined {
    if (!sessionId) return undefined;
    const traceId = randomUUID();
    this.traceIds.set(sessionId, traceId);
    return traceId;
  }

  getTraceId(sessionId: string): string | undefined {
    return this.traceIds.get(sessionId);
  }

  endTurn(sessionId: string): void {
    this.traceIds.delete(sessionId);
  }
}

export function registerAxonHubAffinity(pi: ExtensionAPI): void {
  const affinity = new AxonHubAffinity();

  pi.on("agent_start", (_event, ctx) => {
    affinity.beginTurn(ctx.sessionManager.getSessionId());
  });

  pi.on("agent_end", (_event, ctx) => {
    affinity.endTurn(ctx.sessionManager.getSessionId());
  });

  pi.on("session_shutdown", (_event, ctx) => {
    affinity.endTurn(ctx.sessionManager.getSessionId());
  });

  pi.on("before_provider_headers", (event, ctx) => {
    if (!isAxonHubModel(ctx.model)) return;
    const sessionId = ctx.sessionManager.getSessionId();
    if (!sessionId) return;

    event.headers["AH-Thread-Id"] = sessionId;
    const traceId = affinity.getTraceId(sessionId);
    if (traceId) event.headers["AH-Trace-Id"] = traceId;
  });
}

export { isAxonHubModel };

export default registerAxonHubAffinity;
