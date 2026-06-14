import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./splitwise.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-for-splitwise-clone-development-123456!!!")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days for convenience

    class Config:
        env_file = ".env"

settings = Settings()

# Render/Heroku provides connection URIs beginning with "postgres://" but SQLAlchemy expects "postgresql://"
if settings.DATABASE_URL.startswith("postgres://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)

