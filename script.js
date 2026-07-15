"use strict";

/*
  FRONTEND-ONLY DEMO
  ------------------
  This version deliberately models the future API flow:

  1. The initial daily-player payload contains only:
     - game number
     - the number/order of available team-history slots
     - the player-name suggestion list

  2. A general clue is fetched only when its button is pressed.

  3. A team-history row is fetched only when that specific row is pressed.

  4. The portrait URL and answer are returned only after a correct guess.

  Demo mode still stores the secret data in this JavaScript file, so it is not
  cheat-proof. When the backend is connected, move DEMO_SECRET_PLAYER to the
  server and replace the request* functions with real fetch calls.
*/

const CONFIG = {
  apiBaseUrl: "https://pnhyxe4nebxsrufkcanvsufpiu0pyjta.lambda-url.ap-southeast-2.on.aws",
  useDemoData: false,
  resetHourUTC: 17,
  maxProgressGuesses: 6,
};

const DEMO_SECRET_PLAYER = {
  game_number: 1,
  name: "Faker",
  image_url: createDemoPortrait("Faker"),

  clues: {
    nationality: "South Korea",
    dob: "May 7, 1996",
    retired: false,

    // International-title hints
    won_first_stand: true,
    won_msi: true,
    won_worlds: true,
  },

  team_history: [
    {
      id: 101,
      team: "SK Telecom T1 2",
      role: "Mid",
      region: "LCK",
      start: "Feb 2013",
      end: "Jun 2013",
      is_current: false,
      team_logo_url: "",
    },
    {
      id: 102,
      team: "SK Telecom T1 K",
      role: "Mid",
      region: "LCK",
      start: "Jun 2013",
      end: "Nov 2014",
      is_current: false,
      team_logo_url: "",
    },
    {
      id: 103,
      team: "SK Telecom T1",
      role: "Mid",
      region: "LCK",
      start: "Nov 2014",
      end: "Dec 2019",
      is_current: false,
      team_logo_url: "",
    },
    {
      id: 104,
      team: "T1",
      role: "Mid",
      region: "LCK",
      start: "Dec 2019",
      end: "Present",
      is_current: true,
      team_logo_url: "",
    },
  ],
};

const DEMO_PLAYERS = [
  "Faker",
  "Caps",
  "Rekkles",
  "ShowMaker",
  "Chovy",
  "Uzi",
  "Deft",
  "Rookie",
  "Keria",
  "Canyon",
  "Ruler",
  "Mata",
  "Perkz",
  "Jankos",
  "Bin",
  "Knight",
  "TheShy",
  "Doublelift",
  "Bjergsen",
  "Levi",
];

const state = {
  player: null,
  playerNames: [],
  attempts: 0,
  hintsUsed: 0,
  solved: false,
  revealedName: "",
  revealedImageUrl: "",

  revealedClues: new Map(),
  revealedHistory: new Map(),

  manuallyUnlockedClues: new Set(),
  manuallyUnlockedHistoryIds: new Set(),

  activeSuggestionIndex: -1,
};

const elements = {
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

  toast: document.querySelector("#toast"),
};

let toastTimer;

function normalizeName(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function createDemoPortrait(label) {
  const safeLabel = String(label).replace(/[<>&"']/g, "");
  const initial = safeLabel.slice(0, 1).toUpperCase();

  const svg = `
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
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPublicDemoPayload() {
  const history = DEMO_SECRET_PLAYER.team_history;

  return {
    game_number: DEMO_SECRET_PLAYER.game_number,

    history_slots: history.map((entry, index) => ({
      id: entry.id,
      order: index + 1,
      label: getHistorySlotLabel(index, history.length),
    })),
  };
}

function getHistorySlotLabel(index, total) {
  if (total === 1) {
    return "Only recorded career entry";
  }

  if (index === 0) {
    return "Earliest recorded career entry";
  }

  if (index === total - 1) {
    return "Latest recorded career entry";
  }

  return `Career entry ${index + 1} of ${total}`;
}

function getStorageKey() {
  const challengeId =
    state.player?.game_number ||
    new Date().toISOString().slice(0, 10);

  return `riftguess:${challengeId}`;
}

function saveProgress() {
  const payload = {
    attempts: state.attempts,
    hintsUsed: state.hintsUsed,
    solved: state.solved,

    revealedName: state.revealedName,
    revealedImageUrl: state.revealedImageUrl,

    manuallyUnlockedClues: [
      ...state.manuallyUnlockedClues,
    ],

    manuallyUnlockedHistoryIds: [
      ...state.manuallyUnlockedHistoryIds,
    ],
  };

  localStorage.setItem(
    getStorageKey(),
    JSON.stringify(payload),
  );
}

function restoreProgress() {
  try {
    const savedValue = localStorage.getItem(getStorageKey());

    if (!savedValue) {
      return;
    }

    const saved = JSON.parse(savedValue);

    state.attempts = Number(saved.attempts) || 0;
    state.hintsUsed = Number(saved.hintsUsed) || 0;
    state.solved = Boolean(saved.solved);

    state.revealedName = saved.revealedName || "";
    state.revealedImageUrl = saved.revealedImageUrl || "";

    state.manuallyUnlockedClues = new Set(
      Array.isArray(saved.manuallyUnlockedClues)
        ? saved.manuallyUnlockedClues
        : [],
    );

    state.manuallyUnlockedHistoryIds = new Set(
      Array.isArray(saved.manuallyUnlockedHistoryIds)
        ? saved.manuallyUnlockedHistoryIds.map(Number)
        : [],
    );
  } catch (error) {
    console.warn(
      "Could not restore the saved game state.",
      error,
    );
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(
    `${CONFIG.apiBaseUrl}${path}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
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

/*
  Recommended backend endpoints:

  GET /api/daily-player

  Response:
  {
    "game_number": 142,
    "history_slots": [
      {
        "id": 731,
        "order": 1,
        "label": "Earliest recorded career entry"
      },
      {
        "id": 732,
        "order": 2,
        "label": "Latest recorded career entry"
      }
    ]
  }

  GET /api/player-names

  Response:
  [
    "Faker",
    "Caps",
    "Chovy"
  ]

  POST /api/hints/clue

  Basic clue body:
  {
    "key": "nationality"
  }

  International-title clue body:
  {
    "key": "won_msi"
  }

  Basic clue response:
  {
    "key": "nationality",
    "value": "South Korea"
  }

  Boolean clue response:
  {
    "key": "won_msi",
    "value": true
  }

  POST /api/hints/team-history

  Body:
  {
    "history_id": 731
  }

  POST /api/guess

  Body:
  {
    "guess": "Faker"
  }

  Correct response:
  {
    "correct": true,
    "player_name": "Faker",
    "image_url": "https://..."
  }
*/

async function requestInitialGame() {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    return {
      player: createPublicDemoPayload(),
      playerNames: DEMO_PLAYERS,
    };
  }

  const [
    player,
    playerNamesResponse,
  ] = await Promise.all([
    fetchJson("/api/daily-player"),
    fetchJson("/api/player-names"),
  ]);

  return {
    player,

    playerNames: Array.isArray(playerNamesResponse)
      ? playerNamesResponse
      : playerNamesResponse.players || [],
  };
}

async function requestGeneralClue(clueKey) {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    await demoDelay();

    if (!(clueKey in DEMO_SECRET_PLAYER.clues)) {
      throw new Error("Unknown clue.");
    }

    return {
      key: clueKey,
      value: DEMO_SECRET_PLAYER.clues[clueKey],
    };
  }

  return fetchJson("/api/hints/clue", {
    method: "POST",
    body: JSON.stringify({
      key: clueKey,
    }),
  });
}

async function requestHistoryHint(historyId) {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    await demoDelay();

    const historyItem =
      DEMO_SECRET_PLAYER.team_history.find(
        (entry) =>
          Number(entry.id) === Number(historyId),
      );

    if (!historyItem) {
      throw new Error(
        "That team-history hint does not exist.",
      );
    }

    return {
      ...historyItem,
    };
  }

  return fetchJson("/api/hints/team-history", {
    method: "POST",

    body: JSON.stringify({
      history_id: historyId,
    }),
  });
}

async function requestGuessResult(guess) {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    await demoDelay();

    const correct =
      normalizeName(guess) ===
      normalizeName(DEMO_SECRET_PLAYER.name);

    return {
      correct,

      message: correct
        ? "Correct!"
        : "Not quite. Check the clues and try again.",

      ...(correct
        ? {
            player_name: DEMO_SECRET_PLAYER.name,
            image_url: DEMO_SECRET_PLAYER.image_url,
          }
        : {}),
    };
  }

  return fetchJson("/api/guess", {
    method: "POST",

    body: JSON.stringify({
      guess,
    }),
  });
}

async function requestPostGameClues() {
  if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
    await demoDelay(80);

    return {
      player_name: DEMO_SECRET_PLAYER.name,
      image_url: DEMO_SECRET_PLAYER.image_url,

      clues: {
        ...DEMO_SECRET_PLAYER.clues,
      },

      team_history:
        DEMO_SECRET_PLAYER.team_history.map(
          (entry) => ({
            ...entry,
          }),
        ),
    };
  }

  return fetchJson("/api/post-game-reveal");
}

function demoDelay(milliseconds = 180) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function loadGame() {
  elements.playerCard.setAttribute(
    "aria-busy",
    "true",
  );

  try {
    const data = await requestInitialGame();

    state.player = data.player;
    state.playerNames = data.playerNames;

    restoreProgress();
    renderBaseGame();

    if (state.solved) {
      await restoreSolvedGame();
    } else {
      await restoreUnlockedHints();
    }

    updateProgressUI();
  } catch (error) {
    console.error(error);

    setGuessMessage(
      "The daily player could not be loaded. Please try again later.",
      "error",
    );

    elements.submitGuess.disabled = true;
  } finally {
    elements.playerCard.setAttribute(
      "aria-busy",
      "false",
    );
  }
}

function renderBaseGame() {
  if (!state.player) {
    return;
  }

  elements.gameNumber.textContent =
    state.player.game_number
      ? `Challenge #${state.player.game_number}`
      : "Daily challenge";

  renderHistoryTable();
}

async function restoreUnlockedHints() {
  for (
    const clueKey of state.manuallyUnlockedClues
  ) {
    try {
      const clue =
        await requestGeneralClue(clueKey);

      state.revealedClues.set(
        clueKey,
        clue.value,
      );
    } catch (error) {
      console.warn(
        `Could not restore clue "${clueKey}".`,
        error,
      );
    }
  }

  for (
    const historyId of
    state.manuallyUnlockedHistoryIds
  ) {
    try {
      const historyItem =
        await requestHistoryHint(historyId);

      state.revealedHistory.set(
        Number(historyId),
        historyItem,
      );
    } catch (error) {
      console.warn(
        `Could not restore history hint "${historyId}".`,
        error,
      );
    }
  }

  renderGeneralClues();
  renderHistoryTable();
}

async function restoreSolvedGame() {
  const postGameData =
    await revealAllPostGameInformation();

  revealPortrait({
    player_name:
      state.revealedName ||
      postGameData?.player_name ||
      "Correct player",

    image_url:
      state.revealedImageUrl ||
      postGameData?.image_url ||
      "",
  });

  setGuessMessage(
    "You already solved today's player. Nice work.",
    "success",
  );
}

function renderGeneralClues() {
  const clueCards =
    document.querySelectorAll(
      "[data-clue-card]",
    );

  clueCards.forEach((card) => {
    const clueKey =
      card.dataset.clueCard;

    const button =
      card.querySelector("[data-clue-key]");

    const valueElement =
      card.querySelector("[data-clue-value]");

    if (!button || !valueElement) {
      return;
    }

    const hasValue =
      state.revealedClues.has(clueKey);

    card.classList.toggle(
      "is-revealed",
      hasValue,
    );

    button.hidden = hasValue;
    valueElement.hidden = !hasValue;

    if (hasValue) {
      valueElement.textContent =
        formatClueValue(
          clueKey,
          state.revealedClues.get(clueKey),
        );
    }

    button.disabled = state.solved;
  });
}

function renderHistoryTable() {
  const slots =
    Array.isArray(
      state.player?.history_slots,
    )
      ? state.player.history_slots
      : [];

  elements.historyBody.innerHTML = "";

  if (slots.length === 0) {
    const row =
      document.createElement("tr");

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

  slots.forEach((slot) => {
    const historyId = Number(slot.id);

    const revealedEntry =
      state.revealedHistory.get(historyId);

    const row =
      document.createElement("tr");

    row.className =
      `history-row ${
        revealedEntry
          ? "is-revealed"
          : "is-locked"
      }`;

    row.dataset.historyId =
      String(historyId);

    if (revealedEntry) {
      row.innerHTML =
        createRevealedHistoryRow(
          revealedEntry,
        );
    } else {
      row.innerHTML =
        createLockedHistoryRow(slot);
    }

    elements.historyBody.appendChild(row);
  });

  updateHistoryCounters();
}

function createLockedHistoryRow(slot) {
  const entryNumber =
    String(slot.order || "").padStart(
      2,
      "0",
    );

  const disabled = state.solved
    ? "disabled"
    : "";

  const actionText = state.solved
    ? "Game complete"
    : "Unlock hint";

  return `
    <td
      class="history-lock-cell"
      colspan="5"
    >
      <button
        class="history-lock-button"
        type="button"
        data-unlock-history="${escapeAttribute(
          slot.id,
        )}"
        ${disabled}
      >
        <span
          class="history-lock-button__index"
        >
          #${entryNumber}
        </span>

        <span>
          <strong>
            ${escapeHtml(
              slot.label || "Career entry",
            )}
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
  const teamName =
    entry.team ||
    entry.team_name ||
    "Unknown team";

  const role =
    entry.role ||
    entry.position ||
    "—";

  const logoUrl =
    entry.team_logo_url ||
    entry.team_logo_filename ||
    "";

  const start =
    entry.start ||
    entry.start_date ||
    "";

  const end =
    entry.end ||
    entry.end_date ||
    "";

  const initials =
    getInitials(teamName);

  const logo = logoUrl
    ? `
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
    `
    : `
      <span>
        ${escapeHtml(initials)}
      </span>
    `;

  return `
    <td>
      <div class="team-cell">
        <span class="team-logo">
          ${logo}
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
      ${escapeHtml(
        formatPeriod(
          start,
          end,
          entry.is_current,
        ),
      )}
    </td>

    <td>
      <span class="unlocked-badge">
        <span aria-hidden="true">✓</span>
        Unlocked
      </span>
    </td>
  `;
}

async function handleGeneralClueUnlock(
  button,
) {
  if (state.solved || button.disabled) {
    return;
  }

  const clueKey =
    button.dataset.clueKey;

  if (
    !clueKey ||
    state.revealedClues.has(clueKey)
  ) {
    return;
  }

  button.disabled = true;

  button.setAttribute(
    "aria-busy",
    "true",
  );

  try {
    const clue =
      await requestGeneralClue(clueKey);

    state.revealedClues.set(
      clueKey,
      clue.value,
    );

    state.manuallyUnlockedClues.add(
      clueKey,
    );

    state.hintsUsed += 1;

    renderGeneralClues();
    saveProgress();
    updateProgressUI();

    showToast(
      `${getClueDisplayName(
        clueKey,
      )} unlocked.`,
    );
  } catch (error) {
    console.error(error);

    button.disabled = false;

    showToast(
      "That clue could not be unlocked.",
    );
  } finally {
    button.removeAttribute("aria-busy");
  }
}

async function handleHistoryUnlock(
  button,
) {
  if (state.solved || button.disabled) {
    return;
  }

  const historyId =
    Number(
      button.dataset.unlockHistory,
    );

  if (
    !historyId ||
    state.revealedHistory.has(historyId)
  ) {
    return;
  }

  button.disabled = true;

  button.setAttribute(
    "aria-busy",
    "true",
  );

  try {
    const historyItem =
      await requestHistoryHint(historyId);

    state.revealedHistory.set(
      historyId,
      historyItem,
    );

    state.manuallyUnlockedHistoryIds.add(
      historyId,
    );

    state.hintsUsed += 1;

    renderHistoryTable();
    saveProgress();
    updateProgressUI();

    showToast(
      "Team-history entry unlocked.",
    );
  } catch (error) {
    console.error(error);

    button.disabled = false;

    showToast(
      "That team-history hint could not be unlocked.",
    );
  } finally {
    button.removeAttribute("aria-busy");
  }
}

function formatClueValue(
  clueKey,
  value,
) {
  if (clueKey === "retired") {
    return value
      ? "Retired"
      : "Active";
  }

  if (
    clueKey === "won_first_stand" ||
    clueKey === "won_msi" ||
    clueKey === "won_worlds"
  ) {
    return value
      ? "Champion"
      : "Not won";
  }

  if (clueKey === "dob") {
    return formatDate(value);
  }

  return value || "Unknown";
}

function getClueDisplayName(clueKey) {
  const names = {
    nationality: "Nationality",
    dob: "Date of birth",
    retired: "Career status",

    won_first_stand:
      "First Stand record",

    won_msi:
      "MSI record",

    won_worlds:
      "Worlds record",
  };

  return names[clueKey] || "Clue";
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(parsed);
}

function formatPeriod(
  start,
  end,
  isCurrent = false,
) {
  if (isCurrent && start) {
    return `${start} — Present`;
  }

  if (!start && !end) {
    return "—";
  }

  if (start && end) {
    return `${start} — ${end}`;
  }

  return start || end || "—";
}

function getInitials(value) {
  return String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll(
    "`",
    "&#096;",
  );
}

function updateCountdown() {
  const now = new Date();
  const nextReset = new Date(now);

  nextReset.setUTCMinutes(0, 0, 0);
  nextReset.setUTCHours(
    CONFIG.resetHourUTC,
  );

  if (nextReset <= now) {
    nextReset.setUTCDate(
      nextReset.getUTCDate() + 1,
    );
  }

  const remaining = Math.max(
    0,
    nextReset.getTime() - now.getTime(),
  );

  const hours = Math.floor(
    remaining / 3_600_000,
  );

  const minutes = Math.floor(
    (remaining % 3_600_000) / 60_000,
  );

  const seconds = Math.floor(
    (remaining % 60_000) / 1000,
  );

  elements.countdown.textContent = [
    hours,
    minutes,
    seconds,
  ]
    .map((number) =>
      String(number).padStart(2, "0"),
    )
    .join(":");
}

function getFilteredPlayers(query) {
  const normalizedQuery =
    normalizeName(query);

  if (!normalizedQuery) {
    return state.playerNames.slice(0, 8);
  }

  return state.playerNames
    .filter((name) =>
      normalizeName(name).includes(
        normalizedQuery,
      ),
    )
    .sort((a, b) => {
      const aStarts =
        normalizeName(a).startsWith(
          normalizedQuery,
        )
          ? 0
          : 1;

      const bStarts =
        normalizeName(b).startsWith(
          normalizedQuery,
        )
          ? 0
          : 1;

      return (
        aStarts -
          bStarts ||
        a.localeCompare(b)
      );
    })
    .slice(0, 8);
}

function renderSuggestions() {
  if (state.solved) {
    closeSuggestions();
    return;
  }

  const matches =
    getFilteredPlayers(
      elements.guessInput.value,
    );

  state.activeSuggestionIndex = -1;
  elements.suggestions.innerHTML = "";

  if (matches.length === 0) {
    closeSuggestions();
    return;
  }

  matches.forEach((name, index) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "suggestion-item";
    button.setAttribute(
      "role",
      "option",
    );

    button.dataset.index =
      String(index);

    button.innerHTML = `
      <span>
        ${escapeHtml(name)}
      </span>

      <small>Select</small>
    `;

    button.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
        selectSuggestion(name);
      },
    );

    elements.suggestions.appendChild(
      button,
    );
  });

  elements.suggestions.hidden = false;

  elements.guessInput.setAttribute(
    "aria-expanded",
    "true",
  );
}

function closeSuggestions() {
  elements.suggestions.hidden = true;

  elements.guessInput.setAttribute(
    "aria-expanded",
    "false",
  );

  state.activeSuggestionIndex = -1;
}

function selectSuggestion(name) {
  elements.guessInput.value = name;

  closeSuggestions();
  elements.guessInput.focus();
}

function moveSuggestion(direction) {
  const items = [
    ...elements.suggestions.querySelectorAll(
      ".suggestion-item",
    ),
  ];

  if (
    elements.suggestions.hidden ||
    items.length === 0
  ) {
    return;
  }

  state.activeSuggestionIndex =
    (
      state.activeSuggestionIndex +
      direction +
      items.length
    ) % items.length;

  items.forEach((item, index) => {
    const isActive =
      index ===
      state.activeSuggestionIndex;

    item.classList.toggle(
      "is-active",
      isActive,
    );

    item.setAttribute(
      "aria-selected",
      isActive ? "true" : "false",
    );
  });

  items[
    state.activeSuggestionIndex
  ].scrollIntoView({
    block: "nearest",
  });
}

async function handleGuess(event) {
  event.preventDefault();

  if (state.solved) {
    return;
  }

  const guess =
    elements.guessInput.value.trim();

  if (!guess) {
    setGuessMessage(
      "Type a player's name first.",
      "error",
    );

    elements.guessInput.focus();
    return;
  }

  elements.submitGuess.disabled = true;

  closeSuggestions();

  try {
    const result =
      await requestGuessResult(guess);

    state.attempts += 1;

    if (result.correct) {
      state.solved = true;

      state.revealedName =
        result.player_name || guess;

      revealPortrait(result);

      await revealAllPostGameInformation();

      setGuessMessage(
        `Correct — it is ${state.revealedName}!`,
        "success",
      );

      showToast(
        "Daily player solved. GG!",
      );
    } else {
      setGuessMessage(
        result.message ||
          "Not quite. Check the clues and try again.",
        "error",
      );

      elements.guessInput.select();
    }

    saveProgress();
    updateProgressUI();
  } catch (error) {
    console.error(error);

    setGuessMessage(
      "Your guess could not be checked. Please try again.",
      "error",
    );
  } finally {
    elements.submitGuess.disabled =
      state.solved;
  }
}

function revealPortrait(result) {
  const playerName =
    result.player_name ||
    state.revealedName ||
    "Correct player";

  const imageUrl =
    result.image_url ||
    createDemoPortrait(playerName);

  state.revealedName = playerName;
  state.revealedImageUrl = imageUrl;

  elements.playerImage.src = imageUrl;

  elements.playerImage.alt =
    `${playerName} portrait`;

  elements.playerImage.hidden = false;

  elements.playerName.textContent =
    playerName;

  elements.playerCard.classList.add(
    "is-solved",
  );

  elements.guessInput.disabled = true;
  elements.submitGuess.disabled = true;
  elements.shareButton.disabled = false;
}

async function revealAllPostGameInformation() {
  try {
    const postGameData =
      await requestPostGameClues();

    Object.entries(
      postGameData.clues || {},
    ).forEach(([key, value]) => {
      state.revealedClues.set(
        key,
        value,
      );
    });

    (
      postGameData.team_history || []
    ).forEach((entry) => {
      state.revealedHistory.set(
        Number(entry.id),
        entry,
      );
    });

    renderGeneralClues();
    renderHistoryTable();

    return postGameData;
  } catch (error) {
    console.error(
      "Could not load the post-game recap.",
      error,
    );

    return null;
  }
}

function updateHistoryCounters() {
  const total =
    Array.isArray(
      state.player?.history_slots,
    )
      ? state.player.history_slots.length
      : 0;

  const revealed =
    state.revealedHistory.size;

  elements.historyCount.textContent =
    `${revealed} / ${total} revealed`;

  elements.historyUnlockedCount.textContent =
    String(
      state.manuallyUnlockedHistoryIds
        .size,
    );
}

function updateProgressUI() {
  elements.attemptCount.textContent =
    String(state.attempts);

  elements.progressScore.textContent =
    String(state.attempts);

  elements.hintCount.textContent =
    String(state.hintsUsed);

  elements.sideHintCount.textContent =
    String(state.hintsUsed);

  const percent = Math.min(
    100,
    (
      state.attempts /
      Math.max(
        1,
        CONFIG.maxProgressGuesses,
      )
    ) * 100,
  );

  elements.progressFill.style.width =
    `${percent}%`;

  if (state.solved) {
    const noun =
      state.attempts === 1
        ? "guess"
        : "guesses";

    const hintNoun =
      state.hintsUsed === 1
        ? "hint"
        : "hints";

    elements.progressText.textContent =
      `Solved in ${state.attempts} ${noun} using ` +
      `${state.hintsUsed} ${hintNoun}.`;

    return;
  }

  if (
    state.attempts === 0 &&
    state.hintsUsed === 0
  ) {
    elements.progressText.textContent =
      "Your first guess is waiting.";

    return;
  }

  if (state.hintsUsed === 0) {
    elements.progressText.textContent =
      "No hints used yet. Bold strategy.";

    return;
  }

  if (
    state.manuallyUnlockedHistoryIds
      .size === 0
  ) {
    elements.progressText.textContent =
      "You have not touched the career history yet.";

    return;
  }

  elements.progressText.textContent =
    "Choose the next career entry carefully.";

  updateHistoryCounters();
}

function setGuessMessage(
  message,
  type = "",
) {
  elements.guessMessage.textContent =
    message;

  elements.guessMessage.classList.remove(
    "is-error",
    "is-success",
  );

  if (type) {
    elements.guessMessage.classList.add(
      `is-${type}`,
    );
  }
}

async function shareResult() {
  const text = [
    `RiftGuess #${
      state.player?.game_number ||
      "Daily"
    }`,

    `Solved in ${state.attempts} ${
      state.attempts === 1
        ? "guess"
        : "guesses"
    }`,

    `${state.hintsUsed} ${
      state.hintsUsed === 1
        ? "hint"
        : "hints"
    } used`,

    "Can you guess today's LoL pro?",
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({
        title: "RiftGuess",
        text,
      });

      return;
    }

    await navigator.clipboard.writeText(
      text,
    );

    showToast(
      "Result copied to clipboard.",
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);

      showToast(
        "Could not share the result.",
      );
    }
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);

  elements.toast.textContent = message;

  elements.toast.classList.add(
    "is-visible",
  );

  toastTimer = window.setTimeout(
    () => {
      elements.toast.classList.remove(
        "is-visible",
      );
    },
    2600,
  );
}

function setTheme(theme) {
  document.documentElement.dataset.theme =
    theme;

  elements.themeIcon.textContent =
    theme === "light"
      ? "☀"
      : "☾";

  localStorage.setItem(
    "riftguess:theme",
    theme,
  );
}

function initializeTheme() {
  const savedTheme =
    localStorage.getItem(
      "riftguess:theme",
    );

  const prefersLight =
    window.matchMedia(
      "(prefers-color-scheme: light)",
    ).matches;

  setTheme(
    savedTheme ||
      (prefersLight
        ? "light"
        : "dark"),
  );
}

document.addEventListener(
  "click",
  (event) => {
    const clueButton =
      event.target.closest(
        "[data-clue-key]",
      );

    if (clueButton) {
      handleGeneralClueUnlock(
        clueButton,
      );

      return;
    }

    const historyButton =
      event.target.closest(
        "[data-unlock-history]",
      );

    if (historyButton) {
      handleHistoryUnlock(
        historyButton,
      );
    }
  },
);

elements.guessForm.addEventListener(
  "submit",
  handleGuess,
);

elements.guessInput.addEventListener(
  "input",
  renderSuggestions,
);

elements.guessInput.addEventListener(
  "focus",
  renderSuggestions,
);

elements.guessInput.addEventListener(
  "blur",
  () => {
    window.setTimeout(
      closeSuggestions,
      100,
    );
  },
);

elements.guessInput.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSuggestion(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSuggestion(-1);
      return;
    }

    if (
      event.key === "Enter" &&
      state.activeSuggestionIndex >= 0
    ) {
      event.preventDefault();

      const activeItem =
        elements.suggestions.querySelectorAll(
          ".suggestion-item",
        )[
          state.activeSuggestionIndex
        ];

      if (activeItem) {
        const name =
          activeItem.querySelector(
            "span",
          )?.textContent || "";

        selectSuggestion(name);
      }

      return;
    }

    if (event.key === "Escape") {
      closeSuggestions();
    }
  },
);

elements.helpButton.addEventListener(
  "click",
  () => {
    elements.helpDialog.showModal();
  },
);

elements.closeHelpButton.addEventListener(
  "click",
  () => {
    elements.helpDialog.close();
  },
);

elements.helpDialog.addEventListener(
  "click",
  (event) => {
    if (
      event.target ===
      elements.helpDialog
    ) {
      elements.helpDialog.close();
    }
  },
);

elements.themeButton.addEventListener(
  "click",
  () => {
    const nextTheme =
      document.documentElement
        .dataset.theme === "light"
        ? "dark"
        : "light";

    setTheme(nextTheme);
  },
);

elements.shareButton.addEventListener(
  "click",
  shareResult,
);

initializeTheme();
renderGeneralClues();
updateCountdown();

window.setInterval(
  updateCountdown,
  1000,
);

loadGame();
