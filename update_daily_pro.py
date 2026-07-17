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
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

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

def normalize_text(value):
    """
    Normalize a value for case-insensitive tournament-name matching.
    """

    if value is None:
        return ""

    return str(value).strip().lower().replace("_", " ")


def is_first_place(value):
    """
    Leaguepedia may represent first place as:
    1, "1", "1st", or occasionally another textual variation.
    """

    if value is None:
        return False

    normalized = str(value).strip().lower()

    return normalized in {
        "1",
        "1st",
        "first",
        "winner",
        "champion"
    }


def get_international_title_flags(site, safe_player_id):
    """
    Determine whether a player has won First Stand, MSI, or Worlds.

    Leaguepedia does not store these as direct fields on the Players table.
    Instead, we join:

    TournamentPlayers:
        Confirms that the player was registered for the tournament team.

    TournamentResults:
        Confirms that the team finished in first place.

    The tournament OverviewPage is then used to determine which
    international competition the result belongs to.
    """

    title_rows = site.cargo_client.query(
        tables="""
            TournamentPlayers=TP,
            TournamentResults=TR
        """,
        join_on="""
            TP.OverviewPage=TR.OverviewPage,
            TP.Team=TR.Team
        """,
        fields="""
            TP.Player=Player,
            TP.Team=Team,
            TP.OverviewPage=TournamentPage,
            TR.Place=Place
        """,
        where=f'''
            TP.Player="{safe_player_id}"
            AND (
                TR.Place="1"
                OR TR.Place="1st"
            )
        ''',
        limit=500
    )

    won_first_stand = False
    won_msi = False
    won_worlds = False

    for row in title_rows or []:
        if not is_first_place(row.get("Place")):
            continue

        tournament_page = normalize_text(
            row.get("TournamentPage")
        )

        # First Stand pages generally contain "First Stand".
        if "first stand" in tournament_page:
            won_first_stand = True

        # MSI pages may use the full name or MSI abbreviation.
        if (
            "mid-season invitational" in tournament_page
            or "mid season invitational" in tournament_page
            or tournament_page.endswith(" msi")
            or "/msi" in tournament_page
        ):
            won_msi = True

        # Worlds pages normally use "World Championship".
        if (
            "world championship" in tournament_page
            or "season world championship" in tournament_page
        ):
            won_worlds = True

    return {
        "won_first_stand": won_first_stand,
        "won_msi": won_msi,
        "won_worlds": won_worlds
    }

def get_player_image_filename(site, player_page, players_image=None):
    """
    Get a player's portrait filename.

    Priority:
    1. Players.Image
    2. Latest profile image from PlayerImages
    3. Latest available image from PlayerImages
    """

    # First use the normal Players.Image field.
    if players_image and str(players_image).strip():
        return str(players_image).strip()

    safe_page = (
        str(player_page)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
    )

    print(
        f'Players.Image is empty for "{player_page}". '
        "Checking PlayerImages..."
    )

    # Prefer an image explicitly marked as a profile image.
    profile_images = site.cargo_client.query(
        tables="PlayerImages",
        fields="""
            Link,
            FileName,
            IsProfileImage,
            SortDate,
            Team,
            Tournament,
            ImageType
        """,
        where=f'''
            Link="{safe_page}"
            AND IsProfileImage="1"
        ''',
        order_by="SortDate DESC",
        limit=1
    )

    print("\n========== PROFILE IMAGE RESULTS ==========")
    print(profile_images)

    if profile_images:
        filename = profile_images[0].get("FileName")

        if filename and str(filename).strip():
            return str(filename).strip()

    # If none is marked as the profile image, use the newest available image.
    available_images = site.cargo_client.query(
        tables="PlayerImages",
        fields="""
            Link,
            FileName,
            IsProfileImage,
            SortDate,
            Team,
            Tournament,
            ImageType
        """,
        where=f'Link="{safe_page}"',
        order_by="SortDate DESC",
        limit=20
    )

    print("\n========== ALL PLAYER IMAGE RESULTS ==========")

    for index, row in enumerate(available_images or [], start=1):
        print(f"\nImage {index}:")
        print("Filename:", repr(row.get("FileName")))
        print("Profile image:", repr(row.get("IsProfileImage")))
        print("Date:", repr(row.get("SortDate")))
        print("Team:", repr(row.get("Team")))
        print("Tournament:", repr(row.get("Tournament")))
        print("Image type:", repr(row.get("ImageType")))

    for row in available_images or []:
        filename = row.get("FileName")

        if filename and str(filename).strip():
            return str(filename).strip()

    return None


def update_daily_player() -> None:
    """
    Select a new available player, retrieve their Leaguepedia data,
    replace the current daily player and team history in Supabase,
    and mark the selected player as unavailable.

    This function intentionally returns nothing. It raises an exception
    when the update cannot be completed, allowing the caller in main.py
    to handle the error.
    """

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
            Image=ImageFile,
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

    image_filename = get_player_image_filename(
        site=site,
        player_page=player.get("PageName") or player_id,
        players_image=player.get("ImageFile")
    )


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
            Tm.Short=TeamAbbreviation,
            Tm.Region=Region,
            Tm.Image=TeamLogoFile,
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
    # 9B. Retrieve international championship achievements
    # ============================================================

    international_titles = get_international_title_flags(
        site,
        safe_player_id
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
        "image_filename": image_filename,
        "game_date": date.today().isoformat(),

        # International championship achievements
        "won_first_stand": international_titles["won_first_stand"],
        "won_msi": international_titles["won_msi"],
        "won_worlds": international_titles["won_worlds"]
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
        "team_abbreviation": row.get("TeamAbbreviation"),
        "team_logo_filename": row.get("TeamLogoFile"),
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
    # 15. Mark the selected player as unavailable
    # ============================================================

    (
        supabase
        .table(SUPABASE_TABLE)
        .update({
            "Available": False
        })
        .eq("Player", player_id)
        .execute()
    )


    # ============================================================
    # 16. Confirmation
    # ============================================================

    print(
        f"Daily player updated successfully: "
        f"{daily_player_data['player_name']}"
    )

    print(
        f"Team-history rows inserted: {len(history_rows)}"
    )

    print(
        f"Player marked as unavailable: {player_id}"
    )
    print("\n========== RETRIEVED PLAYER INFO ==========")
    print("Player:", player.get("Player"))
    print("Nationality:", player.get("Nationality"))
    print("Date of birth:", player.get("DOB"))
    print("Retired:", player.get("Retired"))
    print("Image filename:", player.get("ImageFile"))
    print("Leaguepedia page:", player.get("PageName"))

    print("\n========== FINAL IMAGE RESULT ==========")
    print("Players.Image:", repr(player.get("ImageFile")))
    print("Selected image filename:", repr(image_filename))

    print("\nAll player fields:")
    print(player)


if __name__ == "__main__":
    # Allows this file to still be run manually for local testing.
    update_daily_player()
