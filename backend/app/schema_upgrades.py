"""
Small, safe database upgrades that run on every startup.

create_all() makes NEW tables but never adds columns to tables that already
exist. These statements add the new columns to existing databases. Each one is
written so it can run any number of times (IF NOT EXISTS), and none removes data.
"""
from sqlalchemy import text

UPGRADES = [
    # Designation (job title) on users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(120)",
    # Session version on users (password reset signs out other devices)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0",
]


async def run_upgrades(conn) -> None:
    for sql in UPGRADES:
        await conn.execute(text(sql))
