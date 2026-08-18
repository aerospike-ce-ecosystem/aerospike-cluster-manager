"""Export the FastAPI OpenAPI document to a file, without starting a server.

Backs the backend↔frontend type-sync codegen (#165). ``app.openapi()`` builds
the document from the route table and the Pydantic models directly, so this
needs no running server, no database, and no Aerospike cluster — which is what
makes it usable from CI and from a pre-commit hook.

Two details that matter for a *committed* artifact:

* **The K8s surface is always included.** ``main`` mounts ``routers.k8s_clusters``
  only when ``K8S_MANAGEMENT_ENABLED`` is true, so the schema would otherwise
  depend on the exporter's environment and the committed file would flip
  depending on who ran it. The flag is forced on before ``main`` is imported.
* **Output is deterministic.** Keys are sorted and the file ends with a
  newline, so re-running produces a byte-identical file and the CI drift check
  compares content rather than formatting.

Run it as an entry point, not by importing it: the ``K8S_MANAGEMENT_ENABLED``
line below only takes effect if it runs *before* ``main`` is imported, and
importing this module into a process that already imported ``main`` silently
produces a document with no k8s routes. ``tests/test_export_openapi.py`` drives
it through a subprocess for exactly that reason.

Usage::

    uv run python scripts/export_openapi.py                 # -> ../ui/openapi.json
    uv run python scripts/export_openapi.py --out path.json
    uv run python scripts/export_openapi.py --check         # exit 1 if stale
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Must be set BEFORE importing main: the k8s router is imported at module scope
# behind this flag, and the OpenAPI document is built from whatever is mounted.
os.environ.setdefault("K8S_MANAGEMENT_ENABLED", "true")
# The app imports secrets_crypto, which refuses to start without a KEK. Any
# key works — nothing is encrypted while building a schema.
os.environ.setdefault("ACM_ALLOW_EPHEMERAL_KEK", "true")

_DEFAULT_OUT = Path(__file__).resolve().parents[2] / "ui" / "openapi.json"


def build_schema() -> dict:
    """Return the OpenAPI document as a plain dict."""
    from aerospike_cluster_manager_api.main import app

    return app.openapi()


def render(schema: dict) -> str:
    """Serialise deterministically so re-running is a no-op."""
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=_DEFAULT_OUT, help="output path")
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit 1 when the file on disk differs from the current schema",
    )
    args = parser.parse_args(argv)

    rendered = render(build_schema())

    if args.check:
        if not args.out.exists():
            print(f"{args.out} does not exist; run: uv run python scripts/export_openapi.py", file=sys.stderr)
            return 1
        if args.out.read_text(encoding="utf-8") != rendered:
            print(
                f"{args.out} is out of date with the API's Pydantic models.\nRegenerate with: make generate-types",
                file=sys.stderr,
            )
            return 1
        print(f"{args.out} is up to date")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
