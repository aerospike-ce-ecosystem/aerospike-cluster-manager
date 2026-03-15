"""Tests for extract_migration_status() in k8s_service."""

from __future__ import annotations

from aerospike_cluster_manager_api.services.k8s_service import extract_migration_status


class TestExtractMigrationStatus:
    """Tests for extract_migration_status()."""

    def test_migration_status_present(self):
        """Normal case: status.migrationStatus is fully populated."""
        cluster_cr = {
            "status": {
                "migrationStatus": {
                    "inProgress": True,
                    "remainingPartitions": 5000,
                    "lastChecked": "2025-01-01T00:00:00Z",
                },
                "pods": {
                    "pod-0": {"migratingPartitions": 3000},
                    "pod-1": {"migratingPartitions": 2000},
                },
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 5000
        assert result["lastChecked"] == "2025-01-01T00:00:00Z"
        assert len(result["pods"]) == 2
        pod_names = {p["podName"] for p in result["pods"]}
        assert pod_names == {"pod-0", "pod-1"}

    def test_migration_status_absent_infer_from_pods(self):
        """When status.migrationStatus is absent, infer from per-pod data."""
        cluster_cr = {
            "status": {
                "pods": {
                    "pod-0": {"migratingPartitions": 1000},
                    "pod-1": {"migratingPartitions": 500},
                },
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 1500
        assert len(result["pods"]) == 2

    def test_migration_status_absent_no_migrating_pods(self):
        """When migrationStatus absent and no pods migrating, inProgress is False."""
        cluster_cr = {
            "status": {
                "pods": {
                    "pod-0": {"migratingPartitions": 0},
                    "pod-1": {"migratingPartitions": 0},
                },
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is False
        assert result["remainingPartitions"] == 0
        assert len(result["pods"]) == 0

    def test_pods_as_list(self):
        """status.pods can be a list instead of a dict."""
        cluster_cr = {
            "status": {
                "pods": [
                    {"name": "pod-0", "migratingPartitions": 200},
                    {"podName": "pod-1", "migratingPartitions": 300},
                ],
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 500
        assert len(result["pods"]) == 2
        pod_names = {p["podName"] for p in result["pods"]}
        assert pod_names == {"pod-0", "pod-1"}

    def test_pods_as_list_with_zero_migration(self):
        """Pods list where no pod is migrating."""
        cluster_cr = {
            "status": {
                "pods": [
                    {"name": "pod-0", "migratingPartitions": 0},
                ],
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is False
        assert result["remainingPartitions"] == 0
        assert len(result["pods"]) == 0

    def test_waiting_for_migration_phase_but_not_in_progress(self):
        """phase == 'WaitingForMigration' should set inProgress=True even if migrationStatus says false."""
        cluster_cr = {
            "status": {
                "phase": "WaitingForMigration",
                "migrationStatus": {
                    "inProgress": False,
                    "remainingPartitions": 0,
                },
                "pods": {},
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 0

    def test_waiting_for_migration_already_in_progress(self):
        """phase == 'WaitingForMigration' with inProgress already True stays True."""
        cluster_cr = {
            "status": {
                "phase": "WaitingForMigration",
                "migrationStatus": {
                    "inProgress": True,
                    "remainingPartitions": 100,
                },
                "pods": {},
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 100

    def test_empty_status(self):
        """Completely empty status section."""
        cluster_cr = {"status": {}}

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is False
        assert result["remainingPartitions"] == 0
        assert result["lastChecked"] is None
        assert result["pods"] == []

    def test_no_status_key(self):
        """CR with no status key at all."""
        cluster_cr = {}

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is False
        assert result["remainingPartitions"] == 0
        assert result["pods"] == []

    def test_last_checked_null_when_not_provided(self):
        """When operator doesn't provide lastChecked, it should be None."""
        cluster_cr = {
            "status": {
                "migrationStatus": {
                    "inProgress": True,
                    "remainingPartitions": 100,
                },
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["lastChecked"] is None

    def test_pods_dict_with_non_dict_values_skipped(self):
        """Non-dict pod entries in a dict are safely skipped."""
        cluster_cr = {
            "status": {
                "pods": {
                    "pod-0": {"migratingPartitions": 100},
                    "pod-1": "invalid",
                    "pod-2": None,
                },
            }
        }

        result = extract_migration_status(cluster_cr)

        assert result["inProgress"] is True
        assert result["remainingPartitions"] == 100
        assert len(result["pods"]) == 1

    def test_pods_list_with_non_dict_entries_skipped(self):
        """Non-dict entries in a list are safely skipped."""
        cluster_cr = {
            "status": {
                "pods": [
                    {"name": "pod-0", "migratingPartitions": 50},
                    "invalid",
                    None,
                ],
            }
        }

        result = extract_migration_status(cluster_cr)

        assert len(result["pods"]) == 1
        assert result["pods"][0]["migratingPartitions"] == 50
