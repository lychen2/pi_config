import assert from "node:assert/strict";
import test from "node:test";

import { parseReplaceDiff } from "../result-bridge.ts";

test("parses deletion entries whose hash is unavailable", () => {
  const entries = parseReplaceDiff("-   │const LABEL_WIDTH = 9;\n+Ab1│const LABEL_WIDTH = 10;");
  assert.deepEqual(
    entries.map(({ kind, content }) => [kind, content]),
    [["remove", "const LABEL_WIDTH = 9;"], ["add", "const LABEL_WIDTH = 10;"]],
  );
});
