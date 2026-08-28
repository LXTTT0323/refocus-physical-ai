import assert from "node:assert/strict";
import test from "node:test";
import { HeadDirectionFilter } from "../web-monitor/public/head-direction-filter.js";

test("brief toward-screen jitter does not clear a sustained head turn", () => {
  const filter = new HeadDirectionFilter();
  assert.equal(filter.update("toward_screen", 0), "toward_screen");
  assert.equal(filter.update("right", 100), "toward_screen");
  assert.equal(filter.update("right", 600), "right");
  assert.equal(filter.update("toward_screen", 1_000), "right");
  assert.equal(filter.update("right", 1_500), "right");
  assert.equal(filter.update("toward_screen", 2_000), "right");
  assert.equal(filter.update("toward_screen", 3_799), "right");
  assert.equal(filter.update("toward_screen", 3_800), "toward_screen");
});

test("a short accidental turn never becomes the stable direction", () => {
  const filter = new HeadDirectionFilter();
  filter.update("toward_screen", 0);
  assert.equal(filter.update("left", 100), "toward_screen");
  assert.equal(filter.update("toward_screen", 400), "toward_screen");
});
