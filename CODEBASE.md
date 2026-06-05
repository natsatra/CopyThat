# CopyThat — Codebase Documentation

This document explains how `popup.html` and `popup.js` are structured, how they interact, and what each piece of code does.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [popup.html](#popuphtml)
   - [Layout Structure](#layout-structure)
   - [Sidebar](#sidebar)
   - [Editor Area](#editor-area)
   - [CSS: Key Patterns](#css-key-patterns)
3. [popup.js](#popupjs)
   - [Storage Setup](#storage-setup)
   - [Constants](#constants)
   - [The Tab Class](#the-tab-class)
   - [Initialization (`init`)](#initialization-init)
   - [Saving Data (`saveState`)](#saving-data-savestate)
   - [Rendering Tabs (`renderTabs`)](#rendering-tabs-rendertabs)
   - [Building a Tab Button (`buildTabButton`)](#building-a-tab-button-buildtabbutton)
   - [Tab Switching and Content Loading](#tab-switching-and-content-loading)
   - [Saving Editor Content](#saving-editor-content)
   - [Title Saving and Character Enforcement](#title-saving-and-character-enforcement)
   - [Character Limit Enforcement](#character-limit-enforcement)
   - [Paste Handling](#paste-handling)
   - [Edit Mode](#edit-mode)
   - [Drag and Drop](#drag-and-drop)
   - [Color Swatch Picker](#color-swatch-picker)
   - [Footer: Timestamp and Character Count](#footer-timestamp-and-character-count)
   - [Inline Tab Rename](#inline-tab-rename)
   - [Copy to Clipboard](#copy-to-clipboard)
   - [Toast Notifications](#toast-notifications)
   - [Sidebar Keyboard Navigation](#sidebar-keyboard-navigation)
4. [How HTML and JS Pair Up](#how-html-and-js-pair-up)
5. [Storage Architecture](#storage-architecture)

---

## Project Overview

CopyThat is a browser extension popup (Chrome and Firefox). It opens a 500×550px panel with:
- A **left sidebar** listing tabs (up to 20)
- A **right editor area** for typing/pasting text or code snippets
- A **copy button** to send the active tab's content to the clipboard

All data is saved to `chrome.storage.local` (or `browser.storage.local` in Firefox) with no server or account required.

---

## popup.html

### Layout Structure

The `<body>` is a horizontal flexbox row, fixed to 500×550px:

```html
<body> <!-- flex-direction: row -->
  <div class="sidebar">      <!-- 160px wide, fixed -->
    ...
  </div>
  <div id="editor-container"> <!-- flex: 1, fills remaining space -->
    ...
  </div>
  <div id="copy-toast"></div>
</body>
```

The sidebar is `160px` wide and `flex-shrink: 0` so it never collapses. The editor container takes all remaining width.

---

### Sidebar

The sidebar has two parts: a controls bar at the top, and the scrollable tab list below.

#### Controls Bar

The controls bar (`div.sidebar-controls`) holds two swappable views:

```html
<div class="sidebar-controls">
  <!-- Shown in normal mode -->
  <div id="default-controls">
    <div id="tab-count">0 tabs</div>
    <button id="edit-mode-btn">...</button>  <!-- list icon -->
    <button id="new-tab-btn">...</button>    <!-- + icon -->
  </div>

  <!-- Shown in edit mode (display: none by default) -->
  <div id="edit-controls">
    <button id="select-all-btn">...</button>
    <button id="delete-selected-btn">...</button>  <!-- trash icon -->
    <button id="cancel-edit-btn">...</button>       <!-- × icon -->
  </div>
</div>
```

JS toggles between these by setting `display: flex` or `display: none` on each div.

#### Tab List

```html
<nav class="tab-bar" id="tab-nav-bar">
  <!-- Tab buttons are injected here by renderTabs() in popup.js -->
</nav>
```

This `<nav>` is empty in the HTML — every `<button>` inside it is created programmatically by JavaScript.

---

### Editor Area

```html
<div id="editor-container">

  <!-- Copy button — top-right corner, absolutely positioned -->
  <button id="copy-tab-content-btn">...</button>

  <!-- Scrollable writing area -->
  <div class="editor-content">
    <h2 id="document-title" contenteditable="true" placeholder="Title"></h2>
    <div id="editor" contenteditable="true" spellcheck="false"
         placeholder="Type something..."></div>
  </div>

  <!-- Footer bar — always visible at the bottom -->
  <div class="editor-footer">
    <div id="updated-at"></div>    <!-- left: "Edited 3m ago" -->
    <div id="word-count">0 words</div>  <!-- right: "240 of 25000 characters" -->
  </div>

</div>
```

Both `#document-title` and `#editor` use `contenteditable="true"` — they are plain HTML elements that act as text inputs without a `<textarea>`. The placeholder text is a pure CSS trick using `:empty:before`.

The `editor-footer` is a flex child of `#editor-container`, so it always sticks to the bottom and never overlaps the scrollable content above it.

---

### CSS: Key Patterns

#### Tab button color via CSS variable

Each tab button gets its background set through a CSS custom property `--tab-bg`, written by JS:

```css
.tab-btn {
  background-color: var(--tab-bg, transparent);
}
```

JS calls `btn.style.setProperty('--tab-bg', color)` per button, so each tab shows its own pastel color without needing inline `style` attributes or class combinators.

#### Active tab indicator

The active tab shows a teal left border and no brightness filter:

```css
.tab-btn.active {
  border-left-color: #2e7d7a;
  background-color: var(--tab-bg) !important;
  box-shadow: inset 2px 0 0 #2e7d7a;
  filter: none;
}
```

The `--active-tab-bg` variable is also set on `document.documentElement` so the editor background matches the active tab's color:

```css
#editor-container {
  background-color: var(--active-tab-bg);
  transition: background-color 0.3s ease;
}
```

#### Color dot (swatch trigger)

The colored circle on each tab is hidden until hover:

```css
.color-dot {
  opacity: 0;
  transition: opacity 0.2s, transform 0.15s;
}
.tab-btn:hover .color-dot {
  opacity: 1;
}
.color-dot:hover {
  transform: scale(1.25);
}
```

#### Tab title wrapping

Titles wrap to two lines before truncating with an ellipsis:

```css
.tab-btn span.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
```

#### Editor placeholder

The placeholder disappears once any content is present via the `:empty` pseudo-class:

```css
#editor:empty:before {
  content: attr(placeholder);
  color: #64748b;
  opacity: 0.7;
  pointer-events: none;
}
```

If the editor is left with only a `<br>` tag (from pressing Backspace), JS resets `innerHTML` to `''` to re-trigger `:empty`.

#### Swatch picker overlay

The picker is `position: fixed` so it appears above everything without affecting layout:

```css
.swatch-picker {
  position: fixed;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  z-index: 1000;
}
```

---

## popup.js

All logic runs inside a single `DOMContentLoaded` listener to ensure the HTML is ready before any element lookups.

### Storage Setup

The first line inside the listener sets up a unified storage reference that works in both Chrome and Firefox:

```js
const storage = (typeof browser !== 'undefined' ? browser : chrome).storage.local;
```

- Firefox exposes the WebExtension API as `browser` (returns Promises natively).
- Chrome exposes it as `chrome` (also supports Promises in MV3).
- This one-liner picks whichever is available, so the rest of the code can call `storage.get(...)` and `storage.set(...)` identically in both browsers.

---

### Constants

```js
const WELCOME_TITLE = "Welcome to CopyThat!";
const WELCOME_CONTENT = "...";  // Onboarding text shown to new users

const TAB_COLORS = [
    '#b5e5e3', '#afced0', '#d1efee', '#ede3c0', '#d8ceaf'
];

const SWATCH_COLORS = [
    '#b5e5e3', '#afced0', '#d1efee',
    '#c5d8e8', '#d4d8f0', '#cce0d4',
    '#ede3c0', '#d8ceaf', '#e8d5c4',
];

const TITLE_MAX_LENGTH = 50;    // Characters allowed in tab title
const CONTENT_MAX_CHARS = 25000; // Characters allowed in editor body
```

`TAB_COLORS` is the rotation palette — new tabs cycle through these 5 colors in order. `SWATCH_COLORS` is the 9-color grid shown in the picker when a user clicks the color dot.

---

### The Tab Class

```js
class Tab {
    constructor(title, content, color) {
        this.id = Date.now();     // Unique ID (millisecond timestamp)
        this.title = title || "New Note";
        this.content = content || "";
        this.color = color;
        this.updatedAt = Date.now();
    }
}
```

Each tab is a plain object with five fields. `id` uses `Date.now()` as a unique identifier — since tabs are created one at a time, millisecond timestamps don't collide. The object is stored directly in `chrome.storage.local` under the key `tab_${id}`.

---

### Initialization (`init`)

`init()` runs once when the popup opens. It loads saved data from storage, migrates old data if needed, and then renders the UI.

```js
async function init() {
    const meta = await storage.get(['myExtensionTabIds', 'myExtensionActiveId', 'myExtensionTabs']);

    if (meta.myExtensionTabIds) {
        // Load from new per-tab storage format
        const tabKeys = meta.myExtensionTabIds.map(id => `tab_${id}`);
        const tabData = tabKeys.length ? await storage.get(tabKeys) : {};
        tabs = meta.myExtensionTabIds.map(id => tabData[`tab_${id}`]).filter(Boolean);
        activeTabId = meta.myExtensionActiveId ?? tabs[0]?.id;

    } else if (meta.myExtensionTabs) {
        // Migrate from old single-array format
        tabs = meta.myExtensionTabs;
        activeTabId = meta.myExtensionActiveId ?? tabs[0]?.id;
        await storage.remove('myExtensionTabs');
        saveState(); // re-save in new format
    }

    if (!tabs.length || !activeTabId) {
        // First run: create the welcome tab
        const initialTab = new Tab(WELCOME_TITLE, WELCOME_CONTENT, TAB_COLORS[0]);
        tabs.push(initialTab);
        activeTabId = initialTab.id;
        saveState();
    }

    renderTabs();
    loadTabContent(activeTabId);
    // ... attach event listeners
}
```

The two-step load (`myExtensionTabIds` first, then individual `tab_${id}` keys) allows each tab to live in its own storage slot — avoiding the per-item size limit that would apply if all tabs were stored in a single array.

---

### Saving Data (`saveState`)

```js
function saveState() {
    const storageData = {
        myExtensionTabIds: tabs.map(t => t.id),  // ordered list of IDs
        myExtensionActiveId: activeTabId,
    };
    tabs.forEach(tab => {
        storageData[`tab_${tab.id}`] = tab;  // each tab stored separately
    });
    storage.set(storageData).catch(() => {
        showToast("Storage limit reached. Try deleting some tabs.");
    });
}
```

And its debounced version, used for frequent events like typing:

```js
const debouncedSaveState = debounce(saveState, 400);
```

`debounce` delays execution by 400ms and resets the timer on every call, so rapid keystrokes only trigger one storage write after the user pauses.

---

### Rendering Tabs (`renderTabs`)

`renderTabs` updates the sidebar without destroying and rebuilding the entire DOM. This avoids losing scroll position or triggering unnecessary reflows.

```js
function renderTabs() {
    // 1. Snapshot all currently rendered buttons
    const existingBtns = new Map();
    tabNavBar.querySelectorAll('.tab-btn').forEach(btn => {
        existingBtns.set(Number(btn.dataset.tabId), btn);
    });

    tabs.forEach((tab, index) => {
        const isActive = tab.id === activeTabId;
        const color = tab.color ?? TAB_COLORS[index % TAB_COLORS.length];

        if (isActive) {
            // Sync the editor background color to the active tab
            document.documentElement.style.setProperty('--active-tab-bg', color);
        }

        let btn = existingBtns.get(tab.id);

        if (btn) {
            existingBtns.delete(tab.id); // mark as still in use

            // If mode changed (edit vs normal), the button structure differs — rebuild
            const btnInEditMode = !!btn.querySelector('.tab-checkbox');
            if (btnInEditMode !== isEditMode) {
                const newBtn = buildTabButton(tab, index, isActive, color);
                btn.replaceWith(newBtn);
                btn = newBtn;
            } else {
                // Otherwise just update properties in place
                btn.className = `tab-btn${isActive ? ' active' : ''}`;
                btn.style.setProperty('--tab-bg', color);
                btn.querySelector('.title').textContent = tab.title;
                if (isEditMode) {
                    btn.querySelector('.tab-checkbox').checked = selectedTabIds.has(tab.id);
                }
            }
        } else {
            btn = buildTabButton(tab, index, isActive, color); // new tab
        }

        tabNavBar.appendChild(btn); // appendChild on existing node = reorder for free
    });

    // Remove buttons for deleted tabs
    existingBtns.forEach(btn => btn.remove());

    tabCountEl.textContent = `${tabs.length} tab${tabs.length === 1 ? '' : 's'}`;
}
```

Using `appendChild` on an already-attached node moves it to the end, so the loop naturally reorders buttons to match the `tabs` array without any index math.

---

### Building a Tab Button (`buildTabButton`)

This function constructs the DOM for a single tab button. Its structure differs between normal and edit mode:

```js
function buildTabButton(tab, index, isActive, color) {
    const btn = document.createElement('button');
    btn.className = `tab-btn${isActive ? ' active' : ''}`;
    btn.dataset.tabId = tab.id;
    btn.dataset.index = index;
    btn.style.setProperty('--tab-bg', color);

    // In normal mode: enable drag and drop
    if (!isEditMode) {
        btn.draggable = true;
        btn.addEventListener('dragstart', handleDragStart);
        // ... other drag listeners
    }

    // In edit mode: prepend a checkbox
    if (isEditMode) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedTabIds.has(tab.id);
        btn.appendChild(checkbox);
    }

    // Always: title text
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = tab.title;
    btn.appendChild(titleSpan);

    // In normal mode: color dot on the right
    if (!isEditMode) {
        const colorDot = document.createElement('span');
        colorDot.className = 'color-dot';
        colorDot.style.backgroundColor = color;
        colorDot.addEventListener('click', (e) => {
            e.stopPropagation(); // don't also switch tabs
            showSwatchPicker(tab, colorDot);
        });
        btn.appendChild(colorDot);
    }

    btn.onclick = () => {
        if (isEditMode) toggleTabSelection(tab.id);
        else switchTab(tab.id);
    };

    return btn;
}
```

Normal mode layout: `[title span] [color dot]`  
Edit mode layout: `[checkbox] [title span]`

---

### Tab Switching and Content Loading

```js
function switchTab(id) {
    if (id === activeTabId) return;
    syncContent();       // save current editor state before switching
    activeTabId = id;
    loadTabContent(id);  // populate editor with new tab's data
    renderTabs();
    tabNavBar.querySelector('.tab-btn.active')?.scrollIntoView({ block: 'nearest' });
    saveState();
}

function loadTabContent(id) {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
        documentTitle.innerText = tab.title;
        editor.innerText = tab.content;
        updateWordCount();
        updateTimestamp(tab.updatedAt);
    }
}
```

`syncContent` reads the current editor values back into the in-memory `tabs` array before any navigation away, so nothing is lost on switch.

```js
function syncContent() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.content = editor.innerText;
        tab.updatedAt = Date.now();
        updateWordCount();
        updateTimestamp(tab.updatedAt);
    }
}
```

---

### Saving Editor Content

`saveContent` is called on every `input` event in the editor. It also handles the edge case where the browser leaves a stray `<br>` after all content is deleted, which would prevent the placeholder from reappearing:

```js
function saveContent() {
    if (editor.innerHTML === '<br>') editor.innerHTML = ''; // re-enable :empty CSS
    syncContent();
    debouncedSaveState(); // write to storage after 400ms of inactivity
}
```

---

### Title Saving and Character Enforcement

```js
function saveTitle() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        const text = documentTitle.innerText;
        if (text.length > TITLE_MAX_LENGTH) {
            // Hard-trim and move cursor to end
            documentTitle.innerText = text.substring(0, TITLE_MAX_LENGTH);
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(documentTitle);
            range.collapse(false); // cursor to end
            sel.removeAllRanges();
            sel.addRange(range);
        }
        tab.title = documentTitle.innerText || "Untitled";
        tab.updatedAt = Date.now();
        updateTimestamp(tab.updatedAt);
        // Debounce the sidebar re-render so it doesn't flash on every keystroke
        clearTimeout(window.renderTimeout);
        window.renderTimeout = setTimeout(renderTabs, 500);
        debouncedSaveState();
    }
}
```

The cursor repositioning after trimming is necessary because setting `innerText` moves the cursor to the start — without it, the user would have to click back to the end to keep typing.

---

### Character Limit Enforcement

The `keydown` event blocks new characters when the limit is reached. It only fires for visible characters and Enter (not Backspace, arrow keys, or shortcuts):

```js
editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // allow shortcuts
    if (e.key.length !== 1 && e.key !== 'Enter') return; // skip nav keys
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return; // allow replacing selected text
    if (editor.innerText.length >= CONTENT_MAX_CHARS) {
        e.preventDefault();
        showToast(`Character limit of ${CONTENT_MAX_CHARS} reached.`);
    }
});
```

The `sel.toString().length > 0` check is important: if the user has selected 500 characters and presses a key, that replaces the selection (net zero or negative) — blocking it would be wrong.

---

### Paste Handling

Paste is handled separately because pasting bypasses `keydown`. The handler prevents the default browser paste (which would insert HTML), extracts plain text, truncates it to fit, and inserts it using the Selection API:

```js
editor.addEventListener('paste', (e) => {
    e.preventDefault(); // block default HTML paste
    const text = e.clipboardData.getData('text/plain');
    const remaining = CONTENT_MAX_CHARS - editor.innerText.length;
    const textToInsert = text.slice(0, remaining);
    if (text.length > remaining) showToast(`Character limit of ${CONTENT_MAX_CHARS} reached.`);

    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    sel.deleteFromDocument();  // remove any selected text first
    sel.getRangeAt(0).insertNode(document.createTextNode(textToInsert));
    sel.collapseToEnd();
    saveContent();
});
```

`document.createTextNode` is used instead of `execCommand('insertText')` because `execCommand` is deprecated in Firefox.

---

### Edit Mode

Edit mode replaces the normal sidebar controls with bulk-selection controls and adds checkboxes to each tab button.

```js
function toggleEditMode() {
    isEditMode = !isEditMode;
    selectedTabIds.clear(); // always start fresh
    if (isEditMode) {
        defaultControls.style.display = 'none';
        editControls.style.display = 'flex';
    } else {
        defaultControls.style.display = 'flex';
        editControls.style.display = 'none';
    }
    renderTabs(); // rebuild buttons for the new mode
}
```

```js
function deleteSelectedTabs() {
    if (selectedTabIds.size === 0) return;
    if (confirm(`Delete ${selectedTabIds.size} selected tabs?`)) {
        // Remove deleted tab keys from storage
        storage.remove(tabs.filter(t => selectedTabIds.has(t.id)).map(t => `tab_${t.id}`));
        tabs = tabs.filter(t => !selectedTabIds.has(t.id));

        // If the active tab was deleted, switch to first remaining tab
        // If no tabs remain, restore the welcome tab
        if (selectedTabIds.has(activeTabId) || tabs.length === 0) {
            if (tabs.length > 0) {
                activeTabId = tabs[0].id;
            } else {
                const newTab = new Tab("New note", "", TAB_COLORS[0]);
                tabs.push(newTab);
                activeTabId = newTab.id;
            }
        }

        toggleEditMode(); // exit edit mode after deletion
        loadTabContent(activeTabId);
        saveState();
    }
}
```

---

### Drag and Drop

Tabs can be reordered by dragging. Each button gets HTML5 drag-and-drop event listeners (only in normal mode):

| Event | Handler | What it does |
|---|---|---|
| `dragstart` | `handleDragStart` | Records the source index; fades the dragged button |
| `dragover` | `handleDragOver` | Prevents default to allow dropping |
| `dragenter` | `handleDragEnter` | Adds `.drag-over` class (shows a top border) |
| `dragleave` | `handleDragLeave` | Removes `.drag-over` class |
| `dragend` | `handleDragEnd` | Restores opacity; clears all `.drag-over` classes |
| `drop` | `handleDrop` | Splices the `tabs` array and re-renders |

```js
function handleDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    const sourceIndex = draggedTabIndex;

    if (!isNaN(sourceIndex) && sourceIndex !== targetIndex) {
        const itemToMove = tabs[sourceIndex];
        tabs.splice(sourceIndex, 1);
        tabs.splice(targetIndex, 0, itemToMove);
        saveState();
        renderTabs();
    }
}
```

---

### Color Swatch Picker

The swatch picker is created on demand and appended directly to `<body>` as a `position: fixed` div. Only one picker can be open at a time.

```js
function showSwatchPicker(tab, triggerEl) {
    hideSwatchPicker(); // close any existing picker first
    const picker = document.createElement('div');
    picker.className = 'swatch-picker';

    SWATCH_COLORS.forEach(color => {
        const swatch = document.createElement('button');
        swatch.className = `swatch-option${tab.color === color ? ' selected' : ''}`;
        swatch.style.backgroundColor = color;
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            tab.color = color;
            hideSwatchPicker();
            renderTabs();
            saveState();
        });
        picker.appendChild(swatch);
    });

    document.body.appendChild(picker);
    activeSwatchPicker = picker;

    // Position: left edge of sidebar, clamped so it never goes off the bottom
    const rect = triggerEl.getBoundingClientRect();
    picker.style.left = '4px';
    picker.style.top = `${Math.min(rect.top, window.innerHeight - 130)}px`;

    // Close when clicking anywhere else
    setTimeout(() => {
        document.addEventListener('click', hideSwatchPicker, { once: true });
    }, 0);
}
```

The `setTimeout(..., 0)` delay before attaching the `click` listener is important: without it, the click that opened the picker would immediately close it (the event bubbles up to `document` in the same tick).

---

### Footer: Timestamp and Character Count

#### Character count

```js
function updateWordCount() {
    const used = editor.innerText.length;
    wordCountEl.textContent = `${used} of ${CONTENT_MAX_CHARS} characters`;
}
```

Called on every `input`, `paste`, and `loadTabContent`.

#### Relative timestamp

```js
function updateTimestamp(ts) {
    if (!ts) { updatedAtEl.textContent = ''; return; }
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    let label;
    if (diff < 60000)     label = 'Edited just now';
    else if (mins < 60)   label = `Edited ${mins}m ago`;
    else if (hours < 24)  label = `Edited ${hours}h ago`;
    else if (days === 1)  label = 'Edited yesterday';
    else                  label = `Edited ${new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    updatedAtEl.textContent = label;
}
```

The timestamp is a Unix millisecond value (`Date.now()`) stored on the `Tab` object. The display label is computed on load and then refreshed every 30 seconds by an interval started in `init()`:

```js
setInterval(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) updateTimestamp(tab.updatedAt);
}, 30000);
```

This ensures the label stays accurate while the popup remains open — without it, "Edited just now" would stay frozen until the popup was closed and reopened.

---

### Inline Tab Rename

Double-clicking a tab button in the sidebar makes its title editable in place, without needing to scroll up to the `#document-title` field.

The `dblclick` listener is attached to the button in `buildTabButton` (normal mode only):

```js
btn.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const originalTitle = tab.title;
    titleSpan.contentEditable = 'true';
    titleSpan.style.pointerEvents = 'auto'; // override pointer-events: none
    titleSpan.focus();

    // Select all text so the user can type immediately
    const range = document.createRange();
    range.selectNodeContents(titleSpan);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    let cancelled = false;

    function onKeydown(ke) {
        if (ke.key === 'Enter') { ke.preventDefault(); titleSpan.blur(); }
        if (ke.key === 'Escape') { cancelled = true; titleSpan.blur(); }
    }

    function commit() {
        titleSpan.removeEventListener('keydown', onKeydown);
        titleSpan.contentEditable = 'false';
        titleSpan.style.pointerEvents = '';
        if (cancelled) { titleSpan.textContent = originalTitle; return; }
        const newTitle = titleSpan.textContent.trim().slice(0, TITLE_MAX_LENGTH) || 'Untitled';
        tab.title = newTitle;
        titleSpan.textContent = newTitle;
        btn.title = newTitle;
        if (tab.id === activeTabId) documentTitle.innerText = newTitle;
        debouncedSaveState();
    }

    titleSpan.addEventListener('blur', commit, { once: true });
    titleSpan.addEventListener('keydown', onKeydown);
});
```

**How it works:**
- `titleSpan` normally has `pointer-events: none` (so drag events pass through to the button). On dblclick, `pointerEvents` is temporarily set to `auto` so the user can click within the span while editing.
- The `-webkit-line-clamp` truncation is suspended during editing via a CSS attribute selector, then restored when `contentEditable` is removed:
  ```css
  .tab-btn span.title[contenteditable="true"] {
      display: block;
      overflow: visible;
      outline: none;
      border-bottom: 1px solid rgba(0, 0, 0, 0.25);
      cursor: text;
  }
  ```
- **Enter** or **clicking away** commits the new title. **Escape** restores the original. Both paths go through `commit()` — the `cancelled` flag distinguishes them.
- If the renamed tab is the active one, `documentTitle.innerText` is updated in sync so the editor header matches immediately.

---

### Copy to Clipboard

```js
function copyTabContent() {
    navigator.clipboard.writeText(editor.innerText).then(() => {
        showToast("Copied that to clipboard!");
    }).catch(err => {
        console.error("Failed to copy that, try again.", err);
    });
}
```

Uses the modern `navigator.clipboard` API. The `clipboardWrite` permission in `manifest.json` is required for Firefox. Chrome does not require it for extension popups but it doesn't hurt.

---

### Toast Notifications

A single `#copy-toast` element is reused for all notifications. Showing a new toast clears any existing timer first so messages don't stack:

```js
function showToast(message = "Copied!") {
    if (toastTimeout) clearTimeout(toastTimeout);
    copyToast.textContent = message;
    copyToast.classList.add('show');  // CSS transition slides it up
    toastTimeout = setTimeout(() => {
        copyToast.classList.remove('show');  // slides back down after 2s
    }, 2000);
}
```

The `show` class triggers a CSS transition that slides the toast up from the bottom and fades it in:

```css
#copy-toast {
    transform: translateX(-50%) translateY(100px);
    opacity: 0;
    transition: all 0.3s;
}
#copy-toast.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
```

---

### Sidebar Keyboard Navigation

Arrow keys cycle through tabs. The handler only fires when the editor or title is not focused (so typing isn't intercepted):

```js
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.contentEditable === 'true') return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if (e.key === 'ArrowUp') {
        switchTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length].id);
    }
    if (e.key === 'ArrowDown') {
        switchTab(tabs[(currentIndex + 1) % tabs.length].id);
    }
});
```

The modulo arithmetic `(currentIndex - 1 + tabs.length) % tabs.length` wraps around: pressing Up on the first tab goes to the last, and pressing Down on the last tab goes to the first.

---

## How HTML and JS Pair Up

| HTML element | JS reference | Purpose |
|---|---|---|
| `#tab-nav-bar` | `tabNavBar` | Container where `renderTabs()` appends buttons |
| `#new-tab-btn` | `newTabBtn` | Triggers `addNewTab()` |
| `#tab-count` | `tabCountEl` | Updated by `renderTabs()` with "N tabs" |
| `#default-controls` | `defaultControls` | Shown/hidden by `toggleEditMode()` |
| `#edit-controls` | `editControls` | Shown/hidden by `toggleEditMode()` |
| `#edit-mode-btn` | `editModeBtn` | Triggers `toggleEditMode()` |
| `#select-all-btn` | `selectAllBtn` | Triggers `selectAllTabs()` |
| `#delete-selected-btn` | `deleteSelectedBtn` | Triggers `deleteSelectedTabs()` |
| `#cancel-edit-btn` | `cancelEditBtn` | Triggers `toggleEditMode()` (exits) |
| `#document-title` | `documentTitle` | Edited by user, read/written by `loadTabContent` and `saveTitle` |
| `#editor` | `editor` | Main text area; all content events fire here |
| `#copy-tab-content-btn` | `copyTabContentBtn` | Triggers `copyTabContent()` |
| `#updated-at` | `updatedAtEl` | Written by `updateTimestamp()` |
| `#word-count` | `wordCountEl` | Written by `updateWordCount()` |
| `#copy-toast` | `copyToast` | Shown/hidden by `showToast()` |

---

## Storage Architecture

Data is stored in `chrome.storage.local` (up to ~10MB total) using this key structure:

| Key | Value | Description |
|---|---|---|
| `myExtensionTabIds` | `[1234, 5678, ...]` | Ordered array of tab IDs; defines sidebar order |
| `myExtensionActiveId` | `1234` | ID of the last-active tab |
| `tab_1234` | `{ id, title, content, color, updatedAt }` | One key per tab |

Each tab lives in its own storage slot so that deleting a tab also removes its data cleanly (`storage.remove('tab_1234')`), and so large notes in one tab don't push other tabs out of a per-item size limit.

On first load, `init()` checks for the old single-array format (`myExtensionTabs`) and migrates it to the new per-key format automatically, then deletes the old key.

### What clears extension storage

`chrome.storage.local` is completely separate from browser history, cache, and cookies. The table below shows what does and does not affect it:

| Action | Clears extension storage? |
|---|---|
| Clear history | No |
| Clear cache | No |
| Clear cookies | No |
| "Clear browsing data" (default options) | No |
| "Clear browsing data" → **Hosted app data** checked | **Yes** |
| Uninstalling the extension | **Yes** |
| Extension calls `storage.clear()` | **Yes** |
| Storage quota (~10MB) exceeded | Rejects new writes; existing data safe |

The "Hosted app data" checkbox is not selected by default in Chrome's clear data dialog, so the vast majority of users never trigger it. Notes survive routine history and cache wipes.

**Firefox private windows**: `storage.local` writes succeed during the session but are discarded when all private windows close. Regular (non-private) Firefox windows persist normally.
