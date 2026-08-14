import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  decodeKittyPrintable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";
import { displayStatusLabel, orderedTasks, renderPlainTask } from "./render.ts";
import { dependencyState, type Task } from "./state.ts";

export interface TodoCenterOptions {
  getTasks: () => readonly Task[];
  requestRender: () => void;
  close: () => void;
  theme: Theme;
}

type Mode = "list" | "detail";

export class TodoCenter implements Component, Focusable {
  focused = false;
  private mode: Mode = "list";
  private selected = 0;
  private query = "";
  private lastWidth = 80;
  private readonly options: TodoCenterOptions;

  constructor(options: TodoCenterOptions) {
    this.options = options;
  }

  invalidate(): void {}
  dispose(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      if (this.mode === "detail") this.mode = "list";
      else this.options.close();
      this.options.requestRender();
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      if (this.currentTask()) this.mode = "detail";
      this.options.requestRender();
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      if (this.lastWidth >= 20) this.query = this.query.slice(0, -1);
      this.selected = 0;
      this.options.requestRender();
      return;
    }
    const input = printableInput(data);
    if (input && this.lastWidth >= 20) {
      this.query += input;
      this.selected = 0;
      this.options.requestRender();
    }
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, Math.min(width, 140));
    this.lastWidth = safeWidth;
    if (safeWidth < 20) return [fit(this.currentTask()?.subject ?? "Todo", safeWidth)];
    this.clampSelection();
    if (this.mode === "detail") return this.renderDetail(safeWidth);
    return safeWidth >= 72 ? this.renderWide(safeWidth) : this.renderList(safeWidth);
  }

  private renderList(width: number): string[] {
    const inner = width - 2;
    const tasks = this.filteredTasks();
    const rows = [this.header(inner), separator(this.options.theme, inner)];
    const selectedRows = new Set<number>();
    if (!tasks.length) {
      rows.push(fit("No matching Todo tasks", inner));
    } else {
      const start = visibleStart(this.selected, tasks.length, 8);
      for (let index = start; index < Math.min(tasks.length, start + 8); index++) {
        if (index === this.selected) selectedRows.add(rows.length);
        rows.push(this.taskRow(tasks[index]!, index === this.selected, inner));
      }
    }
    rows.push(this.filterLine(inner, tasks.length));
    rows.push(helpLine(this.options.theme, inner, ["Esc close", "Enter detail", "↑↓ task", "type filter"]));
    return card(this.options.theme, rows, width, selectedRows);
  }

  private renderWide(width: number): string[] {
    const inner = width - 2;
    const leftWidth = Math.max(30, Math.floor((inner - 3) * 0.52));
    const rightWidth = inner - leftWidth - 3;
    const tasks = this.filteredTasks();
    const start = visibleStart(this.selected, tasks.length, 8);
    const left = tasks.length
      ? tasks.slice(start, start + 8).map((task, offset) => this.taskRow(task, start + offset === this.selected, leftWidth))
      : [fit("No matching Todo tasks", leftWidth)];
    const right = this.detailLines(this.currentTask(), rightWidth);
    const rows = [this.header(inner), separator(this.options.theme, inner)];
    const selectedRows = new Set<number>();
    for (let index = 0; index < Math.max(left.length, right.length, 1); index++) {
      if (tasks.length && start + index === this.selected) selectedRows.add(rows.length);
      rows.push(`${pad(left[index] ?? "", leftWidth)} ${this.options.theme.fg("borderMuted", "│")} ${pad(right[index] ?? "", rightWidth)}`);
    }
    rows.push(this.filterLine(inner, tasks.length));
    rows.push(helpLine(this.options.theme, inner, ["Esc close", "Enter detail", "↑↓ task", "type filter"]));
    return card(this.options.theme, rows, width, selectedRows);
  }

  private renderDetail(width: number): string[] {
    const inner = width - 2;
    const rows = [fit("Todo · task detail", inner), separator(this.options.theme, inner)];
    rows.push(...this.detailLines(this.currentTask(), inner));
    rows.push(helpLine(this.options.theme, inner, ["Esc back", "↑↓ task"]));
    return card(this.options.theme, rows, width);
  }

  private header(width: number): string {
    const tasks = this.tasks();
    const completed = tasks.filter((task) => task.status === "completed").length;
    const running = tasks.filter((task) => task.status === "in_progress").length;
    const blocked = tasks.filter((task) => dependencyState(task, tasks) === "blocked").length;
    return fit(
      `Todo ${this.options.theme.fg("success", String(completed))}/${tasks.length} done · ` +
      `${this.options.theme.fg("warning", String(running))} active` +
      `${blocked ? ` · ${this.options.theme.fg("error", String(blocked))} blocked` : ""}`,
      width,
    );
  }

  private taskRow(task: Task, selected: boolean, width: number): string {
    const row = `${selected ? "›" : " "} ${renderPlainTask(task, this.tasks())}`;
    return fit(task.status === "in_progress" ? this.options.theme.bold(row) : row, width);
  }

  private filterLine(width: number, count: number): string {
    return fit(`Filter: ${this.query || "type to filter"} · ${count} task${count === 1 ? "" : "s"}`, width);
  }

  private detailLines(task: Task | undefined, width: number): string[] {
    if (!task) return [fit("No task selected", width)];
    const lines = [
      fit(`#${task.id} · ${displayStatusLabel(task, this.tasks())}`, width),
      fit(task.subject, width),
    ];
    if (task.owner) lines.push(fit(`Owner: @${task.owner}`, width));
    if (task.description) lines.push(fit(`Description: ${task.description}`, width));
    if (task.activeForm) lines.push(fit(`Active: ${task.activeForm}`, width));
    if (task.blockedBy?.length) lines.push(fit(`Blocked by: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`, width));
    return lines;
  }

  private tasks(): Task[] {
    return orderedTasks(this.options.getTasks());
  }

  private filteredTasks(): Task[] {
    const query = this.query.trim().toLocaleLowerCase();
    return this.tasks().filter((task) => !query || [
      String(task.id),
      task.subject,
      task.description ?? "",
      task.owner ?? "",
      task.activeForm ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }

  private currentTask(): Task | undefined {
    return this.filteredTasks()[this.selected];
  }

  private move(delta: number): void {
    const length = this.filteredTasks().length;
    this.selected = length ? (this.selected + delta + length) % length : 0;
    this.options.requestRender();
  }

  private clampSelection(): void {
    this.selected = Math.min(this.selected, Math.max(0, this.filteredTasks().length - 1));
  }
}

function printableInput(data: string): string {
  const input = decodeKittyPrintable(data) ?? data;
  return input.length > 0 && !input.includes("\x1b") && [...input].every((character) => character >= " " && character !== "\x7f")
    ? input
    : "";
}

function visibleStart(selected: number, length: number, size: number): number {
  return Math.max(0, Math.min(selected - Math.floor(size / 2), Math.max(0, length - size)));
}

function fit(line: string, width: number): string {
  return truncateToWidth(line, Math.max(1, width), "...");
}

function pad(line: string, width: number): string {
  return `${fit(line, width)}${" ".repeat(Math.max(0, width - visibleWidth(fit(line, width))))}`;
}

function separator(theme: Theme, width: number): string {
  return theme.fg("borderMuted", "─".repeat(Math.max(1, width)));
}

function helpLine(theme: Theme, width: number, segments: string[]): string {
  return fit(theme.fg("dim", segments.join(" · ")), width);
}

function card(theme: Theme, rows: string[], width: number, selectedRows: ReadonlySet<number> = new Set()): string[] {
  const edge = "─".repeat(Math.max(0, width - 2));
  const border = (value: string) => theme.bg("customMessageBg", theme.fg("borderMuted", value));
  const output = [border(`╭${edge}╮`)];
  rows.forEach((row, index) => {
    const background = selectedRows.has(index) ? "selectedBg" : "customMessageBg";
    output.push(theme.bg(background, pad(` ${row}`, width)));
  });
  output.push(border(`╰${edge}╯`));
  return output;
}
