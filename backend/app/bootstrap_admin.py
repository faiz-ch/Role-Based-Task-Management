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

Safe to run more than once: if the Admin role/category already exist,
it will also make sure Admin's assignable_categories includes every
Category currently in the system (so newly added categories after the
first run still get picked up).
"""
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.role import Role, Permission, role_assignable_category
from app.models.category import Category
from app.models.department import Department
from app.models.user import User


async def bootstrap_admin(email: str):
    async with AsyncSessionLocal() as db:
        user_result = await db.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if user is None:
            print(f"No user found with email {email}. Register this user first via /auth/register.")
            return

        # Admin category: all permissions (no departments or assignable categories - those live on Role now)
        cat_result = await db.execute(
            select(Category).where(Category.name == "Admin")
        )
        admin_category = cat_result.scalar_one_or_none()

        if admin_category is None:
            all_permissions = (await db.execute(select(Permission))).scalars().all()
            admin_category = Category(
                name="Admin",
                permissions=list(all_permissions),
            )
            db.add(admin_category)
            await db.flush()  # get admin_category.id

        role_result = await db.execute(select(Role).where(Role.name == "Admin"))
        admin_role = role_result.scalar_one_or_none()

        if admin_role is None:
            admin_role = Role(
                name="Admin",
                category_id=admin_category.id,
                all_departments=True
            )
            db.add(admin_role)
            await db.flush()  # get admin_role.id
        else:
            if admin_role.category_id != admin_category.id:
                admin_role.category_id = admin_category.id
            if not admin_role.all_departments:
                admin_role.all_departments = True

        # Sync assignable_categories to cover every category that currently
        # exists, whether the role was just created or already existed.
        # Insert directly into the join table (not the ORM relationship) to
        # avoid MissingGreenlet from an async lazy-load on an already-flushed object.
        all_categories = (await db.execute(select(Category))).scalars().all()

        existing_links = await db.execute(
            select(role_assignable_category.c.category_id).where(
                role_assignable_category.c.role_id == admin_role.id
            )
        )
        already_linked_ids = {row[0] for row in existing_links.all()}

        missing_categories = [c for c in all_categories if c.id not in already_linked_ids]

        for cat in missing_categories:
            await db.execute(
                role_assignable_category.insert().values(
                    role_id=admin_role.id,
                    category_id=cat.id,
                )
            )

        if missing_categories:
            names = ", ".join(c.name for c in missing_categories)
            print(f"Added {len(missing_categories)} newly found categor{'y' if len(missing_categories) == 1 else 'ies'} to Admin's assignable list: {names}")

        user.role_id = admin_role.id
        await db.commit()
        print(f"'{email}' is now an Admin.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m app.bootstrap_admin <email>")
        sys.exit(1)
    asyncio.run(bootstrap_admin(sys.argv[1]))