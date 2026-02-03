const HighlightManager = {
    toolbar: null,
    activeRange: null,
    activeId: null,
    storageKey: "",
    allowedColors: new Set(["yellow", "green", "blue", "red"]),

    init() {
        const path = window.location.pathname.replace(/\/$/, "");
        this.storageKey = `nmtci-highlights-${path}`;

        this.toolbar = document.getElementById("highlight-toolbar");

        if (!this.toolbar) {
            console.warn("HighlightManager: #highlight-toolbar not found in HTML.");
            return;
        }

        this.loadHighlights();
        this.bindEvents();
    },

    bindEvents() {
        const contentDiv = document.querySelector(CONFIG.selectors.contentDiv);
        const modalOverlay = document.getElementById("noteOverlay");

        document.addEventListener("pointerup", (e) => {
            if (e.target.closest("#highlight-toolbar") || e.target.closest(".note-modal")) return;

            setTimeout(() => this.handleSelection(e), 20);
        });

        document.addEventListener("selectionchange", () => {
            if (this.selectionTimer) clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => {
                this.handleSelection({ target: document.getSelection().anchorNode?.parentElement });
            }, 300);
        });

        this.toolbar.addEventListener("pointerdown", (e) => {
            e.preventDefault();
        });

        this.toolbar.addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button");
            if (!btn) return;

            if (btn.classList.contains("hl-btn-delete")) {
                this.removeHighlight(this.activeId);
            } else if (btn.classList.contains("hl-btn-note")) {
                this.openNoteModal();
            } else if (btn.dataset.color) {
                this.createHighlight(btn.dataset.color);
            }
        });

        const cancelBtn = document.getElementById("cancelNote");
        const saveBtn = document.getElementById("saveNote");

        if (cancelBtn) cancelBtn.onclick = () => this.closeNoteModal();
        if (saveBtn) saveBtn.onclick = () => this.saveNote();

        if (modalOverlay) {
            modalOverlay.addEventListener("click", (e) => {
                if (e.target === modalOverlay) this.closeNoteModal();
            });
        }

        contentDiv.addEventListener("click", (e) => {
            if (e.target.classList.contains("highlight")) {
                this.handleHighlightClick(e.target);
            }
        });
    },

    handleSelection(e) {
        const selection = window.getSelection();

        if (selection.isCollapsed) {
            if (!e.target.classList.contains("highlight")) {
                this.toolbar.style.display = "none";
                this.activeId = null;
            }
            return;
        }

        const range = selection.getRangeAt(0);

        const contentDiv = document.querySelector(CONFIG.selectors.contentDiv);
        if (!contentDiv.contains(range.commonAncestorContainer)) {
            this.toolbar.style.display = "none";
            return;
        }

        const container = range.commonAncestorContainer;
        const node = container.nodeType === 1 ? container : container.parentElement;
        const p = node.closest("p");

        if (!p) return;

        this.activeRange = range;
        this.activeId = null;
        this.toolbar.classList.remove("edit-mode");
        this.showToolbar(range.getBoundingClientRect());
    },

    handleHighlightClick(span) {
        this.activeId = span.dataset.id;
        this.activeRange = null;
        this.toolbar.classList.add("edit-mode");
        this.showToolbar(span.getBoundingClientRect());
    },

    showToolbar(rect) {
        this.toolbar.style.display = "flex";

        const virtualReference = {
            getBoundingClientRect() {
                return rect;
            },
        };

        const { computePosition, flip, shift, offset } = window.FloatingUIDOM;

        computePosition(virtualReference, this.toolbar, {
            placement: "bottom",
            middleware: [offset(10), flip(), shift({ padding: 5 })],
        }).then(({ x, y }) => {
            Object.assign(this.toolbar.style, {
                left: `${x}px`,
                top: `${y}px`,
                position: "absolute",
                transform: "",
            });
        });
    },

    createHighlight(color) {
        if (!this.allowedColors.has(color)) {
            console.error(`Invalid highlight color: ${color}`);
            return null;
        }

        if (!this.activeRange && this.activeId) {
            return this.updateExistingHighlight(color);
        }

        if (this.activeRange) {
            if (this.activeRange.collapsed) return null;
            return this.createNewHighlight(color);
        }

        return null;
    },

    updateExistingHighlight(color) {
        const span = document.querySelector(`span.highlight[data-id="${this.activeId}"]`);

        if (span) {
            const oldColorClass = Array.from(span.classList).find(
                (c) => c.startsWith("highlight-") && c !== "highlight",
            );
            if (oldColorClass) span.classList.remove(oldColorClass);

            span.classList.add(`highlight-${color}`);

            this.updateStorage(this.activeId, { color });
        } else {
            console.warn(`Highlight ID ${this.activeId} not found in DOM.`);
        }

        this.finishAction();
        return this.activeId;
    },

    createNewHighlight(color) {
        const range = this.activeRange;

        if (!range.commonAncestorContainer.isConnected) {
            console.warn("Selection is no longer attached to the document.");
            this.finishAction();
            return null;
        }

        const context = this.getSelectionContext(range);
        if (!context) {
            this.finishAction();
            return null;
        }

        const { p, pIndex } = context;
        const { start, end } = this.calculateOffsets(range, p);

        if (start >= end) {
            console.warn("Invalid range calculation (start >= end).");
            this.finishAction();
            return null;
        }

        if (this.checkOverlap(pIndex, start, end)) {
            console.warn("Overlapping highlights are not allowed.");
            this.finishAction();
            return null;
        }

        const id = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).substr(2);

        const success = this.wrapRangeInHighlight(range, id, color);
        if (!success) {
            this.finishAction();
            return null;
        }

        const text = range.toString();
        this.saveToStorage({ id, pIndex, start, end, text, color, note: "" });

        this.finishAction();
        return id;
    },

    getSelectionContext(range) {
        const container = range.commonAncestorContainer;
        const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
        const p = node.closest(CONFIG.selectors.paragraphs || "p");

        if (!p) {
            console.warn("Selection is outside a valid paragraph or spans multiple blocks.");
            return null;
        }

        if (!p.contains(range.startContainer) || !p.contains(range.endContainer)) {
            console.warn("Multi-paragraph selection detected (not supported).");
            return null;
        }

        const allPs = Array.from(document.querySelectorAll(CONFIG.selectors.paragraphs));
        const pIndex = allPs.indexOf(p);

        if (pIndex === -1) {
            console.warn("Paragraph context not found in document flow.");
            return null;
        }

        return { p, pIndex };
    },

    checkOverlap(pIndex, start, end) {
        const highlights = this.getStored();
        return highlights.some((h) => {
            return h.pIndex === pIndex && start < h.end && end > h.start;
        });
    },

    calculateOffsets(range, p) {
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(p);
        preCaretRange.setEnd(range.startContainer, range.startOffset);

        const start = preCaretRange.toString().length;
        const end = start + range.toString().length;

        return { start, end };
    },

    wrapRangeInHighlight(range, id, color) {
        const fragment = range.cloneContents();
        if (fragment.querySelector("p, div, article, section, h1, h2, h3, h4, h5, h6, li")) {
            console.error("Cannot create a highlight that contains block-level elements.");
            return false;
        }

        const span = document.createElement("span");
        span.className = `highlight highlight-${color}`;
        span.dataset.id = id;

        try {
            const extracted = range.extractContents();
            span.appendChild(extracted);
            range.insertNode(span);

            span.parentElement.normalize();
            return true;
        } catch (e) {
            console.error("Critical DOM failure during highlight wrapping:", e);
            return false;
        }
    },

    finishAction() {
        window.getSelection().removeAllRanges();
        this.toolbar.style.display = "none";
        this.activeRange = null;
    },

    removeHighlight(id) {
        if (!id) return;
        const span = document.querySelector(`.highlight[data-id="${id}"]`);
        if (span) {
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
        }

        this.deleteFromStorage(id);
        this.finishAction();
        this.activeId = null;
    },

    openNoteModal() {
        const modal = document.getElementById("noteOverlay");
        const input = document.getElementById("noteInput");
        let currentNote = "";

        if (this.activeId) {
            const data = this.getHighlightData(this.activeId);
            if (data) currentNote = data.note || "";
        }

        input.value = currentNote;
        modal.classList.add("active");

        setTimeout(() => input.focus(), 50);
    },

    saveNote() {
        const text = document.getElementById("noteInput").value;

        if (!this.activeId && this.activeRange) {
            this.activeId = this.createHighlight("yellow");
        }

        if (this.activeId) {
            this.updateStorage(this.activeId, { note: text });
            const span = document.querySelector(`.highlight[data-id="${this.activeId}"]`);
            if (span) {
                if (text.trim()) span.classList.add("has-note");
                else span.classList.remove("has-note");
                span.dataset.note = text;
            }
        }

        this.closeNoteModal();
    },

    closeNoteModal() {
        document.getElementById("noteOverlay").classList.remove("active");
        this.finishAction();
    },

    getStored() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || "[]");
        } catch (e) {
            return [];
        }
    },

    saveToStorage(item) {
        const list = this.getStored();
        list.push(item);
        localStorage.setItem(this.storageKey, JSON.stringify(list));
    },

    deleteFromStorage(id) {
        let list = this.getStored();
        list = list.filter((i) => i.id !== id);
        localStorage.setItem(this.storageKey, JSON.stringify(list));
    },

    updateStorage(id, changes) {
        let list = this.getStored();
        const idx = list.findIndex((i) => i.id === id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...changes };
            localStorage.setItem(this.storageKey, JSON.stringify(list));
        }
    },

    getHighlightData(id) {
        return this.getStored().find((i) => i.id === id);
    },

    loadHighlights() {
        const list = this.getStored();
        const allPs = document.querySelectorAll(CONFIG.selectors.paragraphs);

        list.forEach((item) => {
            const p = allPs[item.pIndex];
            if (!p) return;

            const treeWalker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
            let currentNode = treeWalker.nextNode();
            let currentOffset = 0;
            let startNode = null,
                startPos = 0;
            let endNode = null,
                endPos = 0;

            while (currentNode) {
                const len = currentNode.length;

                if (!startNode && currentOffset + len >= item.start) {
                    startNode = currentNode;
                    startPos = item.start - currentOffset;
                }

                if (!endNode && currentOffset + len >= item.end) {
                    endNode = currentNode;
                    endPos = item.end - currentOffset;
                    break;
                }

                currentOffset += len;
                currentNode = treeWalker.nextNode();
            }

            if (startNode && endNode) {
                const range = document.createRange();
                try {
                    range.setStart(startNode, startPos);
                    range.setEnd(endNode, endPos);

                    const span = document.createElement("span");
                    span.className = `highlight highlight-${item.color} ${item.note ? "has-note" : ""}`;
                    span.dataset.id = item.id;
                    if (item.note) span.dataset.note = item.note;

                    span.appendChild(range.extractContents());
                    range.insertNode(span);
                } catch (e) {
                    console.error("Failed to restore highlight", item, e);
                }
            }
        });
    },
};

HighlightManager.init();
