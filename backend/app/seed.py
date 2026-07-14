"""
Seeds the 6 fixed permissions into the database if they don't already
exist. Safe to run multiple times (won't create duplicates).

Run manually with: python -m app.seed
(Also called automatically on app startup — see main.py)
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.role import Permission

PERMISSIONS = [
    "task:create",
    "task:edit",
    "task:assign",
    "task:view_all",
    "task:review",
    "role:manage",
    "user:manage",
    "dashboard:view",
]


async def seed_permissions():
    async with AsyncSessionLocal() as db:
        for name in PERMISSIONS:
            existing = await db.execute(select(Permission).where(Permission.name == name))
            if existing.scalar_one_or_none() is None:
                db.add(Permission(name=name))
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed_permissions())
