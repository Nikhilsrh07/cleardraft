# AI-detector analysis: what ClearDraft measures, and what it does not

## The honest limit first

Grammarly's AI detector is a proprietary, trained classifier. Its model
weights, training data, and exact scoring are not public, and ClearDraft
does not extract, copy, or reproduce them. No amount of local analysis can
make a client-side heuristic return Grammarly's exact number.

What this document does is the legitimate half of "reverse engineering":
it collects the detection signals Grammarly and the detector literature
publicly describe, and maps each one to a concrete, testable rule in
`apps/web/ai-detector.js` — plus the humanizer counter-move in
`apps/web/humanizer.js`. The 10% target in ClearDraft is measured by
**this** estimator — not Grammarly's model. A text that scores 8% here may score
differently on Grammarly, and the UI says so.

## Signals Grammarly publicly describes

Grammarly describes its detector as analyzing writing patterns to
distinguish AI-generated text from human text, trained on large samples of
both. Public detector research and Grammarly's own product notes converge
on the same families of signals:

| Signal family | What detectors look for | ClearDraft rule |
| --- | --- | --- |
| Predictable phrasing | Stock AI phrases and transitions ("delve", "moreover", "in today's fast-paced world", "it's important to note") | `AI_MARKERS` list, counted per 100 words (weight 0.35) |
| Uniform rhythm (low burstiness) | Sentences of near-identical length; human writing bursts between short and long | Coefficient of variation of sentence lengths, inverted (weight 0.30) |
| Repetition | Same bigrams and sentence openers looping ("The system… The system…") | Repeated-bigram rate and top-starter share (weights 0.15 + 0.15) |
| Over-formal register | Zero contractions, stiff diction | Contractions per 100 words (weight 0.05 — a weak signal, since formal human writing also lacks them) |

Perplexity (how "surprised" a language model is by each word) is the
signal most production detectors lean on hardest, and it is deliberately
absent here: it needs a language model, which a dependency-free static
page does not have. The phrase-density and burstiness signals are the
best available proxies, and the score is labeled an estimate for exactly
this reason.

## How the humanizer targets each signal

| Estimator signal | Humanizer counter-move |
| --- | --- |
| AI-typical phrases | Replaced with plain equivalents ("delve into" → "look into", "moreover" → "also", filler like "it's important to note that" → removed) |
| Uniform sentence lengths | Sentences split at `;` / `, and` / `, but` / comma seams and adjacent sentences merged — keeping only moves that raise sentence-length variance |
| Missing contractions | Full forms contracted ("do not" → "don't", "it is" → "it's") |
| Formal diction | Plain swaps ("utilize" → "use", "facilitate" → "help") |

`humanize()` runs up to 3 passes and stops as soon as the estimate is at
or under 10%. If it cannot reach 10%, it reports the achieved score
instead of claiming success — a text with no markers and genuinely varied
sentences may already be near its floor.

## What the score means

- 0–20: reads like human writing on these signals.
- 21–50: mixed signals; some AI-typical patterns present.
- 51–80: likely AI-assisted.
- 81–100: strong AI signals.

Minimum input is 30 words across at least 2 sentences; shorter text is
too noisy to score and returns no result. The score is a writing-pattern
estimate, not an authorship verdict: a human can write uniform, formal
prose that scores high, and an edited AI draft can score low. Review the
humanized output before using it — the rewrites preserve wording
structure, not intent, and meaning stays the writer's responsibility.
