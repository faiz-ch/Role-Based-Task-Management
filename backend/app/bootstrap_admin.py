"""
Creates (or repairs) the main Admin for a brand-new system.

Self-registration is switched off, so this script is how the first account is made.

Usage (inside the backend container):
    python -m app.bootstrap_admin --email hr@rlmc.edu.pk --name "Faisal Khalid" --password "hr@12345"

What it does (safe to run more than once):
  - creates the built-in "Admin" role if missing, marks it as the protected system role
    (is_system=True) and gives it every permission and "assign all roles";
  - creates the user if the email does not exist yet (or resets the password if
    --password is given for an existing user) and gives it the Admin role.

Only users with this role are "the main Admin": every permission, every department,
every role. Nobody can create another role with these powers through the app.
"""
import argparse
import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models.role import Role, Permission
from app.models.user import User


async def bootstrap_admin(email: str, name: str | None, password: str | None) -> None:
    email = email.strip().lower()
    async with AsyncSessionLocal() as db:
        all_permissions = (await db.execute(select(Permission))).scalars().all()

        admin_role = (await db.execute(select(Role).where(Role.is_system.is_(True)))).scalars().first()
        if admin_role is None:
            admin_role = (await db.execute(select(Role).where(Role.name == "Admin"))).scalar_one_or_none()
        if admin_role is None:
            admin_role = Role(name="Admin", description="Main administrator (protected)")
            db.add(admin_role)
            await db.flush()
        await db.refresh(admin_role, ["permissions"])
        admin_role.is_system = True
        admin_role.all_roles = True
        admin_role.is_active = True
        admin_role.permissions = list(all_permissions)

        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            if not name or not password:
                print("This email has no account yet: give --name and --password to create it.")
                return
            user = User(name=name.strip(), email=email, hashed_password=hash_password(password), is_active=True)
            db.add(user)
            print(f"Created account for {email}.")
        else:
            if name:
                user.name = name.strip()
            if password:
                user.hashed_password = hash_password(password)
                print("Password updated.")
            user.is_active = True

        user.role_id = admin_role.id
        user.manage_all_departments = True
        await db.commit()
        print(f"'{email}' is now the main Admin.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or repair the main Admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name")
    parser.add_argument("--password")
    args = parser.parse_args()
    asyncio.run(bootstrap_admin(args.email, args.name, args.password))
