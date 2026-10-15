from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a local .env file)."""

    app_name: str = "CareSlot API"
    app_version: str = "1.0.0"
    # No password is baked in here: DATABASE_URL must come from the environment
    # (docker compose .env, Kubernetes Secret, or the CI service container).
    database_url: str = "sqlite:///./careslot-dev.db"
    # Timestamps are stored in UTC; "today" and date filters use the clinic's local day.
    clinic_timezone: str = "Asia/Kolkata"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
