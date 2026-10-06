import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import portrait from "./portrait/src/index.ts";
import { dashboard } from "./dashboard-state.ts";

export default function portraitDashboard(pi: ExtensionAPI): void {
  if (Number(process.env.PI_TEAMMATE_DEPTH ?? 0) > 0) return;
  portrait(pi, {
    mount: (redraw) => dashboard.mount(redraw),
    unmount: () => dashboard.unmount(),
    modelLine: () => dashboard.modelLine?.(),
    renderDetails(width, theme) {
      const working = wrapTextWithAnsi(dashboard.renderWorking() ?? theme.fg("dim", "● 就绪"), width);
      const lines = working.length > 2 ? [working[0], truncateToWidth(working.slice(1).join(" "), width, "…")] : working;
      const plan = dashboard.panels.get("plan");
      const agents = dashboard.panels.get("agents");
      // Nine content rows keep the dashboard compact. Each panel owns its
      // omission count and preserves the current step or active agents.
      if (plan) lines.push(...plan.render(width, agents ? 4 : 9 - lines.length));
      if (agents) lines.push(...agents.render(width, 9 - lines.length));
      return lines.map(line => truncateToWidth(line, width, "…"));
    },
    invalidate() {
      for (const panel of dashboard.panels.values()) panel.invalidate();
    },
  });
}
