"""Storage and volume related K8s models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AerospikeNamespaceStorage(BaseModel):
    model_config = {"populate_by_name": True}

    type: Literal["memory", "device"] = Field(default="memory", description="memory or device")
    data_size: int | None = Field(default=1073741824, alias="dataSize", description="For memory type, in bytes")
    file: str | None = Field(default=None, description="For device type, data file path")
    filesize: int | None = Field(default=None, description="For device type, max data file size in bytes")


class AerospikeNamespaceConfig(BaseModel):
    model_config = {"populate_by_name": True}

    name: str = Field(default="test", min_length=1, max_length=63)
    replication_factor: int = Field(default=1, ge=1, le=8, alias="replicationFactor")
    storage_engine: AerospikeNamespaceStorage = Field(default_factory=AerospikeNamespaceStorage, alias="storageEngine")


class StorageVolumeConfig(BaseModel):
    """Legacy single-volume storage config. Kept for backward compatibility."""

    model_config = {"populate_by_name": True}

    storage_class: str = Field(default="standard", alias="storageClass")
    size: str = Field(default="10Gi", pattern=r"^[0-9]+[KMGTPE]i$")
    mount_path: str = Field(default="/opt/aerospike/data", alias="mountPath")
    init_method: Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup"] | None = Field(
        default=None, alias="initMethod", description="Volume initialization method"
    )
    wipe_method: (
        Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup", "blkdiscardWithHeaderCleanup"] | None
    ) = Field(default=None, alias="wipeMethod", description="Volume wipe method for dirty volumes")
    cascade_delete: bool = Field(default=True, alias="cascadeDelete", description="Delete PVCs on CR deletion")
    cleanup_threads: int | None = Field(
        default=None, ge=1, alias="cleanupThreads", description="Number of threads for storage cleanup operations"
    )
    filesystem_volume_policy: dict | None = Field(
        default=None,
        alias="filesystemVolumePolicy",
        description="Policy for filesystem volume initialization (e.g. initMethod, wipeMethod defaults)",
    )
    block_volume_policy: dict | None = Field(
        default=None,
        alias="blockVolumePolicy",
        description="Policy for block volume initialization (e.g. initMethod, wipeMethod defaults)",
    )


# ---------------------------------------------------------------------------
# Multi-volume storage models (matching the operator CRD)
# ---------------------------------------------------------------------------


class VolumeAttachment(BaseModel):
    """Volume mount for sidecar or init containers."""

    model_config = {"populate_by_name": True}

    container_name: str = Field(alias="containerName")
    path: str
    read_only: bool = Field(default=False, alias="readOnly")
    sub_path: str | None = Field(default=None, alias="subPath")
    sub_path_expr: str | None = Field(default=None, alias="subPathExpr")
    mount_propagation: str | None = Field(default=None, alias="mountPropagation")


class AerospikeVolumeAttachment(BaseModel):
    """Volume mount config for the main Aerospike container."""

    model_config = {"populate_by_name": True}

    path: str
    read_only: bool = Field(default=False, alias="readOnly")
    sub_path: str | None = Field(default=None, alias="subPath")
    sub_path_expr: str | None = Field(default=None, alias="subPathExpr")
    mount_propagation: str | None = Field(default=None, alias="mountPropagation")


class PersistentVolumeClaimSource(BaseModel):
    """PVC source fields for a volume."""

    model_config = {"populate_by_name": True}

    storage_class: str | None = Field(default=None, alias="storageClass")
    size: str = Field(default="1Gi", pattern=r"^[0-9]+[KMGTPE]i$")
    access_modes: list[str] = Field(default_factory=lambda: ["ReadWriteOnce"], alias="accessModes")
    volume_mode: Literal["Filesystem", "Block"] = Field(default="Filesystem", alias="volumeMode")
    labels: dict[str, str] | None = None
    annotations: dict[str, str] | None = None
    selector: dict | None = None


class VolumeSpec(BaseModel):
    """A single named volume definition matching the operator CRD VolumeSpec."""

    model_config = {"populate_by_name": True}

    name: str = Field(min_length=1, max_length=63)
    source: Literal["persistentVolume", "emptyDir", "secret", "configMap", "hostPath"] = Field(
        default="persistentVolume", description="Volume source type"
    )
    # Source-specific fields
    persistent_volume: PersistentVolumeClaimSource | None = Field(default=None, alias="persistentVolume")
    empty_dir: dict | None = Field(default=None, alias="emptyDir")
    secret: dict | None = None
    config_map: dict | None = Field(default=None, alias="configMap")
    host_path: dict | None = Field(default=None, alias="hostPath")
    # Mount config
    aerospike: AerospikeVolumeAttachment | None = None
    sidecars: list[VolumeAttachment] | None = None
    init_containers: list[VolumeAttachment] | None = Field(default=None, alias="initContainers")
    # Lifecycle
    init_method: Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup"] | None = Field(
        default=None, alias="initMethod"
    )
    wipe_method: (
        Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup", "blkdiscardWithHeaderCleanup"] | None
    ) = Field(default=None, alias="wipeMethod")
    cascade_delete: bool = Field(default=False, alias="cascadeDelete")


class StorageSpec(BaseModel):
    """Full multi-volume storage specification matching the operator CRD."""

    model_config = {"populate_by_name": True}

    volumes: list[VolumeSpec] = Field(default_factory=list)
    filesystem_volume_policy: dict | None = Field(default=None, alias="filesystemVolumePolicy")
    block_volume_policy: dict | None = Field(default=None, alias="blockVolumePolicy")
    cleanup_threads: int | None = Field(default=None, ge=1, alias="cleanupThreads")
    local_storage_classes: list[str] | None = Field(default=None, alias="localStorageClasses")
    delete_local_storage_on_restart: bool = Field(default=False, alias="deleteLocalStorageOnRestart")


class TemplateStorageConfig(BaseModel):
    """Storage defaults for a template."""

    model_config = {"populate_by_name": True}

    storage_class_name: str | None = Field(default=None, alias="storageClassName")
    volume_mode: Literal["Filesystem", "Block"] | None = Field(default=None, alias="volumeMode")
    access_modes: list[str] | None = Field(default=None, alias="accessModes")
    size: str | None = Field(default=None, description="Default volume size (e.g. 10Gi)")
    local_pv_required: bool | None = Field(
        default=None, alias="localPVRequired", description="Whether local PV is required"
    )
