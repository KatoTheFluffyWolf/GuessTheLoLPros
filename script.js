"use strict";

/*
  BACKEND CONTRACT (recommended)
  ------------------------------
  GET  /api/daily-player
  Returns clue data only:
  {
    "game_number": 142,
    "image_url": "https://...",
    "nationality": "South Korea",
    "dob": "May 7, 1996",
    "retired": false,
    "team_history": [
      {
        "team": "T1",
        "team_logo_url": "https://...",
        "role": "Mid",
        "region": "LCK",
        "start": "2013",
        "end": "Present"
      }
    ]
  }

  GET  /api/player-names
  Returns: ["Faker", "Caps", "Chovy", ...]

  POST /api/guess
  Body: { "guess": "Faker" }
  Returns: { "correct": true, "player_name": "Faker", "message": "Correct!" }

  Keeping the real answer on the Python backend stops it from being exposed in
  the browser's network response. Set CONFIG.apiBaseUrl to your deployed backend.
*/

const CONFIG = {
  apiBaseUrl: "", // Example: "https://your-api.onrender.com"
  resetHourUTC: 17, // 17:00 UTC = 00:00 in Vietnam (UTC+7)
  useDemoData: true,
  maxProgressGuesses: 6,
};

const DEMO_PLAYER = {
  game_number: 1,
  name: "Faker",
  image_url: createFallbackPortrait("?"),
  nationality: "South Korea",
  dob: "May 7, 1996",
  retired: false,
  team_history: [
    {
      team: "SK Telecom T1 2",
      role: "Mid",
      region: "LCK",
      start: "2013",
      end: "2013",
      team_logo_url: "",
    },
    {
      team: "SK Telecom T1 K",
      role: "Mid",
      region: "LCK",
      start: "2013",
      end: "2014",
      team_logo_url: "",
    },
    {
      team: "SK Telecom T1",
      role: "Mid",
      region: "LCK",
      start: "2014",
      end: "2019",
      team_logo_url: "",
    },
    {
      team: "T1",
      role: "Mid",
      region: "LCK",
      start: "2019",
      end: "Present",
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
  solved: false,
  activeSuggestionIndex: -1,
  revealedName: "",
};

const elements = {
  playerCard: document.querySelector("#playerCard"),
  playerImage: document.querySelector("#playerImage"),
  playerName: document.querySelector("#playerName"),
  nationality: document.querySelector("#nationality"),
  dob: document.querySelector("#dob"),
  retiredStatus: document.querySelector("#retiredStatus"),
  historyBody: document.querySelector("#historyBody"),
  historyCount: document.querySelector("#historyCount"),
  countdown: document.querySelector("#countdown"),
  gameNumber: document.querySelector("#gameNumber"),
  guessForm: document.querySelector("#guessForm"),
  guessInput: document.querySelector("#guessInput"),
  submitGuess: document.querySelector("#submitGuess"),
  suggestions: document.querySelector("#suggestions"),
  guessMessage: document.querySelector("#guessMessage"),
  attemptCount: document.querySelector("#attemptCount"),
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
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function createFallbackPortrait(label = "?") {
  const safeLabel = String(label).replace(/[<>&"']/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#18333d"/>
          <stop offset="1" stop-color="#081217"/>
        </linearGradient>
        <radialGradient id="r" cx="50%" cy="27%" r="54%">
          <stop stop-color="#59e1c6" stop-opacity=".24"/>
          <stop offset="1" stop-color="#59e1c6" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="800" fill="url(#g)"/>
      <rect width="640" height="800" fill="url(#r)"/>
      <circle cx="320" cy="270" r="116" fill="#25454e"/>
      <path d="M104 760c20-188 110-290 216-290s196 102 216 290" fill="#25454e"/>
      <text x="320" y="300" fill="#8ff5e1" font-family="Arial, sans-serif" font-size="92" font-weight="700" text-anchor="middle">${safeLabel}</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getStorageKey() {
  const challengeId = state.player?.game_number || new Date().toISOString().slice(0, 10);
  return `riftguess:${challengeId}`;
}

function saveProgress() {
  const payload = {
    attempts: state.attempts,
    solved: state.solved,
    revealedName: state.revealedName,
  };
  localStorage.setItem(getStorageKey(), JSON.stringify(payload));
}

function restoreProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey()));
    if (!saved) return;

    state.attempts = Number(saved.attempts) || 0;
    state.solved = Boolean(saved.solved);
    state.revealedName = saved.revealedName || "";
  } catch (error) {
    console.warn("Could not restore saved game state.", error);
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${CONFIG.apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

async function loadGame() {
  elements.playerCard.setAttribute("aria-busy", "true");

  try {
    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
      state.player = DEMO_PLAYER;
      state.playerNames = DEMO_PLAYERS;
    } else {
      const [player, names] = await Promise.all([
        fetchJson("/api/daily-player"),
        fetchJson("/api/player-names"),
      ]);

      state.player = player;
      state.playerNames = Array.isArray(names) ? names : names.players || [];
    }

    restoreProgress();
    renderPlayer();
    updateProgressUI();

    if (state.solved) {
      revealPlayer();
      setGuessMessage("You already solved today's player. Nice work.", "success");
    }
  } catch (error) {
    console.error(error);
    setGuessMessage("The daily player could not be loaded. Please try again later.", "error");
    elements.submitGuess.disabled = true;
  } finally {
    elements.playerCard.setAttribute("aria-busy", "false");
  }
}

function renderPlayer() {
  const player = state.player;
  if (!player) return;

  elements.gameNumber.textContent = player.game_number
    ? `Challenge #${player.game_number}`
    : "Daily challenge";

  elements.playerImage.src = player.image_url || createFallbackPortrait("?");
  elements.playerImage.onerror = () => {
    elements.playerImage.src = createFallbackPortrait("?");
  };

  elements.nationality.textContent = player.nationality || "Unknown";
  elements.dob.textContent = formatDate(player.dob);
  elements.retiredStatus.textContent = player.retired ? "Retired" : "Active";

  const history = Array.isArray(player.team_history) ? player.team_history : [];
  elements.historyCount.textContent = `${history.length} ${history.length === 1 ? "team" : "teams"}`;
  elements.historyBody.innerHTML = "";

  if (history.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4">No team history is available.</td>`;
    elements.historyBody.appendChild(row);
    return;
  }

  history.forEach((entry) => {
    const row = document.createElement("tr");

    const initials = String(entry.team || "?")
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();

    const logo = entry.team_logo_url
      ? `<img src="${escapeAttribute(entry.team_logo_url)}" alt="" />`
      : escapeHtml(initials);

    row.innerHTML = `
      <td>
        <div class="team-cell">
          <span class="team-logo">${logo}</span>
          <span>${escapeHtml(entry.team || "Unknown team")}</span>
        </div>
      </td>
      <td>${escapeHtml(entry.role || "—")}</td>
      <td>${escapeHtml(entry.region || "—")}</td>
      <td>${escapeHtml(formatPeriod(entry.start, entry.end))}</td>
    `;

    elements.historyBody.appendChild(row);
  });
}

function formatDate(value) {
  if (!value) return "Unknown";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatPeriod(start, end) {
  if (!start && !end) return "—";
  if (start && end) return `${start} — ${end}`;
  return start || end;
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
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function updateCountdown() {
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setUTCMinutes(0, 0, 0);
  nextReset.setUTCHours(CONFIG.resetHourUTC);

  if (nextReset <= now) {
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  }

  const remaining = Math.max(0, nextReset.getTime() - now.getTime());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  elements.countdown.textContent = [hours, minutes, seconds]
    .map((number) => String(number).padStart(2, "0"))
    .join(":");
}

function getFilteredPlayers(query) {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return state.playerNames.slice(0, 8);

  return state.playerNames
    .filter((name) => normalizeName(name).includes(normalizedQuery))
    .sort((a, b) => {
      const aStarts = normalizeName(a).startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = normalizeName(b).startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    })
    .slice(0, 8);
}

function renderSuggestions() {
  if (state.solved) {
    closeSuggestions();
    return;
  }

  const matches = getFilteredPlayers(elements.guessInput.value);
  state.activeSuggestionIndex = -1;
  elements.suggestions.innerHTML = "";

  if (matches.length === 0) {
    closeSuggestions();
    return;
  }

  matches.forEach((name, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.setAttribute("role", "option");
    button.dataset.index = String(index);
    button.innerHTML = `<span>${escapeHtml(name)}</span><small>Select</small>`;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectSuggestion(name);
    });
    elements.suggestions.appendChild(button);
  });

  elements.suggestions.hidden = false;
  elements.guessInput.setAttribute("aria-expanded", "true");
}

function closeSuggestions() {
  elements.suggestions.hidden = true;
  elements.guessInput.setAttribute("aria-expanded", "false");
  state.activeSuggestionIndex = -1;
}

function selectSuggestion(name) {
  elements.guessInput.value = name;
  closeSuggestions();
  elements.guessInput.focus();
}

function moveSuggestion(direction) {
  const items = [...elements.suggestions.querySelectorAll(".suggestion-item")];
  if (elements.suggestions.hidden || items.length === 0) return;

  state.activeSuggestionIndex =
    (state.activeSuggestionIndex + direction + items.length) % items.length;

  items.forEach((item, index) => {
    item.classList.toggle("is-active", index === state.activeSuggestionIndex);
    item.setAttribute("aria-selected", index === state.activeSuggestionIndex ? "true" : "false");
  });

  items[state.activeSuggestionIndex].scrollIntoView({ block: "nearest" });
}

async function handleGuess(event) {
  event.preventDefault();

  if (state.solved) return;

  const guess = elements.guessInput.value.trim();
  if (!guess) {
    setGuessMessage("Type a player's name first.", "error");
    elements.guessInput.focus();
    return;
  }

  elements.submitGuess.disabled = true;
  closeSuggestions();

  try {
    let result;

    if (CONFIG.useDemoData || !CONFIG.apiBaseUrl) {
      result = {
        correct: normalizeName(guess) === normalizeName(DEMO_PLAYER.name),
        player_name: DEMO_PLAYER.name,
      };
    } else {
      result = await fetchJson("/api/guess", {
        method: "POST",
        body: JSON.stringify({ guess }),
      });
    }

    state.attempts += 1;

    if (result.correct) {
      state.solved = true;
      state.revealedName = result.player_name || state.player.name || guess;
      state.player.name = state.revealedName;
      revealPlayer();
      setGuessMessage(`Correct — it is ${state.player.name}!`, "success");
      showToast("Daily player solved. GG!");
    } else {
      setGuessMessage(result.message || "Not quite. Check the clues and try again.", "error");
      elements.guessInput.select();
    }

    saveProgress();
    updateProgressUI();
  } catch (error) {
    console.error(error);
    setGuessMessage("Your guess could not be checked. Please try again.", "error");
  } finally {
    elements.submitGuess.disabled = state.solved;
  }
}

function revealPlayer() {
  const playerName = state.revealedName || state.player?.name || "Correct player";
  elements.playerCard.classList.add("is-solved");
  elements.playerName.textContent = playerName;
  elements.guessInput.disabled = true;
  elements.submitGuess.disabled = true;
  elements.shareButton.disabled = false;
}

function updateProgressUI() {
  elements.attemptCount.textContent = String(state.attempts);
  elements.progressScore.textContent = String(state.attempts);

  const percent = Math.min(
    100,
    (state.attempts / Math.max(1, CONFIG.maxProgressGuesses)) * 100,
  );
  elements.progressFill.style.width = `${percent}%`;

  if (state.solved) {
    const noun = state.attempts === 1 ? "guess" : "guesses";
    elements.progressText.textContent = `Solved in ${state.attempts} ${noun}.`;
  } else if (state.attempts === 0) {
    elements.progressText.textContent = "Your first guess is waiting.";
  } else if (state.attempts < 3) {
    elements.progressText.textContent = "Warm-up complete. Keep reading the clues.";
  } else {
    elements.progressText.textContent = "Deep run. The team history is your best clue now.";
  }
}

function setGuessMessage(message, type = "") {
  elements.guessMessage.textContent = message;
  elements.guessMessage.classList.remove("is-error", "is-success");

  if (type) {
    elements.guessMessage.classList.add(`is-${type}`);
  }
}

async function shareResult() {
  const blocks = state.solved ? "🟩" : "⬛";
  const text = [
    `RiftGuess #${state.player?.game_number || "Daily"}`,
    `${blocks} ${state.attempts}/${state.attempts || "-"}`,
    "Can you guess today's LoL pro?",
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({ title: "RiftGuess", text });
      return;
    }

    await navigator.clipboard.writeText(text);
    showToast("Result copied to clipboard.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      showToast("Could not share the result.");
    }
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2600);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.themeIcon.textContent = theme === "light" ? "☀" : "☾";
  localStorage.setItem("riftguess:theme", theme);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("riftguess:theme");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  setTheme(savedTheme || (prefersLight ? "light" : "dark"));
}

elements.guessForm.addEventListener("submit", handleGuess);
elements.guessInput.addEventListener("input", renderSuggestions);
elements.guessInput.addEventListener("focus", renderSuggestions);
elements.guessInput.addEventListener("blur", () => {
  window.setTimeout(closeSuggestions, 100);
});

elements.guessInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(-1);
  } else if (event.key === "Enter" && state.activeSuggestionIndex >= 0) {
    event.preventDefault();
    const activeItem = elements.suggestions.querySelectorAll(".suggestion-item")[
      state.activeSuggestionIndex
    ];
    if (activeItem) {
      selectSuggestion(activeItem.querySelector("span").textContent);
    }
  } else if (event.key === "Escape") {
    closeSuggestions();
  }
});

elements.helpButton.addEventListener("click", () => elements.helpDialog.showModal());
elements.closeHelpButton.addEventListener("click", () => elements.helpDialog.close());
elements.helpDialog.addEventListener("click", (event) => {
  if (event.target === elements.helpDialog) elements.helpDialog.close();
});

elements.themeButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  setTheme(nextTheme);
});

elements.shareButton.addEventListener("click", shareResult);

initializeTheme();
updateCountdown();
window.setInterval(updateCountdown, 1000);
loadGame();
