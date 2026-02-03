const HighlightManager = {
    state: {
        toolbar: null,
        activeRange: null,
        activeId: null,
        storageKey: "",
        selectionTimer: null,
    },

    config: {
        allowedColors: new Set(["yellow", "green", "blue", "red"]),
        storagePrefix: "nmtci-highlights-",
        selectors: {
            content: (typeof CONFIG !== "undefined" && CONFIG.selectors?.contentDiv) || "#content",
            paragraphs: (typeof CONFIG !== "undefined" && CONFIG.selectors?.paragraphs) || "p",
            toolbar: "#highlight-toolbar",
            noteOverlay: "#noteOverlay",
            overviewOverlay: "#overviewOverlay",
        },
    },

    init() {
        const path = window.location.pathname.replace(/\/$/, "");
        this.state.storageKey = `${this.config.storagePrefix}${path}`;

        this.state.toolbar = document.querySelector(this.config.selectors.toolbar);

        if (!this.state.toolbar) {
            console.warn("HighlightManager: Toolbar element not found.");
            return;
        }

        this._restoreHighlightsFromStorage();
        this._bindAllEvents();
    },

    _bindAllEvents() {
        this._bindSelectionEvents();
        this._bindToolbarEvents();
        this._bindContentEvents();
        this._bindModalEvents();
        this._bindOverviewEvents();
    },

    _bindSelectionEvents() {
        const handleDebouncedSelection = () => {
            if (
                document
                    .querySelector(this.config.selectors.noteOverlay)
                    ?.classList.contains("active")
            )
                return;

            if (this.state.selectionTimer) clearTimeout(this.state.selectionTimer);

            this.state.selectionTimer = setTimeout(() => {
                const selection = document.getSelection();
                this._handleSelectionChange({
                    target: selection.anchorNode?.parentElement,
                });
            }, 300);
        };

        document.addEventListener("selectionchange", handleDebouncedSelection);

        document.addEventListener("pointerup", (e) => {
            const isToolbar = e.target.closest(this.config.selectors.toolbar);
            const isModal = e.target.closest(".note-modal");

            if (isToolbar || isModal) return;
            setTimeout(() => this._handleSelectionChange(e), 20);
        });
    },

    _bindToolbarEvents() {
        this.state.toolbar.addEventListener("pointerdown", (e) => e.preventDefault());

        this.state.toolbar.addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button");
            if (!btn) return;

            if (btn.classList.contains("hl-btn-delete")) {
                this.removeHighlight(this.state.activeId);
            } else if (btn.classList.contains("hl-btn-note")) {
                this.ui.openNoteModal(this);
            } else if (btn.dataset.color) {
                this.createHighlight(btn.dataset.color);
            }
        });
    },

    _bindContentEvents() {
        const contentDiv = document.querySelector(this.config.selectors.content);
        if (!contentDiv) return;

        contentDiv.addEventListener("click", (e) => {
            const highlightSpan = e.target.closest(".highlight");
            if (highlightSpan) {
                this._activateEditMode(highlightSpan);
            }
        });
    },

    _bindModalEvents() {
        const overlay = document.querySelector(this.config.selectors.noteOverlay);
        if (!overlay) return;

        const cancelBtn = document.getElementById("cancelNote");
        const saveBtn = document.getElementById("saveNote");

        if (cancelBtn) cancelBtn.onclick = () => this.ui.closeNoteModal(this);
        if (saveBtn) saveBtn.onclick = () => this._saveNoteFromModal();

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) this.ui.closeNoteModal(this);
        });
    },

    _bindOverviewEvents() {
        const openBtn = document.getElementById("toggleHighlightsList");
        const closeBtn = document.getElementById("closeOverview");
        const overlay = document.querySelector(this.config.selectors.overviewOverlay);

        if (openBtn) {
            openBtn.addEventListener("click", () => {
                document.getElementById("settingsMenu")?.classList.remove("active");
                this.ui.openOverviewModal(this);
            });
        }

        if (closeBtn) closeBtn.onclick = () => this.ui.closeOverviewModal();
        if (overlay) {
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) this.ui.closeOverviewModal();
            });
        }
    },

    createHighlight(color) {
        if (!this.config.allowedColors.has(color)) {
            console.error(`Invalid color: ${color}`);
            return null;
        }

        if (!this.state.activeRange && this.state.activeId) {
            return this._updateHighlightColor(color);
        }

        if (this.state.activeRange && !this.state.activeRange.collapsed) {
            return this._createNewHighlight(color);
        }

        return null;
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

        this.storage.delete(this.state.storageKey, id);

        this._finishAction();
        this.state.activeId = null;
    },

    _updateHighlightColor(color) {
        const span = document.querySelector(`span.highlight[data-id="${this.state.activeId}"]`);
        if (span) {
            span.classList.forEach((cls) => {
                if (cls.startsWith("highlight-") && cls !== "highlight") {
                    span.classList.remove(cls);
                }
            });
            span.classList.add(`highlight-${color}`);

            this.storage.update(this.state.storageKey, this.state.activeId, { color });
        }

        this._finishAction();
        return this.state.activeId;
    },

    _createNewHighlight(color) {
        const range = this.state.activeRange;

        if (!range.commonAncestorContainer.isConnected) {
            this._finishAction();
            return null;
        }

        const context = this.dom.getSelectionContext(range, this.config.selectors.paragraphs);
        if (!context) {
            this._finishAction();
            return null;
        }

        const { p, pIndex } = context;
        const { start, end } = this.dom.calculateOffsets(range, p);

        if (
            start >= end ||
            this.dom.checkOverlap(pIndex, start, end, this.storage.get(this.state.storageKey))
        ) {
            console.warn("Invalid range or overlap detected.");
            this._finishAction();
            return null;
        }

        const id = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).substr(2);

        if (!this.dom.wrapRange(range, id, color)) {
            this._finishAction();
            return null;
        }

        this.storage.save(this.state.storageKey, {
            id,
            pIndex,
            start,
            end,
            text: range.toString(),
            color,
            note: "",
            pageTitle: typeof CHAPTER_TITLE !== "undefined" ? CHAPTER_TITLE : document.title,
            chapterNum: typeof CHAPTER_NUM !== "undefined" ? CHAPTER_NUM : null,
        });

        this._finishAction();
        return id;
    },

    _saveNoteFromModal() {
        const text = document.getElementById("noteInput").value;

        if (!this.state.activeId && this.state.activeRange) {
            this.state.activeId = this.createHighlight("yellow");
        }

        if (this.state.activeId) {
            this.storage.update(this.state.storageKey, this.state.activeId, { note: text });

            const span = document.querySelector(`.highlight[data-id="${this.state.activeId}"]`);
            if (span) {
                if (text.trim()) span.classList.add("has-note");
                else span.classList.remove("has-note");
                span.dataset.note = text;
            }
        }

        this.ui.closeNoteModal(this);
    },

    _handleSelectionChange(e) {
        const selection = window.getSelection();

        if (selection.isCollapsed) {
            if (!e.target || !e.target.closest?.(".highlight")) {
                this.state.toolbar.style.display = "none";
                this.state.activeId = null;
            }
            return;
        }

        const range = selection.getRangeAt(0);
        const contentDiv = document.querySelector(this.config.selectors.content);

        if (!contentDiv || !contentDiv.contains(range.commonAncestorContainer)) {
            this.state.toolbar.style.display = "none";
            return;
        }

        const container = range.commonAncestorContainer;
        const node = container.nodeType === 1 ? container : container.parentElement;
        if (!node.closest("p")) return;

        this.state.activeRange = range;
        this.state.activeId = null;
        this.state.toolbar.classList.remove("edit-mode");

        this.ui.positionToolbar(this.state.toolbar, range.getBoundingClientRect());
    },

    _activateEditMode(span) {
        this.state.activeId = span.dataset.id;
        this.state.activeRange = null;
        this.state.toolbar.classList.add("edit-mode");

        this.ui.positionToolbar(this.state.toolbar, span.getBoundingClientRect());
    },

    _finishAction() {
        window.getSelection().removeAllRanges();
        this.state.toolbar.style.display = "none";
        this.state.activeRange = null;
    },

    _restoreHighlightsFromStorage() {
        const list = this.storage.get(this.state.storageKey);
        const allPs = document.querySelectorAll(this.config.selectors.paragraphs);

        list.forEach((item) => {
            const p = allPs[item.pIndex];
            if (!p) return;

            this.dom.restoreHighlightDOM(p, item);
        });
    },

    dom: {
        getSelectionContext(range, pSelector) {
            const container = range.commonAncestorContainer;
            const node =
                container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            const p = node.closest(pSelector);

            if (!p) return null;
            if (!p.contains(range.startContainer) || !p.contains(range.endContainer)) return null;

            const allPs = Array.from(document.querySelectorAll(pSelector));
            const pIndex = allPs.indexOf(p);

            return pIndex === -1 ? null : { p, pIndex };
        },

        calculateOffsets(range, p) {
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(p);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            const start = preCaretRange.toString().length;
            return { start, end: start + range.toString().length };
        },

        checkOverlap(pIndex, start, end, existingHighlights) {
            return existingHighlights.some(
                (h) => h.pIndex === pIndex && start < h.end && end > h.start,
            );
        },

        wrapRange(range, id, color) {
            const fragment = range.cloneContents();
            if (fragment.querySelector("p, div, article, section, h1, h2, h3, li")) {
                console.error("Cannot highlight block-level elements.");
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
                console.error("DOM wrap failed:", e);
                return false;
            }
        },

        restoreHighlightDOM(p, item) {
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
                    console.error("Restore failed", e);
                }
            }
        },
    },

    ui: {
        positionToolbar(toolbar, rect) {
            toolbar.style.display = "flex";
            const virtualRef = { getBoundingClientRect: () => rect };

            const { computePosition, flip, shift, offset } = window.FloatingUIDOM;

            computePosition(virtualRef, toolbar, {
                placement: "bottom",
                middleware: [offset(10), flip(), shift({ padding: 5 })],
            }).then(({ x, y }) => {
                Object.assign(toolbar.style, {
                    left: `${x}px`,
                    top: `${y}px`,
                    position: "absolute",
                    transform: "",
                });
            });
        },

        openNoteModal(manager) {
            const modal = document.querySelector(manager.config.selectors.noteOverlay);
            const input = document.getElementById("noteInput");
            let currentNote = "";

            if (manager.state.activeId) {
                const data = manager.storage.getById(
                    manager.state.storageKey,
                    manager.state.activeId,
                );
                if (data) currentNote = data.note || "";
            }

            input.value = currentNote;
            modal.classList.add("active");
            setTimeout(() => input.focus(), 50);
        },

        closeNoteModal(manager) {
            document.querySelector(manager.config.selectors.noteOverlay).classList.remove("active");
            manager._finishAction();
        },

        openOverviewModal(manager) {
            const overlay = document.querySelector(manager.config.selectors.overviewOverlay);
            const content = document.getElementById("overviewContent");

            const allData = manager.storage.getAllGlobal(manager.config.storagePrefix);
            this.renderGlobalHighlights(content, allData);

            overlay.classList.add("active");
        },

        closeOverviewModal() {
            document.getElementById("overviewOverlay").classList.remove("active");
        },

        renderGlobalHighlights(container, data) {
            if (data.length === 0) {
                container.innerHTML = `<div class="overview-empty">No highlights found yet. Start reading!</div>`;
                return;
            }

            const html = data
                .map((chapter) => {
                    const displayTitle = chapter.chapterNum
                        ? `Ch. ${chapter.chapterNum}: ${chapter.title}`
                        : chapter.title;

                    const highlightsHtml = chapter.highlights
                        .map(
                            (hl) => `
                    <div class="hl-item">
                        <div class="hl-quote ${hl.color}">"${hl.text}"</div>
                        ${hl.note ? `<div class="hl-user-note">${hl.note}</div>` : ""}
                    </div>
                `,
                        )
                        .join("");

                    return `
                    <div class="hl-chapter-group">
                        <div class="hl-chapter-title">
                            <span>${displayTitle}</span>
                            <a href="${chapter.path}" class="hl-chapter-link">Go to Chapter</a>
                        </div>
                        ${highlightsHtml}
                    </div>
                `;
                })
                .join("");

            container.innerHTML = html;
        },
    },

    storage: {
        get(key) {
            try {
                return JSON.parse(localStorage.getItem(key) || "[]");
            } catch {
                return [];
            }
        },

        getById(key, id) {
            return this.get(key).find((i) => i.id === id);
        },

        save(key, item) {
            const list = this.get(key);
            list.push(item);
            localStorage.setItem(key, JSON.stringify(list));
        },

        delete(key, id) {
            let list = this.get(key);
            list = list.filter((i) => i.id !== id);
            localStorage.setItem(key, JSON.stringify(list));
        },

        update(key, id, changes) {
            let list = this.get(key);
            const idx = list.findIndex((i) => i.id === id);
            if (idx !== -1) {
                list[idx] = { ...list[idx], ...changes };
                localStorage.setItem(key, JSON.stringify(list));
            }
        },

        getAllGlobal(prefix) {
            const allData = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    try {
                        const highlights = JSON.parse(localStorage.getItem(key));
                        if (Array.isArray(highlights) && highlights.length > 0) {
                            const path = key.substring(prefix.length);
                            const first = highlights[0];
                            const title = first.pageTitle || "Unknown Chapter";
                            const chapterNum =
                                first.chapterNum ||
                                path.split("/").pop()?.replace(/-/g, " ").replace(".html", "");

                            allData.push({ path, title, chapterNum, highlights });
                        }
                    } catch (e) {
                        console.error("Parse error", key, e);
                    }
                }
            }
            return allData.sort((a, b) => a.path.localeCompare(b.path));
        },
    },
};

HighlightManager.init();
