// ClearDraft humanizer.
//
// Rule-based rewrites that target exactly the signals the local AI estimator
// weighs (see docs/detector-analysis.md): AI-typical phrases, uniform
// sentence lengths, and missing contractions. It never invents facts or
// content — it only restates the same sentences more unevenly and plainly.
//
// humanize(text, estimateFn) runs passes until the estimated AI likelihood
// is at or under TARGET_SCORE (10%), or until MAX_PASSES is reached, and
// reports the achieved score honestly either way.
//
// Works in the browser (window.ClearDraftAI) and in Node (module.exports).

(function (root) {
  "use strict";

  var TARGET_SCORE = 10;
  var MAX_PASSES = 3;

  // Plain replacements for the estimator's AI markers. Longer phrases first
  // so "it is important to note that" is removed whole, not half-rewritten.
  var PHRASE_REPLACEMENTS = [
    ["in today's fast-paced world", "these days"],
    ["in today's digital age", "today"],
    ["it is important to note that", ""],
    ["it's important to note that", ""],
    ["it is worth noting that", ""],
    ["a testament to", "a sign of"],
    ["in the realm of", "in"],
    ["shed light on", "explain"],
    ["when it comes to", "for"],
    ["in a world where", "where"],
    ["delve into", "look into"],
    ["in conclusion", "so"],
    ["in summary", "to sum up"],
    ["in addition", "also"],
    ["moreover", "also"],
    ["furthermore", "also"],
    ["additionally", "also"],
    ["notably", ""],
    ["firstly", "first"],
    ["secondly", "second"],
    ["delve", "dig"],
    ["tapestry", "mix"],
    ["ever-evolving", "changing"],
    ["cutting-edge", "new"],
    ["multifaceted", "varied"],
    ["underscores", "shows"],
    ["leverage", "use"],
    ["foster", "support"],
    ["embark", "start"],
    ["meticulous", "careful"],
    ["intricate", "detailed"],
    ["seamless", "smooth"],
    ["pivotal", "key"],
    ["crucial", "important"],
    ["vital", "important"],
    ["boasts", "has"],
    ["nestled", "set"],
    ["vibrant", "lively"],
    ["navigate", "handle"]
  ];

  var FORMAL_WORDS = [
    ["utilize", "use"],
    ["facilitate", "help"],
    ["assistance", "help"],
    ["commence", "start"],
    ["terminate", "end"],
    ["purchase", "buy"],
    ["endeavor", "try"]
  ];

  // Full form -> contraction. Applied after phrase rewrites so removed
  // filler ("it is important to note that") is not half-contracted first.
  var CONTRACTIONS = [
    ["cannot", "can't"],
    ["will not", "won't"],
    ["do not", "don't"],
    ["does not", "doesn't"],
    ["did not", "didn't"],
    ["is not", "isn't"],
    ["are not", "aren't"],
    ["was not", "wasn't"],
    ["were not", "weren't"],
    ["has not", "hasn't"],
    ["have not", "haven't"],
    ["would not", "wouldn't"],
    ["could not", "couldn't"],
    ["should not", "shouldn't"],
    ["i am", "I'm"],
    ["we are", "we're"],
    ["they are", "they're"],
    ["you are", "you're"],
    ["he is", "he's"],
    ["she is", "she's"],
    ["it is", "it's"],
    ["that is", "that's"],
    ["there is", "there's"],
    ["what is", "what's"],
    ["i have", "I've"],
    ["we have", "we've"],
    ["i will", "I'll"],
    ["we will", "we'll"],
    ["let us", "let's"]
  ];

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function preserveCase(original, replacement) {
    if (!replacement) return replacement;
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function replaceAllPhrase(text, phrase, replacement) {
    var pattern = new RegExp("\\b" + escapeRegExp(phrase) + "\\b", "gi");
    var result = text.replace(pattern, function (match) {
      return preserveCase(match, replacement);
    });
    // Removing a phrase can leave doubled spaces or a space before punctuation.
    return result.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1");
  }

  function applyReplacements(text, pairs) {
    var ordered = pairs.slice().sort(function (a, b) { return b[0].length - a[0].length; });
    var result = text;
    ordered.forEach(function (pair) {
      result = replaceAllPhrase(result, pair[0], pair[1]);
    });
    return result;
  }

  function splitSentences(text) {
    return (text.match(/[^.!?]+[.!?]+/g) || [])
      .map(function (sentence) { return sentence.trim(); })
      .filter(Boolean);
  }

  function countWords(sentence) {
    return (sentence.match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length;
  }

  function capitalizeFirst(text) {
    return text ? text[0].toUpperCase() + text.slice(1) : text;
  }

  function lowercaseFirst(text) {
    return text ? text[0].toLowerCase() + text.slice(1) : text;
  }

  function sentenceLengthsOf(sentences) {
    return sentences.map(function (sentence) { return countWords(sentence); });
  }

  function coefficientOfVariation(lengths) {
    if (!lengths.length) return 0;
    var mean = lengths.reduce(function (total, length) { return total + length; }, 0) / lengths.length;
    if (mean === 0) return 0;
    var variance = lengths.reduce(function (total, length) { return total + Math.pow(length - mean, 2); }, 0) / lengths.length;
    return Math.sqrt(variance) / mean;
  }

  // Split a sentence at its best seam, if both parts stay substantial.
  // Returns [first, second] or null. Prefers ";", ", and", ", but", then
  // any comma that leaves at least 3 words on each side.
  function splitSentence(sentence) {
    var ending = (sentence.match(/[.!?]+$/) || [""])[0];
    var body = sentence.slice(0, sentence.length - ending.length);
    var seams = [];
    var semicolon = body.indexOf(";");
    if (semicolon >= 0) seams.push(semicolon);
    [", and ", ", but "].forEach(function (joiner) {
      var at = body.indexOf(joiner);
      if (at >= 0) seams.push(at);
    });
    var comma = body.indexOf(",");
    while (comma >= 0) {
      seams.push(comma);
      comma = body.indexOf(",", comma + 1);
    }
    for (var i = 0; i < seams.length; i += 1) {
      var seam = seams[i];
      var cut = body.indexOf(" ", seam);
      if (cut < 0) continue;
      var first = body.slice(0, seam).trim();
      var rest = body.slice(cut).trim().replace(/^(and|but)\s+/i, "");
      if (countWords(first) >= 3 && countWords(rest) >= 3) {
        return [first + ".", capitalizeFirst(rest) + ending];
      }
    }
    return null;
  }

  // Drop a repeated filler opener ("Also, …" twice) — the filler adds no
  // meaning, and the repeat is itself an AI tell.
  function dedupeStarters(sentences) {
    var seen = new Set();
    return sentences.map(function (sentence) {
      var first = (sentence.match(/\b[\p{L}\p{N}'’-]+\b/u) || [""])[0].toLowerCase();
      var stripped = sentence.replace(/^(also|and|but|so),\s+/i, "");
      var strippedFirst = (stripped.match(/\b[\p{L}\p{N}'’-]+\b/u) || [""])[0].toLowerCase();
      if (first && seen.has(first) && stripped !== sentence && strippedFirst) {
        seen.add(strippedFirst);
        return capitalizeFirst(stripped);
      }
      if (first) seen.add(first);
      return sentence;
    });
  }

  // Raise sentence-length variance greedily: try every single split and
  // every single merge, keep only the move that most improves the
  // coefficient of variation, and only if it actually improves it. One
  // split and one merge per call keeps the text recognizable; the
  // humanizer's multiple passes iterate from there.
  function varySentenceLengths(text) {
    var sentences = dedupeStarters(splitSentences(text));
    var baseCv = coefficientOfVariation(sentenceLengthsOf(sentences));

    var bestSplit = null;
    sentences.forEach(function (sentence, index) {
      var split = splitSentence(sentence);
      if (!split) return;
      var candidate = sentences.slice(0, index).concat(split, sentences.slice(index + 1));
      var cv = coefficientOfVariation(sentenceLengthsOf(candidate));
      if (cv > baseCv && (!bestSplit || cv > bestSplit.cv)) {
        bestSplit = { sentences: candidate, cv: cv };
      }
    });
    if (bestSplit) {
      sentences = bestSplit.sentences;
      baseCv = bestSplit.cv;
    }

    var bestMerge = null;
    for (var i = 0; i < sentences.length - 1; i += 1) {
      var left = sentences[i].replace(/[.!?]+$/, "");
      var right = sentences[i + 1];
      var rightEnding = (right.match(/[.!?]+$/) || ["."])[0];
      var rightBody = lowercaseFirst(right.replace(/[.!?]+$/, ""));
      if (countWords(left) + countWords(right) > 32) continue;
      var merged = left + "; " + rightBody + rightEnding;
      var candidate = sentences.slice(0, i).concat([merged], sentences.slice(i + 2));
      var cv = coefficientOfVariation(sentenceLengthsOf(candidate));
      if (cv > baseCv && (!bestMerge || cv > bestMerge.cv)) {
        bestMerge = { sentences: candidate, cv: cv };
      }
    }
    if (bestMerge) sentences = bestMerge.sentences;

    return dedupeStarters(sentences).join(" ");
  }

  function onePass(text) {
    var result = applyReplacements(text, PHRASE_REPLACEMENTS);
    result = applyReplacements(result, FORMAL_WORDS);
    result = applyReplacements(result, CONTRACTIONS);
    result = varySentenceLengths(result);
    return result.replace(/[ \t]{2,}/g, " ").trim();
  }

  function changedPercent(original, revised) {
    var before = (original.match(/\b[\p{L}\p{N}'’-]+\b/gu) || []);
    var after = (revised.match(/\b[\p{L}\p{N}'’-]+\b/gu) || []);
    if (!before.length) return 0;
    var changed = Math.abs(after.length - before.length);
    var shared = Math.min(before.length, after.length);
    for (var i = 0; i < shared; i += 1) {
      if (before[i] !== after[i]) changed += 1;
    }
    return Math.round((changed / before.length) * 100);
  }

  function humanize(text, estimateFn) {
    var estimate = estimateFn || (root.ClearDraftAI && root.ClearDraftAI.detector
      ? root.ClearDraftAI.detector.estimateAiLikelihood
      : null);
    var input = (text || "").trim();
    var before = estimate ? estimate(input) : null;
    var beforeScore = before ? before.score : null;

    var current = input;
    var passes = 0;
    while (passes < MAX_PASSES) {
      var next = onePass(current);
      passes += 1;
      if (next === current) break;
      current = next;
      var check = estimate ? estimate(current) : null;
      if (check && check.score <= TARGET_SCORE) break;
    }

    var after = estimate ? estimate(current) : null;
    return {
      text: current,
      beforeScore: beforeScore,
      afterScore: after ? after.score : null,
      passes: passes,
      changedPercent: changedPercent(input, current),
      reachedTarget: after ? after.score <= TARGET_SCORE : false,
      target: TARGET_SCORE
    };
  }

  var api = {
    TARGET_SCORE: TARGET_SCORE,
    MAX_PASSES: MAX_PASSES,
    humanize: humanize
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ClearDraftAI = root.ClearDraftAI || {};
    root.ClearDraftAI.humanizer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
