"""Tests for the stdout (+ optional file mirror) logging config."""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

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
# Default stdout-only mode
# ---------------------------------------------------------------------------


def test_setup_logging_default_text(monkeypatch):
    monkeypatch.delenv("LOG_FILE_PATH", raising=False)
    logging_config.setup_logging("INFO", "text")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert root.level == logging.INFO
    assert len(root.handlers) == 1
    stream_handlers = [h for h in root.handlers if isinstance(h, logging.StreamHandler)]
    assert len(stream_handlers) == 1
    assert stream_handlers[0].stream is sys.stdout


def test_setup_logging_default_json(monkeypatch):
    monkeypatch.delenv("LOG_FILE_PATH", raising=False)
    logging_config.setup_logging("DEBUG", "json")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert root.level == logging.DEBUG
    assert len(root.handlers) == 1


def test_setup_logging_clears_existing_handlers(monkeypatch):
    """Repeated calls must replace handlers, not accumulate them."""
    monkeypatch.delenv("LOG_FILE_PATH", raising=False)
    logging_config.setup_logging("INFO", "text")
    logging_config.setup_logging("INFO", "text")
    root = logging.getLogger(ROOT_LOGGER_NAME)
    assert len(root.handlers) == 1


# ---------------------------------------------------------------------------
# LOG_FILE_PATH (rotating file mirror for pod-internal sidecar)
# ---------------------------------------------------------------------------


def test_log_file_path_attaches_rotating_file_handler(tmp_path: Path, monkeypatch):
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
    monkeypatch.setenv("LOG_FILE_PATH", "  ")

    logging_config.setup_logging("INFO", "text")

    root = logging.getLogger(ROOT_LOGGER_NAME)
    file_handlers = [h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]
    assert file_handlers == []


def test_log_file_path_double_call_does_not_accumulate_handlers(tmp_path: Path, monkeypatch):
    """uvicorn --reload / repeated setup_logging() must not leak file descriptors."""
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
