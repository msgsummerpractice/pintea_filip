from __future__ import annotations

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import dotenv_values


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent


def load_environment(root_dir: Path, base_dir: Path) -> None:
    merged_values: dict[str, str] = {}

    for env_path in (root_dir / ".env", base_dir / ".env"):
        for key, value in dotenv_values(env_path).items():
            if value is not None:
                merged_values[key] = value

    for key, value in merged_values.items():
        os.environ.setdefault(key, value)


load_environment(ROOT_DIR, BASE_DIR)


def env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    value = env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    value = env(name)
    if value is None:
        return default or []
    return [item.strip() for item in value.split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", default=True)
SECRET_KEY = env("DJANGO_SECRET_KEY", "change-me")
if not DEBUG and SECRET_KEY == "change-me":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "apps.cases",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="airassist"),
        "USER": env("POSTGRES_USER", default="airassist"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="airassist"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

AUTHENTICATION_BACKENDS = [
    "apps.cases.auth_backends.EmailOrUsernameModelBackend",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])

AIRPORTGAP_API_TOKEN = env("AIRPORTGAP_API_TOKEN", default="") or ""
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@airassist.local") or "noreply@airassist.local"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"