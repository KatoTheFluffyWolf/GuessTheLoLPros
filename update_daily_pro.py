import os
import warnings
import logging
import random
import re
from datetime import date

from dotenv import load_dotenv
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from supabase import create_client, Client


# ============================================================
# 1. Load environment variables from .env
# ============================================================

load_dotenv()

FANDOM_USERNAME = os.getenv("FANDOM_USERNAME")
BOT_PASSWORD_NAME = os.getenv("BOT_PASSWORD_NAME")
BOT_PASSWORD_SECRET = os.getenv("BOT_PASSWORD_SECRET")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# This is the existing table containing the list of players
# from which the random daily player is selected.
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE")


required_variables = {
    "FANDOM_USERNAME": FANDOM_USERNAME,
    "BOT_PASSWORD_NAME": BOT_PASSWORD_NAME,
    "BOT_PASSWORD_SECRET": BOT_PASSWORD_SECRET,
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_KEY": SUPABASE_KEY,
    "SUPABASE_TABLE": SUPABASE_TABLE
}

missing_variables = [
    name
    for name, value in required_variables.items()
    if not value
]

if missing_variables:
    raise ValueError(
        "Missing environment variables: "
        + ", ".join(missing_variables)
    )


# ============================================================
# 2. Hide deprecation warnings
# ============================================================

os.environ["PYTHONWARNINGS"] = "ignore::DeprecationWarning"

warnings.filterwarnings("ignore", category=DeprecationWarning)

warnings.filterwarnings(
    "ignore",
    message=".*datetime.datetime.utcnow.*",
    category=DeprecationWarning
)

logging.captureWarnings(False)
logging.getLogger("py.warnings").setLevel(logging.ERROR)


# ============================================================
# 3. Helper functions
# ============================================================

def to_boolean(value):
    """
    Convert Leaguepedia values such as 1, 0, "1", "0",
    True and False into Python Boolean values.
    """
    if value is None:
        return False

    return str(value).strip().lower() in {
        "1",
        "true",
        "yes",
        "y"
    }


def parse_duration_days(value):
    """
    Extract the number of days from values such as:
    "171"
    "171 Days"
    " Days"
    None

    Returns None when no number is available.
    """
    if value is None:
        return None

    match = re.search(r"\d+", str(value))

    if not match:
        return None

    return int(match.group())


def clean_date(value):
    """
    Return a date string accepted by PostgreSQL,
    or None when Leaguepedia provides a blank value.
    """
    if value is None:
        return None

    value = str(value).strip()

    if not value or value in {"0000-00-00", "None"}:
        return None

    # Cargo dates may occasionally include a time.
    return value[:10]


# ============================================================
# 4. Log in to Leaguepedia / Fandom
# ============================================================

credentials = AuthCredentials(
    username=f"{FANDOM_USERNAME}@{BOT_PASSWORD_NAME}",
    password=BOT_PASSWORD_SECRET
)

site = EsportsClient(
    "lol",
    credentials=credentials
)


# ============================================================
# 5. Connect to Supabase
# ============================================================

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)


# ============================================================
# 6. Retrieve available players from the source table
# ============================================================

response = (
    supabase
    .table(SUPABASE_TABLE)
    .select("Player, Nationality, Leaguepedia, Available")
    .eq("Available", True)
    .not_.is_("Player", "null")
    .execute()
)

player_rows = response.data or []

valid_player_rows = [
    row
    for row in player_rows
    if row.get("Player")
    and str(row["Player"]).strip()
]

if not valid_player_rows:
    raise RuntimeError(
        "No available players were found in "
        f"the '{SUPABASE_TABLE}' table."
    )


# ============================================================
# 7. Randomly select one available player
# ============================================================

selected_row = random.choice(valid_player_rows)

player_id = str(selected_row["Player"]).strip()

safe_player_id = (
    player_id
    .replace("\\", "\\\\")
    .replace('"', '\\"')
)


# ============================================================
# 8. Retrieve player information from Leaguepedia
# ============================================================

player_result = site.cargo_client.query(
    tables="Players",
    fields="""
        Player,
        Country=Nationality,
        Birthdate=DOB,
        IsRetired=Retired,
        _pageName=PageName
    """,
    where=f'Player="{safe_player_id}"',
    limit=1
)

if not player_result:
    raise RuntimeError(
        f"No Leaguepedia player record was found for: {player_id}"
    )

player = player_result[0]


# ============================================================
# 9. Retrieve team history
# ============================================================

team_history = site.cargo_client.query(
    tables="""
        Tenures=Tn,
        Teams=Tm,
        RosterChanges=RCJoin,
        RosterChanges=RCLeave
    """,
    join_on="""
        Tn.Team=Tm.Name,
        Tn.RosterChangeIdJoin=RCJoin.RosterChangeId,
        Tn.RosterChangeIdLeave=RCLeave.RosterChangeId
    """,
    fields="""
        Tn.Player=Player,
        Tn.Team=Team,
        Tm.Region=Region,
        RCJoin.Role=JoinRole,
        RCLeave.Role=LeaveRole,
        Tn.DateJoin=Start,
        Tn.DateLeave=End,
        Tn.Duration=Duration,
        Tn.IsCurrent=IsCurrent
    """,
    where=f'Tn.Player="{safe_player_id}"',
    order_by="Tn.DateJoin ASC",
    limit=100
)


# ============================================================
# 10. Prepare the daily_player row
# ============================================================

DAILY_PLAYER_ID = 1

daily_player_data = {
    "id": DAILY_PLAYER_ID,
    "player_name": player.get("Player") or player_id,
    "nationality": player.get("Nationality"),
    "date_of_birth": clean_date(player.get("DOB")),
    "retired": to_boolean(player.get("Retired")),
    "leaguepedia_page": player.get("PageName") or player_id,
    "game_date": date.today().isoformat()
}


# ============================================================
# 11. Upsert the daily player into row ID 1
# ============================================================

daily_player_response = (
    supabase
    .table("daily_player")
    .upsert(
        daily_player_data,
        on_conflict="id"
    )
    .execute()
)


# ============================================================
# 12. Delete the previous daily player's team history
# ============================================================

# This ensures history rows belonging to yesterday's player
# do not remain in the table.
(
    supabase
    .table("daily_player_history")
    .delete()
    .eq("daily_player_id", DAILY_PLAYER_ID)
    .execute()
)


# ============================================================
# 13. Prepare the new team-history rows
# ============================================================

history_rows = []

for row in team_history or []:
    # Completed tenures usually have LeaveRole.
    # Current tenures may only have JoinRole.
    position = (
        row.get("LeaveRole")
        or row.get("JoinRole")
    )

    history_rows.append({
        "daily_player_id": DAILY_PLAYER_ID,
        "player_name": row.get("Player") or player_id,
        "team_name": row.get("Team"),
        "region": row.get("Region"),
        "position": position,
        "start_date": clean_date(row.get("Start")),
        "end_date": clean_date(row.get("End")),
        "duration_days": parse_duration_days(
            row.get("Duration")
        ),
        "is_current": to_boolean(
            row.get("IsCurrent")
        )
    })


# ============================================================
# 14. Insert the new team history
# ============================================================

if history_rows:
    (
        supabase
        .table("daily_player_history")
        .insert(history_rows)
        .execute()
    )


# ============================================================
# 15. Confirmation
# ============================================================

print(
    f"Daily player updated successfully: "
    f"{daily_player_data['player_name']}"
)

print(
    f"Team-history rows inserted: {len(history_rows)}"
)
