"""Terminal command execution service.

Parses AQL-style commands and executes them against an Aerospike cluster
via the async client.
"""

from __future__ import annotations

import logging

from aerospike_cluster_manager_api.constants import (
    INFO_BUILD,
    INFO_EDITION,
    INFO_NAMESPACES,
    INFO_NODE,
    INFO_STATISTICS,
    INFO_STATUS,
    info_bins,
    info_sets,
    info_sindex,
)
from aerospike_cluster_manager_api.info_parser import (
    aggregate_set_records,
    parse_kv_pairs,
    parse_list,
    parse_records,
    safe_int,
)

logger = logging.getLogger(__name__)


async def execute_terminal_command(c, command: str) -> tuple[str, bool]:
    """Execute a terminal command against Aerospike. Returns (output, success)."""
    lower = command.lower()

    if lower == "show namespaces":
        ns_raw = await c.info_random_node(INFO_NAMESPACES)
        ns_list = parse_list(ns_raw)
        if not ns_list:
            return "(no namespaces)", True
        lines = [f"  {ns}" for ns in ns_list]
        return "Namespaces:\n" + "\n".join(lines), True

    if lower == "show sets":
        ns_raw = await c.info_random_node(INFO_NAMESPACES)
        ns_list = parse_list(ns_raw)
        set_lines: list[str] = []
        for ns in ns_list:
            ns_info_raw = await c.info_random_node(f"namespace/{ns}")
            ns_kv = parse_kv_pairs(ns_info_raw)
            rf = safe_int(ns_kv.get("replication-factor"), 1)

            sets_all = await c.info_all(info_sets(ns))
            agg_sets = aggregate_set_records(sets_all, rf)
            for s in agg_sets:
                set_lines.append(
                    f"  {ns}.{s['name']}  objects={s['objects']}  tombstones={s['tombstones']}"
                    f"  (nodes={s['node_count']})"
                )
        return "Sets:\n" + "\n".join(set_lines) if set_lines else "(no sets)", True

    if lower == "show bins":
        ns_raw = await c.info_random_node(INFO_NAMESPACES)
        ns_list = parse_list(ns_raw)
        all_bins: set[str] = set()
        for ns in ns_list:
            bins_all = await c.info_all(info_bins(ns))
            for _name, err, bins_raw in bins_all:
                if err is not None:
                    continue
                bins_info = parse_kv_pairs(bins_raw, sep=",")
                for k in bins_info:
                    if k.startswith("bin_names"):
                        all_bins.update(b.strip() for b in bins_info[k].split(",") if b.strip())
                    elif k not in ("num", "quota"):
                        all_bins.add(k)
        if all_bins:
            return "Bins:\n" + "\n".join(f"  {b}" for b in sorted(all_bins)), True
        return "(no bins)", True

    if lower == "show indexes" or lower == "show sindex":
        ns_raw = await c.info_random_node(INFO_NAMESPACES)
        ns_list = parse_list(ns_raw)
        idx_lines: list[str] = []
        for ns in ns_list:
            sindex_raw = await c.info_random_node(info_sindex(ns))
            for rec in parse_records(sindex_raw):
                name = rec.get("indexname", rec.get("index_name", ""))
                bin_name = rec.get("bin", rec.get("bin_name", ""))
                idx_type = rec.get("type", rec.get("bin_type", ""))
                state = rec.get("state", "")
                idx_lines.append(f"  {ns}.{name}  bin={bin_name}  type={idx_type}  state={state}")
        return "Indexes:\n" + "\n".join(idx_lines) if idx_lines else "(no indexes)", True

    if lower == "status":
        resp = await c.info_random_node(INFO_STATUS)
        return resp.strip(), True

    if lower == "build":
        build = (await c.info_random_node(INFO_BUILD)).strip()
        edition = (await c.info_random_node(INFO_EDITION)).strip()
        return f"{edition} {build}", True

    if lower == "node":
        resp = await c.info_random_node(INFO_NODE)
        return resp.strip(), True

    if lower == "statistics":
        stats_all = await c.info_all(INFO_STATISTICS)
        output_parts: list[str] = []
        for node_name, err, raw in stats_all:
            if err is not None:
                output_parts.append(f"--- {node_name} (error) ---")
                continue
            stats = parse_kv_pairs(raw)
            lines = [f"  {k}={v}" for k, v in sorted(stats.items())]
            output_parts.append(f"--- {node_name} ---\n" + "\n".join(lines))
        return "Statistics:\n" + "\n\n".join(output_parts), True

    # Fallback: try as raw info command
    try:
        resp = await c.info_random_node(command)
        return resp.strip() if resp.strip() else "(empty response)", True
    except Exception:
        logger.exception("Terminal command failed: %s", command)
        return "Command failed. Check server logs for details.", False
