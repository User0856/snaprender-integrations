# Vercel AI SDK tools registry PR (prepared, not opened)

Route: fork vercel/ai, append the entry in `vercel-tools-registry-entry.ts` to the end of the `tools` array in `content/tools-registry/registry.ts`, one commit, PR to `main`.
Guide: https://github.com/vercel/ai/blob/main/contributing/add-new-tool-to-registry.md

## Before opening (all required, reviewers check them)

1. `snaprender-ai-sdk` is published on npm (owner).
2. https://snap-render.com/integrations/ai-sdk is live: install, `SNAPRENDER_API_KEY`, the generateText example, both tools and their inputs, what the model receives, errors. Reviewers rejected entries whose docsUrl pointed at a GitHub repo or a homepage (vercel/ai#22271).
3. Commits are SIGNED (verified badge). A maintainer refused to merge #22271 for unsigned commits and asked for a new PR. Set up an SSH or GPG signing key on the User0856 account first.
4. Model id in the snippet exists on the AI Gateway (`anthropic/claude-sonnet-5.5` checked Nov 11 2026 at https://ai-gateway.vercel.sh/v1/models). A bot flags wrong ids.
5. Rebase on latest main right before opening (the file gets frequent appends and conflicts).

## Title

feat(tools-registry): add snaprender

## Body

## Background

Adds SnapRender to the Tools Registry. `snaprender-ai-sdk` gives agents two tools: `takeScreenshot`, which captures a public URL or raw HTML in a real Chrome browser and returns the image to the model through `toModelOutput` (a text summary plus a `file` part with `mediaType: image/jpeg|png|webp`), and `extractContent`, which returns the rendered page as markdown, article text, links or metadata. There is no screenshot tool in the registry today.

## Summary

One `snaprender` entry in `content/tools-registry/registry.ts` with install commands, `SNAPRENDER_API_KEY`, a `generateText` example and links to the AI SDK guide, the key page, the site and npm.

## Verification

- The snippet compiles against the package and `ai@7` (it lives in the package repo as `examples/registry-snippet.ts` and is part of `npm run typecheck`).
- Unit tests include a `generateText` run with `MockLanguageModelV4` that asserts the tool result reaches the model as a `content` output with an image `file` part.
- Live tests against the API cover jpeg/png/webp, raw HTML, all five device presets, full page, extract markdown/links/metadata, and error mapping.
- End-to-end runs with `generateText` and Claude Sonnet 5.5: the model called both tools and described layout details only visible in the screenshot.

Package source: https://github.com/User0856/snaprender-integrations/tree/main/ai-sdk
AI SDK guide: https://snap-render.com/integrations/ai-sdk

## Notes for the owner (not part of the PR)

- About 118 registry PRs were open on Nov 11 2026. Maintainers (felixarntz, gr2m) merge in batches; recent merges took 1 day to 3 weeks (#24323 olostep: 2 days; #23826 m91: 12 days; #19010 keenable: almost 3 months).
- Do not add a "Generated with" footer. The registry PRs that got merged had short, factual bodies.
