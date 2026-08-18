"""Tests for the OpenAPI export that backs backend↔frontend codegen (#165).

The script is the load-bearing part of the type-sync mechanism: if it emits a
different document depending on the environment, the CI drift check turns into
noise and gets disabled, and goal 2-7 goes back to being enforced by review.

**Everything here runs the script in a subprocess**, which is how
``make generate-types`` and CI run it. That is not incidental. The script sets
``K8S_MANAGEMENT_ENABLED`` before importing ``main``, and ``main`` mounts the
k8s router at import time — so importing the script into a pytest process that
has *already* imported ``main`` (any router test does) silently produces a
document with no k8s routes. An in-process version of these tests passes or
fails depending on module import order, which is precisely the kind of check
nobody trusts. Paying for a subprocess buys a result that means something.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

_API_ROOT = Path(__file__).resolve().parents[1]
_SCRIPT = _API_ROOT / "scripts" / "export_openapi.py"
_COMMITTED = _API_ROOT.parent / "ui" / "openapi.json"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(_SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=_API_ROOT,
    )


@pytest.fixture(scope="module")
def exported(tmp_path_factory) -> str:
    """Export once and reuse — each run boots the whole app."""
    out = tmp_path_factory.mktemp("openapi") / "openapi.json"
    result = _run("--out", str(out))
    assert result.returncode == 0, result.stderr
    return out.read_text(encoding="utf-8")


class TestSchemaExport:
    def test_produces_a_valid_openapi_document(self, exported):
        schema = json.loads(exported)
        assert schema["openapi"].startswith("3.")
        assert schema["info"]["title"] == "Aerospike Cluster Manager API"
        assert schema["paths"]
        assert schema["components"]["schemas"]

    def test_includes_the_k8s_surface(self, exported):
        """The committed artifact must not depend on the exporter's environment.

        ``main`` mounts the k8s router only when K8S_MANAGEMENT_ENABLED is
        true. Without the script forcing it on, the file would flip depending
        on who ran the export and CI would report drift nobody caused.
        """
        schema = json.loads(exported)
        k8s_paths = [p for p in schema["paths"] if "/k8s/" in p]
        assert k8s_paths, "k8s routes missing from the exported schema"

    def test_needs_no_database_or_cluster(self, exported):
        # Implied by the fixture succeeding: the subprocess never ran the
        # lifespan, so nothing connected to SQLite, Postgres, or Aerospike.
        # Asserted explicitly because "offline" is the property that makes
        # this usable from CI and a pre-commit hook.
        assert json.loads(exported)["paths"]

    def test_output_is_deterministic(self, tmp_path, exported):
        """Re-running must be byte-for-byte identical, or the diff check is noise."""
        out = tmp_path / "again.json"
        assert _run("--out", str(out)).returncode == 0
        assert out.read_text(encoding="utf-8") == exported

    def test_output_is_sorted_and_newline_terminated(self, exported):
        assert exported.endswith("\n")
        assert exported == json.dumps(json.loads(exported), indent=2, sort_keys=True, ensure_ascii=False) + "\n"

    def test_committed_file_is_current(self, exported):
        """The check CI runs, so a forgotten regeneration fails here too.

        Fix with: make generate-types
        """
        assert _COMMITTED.exists(), f"{_COMMITTED} is missing; run: make generate-types"
        assert _COMMITTED.read_text(encoding="utf-8") == exported, (
            "ui/openapi.json is stale relative to the Pydantic models. Run: make generate-types"
        )


class TestCheckMode:
    def test_passes_on_a_current_file(self, tmp_path, exported):
        out = tmp_path / "openapi.json"
        out.write_text(exported, encoding="utf-8")
        result = _run("--check", "--out", str(out))
        assert result.returncode == 0, result.stderr

    def test_fails_on_a_stale_file(self, tmp_path):
        out = tmp_path / "openapi.json"
        out.write_text('{"openapi": "3.1.0"}\n', encoding="utf-8")
        result = _run("--check", "--out", str(out))
        assert result.returncode == 1
        # The message has to name the fix, or the failure is a puzzle.
        assert "make generate-types" in result.stderr

    def test_fails_when_the_file_is_missing(self, tmp_path):
        result = _run("--check", "--out", str(tmp_path / "nope.json"))
        assert result.returncode == 1
        assert "does not exist" in result.stderr

    def test_check_mode_writes_nothing(self, tmp_path):
        out = tmp_path / "openapi.json"
        out.write_text('{"openapi": "3.1.0"}\n', encoding="utf-8")
        _run("--check", "--out", str(out))
        assert out.read_text(encoding="utf-8") == '{"openapi": "3.1.0"}\n'

    def test_write_mode_creates_missing_directories(self, tmp_path):
        out = tmp_path / "nested" / "openapi.json"
        assert _run("--out", str(out)).returncode == 0
        assert json.loads(out.read_text(encoding="utf-8"))["paths"]
