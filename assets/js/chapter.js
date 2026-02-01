const CONFIG = {
    storageKeys: {
        settings: "reader-settings",
        audioSettings: "reader-audio-settings",
        scrollPrefix: "reader-scroll-",
    },
    themes: {
        light: { bg: "#fdfdfd", text: "#333333" },
        sepia: { bg: "#f4ecd8", text: "#5b4636" },
        dark: { bg: "#222222", text: "#d1d1d1" },
        midnight: { bg: "#2b323b", text: "#c4cdd5" },
        forest: { bg: "#e8f5e9", text: "#2d3b2d" },
        amoled: { bg: "#000000", text: "#b3b3b3" },
    },
    selectors: {
        contentDiv: "#content",
        paragraphs: "#content p",
    },
};

const DOM = {
    root: document.documentElement,
    body: document.body,

    navBar: document.getElementById("topNav"),
    sentinel: document.getElementById("sentinel"),
    prevLinks: document.querySelectorAll(".nav-prev"),
    nextLinks: document.querySelectorAll(".nav-next"),
    fabContainer: document.querySelector(".fab-container"),
    progressBar: document.getElementById("progress-bar"),

    menu: document.getElementById("settingsMenu"),
    toggleBtn: document.getElementById("toggleSettings"),
    themeBtns: document.querySelectorAll(".theme-btn"),
    inputs: {
        fontSize: document.getElementById("input-fontsize"),
        lineHeight: document.getElementById("input-lineheight"),
        fontFamily: document.getElementById("input-font"),
        spacing: document.getElementById("input-spacing"),
        paraStyle: document.getElementById("input-para-style"),
    },
    displays: {
        fontSize: document.getElementById("fs-val"),
        lineHeight: document.getElementById("lh-val"),
        spacing: document.getElementById("spacing-val"),
    },

    audioBtn: document.getElementById("toggleAudio"),
    audioMenu: document.getElementById("audioSettingsMenu"),
    audioSettingsBtn: document.getElementById("toggleAudioSettings"),
    voiceSelect: document.getElementById("input-voice"),
    rateInput: document.getElementById("input-rate"),
    pitchInput: document.getElementById("input-pitch"),
    rateValDisplay: document.getElementById("rate-val"),
    pitchValDisplay: document.getElementById("pitch-val"),
    audioStatusText: document.getElementById("audio-status-text"),
    iconPlay: document.getElementById("icon-play"),
    iconPause: document.getElementById("icon-pause"),
    audioWrapper: document.querySelector(".audio-toolbar-wrapper"),
};

const NavigationManager = {
    prevUrl: PREV_CHAPTER_NUM ? `/nmtci/translations/${PREV_CHAPTER_NUM}` : "",
    nextUrl: NEXT_CHAPTER_NUM ? `/nmtci/translations/${NEXT_CHAPTER_NUM}` : "",

    init() {
        this.updateLinks();
        this.prefetch();
        this.bindEvents();
        this.syncNavigation();
    },

    updateLinks() {
        const setLinks = (nodes, url) => {
            nodes.forEach((link) => {
                if (url) {
                    link.href = url;
                    link.classList.remove("disabled");
                } else {
                    link.removeAttribute("href");
                    link.classList.add("disabled");
                }
            });
        };
        setLinks(DOM.prevLinks, this.prevUrl);
        setLinks(DOM.nextLinks, this.nextUrl);
    },

    async syncNavigation() {
        const pathSegments = window.location.pathname.replace(/\/$/, "").split("/");
        const currentId = parseInt(pathSegments.pop());
        if (isNaN(currentId)) return;

        const idealPrevId = currentId - 1;
        const idealNextId = currentId + 1;

        const isPrevAligned = !this.prevUrl || this.prevUrl.includes(`/${idealPrevId}/`);
        const isNextAligned = !this.nextUrl || this.nextUrl.includes(`/${idealNextId}/`);

        if (isPrevAligned && isNextAligned) {
            return;
        }

        try {
            const response = await fetch("/nmtci/chapters.json");
            if (!response.ok) return;

            const chapters = await response.json();

            const currentIndex = chapters.findIndex((c) => c.id === currentId);
            if (currentIndex === -1) return;

            let updatesMade = false;

            if (currentIndex > 0) {
                const prevChapter = chapters[currentIndex - 1];
                if (prevChapter.url && this.prevUrl !== prevChapter.url) {
                    this.prevUrl = prevChapter.url;
                    updatesMade = true;
                }
            }

            if (currentIndex < chapters.length - 1) {
                const nextChapter = chapters[currentIndex + 1];
                if (nextChapter.url && this.nextUrl !== nextChapter.url) {
                    this.nextUrl = nextChapter.url;
                    updatesMade = true;
                }
            }

            if (updatesMade) {
                this.updateLinks();
                this.prefetch();
                console.log("Navigation healed:", {
                    prev: this.prevUrl,
                    next: this.nextUrl,
                });
            }
        } catch (e) {
            console.warn("Navigation sync failed:", e);
        }
    },

    prefetchUrl(url) {
        if (!url) return;
        if (document.head.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;

        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = url;
        document.head.appendChild(link);
    },

    prefetch() {
        this.prefetchUrl(this.prevUrl);
        this.prefetchUrl(this.nextUrl);
    },

    bindEvents() {
        document.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft" && this.prevUrl) window.location.href = this.prevUrl;
            if (e.key === "ArrowRight" && this.nextUrl) window.location.href = this.nextUrl;
        });
    },
};

const ThemeManager = {
    init() {
        this.load();
        this.bindEvents();
    },

    bindEvents() {
        DOM.toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.menu.classList.toggle("active");
            DOM.audioMenu.classList.remove("active");
        });

        document.addEventListener("click", (e) => {
            if (DOM.menu.classList.contains("active") && !DOM.menu.contains(e.target)) {
                DOM.menu.classList.remove("active");
            }
        });
        DOM.menu.addEventListener("click", (e) => e.stopPropagation());

        DOM.themeBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                this.applyTheme(e.target.dataset.theme);
                this.save();
            });
        });

        DOM.inputs.fontSize.addEventListener("input", (e) => {
            this.updateCSS("--text-size", e.target.value + "px");
            DOM.displays.fontSize.textContent = e.target.value + "px";
            this.save();
        });

        DOM.inputs.lineHeight.addEventListener("input", (e) => {
            this.updateCSS("--line-height", e.target.value);
            DOM.displays.lineHeight.textContent = e.target.value;
            this.save();
        });

        DOM.inputs.spacing.addEventListener("input", (e) => {
            this.updateCSS("--letter-spacing", e.target.value + "px");
            DOM.displays.spacing.textContent = e.target.value + "px";
            this.save();
        });

        DOM.inputs.fontFamily.addEventListener("change", (e) => {
            this.updateCSS("--font-family", e.target.value);
            this.save();
        });

        DOM.inputs.paraStyle.addEventListener("change", (e) => {
            this.applyParaStyle(e.target.value);
            this.save();
        });

        document.addEventListener("keydown", (e) => {
            if (["-", "_"].includes(e.key)) this.changeFontSize(-1);
            if (["=", "+"].includes(e.key)) this.changeFontSize(1);
        });
    },

    updateCSS(prop, value) {
        DOM.root.style.setProperty(prop, value);
    },

    applyTheme(themeName) {
        const theme = CONFIG.themes[themeName] || CONFIG.themes.light;
        this.updateCSS("--bg-color", theme.bg);
        this.updateCSS("--text-color", theme.text);
        DOM.root.setAttribute("data-theme", themeName);

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", theme.bg);

        DOM.themeBtns.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.theme === themeName);
        });
    },

    applyParaStyle(style) {
        if (style === "indent") {
            this.updateCSS("--para-indent", "2em");
        } else {
            this.updateCSS("--para-indent", "0");
        }
    },

    changeFontSize(delta) {
        const current = parseInt(DOM.inputs.fontSize.value);
        const min = parseInt(DOM.inputs.fontSize.min);
        const max = parseInt(DOM.inputs.fontSize.max);
        const newVal = current + delta;

        if (newVal >= min && newVal <= max) {
            DOM.inputs.fontSize.value = newVal;
            DOM.inputs.fontSize.dispatchEvent(new Event("input"));
        }
    },

    save() {
        const activeBtn = document.querySelector(".theme-btn.active");
        const settings = {
            fontSize: DOM.inputs.fontSize.value,
            lineHeight: DOM.inputs.lineHeight.value,
            theme: activeBtn ? activeBtn.dataset.theme : "light",
            fontFamily: DOM.inputs.fontFamily.value,
            letterSpacing: DOM.inputs.spacing.value,
            paraStyle: DOM.inputs.paraStyle.value,
        };
        localStorage.setItem(CONFIG.storageKeys.settings, JSON.stringify(settings));
    },

    load() {
        const saved = localStorage.getItem(CONFIG.storageKeys.settings);

        if (!saved) {
            this.applyTheme("light");
            return;
        }

        const s = JSON.parse(saved);

        const settingsMap = [
            {
                key: "fontSize",
                css: "--text-size",
                unit: "px",
                input: "fontSize",
                display: "fontSize",
            },
            {
                key: "lineHeight",
                css: "--line-height",
                unit: "",
                input: "lineHeight",
                display: "lineHeight",
            },
            {
                key: "fontFamily",
                css: "--font-family",
                unit: "",
                input: "fontFamily",
                display: null,
            },
            {
                key: "letterSpacing",
                css: "--letter-spacing",
                unit: "px",
                input: "spacing",
                display: "spacing",
            },
        ];

        settingsMap.forEach((config) => {
            const val = s[config.key];

            if (val) {
                const valWithUnit = val + config.unit;

                this.updateCSS(config.css, valWithUnit);

                if (DOM.inputs[config.input]) {
                    DOM.inputs[config.input].value = val;
                }

                if (config.display && DOM.displays[config.display]) {
                    DOM.displays[config.display].textContent = valWithUnit;
                }
            }
        });

        if (s.paraStyle) {
            this.applyParaStyle(s.paraStyle);
            if (DOM.inputs.paraStyle) DOM.inputs.paraStyle.value = s.paraStyle;
        }

        this.applyTheme(s.theme || "light");
    },
};

const AudioManager = {
    synth: window.speechSynthesis,
    utterance: null,
    isPlaying: false,
    isPaused: false,
    voices: [],
    paraObjects: [],
    currentIndex: 0,

    init() {
        this.populateVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.populateVoices();
        }
        this.loadSettings();
        this.bindEvents();
    },

    bindEvents() {
        DOM.audioBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggle();
        });

        DOM.audioSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.audioMenu.classList.toggle("active");
            DOM.menu.classList.remove("active");
        });

        document.addEventListener("click", (e) => {
            if (
                DOM.audioMenu.classList.contains("active") &&
                !DOM.audioMenu.contains(e.target) &&
                e.target !== DOM.audioSettingsBtn
            ) {
                DOM.audioMenu.classList.remove("active");
            }
        });
        DOM.audioMenu.addEventListener("click", (e) => e.stopPropagation());

        DOM.rateInput.addEventListener("input", (e) => {
            DOM.rateValDisplay.textContent = e.target.value + "x";
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        DOM.pitchInput.addEventListener("input", (e) => {
            DOM.pitchValDisplay.textContent = e.target.value;
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        DOM.voiceSelect.addEventListener("change", () => {
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        window.addEventListener("beforeunload", () => this.synth.cancel());
    },

    populateVoices() {
        this.voices = this.synth.getVoices();
        DOM.voiceSelect.innerHTML = "";

        const englishVoices = this.voices.filter((v) => v.lang.includes("en"));

        englishVoices.forEach((voice) => {
            const option = document.createElement("option");
            option.textContent = `${voice.name} (${voice.lang})`;
            option.setAttribute("data-index", this.voices.indexOf(voice));
            DOM.voiceSelect.appendChild(option);
        });

        this.loadSettings();
    },

    loadParagraphs() {
        const contentDiv = document.querySelector(CONFIG.selectors.contentDiv);
        this.paraObjects = Array.from(contentDiv.getElementsByTagName("p"))
            .filter((p) => {
                const text = p.innerText.trim();
                return text.length > 0 && !text.match(/^\d+$/);
            })
            .map((p) => ({ element: p, text: p.innerText }));
    },

    toggle() {
        if (!this.isPlaying) {
            this.loadParagraphs();
            if (this.paraObjects.length === 0) return;
            this.isPlaying = true;
            this.isPaused = false;
            this.updateUI();
            this.speak(this.currentIndex);
        } else if (this.isPlaying && !this.isPaused) {
            this.synth.pause();
            this.isPaused = true;
            this.updateUI();
        } else if (this.isPlaying && this.isPaused) {
            if (this.synth.paused) this.synth.resume();
            else this.speak(this.currentIndex);
            this.isPaused = false;
            this.updateUI();
        }
    },

    speak(index) {
        if (index >= this.paraObjects.length) {
            this.stop();
            return;
        }

        this.synth.cancel();

        setTimeout(() => {
            this.currentIndex = index;
            const pObj = this.paraObjects[index];

            this.clearHighlights();
            pObj.element.classList.add("active-reading");
            pObj.element.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            this.utterance = new SpeechSynthesisUtterance(pObj.text);

            const selectedOption = DOM.voiceSelect.selectedOptions[0];
            if (selectedOption) {
                const voiceIndex = selectedOption.getAttribute("data-index");
                this.utterance.voice = this.voices[voiceIndex];
                this.utterance.lang = this.voices[voiceIndex]?.lang;
            }
            this.utterance.rate = parseFloat(DOM.rateInput.value);
            this.utterance.pitch = parseFloat(DOM.pitchInput.value);

            this.utterance.onend = () => {
                if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex + 1);
            };

            this.utterance.onerror = (e) => {
                if (e.error !== "interrupted" && e.error !== "canceled") {
                    console.error("Audio error", e);
                    this.stop();
                }
            };

            this.synth.speak(this.utterance);
        }, 50);
    },

    stop() {
        this.synth.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.clearHighlights();
        this.updateUI();
    },

    clearHighlights() {
        this.paraObjects.forEach((obj) => obj.element.classList.remove("active-reading"));
    },

    updateUI() {
        if (this.isPlaying) DOM.audioWrapper.classList.add("floating");
        else DOM.audioWrapper.classList.remove("floating");

        if (this.isPlaying && !this.isPaused) {
            DOM.iconPlay.style.display = "none";
            DOM.iconPause.style.display = "block";
            DOM.audioStatusText.textContent = "Pause";
        } else if (this.isPlaying && this.isPaused) {
            DOM.iconPlay.style.display = "block";
            DOM.iconPause.style.display = "none";
            DOM.audioStatusText.textContent = "Resume";
        } else {
            DOM.iconPlay.style.display = "block";
            DOM.iconPause.style.display = "none";
            DOM.audioStatusText.textContent = "Listen";
        }
    },

    saveSettings() {
        const settings = {
            rate: DOM.rateInput.value,
            pitch: DOM.pitchInput.value,
            voiceName: DOM.voiceSelect.selectedOptions[0]?.textContent,
        };
        localStorage.setItem(CONFIG.storageKeys.audioSettings, JSON.stringify(settings));
    },

    loadSettings() {
        const saved = JSON.parse(localStorage.getItem(CONFIG.storageKeys.audioSettings));
        if (saved) {
            DOM.rateInput.value = saved.rate;
            DOM.pitchInput.value = saved.pitch;
            DOM.rateValDisplay.textContent = saved.rate + "x";
            DOM.pitchValDisplay.textContent = saved.pitch;

            for (let i = 0; i < DOM.voiceSelect.options.length; i++) {
                if (DOM.voiceSelect.options[i].textContent === saved.voiceName) {
                    DOM.voiceSelect.selectedIndex = i;
                    break;
                }
            }
        }
    },
};

const ScrollManager = {
    lastScrollTop: 0,
    scrollKey: CONFIG.storageKeys.scrollPrefix + window.location.pathname + window.location.search,

    init() {
        this.setupObserver();
        this.restorePosition();

        window.addEventListener(
            "scroll",
            () => {
                this.updateProgress();
                this.handleFab();
            },
            { passive: true },
        );

        window.addEventListener("resize", () => this.updateProgress());
    },

    restorePosition() {
        const saved = localStorage.getItem(this.scrollKey);
        if (saved) {
            setTimeout(() => window.scrollTo(0, parseInt(saved)), 100);
        }
    },

    updateProgress() {
        const scrollTop = window.scrollY;
        const docHeight = document.body.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / docHeight) * 100;

        DOM.progressBar.style.width = scrollPercent + "%";
        localStorage.setItem(this.scrollKey, scrollTop);
    },

    handleFab() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        if (Math.abs(scrollTop - this.lastScrollTop) < 10) return;

        const isScrollingDown = scrollTop > this.lastScrollTop;
        const isMenuOpen = DOM.menu.classList.contains("active");

        if (isScrollingDown && scrollTop > 50 && !isMenuOpen) {
            DOM.fabContainer.classList.add("fab-hidden");
        } else if (!isScrollingDown) {
            DOM.fabContainer.classList.remove("fab-hidden");
        }

        this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    },

    setupObserver() {
        const navObserver = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) DOM.navBar.classList.add("stuck");
            else DOM.navBar.classList.remove("stuck");
        });
        navObserver.observe(DOM.sentinel);
    },
};

const HistoryManager = {
    init() {
        if (typeof saveReadingHistory === "function") {
            saveReadingHistory();
        }
    },
};

document.addEventListener("DOMContentLoaded", () => {
    NavigationManager.init();
    ThemeManager.init();
    AudioManager.init();
    ScrollManager.init();
    HistoryManager.init();
});
