"""Structured detection of Aerospike server result codes on raised exceptions.

The FastAPI global exception handlers map aerospike-py exceptions to HTTP
responses. Historically some of that mapping keyed off substring matches of the
human-readable exception message (e.g. ``"failforbidden" in str(exc).lower()``),
which is brittle: message wording can change between aerospike-py releases and
localisations, silently breaking the mapping.

This module extracts the *numeric* Aerospike result code instead, which is
stable across releases:

1. First it reads a structured ``.result_code`` int attribute off the exception.
   aerospike-py is adding this attribute (ADR-0011); when the installed build
   exposes it we use it directly.
2. If the attribute is absent (currently-released aerospike-py), it falls back
   to parsing the code that aerospike-py already embeds in the message text,
   which is rendered as ``AEROSPIKE_ERR (<code>): ...`` (see aerospike-py
   ``rust/src/errors.rs``).

The result-code constants mirror aerospike-py's ``AEROSPIKE_ERR_*`` values
(``rust/src/constants.rs``).
"""

from __future__ import annotations

import re

# --- Aerospike server result codes (subset used by this API's error mapping) ---
# Mirrors aerospike-py's ``AEROSPIKE_ERR_FAIL_FORBIDDEN`` (wire code 22). Raised,
# for example, when setting a record TTL against a namespace without
# ``nsup-period`` configured.
RESULT_CODE_FAIL_FORBIDDEN = 22

# aerospike-py renders server errors as ``AEROSPIKE_ERR (<code>): <detail>``
# (and batch errors as ``AEROSPIKE_ERR (<code>) [batch_index=N]: ...``). The
# code may be negative for client-side errors, so allow an optional sign.
_AEROSPIKE_ERR_CODE_RE = re.compile(r"AEROSPIKE_ERR \((-?\d+)\)")


def result_code_of(exc: BaseException) -> int | None:
    """Return the Aerospike numeric result code carried by *exc*, or ``None``.

    Detection order (robust now, forward-compatible with aerospike-py ADR-0011):

    1. ``exc.result_code`` — the structured int attribute aerospike-py is
       introducing. Used directly when present.
    2. Otherwise, the numeric code embedded in ``str(exc)`` as
       ``AEROSPIKE_ERR (<code>)``, which the currently-released aerospike-py
       already emits.
    """
    # 1. Structured attribute (preferred once aerospike-py exposes it).
    code = getattr(exc, "result_code", None)
    # bool is an int subclass; a stray True/False must not be treated as a code.
    if isinstance(code, int) and not isinstance(code, bool):
        return code
    if isinstance(code, str):
        try:
            return int(code.strip())
        except ValueError:
            pass

    # 2. Fallback: parse the code aerospike-py embeds in the message.
    match = _AEROSPIKE_ERR_CODE_RE.search(str(exc))
    if match:
        return int(match.group(1))
    return None
