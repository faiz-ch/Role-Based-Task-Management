"""
Async SQLAlchemy setup.

Why async matters here: with the OLD sync setup, if 10 users hit the API
at the same time, each request BLOCKS a worker thread while waiting for
Postgres to respond. With async, while request A is waiting on the
database, the server can start working on request B, C, D... on the
SAME thread. This matters a lot once you have real concurrent users.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.config import settings

# echo=False in production; set True temporarily if you want to see every
# SQL query printed in the terminal (useful for debugging).
engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # keeps objects usable after commit (needed for returning them in API responses)
)

Base = declarative_base()


async def get_db():
    """
    FastAPI dependency — gives each request its own async DB session.
    Usage in a route: async def route(db: AsyncSession = Depends(get_db))
    """
    async with AsyncSessionLocal() as session:
        yield session
