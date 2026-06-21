const outEl = document.getElementById("out");
const runBtn = document.getElementById("run");
const stopBtn = document.getElementById("stop");
const shareBtn = document.getElementById("share");
const examplesEl = document.getElementById("examples");
const statusEl = document.getElementById("status");
const execInfoEl = document.getElementById("exec-info");
const versionEl = document.getElementById("version");

// Pane controls
const resetBtn = document.getElementById("reset-btn");
const orientationBtn = document.getElementById("orientation-btn");
const orientLine = document.getElementById("orient-line");
const downloadBtn = document.getElementById("download-btn");
const clearBtn = document.getElementById("clear-btn");
const copyOutBtn = document.getElementById("copy-out-btn");
const wrapOutBtn = document.getElementById("wrap-out-btn");
const cursorPosEl = document.getElementById("cursor-pos");
const workspace = document.getElementById("workspace");
const divider = document.getElementById("divider");
const editorPane = document.getElementById("editor-pane");
const outputPane = document.getElementById("output-pane");

// Settings Panel controls
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const panelOverlay = document.getElementById("panel-overlay");
const closeSettings = document.getElementById("close-settings");

// Shortcuts Modal controls
const shortcutsBtn = document.getElementById("shortcuts-btn");
const shortcutsModal = document.getElementById("shortcuts-modal");
const closeShortcuts = document.getElementById("close-shortcuts");

// Preferences inputs
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIcon = document.getElementById("theme-icon");
const themeSelect = document.getElementById("setting-theme");
const fontSizeInput = document.getElementById("setting-font-size");
const fontSizeValEl = document.getElementById("font-size-val");
const tabSizeSelect = document.getElementById("setting-tab-size");
const wrapSelect = document.getElementById("setting-wrap");
const minimapSelect = document.getElementById("setting-minimap");
const autorunSelect = document.getElementById("setting-autorun");

const encoder = new TextEncoder();

function encodeCode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
}

function decodeCode(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

function loadExample(key) {
  return fetch(`./examples/${key}.gengo`, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(`Failed to load example: ${key}`);
    return r.text();
  });
}

function clearShareUrl() {
  const url = new URL(window.location);
  if (url.searchParams.has('code')) {
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url);
  }
}

async function loadAssetManifest() {
  const response = await fetch("./asset-manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load asset manifest: ${response.status}`);
  }

  const manifest = await response.json();
  if (!manifest || typeof manifest.worker !== "string" || typeof manifest.wasm !== "string") {
    throw new Error("Asset manifest is missing worker/wasm entries");
  }

  return manifest;
}

const assetManifestPromise = loadAssetManifest();

const MaxOutputBytes = 128 * 1024;
const RunTimeoutMs = 10000;

let worker = null;
let workerLoadPromise = null;
let runTimer = null;
let outputBytes = 0;
let editor = null;
let startTime = 0;
let autoRunTimeout = null;
let isRunning = false;
let hasStderr = false;
let assetManifest = null;

runBtn.disabled = true;
shareBtn.disabled = true;

// Draggable Splitter Implementation
let isDragging = false;

divider.addEventListener("mousedown", (e) => {
  isDragging = true;
  document.body.style.cursor = workspace.classList.contains("split-vertical") ? "col-resize" : "row-resize";
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const rect = workspace.getBoundingClientRect();
  if (workspace.classList.contains("split-vertical")) {
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    if (percentage > 15 && percentage < 85) {
      editorPane.style.flex = `${percentage}%`;
      outputPane.style.flex = `${100 - percentage}%`;
    }
  } else {
    const percentage = ((e.clientY - rect.top) / rect.height) * 100;
    if (percentage > 15 && percentage < 85) {
      editorPane.style.flex = `${percentage}%`;
      outputPane.style.flex = `${100 - percentage}%`;
    }
  }
  if (editor) {
    editor.layout();
  }
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = "default";
  }
});

// Touch support for splitter
divider.addEventListener("touchstart", (e) => {
  isDragging = true;
  e.preventDefault();
});

document.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  const rect = workspace.getBoundingClientRect();
  const touch = e.touches[0];
  if (workspace.classList.contains("split-vertical")) {
    const percentage = ((touch.clientX - rect.left) / rect.width) * 100;
    if (percentage > 15 && percentage < 85) {
      editorPane.style.flex = `${percentage}%`;
      outputPane.style.flex = `${100 - percentage}%`;
    }
  } else {
    const percentage = ((touch.clientY - rect.top) / rect.height) * 100;
    if (percentage > 15 && percentage < 85) {
      editorPane.style.flex = `${percentage}%`;
      outputPane.style.flex = `${100 - percentage}%`;
    }
  }
  if (editor) {
    editor.layout();
  }
});

document.addEventListener("touchend", () => {
  isDragging = false;
});

// Layout Orientation Toggle
orientationBtn.onclick = () => {
  if (workspace.classList.contains("split-vertical")) {
    workspace.classList.remove("split-vertical");
    workspace.classList.add("split-horizontal");
    orientLine.setAttribute("x1", "3");
    orientLine.setAttribute("y1", "12");
    orientLine.setAttribute("x2", "21");
    orientLine.setAttribute("y2", "12");
  } else {
    workspace.classList.remove("split-horizontal");
    workspace.classList.add("split-vertical");
    orientLine.setAttribute("x1", "12");
    orientLine.setAttribute("y1", "3");
    orientLine.setAttribute("x2", "12");
    orientLine.setAttribute("y2", "21");
  }
  editorPane.style.flex = "50%";
  outputPane.style.flex = "50%";
  if (editor) editor.layout();
  localStorage.setItem("gengo_playground_layout", workspace.classList.contains("split-vertical") ? "vertical" : "horizontal");
};

// Apply layout on startup
const savedLayout = localStorage.getItem("gengo_playground_layout") || "vertical";
if (savedLayout === "horizontal") {
  workspace.classList.remove("split-vertical");
  workspace.classList.add("split-horizontal");
  orientLine.setAttribute("x1", "3");
  orientLine.setAttribute("y1", "12");
  orientLine.setAttribute("x2", "21");
  orientLine.setAttribute("y2", "12");
}

// Settings Drawer Overlay Toggling
function openSettingsDrawer() {
  settingsPanel.classList.add("open");
  panelOverlay.classList.add("open");
}
function closeSettingsDrawer() {
  settingsPanel.classList.remove("open");
  panelOverlay.classList.remove("open");
}
settingsBtn.onclick = openSettingsDrawer;
closeSettings.onclick = closeSettingsDrawer;
panelOverlay.onclick = closeSettingsDrawer;

// Keyboard Shortcuts Modal Toggling
function openShortcutsModal() {
  shortcutsModal.classList.add("open");
}
function closeShortcutsModal() {
  shortcutsModal.classList.remove("open");
}
shortcutsBtn.onclick = openShortcutsModal;
closeShortcuts.onclick = closeShortcutsModal;
shortcutsModal.onclick = (e) => {
  if (e.target === shortcutsModal) closeShortcutsModal();
};

// Clipboard toast feedback
function showToast(message) {
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  toastText.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// Dynamic Theme Toggling
function updateThemeIcon(theme) {
  if (theme === "dark") {
    // Sun icon SVG
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
    themeToggleBtn.title = "Switch to light theme";
  } else {
    // Moon icon SVG
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    `;
    themeToggleBtn.title = "Switch to dark theme";
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeSelect.value = theme;
  updateThemeIcon(theme);
  if (editor) {
    monaco.editor.setTheme(theme === "dark" ? "gengo-dark" : "gengo-light");
  }
  localStorage.setItem("gengo_playground_theme", theme);
}

// Theme Toggle trigger
themeToggleBtn.onclick = () => {
  const newTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(newTheme);
  showToast(`Switched to ${newTheme} theme`);
};

// Monaco Editor Config
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
  monaco.languages.register({ id: 'gengo' });
  monaco.languages.setMonarchTokensProvider('gengo', {
    keywords: [
      'true', 'false', 'null',
      'if', 'else', 'for', 'in', 'switch', 'case', 'default', 'break', 'continue', 'return',
      'func', 'struct', 'interface', 'type', 'subtype', 'variant', 'enum', 'const', 'var', 'pub',
      'and', 'or', 'not',
      'import', 'defer', 'assert', 'trap', 'test',
      'range', 'cycle', 'predicate', 'message'
    ],
    typeKeywords: ['int', 'float', 'decimal', 'bool', 'string', 'rune', 'any', 'error'],
    operators: [
      '=', '>', '<', '~', '?', ':', '==', '<=', '>=', '!=',
      '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
      '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', ':=', '..', '...'
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        [/[a-z_$][\w$]*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@default': 'identifier'
          }
        }],
        [/\.[a-z_$][\w$]*/, 'type.identifier'],
        [/[A-Z][\w$]*/, 'type.identifier'],
        { include: '@whitespace' },
        [/[{}()\[\]]/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }],
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/\\\\.*$/, 'string'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
        [/'[^']*'/, 'string'],
        [/'/, 'string.invalid']
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        ["\\*/", 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],
    },
  });

  // Official Gengoscript Light Theme
  monaco.editor.defineTheme('gengo-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '9a2f5d', fontStyle: 'bold' },
      { token: 'type', foreground: '245f88' },
      { token: 'string', foreground: '1f6a4f' },
      { token: 'comment', foreground: '7a7f8a', fontStyle: 'italic' },
      { token: 'number', foreground: '245f88' },
      { token: 'operator', foreground: '161616' },
    ],
    colors: {
      'editor.background': '#fbfaf6',
      'editor.foreground': '#161616',
      'editorLineNumber.foreground': '#a19e98',
      'editorLineNumber.activeForeground': '#161616',
      'editor.lineHighlightBackground': '#f4f1eb',
      'editor.selectionBackground': '#e4dfd5',
    }
  });

  // Official Gengoscript Dark Theme
  monaco.editor.defineTheme('gengo-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'ff7aa2', fontStyle: 'bold' },
      { token: 'type', foreground: '7cc7ff' },
      { token: 'string', foreground: '7ee0a7' },
      { token: 'comment', foreground: '7f8a96', fontStyle: 'italic' },
      { token: 'number', foreground: '7cc7ff' },
      { token: 'operator', foreground: 'edf1f5' },
    ],
    colors: {
      'editor.background': '#101316',
      'editor.foreground': '#edf1f5',
      'editorLineNumber.foreground': '#4e565f',
      'editorLineNumber.activeForeground': '#edf1f5',
      'editor.lineHighlightBackground': '#151b22',
      'editor.selectionBackground': '#2e3a4e',
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const savedCode = localStorage.getItem("gengo_playground_code");

  let initialPromise;
  if (codeParam) {
    initialPromise = Promise.resolve(decodeCode(codeParam));
  } else if (savedCode) {
    initialPromise = Promise.resolve(savedCode);
  } else {
    initialPromise = loadExample('hello');
  }

  // Load layout preferences
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentTheme = localStorage.getItem("gengo_playground_theme") || (systemPrefersDark ? "dark" : "light");
  const fontSize = parseInt(localStorage.getItem("gengo_playground_font_size") || "14");
  const tabSize = parseInt(localStorage.getItem("gengo_playground_tab_size") || "4");
  const minimapEnabled = localStorage.getItem("gengo_playground_minimap") === "true";
  const lineWrapEnabled = localStorage.getItem("gengo_playground_wrap") !== "false";
  const autoRunEnabled = localStorage.getItem("gengo_playground_autorun") === "true";

  // Pre-fill preferences inputs
  themeSelect.value = currentTheme;
  fontSizeInput.value = fontSize;
  fontSizeValEl.textContent = `${fontSize}px`;
  tabSizeSelect.value = tabSize;
  minimapSelect.checked = minimapEnabled;
  wrapSelect.checked = lineWrapEnabled;
  autorunSelect.checked = autoRunEnabled;

  // Apply visual theme to html element
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeIcon(currentTheme);

  Promise.all([initialPromise, assetManifestPromise]).then(function ([initialCode, manifest]) {
    assetManifest = manifest;
    editor = monaco.editor.create(document.getElementById('editor'), {
      value: initialCode,
      language: 'gengo',
      theme: currentTheme === "dark" ? 'gengo-dark' : 'gengo-light',
      automaticLayout: true,
      minimap: { enabled: minimapEnabled },
      scrollBeyondLastLine: false,
      fontSize: fontSize,
      tabSize: tabSize,
      wordWrap: lineWrapEnabled ? "on" : "off",
      fontFamily: "var(--font-mono)",
      lineNumbersMinChars: 3,
      padding: { top: 16 },
      fixedOverflowWidgets: true
    });

    // Monaco-specific keyboard shortcuts inside the editor frame
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
      if (!isRunning && !runBtn.disabled) runBtn.click();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
      shareBtn.click();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, function () {
      clearBtn.click();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyR, function () {
      resetBtn.click();
    });

    // Cursor position tracking
    editor.onDidChangeCursorPosition((e) => {
      cursorPosEl.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    // Content modification listener (Auto-save, clear errors, auto-run)
    editor.onDidChangeModelContent(() => {
      clearErrorMarkers();
      localStorage.setItem("gengo_playground_code", editor.getValue());

      if (autorunSelect.checked) {
        if (autoRunTimeout) clearTimeout(autoRunTimeout);
        autoRunTimeout = setTimeout(() => {
          if (!isRunning) runBtn.click();
        }, 1500);
      }
    });

    if (!codeParam) {
      examplesEl.value = localStorage.getItem("gengo_playground_example") || 'hello';
    } else {
      examplesEl.value = '';
    }

    runBtn.disabled = false;
    shareBtn.disabled = false;
    preloadWorker().catch(handleWorkerBootstrapError);
  }).catch(handleWorkerBootstrapError);
});

// Settings changes listeners
themeSelect.onchange = () => {
  applyTheme(themeSelect.value);
};

fontSizeInput.oninput = () => {
  const size = fontSizeInput.value;
  fontSizeValEl.textContent = `${size}px`;
  if (editor) {
    editor.updateOptions({ fontSize: parseInt(size) });
  }
  localStorage.setItem("gengo_playground_font_size", size);
};

tabSizeSelect.onchange = () => {
  const size = tabSizeSelect.value;
  if (editor) {
    editor.getModel().updateOptions({ tabSize: parseInt(size) });
  }
  localStorage.setItem("gengo_playground_tab_size", size);
};

minimapSelect.onchange = () => {
  const show = minimapSelect.checked;
  if (editor) {
    editor.updateOptions({ minimap: { enabled: show } });
  }
  localStorage.setItem("gengo_playground_minimap", show ? "true" : "false");
};

wrapSelect.onchange = () => {
  const wrap = wrapSelect.checked;
  if (editor) {
    editor.updateOptions({ wordWrap: wrap ? "on" : "off" });
  }
  localStorage.setItem("gengo_playground_wrap", wrap ? "true" : "false");
};

autorunSelect.onchange = () => {
  localStorage.setItem("gengo_playground_autorun", autorunSelect.checked ? "true" : "false");
};

// Monaco Error Highlighting (Diagnostics)
function showErrorMarker(message, line, col) {
  if (!editor) return;
  const model = editor.getModel();
  const marker = {
    severity: monaco.MarkerSeverity.Error,
    message: message,
    startLineNumber: line,
    startColumn: col,
    endLineNumber: line,
    endColumn: col + 5
  };
  monaco.editor.setModelMarkers(model, "gengo", [marker]);
}

function clearErrorMarkers() {
  if (!editor) return;
  monaco.editor.setModelMarkers(editor.getModel(), "gengo", []);
}

// Output panel actions
const savedOutputWrap = localStorage.getItem("gengo_playground_output_wrap");
if (savedOutputWrap === "true") {
  outEl.classList.remove("word-wrap-off");
  wrapOutBtn.style.color = "var(--accent)";
} else {
  outEl.classList.add("word-wrap-off");
}

clearBtn.onclick = () => {
  outEl.innerHTML = "";
  outputBytes = 0;
};

copyOutBtn.onclick = () => {
  navigator.clipboard.writeText(outEl.textContent || "");
  showToast("Output copied to clipboard!");
};

wrapOutBtn.onclick = () => {
  outEl.classList.toggle("word-wrap-off");
  const isWrapped = !outEl.classList.contains("word-wrap-off");
  wrapOutBtn.style.color = isWrapped ? "var(--accent)" : "";
  localStorage.setItem("gengo_playground_output_wrap", isWrapped ? "true" : "false");
};

// Appending output logic
function appendOutput(text, isError) {
  const n = encoder.encode(text).length;
  if (outputBytes >= MaxOutputBytes) return;

  const span = document.createElement("span");
  if (isError) span.style.color = "var(--err)";

  if (outputBytes + n > MaxOutputBytes) {
    const remaining = MaxOutputBytes - outputBytes;
    if (remaining > 0) span.textContent = text.slice(0, remaining);
    const truncated = document.createElement("div");
    truncated.textContent = "\n[output truncated]";
    truncated.style.color = "var(--syntax-comment)";
    outEl.appendChild(span);
    outEl.appendChild(truncated);
    outputBytes = MaxOutputBytes;
    return;
  }

  span.textContent = text;
  outEl.appendChild(span);
  outputBytes += n;
  outEl.scrollTop = outEl.scrollHeight;
}

function formatDuration(elapsedMs) {
  if (elapsedMs >= 1000) {
    return `${(elapsedMs / 1000).toFixed(2)}s`;
  }
  if (elapsedMs >= 1) {
    return `${elapsedMs.toFixed(2)}ms`;
  }
  return `${(elapsedMs * 1000).toFixed(2)}us`;
}

function setIdle(status, isError) {
  isRunning = false;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  if (runTimer) { clearTimeout(runTimer); runTimer = null; }
  statusEl.innerHTML = `<span class="badge ${isError ? 'error' : 'success'}">${status}</span>`;
  const elapsedMs = performance.now() - startTime;
  if (startTime > 0) execInfoEl.textContent = `Finished in ${formatDuration(elapsedMs)}`;
}

function stopRun(reason) {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerLoadPromise = null;
  setIdle(reason || "Stopped", true);
  preloadWorker().catch(handleWorkerBootstrapError);
}

function handleWorkerBootstrapError(err) {
  const message = String((err && (err.stack || err.message)) || err);
  if (versionEl) versionEl.textContent = "Gengoscript unavailable";
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerLoadPromise = null;
  if (isRunning) {
    appendOutput(message + "\n", true);
    setIdle("Error", true);
  }
}

function setupWorkerListeners(w) {
  w.onmessage = function (evt) {
    const msg = evt.data;
    if (msg.kind === "stdout") { appendOutput(msg.text); return; }
    if (msg.kind === "stderr") { hasStderr = true; appendOutput(msg.text, true); return; }
    if (msg.kind === "done") { setIdle(hasStderr ? "Error" : "Success", hasStderr); return; }
    if (msg.kind === "version") { if (versionEl) versionEl.textContent = "Gengoscript v" + msg.version + " (WASM)"; return; }
    if (msg.kind === "ready") { return; }
    if (msg.kind === "init-error") {
      handleWorkerBootstrapError(msg.error || "Failed to initialize worker");
      return;
    }
    if (msg.kind === "error") {
      appendOutput((msg.error || "unknown error") + "\n", true);
      setIdle("Error", true);
      if (msg.line > 0) {
        showErrorMarker(msg.message || "Compilation/Runtime Error", msg.line, msg.col || 1);
      }
      return;
    }
  };

  w.onerror = function (err) {
    appendOutput(String(err.message || err) + "\n", true);
    setIdle("Worker error", true);
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerLoadPromise = null;
    preloadWorker().catch(handleWorkerBootstrapError);
  };
}

async function preloadWorker() {
  if (worker) return worker;
  if (workerLoadPromise) return workerLoadPromise;

  workerLoadPromise = (async () => {
    const manifest = assetManifest || await assetManifestPromise;
    const nextWorker = new Worker(manifest.worker, { type: "module" });
    setupWorkerListeners(nextWorker);
    nextWorker.postMessage({ kind: "init", wasmUrl: manifest.wasm });
    worker = nextWorker;
    return nextWorker;
  })();

  try {
    return await workerLoadPromise;
  } catch (err) {
    workerLoadPromise = null;
    throw err;
  }
}

runBtn.onclick = async function () {
  if (isRunning || !editor) return;
  isRunning = true;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  outEl.innerHTML = "";
  outputBytes = 0;
  hasStderr = false;
  clearErrorMarkers();
  statusEl.innerHTML = `<span class="badge running">Running...</span>`;
  
  startTime = performance.now();
  execInfoEl.textContent = "";

  try {
    await preloadWorker();
  } catch (err) {
    handleWorkerBootstrapError(err);
    return;
  }

  runTimer = setTimeout(function () {
    appendOutput("\n[terminated: timeout]\n", true);
    stopRun("Timeout");
  }, RunTimeoutMs);

  worker.postMessage({ kind: "run", script: editor.getValue(), wasmUrl: assetManifest.wasm });
};

stopBtn.onclick = function () {
  appendOutput("\n[terminated: stopped]\n", true);
  stopRun("Stopped");
};

function updateUrl(code) {
  const url = new URL(window.location);
  url.searchParams.set('code', encodeCode(code));
  window.history.pushState({}, '', url);
}

// Download script code
downloadBtn.onclick = () => {
  if (!editor) return;
  const val = examplesEl.value || "script";
  const blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${val}.gengo`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Code downloaded successfully!");
};

// Reset script button
resetBtn.onclick = () => {
  const val = examplesEl.value || 'hello';
  loadExample(val).then(function (code) {
    editor.setValue(code);
    clearShareUrl();
    clearErrorMarkers();
    localStorage.setItem("gengo_playground_code", code);
    showToast(`Reset code to example: ${val}`);
  });
};

// Share Button clicked
shareBtn.onclick = function () {
  if (!editor) return;
  const code = editor.getValue();
  updateUrl(code);
  navigator.clipboard.writeText(window.location.href);
  showToast("Shareable link copied to clipboard!");
};

examplesEl.onchange = function () {
  if (!editor) return;
  const val = examplesEl.value;
  if (!val) return;
  loadExample(val).then(function (code) {
    editor.setValue(code);
    clearShareUrl();
    clearErrorMarkers();
    localStorage.setItem("gengo_playground_example", val);
    localStorage.setItem("gengo_playground_code", code);
  });
};

// Global Hotkeys Listener
window.addEventListener('keydown', function (e) {
  // Ctrl + Enter to Run code
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!isRunning && !runBtn.disabled) runBtn.click();
  }
  // Ctrl + S to Share code
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    shareBtn.click();
  }
  // Ctrl + L to Clear Output
  if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
    e.preventDefault();
    clearBtn.click();
  }
  // Ctrl + Alt + R to Reset template
  if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'r') {
    e.preventDefault();
    resetBtn.click();
  }
  // Esc to close overlays
  if (e.key === 'Escape') {
    closeSettingsDrawer();
    closeShortcutsModal();
  }
});
