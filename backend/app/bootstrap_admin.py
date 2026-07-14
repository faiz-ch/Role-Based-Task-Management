"""
One-time setup script for a brand new system: creates an "Admin" role
with ALL permissions, and assigns it to a user you specify by email.

This solves the chicken-and-egg problem: normally only someone with
'user:manage' or 'role:manage' permission can assign roles — but when
the system is brand new, NO ONE has any permission yet. This script is
the one time we bypass the API and go straight to the database.

Usage:
    python -m app.bootstrap_admin your-email@example.com

(Run this AFTER you've registered that user via POST /auth/register)
"""
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.role import Role, Permission
from app.models.user import User


async def bootstrap_admin(email: str):
    async with AsyncSessionLocal() as db:
        user_result = await db.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if user is None:
            print(f"No user found with email {email}. Register this user first via /auth/register.")
            return

        role_result = await db.execute(select(Role).where(Role.name == "Admin"))
        admin_role = role_result.scalar_one_or_none()

        if admin_role is None:
            all_perms_result = await db.execute(select(Permission))
            all_permissions = all_perms_result.scalars().all()
            admin_role = Role(name="Admin", permissions=list(all_permissions))
            db.add(admin_role)
            await db.flush()  # get admin_role.id without a full commit yet

        user.role_id = admin_role.id
        await db.commit()
        print(f"'{email}' is now an Admin.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m app.bootstrap_admin <email>")
        sys.exit(1)
    asyncio.run(bootstrap_admin(sys.argv[1]))
