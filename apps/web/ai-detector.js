// ClearDraft AI-likelihood estimator.
//
// A local, rule-based heuristic. It is NOT Grammarly's model and it does not
// prove authorship: it scores how strongly a text shows the surface patterns
// that public AI detectors are documented to weigh (see
// docs/detector-analysis.md). Scores are estimates, not verdicts.
//
// Works in the browser (window.ClearDraftAI) and in Node (module.exports) so
// the same code can be unit-tested.

(function (root) {
  "use strict";

  var MIN_WORDS = 30;

  // Phrases and words that appear far more often in AI-generated prose than
  // in everyday human writing. Longest first so "delve into" is counted once,
  // not once as a phrase and again as "delve".
  var AI_MARKERS = [
    "in today's fast-paced world",
    "in today's digital age",
    "it is important to note that",
    "it's important to note that",
    "it is worth noting that",
    "a testament to",
    "in the realm of",
    "shed light on",
    "when it comes to",
    "in a world where",
    "delve into",
    "in conclusion",
    "in summary",
    "in addition",
    "moreover",
    "furthermore",
    "additionally",
    "notably",
    "firstly",
    "secondly",
    "delve",
    "tapestry",
    "ever-evolving",
    "cutting-edge",
    "multifaceted",
    "underscores",
    "leverage",
    "foster",
    "embark",
    "meticulous",
    "intricate",
    "seamless",
    "pivotal",
    "crucial",
    "vital",
    "boasts",
    "nestled",
    "vibrant",
    "navigate"
  ];

  var CONTRACTION_PATTERN = /\b(?:don't|can't|won't|isn't|aren't|wasn't|weren't|doesn't|didn't|hasn't|haven't|hadn't|wouldn't|couldn't|shouldn't|i'm|you're|he's|she's|it's|we're|they're|i've|we've|they've|i'll|you'll|he'll|she'll|we'll|they'll|that's|there's|here's|what's|let's)\b/gi;

  function tokenize(text) {
    return text.match(/\b[\p{L}\p{N}'’-]+\b/gu) || [];
  }

  function splitSentences(text) {
    return (text.match(/[^.!?]+[.!?]+/g) || [])
      .map(function (sentence) { return sentence.trim(); })
      .filter(Boolean);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  // Count each marker once per occurrence; matched spans are blanked so a
  // long phrase is not double-counted through its shorter parts.
  function countMarkers(lowerText) {
    var working = lowerText;
    var found = [];
    var markers = AI_MARKERS.slice().sort(function (a, b) { return b.length - a.length; });
    markers.forEach(function (marker) {
      var escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var pattern = new RegExp("\\b" + escaped + "\\b", "g");
      var matches = working.match(pattern);
      if (matches) {
        for (var i = 0; i < matches.length; i += 1) found.push(marker);
        working = working.replace(pattern, " ");
      }
    });
    return found;
  }

  function estimateAiLikelihood(text) {
    var input = (text || "").trim();
    var words = tokenize(input);
    if (words.length < MIN_WORDS) {
      return null;
    }

    var lower = input.toLowerCase();
    var sentences = splitSentences(input);
    var sentenceLengths = sentences.map(function (sentence) { return tokenize(sentence).length; })
      .filter(function (length) { return length > 0; });
    if (sentenceLengths.length < 2) {
      return null;
    }

    // Signal 1: AI-typical phrase density (per 100 words).
    var markers = countMarkers(lower);
    var markersPer100 = (markers.length / words.length) * 100;
    var phraseScore = clamp01(markersPer100 / 6);

    // Signal 2: burstiness — human writing varies sentence length a lot,
    // AI prose stays uniform. Coefficient of variation, inverted.
    var mean = sentenceLengths.reduce(function (total, length) { return total + length; }, 0) / sentenceLengths.length;
    var variance = sentenceLengths.reduce(function (total, length) { return total + Math.pow(length - mean, 2); }, 0) / sentenceLengths.length;
    var cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    var burstinessScore = 1 - clamp01(cv / 0.55);

    // Signal 3: repeated two-word phrases (AI prose loops the same bigrams).
    var bigrams = new Map();
    var lowerWords = words.map(function (word) { return word.toLowerCase(); });
    for (var i = 0; i < lowerWords.length - 1; i += 1) {
      var bigram = lowerWords[i] + " " + lowerWords[i + 1];
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    var repeatedBigrams = 0;
    bigrams.forEach(function (count) { if (count > 1) repeatedBigrams += count - 1; });
    var repetitionScore = clamp01((repeatedBigrams / Math.max(1, lowerWords.length - 1)) * 3);

    // Signal 4: same sentence starter dominating (often "The" / "This").
    var starters = new Map();
    sentences.forEach(function (sentence) {
      var first = (sentence.match(/\b[\p{L}\p{N}'’-]+\b/u) || [""])[0].toLowerCase();
      if (first) starters.set(first, (starters.get(first) || 0) + 1);
    });
    var topStarterShare = 0;
    starters.forEach(function (count) { topStarterShare = Math.max(topStarterShare, count / sentences.length); });
    var starterScore = clamp01((topStarterShare - 0.25) / 0.5);

    // Signal 5: no contractions reads formal and machine-like.
    var contractions = (input.match(CONTRACTION_PATTERN) || []).length;
    var contractionsPer100 = (contractions / words.length) * 100;
    var contractionScore = 1 - clamp01(contractionsPer100 / 2.5);

    var weights = { phrases: 0.35, burstiness: 0.30, repetition: 0.15, starters: 0.15, contractions: 0.05 };
    var weighted = weights.phrases * phraseScore
      + weights.burstiness * burstinessScore
      + weights.repetition * repetitionScore
      + weights.starters * starterScore
      + weights.contractions * contractionScore;
    var score = Math.round(weighted * 100);

    var label = score <= 20 ? "Likely human"
      : score <= 50 ? "Mixed signals"
      : score <= 80 ? "Likely AI-assisted"
      : "Strong AI signals";

    return {
      score: score,
      label: label,
      words: words.length,
      sentences: sentences.length,
      markers: markers,
      signals: [
        { name: "AI-typical phrases", value: Math.round(phraseScore * 100), detail: markers.length + " marker(s), " + markersPer100.toFixed(1) + " per 100 words" },
        { name: "Sentence-length uniformity", value: Math.round(burstinessScore * 100), detail: "length variation (CV) " + cv.toFixed(2) },
        { name: "Repeated phrases", value: Math.round(repetitionScore * 100), detail: repeatedBigrams + " repeated bigram(s)" },
        { name: "Repeated sentence starters", value: Math.round(starterScore * 100), detail: "top starter in " + Math.round(topStarterShare * 100) + "% of sentences" },
        { name: "Missing contractions", value: Math.round(contractionScore * 100), detail: contractionsPer100.toFixed(1) + " contractions per 100 words" }
      ]
    };
  }

  var api = {
    MIN_WORDS: MIN_WORDS,
    AI_MARKERS: AI_MARKERS,
    estimateAiLikelihood: estimateAiLikelihood
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ClearDraftAI = root.ClearDraftAI || {};
    root.ClearDraftAI.detector = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
