// Unit tests for the ClearDraft AI estimator and humanizer.
// Run with: node --test tests/ai_features.test.js
// (GitHub Actions runs this alongside the Python static-site tests.)

const test = require("node:test");
const assert = require("node:assert/strict");

const detector = require("../apps/web/ai-detector.js");
const humanizer = require("../apps/web/humanizer.js");

const AI_SAMPLE = "Moreover, it is important to note that in today's fast-paced world, "
  + "organizations must leverage cutting-edge technology to navigate the ever-evolving "
  + "landscape of digital transformation. Furthermore, the seamless integration of "
  + "artificial intelligence underscores a pivotal shift in how teams operate. "
  + "Additionally, it is worth noting that the intricate tapestry of modern systems "
  + "demands a multifaceted approach. In conclusion, leaders who delve into these tools "
  + "will foster a vibrant culture of innovation.";

const HUMAN_SAMPLE = "I started the job in March, and honestly? I had no idea what I was doing. "
  + "My first week was a mess — wrong branch, broken build, and a deploy I had to roll "
  + "back on Friday. But my teammate Priya sat with me for an hour and walked me through "
  + "the pipeline. I've gotten faster since, though I still double-check the release notes. "
  + "Some days are quiet. Others, like last Tuesday, everything breaks at once and you're "
  + "just trying to keep the tests green.";

test("detector scores AI-typical prose high", () => {
  const result = detector.estimateAiLikelihood(AI_SAMPLE);
  assert.ok(result, "expected a score");
  assert.ok(result.score > 50, `expected > 50, got ${result.score}`);
  assert.ok(result.markers.length >= 10, `expected many markers, got ${result.markers.length}`);
  assert.equal(result.signals.length, 5);
});

test("detector scores varied human prose low", () => {
  const result = detector.estimateAiLikelihood(HUMAN_SAMPLE);
  assert.ok(result, "expected a score");
  assert.ok(result.score <= 20, `expected <= 20, got ${result.score}`);
});

test("detector refuses short text", () => {
  assert.equal(detector.estimateAiLikelihood(""), null);
  assert.equal(detector.estimateAiLikelihood("Too short to score."), null);
});

test("humanizer brings AI-typical prose to the 10% target", () => {
  const result = humanizer.humanize(AI_SAMPLE, detector.estimateAiLikelihood);
  assert.ok(result.beforeScore > 50, `expected high before score, got ${result.beforeScore}`);
  assert.ok(result.afterScore <= 10, `expected <= 10 after, got ${result.afterScore}`);
  assert.equal(result.reachedTarget, true);
  assert.ok(result.passes >= 1 && result.passes <= humanizer.MAX_PASSES);
});

test("humanizer preserves content words and changes visibly", () => {
  const result = humanizer.humanize(AI_SAMPLE, detector.estimateAiLikelihood);
  for (const word of ["organizations", "technology", "teams", "leaders", "innovation"]) {
    assert.ok(result.text.toLowerCase().includes(word), `lost content word: ${word}`);
  }
  assert.ok(result.changedPercent > 0, "expected some words to change");
  assert.ok(!result.text.includes("delve"), "AI marker should be rewritten");
  assert.ok(!result.text.includes("Moreover"), "AI marker should be rewritten");
});

test("humanizer leaves already-human prose nearly untouched", () => {
  const result = humanizer.humanize(HUMAN_SAMPLE, detector.estimateAiLikelihood);
  assert.ok(result.afterScore <= 20, `expected low score, got ${result.afterScore}`);
  assert.ok(result.changedPercent < 30, `expected light edits, got ${result.changedPercent}%`);
});
