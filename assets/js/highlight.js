const HighlightManager = {
    state: {
        toolbar: null,
        activeRange: null,
        activeId: null,
        storageKey: "",
        selectionTimer: null,
        isPointerDown: false,
    },

    config: {
        allowedColors: new Set(["yellow", "green", "blue", "red"]),
        storagePrefix: "nmtci-highlights-",
        selectors: {
            content:
                (typeof CONFIG !== "undefined" &&
                    CONFIG.selectors?.contentDiv) ||
                "#content",
            paragraphs:
                (typeof CONFIG !== "undefined" &&
                    CONFIG.selectors?.paragraphs) ||
                "p",
            toolbar: "#highlight-toolbar",
            noteOverlay: "#noteOverlay",
            overviewOverlay: "#overviewOverlay",
            settingsMenu: "#settingsMenu",
            noteInput: "#noteInput",
            noteSaveBtn: "#saveNote",
            noteCancelBtn: "#cancelNote",
            overviewContent: "#overviewContent",
            overviewCloseBtn: "#closeOverview",
            overviewToggleBtn: "#toggleHighlightsList",
        },
    },

    init() {
        const path = window.location.pathname.replace(/\/$/, "");
        this.state.storageKey = `${this.config.storagePrefix}${path}`;

        this.state.toolbar = document.querySelector(
            this.config.selectors.toolbar,
        );

        if (!this.state.toolbar) {
            console.warn("HighlightManager: Toolbar element not found.");
            return;
        }

        this._restoreHighlightsFromStorage();
        this._bindAllEvents();
        this._handleDeepLink();
    },

    _bindAllEvents() {
        this._bindSelectionEvents();
        this._bindToolbarEvents();
        this._bindContentEvents();
        this._bindModalEvents();
        this._bindOverviewEvents();
    },

    _bindSelectionEvents() {
        const setPointerUp = () => {
            this.state.isPointerDown = false;
        };

        document.addEventListener("pointerdown", (e) => {
            this.state.isPointerDown = true;

            const isToolbar = e.target.closest(this.config.selectors.toolbar);
            const isModal = e.target.closest(this.config.selectors.noteOverlay);

            if (!isToolbar && !isModal && this.state.toolbar) {
                this.state.toolbar.style.display = "none";
            }
        });

        const handleDebouncedSelection = () => {
            if (
                document
                    .querySelector(this.config.selectors.noteOverlay)
                    ?.classList.contains("active")
            ) {
                return;
            }

            const selection = document.getSelection();
            let isInsideActive = false;

            if (this.state.activeId && selection.anchorNode) {
                const node =
                    selection.anchorNode.nodeType === 3
                        ? selection.anchorNode.parentElement
                        : selection.anchorNode;

                const hl = node.closest(".highlight");
                if (hl && hl.dataset.id === this.state.activeId) {
                    isInsideActive = true;
                }
            }

            if (!isInsideActive && this.state.toolbar) {
                this.state.toolbar.style.display = "none";
            }

            if (this.state.selectionTimer)
                clearTimeout(this.state.selectionTimer);

            this.state.selectionTimer = setTimeout(() => {
                if (this.state.isPointerDown) return;

                const selection = document.getSelection();
                const anchor = selection.anchorNode;

                const targetNode =
                    anchor && anchor.nodeType === 3
                        ? anchor.parentElement
                        : anchor;

                this._handleSelectionChange({
                    target: targetNode,
                });
            }, 300);
        };

        document.addEventListener("selectionchange", handleDebouncedSelection);

        const onPointerUp = (e) => {
            setPointerUp();

            const isToolbar =
                e.target.closest &&
                e.target.closest(this.config.selectors.toolbar);
            const isModal =
                e.target.closest &&
                e.target.closest(this.config.selectors.noteOverlay);

            if (isToolbar || isModal) return;

            setTimeout(() => this._handleSelectionChange(e), 20);
        };

        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("touchend", onPointerUp);

        document.addEventListener("contextmenu", () => {
            setPointerUp();
            setTimeout(() => this._handleSelectionChange({}), 100);
        });
    },

    _bindToolbarEvents() {
        this.state.toolbar.addEventListener("pointerdown", (e) =>
            e.preventDefault(),
        );

        this.state.toolbar.addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button");
            if (!btn) return;

            if (btn.classList.contains("delete-btn")) {
                this.removeHighlight(this.state.activeId);
            } else if (btn.classList.contains("note-btn")) {
                this.ui.openNoteModal(this);
            } else if (btn.dataset.color) {
                this.createHighlight(btn.dataset.color);
            }
        });
    },

    _bindContentEvents() {
        const contentDiv = document.querySelector(
            this.config.selectors.content,
        );
        if (!contentDiv) return;

        contentDiv.addEventListener("click", (e) => {
            const highlightSpan = e.target.closest(".highlight");
            if (highlightSpan) {
                this._activateEditMode(highlightSpan);
            }
        });
    },

    _bindOverlayClose(overlaySelector, closeBtnSelector, onCloseCallback) {
        const overlay = document.querySelector(overlaySelector);
        const closeBtn = document.querySelector(closeBtnSelector);

        if (!overlay) return;

        const closeHandler = () => onCloseCallback();

        if (closeBtn) closeBtn.addEventListener("click", closeHandler);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeHandler();
        });
    },

    _bindModalEvents() {
        this._bindOverlayClose(
            this.config.selectors.noteOverlay,
            this.config.selectors.noteCancelBtn,
            () => this.ui.closeNoteModal(this),
        );

        const saveBtn = document.querySelector(
            this.config.selectors.noteSaveBtn,
        );
        if (saveBtn) saveBtn.onclick = () => this._saveNoteFromModal();

        const noteInput = document.querySelector(
            this.config.selectors.noteInput,
        );
        if (noteInput) {
            noteInput.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    this._saveNoteFromModal();
                }
            });
        }
    },

    _bindOverviewEvents() {
        this._bindOverlayClose(
            this.config.selectors.overviewOverlay,
            this.config.selectors.overviewCloseBtn,
            () => this.ui.closeOverviewModal(this),
        );

        const openBtn = document.querySelector(
            this.config.selectors.overviewToggleBtn,
        );
        if (openBtn) {
            openBtn.addEventListener("click", () => {
                document
                    .querySelector(this.config.selectors.settingsMenu)
                    ?.classList.remove("active");
                this.ui.openOverviewModal(this);
            });
        }

        const overviewContent = document.querySelector(
            this.config.selectors.overviewContent,
        );
        if (overviewContent) {
            overviewContent.addEventListener("click", (e) => {
                const btn = e.target.closest(".icon-btn.copy-btn");
                if (btn) {
                    const item = btn.closest(".hl-item");
                    const quoteEl = item.querySelector(".hl-quote");
                    let text = quoteEl.textContent.trim();

                    if (navigator.clipboard) {
                        navigator.clipboard
                            .writeText(text)
                            .then(() => {
                                btn.classList.add("copied");
                                setTimeout(
                                    () => btn.classList.remove("copied"),
                                    2000,
                                );
                            })
                            .catch(console.error);
                    }
                    return;
                }

                const deleteBtn = e.target.closest(".icon-btn.delete-btn");
                if (deleteBtn) {
                    if (
                        !confirm(
                            "Are you sure you want to delete this highlight?",
                        )
                    )
                        return;

                    const id = deleteBtn.dataset.id;
                    const key = deleteBtn.dataset.key;

                    if (key === this.state.storageKey) {
                        this.removeHighlight(id);
                    } else {
                        this.storage.delete(key, id);
                    }

                    const allData = this.storage.getAllGlobal(
                        this.config.storagePrefix,
                    );
                    const content = document.querySelector(
                        this.config.selectors.overviewContent,
                    );
                    this.ui.renderGlobalHighlights(
                        content,
                        allData,
                        this.config.storagePrefix,
                    );
                }
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

        const span = this.dom.getHighlightElement(id);
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
        const span = this.dom.getHighlightElement(this.state.activeId);
        if (span) {
            span.classList.forEach((cls) => {
                if (cls.startsWith("highlight-") && cls !== "highlight") {
                    span.classList.remove(cls);
                }
            });
            span.classList.add(`highlight-${color}`);

            this.storage.update(this.state.storageKey, this.state.activeId, {
                color,
            });
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

        const context = this.dom.getSelectionContext(
            range,
            this.config.selectors.paragraphs,
        );
        if (!context) {
            this._finishAction();
            return null;
        }

        const { p, pIndex } = context;
        const { start, end } = this.dom.calculateOffsets(range, p);

        if (
            start >= end ||
            this.dom.checkOverlap(
                pIndex,
                start,
                end,
                this.storage.get(this.state.storageKey),
            )
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
            pageTitle:
                typeof CHAPTER_TITLE !== "undefined"
                    ? CHAPTER_TITLE
                    : document.title,
            chapterNum: typeof CHAPTER_NUM !== "undefined" ? CHAPTER_NUM : null,
        });

        this._finishAction();
        return id;
    },

    _saveNoteFromModal() {
        const input = document.querySelector(this.config.selectors.noteInput);
        const text = input ? input.value : "";

        if (!this.state.activeId && this.state.activeRange) {
            this.state.activeId = this.createHighlight("yellow");
        }

        if (this.state.activeId) {
            this.storage.update(this.state.storageKey, this.state.activeId, {
                note: text,
            });

            const span = this.dom.getHighlightElement(this.state.activeId);
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
        const contentDiv = document.querySelector(
            this.config.selectors.content,
        );

        if (
            !contentDiv ||
            !contentDiv.contains(range.commonAncestorContainer)
        ) {
            this.state.toolbar.style.display = "none";
            return;
        }

        const container = range.commonAncestorContainer;
        const node =
            container.nodeType === 1 ? container : container.parentElement;
        if (!node.closest("p")) return;

        this.state.activeRange = range;
        this.state.activeId = null;
        this.state.toolbar.classList.remove("edit-mode");

        this.ui.positionToolbar(
            this.state.toolbar,
            range.getBoundingClientRect(),
        );
    },

    _activateEditMode(span) {
        this.state.activeId = span.dataset.id;
        this.state.activeRange = null;
        this.state.toolbar.classList.add("edit-mode");

        this.ui.positionToolbar(
            this.state.toolbar,
            span.getBoundingClientRect(),
        );
    },

    _finishAction() {
        window.getSelection().removeAllRanges();
        this.state.toolbar.style.display = "none";
        this.state.activeRange = null;
    },

    _restoreHighlightsFromStorage() {
        const list = this.storage.get(this.state.storageKey);
        const allPs = document.querySelectorAll(
            this.config.selectors.paragraphs,
        );

        list.forEach((item) => {
            const p = allPs[item.pIndex];
            if (!p) return;

            this.dom.restoreHighlightDOM(p, item);
        });
    },

    _handleDeepLink() {
        const hash = window.location.hash;
        if (!hash) return;

        const id = hash.slice(1);

        const element = this.dom.getHighlightElement(id);

        if (element) {
            setTimeout(() => {
                element.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    },

    dom: {
        getHighlightElement(id) {
            return document.querySelector(`.highlight[data-id="${id}"]`);
        },

        getSelectionContext(range, pSelector) {
            const container = range.commonAncestorContainer;
            const node =
                container.nodeType === Node.TEXT_NODE
                    ? container.parentElement
                    : container;
            const p = node.closest(pSelector);

            if (!p) return null;
            if (
                !p.contains(range.startContainer) ||
                !p.contains(range.endContainer)
            )
                return null;

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
            if (
                fragment.querySelector(
                    "p, div, article, section, h1, h2, h3, li",
                )
            ) {
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
            const treeWalker = document.createTreeWalker(
                p,
                NodeFilter.SHOW_TEXT,
            );
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

            const { computePosition, flip, shift, offset } =
                window.FloatingUIDOM;

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
            const modal = document.querySelector(
                manager.config.selectors.noteOverlay,
            );
            const input = document.querySelector(
                manager.config.selectors.noteInput,
            );
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
            document
                .querySelector(manager.config.selectors.noteOverlay)
                .classList.remove("active");
            manager._finishAction();
        },

        openOverviewModal(manager) {
            const overlay = document.querySelector(
                manager.config.selectors.overviewOverlay,
            );
            const content = document.querySelector(
                manager.config.selectors.overviewContent,
            );

            const allData = manager.storage.getAllGlobal(
                manager.config.storagePrefix,
            );
            this.renderGlobalHighlights(
                content,
                allData,
                manager.config.storagePrefix,
            );

            overlay.classList.add("active");
        },

        closeOverviewModal() {
            document
                .getElementById("overviewOverlay")
                .classList.remove("active");
        },

        renderGlobalHighlights(container, data, storagePrefix) {
            if (data.length === 0) {
                container.innerHTML = `<div class="overview-empty">No highlights found yet. Start reading!</div>`;
                return;
            }

            const html = data
                .map((chapter) => {
                    const displayTitle = chapter.chapterNum
                        ? `Ch. ${chapter.chapterNum}: ${chapter.title}`
                        : chapter.title;

                    const storageKey = `${storagePrefix}${chapter.path}`;

                    const highlightsHtml = chapter.highlights
                        .map(
                            (hl) => `
                    <div class="hl-item">
                        <div class="hl-top-row">
                            <a href="${chapter.path}#${hl.id}" class="hl-quote ${hl.color} hl-link">
                                ${hl.text}
                            </a>
                            <button class="icon-btn copy-btn" title="Copy highlight">
                                <svg class="icon-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                <svg class="icon-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                            <button class="icon-btn delete-btn" data-key="${storageKey}" data-id="${hl.id}" title="Delete highlight">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
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
        _write(key, callback) {
            try {
                const list = this.get(key);
                const newList = callback(list);
                if (newList) {
                    localStorage.setItem(key, JSON.stringify(newList));
                }
            } catch (e) {
                console.error("Storage write failed", e);
            }
        },

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
            this._write(key, (list) => {
                list.push(item);
                return list;
            });
        },

        delete(key, id) {
            this._write(key, (list) => list.filter((i) => i.id !== id));
        },

        update(key, id, changes) {
            this._write(key, (list) => {
                const idx = list.findIndex((i) => i.id === id);
                if (idx !== -1) {
                    list[idx] = { ...list[idx], ...changes };
                }
                return list;
            });
        },

        getAllGlobal(prefix) {
            const allData = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    try {
                        const highlights = JSON.parse(
                            localStorage.getItem(key),
                        );
                        if (
                            Array.isArray(highlights) &&
                            highlights.length > 0
                        ) {
                            const path = key.substring(prefix.length);
                            const first = highlights[0];
                            const title = first.pageTitle || "Unknown Chapter";
                            const chapterNum =
                                first.chapterNum ||
                                path
                                    .split("/")
                                    .pop()
                                    ?.replace(/-/g, " ")
                                    .replace(".html", "");

                            allData.push({
                                path,
                                title,
                                chapterNum,
                                highlights,
                            });
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
