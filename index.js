/**
 * Focus Composer
 *
 * Renderer-only Codex++ tweak. Opens a large prompt composer overlay, stores a
 * local draft, and can insert or send through Codex's native composer.
 */

const STORAGE_KEYS = {
  draft: "draft",
  shortcutEnabled: "shortcutEnabled",
  clearDraftOnInsert: "clearDraftOnInsert",
  capsulesByProject: "capsulesByProject",
};
const ACTIVE_ISSUE_STORAGE_KEY = "codexpp.project-home.activeIssue.v1";
const ACTIVE_ISSUE_CHANGED_EVENT = "codexpp-project-home-active-issue-changed";
const RESUME_PACK_STORAGE_KEY = "codexpp.project-home.resumePack.v1";
const RESUME_PACK_CHANGED_EVENT = "codexpp-project-home-resume-pack-changed";
const FOCUS_COMPOSER_LAUNCH_EVENT = "codexpp-focus-composer-launch";
const QUICK_ACTIONS_REGISTER_EVENT = "codexpp-global-quick-actions-register";
const QUICK_ACTIONS_UNREGISTER_EVENT = "codexpp-global-quick-actions-unregister";
const QUICK_ACTIONS_REFRESH_EVENT = "codexpp-global-quick-actions-request-refresh";
const SHORTCUTS_REGISTER_EVENT = "codexpp-keyboard-shortcuts-register";
const SHORTCUTS_UNREGISTER_EVENT = "codexpp-keyboard-shortcuts-unregister";
const SHORTCUTS_REFRESH_EVENT = "codexpp-keyboard-shortcuts-request-refresh";
const QUICK_ACTIONS_SOURCE = "focus-composer";

const DEFAULTS = {
  shortcutEnabled: true,
  clearDraftOnInsert: false,
};

const TWEAK_ID = "com-yjh-focus-composer";
const TEMPLATE_MENU_ID = `${TWEAK_ID}-template-menu`;
const FOCUS_TEMPLATES = [
  {
    id: "implementation-plan",
    title: "Implementation Plan",
    subtitle: "Turn context into a concrete coding plan.",
    keywords: ["implementation", "plan", "tasks", "steps"],
    body: [
      "Create an implementation plan for this work.",
      "",
      "Please include:",
      "- Goal and non-goals",
      "- Files or modules likely involved",
      "- Step-by-step implementation sequence",
      "- Tests and verification commands",
      "- Risks, edge cases, and rollback notes",
    ],
  },
  {
    id: "debug-root-cause",
    title: "Debug / Root Cause",
    subtitle: "Investigate before changing code.",
    keywords: ["debug", "root cause", "bug", "investigate"],
    body: [
      "Debug this issue systematically.",
      "",
      "Do not patch yet. First:",
      "- Reproduce or define the symptom precisely",
      "- Inspect the relevant code path",
      "- Identify the root cause and why it happens",
      "- Propose the smallest safe fix",
      "- Add or update a regression test",
    ],
  },
  {
    id: "code-review",
    title: "Code Review",
    subtitle: "Review for bugs, regressions, and missing tests.",
    keywords: ["review", "code review", "regression", "tests"],
    body: [
      "Review this change like a senior engineer.",
      "",
      "Prioritize:",
      "- Bugs and behavioral regressions",
      "- Missing or weak test coverage",
      "- Data loss, race conditions, and error handling",
      "- UI states that can break on small viewports",
      "- Unclear ownership or follow-up risk",
    ],
  },
  {
    id: "refactor-safely",
    title: "Refactor Safely",
    subtitle: "Improve structure without changing behavior.",
    keywords: ["refactor", "safe", "cleanup", "structure"],
    body: [
      "Refactor this area safely.",
      "",
      "Keep behavior unchanged. Please:",
      "- Describe the current shape briefly",
      "- Identify the smallest useful boundary improvement",
      "- Preserve public behavior and storage formats",
      "- Add or keep tests around the behavior being moved",
      "- Avoid unrelated cleanup",
    ],
  },
  {
    id: "test-plan",
    title: "Test Plan",
    subtitle: "Design focused verification before shipping.",
    keywords: ["test", "test plan", "verification", "qa"],
    body: [
      "Create a focused test plan.",
      "",
      "Cover:",
      "- Unit tests for core logic",
      "- Integration or UI checks for the user workflow",
      "- Regression cases for known failure modes",
      "- Manual verification steps",
      "- Commands to run before calling this done",
    ],
  },
  {
    id: "ship-note",
    title: "Ship Note",
    subtitle: "Summarize what changed and what remains.",
    keywords: ["ship", "ship note", "release", "handoff"],
    body: [
      "Draft a concise ship note.",
      "",
      "Use this structure:",
      "Shipped:",
      "-",
      "",
      "Changed files:",
      "-",
      "",
      "Verified:",
      "-",
      "",
      "Risks / not done:",
      "-",
      "",
      "Next:",
      "-",
    ],
  },
];

/** @type {import("@codex-plusplus/sdk").Tweak} */
module.exports = {
  start(api) {
    const state = {
      api,
      overlay: null,
      textarea: null,
      status: null,
      error: null,
      style: null,
      composer: null,
      count: null,
      templateHost: null,
      templateMenu: null,
      capsuleProjectKey: null,
      capsule: defaultCapsule(),
      capsuleSummary: null,
      capsuleEditor: null,
      capsuleInputs: {},
      capsuleSaveTimer: null,
      activeIssue: null,
      activeIssueRoot: null,
      activeIssueSummary: null,
      projectSnapshot: null,
      saveTimer: null,
      settingsHandle: null,
      shortcutEnabled: readStorage(api, STORAGE_KEYS.shortcutEnabled, DEFAULTS.shortcutEnabled),
      clearDraftOnInsert: readStorage(api, STORAGE_KEYS.clearDraftOnInsert, DEFAULTS.clearDraftOnInsert),
      keydown: null,
      activeIssueChanged: null,
      resumePackChanged: null,
      launchRequested: null,
      quickActionsRefresh: null,
      keyboardShortcutsRefresh: null,
    };

    state.keydown = (event) => handleGlobalKeydown(state, event);
    state.activeIssueChanged = (event) => {
      state.activeIssue = normalizeActiveIssue(event.detail || readSharedActiveIssue());
      renderActiveIssue(state);
    };
    state.resumePackChanged = (event) => {
      state.projectSnapshot = normalizeProjectSnapshot(event.detail || readSharedResumePack());
    };
    state.launchRequested = (event) => handleLaunchRequest(state, event);
    state.quickActionsRefresh = () => registerFocusComposerQuickActions();
    state.keyboardShortcutsRefresh = () => registerFocusComposerKeyboardShortcuts();
    window.addEventListener("keydown", state.keydown, true);
    window.addEventListener(ACTIVE_ISSUE_CHANGED_EVENT, state.activeIssueChanged);
    window.addEventListener(RESUME_PACK_CHANGED_EVENT, state.resumePackChanged);
    window.addEventListener(FOCUS_COMPOSER_LAUNCH_EVENT, state.launchRequested);
    window.addEventListener(QUICK_ACTIONS_REFRESH_EVENT, state.quickActionsRefresh);
    window.addEventListener(SHORTCUTS_REFRESH_EVENT, state.keyboardShortcutsRefresh);
    registerFocusComposerQuickActions();
    registerFocusComposerKeyboardShortcuts();

    state.settingsHandle = api.settings?.register?.({
      id: "focus-composer",
      title: "Focus Composer",
      description: "Large prompt composer overlay with local draft persistence.",
      render(root) {
        return renderSettings(root, state);
      },
    });

    this._state = state;
    api.log.info("Focus Composer loaded");
  },

  stop() {
    const state = this._state;
    if (!state) return;
    if (state.keydown) window.removeEventListener("keydown", state.keydown, true);
    if (state.activeIssueChanged) window.removeEventListener(ACTIVE_ISSUE_CHANGED_EVENT, state.activeIssueChanged);
    if (state.resumePackChanged) window.removeEventListener(RESUME_PACK_CHANGED_EVENT, state.resumePackChanged);
    if (state.launchRequested) window.removeEventListener(FOCUS_COMPOSER_LAUNCH_EVENT, state.launchRequested);
    if (state.quickActionsRefresh) window.removeEventListener(QUICK_ACTIONS_REFRESH_EVENT, state.quickActionsRefresh);
    if (state.keyboardShortcutsRefresh) window.removeEventListener(SHORTCUTS_REFRESH_EVENT, state.keyboardShortcutsRefresh);
    unregisterFocusComposerQuickActions();
    unregisterFocusComposerKeyboardShortcuts();
    clearSaveTimer(state);
    clearCapsuleSaveTimer(state);
    removeOverlay(state);
    state.settingsHandle?.unregister?.();
    this._state = null;
  },
};

function handleGlobalKeydown(state, event) {
  if (event.isComposing) return;

  if (isOverlayOpen(state)) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (state.templateMenu?.isConnected) {
        closeTemplateMenu(state);
        state.textarea?.focus();
        return;
      }
      closeOverlay(state);
      return;
    }
    if (event.metaKey && event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        insertDraft(state);
      } else {
        sendDraft(state);
      }
      return;
    }
  }

  if (!state.shortcutEnabled) return;
  if (!isOpenShortcut(event)) return;
  event.preventDefault();
  if (isOverlayOpen(state)) closeOverlay(state);
  else openOverlay(state);
}

function handleLaunchRequest(state, event) {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  state.activeIssue = normalizeActiveIssue(detail.activeIssue || readSharedActiveIssue());
  state.projectSnapshot = normalizeProjectSnapshot(detail.project || readSharedResumePack());
  loadCapsuleForCurrentProject(state);
  const explicitText = typeof detail.text === "string" ? detail.text.trim() : "";
  const promptInput = {
    kind: detail.kind || detail.mode || "",
    project: state.projectSnapshot,
    activeIssue: state.activeIssue,
    capsule: state.capsule,
  };
  if (isTemplateMenuLaunch(promptInput)) {
    openOverlay(state, {
      status: "Templates ready",
      activeIssue: state.activeIssue,
      project: state.projectSnapshot,
    });
    setError(state, "");
    window.requestAnimationFrame(() => openTemplateMenu(state));
    return;
  }
  if (isOpenComposerLaunch(promptInput)) {
    openOverlay(state, {
      status: "Ready",
      activeIssue: state.activeIssue,
      project: state.projectSnapshot,
    });
    setError(state, "");
    return;
  }
  const text = explicitText || buildLaunchPrompt(promptInput);
  openOverlay(state, {
    text,
    status: launchStatusFor(promptInput),
    activeIssue: state.activeIssue,
    project: state.projectSnapshot,
  });
  flushDraft(state);
  setError(state, "");
}

function registerFocusComposerQuickActions() {
  window.dispatchEvent(new CustomEvent(QUICK_ACTIONS_REGISTER_EVENT, {
    detail: {
      source: QUICK_ACTIONS_SOURCE,
      actions: buildFocusComposerQuickActions(),
    },
  }));
}

function unregisterFocusComposerQuickActions() {
  window.dispatchEvent(new CustomEvent(QUICK_ACTIONS_UNREGISTER_EVENT, {
    detail: { source: QUICK_ACTIONS_SOURCE },
  }));
}

function registerFocusComposerKeyboardShortcuts() {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_REGISTER_EVENT, {
    detail: {
      source: QUICK_ACTIONS_SOURCE,
      sourceLabel: "Focus Composer",
      shortcuts: buildFocusComposerKeyboardShortcuts(),
    },
  }));
}

function unregisterFocusComposerKeyboardShortcuts() {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_UNREGISTER_EVENT, {
    detail: { source: QUICK_ACTIONS_SOURCE },
  }));
}

function buildFocusComposerQuickActions() {
  return [
    {
      source: QUICK_ACTIONS_SOURCE,
      id: "open-focus-composer",
      title: "Open Focus Composer",
      subtitle: "Open the large composer without replacing your draft.",
      keywords: ["composer", "prompt", "draft"],
      shortcut: "Cmd+Shift+Space",
      run() {
        window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_LAUNCH_EVENT, {
          detail: {
            version: 1,
            source: QUICK_ACTIONS_SOURCE,
            kind: "open-composer",
            requestedAt: new Date().toISOString(),
          },
        }));
      },
    },
    {
      source: QUICK_ACTIONS_SOURCE,
      id: "insert-focus-template",
      title: "Insert Focus Template",
      subtitle: "Open Focus Composer templates without replacing your draft.",
      keywords: focusTemplateQuickActionKeywords(),
      shortcut: "Templates",
      run() {
        window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_LAUNCH_EVENT, {
          detail: {
            version: 1,
            source: QUICK_ACTIONS_SOURCE,
            kind: "open-template-menu",
            requestedAt: new Date().toISOString(),
          },
        }));
      },
    },
  ];
}

function buildFocusComposerKeyboardShortcuts() {
  return [
    {
      id: "open-focus-composer",
      label: "Open Focus Composer",
      combo: "Cmd+Shift+Space",
      description: "Open the large composer without replacing your draft.",
      keywords: ["composer", "prompt", "draft"],
      scope: "Global",
      remappable: true,
    },
  ];
}

function isOpenShortcut(event) {
  const key = String(event.key || "").toLowerCase();
  return !!(event.metaKey && event.shiftKey && (key === " " || event.code === "Space"));
}

function isOverlayOpen(state) {
  return !!(state.overlay && !state.overlay.hidden);
}

function openOverlay(state, options = {}) {
  state.composer = findComposer();
  const nativeText = state.composer ? readComposerText(state.composer) : "";
  const storedDraft = readStorage(state.api, STORAGE_KEYS.draft, "");
  const forcedText = typeof options.text === "string" ? options.text : null;
  const initialText = forcedText !== null ? forcedText : nativeText.trim().length > 0 ? nativeText : storedDraft;

  if (!state.overlay) createOverlay(state);
  state.activeIssue = options.activeIssue
    ? normalizeActiveIssue(options.activeIssue)
    : readSharedActiveIssue();
  state.projectSnapshot = options.project
    ? normalizeProjectSnapshot(options.project)
    : readSharedResumePack();
  renderActiveIssue(state);
  loadCapsuleForCurrentProject(state);
  renderCapsule(state);
  state.textarea.value = initialText;
  updateTextCount(state);
  setStatus(state, options.status || (initialText ? "Draft ready" : "Ready"));
  setError(state, state.composer ? "" : "Native composer not found yet. You can write here, then try Insert after clicking a Codex chat.");
  state.overlay.hidden = false;
  document.documentElement.classList.add(`${TWEAK_ID}-open`);
  requestAnimationFrame(() => {
    state.textarea.focus();
    state.textarea.setSelectionRange(state.textarea.value.length, state.textarea.value.length);
  });
}

function closeOverlay(state, options = {}) {
  const persist = options.persist !== false;
  if (persist) flushDraft(state);
  else clearSaveTimer(state);
  closeTemplateMenu(state);
  if (state.overlay) state.overlay.hidden = true;
  document.documentElement.classList.remove(`${TWEAK_ID}-open`);
}

function removeOverlay(state) {
  state.overlay?.remove();
  state.style?.remove();
  state.overlay = null;
  state.textarea = null;
  state.status = null;
  state.error = null;
  state.style = null;
  state.count = null;
  state.templateHost = null;
  state.templateMenu = null;
  state.capsuleSummary = null;
  state.capsuleEditor = null;
  state.capsuleInputs = {};
  state.activeIssueRoot = null;
  state.activeIssueSummary = null;
  document.documentElement.classList.remove(`${TWEAK_ID}-open`);
}

function createOverlay(state) {
  const style = document.createElement("style");
  style.dataset.focusComposer = "true";
  style.textContent = getCss();
  document.head.appendChild(style);

  const overlay = el("div", `${TWEAK_ID}-overlay`);
  overlay.hidden = true;
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeOverlay(state);
  });

  const panel = el("section", `${TWEAK_ID}-panel`);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Focus Composer");

  const header = el("div", `${TWEAK_ID}-header`);
  const heading = el("div", `${TWEAK_ID}-heading`);
  const title = el("h2", "");
  title.textContent = "Focus Composer";
  const hint = el("p", "");
  hint.textContent = "Cmd+Enter sends. Cmd+Shift+Enter inserts. Esc closes.";
  heading.append(title, hint);

  const status = el("div", `${TWEAK_ID}-status`);
  status.textContent = "Ready";
  header.append(heading, status);

  const capsule = createCapsuleSection(state);
  const activeIssue = createActiveIssueSection(state);

  const textarea = document.createElement("textarea");
  textarea.className = `${TWEAK_ID}-textarea`;
  textarea.placeholder = "Write the full prompt here...";
  textarea.spellcheck = true;
  textarea.addEventListener("input", () => scheduleDraftSave(state));

  const error = el("div", `${TWEAK_ID}-error`);
  error.hidden = true;

  const footer = el("div", `${TWEAK_ID}-footer`);
  const left = el("div", `${TWEAK_ID}-footer-left`);
  const count = el("span", `${TWEAK_ID}-count`);
  count.textContent = "0 chars";
  textarea.addEventListener("input", () => {
    updateTextCount(state);
  });
  left.appendChild(count);

  const right = el("div", `${TWEAK_ID}-actions`);
  const close = button("Close", "secondary", () => closeOverlay(state));
  const clear = button("Clear", "secondary", () => clearDraft(state));
  const templateHost = el("div", `${TWEAK_ID}-template-host`);
  const templates = button("Templates", "secondary", () => toggleTemplateMenu(state));
  templates.setAttribute("aria-haspopup", "menu");
  templates.setAttribute("aria-controls", TEMPLATE_MENU_ID);
  templateHost.append(templates);
  const voice = button("Voice", "secondary", () => startNativeDictation(state));
  const insert = button("Insert", "secondary", () => insertDraft(state));
  const send = button("Send", "primary", () => sendDraft(state));
  right.append(close, clear, templateHost, voice, insert, send);
  footer.append(left, right);

  panel.append(header, activeIssue.root, capsule.root, textarea, error, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  state.overlay = overlay;
  state.textarea = textarea;
  state.status = status;
  state.error = error;
  state.style = style;
  state.count = count;
  state.templateHost = templateHost;
}

function renderSettings(root, state) {
  root.innerHTML = "";
  const wrap = el("section", `${TWEAK_ID}-settings`);
  const style = document.createElement("style");
  style.textContent = getSettingsCss();
  wrap.appendChild(style);

  wrap.appendChild(settingsRow({
    title: "Enable shortcut",
    description: "Open Focus Composer with Cmd+Shift+Space.",
    checked: state.shortcutEnabled,
    onChange(checked) {
      state.shortcutEnabled = checked;
      writeStorage(state.api, STORAGE_KEYS.shortcutEnabled, checked);
    },
  }));

  wrap.appendChild(settingsRow({
    title: "Clear draft after Insert",
    description: "When off, Insert copies text to Codex but keeps the draft for reuse.",
    checked: state.clearDraftOnInsert,
    onChange(checked) {
      state.clearDraftOnInsert = checked;
      writeStorage(state.api, STORAGE_KEYS.clearDraftOnInsert, checked);
    },
  }));

  const controls = el("div", `${TWEAK_ID}-settings-controls`);
  const open = button("Open Composer", "secondary", () => openOverlay(state));
  const clear = button("Clear Saved Draft", "secondary", () => {
    writeStorage(state.api, STORAGE_KEYS.draft, "");
    setStatus(state, "Draft cleared");
  });
  const copyExport = button("Copy Export JSON", "secondary", () => void copyFocusComposerExport(state));
  const restoreExport = button("Restore From Clipboard", "secondary", () => void restoreFocusComposerFromClipboard(state));
  controls.append(open, clear, copyExport, restoreExport);
  wrap.appendChild(controls);
  root.appendChild(wrap);
}

function settingsRow({ title, description, checked, onChange }) {
  const row = el("label", `${TWEAK_ID}-settings-row`);
  const text = el("span", `${TWEAK_ID}-settings-copy`);
  const strong = el("span", `${TWEAK_ID}-settings-title`);
  strong.textContent = title;
  const desc = el("span", `${TWEAK_ID}-settings-desc`);
  desc.textContent = description;
  text.append(strong, desc);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(text, input);
  return row;
}

function createActiveIssueSection(state) {
  const root = el("section", `${TWEAK_ID}-active-issue`);
  root.hidden = true;

  const summary = el("div", `${TWEAK_ID}-active-issue-summary`);
  const actions = el("div", `${TWEAK_ID}-active-issue-actions`);
  actions.append(button("Insert Active", "secondary", () => insertActiveIssue(state)));
  root.append(summary, actions);

  state.activeIssueRoot = root;
  state.activeIssueSummary = summary;
  return { root };
}

function renderActiveIssue(state) {
  if (!state.activeIssueRoot || !state.activeIssueSummary) return;
  const issue = normalizeActiveIssue(state.activeIssue);
  state.activeIssue = issue;
  state.activeIssueRoot.hidden = !issue.issueId;
  state.activeIssueSummary.replaceChildren();
  if (!issue.issueId) return;

  const label = el("span", `${TWEAK_ID}-active-issue-label`);
  label.textContent = "Active Issue";
  const title = el("span", `${TWEAK_ID}-active-issue-title`);
  title.textContent = summarizeActiveIssue(issue);
  state.activeIssueSummary.append(label, title);
}

function insertActiveIssue(state) {
  const issue = normalizeActiveIssue(state.activeIssue || readSharedActiveIssue());
  if (!issue.issueId) {
    setError(state, "No active Project Home issue is set.");
    return;
  }
  insertTextIntoFocusTextarea(state, formatActiveIssue(issue));
  flushDraft(state);
  setError(state, "");
  setStatus(state, "Active issue inserted");
}

function insertResumePack(state) {
  const text = formatResumePack({
    project: state.projectSnapshot || readSharedResumePack(),
    activeIssue: state.activeIssue || readSharedActiveIssue(),
    capsule: state.capsule,
  });
  insertTextIntoFocusTextarea(state, text);
  flushDraft(state);
  flushCapsule(state);
  setError(state, "");
  setStatus(state, "Resume pack inserted");
}

function createCapsuleSection(state) {
  const root = el("section", `${TWEAK_ID}-capsule`);

  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = `${TWEAK_ID}-capsule-summary`;
  summary.addEventListener("click", () => toggleCapsuleEditor(state));

  const editor = el("div", `${TWEAK_ID}-capsule-editor`);
  editor.hidden = true;

  const primaryGrid = el("div", `${TWEAK_ID}-capsule-grid ${TWEAK_ID}-capsule-grid-primary`);
  const advancedGrid = el("div", `${TWEAK_ID}-capsule-grid ${TWEAK_ID}-capsule-grid-advanced`);
  const fields = [
    ["goal", "Goal", "What are we trying to finish?"],
    ["decisions", "Decisions", "One decision per line"],
    ["files", "Files", "One path or file note per line"],
    ["verified", "Verified", "One command/result per line"],
    ["next", "Next", "What should happen next?"],
  ];
  for (const [key, label, placeholder] of fields) {
    const field = capsuleField(state, key, label, placeholder);
    if (key === "goal" || key === "next") primaryGrid.appendChild(field);
    else advancedGrid.appendChild(field);
  }

  const advanced = el("details", `${TWEAK_ID}-capsule-more`);
  const advancedSummary = el("summary", `${TWEAK_ID}-capsule-more-summary`);
  advancedSummary.textContent = "More context";
  advanced.append(advancedSummary, advancedGrid);

  const actions = el("div", `${TWEAK_ID}-capsule-actions`);
  actions.append(
    button("Insert Resume Pack", "secondary", () => insertResumePack(state)),
    button("Insert Capsule", "secondary", () => insertCapsule(state)),
    button("Copy", "secondary", () => copyCapsule(state)),
    button("Clear Capsule", "secondary", () => clearCapsule(state)),
  );

  editor.append(primaryGrid, advanced, actions);
  root.append(summary, editor);

  state.capsuleSummary = summary;
  state.capsuleEditor = editor;
  return { root };
}

function capsuleField(state, key, label, placeholder) {
  const wrap = el("label", `${TWEAK_ID}-capsule-field ${TWEAK_ID}-capsule-field-${key}`);
  const text = el("span", `${TWEAK_ID}-capsule-label`);
  text.textContent = label;

  const input = key === "goal" || key === "next"
    ? document.createElement("input")
    : document.createElement("textarea");
  input.className = `${TWEAK_ID}-capsule-input`;
  input.placeholder = placeholder;
  if (input instanceof HTMLTextAreaElement) input.rows = key === "decisions" ? 3 : 2;
  input.addEventListener("input", () => {
    state.capsule[key] = input.value;
    renderCapsule(state);
    scheduleCapsuleSave(state);
  });

  state.capsuleInputs[key] = input;
  wrap.append(text, input);
  return wrap;
}

function toggleCapsuleEditor(state) {
  if (!state.capsuleEditor) return;
  state.capsuleEditor.hidden = !state.capsuleEditor.hidden;
  renderCapsule(state);
}

function loadCapsuleForCurrentProject(state) {
  const nextKey = detectProjectKey();
  state.capsuleProjectKey = nextKey;
  const stored = readStorage(state.api, STORAGE_KEYS.capsulesByProject, {});
  const capsules = stored && typeof stored === "object" ? stored : {};
  state.capsule = normalizeCapsule(capsules?.[nextKey] || {});
}

function scheduleCapsuleSave(state) {
  clearCapsuleSaveTimer(state);
  state.capsuleSaveTimer = setTimeout(() => {
    flushCapsule(state);
    setStatus(state, "Capsule saved");
  }, 200);
}

function flushCapsule(state) {
  clearCapsuleSaveTimer(state);
  const stored = readStorage(state.api, STORAGE_KEYS.capsulesByProject, {});
  const capsules = stored && typeof stored === "object" ? stored : {};
  capsules[state.capsuleProjectKey || "default"] = normalizeCapsule(state.capsule);
  writeStorage(state.api, STORAGE_KEYS.capsulesByProject, capsules);
}

function clearCapsuleSaveTimer(state) {
  if (state.capsuleSaveTimer) clearTimeout(state.capsuleSaveTimer);
  state.capsuleSaveTimer = null;
}

function renderCapsule(state) {
  if (!state.capsuleSummary) return;
  const capsule = normalizeCapsule(state.capsule);
  state.capsule = capsule;

  for (const [key, input] of Object.entries(state.capsuleInputs)) {
    if (document.activeElement !== input && input.value !== capsule[key]) {
      input.value = capsule[key] || "";
    }
  }

  const open = state.capsuleEditor && !state.capsuleEditor.hidden;
  state.capsuleSummary.innerHTML = "";
  state.capsuleSummary.setAttribute("aria-expanded", open ? "true" : "false");
  const text = el("span", `${TWEAK_ID}-capsule-summary-text`);
  text.textContent = summarizeCapsule(capsule);
  const meta = el("span", `${TWEAK_ID}-capsule-summary-meta`);
  meta.textContent = open ? "Hide" : "Edit";
  state.capsuleSummary.append(text, meta);
}

function insertCapsule(state) {
  const text = formatCapsule(state.capsule);
  insertTextIntoFocusTextarea(state, text);
  flushDraft(state);
  flushCapsule(state);
  setStatus(state, "Capsule inserted");
}

async function copyCapsule(state) {
  const text = formatCapsule(state.capsule);
  if (await copyToClipboard(text)) {
    setStatus(state, "Capsule copied");
    setError(state, "");
  } else {
    setError(state, "Could not copy capsule. Use Insert Capsule, then copy from the composer.");
  }
}

function clearCapsule(state) {
  state.capsule = defaultCapsule();
  flushCapsule(state);
  renderCapsule(state);
  setStatus(state, "Capsule cleared");
}

async function copyFocusComposerExport(state) {
  flushDraft(state);
  if (state.capsuleProjectKey) flushCapsule(state);
  const payload = currentFocusComposerExport(state);
  const copied = await copyToClipboard(`${JSON.stringify(payload, null, 2)}\n`);
  if (copied) {
    setStatus(state, "Export JSON copied");
    setError(state, "");
    window.alert("Focus Composer export JSON copied.");
  } else {
    setError(state, "Could not copy Focus Composer export JSON.");
    window.alert("Could not copy Focus Composer export JSON.");
  }
}

async function restoreFocusComposerFromClipboard(state) {
  try {
    const text = await readClipboardText();
    if (!text.trim()) {
      window.alert("Clipboard is empty. Copy a Focus Composer export JSON first.");
      return;
    }
    const payload = normalizeFocusComposerExport(JSON.parse(text));
    writeStorage(state.api, STORAGE_KEYS.draft, payload.draft);
    writeStorage(state.api, STORAGE_KEYS.capsulesByProject, payload.capsulesByProject);
    writeStorage(state.api, STORAGE_KEYS.shortcutEnabled, payload.settings.shortcutEnabled);
    writeStorage(state.api, STORAGE_KEYS.clearDraftOnInsert, payload.settings.clearDraftOnInsert);

    state.shortcutEnabled = payload.settings.shortcutEnabled;
    state.clearDraftOnInsert = payload.settings.clearDraftOnInsert;
    state.activeIssue = payload.activeIssue;
    writeSharedActiveIssue(payload.activeIssue);
    if (state.textarea) {
      state.textarea.value = payload.draft;
      updateTextCount(state);
    }
    loadCapsuleForCurrentProject(state);
    renderCapsule(state);
    renderActiveIssue(state);
    setStatus(state, "Export restored");
    setError(state, "");
    window.alert("Focus Composer export restored.");
  } catch (error) {
    setError(state, `Restore failed: ${error?.message || String(error)}`);
    window.alert(`Focus Composer restore failed:\n${error?.message || String(error)}`);
  }
}

function currentFocusComposerExport(state) {
  return buildFocusComposerExport({
    draft: state.textarea?.value ?? readStorage(state.api, STORAGE_KEYS.draft, ""),
    capsulesByProject: readStorage(state.api, STORAGE_KEYS.capsulesByProject, {}),
    settings: {
      shortcutEnabled: state.shortcutEnabled,
      clearDraftOnInsert: state.clearDraftOnInsert,
    },
    activeIssue: state.activeIssue || readSharedActiveIssue(),
  });
}

function toggleTemplateMenu(state) {
  if (state.templateMenu?.isConnected) closeTemplateMenu(state);
  else openTemplateMenu(state);
}

function openTemplateMenu(state) {
  if (!state.templateHost) return;
  closeTemplateMenu(state);
  const menu = el("div", `${TWEAK_ID}-template-menu`);
  menu.id = TEMPLATE_MENU_ID;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Focus Composer templates");

  const heading = el("div", `${TWEAK_ID}-template-menu-heading`);
  heading.textContent = "Templates";
  menu.append(heading);

  for (const template of listFocusTemplates()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `${TWEAK_ID}-template-item`;
    item.setAttribute("role", "menuitem");
    item.dataset.templateId = template.id;
    const title = el("span", `${TWEAK_ID}-template-title`);
    title.textContent = template.title;
    const subtitle = el("span", `${TWEAK_ID}-template-subtitle`);
    subtitle.textContent = template.subtitle;
    item.append(title, subtitle);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      insertFocusTemplate(state, template.id);
    });
    menu.append(item);
  }

  state.templateHost.append(menu);
  state.templateMenu = menu;
  const first = menu.querySelector(`.${TWEAK_ID}-template-item`);
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function closeTemplateMenu(state) {
  state.templateMenu?.remove?.();
  state.templateMenu = null;
}

function insertFocusTemplate(state, templateId) {
  const text = buildTemplatePrompt(templateId, {
    project: state.projectSnapshot || readSharedResumePack(),
    activeIssue: state.activeIssue || readSharedActiveIssue(),
    capsule: state.capsule,
  });
  insertTextIntoFocusTextarea(state, text);
  flushDraft(state);
  closeTemplateMenu(state);
  setError(state, "");
  setStatus(state, "Template inserted");
}

function insertTextIntoFocusTextarea(state, text) {
  const textarea = state.textarea;
  if (!textarea) return;
  const before = textarea.value.slice(0, textarea.selectionStart ?? textarea.value.length);
  const after = textarea.value.slice(textarea.selectionEnd ?? textarea.value.length);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !text.endsWith("\n") ? "\n\n" : "";
  const insertion = `${prefix}${text}${suffix}`;
  const next = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  updateTextCount(state);
}

function defaultCapsule() {
  return {
    goal: "",
    decisions: "",
    files: "",
    verified: "",
    next: "",
  };
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

function readSharedActiveIssue() {
  try {
    const raw = window.localStorage?.getItem?.(ACTIVE_ISSUE_STORAGE_KEY);
    return normalizeActiveIssue(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeActiveIssue({});
  }
}

function writeSharedActiveIssue(input = {}) {
  try {
    const issue = normalizeActiveIssue(input);
    if (issue.issueId) {
      window.localStorage?.setItem?.(ACTIVE_ISSUE_STORAGE_KEY, JSON.stringify(issue));
    } else {
      window.localStorage?.removeItem?.(ACTIVE_ISSUE_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(ACTIVE_ISSUE_CHANGED_EVENT, { detail: issue.issueId ? issue : null }));
  } catch {}
}

function readSharedResumePack() {
  try {
    const raw = window.localStorage?.getItem?.(RESUME_PACK_STORAGE_KEY);
    return normalizeProjectSnapshot(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeProjectSnapshot({});
  }
}

function normalizeActiveIssue(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const comments = Array.isArray(source.comments) ? source.comments : [];
  return {
    projectPath: String(source.projectPath || "").trim(),
    projectLabel: String(source.projectLabel || "").trim(),
    issueId: String(source.issueId || source.id || "").trim(),
    title: String(source.title || "").trim(),
    description: String(source.description || "").trim(),
    status: String(source.status || "").trim(),
    priority: String(source.priority || "").trim(),
    labels: Array.isArray(source.labels)
      ? source.labels.map((label) => String(label || "").trim()).filter(Boolean).slice(0, 12)
      : [],
    assignee: String(source.assignee || "").trim(),
    dueDate: String(source.dueDate || "").trim(),
    comments: comments.map((comment) => ({
      author: String(comment?.author || "").trim(),
      body: String(comment?.body || "").trim(),
      createdAt: String(comment?.createdAt || "").trim(),
    })).filter((comment) => comment.body).slice(-3),
  };
}

function buildFocusComposerExport(input = {}) {
  return {
    format: "focus-composer-export",
    version: 1,
    exportedAt: exportTimestamp(input.now),
    draft: String(input.draft || ""),
    capsulesByProject: normalizeCapsulesByProject(input.capsulesByProject),
    settings: normalizeComposerSettings(input.settings),
    activeIssue: normalizeActiveIssue(input.activeIssue || {}),
  };
}

function listFocusTemplates() {
  return FOCUS_TEMPLATES.map((template) => ({
    id: template.id,
    title: template.title,
    subtitle: template.subtitle,
    keywords: template.keywords.slice(),
  }));
}

function buildTemplatePrompt(templateId, context = {}) {
  const template = FOCUS_TEMPLATES.find((item) => item.id === templateId) || FOCUS_TEMPLATES[0];
  return [
    template.title,
    "",
    "Context:",
    ...formatTemplateContext(context),
    "",
    ...template.body,
  ].join("\n");
}

function formatTemplateContext(context = {}) {
  const project = normalizeProjectSnapshot(context.project || {});
  const active = normalizeActiveIssue(context.activeIssue?.issueId ? context.activeIssue : project.activeIssue);
  const capsule = normalizeCapsule(context.capsule || {});
  const projectLabel = project.projectLabel || active.projectLabel || project.projectPath || active.projectPath || "";
  const lines = [];
  if (projectLabel) lines.push(`Project: ${projectLabel}`);
  if (project.projectPath && project.projectPath !== projectLabel) lines.push(`Path: ${project.projectPath}`);
  if (active.issueId) {
    lines.push(`Active issue: ${summarizeActiveIssue(active)}`);
    if (active.status) lines.push(`Status: ${active.status}`);
    if (active.priority && active.priority !== "none") lines.push(`Priority: ${active.priority}`);
  }
  if (capsule.goal) lines.push(`Goal: ${capsule.goal}`);
  if (capsule.next) lines.push(`Next: ${capsule.next}`);
  return lines.length ? lines : ["-"];
}

function focusTemplateQuickActionKeywords() {
  const words = ["composer", "template", "prompt"];
  for (const template of FOCUS_TEMPLATES) {
    words.push(template.title.toLowerCase());
    words.push(...template.keywords);
  }
  return [...new Set(words)];
}

function isTemplateMenuLaunch(input = {}) {
  return String(input.kind || input.mode || "").trim().toLowerCase() === "open-template-menu";
}

function focusComposerLayoutConstraints() {
  return {
    panelMaxHeight: "calc(100vh - 48px)",
    composerHeight: "clamp(320px, 46vh, 440px)",
    compactComposerHeight: "clamp(240px, 42vh, 340px)",
    capsuleEditorMaxHeight: "clamp(112px, calc(100vh - 680px), 190px)",
    templateMenuMaxHeight: "min(420px, calc(100vh - 220px))",
    templateMenuOverflowY: "auto",
    mobilePanelMinHeight: "calc(100vh - 24px)",
  };
}

function normalizeFocusComposerExport(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return buildFocusComposerExport({
    now: source.exportedAt,
    draft: source.draft,
    capsulesByProject: source.capsulesByProject,
    settings: source.settings,
    activeIssue: source.activeIssue,
  });
}

function normalizeCapsulesByProject(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const entries = [];
  for (const [key, value] of Object.entries(input)) {
    const projectKey = String(key || "").trim();
    if (projectKey) entries.push([projectKey, normalizeCapsule(value)]);
  }
  return Object.fromEntries(entries);
}

function normalizeComposerSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    shortcutEnabled: typeof source.shortcutEnabled === "boolean" ? source.shortcutEnabled : DEFAULTS.shortcutEnabled,
    clearDraftOnInsert: typeof source.clearDraftOnInsert === "boolean" ? source.clearDraftOnInsert : DEFAULTS.clearDraftOnInsert,
  };
}

function exportTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value || "").trim();
  return text || new Date().toISOString();
}

function normalizeProjectSnapshot(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const openCounts = source.openCounts && typeof source.openCounts === "object" && !Array.isArray(source.openCounts)
    ? Object.fromEntries(Object.entries(source.openCounts).map(([key, value]) => [
      String(key || "").trim(),
      Math.max(0, Number(value) || 0),
    ]).filter(([key]) => key))
    : {};
  const focusIssues = Array.isArray(source.focusIssues) ? source.focusIssues : [];
  return {
    projectPath: String(source.projectPath || "").trim(),
    projectLabel: String(source.projectLabel || "").trim(),
    activeIssue: normalizeActiveIssue(source.activeIssue || {}),
    openCounts,
    focusIssues: focusIssues.map(normalizeResumeIssue).filter((issue) => issue.issueId).slice(0, 8),
  };
}

function normalizeResumeIssue(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: String(source.id || source.issueId || "").trim(),
    issueId: String(source.issueId || source.id || "").trim(),
    title: String(source.title || "").trim(),
    status: String(source.status || "").trim(),
    priority: String(source.priority || "none").trim() || "none",
    assignee: String(source.assignee || "").trim(),
    dueDate: String(source.dueDate || "").trim(),
    labels: Array.isArray(source.labels) ? source.labels.map((label) => String(label || "").trim()).filter(Boolean).slice(0, 12) : [],
  };
}

function summarizeActiveIssue(input) {
  const issue = normalizeActiveIssue(input);
  if (!issue.issueId) return "No active issue";
  return `${issue.issueId} ${issue.title || "Untitled issue"}`.trim();
}

function formatActiveIssue(input) {
  const issue = normalizeActiveIssue(input);
  const lines = [
    "Active Issue",
    "",
    `Project: ${issue.projectLabel || issue.projectPath || "-"}`,
    `Issue: ${summarizeActiveIssue(issue)}`,
  ];
  if (issue.status) lines.push(`Status: ${issue.status}`);
  if (issue.priority && issue.priority !== "none") lines.push(`Priority: ${issue.priority}`);
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee}`);
  if (issue.dueDate) lines.push(`Due: ${issue.dueDate}`);
  if (issue.labels.length) lines.push(`Labels: ${issue.labels.join(", ")}`);
  lines.push("", "Description:", issue.description || "-");
  if (issue.comments.length) {
    lines.push("", "Recent comments:");
    for (const comment of issue.comments) {
      const author = comment.author ? `${comment.author}: ` : "";
      lines.push(`- ${author}${comment.body}`);
    }
  }
  return lines.join("\n");
}

function buildWorkSessionPrompt(input = {}) {
  return [
    "Start work on this Project Home session.",
    "",
    "Use the Session Resume Pack below as the source of truth. First restate the current goal briefly, then continue with the next concrete step.",
    "",
    formatResumePack(input),
  ].join("\n");
}

function buildShipNotePrompt(input = {}) {
  return [
    "End this Project Home session.",
    "",
    "Draft a concise ship note from the Session Resume Pack below. Do not invent missing details; use '-' for anything unknown.",
    "",
    "Ship Note",
    "",
    "Shipped:",
    "- ",
    "",
    "Changed files:",
    "- ",
    "",
    "Verified:",
    "- ",
    "",
    "Risks / not done:",
    "- ",
    "",
    "Next session starter:",
    "- ",
    "",
    formatResumePack(input),
  ].join("\n");
}

function buildLaunchPrompt(input = {}) {
  if (isOpenComposerLaunch(input)) return "";
  return isShipNoteLaunch(input) ? buildShipNotePrompt(input) : buildWorkSessionPrompt(input);
}

function launchStatusFor(input = {}) {
  return isShipNoteLaunch(input) ? "Ship note ready" : "Work session ready";
}

function isShipNoteLaunch(input = {}) {
  return String(input.kind || input.mode || "").trim().toLowerCase() === "ship-note";
}

function isOpenComposerLaunch(input = {}) {
  const kind = String(input.kind || input.mode || "").trim().toLowerCase();
  return kind === "open-composer" || kind === "focus-composer";
}

function formatResumePack(input = {}) {
  const project = normalizeProjectSnapshot(input.project || {});
  const active = normalizeActiveIssue(input.activeIssue?.issueId ? input.activeIssue : project.activeIssue);
  const capsule = normalizeCapsule(input.capsule || {});
  const projectLabel = project.projectLabel || active.projectLabel || project.projectPath || active.projectPath || "-";
  const lines = [
    "Session Resume Pack",
    "",
    "Project:",
    projectLabel,
  ];
  if (project.projectPath && project.projectPath !== projectLabel) lines.push(project.projectPath);

  if (active.issueId) {
    lines.push(
      "",
      "Active Issue:",
      summarizeActiveIssue(active),
    );
    if (active.status) lines.push(`Status: ${active.status}`);
    if (active.priority && active.priority !== "none") lines.push(`Priority: ${active.priority}`);
    if (active.description) lines.push(`Description: ${active.description}`);
  }

  lines.push("", "Context Capsule:");
  appendResumeCapsule(lines, capsule);
  appendResumeOpenWork(lines, project.openCounts);
  appendResumeFocusIssues(lines, project.focusIssues);
  return lines.join("\n");
}

function appendResumeCapsule(lines, capsule) {
  const normalized = normalizeCapsule(capsule);
  if (!Object.values(normalized).some(Boolean)) {
    lines.push("-");
    return;
  }
  if (normalized.goal) lines.push(`Goal: ${normalized.goal}`);
  appendResumeBullets(lines, "Decisions:", normalized.decisions);
  appendResumeBullets(lines, "Files:", normalized.files);
  appendResumeBullets(lines, "Verified:", normalized.verified);
  if (normalized.next) lines.push(`Next: ${normalized.next}`);
}

function appendResumeBullets(lines, label, value) {
  const items = capsuleLines(value);
  if (!items.length) return;
  lines.push(label);
  for (const item of items) lines.push(`- ${item}`);
}

function appendResumeOpenWork(lines, openCounts) {
  const entries = orderedOpenCounts(openCounts);
  if (!entries.length) return;
  lines.push("", "Open Work:");
  for (const [status, count] of entries) lines.push(`- ${status}: ${count}`);
}

function orderedOpenCounts(openCounts) {
  const counts = openCounts && typeof openCounts === "object" ? openCounts : {};
  const preferred = ["backlog", "todo", "in_progress", "in_review"];
  const seen = new Set();
  const out = [];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      out.push([key, Math.max(0, Number(counts[key]) || 0)]);
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(counts)) {
    if (!seen.has(key)) out.push([key, Math.max(0, Number(value) || 0)]);
  }
  return out;
}

function appendResumeFocusIssues(lines, issues) {
  const items = Array.isArray(issues) ? issues.map(normalizeResumeIssue).filter((issue) => issue.issueId) : [];
  if (!items.length) return;
  lines.push("", "Focus Issues:");
  for (const issue of items.slice().sort(compareResumeIssue)) {
    const meta = [issue.priority, issue.status].filter(Boolean).join("/");
    lines.push(`- ${issue.issueId}${meta ? ` [${meta}]` : ""} ${issue.title || "Untitled issue"}`);
  }
}

function compareResumeIssue(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority) ||
    String(a.status || "").localeCompare(String(b.status || "")) ||
    String(a.issueId || "").localeCompare(String(b.issueId || ""));
}

function priorityRank(priority) {
  return ({ urgent: 0, high: 1, medium: 2, low: 3, none: 4 })[String(priority || "none").toLowerCase()] ?? 4;
}

function detectProjectKey() {
  const attrNames = [
    "data-project-path",
    "data-workspace-path",
    "data-root",
    "data-cwd",
    "title",
    "aria-label",
  ];
  const selector = attrNames.map((name) => `[${name}]`).join(",");
  const pathPattern = /(?:~|\/Users\/|\/Volumes\/|\/private\/|[A-Za-z]:\\)[^"'<>]+/;
  for (const node of document.querySelectorAll(selector)) {
    for (const attr of attrNames) {
      const value = node.getAttribute(attr);
      const match = value && value.match(pathPattern);
      if (match) return match[0].trim();
    }
  }

  const titleMatch = document.title?.match(pathPattern);
  if (titleMatch) return titleMatch[0].trim();

  const path = `${location.pathname || ""}${location.search || ""}`.trim();
  return path && path !== "/" ? path : "default";
}

function updateTextCount(state) {
  if (state.count && state.textarea) {
    state.count.textContent = `${state.textarea.value.length} chars`;
  }
}

function scheduleDraftSave(state) {
  setStatus(state, "Saving...");
  clearSaveTimer(state);
  state.saveTimer = setTimeout(() => {
    flushDraft(state);
    setStatus(state, "Saved");
  }, 200);
}

function flushDraft(state) {
  if (!state.textarea) return;
  clearSaveTimer(state);
  writeStorage(state.api, STORAGE_KEYS.draft, state.textarea.value);
}

function clearSaveTimer(state) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

function clearDraft(state) {
  if (state.textarea) state.textarea.value = "";
  writeStorage(state.api, STORAGE_KEYS.draft, "");
  setError(state, "");
  setStatus(state, "Draft cleared");
  state.textarea?.focus();
}

function insertDraft(state) {
  const text = state.textarea?.value ?? "";
  const composer = findComposer() || state.composer;
  if (!composer) {
    setError(state, "Could not find Codex's native composer. Click into a chat input, then try Insert again.");
    return false;
  }
  writeComposerText(composer, text);
  state.composer = composer;
  if (state.clearDraftOnInsert) {
    writeStorage(state.api, STORAGE_KEYS.draft, "");
  } else {
    flushDraft(state);
  }
  setError(state, "");
  setStatus(state, "Inserted");
  closeOverlay(state, { persist: false });
  return true;
}

function sendDraft(state) {
  const text = state.textarea?.value ?? "";
  const composer = findComposer() || state.composer;
  if (!composer) {
    setError(state, "Could not find Codex's native composer. Click into a chat input, then try Send again.");
    return false;
  }

  writeComposerText(composer, text);
  const sendButton = findSendButton(composer);
  if (!sendButton) {
    writeStorage(state.api, STORAGE_KEYS.draft, text);
    setError(state, "Inserted text, but could not find the send button. Send manually from Codex.");
    setStatus(state, "Inserted");
    return false;
  }

  sendButton.click();
  writeStorage(state.api, STORAGE_KEYS.draft, "");
  if (state.textarea) state.textarea.value = "";
  setError(state, "");
  setStatus(state, "Sent");
  closeOverlay(state, { persist: false });
  return true;
}

function startNativeDictation(state) {
  const text = state.textarea?.value ?? "";
  const composer = findComposer() || state.composer;
  if (!composer) {
    setError(state, "Could not find Codex's native composer. Click into a chat input, then try Voice again.");
    return false;
  }

  writeComposerText(composer, text);
  flushDraft(state);
  state.composer = composer;
  closeOverlay(state, { persist: false });

  requestAnimationFrame(() => {
    composer.focus();
    const dictationButton = findDictationButton(composer);
    if (dictationButton) {
      dictationButton.click();
      return;
    }

    const dispatched = dispatchNativeDictationShortcut(composer);
    if (!dispatched) {
      openOverlay(state);
      setError(state, "Inserted text, but could not trigger Codex dictation. Try Codex's native Ctrl+M shortcut.");
    }
  });
  return true;
}

function findComposer() {
  const candidates = [];
  const selectors = [
    "textarea",
    "input[type='text']",
    "input[type='search']",
    "[contenteditable='true']",
    "[role='textbox']",
  ];
  for (const node of document.querySelectorAll(selectors.join(","))) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(`.${TWEAK_ID}-overlay`)) continue;
    if (!isEditable(node)) continue;
    if (!isVisible(node)) continue;
    candidates.push({ node, score: scoreComposerNode(node) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.node ?? null;
}

function scoreComposerNode(node) {
  const rect = node.getBoundingClientRect();
  const active = document.activeElement === node || node.contains(document.activeElement);
  const text = [
    node.getAttribute("placeholder"),
    node.getAttribute("aria-label"),
    node.getAttribute("role"),
    node.getAttribute("data-testid"),
    node.closest("form,[aria-label],[data-testid]")?.getAttribute("aria-label"),
    node.closest("form,[aria-label],[data-testid]")?.getAttribute("data-testid"),
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  if (active) score += 100;
  score += 50;
  if (rect.top > window.innerHeight * 0.45) score += 15;
  if (/(prompt|message|ask|composer|chat)/.test(text)) score += 20;
  score += Math.min(20, Math.round((rect.width * rect.height) / 2000));
  if (node.tagName === "TEXTAREA") score += 10;
  if (node.getAttribute("contenteditable") === "true") score += 5;
  return score;
}

function isEditable(node) {
  if (node instanceof HTMLTextAreaElement) return !node.disabled && !node.readOnly;
  if (node instanceof HTMLInputElement) return !node.disabled && !node.readOnly;
  if (node.getAttribute("contenteditable") === "true") return true;
  return node.getAttribute("role") === "textbox";
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 20 &&
    rect.height > 10 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity || "1") > 0;
}

function readComposerText(node) {
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) return node.value;
  return node.textContent || "";
}

function writeComposerText(node, text) {
  node.focus();
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(node, text);
    else node.value = text;
  } else {
    node.textContent = text;
    moveCaretToEnd(node);
  }
  dispatchInput(node);
}

function dispatchInput(node) {
  try {
    node.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: null,
    }));
  } catch {
    node.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  }
  node.dispatchEvent(new Event("change", { bubbles: true }));
}

function moveCaretToEnd(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function findSendButton(composer) {
  const roots = [];
  let cur = composer;
  for (let i = 0; i < 5 && cur; i += 1) {
    roots.push(cur);
    cur = cur.parentElement;
  }
  const buttons = new Set();
  for (const root of roots) {
    for (const button of root.querySelectorAll?.("button,[role='button']") || []) {
      buttons.add(button);
    }
  }
  if (composer.form) {
    for (const button of composer.form.querySelectorAll("button,[role='button']")) {
      buttons.add(button);
    }
  }

  const scored = [...buttons]
    .filter((button) => button instanceof HTMLElement && isVisible(button) && !isDisabledButton(button))
    .map((button) => ({ button, score: scoreSendButton(button, composer) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.button ?? null;
}

function findDictationButton(composer) {
  const roots = collectNearbyRoots(composer, 7);
  const buttons = new Set();
  for (const root of roots) {
    for (const button of root.querySelectorAll?.("button,[role='button']") || []) {
      buttons.add(button);
    }
  }

  const scored = [...buttons]
    .filter((button) => button instanceof HTMLElement && isVisible(button) && !isDisabledButton(button))
    .map((button) => ({ button, score: scoreDictationButton(button, composer) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.button ?? null;
}

function collectNearbyRoots(node, depth) {
  const roots = [];
  let cur = node;
  for (let i = 0; i < depth && cur; i += 1) {
    roots.push(cur);
    cur = cur.parentElement;
  }
  if (node.form) roots.push(node.form);
  roots.push(document.body);
  return [...new Set(roots)].filter(Boolean);
}

function scoreDictationButton(button, composer) {
  const label = [
    button.textContent,
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("data-testid"),
    button.getAttribute("class"),
    button.innerHTML,
  ].filter(Boolean).join(" ").toLowerCase();
  const rect = button.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();

  let score = 0;
  if (/(dictation|dictate|microphone|voice|speech)/.test(label)) score += 90;
  if (/(mic|audio|record)/.test(label)) score += 25;
  if (rect.top >= composerRect.top - 120 && rect.top <= composerRect.bottom + 80) score += 8;
  if (rect.left >= composerRect.left - 80 && rect.left <= composerRect.right + 120) score += 8;
  if (rect.width <= 80 && rect.height <= 80) score += 4;
  return score;
}

function dispatchNativeDictationShortcut(target) {
  try {
    const options = {
      key: "m",
      code: "KeyM",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    };
    target.dispatchEvent(new KeyboardEvent("keydown", options));
    document.dispatchEvent(new KeyboardEvent("keydown", options));
    window.dispatchEvent(new KeyboardEvent("keydown", options));
    return true;
  } catch {
    return false;
  }
}

function isDisabledButton(button) {
  return button.hasAttribute("disabled") ||
    button.getAttribute("aria-disabled") === "true" ||
    button instanceof HTMLButtonElement && button.disabled;
}

function scoreSendButton(button, composer) {
  const label = [
    button.textContent,
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("data-testid"),
    button.getAttribute("type"),
  ].filter(Boolean).join(" ").toLowerCase();
  const rect = button.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();

  let score = 0;
  if (/(send|submit)/.test(label)) score += 80;
  if (/(arrow|up|paper)/.test(label)) score += 20;
  if (button instanceof HTMLButtonElement && button.type === "submit") score += 30;
  if (rect.left >= composerRect.left - 20 && rect.top >= composerRect.top - 80) score += 10;
  if (rect.left > composerRect.left + composerRect.width * 0.55) score += 8;
  if (rect.width <= 80 && rect.height <= 80) score += 5;
  return score;
}

function setStatus(state, text) {
  if (state.status) state.status.textContent = text;
}

function setError(state, text) {
  if (!state.error) return;
  state.error.textContent = text;
  state.error.hidden = !text;
}

function readStorage(api, key, fallback) {
  try {
    return api.storage?.get?.(key, fallback) ?? fallback;
  } catch (error) {
    api.log?.warn?.("Focus Composer storage read failed", key, error);
    return fallback;
  }
}

function writeStorage(api, key, value) {
  try {
    api.storage?.set?.(key, value);
  } catch (error) {
    api.log?.warn?.("Focus Composer storage write failed", key, error);
  }
}

async function copyToClipboard(text) {
  const value = String(text == null ? "" : text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

async function readClipboardText() {
  try {
    if (navigator.clipboard?.readText) return String(await navigator.clipboard.readText());
  } catch {}
  return String(window.prompt("Paste Focus Composer export JSON") || "");
}

function button(label, variant, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${TWEAK_ID}-button ${TWEAK_ID}-button-${variant}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function getCss() {
  const layout = focusComposerLayoutConstraints();
  return `
html.${TWEAK_ID}-open {
  overflow: hidden;
}

.${TWEAK_ID}-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(7, 10, 15, 0.48);
  color: var(--text-primary, CanvasText);
}

.${TWEAK_ID}-overlay[hidden] {
  display: none;
}

.${TWEAK_ID}-panel {
  width: min(920px, calc(100vw - 48px));
  max-height: ${layout.panelMaxHeight};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, Canvas 97%, CanvasText 3%);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.30);
  overflow: hidden;
}

.${TWEAK_ID}-header,
.${TWEAK_ID}-footer,
.${TWEAK_ID}-actions,
.${TWEAK_ID}-footer-left {
  display: flex;
  align-items: center;
}

.${TWEAK_ID}-header,
.${TWEAK_ID}-footer {
  justify-content: space-between;
  gap: 16px;
}

.${TWEAK_ID}-footer {
  flex: 0 0 auto;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.${TWEAK_ID}-heading {
  min-width: 0;
}

.${TWEAK_ID}-heading h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
  font-weight: 650;
}

.${TWEAK_ID}-heading p,
.${TWEAK_ID}-count,
.${TWEAK_ID}-status {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: color-mix(in srgb, currentColor 58%, transparent);
}

.${TWEAK_ID}-status {
  white-space: nowrap;
}

.${TWEAK_ID}-active-issue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid rgba(16, 185, 129, 0.34);
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
}

.${TWEAK_ID}-active-issue[hidden] {
  display: none;
}

.${TWEAK_ID}-active-issue-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.${TWEAK_ID}-active-issue-label {
  flex: none;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 650;
  color: #047857;
}

.${TWEAK_ID}-active-issue-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
}

.${TWEAK_ID}-active-issue-actions {
  flex: none;
}

.${TWEAK_ID}-capsule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.${TWEAK_ID}-capsule-summary {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 8px;
  color: inherit;
  background: color-mix(in srgb, Canvas 92%, #4f8cff 8%);
  cursor: pointer;
  text-align: left;
}

.${TWEAK_ID}-capsule-summary:hover {
  background: color-mix(in srgb, currentColor 7%, transparent);
}

.${TWEAK_ID}-capsule-summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
}

.${TWEAK_ID}-capsule-summary-meta {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 1.35;
  color: color-mix(in srgb, currentColor 56%, transparent);
}

.${TWEAK_ID}-capsule-editor {
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 8px;
  max-height: ${layout.capsuleEditorMaxHeight};
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, Canvas 98%, CanvasText 2%);
  scrollbar-width: thin;
}

.${TWEAK_ID}-capsule-editor[hidden] {
  display: none;
}

.${TWEAK_ID}-capsule-grid {
  display: grid;
  gap: 8px;
}

.${TWEAK_ID}-capsule-grid-primary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.${TWEAK_ID}-capsule-grid-advanced {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 6px;
}

.${TWEAK_ID}-capsule-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.${TWEAK_ID}-capsule-field-goal,
.${TWEAK_ID}-capsule-field-next {
  grid-column: span 1;
}

.${TWEAK_ID}-capsule-label {
  font-size: 11px;
  line-height: 1.25;
  color: color-mix(in srgb, currentColor 62%, transparent);
}

.${TWEAK_ID}-capsule-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 7px;
  outline: none;
  color: inherit;
  background: Canvas;
  font: 12px/1.35 inherit;
}

textarea.${TWEAK_ID}-capsule-input {
  min-height: 48px;
  max-height: 62px;
  resize: none;
  overflow: auto;
  scrollbar-width: thin;
}

.${TWEAK_ID}-capsule-input:focus {
  border-color: color-mix(in srgb, #4f8cff 72%, currentColor 20%);
  box-shadow: 0 0 0 2px color-mix(in srgb, #4f8cff 16%, transparent);
}

.${TWEAK_ID}-capsule-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.${TWEAK_ID}-capsule-more {
  min-width: 0;
}

.${TWEAK_ID}-capsule-more-summary {
  width: max-content;
  max-width: 100%;
  list-style: none;
  padding: 3px 7px;
  border-radius: 999px;
  color: color-mix(in srgb, currentColor 62%, transparent);
  font-size: 11px;
  line-height: 1.25;
  cursor: pointer;
  user-select: none;
}

.${TWEAK_ID}-capsule-more-summary::-webkit-details-marker {
  display: none;
}

.${TWEAK_ID}-capsule-more-summary:hover,
.${TWEAK_ID}-capsule-more[open] > .${TWEAK_ID}-capsule-more-summary {
  background: color-mix(in srgb, currentColor 7%, transparent);
  color: inherit;
}

.${TWEAK_ID}-textarea {
  width: 100%;
  min-height: 0;
  height: ${layout.composerHeight};
  flex: 0 0 auto;
  resize: none;
  overflow: auto;
  box-sizing: border-box;
  padding: 15px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  outline: none;
  background: Canvas;
  color: inherit;
  font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  scrollbar-width: thin;
}

.${TWEAK_ID}-textarea:focus {
  border-color: color-mix(in srgb, #4f8cff 72%, currentColor 20%);
  box-shadow: 0 0 0 3px color-mix(in srgb, #4f8cff 20%, transparent);
}

.${TWEAK_ID}-error {
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, #d97706 45%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 12%, Canvas 88%);
  color: color-mix(in srgb, #92400e 75%, currentColor 25%);
  font-size: 13px;
  line-height: 1.4;
}

.${TWEAK_ID}-error[hidden] {
  display: none;
}

.${TWEAK_ID}-actions {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.${TWEAK_ID}-template-host {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.${TWEAK_ID}-template-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: min(420px, calc(100vw - 48px));
  max-height: ${layout.templateMenuMaxHeight};
  overflow-y: ${layout.templateMenuOverflowY};
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  background: Canvas;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  z-index: 1;
}

.${TWEAK_ID}-template-menu-heading {
  padding: 5px 7px 8px;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 650;
  color: color-mix(in srgb, currentColor 58%, transparent);
}

.${TWEAK_ID}-template-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.${TWEAK_ID}-template-item:hover,
.${TWEAK_ID}-template-item:focus {
  outline: none;
  background: color-mix(in srgb, #4f8cff 14%, transparent);
}

.${TWEAK_ID}-template-title {
  font-size: 13px;
  line-height: 1.35;
  font-weight: 650;
}

.${TWEAK_ID}-template-subtitle {
  font-size: 12px;
  line-height: 1.35;
  color: color-mix(in srgb, currentColor 58%, transparent);
}

.${TWEAK_ID}-button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.${TWEAK_ID}-button:hover {
  background: color-mix(in srgb, currentColor 7%, transparent);
}

.${TWEAK_ID}-button-primary {
  border-color: color-mix(in srgb, #4f8cff 72%, transparent);
  background: #2563eb;
  color: white;
}

.${TWEAK_ID}-button-primary:hover {
  background: #1d4ed8;
}

@media (max-height: 780px) {
  .${TWEAK_ID}-overlay {
    padding: 16px;
  }

  .${TWEAK_ID}-panel {
    max-height: calc(100vh - 32px);
    gap: 10px;
    padding: 14px;
  }

  .${TWEAK_ID}-capsule-editor {
    max-height: 132px;
  }

  .${TWEAK_ID}-textarea {
    height: ${layout.compactComposerHeight};
  }
}

@media (max-width: 640px) {
  .${TWEAK_ID}-overlay {
    padding: 12px;
  }

  .${TWEAK_ID}-panel {
    width: calc(100vw - 24px);
    max-height: ${layout.mobilePanelMinHeight};
  }

  .${TWEAK_ID}-header,
  .${TWEAK_ID}-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .${TWEAK_ID}-capsule-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .${TWEAK_ID}-capsule-grid-advanced {
    grid-template-columns: minmax(0, 1fr);
  }

  .${TWEAK_ID}-capsule-field-decisions,
  .${TWEAK_ID}-capsule-field-files,
  .${TWEAK_ID}-capsule-field-verified {
    grid-column: auto;
  }

  .${TWEAK_ID}-capsule-editor {
    max-height: 150px;
  }

  .${TWEAK_ID}-textarea {
    height: clamp(220px, 42vh, 360px);
  }

  .${TWEAK_ID}-actions {
    justify-content: stretch;
  }

  .${TWEAK_ID}-template-host {
    width: 100%;
  }

  .${TWEAK_ID}-template-host > .${TWEAK_ID}-button {
    width: 100%;
  }

  .${TWEAK_ID}-template-menu {
    left: 0;
    right: auto;
    width: 100%;
  }

  .${TWEAK_ID}-button {
    flex: 1 1 auto;
  }
}
`;
}

function getSettingsCss() {
  return `
.${TWEAK_ID}-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.${TWEAK_ID}-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 8px;
}

.${TWEAK_ID}-settings-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.${TWEAK_ID}-settings-title {
  font-size: 14px;
}

.${TWEAK_ID}-settings-desc {
  font-size: 12px;
  line-height: 1.35;
  color: color-mix(in srgb, currentColor 58%, transparent);
}

.${TWEAK_ID}-settings-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
`;
}

module.exports.__test = {
  normalizeActiveIssue,
  normalizeProjectSnapshot,
  summarizeActiveIssue,
  formatActiveIssue,
  buildWorkSessionPrompt,
  buildShipNotePrompt,
  buildLaunchPrompt,
  isOpenComposerLaunch,
  buildFocusComposerQuickActions,
  buildFocusComposerKeyboardShortcuts,
  listFocusTemplates,
  buildTemplatePrompt,
  focusComposerLayoutConstraints,
  isTemplateMenuLaunch,
  formatResumePack,
  buildFocusComposerExport,
};
