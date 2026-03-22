"""Tests for extracted builder helpers in k8s_service."""

from __future__ import annotations

from types import SimpleNamespace

from aerospike_cluster_manager_api.models.k8s.cluster import UpdateK8sClusterRequest
from aerospike_cluster_manager_api.services.k8s_service import (
    _build_acl_dict,
    _build_bandwidth_dict,
    _build_rack_config_dict,
    _build_service_metadata_dict,
    _build_template_network_config_dict,
    _build_template_scheduling_dict,
    _build_template_storage_dict,
    _build_toleration_list,
    build_update_patch,
)


class TestBuildTolerationList:
    def test_empty_list(self):
        assert _build_toleration_list([]) == []

    def test_full_toleration(self):
        tol = SimpleNamespace(
            key="node-role",
            operator="Equal",
            value="aerospike",
            effect="NoSchedule",
            toleration_seconds=300,
        )
        result = _build_toleration_list([tol])
        assert result == [
            {
                "key": "node-role",
                "operator": "Equal",
                "value": "aerospike",
                "effect": "NoSchedule",
                "tolerationSeconds": 300,
            }
        ]

    def test_minimal_toleration(self):
        tol = SimpleNamespace(
            key=None,
            operator="Exists",
            value=None,
            effect=None,
            toleration_seconds=None,
        )
        result = _build_toleration_list([tol])
        assert result == [{"operator": "Exists"}]

    def test_multiple_tolerations(self):
        tols = [
            SimpleNamespace(key="k1", operator="Equal", value="v1", effect=None, toleration_seconds=None),
            SimpleNamespace(key="k2", operator="Exists", value=None, effect="NoExecute", toleration_seconds=60),
        ]
        result = _build_toleration_list(tols)
        assert len(result) == 2
        assert result[0] == {"key": "k1", "operator": "Equal", "value": "v1"}
        assert result[1] == {"key": "k2", "operator": "Exists", "effect": "NoExecute", "tolerationSeconds": 60}


class TestBuildAclDict:
    def test_with_roles_and_users(self):
        acl = SimpleNamespace(
            roles=[
                SimpleNamespace(name="admin", privileges=["read-write"], whitelist=["10.0.0.0/8"]),
                SimpleNamespace(name="reader", privileges=["read"], whitelist=None),
            ],
            users=[
                SimpleNamespace(name="admin_user", secret_name="admin-secret", roles=["admin"]),
            ],
            admin_policy_timeout=5000,
        )
        result = _build_acl_dict(acl)
        assert len(result["roles"]) == 2
        assert result["roles"][0]["whitelist"] == ["10.0.0.0/8"]
        assert "whitelist" not in result["roles"][1]
        assert result["users"][0]["secretName"] == "admin-secret"
        assert result["adminPolicy"]["timeout"] == 5000

    def test_with_empty_lists(self):
        acl = SimpleNamespace(roles=None, users=None, admin_policy_timeout=1000)
        result = _build_acl_dict(acl)
        assert result["roles"] == []
        assert result["users"] == []
        assert result["adminPolicy"]["timeout"] == 1000


class TestBuildBandwidthDict:
    def test_both_set(self):
        bw = SimpleNamespace(ingress="100Mbps", egress="50Mbps")
        result = _build_bandwidth_dict(bw)
        assert result == {"ingress": "100Mbps", "egress": "50Mbps"}

    def test_ingress_only(self):
        bw = SimpleNamespace(ingress="100Mbps", egress=None)
        result = _build_bandwidth_dict(bw)
        assert result == {"ingress": "100Mbps"}

    def test_empty(self):
        bw = SimpleNamespace(ingress=None, egress=None)
        result = _build_bandwidth_dict(bw)
        assert result == {}


class TestBuildRackConfigDict:
    def test_minimal(self):
        rack = SimpleNamespace(
            id=1,
            zone=None,
            region=None,
            rack_label=None,
            node_name=None,
            aerospike_config=None,
            storage=None,
            pod_spec=None,
            revision=None,
        )
        rack_config = SimpleNamespace(
            racks=[rack],
            namespaces=None,
            scale_down_batch_size=None,
            max_ignorable_pods=None,
            rolling_update_batch_size=None,
        )
        result = _build_rack_config_dict(rack_config)
        assert result["racks"] == [{"id": 1}]
        assert "namespaces" not in result

    def test_with_all_fields(self):
        rack = SimpleNamespace(
            id=1,
            zone="us-east-1a",
            region=None,
            rack_label=None,
            node_name=None,
            aerospike_config=None,
            storage=None,
            pod_spec=None,
            revision=None,
        )
        rack_config = SimpleNamespace(
            racks=[rack],
            namespaces=["test"],
            scale_down_batch_size=2,
            max_ignorable_pods=1,
            rolling_update_batch_size=3,
        )
        result = _build_rack_config_dict(rack_config)
        assert result["namespaces"] == ["test"]
        assert result["scaleDownBatchSize"] == 2
        assert result["maxIgnorablePods"] == 1
        assert result["rollingUpdateBatchSize"] == 3

    def test_with_revision(self):
        rack = SimpleNamespace(
            id=2,
            zone=None,
            region=None,
            rack_label=None,
            node_name=None,
            aerospike_config=None,
            storage=None,
            pod_spec=None,
            revision="my-cluster-6b8f9c4d77",
        )
        rack_config = SimpleNamespace(
            racks=[rack],
            namespaces=None,
            scale_down_batch_size=None,
            max_ignorable_pods=None,
            rolling_update_batch_size=None,
        )
        result = _build_rack_config_dict(rack_config)
        assert result["racks"] == [{"id": 2, "revision": "my-cluster-6b8f9c4d77"}]


class TestBuildServiceMetadataDict:
    def test_with_both(self):
        svc = SimpleNamespace(annotations={"a": "b"}, labels={"l": "v"})
        result = _build_service_metadata_dict(svc)
        assert result == {"metadata": {"annotations": {"a": "b"}, "labels": {"l": "v"}}}

    def test_annotations_only(self):
        svc = SimpleNamespace(annotations={"a": "b"}, labels=None)
        result = _build_service_metadata_dict(svc)
        assert result == {"metadata": {"annotations": {"a": "b"}}}

    def test_empty(self):
        svc = SimpleNamespace(annotations=None, labels=None)
        result = _build_service_metadata_dict(svc)
        assert result == {"metadata": {}}


class TestBuildTemplateSchedulingDict:
    def test_full(self):
        sched = SimpleNamespace(
            pod_anti_affinity_level="rack",
            pod_management_policy="Parallel",
            tolerations=[{"key": "k", "operator": "Exists"}],
            node_affinity={"required": {}},
            topology_spread_constraints=[{"maxSkew": 1}],
        )
        result = _build_template_scheduling_dict(sched)
        assert result["podAntiAffinityLevel"] == "rack"
        assert result["podManagementPolicy"] == "Parallel"
        assert result["tolerations"] == [{"key": "k", "operator": "Exists"}]

    def test_empty(self):
        sched = SimpleNamespace(
            pod_anti_affinity_level=None,
            pod_management_policy=None,
            tolerations=None,
            node_affinity=None,
            topology_spread_constraints=None,
        )
        result = _build_template_scheduling_dict(sched)
        assert result == {}


class TestBuildTemplateStorageDict:
    def test_full(self):
        stor = SimpleNamespace(
            storage_class_name="standard",
            volume_mode="Filesystem",
            access_modes=["ReadWriteOnce"],
            size="10Gi",
            local_pv_required=True,
        )
        result = _build_template_storage_dict(stor)
        assert result["storageClassName"] == "standard"
        assert result["volumeMode"] == "Filesystem"
        assert result["resources"] == {"requests": {"storage": "10Gi"}}
        assert result["localPVRequired"] is True

    def test_empty(self):
        stor = SimpleNamespace(
            storage_class_name=None,
            volume_mode=None,
            access_modes=None,
            size=None,
            local_pv_required=None,
        )
        result = _build_template_storage_dict(stor)
        assert result == {}


class TestBuildTemplateNetworkConfigDict:
    def test_full(self):
        net = SimpleNamespace(
            heartbeat_mode="mesh",
            heartbeat_port=3002,
            heartbeat_interval=150,
            heartbeat_timeout=10,
        )
        result = _build_template_network_config_dict(net)
        assert result == {
            "heartbeatMode": "mesh",
            "heartbeatPort": 3002,
            "heartbeatInterval": 150,
            "heartbeatTimeout": 10,
        }

    def test_empty(self):
        net = SimpleNamespace(
            heartbeat_mode=None,
            heartbeat_port=None,
            heartbeat_interval=None,
            heartbeat_timeout=None,
        )
        result = _build_template_network_config_dict(net)
        assert result == {}


class TestBuildUpdatePatchContainerSecurityContext:
    def test_security_context_only(self):
        body = UpdateK8sClusterRequest(aerospikeContainerSecurityContext={"runAsUser": 1000, "privileged": False})
        result = build_update_patch(body)
        assert result["spec"]["podSpec"]["aerospikeContainer"]["securityContext"] == {
            "runAsUser": 1000,
            "privileged": False,
        }

    def test_security_context_with_resources(self):
        """Verify security context and resources coexist in aerospikeContainer."""
        body = UpdateK8sClusterRequest(
            resources={"requests": {"cpu": "100m", "memory": "256Mi"}},
            aerospikeContainerSecurityContext={"runAsNonRoot": True},
        )
        result = build_update_patch(body)
        aero = result["spec"]["podSpec"]["aerospikeContainer"]
        assert "resources" in aero
        assert aero["securityContext"] == {"runAsNonRoot": True}

    def test_no_security_context(self):
        body = UpdateK8sClusterRequest(size=3)
        result = build_update_patch(body)
        assert "aerospikeContainer" not in result["spec"].get("podSpec", {})
