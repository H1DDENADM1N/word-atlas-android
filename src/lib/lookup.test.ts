import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupCandidates } from "./lookup";

const has = (token: string, expected: string) => assert.ok(lookupCandidates(token).includes(expected), `${token} → ${expected}`);

test("an exact spelling comes first, so an entry never loses to a stem", () => {
  assert.equal(lookupCandidates("glasses")[0], "glasses");
  assert.equal(lookupCandidates("studied")[0], "studied");
});

test("regular inflections find their base", () => {
  has("studied", "study");
  has("running", "run");
  has("stopped", "stop");
  has("making", "make");
  has("happier", "happy");
  has("boxes", "box");
});

test("irregular forms use the shared table", () => {
  has("taught", "teach");
  has("children", "child");
  has("went", "go");
});

test("strips punctuation and case, and ignores noise", () => {
  assert.equal(lookupCandidates("Sentence.")[0], "sentence");
  assert.equal(lookupCandidates("—").length, 0);
  assert.deepEqual(lookupCandidates("  "), []);
});
