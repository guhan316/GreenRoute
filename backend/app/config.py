from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_SUPABASE_URL = "https://wvejhtqckwwlxfvlsxmy.supabase.co"
DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ttm03drKHFCUZWQkkv6cFA_lqlJHpzV"


class Settings(BaseSettings):
    google_routes_api_key: str = ""
    tomtom_api_key: str = ""
    cors_origins: str = "http://localhost:5173"
    demo_fallback_enabled: bool = True
    supabase_url: str = DEFAULT_SUPABASE_URL
    supabase_publishable_key: str = DEFAULT_SUPABASE_PUBLISHABLE_KEY

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
