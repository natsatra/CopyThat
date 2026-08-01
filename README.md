# CopyThat

A tabbed notepad that lives in your browser toolbar. Store text and code snippets in colour-coded tabs, and copy any tab's contents to the clipboard with one click.

CopyThat is a Manifest V3 browser extension that runs entirely inside its own popup. It makes **no network requests**, injects **nothing into web pages**, and keeps all data **on your device**. This README documents not just what the extension does, but the security decisions behind how it was built — and the limitations you should know about before trusting it with your text.

Compatible with Chrome (and Chromium-based browsers) and Firefox 109+.

<!-- TODO: replace with a real screenshot of the popup — sidebar with a few colour-coded tabs and the editor in view. Save as screenshot.png in the repo root. -->
![The CopyThat popup: colour-coded tabs in the sidebar, editor on the right](screenshot.png)

---

## Features

- **Tabbed notes** — up to 20 tabs, each with its own title (50 characters) and content (25,000 characters).
- **One-click copy** — the copy button sends the active tab's full contents to the system clipboard.
- **Colour coding** — assign each tab a colour from a 9-swatch picker, or reset to the automatic palette rotation.
- **Inline rename** — double-click a tab to rename it in place. Enter commits, Escape cancels.
- **Drag-and-drop reordering** of tabs in the sidebar.
- **Bulk delete** — an edit mode with checkboxes, select-all, and a click-twice-to-confirm delete.
- **Keyboard navigation** — up/down arrows cycle through tabs when the editor isn't focused; Tab moves focus from the title field into the editor.
- **Live metadata** — character count against the limit, tab count, and an "Edited Xm ago" timestamp that refreshes while the popup is open.

### Why it's useful

CopyThat is for text you paste repeatedly: canned support replies, code snippets, form boilerplate, addresses, meeting links. Instead of hunting through a document or a notes app in another window, the snippet is two clicks away from any page — open the popup, hit copy.

---

## Architecture

The entire extension is three code files plus its icons:

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — popup, two permissions, icons, and a Firefox add-on ID |
| `popup.html` | Popup markup and all styles (inline `<style>`, no external assets) |
| `popup.js` | All logic — rendering, storage, clipboard, drag-and-drop |
| `icon-16px.png`, `icon-48px.png`, `icon-128px.png` | Toolbar and extension-listing icons |

There is **no background service worker, no content script, no options page, and no host permissions**. Code only executes while the popup is open, and only in the popup's own isolated document.

### Storage model

Notes are persisted in `chrome.storage.local` (via `browser.storage.local` on Firefox) using a per-tab key scheme:

| Key | Contents |
|---|---|
| `myExtensionTabIds` | Ordered array of tab IDs |
| `myExtensionActiveId` | ID of the currently active tab |
| `tab_<id>` | One record per tab: `{ id, title, content, color, updatedAt }` |

Splitting each tab into its own key keeps every record well under the per-item quota and means a write failure on one tab can't corrupt the rest. Writes are debounced (400 ms) and quota errors surface as a visible toast rather than failing silently. A migration path from the older single-key format runs automatically on first load.

---

## Security design decisions

### Local storage only — no account sign-in, no sync

The deliberate headline decision: CopyThat uses `chrome.storage.local`, **not** `chrome.storage.sync`, and does not ask you to sign in to a Google (or any) account.

- **No third-party custody.** With `storage.sync`, note contents would be uploaded to Google's servers and attached to your Google account. Snippets people keep in a tool like this — addresses, internal URLs, code — never leave the machine.
- **No account linkage.** There is no identifier tying your notes to you. The extension has no concept of a user.
- **Smaller attack surface.** No auth flow means no tokens to steal, no OAuth misconfiguration, no session to hijack.

The trade-off is availability: notes don't follow you across devices, and there is no cloud backup (see [Limitations](#security-limitations)).

### Minimal, silent permissions

The manifest requests exactly two permissions:

| Permission | Why |
|---|---|
| `storage` | Persist notes in `chrome.storage.local` |
| `clipboardWrite` | Required by Firefox for `navigator.clipboard.writeText()` from the popup |

There are **no host permissions** (`<all_urls>`, `activeTab`, etc.), so the extension cannot read or modify any web page, and **no `clipboardRead`**, so it can write to your clipboard but never inspect what's on it.

### No network activity

`popup.js` contains no `fetch`, `XMLHttpRequest`, or WebSocket usage, and `popup.html` loads no external fonts, stylesheets, or scripts — every asset ships in the extension package. Combined with MV3's default content security policy (which forbids remote code and inline scripts), there is no channel through which note contents could be exfiltrated by the extension itself, and no third-party code that could be tampered with upstream.

### XSS-safe DOM handling

All user-controlled text — note contents, tab titles — enters the DOM through safe sinks only: `textContent`, `innerText`, and `document.createTextNode()`. An audit for unsafe sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`) finds a single `innerHTML` occurrence, and it writes a constant (clearing a stray `<br>` from the contenteditable editor) — never user data.

Pasting is also sanitised: the paste handler intercepts the event and inserts only the `text/plain` representation, so HTML riding along in the clipboard is discarded rather than interpreted.

### Guarded destructive actions

Bulk deletion requires a second click within 2 seconds to confirm ("Click delete again to confirm"), and deleting every tab regenerates a starter tab rather than leaving the extension in a broken empty state.

### Zero dependencies at runtime

The shipped extension is plain vanilla JavaScript. The only `devDependencies` are ESLint and type definitions — nothing from npm ends up in the package users install, which eliminates the supply-chain risk of a compromised runtime dependency.

---

## Security limitations

Being honest about the boundaries matters as much as the protections. Known limitations:

- **Data is not encrypted at rest.** `chrome.storage.local` is stored in plaintext (LevelDB) inside your browser profile. Anyone with access to your OS user account — or malware running as your user — can read it. The extension relies entirely on OS-level account security and full-disk encryption.
- **Do not store secrets.** This is a notepad, not a password manager. Beyond the unencrypted storage, anything you *copy* lands on the system clipboard, which any focused application (and, on some platforms, background clipboard managers) can read. Passwords, API keys, and tokens don't belong here.
- **No popup lock.** Anyone at your unlocked browser can open the popup and read every note. There is no PIN, password, or biometric gate.
- **No backup or recovery.** The flip side of no-cloud: uninstalling the extension, clearing extension data, or losing the browser profile permanently destroys all notes. There is no export feature yet, and no undo after a confirmed bulk delete.
- **Tab characters aren't preserved.** The editor is a `contenteditable`, and tab-indented content may have its tabs converted to spaces when saved. Space-indented code (Python on 4 spaces, for example) round-trips reliably; if you keep tab-indented snippets here, check them after pasting.
- **Storage quota.** Without the `unlimitedStorage` permission, `storage.local` is capped (~10 MB in Chrome, ~5 MB historically in Firefox). At 25,000 characters per tab and 20 tabs, normal use stays far below the cap, but hitting quota surfaces as a "storage limit reached" toast and the write is dropped.
- **Trust is per-install.** As with any extension, these guarantees apply to the audited source in this repository. Verify that the version you install matches this code (or load it unpacked from source).

---

## Installing from source

CopyThat is **not published on the Chrome Web Store or Firefox Add-ons**. Loading it from source is the only way to install it, which is also what makes the "verify the version you install matches this code" advice above actually achievable.

**Chrome / Edge / Brave**
1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.

**Firefox**
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json`.

> **Firefox users:** a temporary add-on is removed when Firefox restarts, and **its stored notes go with it**. Treat a Firefox install as throwaway unless you package and sign the extension for permanent installation.

No build step is required — the extension runs directly from source, which also makes auditing it trivial: read the three files listed under [Architecture](#architecture) and you've read everything that executes.

## Development

```sh
bun install        # dev tooling only (ESLint)
bun run lint       # lint popup.js
bun run lint:fix   # lint and auto-fix
```

## Auditing it yourself

A quick verification pass you can run on any checkout:

```sh
# No unsafe DOM sinks writing user data
grep -n "innerHTML\|outerHTML\|insertAdjacentHTML" popup.js

# No network calls
grep -n "fetch\|XMLHttpRequest\|WebSocket" popup.js

# No external resources in the popup
grep -n "https\?://" popup.html
```

The only expected hits are the constant `<br>` cleanup in `popup.js` and SVG `xmlns` namespace attributes in `popup.html` (an XML identifier, not a fetched URL).

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship your own version; no warranty.
