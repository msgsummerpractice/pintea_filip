import os
from pathlib import Path
import sys
from unittest.mock import Mock
import importlib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.urls import URLResolver
from django.urls import get_resolver

from config.settings import load_environment


def test_backend_foundation_settings_are_configured() -> None:
    assert "apps.cases" in settings.INSTALLED_APPS
    assert "http://localhost:5173" in settings.CORS_ALLOWED_ORIGINS
    assert settings.AIRPORTGAP_API_TOKEN == ""

    database_settings = settings.DATABASES["default"]
    assert database_settings["ENGINE"] == "django.db.backends.postgresql"
    assert database_settings["HOST"] == "localhost"
    assert str(database_settings["PORT"]) == "5432"

    assert settings.MEDIA_URL == "/media/"
    assert settings.MEDIA_ROOT.name == "media"


def test_api_route_is_registered() -> None:
    api_pattern = next(
        pattern
        for pattern in get_resolver().url_patterns
        if str(pattern.pattern) == "api/"
    )

    assert isinstance(api_pattern, URLResolver)
    assert api_pattern.urlconf_name.__name__ == "config.api_urls"


def test_cases_api_include_is_registered() -> None:
    from config.api_urls import urlpatterns

    cases_pattern = next(
        pattern
        for pattern in urlpatterns
        if str(pattern.pattern) == ""
    )

    assert isinstance(cases_pattern, URLResolver)
    assert cases_pattern.urlconf_name.__name__ == "apps.cases.api.urls"


def test_backend_env_overrides_root_env(tmp_path: Path, monkeypatch) -> None:
    env_name = "TASK2_ENV_OVERRIDE_TEST"
    original_value = os.environ.get(env_name)
    root_dir = tmp_path / "root"
    base_dir = root_dir / "backend"
    root_dir.mkdir()
    base_dir.mkdir()

    (root_dir / ".env").write_text(f"{env_name}=root-value\n", encoding="utf-8")
    (base_dir / ".env").write_text(f"{env_name}=backend-value\n", encoding="utf-8")

    monkeypatch.delenv(env_name, raising=False)
    try:
        load_environment(root_dir, base_dir)
        assert os.environ[env_name] == "backend-value"
    finally:
        if original_value is None:
            os.environ.pop(env_name, None)
        else:
            os.environ[env_name] = original_value


def test_process_environment_overrides_env_files(tmp_path: Path, monkeypatch) -> None:
    env_name = "TASK2_PROCESS_ENV_PRIORITY_TEST"
    root_dir = tmp_path / "root"
    base_dir = root_dir / "backend"
    root_dir.mkdir()
    base_dir.mkdir()

    (root_dir / ".env").write_text(f"{env_name}=root-value\n", encoding="utf-8")
    (base_dir / ".env").write_text(f"{env_name}=backend-value\n", encoding="utf-8")

    monkeypatch.setenv(env_name, "process-value")
    load_environment(root_dir, base_dir)

    assert os.environ[env_name] == "process-value"


def test_manage_py_uses_project_settings(monkeypatch) -> None:
    import manage

    execute = Mock()
    argv = ["manage.py", "check"]
    monkeypatch.setattr("django.core.management.execute_from_command_line", execute)
    monkeypatch.setattr("sys.argv", argv)

    manage.main()

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "config.settings"
    execute.assert_called_once_with(argv)


def test_wsgi_and_asgi_use_project_settings(monkeypatch) -> None:
    asgi_factory = Mock(name="asgi_factory", return_value=object())
    wsgi_factory = Mock(name="wsgi_factory", return_value=object())
    monkeypatch.setattr("django.core.asgi.get_asgi_application", asgi_factory)
    monkeypatch.setattr("django.core.wsgi.get_wsgi_application", wsgi_factory)

    sys.modules.pop("config.asgi", None)
    sys.modules.pop("config.wsgi", None)
    asgi_module = importlib.import_module("config.asgi")
    wsgi_module = importlib.import_module("config.wsgi")

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "config.settings"
    assert asgi_module.application is asgi_factory.return_value
    assert wsgi_module.application is wsgi_factory.return_value
    asgi_factory.assert_called_once()
    wsgi_factory.assert_called_once()


def test_secret_key_fallback_is_rejected_when_debug_is_disabled(monkeypatch) -> None:
    original_debug = os.environ.get("DJANGO_DEBUG")
    original_secret_key = os.environ.get("DJANGO_SECRET_KEY")
    monkeypatch.setenv("DJANGO_DEBUG", "false")
    monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
    monkeypatch.setattr("dotenv.dotenv_values", lambda _path: {})

    settings_module = importlib.import_module("config.settings")

    try:
        importlib.reload(settings_module)
    except ImproperlyConfigured as exc:
        assert str(exc) == "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false."
    else:  # pragma: no cover - failure path
        raise AssertionError("Expected ImproperlyConfigured when debug is disabled without a secret key.")
    finally:
        if original_debug is None:
            monkeypatch.delenv("DJANGO_DEBUG", raising=False)
        else:
            monkeypatch.setenv("DJANGO_DEBUG", original_debug)

        if original_secret_key is None:
            monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
        else:
            monkeypatch.setenv("DJANGO_SECRET_KEY", original_secret_key)

        importlib.reload(settings_module)