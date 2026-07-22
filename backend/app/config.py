"""
App configuration, loaded from environment variables (or a .env file).
Using pydantic-settings means we get validation + type hints for free —
if DATABASE_URL is missing, the app will fail fast at startup with a
clear error instead of a confusing crash later.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Note: "postgresql+asyncpg" (not plain "postgresql") — this tells
    # SQLAlchemy to use the async asyncpg driver instead of the sync psycopg2 one.
    DATABASE_URL: str = "postgresql+asyncpg://taskmanager:taskmanager@localhost:5432/taskmanager"
    SECRET_KEY: str = "change-me-please-this-signs-your-jwt-tokens"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENV: str = "development"
    GOTENBERG_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
