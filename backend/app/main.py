"""
Entry point for the FastAPI app.
Run with: uvicorn app.main:app --reload --port 8000
Then check: http://localhost:8000/docs for the auto-generated API playground.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import engine, Base, get_db
from app.seed import seed_permissions
from app.routers import auth, users, roles, tasks, dashboard, departments, categories


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: create any tables that don't exist yet, then seed the
    # fixed permission list. In a bigger production app you'd use Alembic
    # migrations instead of create_all, but this is perfect for learning
    # and for this stage of the project.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_permissions()
    yield
    # (nothing needed on shutdown for now)


app = FastAPI(title="Task Manager API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fhk9c4kk-5173.inc1.devtunnels.ms",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(departments.router)
app.include_router(categories.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "task-manager-api"}


@app.get("/health/db")
async def health_check_db(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
