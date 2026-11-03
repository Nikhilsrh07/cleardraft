# ClearDraft

ClearDraft is a small, browser-only writing assistant prototype with a document editor and a side panel of transparent, individually reviewable suggestions.

## Run locally

Open `index.html` in a browser. No build step, package installation, server, or API key is required.

## What it does

- Counts words in the source text.
- Keeps the revised-version preview and its Generate text button visible in the right panel.
- Analyzes observable text statistics on request: word and sentence counts, average sentence length, sentence-length range, repeated two-word phrases, and a long-sentence notice.
- Lets you choose a writing goal: clearer, more concise, more formal, or friendlier.
- Shows capitalization, spacing, punctuation, and goal-specific phrase suggestions as you type.
- Lets you accept or dismiss suggestions individually, accept all, and copy your edited text.
- Creates a revised version from your document in the right-side preview using the selected local writing rules; you can copy it or replace the original.
- Creates an editable draft scaffold from a topic and optional notes, with prompts for your own reasoning and evidence; it does not generate a finished essay or use an AI service.
- Keeps text in the current browser page; it does not call an AI service or save text.

The analysis is not an AI detector and does not estimate authorship or generate AI-detection percentages. The suggestions are simple rule-based examples, not AI-generated feedback or a full grammar checker. Review the draft and decide which wording fits your meaning.
