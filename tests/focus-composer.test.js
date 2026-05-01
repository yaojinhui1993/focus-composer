const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const focusComposer = require(path.join(__dirname, "..", "index.js"));

function normalizeShortcut(e) {
  const key = String(e.key || "").toLowerCase();
  return !!(e.metaKey && e.shiftKey && key === " ");
}

function scoreComposerCandidate(candidate, viewportHeight) {
  let score = 0;
  const text = [
    candidate.placeholder,
    candidate.ariaLabel,
    candidate.role,
    candidate.ancestorText,
  ].filter(Boolean).join(" ").toLowerCase();
  if (candidate.focused) score += 100;
  if (candidate.editable) score += 50;
  if (candidate.visible) score += 25;
  if (candidate.rectTop > viewportHeight * 0.45) score += 15;
  if (/(prompt|message|ask|composer|chat)/.test(text)) score += 20;
  score += Math.min(20, Math.round(candidate.area / 2000));
  return score;
}

function normalizeCapsule(input = {}) {
  return {
    goal: String(input.goal || "").trim(),
    decisions: String(input.decisions || "").trim(),
    files: String(input.files || "").trim(),
    verified: String(input.verified || "").trim(),
    next: String(input.next || "").trim(),
  };
}

function capsuleLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function summarizeCapsule(input) {
  const capsule = normalizeCapsule(input);
  const parts = [];
  if (capsule.goal) parts.push(`Goal: ${capsule.goal}`);
  if (capsule.next) parts.push(`Next: ${capsule.next}`);
  const fileCount = capsuleLines(capsule.files).length;
  const verifiedCount = capsuleLines(capsule.verified).length;
  if (fileCount) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  if (verifiedCount) parts.push(`${verifiedCount} verified`);
  return parts.length ? parts.join(" · ") : "Add context capsule";
}

function formatCapsule(input) {
  const capsule = normalizeCapsule(input);
  const bullets = (value) => {
    const lines = capsuleLines(value);
    return lines.length ? lines.map((line) => `- ${line}`).join("\n") : "-";
  };
  return [
    "Context Capsule",
    "",
    "Goal:",
    capsule.goal || "-",
    "",
    "Decisions:",
    bullets(capsule.decisions),
    "",
    "Files:",
    bullets(capsule.files),
    "",
    "Verified:",
    bullets(capsule.verified),
    "",
    "Next:",
    capsule.next || "-",
  ].join("\n");
}

function shortcutActionForOverlay(state) {
  return state.overlay && !state.overlay.hidden ? "close" : "open";
}

test("normalizeShortcut detects Cmd+Shift+Space", () => {
  assert.equal(normalizeShortcut({ metaKey: true, shiftKey: true, key: " " }), true);
  assert.equal(normalizeShortcut({ metaKey: true, shiftKey: false, key: " " }), false);
  assert.equal(normalizeShortcut({ metaKey: true, shiftKey: true, key: "k" }), false);
});

test("scoreComposerCandidate prefers focused bottom composer", () => {
  const bottom = scoreComposerCandidate({
    focused: true,
    editable: true,
    visible: true,
    rectTop: 700,
    area: 24000,
    placeholder: "Message Codex",
  }, 900);
  const top = scoreComposerCandidate({
    focused: false,
    editable: true,
    visible: true,
    rectTop: 100,
    area: 24000,
    placeholder: "Search",
  }, 900);
  assert.ok(bottom > top);
});

test("summarizeCapsule handles empty and populated capsules", () => {
  assert.equal(summarizeCapsule({}), "Add context capsule");
  assert.equal(
    summarizeCapsule({
      goal: "Ship Focus Composer",
      files: "index.js\nREADME.md",
      verified: "node --check",
      next: "Reload Codex",
    }),
    "Goal: Ship Focus Composer · Next: Reload Codex · 2 files · 1 verified",
  );
});

test("formatCapsule renders markdown handoff", () => {
  assert.equal(
    formatCapsule({
      goal: "Fix send",
      decisions: "Use native composer\nKeep local only",
      files: "index.js",
      verified: "doctor passed",
      next: "Manual reload",
    }),
    [
      "Context Capsule",
      "",
      "Goal:",
      "Fix send",
      "",
      "Decisions:",
      "- Use native composer",
      "- Keep local only",
      "",
      "Files:",
      "- index.js",
      "",
      "Verified:",
      "- doctor passed",
      "",
      "Next:",
      "Manual reload",
    ].join("\n"),
  );
});

test("shortcut opens when overlay element exists but is hidden", () => {
  assert.equal(shortcutActionForOverlay({ overlay: null }), "open");
  assert.equal(shortcutActionForOverlay({ overlay: { hidden: true } }), "open");
  assert.equal(shortcutActionForOverlay({ overlay: { hidden: false } }), "close");
});

test("formatActiveIssue renders an insertable active issue handoff", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.formatActiveIssue, "function");
  assert.equal(
    helpers.formatActiveIssue({
      projectLabel: "sniper-system",
      issueId: "SNI-1",
      title: "Fix regression colors",
      status: "in_progress",
      priority: "high",
      labels: ["ui", "bug"],
      assignee: "Codex",
      dueDate: "2026-05-02",
      description: "The regression run color is too faint.",
      comments: [
        { author: "yjh", body: "Need stronger separators." },
        { author: "Codex", body: "Updated board/list separators." },
      ],
    }),
    [
      "Active Issue",
      "",
      "Project: sniper-system",
      "Issue: SNI-1 Fix regression colors",
      "Status: in_progress",
      "Priority: high",
      "Assignee: Codex",
      "Due: 2026-05-02",
      "Labels: ui, bug",
      "",
      "Description:",
      "The regression run color is too faint.",
      "",
      "Recent comments:",
      "- yjh: Need stronger separators.",
      "- Codex: Updated board/list separators.",
    ].join("\n"),
  );
});

test("formatResumePack combines active issue, capsule, and project snapshot", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.formatResumePack, "function");
  assert.equal(
    helpers.formatResumePack({
      project: {
        projectLabel: "sniper-system",
        projectPath: "/Users/yjh/Playground/sniper-system",
        openCounts: {
          backlog: 2,
          todo: 1,
          in_progress: 1,
          in_review: 0,
        },
        focusIssues: [
          { id: "SNI-1", title: "Fix regression colors", status: "in_progress", priority: "high" },
          { id: "SNI-5", title: "Add Opinion Source AI chat", status: "todo", priority: "urgent" },
        ],
      },
      activeIssue: {
        issueId: "SNI-1",
        title: "Fix regression colors",
        status: "in_progress",
        priority: "high",
        description: "The regression run color is too faint.",
      },
      capsule: {
        goal: "Ship the Codex++ workflow upgrades",
        decisions: "Keep Project Home frozen locally",
        files: "project-home/index.js\nfocus-composer/index.js",
        verified: "npm test\ncodexplusplus doctor",
        next: "Restart Codex and dogfood",
      },
    }),
    [
      "Session Resume Pack",
      "",
      "Project:",
      "sniper-system",
      "/Users/yjh/Playground/sniper-system",
      "",
      "Active Issue:",
      "SNI-1 Fix regression colors",
      "Status: in_progress",
      "Priority: high",
      "Description: The regression run color is too faint.",
      "",
      "Context Capsule:",
      "Goal: Ship the Codex++ workflow upgrades",
      "Decisions:",
      "- Keep Project Home frozen locally",
      "Files:",
      "- project-home/index.js",
      "- focus-composer/index.js",
      "Verified:",
      "- npm test",
      "- codexplusplus doctor",
      "Next: Restart Codex and dogfood",
      "",
      "Open Work:",
      "- backlog: 2",
      "- todo: 1",
      "- in_progress: 1",
      "- in_review: 0",
      "",
      "Focus Issues:",
      "- SNI-5 [urgent/todo] Add Opinion Source AI chat",
      "- SNI-1 [high/in_progress] Fix regression colors",
    ].join("\n"),
  );
});

test("buildWorkSessionPrompt prepares a review-first launch prompt", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildWorkSessionPrompt, "function");

  const prompt = helpers.buildWorkSessionPrompt({
    project: {
      projectLabel: "sniper-system",
      projectPath: "/Users/yjh/Playground/sniper-system",
      openCounts: {
        todo: 1,
        in_progress: 1,
      },
      focusIssues: [
        { id: "SNI-5", title: "Add Opinion Source AI chat", status: "todo", priority: "urgent" },
      ],
    },
    activeIssue: {
      issueId: "SNI-1",
      title: "Fix regression colors",
      status: "in_progress",
      priority: "high",
      description: "The regression run color is too faint.",
    },
    capsule: {
      goal: "Ship workflow",
      next: "Continue from active issue",
    },
  });

  assert.match(prompt, /^Start work on this Project Home session\./);
  assert.match(prompt, /First restate the current goal briefly/);
  assert.match(prompt, /Session Resume Pack/);
  assert.match(prompt, /SNI-1 Fix regression colors/);
  assert.match(prompt, /SNI-5 \[urgent\/todo\] Add Opinion Source AI chat/);
});

test("buildShipNotePrompt prepares an end-session ship note draft", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildShipNotePrompt, "function");

  const prompt = helpers.buildShipNotePrompt({
    project: {
      projectLabel: "sniper-system",
      projectPath: "/Users/yjh/Playground/sniper-system",
      openCounts: {
        in_review: 1,
      },
      focusIssues: [
        { id: "SNI-7", title: "Review Codex tweak crash recovery", status: "in_review", priority: "high" },
      ],
    },
    activeIssue: {
      issueId: "SNI-1",
      title: "Fix regression colors",
      status: "in_progress",
      priority: "high",
    },
    capsule: {
      goal: "Ship Project Home improvements",
      files: "project-home/index.js\nfocus-composer/index.js",
      verified: "npm test\ncodexplusplus doctor",
      next: "Restart Codex and dogfood",
    },
  });

  assert.match(prompt, /^End this Project Home session\./);
  assert.match(prompt, /Shipped:/);
  assert.match(prompt, /Changed files:/);
  assert.match(prompt, /Verified:/);
  assert.match(prompt, /Risks \/ not done:/);
  assert.match(prompt, /Next session starter:/);
  assert.match(prompt, /Session Resume Pack/);
  assert.match(prompt, /SNI-1 Fix regression colors/);
  assert.match(prompt, /SNI-7 \[high\/in_review\] Review Codex tweak crash recovery/);
});

test("buildLaunchPrompt routes ship-note launches to the ship note prompt", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildLaunchPrompt, "function");

  const prompt = helpers.buildLaunchPrompt({
    kind: "ship-note",
    project: { projectLabel: "sniper-system" },
    activeIssue: { issueId: "SNI-1", title: "Fix regression colors" },
    capsule: { goal: "Finish the session" },
  });

  assert.match(prompt, /^End this Project Home session\./);
});

test("open-composer launches do not generate a replacement prompt", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildLaunchPrompt, "function");
  assert.equal(typeof helpers.isOpenComposerLaunch, "function");

  assert.equal(helpers.isOpenComposerLaunch({ kind: "open-composer" }), true);
  assert.equal(helpers.buildLaunchPrompt({ kind: "open-composer" }), "");
});

test("buildFocusComposerQuickActions registers the open composer action", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildFocusComposerQuickActions, "function");

  const actions = helpers.buildFocusComposerQuickActions();
  assert.deepEqual(actions.map((action) => action.id), ["open-focus-composer"]);
  assert.equal(actions[0].source, "focus-composer");
  assert.equal(actions[0].title, "Open Focus Composer");
  assert.equal(actions[0].shortcut, "Cmd+Shift+Space");
  assert.equal(typeof actions[0].run, "function");
});

test("buildFocusComposerExport captures draft, capsules, settings, and active issue", () => {
  const helpers = focusComposer.__test || {};
  assert.equal(typeof helpers.buildFocusComposerExport, "function");
  assert.deepEqual(
    helpers.buildFocusComposerExport({
      now: "2026-05-01T12:00:00.000Z",
      draft: "Current prompt",
      capsulesByProject: {
        "/Users/yjh/Playground/sniper-system": {
          goal: "Ship workflow",
          next: "Restart Codex",
        },
      },
      settings: {
        shortcutEnabled: true,
        clearDraftOnInsert: false,
      },
      activeIssue: {
        issueId: "SNI-1",
        title: "Fix regression colors",
      },
    }),
    {
      format: "focus-composer-export",
      version: 1,
      exportedAt: "2026-05-01T12:00:00.000Z",
      draft: "Current prompt",
      capsulesByProject: {
        "/Users/yjh/Playground/sniper-system": {
          goal: "Ship workflow",
          decisions: "",
          files: "",
          verified: "",
          next: "Restart Codex",
        },
      },
      settings: {
        shortcutEnabled: true,
        clearDraftOnInsert: false,
      },
      activeIssue: {
        projectPath: "",
        projectLabel: "",
        issueId: "SNI-1",
        title: "Fix regression colors",
        description: "",
        status: "",
        priority: "",
        labels: [],
        assignee: "",
        dueDate: "",
        comments: [],
      },
    },
  );
});
