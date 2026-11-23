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

test("detector scores a single long sentence instead of refusing it", () => {
  const one = "The quarterly report shows that revenue grew by twelve percent while "
    + "operating costs remained flat across all three regions, and the finance team expects "
    + "this trend to continue into the next quarter as new contracts take effect and the "
    + "sales pipeline expands with several large enterprise deals already in late-stage "
    + "negotiation with procurement teams.";
  const result = detector.estimateAiLikelihood(one);
  assert.ok(result, "expected a score for a single sentence");
  assert.equal(result.sentences, 1);
  assert.ok(result.score <= 20, `expected a low score, got ${result.score}`);
});

test("detector is gentler on short human text than before", () => {
  const mixed = "I think the plan is solid. Moreover, we should ship it this week. "
    + "The team worked hard, and I'm proud of what we built together. Let's get it out "
    + "the door and see what users say.";
  const result = detector.estimateAiLikelihood(mixed);
  assert.ok(result, "expected a score");
  assert.ok(result.score < 31, `expected softer than the old 31, got ${result.score}`);
});

test("humanizer keeps quoted dialogue intact", () => {
  const dialogue = 'She said, "Do not worry about the deadline, it is not important right now." '
    + "He replied that the report was crucial and they could not delay it any further. "
    + "The team waited for an answer while the clock kept ticking on the wall.";
  const result = humanizer.humanize(dialogue, detector.estimateAiLikelihood);
  assert.ok(!result.text.includes('; "'), `mangled quote artifact: ${result.text}`);
  const quoteCount = (result.text.match(/"/g) || []).length;
  assert.equal(quoteCount % 2, 0, `unbalanced quotes: ${result.text}`);
  assert.ok(result.text.includes('"Don\'t worry'), `quote should stay attached: ${result.text}`);
  assert.ok(result.afterScore <= 10, `expected <= 10 after, got ${result.afterScore}`);
});

test("humanizer leaves already-human prose nearly untouched", () => {
  const result = humanizer.humanize(HUMAN_SAMPLE, detector.estimateAiLikelihood);
  assert.ok(result.afterScore <= 20, `expected low score, got ${result.afterScore}`);
  assert.ok(result.changedPercent < 30, `expected light edits, got ${result.changedPercent}%`);
});
