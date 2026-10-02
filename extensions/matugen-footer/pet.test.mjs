import assert from "node:assert/strict";
import test from "node:test";
import { PET_GAP, PET_WIDTH, petFrame } from "./pet.ts";

test("ASCII cat keeps a fixed width while wagging, blinking, or sleeping", () => {
  const frames = Array.from({ length: 96 }, (_, tick) => petFrame(true, tick));
  for (const frame of [...frames, petFrame(false, 0), petFrame(true, 31, true)]) {
    assert.equal(frame.length, PET_WIDTH);
    assert.match(frame, /^[\x20-\x7e]+$/, "pet must remain plain ASCII");
  }
  assert.equal(PET_GAP, 2);
  assert.ok(new Set(frames).size > 2, "busy frames must contain tail motion");
  assert.equal(petFrame(true, 31), "=-.-=/ ", "brief blink retains tail position");
  assert.equal(petFrame(true, 32), "=^.^=/ ", "eyes open on the next frame");
  assert.equal(petFrame(false, 32), "=-.-= z");
  assert.equal(petFrame(true, 0, true), petFrame(true, 31, true), "reduced motion remains static");
});
