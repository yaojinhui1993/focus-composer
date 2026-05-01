# Focus Composer

Renderer-only Codex++ tweak that opens a large prompt composer overlay.

## Install

Copy this folder into your Codex++ tweaks directory:

```bash
~/Library/Application Support/codex-plusplus/tweaks/com.yjh.focus-composer
```

Then fully quit and reopen Codex.

## Usage

- `Cmd+Shift+Space`: open or close the overlay.
- `Esc`: close and keep the draft.
- `Cmd+Enter`: insert text into Codex and send.
- `Cmd+Shift+Enter`: insert text into Codex without sending.
- `Templates`: use the footer button, or the Global Quick Actions item, to insert a reusable prompt template at the cursor.

Drafts are stored in this tweak's Codex++ storage namespace. No network calls are made.

## Active Issue

When Project Home has an active issue, Focus Composer shows it above the Context Capsule. Use `Insert Active` to place the issue title, metadata, description, and recent comments at the current cursor position.

## Session Resume Pack

Use `Insert Resume Pack` from the Context Capsule controls to insert a handoff that combines the active issue, local Context Capsule, Project Home open-work counts, and prioritized focus issues.

## Templates

Focus Composer includes built-in templates for implementation planning, root-cause debugging, code review, safe refactors, test plans, and ship notes. Templates preserve the current draft and insert at the cursor, using the current Project Home issue plus Context Capsule when available.

## Local Backup / Export

Open Focus Composer settings from Codex++ Tweaks to copy an export JSON or restore from clipboard. The export includes the saved draft, per-project Context Capsules, settings, and the active Project Home issue bridge.

## Context Capsule

Focus Composer shows a compact context capsule below the header. Click it to edit:

- Goal
- Decisions
- Files
- Verified
- Next

Use `Insert Capsule` to place the formatted handoff at the current cursor position, or `Copy` to put it on the clipboard. Capsules are saved locally and separated by a best-effort project/context key.

## Troubleshooting

If Insert works but Send does not, Codex changed its send button markup. Use Insert, then send manually from Codex's native composer.

## Tests

```bash
npm test
```
