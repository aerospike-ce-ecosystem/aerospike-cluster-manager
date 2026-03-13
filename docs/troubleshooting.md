# Troubleshooting Guide

Common issues and their solutions when running the Aerospike Cluster Manager.

## Connection Issues

### Cannot connect to Aerospike cluster

**Symptoms:** Connection health check fails, "Connection refused" or "Timeout" errors.

**Possible causes and solutions:**

1. **Aerospike server not running** -- Verify the Aerospike server is running and reachable from the backend container/process.
   ```bash
   # Check if Aerospike is listening on the expected port
   nc -zv <AEROSPIKE_HOST> <AEROSPIKE_PORT>
   ```

2. **Wrong host or port** -- Verify the connection profile has the correct host and port. The default Aerospike service port is `3000`. If using the development compose setup, the mapped port may differ (e.g., `3100` or another port).

3. **Network isolation** -- When running in Podman Compose, ensure the backend and Aerospike containers are on the same network. Check `compose.yaml` for network configuration.
   ```bash
   podman network ls
   podman inspect <container> | grep NetworkMode
   ```

4. **Cluster name mismatch** -- If the Aerospike server has a `cluster-name` configured, the connection profile must specify the same cluster name. A mismatch causes the client to reject the connection silently.

5. **Firewall or security group rules** -- Ensure ports `3000` (service), `3001` (fabric), and `3002` (heartbeat) are open between the backend and Aerospike nodes.

### Connection works but data operations fail

**Symptoms:** Connection health check succeeds, but record reads/writes return errors.

**Possible causes and solutions:**

1. **ACL enabled but credentials not provided** -- If the Aerospike server has security enabled, the connection profile must include valid username and password.

2. **Namespace does not exist** -- Verify the target namespace exists on the server. Use the AQL terminal or cluster overview to check available namespaces.

3. **Storage full** -- Check namespace memory/device usage in the cluster dashboard. Aerospike stops writes when high-water-mark thresholds are reached.

## K8s Management Not Working

### K8s management features are not visible

**Symptoms:** No "K8s" section in the navigation, K8s API endpoints return 404.

**Solution:** Set the `K8S_MANAGEMENT_ENABLED=true` environment variable on the backend. This flag gates all Kubernetes management endpoints. When disabled, the backend returns 404 for all `/api/k8s/*` routes, and the frontend hides K8s navigation items.

```bash
# In your compose.yaml or deployment manifest
K8S_MANAGEMENT_ENABLED=true
```

### K8s API returns 403 Forbidden

**Symptoms:** K8s endpoints return 403 errors, "forbidden" messages in backend logs.

**Solution:** The backend's service account lacks the required RBAC permissions. Ensure the service account has permissions to manage the following resources:

- `aerospikeclusters.acko.io` -- get, list, watch, create, update, patch, delete
- `aerospikeclustertemplates.acko.io` -- get, list, watch, create, update, patch, delete
- `pods` -- get, list, watch, delete (for pod operations and log retrieval)
- `events` -- get, list, watch (for the events timeline)
- `namespaces` -- get, list (for namespace picker)
- `storageclasses.storage.k8s.io` -- get, list (for storage class picker)
- `secrets` -- get, list (for ACL secret picker)
- `nodes` -- get, list (for node info in rack configuration)
- `horizontalpodautoscalers.autoscaling` -- get, list, create, update, delete (for HPA management)

See the [Architecture Guide](./architecture.md) for a complete RBAC configuration example.

### Cannot create or modify AerospikeCluster resources

**Symptoms:** Create/update operations fail with "not found" or "no matches for kind" errors.

**Solution:** The Aerospike CE Kubernetes Operator CRDs are not installed. Install the operator first:

1. Verify CRDs exist:
   ```bash
   kubectl get crd aerospikeclusters.acko.io
   kubectl get crd aerospikeclustertemplates.acko.io
   ```
2. If missing, install the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator) which registers the required CRDs.

## PostgreSQL Connection Errors

### Backend fails to start with database errors

**Symptoms:** Backend logs show "connection refused" or "database does not exist" errors on startup.

**Possible causes and solutions:**

1. **PostgreSQL not running** -- Ensure the PostgreSQL instance is running and reachable.
   ```bash
   podman ps | grep postgres
   ```

2. **Wrong DATABASE_URL** -- Verify the `DATABASE_URL` environment variable matches your PostgreSQL connection details:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/database_name
   ```

3. **Database not created** -- The database specified in `DATABASE_URL` must exist. Create it if needed:
   ```bash
   psql -h <host> -U <user> -c "CREATE DATABASE aerospike_manager;"
   ```

4. **Authentication failure** -- Verify the username and password in `DATABASE_URL` are correct. Check PostgreSQL's `pg_hba.conf` if using host-based authentication.

5. **Network access** -- When running in Podman Compose, ensure the backend container can reach PostgreSQL. Both should be on the same network, or PostgreSQL should be accessible via the service name defined in `compose.yaml`.

## Migration Status Not Showing

### Migration status card shows "Unknown"

**Symptoms:** The migration status card displays "Unknown" instead of "No Active Migration" or actual migration progress.

**Possible causes and solutions:**

1. **Older operator version** -- The `status.migrationStatus` field in the AerospikeCluster CR is only available in operator versions that support migration reporting. Upgrade the Aerospike CE Kubernetes Operator to a version that populates this field.

2. **Operator not reconciling** -- If the operator is not running or the cluster is paused, migration status will not be updated. Check operator pod status:
   ```bash
   kubectl get pods -n <operator-namespace> -l app=aerospike-operator
   ```

3. **CR status not populated** -- Verify the CR has a `status.migrationStatus` field:
   ```bash
   kubectl get aerospikecluster <name> -n <namespace> -o jsonpath='{.status.migrationStatus}'
   ```
   If the field is empty or absent, the operator does not support migration status reporting for this cluster.

### Migration status shows active but cluster appears idle

**Symptoms:** The migration card shows remaining records, but no scaling or restart operation is in progress.

**Possible causes and solutions:**

1. **Stale status** -- The operator may not have cleared the migration status after migration completed. Try triggering a manual reconciliation by modifying and reverting a harmless annotation on the CR.

2. **Background rebalancing** -- Aerospike may be performing internal rebalancing due to temporary node unavailability or network partitions. Check the Aerospike server logs for migration-related messages.

## Pod Operations Failing

### Warm restart or pod restart operations fail

**Symptoms:** Operation triggers but pods show as "Failed" in the progress tracker.

**Possible causes and solutions:**

1. **RBAC issues** -- The service account needs `delete` permission on `pods` to perform pod restarts, and the operator must have permission to perform warm restarts via the CR annotation mechanism. See the RBAC section above.

2. **Pod disruption budget** -- A PodDisruptionBudget (PDB) may be preventing pod deletion. Check if a PDB is blocking the operation:
   ```bash
   kubectl get pdb -n <namespace>
   kubectl describe pdb <pdb-name> -n <namespace>
   ```

3. **Operator not responding** -- Warm restarts depend on the operator processing an annotation change. If the operator is paused, overloaded, or in a circuit breaker state, it may not process the restart request. Check the reconciliation health dashboard for circuit breaker status.

4. **Resource constraints** -- If the cluster is running at resource limits, restarted pods may fail to schedule. Check for pending pods:
   ```bash
   kubectl get pods -n <namespace> -o wide | grep Pending
   kubectl describe pod <pending-pod> -n <namespace>
   ```

### Scale operations hang

**Symptoms:** Cluster stays in "ScalingUp" or "ScalingDown" phase indefinitely.

**Possible causes and solutions:**

1. **Insufficient cluster resources** -- Scale-up may fail if there are not enough nodes, CPU, or memory in the Kubernetes cluster. Check events:
   ```bash
   kubectl get events -n <namespace> --sort-by='.lastTimestamp'
   ```

2. **Migration not completing** -- Scale-down waits for data migration to finish. If migration is stuck, check per-pod migration status in the UI and Aerospike server logs for errors.

3. **Storage provisioning failure** -- PVC creation may fail if the StorageClass is misconfigured or storage capacity is exhausted. Check PVC status:
   ```bash
   kubectl get pvc -n <namespace>
   kubectl describe pvc <pvc-name> -n <namespace>
   ```

## General Tips

- **Check backend logs** -- The backend logs detailed error information. Set `LOG_LEVEL=DEBUG` for verbose output.
- **Use the health endpoint** -- `GET /api/health?detail=true` returns component-level health status including database connectivity.
- **Verify environment variables** -- Many issues stem from misconfigured environment variables. Double-check `K8S_MANAGEMENT_ENABLED`, `DATABASE_URL`, and `CORS_ORIGINS`.
- **Inspect Kubernetes events** -- The events timeline in the UI (or `kubectl get events`) provides operator-level diagnostic information.
- **Check operator logs** -- For K8s management issues, the operator logs often contain the root cause. Look at the operator pod logs in the operator's namespace.
