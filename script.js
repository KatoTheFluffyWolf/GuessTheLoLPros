"use strict";

function trackAnalyticsEvent(eventName, parameters = {}) {
    if (typeof window.gtag !== "function") {
        return;
    }

    window.gtag("event", eventName, parameters);
}

const CONFIG = {
    apiBaseUrl: "https://pnhyxe4nebxsrufkcanvsufpiu0pyjta.lambda-url.ap-southeast-2.on.aws",
    leaguepediaFileRedirectBaseUrl: "https://lol.fandom.com/wiki/Special:Redirect/file/",
    useDemoData: !1,
    resetHourUTC: 17,
    maxProgressGuesses: 6,
    sessionPollIntervalMs: 3e4,
    startingPoints: 150,
    incorrectGuessPenalty: 10,
    historyHintCost: 20,
    latestHistoryHintCost: 35,
    clueCosts: {
        nationality: 10,
        dob: 15,
        retired: 10,
        won_first_stand: 15,
        won_msi: 15,
        won_worlds: 15
    }
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
    pointsRemaining: CONFIG.startingPoints,
    solved: !1,
    lost: !1,
    revealedName: "",
    revealedImageUrl: "",
    solveToken: "",
    revealedClues: new Map,
    revealedHistory: new Map,
    manuallyUnlockedClues: new Set,
    manuallyUnlockedHistoryIds: new Set,
    historyPurchaseCosts: new Map,
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
    topPoints: document.querySelector("#topPoints"),
    pointsRemaining: document.querySelector("#pointsRemaining"),
    startingPoints: document.querySelector("#startingPoints"),
    pointsSpent: document.querySelector("#pointsSpent"),
    progressScore: document.querySelector("#progressScore"),
    progressFill: document.querySelector("#progressFill"),
    progressText: document.querySelector("#progressText"),
    progressCard: document.querySelector("#progressCard"),
    progressStatus: document.querySelector("#progressStatus"),
    viewResultButton: document.querySelector("#viewResultButton"),
    shareButton: document.querySelector("#shareButton"),
    resultDialog: document.querySelector("#resultDialog"),
    closeResultButton: document.querySelector("#closeResultButton"),
    resultPlayerImage: document.querySelector("#resultPlayerImage"),
    resultPlayerName: document.querySelector("#resultPlayerName"),
    resultChallengeLabel: document.querySelector("#resultChallengeLabel"),
    resultOutcomeBadge: document.querySelector(".result-dialog__victory-badge"),
    resultOutcomeStatus: document.querySelector(".result-score-card__solved"),
    resultPointsRemaining: document.querySelector("#resultPointsRemaining"),
    resultStartingPoints: document.querySelector("#resultStartingPoints"),
    resultProgressFill: document.querySelector("#resultProgressFill"),
    resultScoreKept: document.querySelector("#resultScoreKept"),
    resultPointsSpent: document.querySelector("#resultPointsSpent"),
    resultAttempts: document.querySelector("#resultAttempts"),
    resultHints: document.querySelector("#resultHints"),
    resultHistory: document.querySelector("#resultHistory"),
    resultSummary: document.querySelector("#resultSummary"),
    resultShareButton: document.querySelector("#resultShareButton"),
    resultRecapButton: document.querySelector("#resultRecapButton"),
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

function getClueCost(clueKey) {
    return Number(CONFIG.clueCosts[clueKey]) || 0;
}

function getHistorySlots() {
    return Array.isArray(state.player?.history_slots) ? state.player.history_slots : [];
}

function getLatestHistorySlot() {
    const slots = getHistorySlots();
    if (0 === slots.length) return null;
    return slots.reduce((latest, slot) => {
        const latestOrder = Number(latest?.order) || 0;
        const slotOrder = Number(slot?.order) || 0;
        return slotOrder >= latestOrder ? slot : latest;
    }, slots[0]);
}

function isLatestHistoryId(historyId) {
    const latestSlot = getLatestHistorySlot();
    return Boolean(latestSlot) && Number(latestSlot.id) === Number(historyId);
}

function parseRetiredStatus(value) {
    if ("boolean" === typeof value) return value;
    if ("string" === typeof value) {
        const normalized = value.trim().toLowerCase();
        if ([ "true", "retired", "yes", "1" ].includes(normalized)) return !0;
        if ([ "false", "active", "not retired", "no", "0" ].includes(normalized)) return !1;
    }
    return Boolean(value);
}

function getHistoryHintCost(historyId = null) {
    const baseCost = Number(CONFIG.historyHintCost) || 0;
    if (null === historyId || void 0 === historyId) return baseCost;

    return isLatestHistoryId(historyId)
        ? Math.max(baseCost, Number(CONFIG.latestHistoryHintCost) || baseCost)
        : baseCost;
}

function isGameFinished() {
    return state.solved || state.lost;
}

function getIncorrectGuessPenalty() {
    return Math.max(
        0,
        Number(CONFIG.incorrectGuessPenalty) || 0
    );
}

function willIncorrectGuessEndGame() {
    return state.pointsRemaining <= getIncorrectGuessPenalty();
}

function getRemainingHintCosts() {
    const clueCosts = Object.keys(CONFIG.clueCosts)
        .filter(clueKey => {
            return !state.revealedClues.has(clueKey) &&
                !state.manuallyUnlockedClues.has(clueKey);
        })
        .map(getClueCost);

    const historyCosts = getHistorySlots()
        .filter(slot => {
            const historyId = Number(slot.id);
            return !state.revealedHistory.has(historyId) &&
                !state.manuallyUnlockedHistoryIds.has(historyId);
        })
        .map(slot => getHistoryHintCost(Number(slot.id)));

    return [ ...clueCosts, ...historyCosts ]
        .filter(cost => Number.isFinite(cost) && cost > 0);
}

function hasAffordableRemainingHint() {
    return getRemainingHintCosts().some(cost => canAfford(cost));
}

function isForcedGuessState() {
    return !isGameFinished() && !hasAffordableRemainingHint();
}

function getPointsSpent() {
    return Math.max(0, CONFIG.startingPoints - state.pointsRemaining);
}

function canAfford(cost) {
    return state.pointsRemaining >= cost;
}

function reservePoints(cost) {
    if (!canAfford(cost)) return !1;
    state.pointsRemaining = Math.max(0, state.pointsRemaining - cost);
    return !0;
}

function refundPoints(cost) {
    state.pointsRemaining = Math.min(CONFIG.startingPoints, state.pointsRemaining + cost);
}

function applyIncorrectGuessPenalty() {
    const configuredPenalty = getIncorrectGuessPenalty();
    const deductedPoints = Math.min(
        configuredPenalty,
        state.pointsRemaining
    );

    state.pointsRemaining = Math.max(
        0,
        state.pointsRemaining - deductedPoints
    );

    return deductedPoints;
}

function calculateSavedHintSpend() {
    const clueSpend = [ ...state.manuallyUnlockedClues ].reduce((total, clueKey) => {
        return total + getClueCost(clueKey);
    }, 0);
    const historySpend = [ ...state.manuallyUnlockedHistoryIds ].reduce((total, historyId) => {
        const savedCost = Number(state.historyPurchaseCosts.get(Number(historyId)));
        return total + (Number.isFinite(savedCost) ? savedCost : getHistoryHintCost(historyId));
    }, 0);
    return clueSpend + historySpend;
}

function formatPointCost(cost) {
    return `${cost} ${1 === cost ? "pt" : "pts"}`;
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
        startingPoints: CONFIG.startingPoints,
        attempts: state.attempts,
        hintsUsed: state.hintsUsed,
        pointsRemaining: state.pointsRemaining,
        solved: state.solved,
        lost: state.lost,
        revealedName: state.revealedName,
        revealedImageUrl: state.revealedImageUrl,
        solveToken: state.solveToken,
        manuallyUnlockedClues: [ ...state.manuallyUnlockedClues ],
        manuallyUnlockedHistoryIds: [ ...state.manuallyUnlockedHistoryIds ],
        historyPurchaseCosts: Object.fromEntries(state.historyPurchaseCosts)
    };
    localStorage.setItem(getStorageKey(), JSON.stringify(payload));
}

function restoreProgress() {
    try {
        const savedValue = localStorage.getItem(getStorageKey());
        if (!savedValue) return;
        const saved = JSON.parse(savedValue);
        state.attempts = Number(saved.attempts) || 0, state.hintsUsed = Number(saved.hintsUsed) || 0, 
        state.solved = Boolean(saved.solved), state.lost = !state.solved && Boolean(saved.lost),
        state.revealedName = saved.revealedName || "", 
        state.revealedImageUrl = saved.revealedImageUrl || "", state.solveToken = saved.solveToken || "", 
        state.manuallyUnlockedClues = new Set(Array.isArray(saved.manuallyUnlockedClues) ? saved.manuallyUnlockedClues : []), 
        state.manuallyUnlockedHistoryIds = new Set(Array.isArray(saved.manuallyUnlockedHistoryIds) ? saved.manuallyUnlockedHistoryIds.map(Number) : []),
        state.historyPurchaseCosts = new Map(Object.entries(saved.historyPurchaseCosts || {}).map(([historyId, cost]) => [ Number(historyId), Number(cost) ]));
        const savedStartingPoints = Number(saved.startingPoints);
        const savedPoints = Number(saved.pointsRemaining);
        const calculatedPoints = Math.max(
            0,
            CONFIG.startingPoints - calculateSavedHintSpend()
        );
        const savedUsesCurrentPointLimit =
            savedStartingPoints === CONFIG.startingPoints;

        state.pointsRemaining =
            savedUsesCurrentPointLimit && Number.isFinite(savedPoints)
                ? Math.max(
                    0,
                    Math.min(CONFIG.startingPoints, savedPoints)
                )
                : calculatedPoints;
    } catch (error) {
        console.warn("Could not restore the saved game state.", error);
    }
}

async function fetchJson(path, options = {}) {
  const {
    headers: suppliedHeaders = {},
    body,
    ...fetchOptions
  } = options;

  const headers = {
    Accept: "application/json",
    ...suppliedHeaders,
  };

  /*
   * Only send Content-Type when there is actually a request body.
   * GET requests will therefore avoid an unnecessary CORS preflight.
   */
  if (body !== undefined && body !== null) {
    const alreadyHasContentType = Object.keys(headers).some(
      (headerName) =>
        headerName.toLowerCase() === "content-type",
    );

    if (!alreadyHasContentType) {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(
    `${CONFIG.apiBaseUrl}${path}`,
    {
      cache: "no-store",
      ...fetchOptions,
      body,
      headers,
    },
  );

  if (!response.ok) {
    const message = await response.text();

    throw new Error(
      message ||
        `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

async function requestInitialGame() {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    return {
      player: createPublicDemoPayload(),
      playerNames: DEMO_PLAYERS,
    };
  }

  /*
   * Load the essential daily-player data first.
   *
   * This allows the first request to initialize the Lambda before
   * the player-name request is sent, reducing simultaneous cold starts.
   */
  const player = await fetchJson("/api/daily-player");

  let playerNames = [];

  try {
    const playerNamesResponse =
      await fetchJson("/api/player-names");

    playerNames = Array.isArray(playerNamesResponse)
      ? playerNamesResponse
      : playerNamesResponse.players || [];
  } catch (error) {
    /*
     * The game can still load without autocomplete suggestions.
     * Players can continue typing guesses manually.
     */
    console.warn(
      "Player names could not be loaded.",
      error,
    );
  }

  return {
    player,
    playerNames,
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

async function requestGuessResult(guess, finalGuess = false) {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
        await demoDelay();
        const correct = normalizeName(guess) === normalizeName(DEMO_SECRET_PLAYER.name);
        const shouldReveal = correct || finalGuess;

        return {
            correct: correct,
            game_over: !correct && finalGuess,
            message: correct ? "Correct!" : "Not quite. Check the clues and try again.",
            ...shouldReveal ? {
                player_name: DEMO_SECRET_PLAYER.name,
                image_url: DEMO_SECRET_PLAYER.image_url,
                solve_token: "demo-post-game-token"
            } : {}
        };
    }

    return fetchJson("/api/guess", {
        method: "POST",
        body: JSON.stringify({
            guess: guess,
            final_guess: finalGuess
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

    state.player = data.player;
    state.playerNames = data.playerNames;

    removeOldGameSessions();
    restoreProgress();
    renderBaseGame();

    if (isGameFinished()) {
      await restoreSolvedGame();
    } else {
      await restoreUnlockedHints();
    }

    updateProgressUI();

    trackAnalyticsEvent("game_started", {
      game_number: state.player?.game_number || 0,
      resumed_game:
        state.attempts > 0 || state.hintsUsed > 0 ? "yes" : "no",
    });
  } catch (error) {
    console.error(error);
    setGuessMessage(
      "The daily player could not be loaded. Please try again later.",
      "error",
    );
    elements.submitGuess.disabled = true;
  } finally {
    elements.playerCard.setAttribute("aria-busy", "false");
  }
}

function renderBaseGame() {
    if (!state.player) return;

    elements.gameNumber.textContent = "Daily challenge";
    renderHistoryTable();
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
        image_url: postGameData?.image_url || state.revealedImageUrl || ""
    });

    setGuessMessage("");
}

function renderGeneralClues() {
    document.querySelectorAll("[data-clue-card]").forEach(card => {
        const clueKey = card.dataset.clueCard, button = card.querySelector("[data-clue-key]"), valueElement = card.querySelector("[data-clue-value]"), costElement = card.querySelector("[data-clue-cost]");
        if (!button || !valueElement) return;
        const hasValue = state.revealedClues.has(clueKey), cost = getClueCost(clueKey), affordable = canAfford(cost);
        card.classList.toggle("is-revealed", hasValue), card.classList.toggle("is-unaffordable", !hasValue && !affordable && !isGameFinished()), 
        button.hidden = hasValue, valueElement.hidden = !hasValue, costElement && (costElement.textContent = formatPointCost(cost)), 
        hasValue && (valueElement.textContent = formatClueValue(clueKey, state.revealedClues.get(clueKey))), 
        button.disabled = isGameFinished() || !affordable, button.title = !isGameFinished() && !affordable ? `You need ${cost - state.pointsRemaining} more points.` : "";
    });
}

function renderHistoryTable() {
    const slots = Array.isArray(state.player?.history_slots) ? state.player.history_slots : [];
    elements.historyBody.innerHTML = "";

    if (0 === slots.length) {
        const row = document.createElement("tr");
        row.innerHTML = `
      <td
        class="history-empty"
        colspan="5"
      >
        No team-history entries are available for this player.
      </td>
    `;
        elements.historyBody.appendChild(row);
        updateHistoryCounters();
        return;
    }

    slots.forEach(slot => {
        const historyId = Number(slot.id);
        const revealedEntry = state.revealedHistory.get(historyId);
        const row = document.createElement("tr");

        row.className = "history-row " + (revealedEntry ? "is-revealed" : "is-locked");
        row.dataset.historyId = String(historyId);
        row.innerHTML = revealedEntry ? createRevealedHistoryRow(revealedEntry) : createLockedHistoryRow(slot);
        elements.historyBody.appendChild(row);
    });

    activateHistoryLogoFallbacks();
    activateRoleIconFallbacks();
    updateHistoryCounters();
}

function createLockedHistoryRow(slot) {
    const historyId = Number(slot.id);
    const entryNumber = String(slot.order || "").padStart(2, "0");
    const latestEntry = isLatestHistoryId(historyId);
    const cost = getHistoryHintCost(historyId);
    const affordable = canAfford(cost);
    const disabled = isGameFinished() || !affordable ? "disabled" : "";
    const actionText = isGameFinished()
        ? "Complete"
        : affordable
            ? "Unlock"
            : `Need ${cost - state.pointsRemaining}`;
    const helperText = latestEntry
        ? `Latest career entry: this row always costs ${formatPointCost(cost)}`
        : "Reveal this database row without revealing the others";
    const costText = formatPointCost(cost);
    const title = isGameFinished()
        ? ""
        : !affordable
            ? `You need ${cost - state.pointsRemaining} more points.`
            : latestEntry
                ? `The latest career entry always costs ${formatPointCost(cost)}.`
                : "";

    return `
    <td
      class="history-lock-cell"
      colspan="5"
    >
      <button
        class="history-lock-button"
        type="button"
        data-unlock-history="${escapeAttribute(slot.id)}"
        data-history-cost="${cost}"
        ${disabled}
        title="${escapeAttribute(title)}"
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
            ${escapeHtml(helperText)}
          </small>
        </span>

        <span
          class="history-lock-button__cta"
        >
          <span class="hint-cost">${escapeHtml(costText)}</span>
          <span class="history-lock-button__action-text">${escapeHtml(actionText)}</span>
          <span aria-hidden="true">→</span>
        </span>
      </button>
    </td>
  `;
}
const ROLE_ICON_PATHS = {
    top: "assets/top.png",
    jungle: "assets/jung.png",
    mid: "assets/mid.png",
    bot: "assets/bot.png",
    support: "assets/support.png"
};

const ROLE_ALIASES = {
    // Top
    top: "top",
    "top lane": "top",
    "top laner": "top",

    // Jungle
    jungle: "jungle",
    jungler: "jungle",
    jg: "jungle",
    jgl: "jungle",

    // Mid
    mid: "mid",
    middle: "mid",
    "mid lane": "mid",
    "mid laner": "mid",
    "middle lane": "mid",

    // Bot / ADC
    bot: "bot",
    bottom: "bot",
    "bot lane": "bot",
    "bot laner": "bot",
    "bottom lane": "bot",
    adc: "bot",
    "ad carry": "bot",
    marksman: "bot",

    // Support
    support: "support",
    supp: "support",
    sup: "support"
};

function getRoleIconPath(role) {
    const normalizedRole = String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const basicRole = ROLE_ALIASES[normalizedRole];

    return basicRole
        ? ROLE_ICON_PATHS[basicRole]
        : "";
}

function createRevealedHistoryRow(entry) {
    const teamName = entry.team || entry.team_name || "Unknown team";
    const teamAbbreviation = entry.team_abbreviation || entry.abbreviation || "";
    const role = entry.role || entry.position || "—";
    const roleIconPath = getRoleIconPath(role);
    const region = entry.region || "—";
    const logoUrl = getTeamLogoUrl(entry);
    const start = entry.start || entry.start_date || "";
    const end = entry.end || entry.end_date || "";
    const isCurrent = "string" === typeof entry.is_current
        ? ["true", "yes", "1", "current"].includes(entry.is_current.trim().toLowerCase())
        : Boolean(entry.is_current);
    const initials = getInitials(teamName);
    const logoStateClass = logoUrl ? "has-image" : "is-fallback";

    return `
    <td class="history-team-column">
      <div class="team-cell">
        <span
          class="team-logo ${logoStateClass}"
          data-team-logo
          aria-hidden="true"
        >
          <span class="team-logo__fallback">
            ${escapeHtml(initials)}
          </span>

          ${logoUrl ? `
            <img
              class="team-logo__image"
              data-team-logo-image
              src="${escapeAttribute(logoUrl)}"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
          ` : ""}
        </span>

        <span class="team-identity">
          <strong class="team-identity__name">
            ${escapeHtml(teamName)}
          </strong>

          <span class="team-identity__meta">
            ${teamAbbreviation ? `<span class="team-abbreviation">${escapeHtml(teamAbbreviation)}</span>` : ""}
            ${isCurrent ? `<span class="current-team-badge"><span aria-hidden="true"></span>Current team</span>` : ""}
          </span>
        </span>
      </div>
    </td>

    <td class="history-role-column">
  ${
      roleIconPath
          ? `
            <span
              class="history-role-display"
              data-role-display
              title="${escapeAttribute(role)}"
            >
              <img
                class="history-role-icon"
                data-role-icon-image
                src="${escapeAttribute(roleIconPath)}"
                alt="${escapeAttribute(role)} role"
                loading="lazy"
                decoding="async"
              />

              <span
                class="history-detail-chip history-detail-chip--role"
                data-role-fallback
                hidden
              >
                ${escapeHtml(role)}
              </span>
            </span>
          `
          : `
            <span class="history-detail-chip history-detail-chip--role">
              ${escapeHtml(role)}
            </span>
          `
  }
</td>

    <td>
      <span class="history-detail-chip">
        ${escapeHtml(region)}
      </span>
    </td>

    <td>
      <span class="history-period">
        ${escapeHtml(formatPeriod(start, end, isCurrent))}
      </span>
    </td>

    <td>
      <span class="unlocked-badge">
        <span aria-hidden="true">✓</span>
        Unlocked
      </span>
    </td>
  `;
}

function getTeamLogoUrl(entry) {
    const logoUrl = String(
        entry?.team_logo_url || ""
    ).trim();

    if (!logoUrl) {
        return "";
    }

    if (/^(?:https?:|data:|blob:)/i.test(logoUrl)) {
        return logoUrl;
    }

    return "";
}

function activateHistoryLogoFallbacks() {
    elements.historyBody
        .querySelectorAll("[data-team-logo-image]")
        .forEach(image => {
            const showFallback = () => {
                console.error(
                    "Team logo failed to load:",
                    image.currentSrc || image.src
                );

                const logo = image.closest("[data-team-logo]");
                if (!logo) return;

                logo.classList.remove("has-image");
                logo.classList.add("has-error");
                image.remove();
            };

            image.addEventListener("load", () => {
                console.log(
                    "Team logo loaded successfully:",
                    image.currentSrc || image.src
                );
            }, {
                once: true
            });

            image.addEventListener("error", showFallback, {
                once: true
            });

            if (image.complete && image.naturalWidth === 0) {
                showFallback();
            }
        });
}

function activateRoleIconFallbacks() {
    elements.historyBody
        .querySelectorAll("[data-role-icon-image]")
        .forEach(image => {
            const showTextFallback = () => {
                const roleDisplay = image.closest("[data-role-display]");

                if (!roleDisplay) return;

                const fallback = roleDisplay.querySelector(
                    "[data-role-fallback]"
                );

                image.remove();

                if (fallback) {
                    fallback.hidden = false;
                }
            };

            image.addEventListener("error", showTextFallback, {
                once: true
            });

            if (image.complete && image.naturalWidth === 0) {
                showTextFallback();
            }
        });
}

async function handleGeneralClueUnlock(button) {
    if (isGameFinished() || button.disabled) return;
    const clueKey = button.dataset.clueKey, cost = getClueCost(clueKey);
    if (clueKey && !state.revealedClues.has(clueKey)) {
        if (!reservePoints(cost)) return void showToast(`You need ${cost - state.pointsRemaining} more points for that clue.`);
        button.disabled = !0, button.setAttribute("aria-busy", "true"), updateProgressUI(), renderGeneralClues(), renderHistoryTable();
        try {
            const clue = await requestGeneralClue(clueKey);
            state.revealedClues.set(clueKey, clue.value), state.manuallyUnlockedClues.add(clueKey), 
            state.hintsUsed += 1, renderGeneralClues(), renderHistoryTable(), saveProgress(), updateProgressUI();
            if ("retired" === clueKey) {
                showToast(`Career status: ${formatClueValue(clueKey, clue.value)}.`);
            } else showToast(`${getClueDisplayName(clueKey)} unlocked for ${formatPointCost(cost)}.`);
        } catch (error) {
            console.error(error), refundPoints(cost), button.disabled = !1, renderGeneralClues(), renderHistoryTable(), updateProgressUI(), showToast("That clue could not be unlocked. Your points were refunded.");
        } finally {
            button.removeAttribute("aria-busy");
        }
    }
}

async function handleHistoryUnlock(button) {
    if (isGameFinished() || button.disabled) return;
    const historyId = Number(button.dataset.unlockHistory);
    const cost = getHistoryHintCost(historyId);
    if (historyId && !state.revealedHistory.has(historyId)) {
        if (!reservePoints(cost)) return void showToast(`You need ${cost - state.pointsRemaining} more points for that history hint.`);
        button.disabled = !0, button.setAttribute("aria-busy", "true"), updateProgressUI(), renderGeneralClues(), renderHistoryTable();
        try {
            const historyItem = await requestHistoryHint(historyId);
            state.revealedHistory.set(historyId, historyItem), state.manuallyUnlockedHistoryIds.add(historyId), state.historyPurchaseCosts.set(historyId, cost), 
            state.hintsUsed += 1, renderGeneralClues(), renderHistoryTable(), saveProgress(), updateProgressUI(), 
            showToast(`Team-history entry unlocked for ${formatPointCost(cost)}.`);
        } catch (error) {
            console.error(error), refundPoints(cost), renderGeneralClues(), renderHistoryTable(), updateProgressUI(), showToast("That team-history hint could not be unlocked. Your points were refunded.");
        } finally {
            button.removeAttribute("aria-busy");
        }
    }
}

function formatClueValue(clueKey, value) {
    return "retired" === clueKey ? parseRetiredStatus(value) ? "Retired" : "Active" : "won_first_stand" === clueKey || "won_msi" === clueKey || "won_worlds" === clueKey ? value ? "Champion" : "Not won" : "dob" === clueKey ? formatDate(value) : value || "Unknown";
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
    const formattedStart = formatHistoryDate(start);
    const formattedEnd = isCurrent ? "Present" : formatHistoryDate(end);

    if (formattedStart && formattedEnd) return `${formattedStart} — ${formattedEnd}`;
    return formattedStart || formattedEnd || "—";
}

function formatHistoryDate(value) {
    if (!value) return "";

    const rawValue = String(value).trim();
    const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
    const parsed = new Date(isoDateOnly ? `${rawValue}T00:00:00Z` : rawValue);

    if (Number.isNaN(parsed.getTime())) return rawValue;

    return new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(parsed);
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
    if (isGameFinished()) return void closeSuggestions();
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
    event.preventDefault();

    if (isGameFinished()) return;

    const guess = elements.guessInput.value.trim();

    if (!guess) {
        setGuessMessage("Type a player's name first.", "error");
        elements.guessInput.focus();
        return;
    }

    elements.submitGuess.disabled = true;
    closeSuggestions();

    try {
        const finalGuess = willIncorrectGuessEndGame();
        const result = await requestGuessResult(guess, finalGuess);
        state.attempts += 1;
        
        trackAnalyticsEvent("guess_submitted", {
          correct: result.correct ? "yes" : "no",
          attempt_number: state.attempts,
        });
        if (result.correct) {
            state.solved = true;
            state.lost = false;
            state.revealedName = result.player_name || guess;
            state.solveToken = result.solve_token || "";

            trackAnalyticsEvent("game_completed", {
                  result: "won",
                  guesses_used: state.attempts,
                  final_score: state.pointsRemaining,
                  hints_used: state.hintsUsed,
                });
            
            const postGameData = await revealAllPostGameInformation();

            revealPortrait({
                player_name:
                    postGameData?.player_name ||
                    result.player_name ||
                    state.revealedName,
                image_url:
                    postGameData?.image_url ||
                    result.image_url ||
                    ""
            });

            setGuessMessage("");
            saveProgress();
            updateProgressUI();
            showResultDialog();
            showToast("Daily player solved. GG!");
            return;
        }

        const deductedPoints = applyIncorrectGuessPenalty();

        if (state.pointsRemaining <= 0) {
            state.lost = true;
            state.revealedName = result.player_name || "Today's player";
            state.revealedImageUrl = result.image_url || "";
            state.solveToken = result.solve_token || "";

            trackAnalyticsEvent("game_completed", {
                result: "lost",
                guesses_used: state.attempts,
                final_score: state.pointsRemaining,
                hints_used: state.hintsUsed,
            });

            const postGameData = await revealAllPostGameInformation();

            revealPortrait({
                player_name:
                    postGameData?.player_name ||
                    result.player_name ||
                    state.revealedName,
                image_url:
                    postGameData?.image_url ||
                    result.image_url ||
                    ""
            });

            setGuessMessage("");
            saveProgress();
            updateProgressUI();
            showResultDialog();
            showToast("Game over. Better luck on the next challenge.");
            return;
        }

        const baseMessage =
            result.message ||
            "Not quite. Check the clues and try again.";
        const penaltyMessage = deductedPoints > 0
            ? ` ${deductedPoints} points lost.`
            : " Your score is already at zero.";

        setGuessMessage(
            `${baseMessage}${penaltyMessage}`,
            "error"
        );

        showToast(
            deductedPoints > 0
                ? `Incorrect guess: -${deductedPoints} points.`
                : "Incorrect guess. Your score is already at zero."
        );

        elements.guessInput.select();
        saveProgress();
        updateProgressUI();
    } catch (error) {
        console.error(error);
        setGuessMessage(
            "Your guess could not be checked. Please try again.",
            "error"
        );
    } finally {
        elements.submitGuess.disabled = isGameFinished();
    }
}

function revealPortrait(result) {
    const playerName =
        result.player_name ||
        state.revealedName ||
        "Today's player";

    const imageUrl =
        result.image_url ||
        createDemoPortrait(playerName);

    state.revealedName = playerName;
    state.revealedImageUrl = imageUrl;

    elements.playerImage.onerror = () => {
        console.error(
            "Player image failed to load:",
            elements.playerImage.currentSrc ||
            elements.playerImage.src
        );

        elements.playerImage.onerror = null;
        elements.playerImage.src = createDemoPortrait(
            playerName
        );
    };

    elements.playerImage.onload = () => {
        console.log(
            "Player image loaded:",
            elements.playerImage.currentSrc ||
            elements.playerImage.src
        );
    };

    elements.playerImage.src = imageUrl;
    elements.playerImage.alt = `${playerName} portrait`;
    elements.playerImage.hidden = false;

    elements.playerName.textContent = playerName;
    elements.playerCard.classList.add("is-solved");
    elements.playerCard.classList.toggle("is-lost", state.lost);
    elements.guessInput.disabled = true;
    elements.submitGuess.disabled = true;
    elements.shareButton.disabled = false;
}


function updateResultDialogUI() {
    if (!elements.resultDialog) return;

    const won = state.solved;
    const lost = state.lost;
    const playerName = state.revealedName || "Today's player";
    const imageUrl = state.revealedImageUrl || createDemoPortrait(playerName);
    const pointsSpent = getPointsSpent();
    const scorePercent = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                state.pointsRemaining /
                Math.max(1, CONFIG.startingPoints) *
                100
            )
        )
    );
    const guessNoun = state.attempts === 1 ? "guess" : "guesses";
    const hintNoun = state.hintsUsed === 1 ? "hint" : "hints";

    elements.resultDialog.classList.toggle("is-loss", lost);

    if (elements.resultOutcomeBadge) {
        elements.resultOutcomeBadge.innerHTML = won
            ? '<span aria-hidden="true">✓</span> Correct guess'
            : '<span aria-hidden="true">×</span> Game over';
    }

    if (elements.resultOutcomeStatus) {
        elements.resultOutcomeStatus.innerHTML = won
            ? '<span aria-hidden="true"></span> Solved'
            : '<span aria-hidden="true"></span> Game over';
    }

    elements.resultPlayerName.textContent = playerName;
    elements.resultChallengeLabel.textContent = state.player?.game_number
        ? won
            ? `Challenge #${state.player.game_number} complete`
            : `Challenge #${state.player.game_number} — game over`
        : won
            ? "Daily challenge complete"
            : "Daily challenge — game over";
    elements.resultPointsRemaining.textContent = String(state.pointsRemaining);
    elements.resultStartingPoints.textContent = String(CONFIG.startingPoints);
    elements.resultProgressFill.style.width = `${scorePercent}%`;
    elements.resultScoreKept.textContent = `${scorePercent}%`;
    elements.resultPointsSpent.textContent = String(pointsSpent);
    elements.resultAttempts.textContent = String(state.attempts);
    elements.resultHints.textContent = String(state.hintsUsed);
    elements.resultHistory.textContent = String(
        state.manuallyUnlockedHistoryIds.size
    );
    elements.resultSummary.textContent = won
        ? `Solved in ${state.attempts} ${guessNoun} with ${state.hintsUsed} ${hintNoun} purchased.`
        : `Game over after ${state.attempts} ${guessNoun} and ${state.hintsUsed} ${hintNoun}. Today's pro was ${playerName}.`;

    if (elements.viewResultButton) {
        elements.viewResultButton.innerHTML = won
            ? '<span aria-hidden="true">✦</span> View solved result'
            : '<span aria-hidden="true">✦</span> View game-over result';
    }

    elements.resultPlayerImage.onerror = () => {
        console.error(
            "Result portrait failed to load:",
            elements.resultPlayerImage.currentSrc ||
            elements.resultPlayerImage.src
        );

        elements.resultPlayerImage.onerror = null;
        elements.resultPlayerImage.src = createDemoPortrait(playerName);
    };

    if (elements.resultPlayerImage.src !== imageUrl) {
        elements.resultPlayerImage.src = imageUrl;
    }

    elements.resultPlayerImage.alt = `${playerName} portrait`;
}

function showResultDialog() {
    if (!isGameFinished() || !elements.resultDialog) return;

    updateResultDialogUI();

    if (!elements.resultDialog.open) {
        elements.resultDialog.showModal();
    }
}

function closeResultDialog({showRecap = false} = {}) {
    if (elements.resultDialog?.open) {
        elements.resultDialog.close();
    }

    if (showRecap) {
        window.requestAnimationFrame(() => {
            elements.playerCard.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }
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
    const pointsSpent = getPointsSpent();
    const pointsPercent = Math.max(
        0,
        Math.min(
            100,
            state.pointsRemaining / Math.max(1, CONFIG.startingPoints) * 100
        )
    );
    const finished = isGameFinished();

    elements.attemptCount.textContent = String(state.attempts);
    elements.progressScore.textContent = String(state.attempts);
    elements.hintCount.textContent = String(state.hintsUsed);
    elements.sideHintCount.textContent = String(state.hintsUsed);
    elements.topPoints.textContent = String(state.pointsRemaining);
    elements.pointsRemaining.textContent = String(state.pointsRemaining);
    elements.startingPoints.textContent = String(CONFIG.startingPoints);
    elements.pointsSpent.textContent = String(pointsSpent);
    elements.progressFill.style.width = `${pointsPercent}%`;

    elements.progressCard?.classList.toggle("is-complete", finished);
    elements.progressCard?.classList.toggle("is-lost", state.lost);

    if (elements.progressStatus) {
        elements.progressStatus.textContent = state.solved
            ? "Solved"
            : state.lost
                ? "Game over"
                : "In progress";
        elements.progressStatus.classList.toggle("is-complete", finished);
        elements.progressStatus.classList.toggle("is-lost", state.lost);
    }

    if (elements.viewResultButton) {
        elements.viewResultButton.hidden = !finished;
    }

    const submitGuessLabel = elements.submitGuess?.querySelector("span:first-child");
    if (submitGuessLabel) {
        submitGuessLabel.textContent =
            !finished && isForcedGuessState() && willIncorrectGuessEndGame()
                ? "Final guess"
                : "Guess";
    }

    if (finished) {
        updateResultDialogUI();
    }

    renderGeneralClues();
    renderHistoryTable();

    if (finished) {
        const guessNoun = state.attempts === 1 ? "guess" : "guesses";
        const hintNoun = state.hintsUsed === 1 ? "hint" : "hints";

        elements.progressText.textContent = state.solved
            ? `Finished with ${state.pointsRemaining} points after ${state.attempts} ${guessNoun} and ${state.hintsUsed} ${hintNoun}.`
            : `Game over after ${state.attempts} ${guessNoun} and ${state.hintsUsed} ${hintNoun}.`;
        return;
    }

    if (isForcedGuessState()) {
        elements.progressText.textContent = willIncorrectGuessEndGame()
            ? "No clues are affordable — this is your final guess."
            : `No clues are affordable — you must guess. A wrong answer costs ${getIncorrectGuessPenalty()} points.`;
        return;
    }

    if (0 === pointsSpent) {
        elements.progressText.textContent = "Your full score is still intact.";
        return;
    }

    const latestSlot = getLatestHistorySlot();
    const latestCost = latestSlot
        ? getHistoryHintCost(latestSlot.id)
        : getHistoryHintCost();
    const latestHistoryIsLocked = latestSlot &&
        !state.revealedHistory.has(Number(latestSlot.id));

    if (
        latestHistoryIsLocked &&
        state.pointsRemaining < latestCost &&
        state.pointsRemaining >= getHistoryHintCost()
    ) {
        elements.progressText.textContent =
            `The latest history entry costs ${latestCost} points and is currently out of reach.`;
        return;
    }

    if (state.pointsRemaining < getHistoryHintCost()) {
        elements.progressText.textContent =
            "History hints are out of reach, but cheaper clues may still be available.";
        return;
    }

    elements.progressText.textContent =
        `${state.pointsRemaining} points remain. Spend only what moves you closer.`;
}

function setGuessMessage(message, type = "") {
    elements.guessMessage.textContent = message, elements.guessMessage.classList.remove("is-error", "is-success"), 
    type && elements.guessMessage.classList.add(`is-${type}`);
}

async function shareResult() {
  const outcomeLine = state.solved
    ? `Solved in ${state.attempts} ${
        state.attempts === 1 ? "guess" : "guesses"
      }`
    : `Game over after ${state.attempts} ${
        state.attempts === 1 ? "guess" : "guesses"
      }`;

  const text = [
    `RiftGuess #${state.player?.game_number || "Daily"}`,
    `${state.pointsRemaining}/${CONFIG.startingPoints} points remaining`,
    outcomeLine,
    `${state.hintsUsed} ${state.hintsUsed === 1 ? "hint" : "hints"} purchased`,
    "Can you guess today's LoL pro?",
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({
        title: "RiftGuess",
        text,
      });

      trackAnalyticsEvent("result_shared", {
        share_method: "native_share",
        result: state.solved ? "won" : "lost",
      });

      return;
    }

    await navigator.clipboard.writeText(text);

    trackAnalyticsEvent("result_shared", {
      share_method: "clipboard",
      result: state.solved ? "won" : "lost",
    });

    showToast("Result copied to clipboard.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      showToast("Could not share the result.");
    }
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
}), elements.viewResultButton.addEventListener("click", showResultDialog),
elements.closeResultButton.addEventListener("click", () => {
    closeResultDialog();
}), elements.resultRecapButton.addEventListener("click", () => {
    closeResultDialog({
        showRecap: true
    });
}), elements.resultShareButton.addEventListener("click", shareResult),
elements.resultDialog.addEventListener("click", event => {
    if (event.target === elements.resultDialog) {
        closeResultDialog();
    }
}), elements.themeButton.addEventListener("click", () => {
    setTheme("light" === document.documentElement.dataset.theme ? "dark" : "light");
}), elements.shareButton.addEventListener("click", shareResult), initializeTheme(), 
renderGeneralClues(), updateCountdown(), window.setInterval(updateCountdown, 1e3), 
window.setInterval(checkForGlobalSessionChange, CONFIG.sessionPollIntervalMs), loadGame();
