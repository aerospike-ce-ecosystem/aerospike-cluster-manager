"""Tests for the pluggable logging config (LOG_HANDLERS / LOGGING_CONFIG_FILE / LOG_FILE_PATH / entry-points)."""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import ClassVar
from unittest.mock import MagicMock

import pytest

from aerospike_cluster_manager_api import logging_config

ROOT_LOGGER_NAME = "aerospike_cluster_manager_api"


@pytest.fixture(autouse=True)
def restore_root_logger():
    """Snapshot/restore the application root logger between tests."""
    root = logging.getLogger(ROOT_LOGGER_NAME)
    saved_level = root.level
    saved_handlers = list(root.handlers)
    saved_propagate = root.propagate
    yield
    # close() before removeHandler() so RotatingFileHandler instances release
    # their file descriptors immediately — otherwise the leaked fd races
    # tmp_path cleanup (PermissionError on Windows; silent inode pin on Linux).
    for h in list(root.handlers):
        if h not in saved_handlers:
            h.close()
        root.removeHandler(h)
    for h in saved_handlers:
        root.addHandler(h)
    root.setLevel(saved_level)
    root.propagate = saved_propagate


# ---------------------------------------------------------------------------
# Default mode (no env vars set)
# ---------------------------------------------------------------------------


def test_setup_logging_default_text(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    logging_config.setup_logging("INFO", "text")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert root.level == logging.INFO
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0], logging.StreamHandler)


def test_setup_logging_default_json(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    logging_config.setup_logging("DEBUG", "json")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert root.level == logging.DEBUG


def test_setup_logging_clears_existing_handlers(monkeypatch):
    """Repeated calls must replace handlers, not accumulate them."""
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    logging_config.setup_logging("INFO", "text")
    logging_config.setup_logging("INFO", "text")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert len(root.handlers) == 1


# ---------------------------------------------------------------------------
# LOG_HANDLERS module:Class spec
# ---------------------------------------------------------------------------


class _FakeHandler(logging.Handler):
    """A minimal Handler with a no-arg constructor used by LOG_HANDLERS tests."""

    instances: ClassVar[list[_FakeHandler]] = []  # type: ignore[name-defined]

    def __init__(self) -> None:
        super().__init__()
        type(self).instances.append(self)

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - not exercised
        pass


def _install_fake_handler_module(monkeypatch):
    """Make `_fake_handler_pkg:_FakeHandler` resolvable as a module path."""
    mod = type(sys)("_fake_handler_pkg")
    mod._FakeHandler = _FakeHandler  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "_fake_handler_pkg", mod)


def test_log_handlers_module_class_spec(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.setenv("LOG_HANDLERS", "_fake_handler_pkg:_FakeHandler")
    _install_fake_handler_module(monkeypatch)
    _FakeHandler.instances.clear()
    logging_config.setup_logging("INFO", "text")
    assert len(_FakeHandler.instances) == 1
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert _FakeHandler.instances[0] in root.handlers


def test_log_handlers_invalid_spec_does_not_abort_startup(monkeypatch):
    """A bad spec must logger.error + skip; the good handler in the same list must still load."""
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.setenv("LOG_HANDLERS", "no_such_module:NotAClass,_fake_handler_pkg:_FakeHandler")
    _install_fake_handler_module(monkeypatch)
    _FakeHandler.instances.clear()

    # setup_logging sets propagate=False on the application root logger so
    # caplog (which attaches to stdlib root) cannot see records emitted from
    # `aerospike_cluster_manager_api.logging_config`. Attach our own
    # capture handler directly to that logger instead.
    captured: list[logging.LogRecord] = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    capture = _CaptureHandler(level=logging.ERROR)
    plugin_logger = logging.getLogger("aerospike_cluster_manager_api.logging_config")
    plugin_logger.addHandler(capture)
    try:
        logging_config.setup_logging("INFO", "text")
    finally:
        plugin_logger.removeHandler(capture)

    # The good handler still attached
    assert len(_FakeHandler.instances) == 1
    # The bad spec produced an error log
    assert any("failed to attach log handler" in r.getMessage() for r in captured)


def test_log_handlers_empty_string(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.setenv("LOG_HANDLERS", "  ")
    logging_config.setup_logging("INFO", "text")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    # Only the default stdout handler
    assert len(root.handlers) == 1


def test_resolve_handler_invalid_module_class_format():
    with pytest.raises(ValueError, match="invalid 'module:Class' spec"):
        logging_config._resolve_handler(":NoModule", {})


# ---------------------------------------------------------------------------
# Entry-point name spec
# ---------------------------------------------------------------------------


def test_log_handlers_entry_point_name(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.setenv("LOG_HANDLERS", "myhandler")
    _FakeHandler.instances.clear()

    fake_ep = MagicMock()
    fake_ep.name = "myhandler"
    fake_ep.load.return_value = _FakeHandler

    monkeypatch.setattr(
        logging_config,
        "entry_points",
        lambda group: [fake_ep] if group == logging_config.ENTRY_POINT_GROUP else [],
    )

    logging_config.setup_logging("INFO", "text")
    assert len(_FakeHandler.instances) == 1


def test_log_handlers_unknown_name_logs_error(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.setenv("LOG_HANDLERS", "ghost")
    monkeypatch.setattr(logging_config, "entry_points", lambda group: [])

    captured: list[logging.LogRecord] = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    cap = _CaptureHandler(level=logging.ERROR)
    plugin_logger = logging.getLogger("aerospike_cluster_manager_api.logging_config")
    plugin_logger.addHandler(cap)
    try:
        logging_config.setup_logging("INFO", "text")
    finally:
        plugin_logger.removeHandler(cap)

    assert any("ghost" in r.getMessage() for r in captured)


# ---------------------------------------------------------------------------
# LOG_FILE_PATH (rotating file mirror for sidecar tailing)
# ---------------------------------------------------------------------------


def test_log_file_path_attaches_rotating_file_handler(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    log_file = tmp_path / "logs" / "acm-api.log"
    monkeypatch.setenv("LOG_FILE_PATH", str(log_file))

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    assert len(file_handlers) == 1
    fh = file_handlers[0]
    # parent dir was created on demand
    assert log_file.parent.exists()
    # records actually land in the file
    logging.getLogger(ROOT_LOGGER_NAME).info("hello-file-mirror")
    fh.flush()
    fh.close()
    assert "hello-file-mirror" in log_file.read_text(encoding="utf-8")


def test_log_file_path_respects_rotation_overrides(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    log_file = tmp_path / "acm.log"
    monkeypatch.setenv("LOG_FILE_PATH", str(log_file))
    monkeypatch.setenv("LOG_FILE_MAX_BYTES", "12345")
    monkeypatch.setenv("LOG_FILE_BACKUP_COUNT", "7")

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    fh = next(h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler))
    assert fh.maxBytes == 12345
    assert fh.backupCount == 7


def test_log_file_path_invalid_rotation_falls_back_to_default(tmp_path: Path, monkeypatch):
    """Bad LOG_FILE_MAX_BYTES must not crash startup — fall back to default."""
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    log_file = tmp_path / "acm.log"
    monkeypatch.setenv("LOG_FILE_PATH", str(log_file))
    monkeypatch.setenv("LOG_FILE_MAX_BYTES", "not-an-int")
    monkeypatch.setenv("LOG_FILE_BACKUP_COUNT", "-3")

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    fh = next(h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler))
    assert fh.maxBytes == logging_config._DEFAULT_LOG_FILE_MAX_BYTES
    assert fh.backupCount == logging_config._DEFAULT_LOG_FILE_BACKUP_COUNT


def test_log_file_path_unwritable_directory_does_not_abort(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    # Use a path under tmp_path with a parent component that is an existing
    # *file* — Path.mkdir raises NotADirectoryError, which is an OSError.
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory")
    bad_path = blocker / "acm.log"
    monkeypatch.setenv("LOG_FILE_PATH", str(bad_path))

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    # stdout-only fallback, no file handler attached
    assert file_handlers == []
    # And a stderr warning explaining why
    err = capsys.readouterr().err
    assert "LOG_FILE_PATH" in err
    assert "stdout-only" in err


def test_log_file_path_empty_is_noop(monkeypatch):
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    monkeypatch.setenv("LOG_FILE_PATH", "  ")

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    assert file_handlers == []


def test_log_file_path_double_call_does_not_accumulate_handlers(tmp_path: Path, monkeypatch):
    """uvicorn --reload / repeated setup_logging() must not leak file descriptors."""
    monkeypatch.delenv("LOGGING_CONFIG_FILE", raising=False)
    monkeypatch.delenv("LOG_HANDLERS", raising=False)
    log_file = tmp_path / "acm.log"
    monkeypatch.setenv("LOG_FILE_PATH", str(log_file))

    logging_config.setup_logging("INFO", "text")
    first_pass_handlers = list(logging.getLogger(ROOT_LOGGER_NAME).handlers)
    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    # Exactly one RotatingFileHandler — the one from the second call.
    assert len(file_handlers) == 1
    # And the prior handler is closed (no leaked fd). RotatingFileHandler.close
    # sets ``self.stream`` to None.
    for prior in first_pass_handlers:
        assert prior not in root.handlers
        if isinstance(prior, logging.handlers.RotatingFileHandler):
            assert prior.stream is None


def test_log_file_path_ignored_when_logging_config_file_set(tmp_path: Path, monkeypatch):
    """LOGGING_CONFIG_FILE takes full ownership; LOG_FILE_PATH must not double-attach."""
    cfg_path = tmp_path / "logging.yaml"
    cfg_path.write_text(
        """
version: 1
disable_existing_loggers: false
handlers:
  console:
    class: logging.StreamHandler
loggers:
  aerospike_cluster_manager_api:
    level: INFO
    handlers: [console]
    propagate: false
""".strip()
    )
    monkeypatch.setenv("LOGGING_CONFIG_FILE", str(cfg_path))
    monkeypatch.setenv("LOG_FILE_PATH", str(tmp_path / "should-not-exist.log"))

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    assert file_handlers == []
    assert not (tmp_path / "should-not-exist.log").exists()


# ---------------------------------------------------------------------------
# LOGGING_CONFIG_FILE
# ---------------------------------------------------------------------------


def test_logging_config_file_takes_precedence(tmp_path: Path, monkeypatch):
    cfg_path = tmp_path / "logging.yaml"
    cfg_path.write_text(
        """
version: 1
disable_existing_loggers: false
handlers:
  console:
    class: logging.StreamHandler
    level: WARNING
loggers:
  aerospike_cluster_manager_api:
    level: WARNING
    handlers: [console]
    propagate: false
""".strip()
    )

    monkeypatch.setenv("LOGGING_CONFIG_FILE", str(cfg_path))
    # LOG_HANDLERS must be ignored when a config file is set
    monkeypatch.setenv("LOG_HANDLERS", "_fake_handler_pkg:_FakeHandler")
    _install_fake_handler_module(monkeypatch)
    _FakeHandler.instances.clear()

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert root.level == logging.WARNING
    # The fake handler from LOG_HANDLERS must NOT have been attached
    assert _FakeHandler.instances == []


def test_logging_config_file_missing_raises(monkeypatch):
    monkeypatch.setenv("LOGGING_CONFIG_FILE", "/nonexistent/path/logging.yaml")
    with pytest.raises(FileNotFoundError):
        logging_config.setup_logging("INFO", "text")


def test_logging_config_file_non_dict_raises(tmp_path: Path, monkeypatch):
    bad = tmp_path / "logging.yaml"
    bad.write_text("- this is a list, not a mapping\n")
    monkeypatch.setenv("LOGGING_CONFIG_FILE", str(bad))
    with pytest.raises(ValueError, match="dictConfig mapping"):
        logging_config.setup_logging("INFO", "text")
