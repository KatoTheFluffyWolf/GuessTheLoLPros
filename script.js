"use strict";

const CONFIG = {
    apiBaseUrl: "https://pnhyxe4nebxsrufkcanvsufpiu0pyjta.lambda-url.ap-southeast-2.on.aws",
    useDemoData: !1,
    resetHourUTC: 17,
    maxProgressGuesses: 6,
    sessionPollIntervalMs: 3e4
}, DEMO_SECRET_PLAYER = {
    game_number: 1,
    game_date: "2026-07-17",
    session_id: "demo-session-1",
    name: "Faker",
    image_url: createDemoPortrait("Faker"),
    clues: {
        nationality: "South Korea",
        dob: "May 7, 1996",
        retired: !1,
        won_first_stand: !0,
        won_msi: !0,
        won_worlds: !0
    },
    team_history: [ {
        id: 101,
        team: "SK Telecom T1 2",
        role: "Mid",
        region: "LCK",
        start: "Feb 2013",
        end: "Jun 2013",
        is_current: !1,
        team_logo_url: ""
    }, {
        id: 102,
        team: "SK Telecom T1 K",
        role: "Mid",
        region: "LCK",
        start: "Jun 2013",
        end: "Nov 2014",
        is_current: !1,
        team_logo_url: ""
    }, {
        id: 103,
        team: "SK Telecom T1",
        role: "Mid",
        region: "LCK",
        start: "Nov 2014",
        end: "Dec 2019",
        is_current: !1,
        team_logo_url: ""
    }, {
        id: 104,
        team: "T1",
        role: "Mid",
        region: "LCK",
        start: "Dec 2019",
        end: "Present",
        is_current: !0,
        team_logo_url: ""
    } ]
}, DEMO_PLAYERS = [ "Faker", "Caps", "Rekkles", "ShowMaker", "Chovy", "Uzi", "Deft", "Rookie", "Keria", "Canyon", "Ruler", "Mata", "Perkz", "Jankos", "Bin", "Knight", "TheShy", "Doublelift", "Bjergsen", "Levi" ], state = {
    player: null,
    playerNames: [],
    attempts: 0,
    hintsUsed: 0,
    solved: !1,
    revealedName: "",
    revealedImageUrl: "",
    solveToken: "",
    revealedClues: new Map,
    revealedHistory: new Map,
    manuallyUnlockedClues: new Set,
    manuallyUnlockedHistoryIds: new Set,
    activeSuggestionIndex: -1
}, elements = {
    playerCard: document.querySelector("#playerCard"),
    playerImage: document.querySelector("#playerImage"),
    playerName: document.querySelector("#playerName"),
    portraitScrim: document.querySelector("#portraitScrim"),
    historyBody: document.querySelector("#historyBody"),
    historyCount: document.querySelector("#historyCount"),
    historyUnlockedCount: document.querySelector("#historyUnlockedCount"),
    countdown: document.querySelector("#countdown"),
    gameNumber: document.querySelector("#gameNumber"),
    guessForm: document.querySelector("#guessForm"),
    guessInput: document.querySelector("#guessInput"),
    submitGuess: document.querySelector("#submitGuess"),
    suggestions: document.querySelector("#suggestions"),
    guessMessage: document.querySelector("#guessMessage"),
    attemptCount: document.querySelector("#attemptCount"),
    hintCount: document.querySelector("#hintCount"),
    sideHintCount: document.querySelector("#sideHintCount"),
    progressScore: document.querySelector("#progressScore"),
    progressFill: document.querySelector("#progressFill"),
    progressText: document.querySelector("#progressText"),
    shareButton: document.querySelector("#shareButton"),
    helpButton: document.querySelector("#helpButton"),
    helpDialog: document.querySelector("#helpDialog"),
    closeHelpButton: document.querySelector("#closeHelpButton"),
    themeButton: document.querySelector("#themeButton"),
    themeIcon: document.querySelector("#themeIcon"),
    toast: document.querySelector("#toast")
};

let toastTimer;

function normalizeName(value) {
    return String(value).trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function createDemoPortrait(label) {
    const safeLabel = String(label).replace(/[<>&"']/g, ""), initial = safeLabel.slice(0, 1).toUpperCase();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
      <defs>
        <linearGradient id="background" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#17343d"/>
          <stop offset="1" stop-color="#071116"/>
        </linearGradient>

        <radialGradient id="glow" cx="50%" cy="25%" r="62%">
          <stop stop-color="#59e1c6" stop-opacity=".33"/>
          <stop offset="1" stop-color="#59e1c6" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="640" height="800" fill="url(#background)"/>
      <rect width="640" height="800" fill="url(#glow)"/>

      <circle cx="320" cy="255" r="118" fill="#284b53"/>

      <path
        d="M95 800c15-205 109-322 225-322s210 117 225 322"
        fill="#284b53"
      />

      <circle
        cx="320"
        cy="305"
        r="180"
        fill="none"
        stroke="#59e1c6"
        stroke-opacity=".16"
        stroke-width="2"
      />

      <text
        x="320"
        y="295"
        fill="#8ff5e1"
        font-family="Arial, sans-serif"
        font-size="98"
        font-weight="800"
        text-anchor="middle"
      >
        ${initial}
      </text>

      <text
        x="320"
        y="725"
        fill="#f5fbfc"
        fill-opacity=".72"
        font-family="Arial, sans-serif"
        font-size="32"
        font-weight="700"
        text-anchor="middle"
      >
        ${safeLabel}
      </text>
    </svg>
  `)}`;
}

function createPublicDemoPayload() {
    const history = DEMO_SECRET_PLAYER.team_history;
    return {
        game_number: DEMO_SECRET_PLAYER.game_number,
        game_date: DEMO_SECRET_PLAYER.game_date,
        session_id: DEMO_SECRET_PLAYER.session_id,
        history_slots: history.map((entry, index) => ({
            id: entry.id,
            order: index + 1,
            label: getHistorySlotLabel(index, history.length)
        }))
    };
}

function getHistorySlotLabel(index, total) {
    return 1 === total ? "Only recorded career entry" : 0 === index ? "Earliest recorded career entry" : index === total - 1 ? "Latest recorded career entry" : `Career entry ${index + 1} of ${total}`;
}

function getStorageKey() {
    const sessionId = state.player?.session_id;
    if (!sessionId) throw new Error("The daily-player response is missing session_id.");
    return `riftguess:session:${sessionId}`;
}

function removeOldGameSessions() {
    const currentStorageKey = getStorageKey();
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        key && key.startsWith("riftguess:") && "riftguess:theme" !== key && key !== currentStorageKey && localStorage.removeItem(key);
    }
}

function saveProgress() {
    const payload = {
        attempts: state.attempts,
        hintsUsed: state.hintsUsed,
        solved: state.solved,
        revealedName: state.revealedName,
        revealedImageUrl: state.revealedImageUrl,
        solveToken: state.solveToken,
        manuallyUnlockedClues: [ ...state.manuallyUnlockedClues ],
        manuallyUnlockedHistoryIds: [ ...state.manuallyUnlockedHistoryIds ]
    };
    localStorage.setItem(getStorageKey(), JSON.stringify(payload));
}

function restoreProgress() {
    try {
        const savedValue = localStorage.getItem(getStorageKey());
        if (!savedValue) return;
        const saved = JSON.parse(savedValue);
        state.attempts = Number(saved.attempts) || 0, state.hintsUsed = Number(saved.hintsUsed) || 0, 
        state.solved = Boolean(saved.solved), state.revealedName = saved.revealedName || "", 
        state.revealedImageUrl = saved.revealedImageUrl || "", state.solveToken = saved.solveToken || "", 
        state.manuallyUnlockedClues = new Set(Array.isArray(saved.manuallyUnlockedClues) ? saved.manuallyUnlockedClues : []), 
        state.manuallyUnlockedHistoryIds = new Set(Array.isArray(saved.manuallyUnlockedHistoryIds) ? saved.manuallyUnlockedHistoryIds.map(Number) : []);
    } catch (error) {
        console.warn("Could not restore the saved game state.", error);
    }
}

async function fetchJson(path, options = {}) {
    const {headers: suppliedHeaders = {}, ...fetchOptions} = options, response = await fetch(`${CONFIG.apiBaseUrl}${path}`, {
        cache: "no-store",
        ...fetchOptions,
        headers: {
            "Content-Type": "application/json",
            ...suppliedHeaders
        }
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with status ${response.status}`);
    }
    return response.json();
}

async function requestInitialGame() {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) return {
        player: createPublicDemoPayload(),
        playerNames: DEMO_PLAYERS
    };
    const [player, playerNamesResponse] = await Promise.all([ fetchJson("/api/daily-player"), fetchJson("/api/player-names") ]);
    return {
        player: player,
        playerNames: Array.isArray(playerNamesResponse) ? playerNamesResponse : playerNamesResponse.players || []
    };
}

async function requestGameState() {
    return CONFIG.useDemoData || !CONFIG.apiBaseUrl ? {
        session_id: DEMO_SECRET_PLAYER.session_id,
        reset_source: "demo"
    } : fetchJson("/api/game-state");
}

async function requestGeneralClue(clueKey) {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
        if (await demoDelay(), !(clueKey in DEMO_SECRET_PLAYER.clues)) throw new Error("Unknown clue.");
        return {
            key: clueKey,
            value: DEMO_SECRET_PLAYER.clues[clueKey]
        };
    }
    return fetchJson("/api/hints/clue", {
        method: "POST",
        body: JSON.stringify({
            key: clueKey
        })
    });
}

async function requestHistoryHint(historyId) {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
        await demoDelay();
        const historyItem = DEMO_SECRET_PLAYER.team_history.find(entry => Number(entry.id) === Number(historyId));
        if (!historyItem) throw new Error("That team-history hint does not exist.");
        return {
            ...historyItem
        };
    }
    return fetchJson("/api/hints/team-history", {
        method: "POST",
        body: JSON.stringify({
            history_id: historyId
        })
    });
}

async function requestGuessResult(guess) {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
        await demoDelay();
        const correct = normalizeName(guess) === normalizeName(DEMO_SECRET_PLAYER.name);
        return {
            correct: correct,
            message: correct ? "Correct!" : "Not quite. Check the clues and try again.",
            ...correct ? {
                player_name: DEMO_SECRET_PLAYER.name,
                image_url: DEMO_SECRET_PLAYER.image_url
            } : {}
        };
    }
    return fetchJson("/api/guess", {
        method: "POST",
        body: JSON.stringify({
            guess: guess
        })
    });
}

async function requestPostGameClues() {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) return await demoDelay(80), {
        player_name: DEMO_SECRET_PLAYER.name,
        image_url: DEMO_SECRET_PLAYER.image_url,
        clues: {
            ...DEMO_SECRET_PLAYER.clues
        },
        team_history: DEMO_SECRET_PLAYER.team_history.map(entry => ({
            ...entry
        }))
    };
    if (!state.solveToken) throw new Error("A solve token is required to reveal the completed game.");
    return fetchJson("/api/post-game-reveal", {
        headers: {
            Authorization: `Bearer ${state.solveToken}`
        }
    });
}

function demoDelay(milliseconds = 180) {
    return new Promise(resolve => {
        window.setTimeout(resolve, milliseconds);
    });
}

async function loadGame() {
    elements.playerCard.setAttribute("aria-busy", "true");
    try {
        const data = await requestInitialGame();
        state.player = data.player, state.playerNames = data.playerNames, removeOldGameSessions(), 
        restoreProgress(), renderBaseGame(), state.solved ? await restoreSolvedGame() : await restoreUnlockedHints(), 
        updateProgressUI();
    } catch (error) {
        console.error(error), setGuessMessage("The daily player could not be loaded. Please try again later.", "error"), 
        elements.submitGuess.disabled = !0;
    } finally {
        elements.playerCard.setAttribute("aria-busy", "false");
    }
}

function renderBaseGame() {
    state.player && (elements.gameNumber.textContent = state.player.game_number ? `Challenge #${state.player.game_number}` : "Daily challenge", 
    renderHistoryTable());
}

async function restoreUnlockedHints() {
    for (const clueKey of state.manuallyUnlockedClues) try {
        const clue = await requestGeneralClue(clueKey);
        state.revealedClues.set(clueKey, clue.value);
    } catch (error) {
        console.warn(`Could not restore clue "${clueKey}".`, error);
    }
    for (const historyId of state.manuallyUnlockedHistoryIds) try {
        const historyItem = await requestHistoryHint(historyId);
        state.revealedHistory.set(Number(historyId), historyItem);
    } catch (error) {
        console.warn(`Could not restore history hint "${historyId}".`, error);
    }
    renderGeneralClues(), renderHistoryTable();
}

async function restoreSolvedGame() {
    const postGameData = await revealAllPostGameInformation();
    revealPortrait({
        player_name: state.revealedName || postGameData?.player_name || "Correct player",
        image_url: state.revealedImageUrl || postGameData?.image_url || ""
    }), setGuessMessage("You already solved today's player. Nice work.", "success");
}

function renderGeneralClues() {
    document.querySelectorAll("[data-clue-card]").forEach(card => {
        const clueKey = card.dataset.clueCard, button = card.querySelector("[data-clue-key]"), valueElement = card.querySelector("[data-clue-value]");
        if (!button || !valueElement) return;
        const hasValue = state.revealedClues.has(clueKey);
        card.classList.toggle("is-revealed", hasValue), button.hidden = hasValue, valueElement.hidden = !hasValue, 
        hasValue && (valueElement.textContent = formatClueValue(clueKey, state.revealedClues.get(clueKey))), 
        button.disabled = state.solved;
    });
}

function renderHistoryTable() {
    const slots = Array.isArray(state.player?.history_slots) ? state.player.history_slots : [];
    if (elements.historyBody.innerHTML = "", 0 === slots.length) {
        const row = document.createElement("tr");
        return row.innerHTML = `
      <td
        class="history-empty"
        colspan="5"
      >
        No team-history entries are available for this player.
      </td>
    `, elements.historyBody.appendChild(row), void updateHistoryCounters();
    }
    slots.forEach(slot => {
        const historyId = Number(slot.id), revealedEntry = state.revealedHistory.get(historyId), row = document.createElement("tr");
        row.className = "history-row " + (revealedEntry ? "is-revealed" : "is-locked"), 
        row.dataset.historyId = String(historyId), row.innerHTML = revealedEntry ? createRevealedHistoryRow(revealedEntry) : createLockedHistoryRow(slot), 
        elements.historyBody.appendChild(row);
    }), updateHistoryCounters();
}

function createLockedHistoryRow(slot) {
    const entryNumber = String(slot.order || "").padStart(2, "0"), disabled = state.solved ? "disabled" : "", actionText = state.solved ? "Game complete" : "Unlock hint";
    return `
    <td
      class="history-lock-cell"
      colspan="5"
    >
      <button
        class="history-lock-button"
        type="button"
        data-unlock-history="${escapeAttribute(slot.id)}"
        ${disabled}
      >
        <span
          class="history-lock-button__index"
        >
          #${entryNumber}
        </span>

        <span>
          <strong>
            ${escapeHtml(slot.label || "Career entry")}
          </strong>

          <small>
            Reveal this database row without revealing the others
          </small>
        </span>

        <span
          class="history-lock-button__cta"
        >
          ${escapeHtml(actionText)}
          <span aria-hidden="true">→</span>
        </span>
      </button>
    </td>
  `;
}

function createRevealedHistoryRow(entry) {
    const teamName = entry.team || entry.team_name || "Unknown team", role = entry.role || entry.position || "—", logoUrl = entry.team_logo_url || entry.team_logo_filename || "", start = entry.start || entry.start_date || "", end = entry.end || entry.end_date || "", initials = getInitials(teamName);
    return `
    <td>
      <div class="team-cell">
        <span class="team-logo">
          ${logoUrl ? `
      <img
        src="${escapeAttribute(logoUrl)}"
        alt=""
        loading="lazy"
        onerror="
          this.hidden=true;
          this.nextElementSibling.hidden=false;
        "
      />

      <span hidden>
        ${escapeHtml(initials)}
      </span>
    ` : `
      <span>
        ${escapeHtml(initials)}
      </span>
    `}
        </span>

        <span>
          ${escapeHtml(teamName)}
        </span>
      </div>
    </td>

    <td>
      ${escapeHtml(role)}
    </td>

    <td>
      ${escapeHtml(entry.region || "—")}
    </td>

    <td>
      ${escapeHtml(formatPeriod(start, end, entry.is_current))}
    </td>

    <td>
      <span class="unlocked-badge">
        <span aria-hidden="true">✓</span>
        Unlocked
      </span>
    </td>
  `;
}

async function handleGeneralClueUnlock(button) {
    if (state.solved || button.disabled) return;
    const clueKey = button.dataset.clueKey;
    if (clueKey && !state.revealedClues.has(clueKey)) {
        button.disabled = !0, button.setAttribute("aria-busy", "true");
        try {
            const clue = await requestGeneralClue(clueKey);
            state.revealedClues.set(clueKey, clue.value), state.manuallyUnlockedClues.add(clueKey), 
            state.hintsUsed += 1, renderGeneralClues(), saveProgress(), updateProgressUI(), 
            showToast(`${getClueDisplayName(clueKey)} unlocked.`);
        } catch (error) {
            console.error(error), button.disabled = !1, showToast("That clue could not be unlocked.");
        } finally {
            button.removeAttribute("aria-busy");
        }
    }
}

async function handleHistoryUnlock(button) {
    if (state.solved || button.disabled) return;
    const historyId = Number(button.dataset.unlockHistory);
    if (historyId && !state.revealedHistory.has(historyId)) {
        button.disabled = !0, button.setAttribute("aria-busy", "true");
        try {
            const historyItem = await requestHistoryHint(historyId);
            state.revealedHistory.set(historyId, historyItem), state.manuallyUnlockedHistoryIds.add(historyId), 
            state.hintsUsed += 1, renderHistoryTable(), saveProgress(), updateProgressUI(), 
            showToast("Team-history entry unlocked.");
        } catch (error) {
            console.error(error), button.disabled = !1, showToast("That team-history hint could not be unlocked.");
        } finally {
            button.removeAttribute("aria-busy");
        }
    }
}

function formatClueValue(clueKey, value) {
    return "retired" === clueKey ? value ? "Retired" : "Active" : "won_first_stand" === clueKey || "won_msi" === clueKey || "won_worlds" === clueKey ? value ? "Champion" : "Not won" : "dob" === clueKey ? formatDate(value) : value || "Unknown";
}

function getClueDisplayName(clueKey) {
    return {
        nationality: "Nationality",
        dob: "Date of birth",
        retired: "Career status",
        won_first_stand: "First Stand record",
        won_msi: "MSI record",
        won_worlds: "Worlds record"
    }[clueKey] || "Clue";
}

function formatDate(value) {
    if (!value) return "Unknown";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(parsed);
}

function formatPeriod(start, end, isCurrent = !1) {
    return isCurrent && start ? `${start} — Present` : start || end ? start && end ? `${start} — ${end}` : start || end || "—" : "—";
}

function getInitials(value) {
    return String(value || "?").split(/\s+/).filter(Boolean).map(word => word[0]).join("").slice(0, 3).toUpperCase();
}

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

function updateCountdown() {
    const now = new Date, nextReset = new Date(now);
    nextReset.setUTCMinutes(0, 0, 0), nextReset.setUTCHours(CONFIG.resetHourUTC), nextReset <= now && nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    const remaining = Math.max(0, nextReset.getTime() - now.getTime()), hours = Math.floor(remaining / 36e5), minutes = Math.floor(remaining % 36e5 / 6e4), seconds = Math.floor(remaining % 6e4 / 1e3);
    elements.countdown.textContent = [ hours, minutes, seconds ].map(number => String(number).padStart(2, "0")).join(":");
}

let sessionCheckInProgress = !1;

async function checkForGlobalSessionChange() {
    if (!CONFIG.useDemoData && CONFIG.apiBaseUrl && state.player?.session_id && !sessionCheckInProgress) {
        sessionCheckInProgress = !0;
        try {
            const latestGameState = await requestGameState(), latestSessionId = latestGameState?.session_id;
            latestSessionId && latestSessionId !== state.player.session_id && window.location.reload();
        } catch (error) {
            console.warn("Could not check the current game session.", error);
        } finally {
            sessionCheckInProgress = !1;
        }
    }
}

function getFilteredPlayers(query) {
    const normalizedQuery = normalizeName(query);
    return normalizedQuery ? state.playerNames.filter(name => normalizeName(name).includes(normalizedQuery)).sort((a, b) => (normalizeName(a).startsWith(normalizedQuery) ? 0 : 1) - (normalizeName(b).startsWith(normalizedQuery) ? 0 : 1) || a.localeCompare(b)).slice(0, 8) : state.playerNames.slice(0, 8);
}

function renderSuggestions() {
    if (state.solved) return void closeSuggestions();
    const matches = getFilteredPlayers(elements.guessInput.value);
    state.activeSuggestionIndex = -1, elements.suggestions.innerHTML = "", 0 !== matches.length ? (matches.forEach((name, index) => {
        const button = document.createElement("button");
        button.type = "button", button.className = "suggestion-item", button.setAttribute("role", "option"), 
        button.dataset.index = String(index), button.innerHTML = `
      <span>
        ${escapeHtml(name)}
      </span>

      <small>Select</small>
    `, button.addEventListener("mousedown", event => {
            event.preventDefault(), selectSuggestion(name);
        }), elements.suggestions.appendChild(button);
    }), elements.suggestions.hidden = !1, elements.guessInput.setAttribute("aria-expanded", "true")) : closeSuggestions();
}

function closeSuggestions() {
    elements.suggestions.hidden = !0, elements.guessInput.setAttribute("aria-expanded", "false"), 
    state.activeSuggestionIndex = -1;
}

function selectSuggestion(name) {
    elements.guessInput.value = name, closeSuggestions(), elements.guessInput.focus();
}

function moveSuggestion(direction) {
    const items = [ ...elements.suggestions.querySelectorAll(".suggestion-item") ];
    elements.suggestions.hidden || 0 === items.length || (state.activeSuggestionIndex = (state.activeSuggestionIndex + direction + items.length) % items.length, 
    items.forEach((item, index) => {
        const isActive = index === state.activeSuggestionIndex;
        item.classList.toggle("is-active", isActive), item.setAttribute("aria-selected", isActive ? "true" : "false");
    }), items[state.activeSuggestionIndex].scrollIntoView({
        block: "nearest"
    }));
}

async function handleGuess(event) {
    if (event.preventDefault(), state.solved) return;
    const guess = elements.guessInput.value.trim();
    if (!guess) return setGuessMessage("Type a player's name first.", "error"), void elements.guessInput.focus();
    elements.submitGuess.disabled = !0, closeSuggestions();
    try {
        const result = await requestGuessResult(guess);
        state.attempts += 1, result.correct ? (state.solved = !0, state.revealedName = result.player_name || guess, 
        state.solveToken = result.solve_token || "", revealPortrait(result), await revealAllPostGameInformation(), 
        setGuessMessage(`Correct — it is ${state.revealedName}!`, "success"), showToast("Daily player solved. GG!")) : (setGuessMessage(result.message || "Not quite. Check the clues and try again.", "error"), 
        elements.guessInput.select()), saveProgress(), updateProgressUI();
    } catch (error) {
        console.error(error), setGuessMessage("Your guess could not be checked. Please try again.", "error");
    } finally {
        elements.submitGuess.disabled = state.solved;
    }
}

function revealPortrait(result) {
    const playerName = result.player_name || state.revealedName || "Correct player", imageUrl = result.image_url || createDemoPortrait(playerName);
    state.revealedName = playerName, state.revealedImageUrl = imageUrl, elements.playerImage.src = imageUrl, 
    elements.playerImage.alt = `${playerName} portrait`, elements.playerImage.hidden = !1, 
    elements.playerName.textContent = playerName, elements.playerCard.classList.add("is-solved"), 
    elements.guessInput.disabled = !0, elements.submitGuess.disabled = !0, elements.shareButton.disabled = !1;
}

async function revealAllPostGameInformation() {
    try {
        const postGameData = await requestPostGameClues();
        return Object.entries(postGameData.clues || {}).forEach(([key, value]) => {
            state.revealedClues.set(key, value);
        }), (postGameData.team_history || []).forEach(entry => {
            state.revealedHistory.set(Number(entry.id), entry);
        }), renderGeneralClues(), renderHistoryTable(), postGameData;
    } catch (error) {
        return console.error("Could not load the post-game recap.", error), null;
    }
}

function updateHistoryCounters() {
    const total = Array.isArray(state.player?.history_slots) ? state.player.history_slots.length : 0, revealed = state.revealedHistory.size;
    elements.historyCount.textContent = `${revealed} / ${total} revealed`, elements.historyUnlockedCount.textContent = String(state.manuallyUnlockedHistoryIds.size);
}

function updateProgressUI() {
    elements.attemptCount.textContent = String(state.attempts), elements.progressScore.textContent = String(state.attempts), 
    elements.hintCount.textContent = String(state.hintsUsed), elements.sideHintCount.textContent = String(state.hintsUsed);
    const percent = Math.min(100, state.attempts / Math.max(1, CONFIG.maxProgressGuesses) * 100);
    if (elements.progressFill.style.width = `${percent}%`, state.solved) {
        const noun = 1 === state.attempts ? "guess" : "guesses", hintNoun = 1 === state.hintsUsed ? "hint" : "hints";
        return void (elements.progressText.textContent = `Solved in ${state.attempts} ${noun} using ${state.hintsUsed} ${hintNoun}.`);
    }
    0 !== state.attempts || 0 !== state.hintsUsed ? 0 !== state.hintsUsed ? 0 !== state.manuallyUnlockedHistoryIds.size ? (elements.progressText.textContent = "Choose the next career entry carefully.", 
    updateHistoryCounters()) : elements.progressText.textContent = "You have not touched the career history yet." : elements.progressText.textContent = "No hints used yet. Bold strategy." : elements.progressText.textContent = "Your first guess is waiting.";
}

function setGuessMessage(message, type = "") {
    elements.guessMessage.textContent = message, elements.guessMessage.classList.remove("is-error", "is-success"), 
    type && elements.guessMessage.classList.add(`is-${type}`);
}

async function shareResult() {
    const text = [ `RiftGuess #${state.player?.game_number || "Daily"}`, `Solved in ${state.attempts} ${1 === state.attempts ? "guess" : "guesses"}`, `${state.hintsUsed} ${1 === state.hintsUsed ? "hint" : "hints"} used`, "Can you guess today's LoL pro?" ].join("\n");
    try {
        if (navigator.share) return void await navigator.share({
            title: "RiftGuess",
            text: text
        });
        await navigator.clipboard.writeText(text), showToast("Result copied to clipboard.");
    } catch (error) {
        "AbortError" !== error?.name && (console.error(error), showToast("Could not share the result."));
    }
}

function showToast(message) {
    window.clearTimeout(toastTimer), elements.toast.textContent = message, elements.toast.classList.add("is-visible"), 
    toastTimer = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
    }, 2600);
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme, elements.themeIcon.textContent = "light" === theme ? "☀" : "☾", 
    localStorage.setItem("riftguess:theme", theme);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem("riftguess:theme");
    setTheme(savedTheme || "dark");
}

document.addEventListener("click", event => {
    const clueButton = event.target.closest("[data-clue-key]");
    if (clueButton) return void handleGeneralClueUnlock(clueButton);
    const historyButton = event.target.closest("[data-unlock-history]");
    historyButton && handleHistoryUnlock(historyButton);
}), elements.guessForm.addEventListener("submit", handleGuess), elements.guessInput.addEventListener("input", renderSuggestions), 
elements.guessInput.addEventListener("focus", renderSuggestions), elements.guessInput.addEventListener("blur", () => {
    window.setTimeout(closeSuggestions, 100);
}), elements.guessInput.addEventListener("keydown", event => {
    if ("ArrowDown" === event.key) return event.preventDefault(), void moveSuggestion(1);
    if ("ArrowUp" === event.key) return event.preventDefault(), void moveSuggestion(-1);
    if ("Enter" === event.key && state.activeSuggestionIndex >= 0) {
        event.preventDefault();
        const activeItem = elements.suggestions.querySelectorAll(".suggestion-item")[state.activeSuggestionIndex];
        if (activeItem) {
            selectSuggestion(activeItem.querySelector("span")?.textContent || "");
        }
        return;
    }
    "Escape" === event.key && closeSuggestions();
}), elements.helpButton.addEventListener("click", () => {
    elements.helpDialog.showModal();
}), elements.closeHelpButton.addEventListener("click", () => {
    elements.helpDialog.close();
}), elements.helpDialog.addEventListener("click", event => {
    event.target === elements.helpDialog && elements.helpDialog.close();
}), elements.themeButton.addEventListener("click", () => {
    setTheme("light" === document.documentElement.dataset.theme ? "dark" : "light");
}), elements.shareButton.addEventListener("click", shareResult), initializeTheme(), 
renderGeneralClues(), updateCountdown(), window.setInterval(updateCountdown, 1e3), 
window.setInterval(checkForGlobalSessionChange, CONFIG.sessionPollIntervalMs), loadGame();
