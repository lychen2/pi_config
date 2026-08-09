export type GitStatus = {
  dirty: boolean;
  conflicts: boolean;
  ahead: number;
  behind: number;
  operation?: "REBASING" | "MERGING" | "CHERRY-PICKING" | "REVERTING" | "BISECTING";
  operationLabel?: string;
};

export type LiveContext = {
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export function parseGitPorcelain(output: string): GitStatus;
export function detectGitOperation(paths: Record<string, string | undefined>): Pick<GitStatus, "operation" | "operationLabel">;
export function readGitOperation(cwd: string): Promise<Pick<GitStatus, "operation" | "operationLabel">>;

export class ProjectRefreshScheduler<T> {
  constructor(
    throttleMs: number,
    read: (generation: number) => Promise<T | undefined>,
    apply: (value: T, generation: number) => void,
  );
  request(): void;
  stop(): void;
}

export class LiveContextController {
  constructor(refresh: () => void);
  update(value: LiveContext): void;
  get(): LiveContext | undefined;
  clear(): void;
  stop(): void;
}
