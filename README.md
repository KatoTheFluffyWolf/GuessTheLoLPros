# RiftGuess frontend update

This folder contains a complete replacement frontend for the daily League of
Legends player guessing game.

## What changed

1. The portrait is no longer an unlockable gameplay hint.
   - There is no portrait-reveal button.
   - The `<img>` receives its `src` only after a correct guess.
   - The player name and portrait are revealed together when the game ends.

2. Every team-history database row is now a separate hint.
   - The initial table renders one locked button for each available history slot.
   - Clicking one button retrieves and reveals only that row.
   - Other rows remain locked.
   - Unlock state is saved in `localStorage`.

3. General hints remain independently unlockable.
   - Nationality
   - Date of birth
   - Active/retired status

4. The solved-game recap reveals the full information without adding to the
   player's recorded `hintsUsed` count.

## Run locally

From this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The answer in demo mode is:

```text
Faker
```

## Files to replace in the GitHub repository

Replace the existing files with:

- `index.html`
- `styles.css`
- `script.js`

## Important security note for the future API

Hiding secret values with CSS or JavaScript is not enough. A player can inspect
the browser network response or source code.

The real backend should therefore:

- omit `image_url` and `player_name` from the initial daily-player response;
- return only history slot IDs/order at first;
- return a single history row only after its unlock endpoint is called;
- return `player_name` and `image_url` only after the guess is correct.

## Recommended API shape

### `GET /api/daily-player`

```json
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
```

### `GET /api/player-names`

```json
["Faker", "Caps", "Chovy"]
```

### `POST /api/hints/clue`

Request:

```json
{
  "key": "nationality"
}
```

Response:

```json
{
  "key": "nationality",
  "value": "South Korea"
}
```

### `POST /api/hints/team-history`

Request:

```json
{
  "history_id": 731
}
```

Response:

```json
{
  "id": 731,
  "team": "T1",
  "role": "Mid",
  "region": "LCK",
  "start": "Dec 2019",
  "end": "Present",
  "is_current": true,
  "team_logo_url": "https://..."
}
```

### `POST /api/guess`

Request:

```json
{
  "guess": "Faker"
}
```

Correct response:

```json
{
  "correct": true,
  "player_name": "Faker",
  "image_url": "https://..."
}
```

### `GET /api/post-game-reveal`

This optional endpoint returns all clues and team-history rows after the game is
already solved, allowing the frontend to show a full recap.
