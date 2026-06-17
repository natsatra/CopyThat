document.addEventListener('DOMContentLoaded', () => {
    const storage = (typeof browser !== 'undefined' ? browser : chrome).storage.local;

    const tabNavBar = document.getElementById('tab-nav-bar');
    const newTabBtn = document.getElementById('new-tab-btn');
    const wordCountEl = document.getElementById('word-count');
    const updatedAtEl = document.getElementById('updated-at');
    const editor = document.getElementById('editor');
    const documentTitle = document.getElementById('document-title');
    const copyTabContentBtn = document.getElementById('copy-tab-content-btn');
    const copyToast = document.getElementById('copy-toast');
    const tabCountEl = document.getElementById('tab-count');

    // Edit Mode Controls
    const defaultControls = document.getElementById('default-controls');
    const editControls = document.getElementById('edit-controls');
    const editModeBtn = document.getElementById('edit-mode-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    const WELCOME_TITLE = "Welcome to CopyThat!";
    const WELCOME_CONTENT = "Type or paste your text and code snippets here to copy them anywhere.\n\nThe copy icon (top right) copies the entire contents of the current tab to your clipboard.\n\nColor-code your tabs using the color picker that appears on hover.\n\nDouble-click a tab name to rename it inline. Drag and drop to reorder tabs.\n\nUse the list icon (top left) to select and delete multiple tabs at once.\n\nNote: Space-indented code (e.g. Python with 4 spaces) is preserved reliably. Tab-indented code may have its tabs converted to spaces on save.";

    let tabs = [];
    let activeTabId = null;
    let toastTimeout = null;
    
    // Drag State
    let draggedTabIndex = null;
    
    // Selection State
    let isEditMode = false;
    const selectedTabIds = new Set();
    let pendingDelete = false;
    let pendingDeleteTimeout = null;

    // Colors Array
    const TAB_COLORS = [
        '#b5e5e3',
        '#afced0',
        '#d1efee',
        '#ede3c0',
        '#d8ceaf'
    ];

    const SWATCH_COLORS = [
        '#b5e5e3', '#afced0', '#d1efee',
        '#c5d8e8', '#d4d8f0', '#cce0d4',
        '#ede3c0', '#d8ceaf', '#e8d5c4',
    ];

    let activeSwatchPicker = null;

    function showSwatchPicker(tab, triggerEl) {
        hideSwatchPicker();
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

        const resetBtn = document.createElement('button');
        resetBtn.className = 'swatch-reset';
        resetBtn.textContent = 'Reset';
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tab.color = null;
            hideSwatchPicker();
            renderTabs();
            saveState();
        });
        picker.appendChild(resetBtn);

        document.body.appendChild(picker);
        activeSwatchPicker = picker;

        const rect = triggerEl.getBoundingClientRect();
        picker.style.left = '4px';
        picker.style.top = `${Math.min(rect.top, window.innerHeight - 130)}px`;

        setTimeout(() => {
            document.addEventListener('click', hideSwatchPicker, { once: true });
        }, 0);
    }

    function hideSwatchPicker() {
        if (activeSwatchPicker) {
            activeSwatchPicker.remove();
            activeSwatchPicker = null;
        }
    }

    class Tab {
        constructor(title, content, color) {
            this.id = Date.now();
            this.title = title || "New Note";
            this.content = content || "";
            this.color = color;
            this.updatedAt = Date.now();
        }
    }

    async function init() {
        const meta = await storage.get(['myExtensionTabIds', 'myExtensionActiveId', 'myExtensionTabs']);

        if (meta.myExtensionTabIds) {
            // New per-tab storage format
            const tabKeys = meta.myExtensionTabIds.map(id => `tab_${id}`);
            const tabData = tabKeys.length ? await storage.get(tabKeys) : {};
            tabs = meta.myExtensionTabIds.map(id => tabData[`tab_${id}`]).filter(Boolean);
            activeTabId = meta.myExtensionActiveId ?? tabs[0]?.id;
        } else if (meta.myExtensionTabs) {
            // Migrate from old single-item format
            tabs = meta.myExtensionTabs;
            activeTabId = meta.myExtensionActiveId ?? tabs[0]?.id;
            await storage.remove('myExtensionTabs');
            saveState();
        }

        if (!tabs.length || !activeTabId) {
            const initialTab = new Tab(WELCOME_TITLE, WELCOME_CONTENT, TAB_COLORS[0]);
            tabs.push(initialTab);
            activeTabId = initialTab.id;
            saveState();
        }

        renderTabs();
        loadTabContent(activeTabId);

        setInterval(() => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {updateTimestamp(tab.updatedAt);}
        }, 30000);

        // Core Listeners
        newTabBtn.addEventListener('click', addNewTab);
        editor.addEventListener('input', saveContent);
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const remaining = CONTENT_MAX_CHARS - editor.innerText.length;
            const textToInsert = text.slice(0, remaining);
            if (text.length > remaining) {showToast(`Character limit of ${CONTENT_MAX_CHARS} reached.`);}
            const sel = window.getSelection();
            if (!sel.rangeCount) {return;}
            sel.deleteFromDocument();
            sel.getRangeAt(0).insertNode(document.createTextNode(textToInsert));
            sel.collapseToEnd();
            saveContent();
        });
        documentTitle.addEventListener('input', saveTitle);
        documentTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                editor.focus();
            }
        });
        copyTabContentBtn.addEventListener('click', copyTabContent);

        // Edit Mode Listeners
        editModeBtn.addEventListener('click', toggleEditMode);
        cancelEditBtn.addEventListener('click', toggleEditMode);
        selectAllBtn.addEventListener('click', selectAllTabs);
        deleteSelectedBtn.addEventListener('click', deleteSelectedTabs);

        // Character limit enforcement
        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {return;}
            if (e.key.length !== 1 && e.key !== 'Enter') {return;}
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {return;}
            if (editor.innerText.length >= CONTENT_MAX_CHARS) {
                e.preventDefault();
                showToast(`Character limit of ${CONTENT_MAX_CHARS} reached.`);
            }
        });

        // Sidebar keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (document.activeElement?.contentEditable === 'true') {return;}
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {return;}
            e.preventDefault();
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            if (e.key === 'ArrowUp') {switchTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length].id);}
            if (e.key === 'ArrowDown') {switchTab(tabs[(currentIndex + 1) % tabs.length].id);}
        });
    }

    function saveState() {
        const storageData = {
            myExtensionTabIds: tabs.map(t => t.id),
            myExtensionActiveId: activeTabId,
        };
        tabs.forEach(tab => { storageData[`tab_${tab.id}`] = tab; });
        storage.set(storageData).catch(() => {
            showToast("Storage limit reached. Try deleting some tabs.");
        });
    }

    function debounce(fn, delay) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }
    const debouncedSaveState = debounce(saveState, 400);

    // --- Edit Mode Logic ---

    function toggleEditMode() {
        isEditMode = !isEditMode;
        selectedTabIds.clear();
        pendingDelete = false;
        clearTimeout(pendingDeleteTimeout);
        
        if (isEditMode) {
            defaultControls.style.display = 'none';
            editControls.style.display = 'flex';
        } else {
            defaultControls.style.display = 'flex';
            editControls.style.display = 'none';
        }
        renderTabs();
    }

    function selectAllTabs() {
        if (selectedTabIds.size === tabs.length) {
            selectedTabIds.clear();
        } else {
            tabs.forEach(t => selectedTabIds.add(t.id));
        }
        renderTabs();
    }

    function toggleTabSelection(id) {
        if (selectedTabIds.has(id)) {
            selectedTabIds.delete(id);
        } else {
            selectedTabIds.add(id);
        }
        renderTabs();
    }

    function deleteSelectedTabs() {
        if (selectedTabIds.size === 0) {return;}

        if (!pendingDelete) {
            pendingDelete = true;
            clearTimeout(pendingDeleteTimeout);
            showToast(`Delete ${selectedTabIds.size} tab${selectedTabIds.size > 1 ? 's' : ''}? Click delete again to confirm.`);
            pendingDeleteTimeout = setTimeout(() => { pendingDelete = false; }, 2000);
            return;
        }

        clearTimeout(pendingDeleteTimeout);
        pendingDelete = false;

        const deletedTabs = tabs.filter(t => selectedTabIds.has(t.id));
        storage.remove(deletedTabs.map(t => `tab_${t.id}`));
        tabs = tabs.filter(t => !selectedTabIds.has(t.id));

        if (selectedTabIds.has(activeTabId) || tabs.length === 0) {
            if (tabs.length > 0) {
                activeTabId = tabs[0].id;
            } else {
                const welcomeTab = deletedTabs.find(t => t.title === WELCOME_TITLE && t.content === WELCOME_CONTENT);
                const newTab = welcomeTab || new Tab("New note", "", TAB_COLORS[0]);
                tabs.push(newTab);
                activeTabId = newTab.id;
            }
        }

        toggleEditMode();
        loadTabContent(activeTabId);
        saveState();
    }

    // --- Rendering ---

    function buildTabButton(tab, index, isActive, color) {
        const btn = document.createElement('button');
        btn.className = `tab-btn${isActive ? ' active' : ''}`;
        btn.title = tab.title;
        btn.dataset.tabId = tab.id;
        btn.dataset.index = index;
        btn.style.setProperty('--tab-bg', color);

        if (!isEditMode) {
            btn.draggable = true;
            btn.addEventListener('dragstart', handleDragStart);
            btn.addEventListener('dragover', handleDragOver);
            btn.addEventListener('drop', handleDrop);
            btn.addEventListener('dragenter', handleDragEnter);
            btn.addEventListener('dragleave', handleDragLeave);
            btn.addEventListener('dragend', handleDragEnd);
        }

        if (isEditMode) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'tab-checkbox';
            checkbox.checked = selectedTabIds.has(tab.id);
            btn.appendChild(checkbox);
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'title';
        titleSpan.textContent = tab.title;
        btn.appendChild(titleSpan);

        if (!isEditMode) {
            const colorDot = document.createElement('span');
            colorDot.className = 'color-dot';
            colorDot.title = 'Pick a color';
            colorDot.style.backgroundColor = color;
            colorDot.addEventListener('click', (e) => {
                e.stopPropagation();
                showSwatchPicker(tab, colorDot);
            });
            btn.appendChild(colorDot);

            btn.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const originalTitle = tab.title;
                titleSpan.contentEditable = 'true';
                titleSpan.style.pointerEvents = 'auto';
                titleSpan.focus();

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
                    if (tab.id === activeTabId) {documentTitle.innerText = newTitle;}
                    debouncedSaveState();
                }

                titleSpan.addEventListener('blur', commit, { once: true });
                titleSpan.addEventListener('keydown', onKeydown);
            });
        }

        btn.onclick = () => {
            if (isEditMode) {
                toggleTabSelection(tab.id);
            } else {
                switchTab(tab.id);
            }
        };

        return btn;
    }

    function renderTabs() {
        // Build a lookup of currently rendered buttons by tab ID
        const existingBtns = new Map();
        tabNavBar.querySelectorAll('.tab-btn').forEach(btn => {
            existingBtns.set(Number(btn.dataset.tabId), btn);
        });

        tabs.forEach((tab, index) => {
            const isActive = tab.id === activeTabId;
            const color = tab.color ?? TAB_COLORS[index % TAB_COLORS.length];

            if (isActive) {
                document.documentElement.style.setProperty('--active-tab-bg', color);
            }

            let btn = existingBtns.get(tab.id);

            if (btn) {
                existingBtns.delete(tab.id); // mark as still needed

                // If edit mode toggled, the button structure changed — rebuild it
                const btnInEditMode = !!btn.querySelector('.tab-checkbox');
                if (btnInEditMode !== isEditMode) {
                    const newBtn = buildTabButton(tab, index, isActive, color);
                    btn.replaceWith(newBtn);
                    btn = newBtn;
                } else {
                    // Update mutable properties in place — no DOM recreation
                    btn.className = `tab-btn${isActive ? ' active' : ''}`;
                    btn.title = tab.title;
                    btn.dataset.index = index;
                    btn.style.setProperty('--tab-bg', color);
                    const titleSpan = btn.querySelector('.title');
                    if (titleSpan) {titleSpan.textContent = tab.title;}
                    if (isEditMode) {
                        const checkbox = btn.querySelector('.tab-checkbox');
                        if (checkbox) {checkbox.checked = selectedTabIds.has(tab.id);}
                    }
                }
            } else {
                btn = buildTabButton(tab, index, isActive, color);
            }

            // appendChild moves an existing node — this handles reordering for free
            tabNavBar.appendChild(btn);
        });

        // Remove buttons whose tabs were deleted
        existingBtns.forEach(btn => btn.remove());

        const count = tabs.length;
        tabCountEl.textContent = `${count} tab${count === 1 ? '' : 's'}`;
    }

    // --- Drag and Drop Handlers ---

    function handleDragStart(e) {
        draggedTabIndex = parseInt(e.currentTarget.dataset.index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedTabIndex));
        setTimeout(() => { e.currentTarget.style.opacity = '0.4'; }, 0);
    }

    function handleDragOver(e) {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        if (e.currentTarget.contains(e.relatedTarget)) {return;}
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDragEnd(e) {
        if(e.target) {e.target.style.opacity = '1';}
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => btn.classList.remove('drag-over'));
        draggedTabIndex = null;
    }

    function handleDrop(e) {
        e.stopPropagation(); 
        e.preventDefault();

        e.currentTarget.style.opacity = '1';
        e.currentTarget.classList.remove('drag-over');

        const targetIndex = parseInt(e.currentTarget.dataset.index);
        const sourceIndex = draggedTabIndex;

        if (!isNaN(sourceIndex) && sourceIndex !== targetIndex) {
            const itemToMove = tabs[sourceIndex];
            tabs.splice(sourceIndex, 1); 
            tabs.splice(targetIndex, 0, itemToMove); 
            
            saveState();
            renderTabs();
        }
        
        return false;
    }

    function addNewTab() {
        if (tabs.length >= 20) {
            showToast("Maximum limit of 20 tabs reached.");
            return;
        }

        syncContent();
        const newTab = new Tab("New note", "", TAB_COLORS[tabs.length % TAB_COLORS.length]);
        tabs.push(newTab);
        activeTabId = newTab.id;
        renderTabs();
        loadTabContent(activeTabId);
        saveState();
    }

    function switchTab(id) {
        if (id === activeTabId) {return;}
        syncContent();
        activeTabId = id;
        loadTabContent(id);
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

    function syncContent() {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            tab.content = editor.innerText;
            tab.updatedAt = Date.now();
            updateWordCount();
            updateTimestamp(tab.updatedAt);
        }
    }

    function saveContent() {
        if (editor.innerHTML === '<br>') {editor.innerHTML = '';}
        syncContent();
        debouncedSaveState();
    }

    function updateWordCount() {
        const used = editor.innerText.length;
        wordCountEl.textContent = `${used} of ${CONTENT_MAX_CHARS} characters`;
    }

    function updateTimestamp(ts) {
        if (!ts) { updatedAtEl.textContent = ''; return; }
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        let label;
        if (diff < 60000) {label = 'Edited just now';}
        else if (mins < 60) {label = `Edited ${mins}m ago`;}
        else if (hours < 24) {label = `Edited ${hours}h ago`;}
        else if (days === 1) {label = 'Edited yesterday';}
        else {label = `Edited ${new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;}
        updatedAtEl.textContent = label;
    }

    const TITLE_MAX_LENGTH = 50;
    const CONTENT_MAX_CHARS = 25000;

    function saveTitle() {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            const text = documentTitle.innerText;
            if (text.length > TITLE_MAX_LENGTH) {
                documentTitle.innerText = text.substring(0, TITLE_MAX_LENGTH);
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(documentTitle);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            tab.title = documentTitle.innerText || "Untitled";
            tab.updatedAt = Date.now();
            updateTimestamp(tab.updatedAt);
            clearTimeout(window.renderTimeout);
            window.renderTimeout = setTimeout(renderTabs, 500);
            debouncedSaveState();
        }
    }

    function copyTabContent() {
        const content = editor.innerText;

        navigator.clipboard.writeText(content).then(() => {
            showToast("Copied that to clipboard!");
        }).catch(() => {
            showToast("Failed to copy. Please try again.");
        });
    }

    function showToast(message = "Copied!") {
        if (toastTimeout) {clearTimeout(toastTimeout);}
        copyToast.textContent = message;
        copyToast.classList.add('show');
        toastTimeout = setTimeout(() => {
            copyToast.classList.remove('show');
        }, 2000);
    }

    init();
});