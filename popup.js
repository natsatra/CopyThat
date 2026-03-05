document.addEventListener('DOMContentLoaded', () => {
    const tabNavBar = document.getElementById('tab-nav-bar');
    const newTabBtn = document.getElementById('new-tab-btn');
    const wordCountEl = document.getElementById('word-count');
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

    const WELCOME_TITLE = "Welcome";
    const WELCOME_CONTENT = "This is your new editor! Paste your text here.\n\nUse the copy icon to copy the contents of your tab.\n\nYou can bulk delete tabs using the list icon above.";

    let tabs = [];
    let activeTabId = null;
    let toastTimeout = null;
    
    // Drag State
    let draggedTabIndex = null;
    
    // Selection State
    let isEditMode = false;
    let selectedTabIds = new Set();

    // Colors Array
    const TAB_COLORS = [
        '#b5e5e3',
        '#afced0',
        '#d1efee',
        '#e4dabb',
        '#d8ceaf'
    ];

    class Tab {
        constructor(title, content) {
            this.id = Date.now();
            this.title = title || "New Note";
            this.content = content || "";
        }
    }

    function init() {
        const savedTabs = localStorage.getItem('myExtensionTabs');
        const savedActiveId = localStorage.getItem('myExtensionActiveId');

        if (savedTabs) {
            tabs = JSON.parse(savedTabs);
            activeTabId = savedActiveId ? parseInt(savedActiveId) : tabs[0]?.id;
        }

        if (!tabs.length || !activeTabId) {
            const initialTab = new Tab(WELCOME_TITLE, WELCOME_CONTENT);
            tabs.push(initialTab);
            activeTabId = initialTab.id;
            saveState();
        }

        renderTabs();
        loadTabContent(activeTabId);

        // Core Listeners
        newTabBtn.addEventListener('click', addNewTab);
        editor.addEventListener('input', saveContent);
        documentTitle.addEventListener('input', saveTitle);
        copyTabContentBtn.addEventListener('click', copyTabContent);

        // Edit Mode Listeners
        editModeBtn.addEventListener('click', toggleEditMode);
        cancelEditBtn.addEventListener('click', toggleEditMode);
        selectAllBtn.addEventListener('click', selectAllTabs);
        deleteSelectedBtn.addEventListener('click', deleteSelectedTabs);
    }

    function saveState() {
        localStorage.setItem('myExtensionTabs', JSON.stringify(tabs));
        localStorage.setItem('myExtensionActiveId', activeTabId);
    }

    // --- Edit Mode Logic ---

    function toggleEditMode() {
        isEditMode = !isEditMode;
        selectedTabIds.clear(); 
        
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
        if (selectedTabIds.size === 0) return;

        if (confirm(`Delete ${selectedTabIds.size} selected tabs?`)) {
            const deletedTabs = tabs.filter(t => selectedTabIds.has(t.id));
            tabs = tabs.filter(t => !selectedTabIds.has(t.id));

            if (selectedTabIds.has(activeTabId) || tabs.length === 0) {
                if (tabs.length > 0) {
                    activeTabId = tabs[0].id;
                } else {
                    const welcomeTab = deletedTabs.find(t => t.title === WELCOME_TITLE && t.content === WELCOME_CONTENT);
                    const newTab = welcomeTab || new Tab("Untitled");
                    tabs.push(newTab);
                    activeTabId = newTab.id;
                }
            }
            
            toggleEditMode();
            loadTabContent(activeTabId);
            renderTabs();
            saveState();
        }
    }

    // --- Rendering ---

    function renderTabs() {
        tabNavBar.innerHTML = '';
        
        tabs.forEach((tab, index) => {
            const btn = document.createElement('button');
            const isActive = tab.id === activeTabId;
            
            btn.className = `tab-btn ${isActive ? 'active' : ''}`;
            btn.title = tab.title;
            
            // Enable Drag only if NOT in edit mode
            if (!isEditMode) {
                btn.draggable = true;
                btn.dataset.index = index;
                
                // Drag Events
                btn.addEventListener('dragstart', handleDragStart);
                btn.addEventListener('dragover', handleDragOver);
                btn.addEventListener('drop', handleDrop);
                btn.addEventListener('dragenter', handleDragEnter);
                btn.addEventListener('dragleave', handleDragLeave);
                btn.addEventListener('dragend', handleDragEnd);
            }

            // Apply Background Color from Array
            const color = TAB_COLORS[index % TAB_COLORS.length];
            btn.style.setProperty('--tab-bg', color);

            if (isActive) {
                document.documentElement.style.setProperty('--active-tab-bg', color);
            }

            // 1. Checkbox (Only in edit mode)
            if (isEditMode) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'tab-checkbox';
                checkbox.checked = selectedTabIds.has(tab.id);
                btn.appendChild(checkbox);
            }

            // 2. Title
            const titleSpan = document.createElement('span');
            titleSpan.className = 'title';
            const maxChars = isEditMode ? 8 : 10;
            titleSpan.textContent = tab.title.length > maxChars ? tab.title.substring(0, maxChars) + '...' : tab.title;
            btn.appendChild(titleSpan);

            // 3. Close Button (Only in normal mode)
            if (!isEditMode) {
                const close = document.createElement('span');
                close.innerHTML = '&times;';
                close.className = 'close-tab';
                
                close.onclick = (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                };

                btn.appendChild(close);
            }

            // Click Handler
            btn.onclick = () => {
                if (isEditMode) {
                    toggleTabSelection(tab.id);
                } else {
                    switchTab(tab.id);
                }
            };

            tabNavBar.appendChild(btn);
        });

        if (tabCountEl) {
            const count = tabs.length;
            tabCountEl.textContent = `${count} tab${count === 1 ? '' : 's'}`;
        }
    }

    // --- Drag and Drop Handlers ---

    function handleDragStart(e) {
        draggedTabIndex = parseInt(e.currentTarget.dataset.index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedTabIndex)); 
        
        setTimeout(() => {
            if(e.target) e.target.style.opacity = '0.4';
        }, 0);
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
        if (e.currentTarget.contains(e.relatedTarget)) return;
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDragEnd(e) {
        if(e.target) e.target.style.opacity = '1';
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

        saveContent();
        const newTab = new Tab("Untitled");
        tabs.push(newTab);
        activeTabId = newTab.id;
        renderTabs();
        loadTabContent(activeTabId);
        saveState();
    }

    function switchTab(id) {
        if (id === activeTabId) return;
        saveContent();
        activeTabId = id;
        loadTabContent(id);
        renderTabs();
        saveState();
    }

    function closeTab(id) {
        tabs = tabs.filter(t => t.id !== id);
        if (tabs.length === 0) {
            const newTab = new Tab("Untitled");
            tabs.push(newTab);
            activeTabId = newTab.id;
        } else if (activeTabId === id) {
            activeTabId = tabs[0].id;
        }
        
        loadTabContent(activeTabId);
        renderTabs();
        saveState();
    }

    function loadTabContent(id) {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            documentTitle.innerText = tab.title;
            editor.innerHTML = tab.content;
            updateWordCount();
        }
    }

    function saveContent() {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            tab.content = editor.innerHTML;
            saveState();
            updateWordCount();
        }
    }

    function updateWordCount() {
        const text = editor.innerText.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCountEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
    }

    const TITLE_MAX_LENGTH = 50;

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
            clearTimeout(window.renderTimeout);
            window.renderTimeout = setTimeout(renderTabs, 500);
            saveState();
        }
    }

    function copyTabContent() {
        const content = editor.innerText;

        navigator.clipboard.writeText(content).then(() => {
            showToast("Copied to clipboard!");
        }).catch(err => {
            console.error("Copy failed", err);
        });
    }

    function showToast(message = "Copied!") {
        if (toastTimeout) clearTimeout(toastTimeout);
        copyToast.textContent = message;
        copyToast.classList.add('show');
        toastTimeout = setTimeout(() => {
            copyToast.classList.remove('show');
        }, 2000);
    }

    init();
});
