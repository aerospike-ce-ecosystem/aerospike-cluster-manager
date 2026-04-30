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
2. If missing, install the [Aerospike CE Kubernetes Operator](https://github.com/aerospike-ce-ecosystem/aerospike-ce-kubernetes-operator) which registers the required CRDs.

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

**Symptoms:** The migration card shows remaining partitions, but no scaling or restart operation is in progress.

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

## CORS Configuration Issues

### Frontend cannot reach the backend API

**Symptoms:** Browser console shows CORS errors, API requests fail with `No 'Access-Control-Allow-Origin' header` messages.

**Possible causes and solutions:**

1. **CORS_ORIGINS not configured** -- The `CORS_ORIGINS` environment variable must include the frontend URL. For local development, this is typically `http://localhost:3000,http://localhost:3100`.
   ```bash
   CORS_ORIGINS=http://localhost:3100,https://your-domain.example.com
   ```

2. **Protocol mismatch** -- Ensure the origin includes the correct protocol (`http` vs `https`). `http://example.com` and `https://example.com` are treated as different origins.

3. **Port mismatch** -- If the frontend is served on a non-standard port, include the full `host:port` in `CORS_ORIGINS`.

4. **Behind a reverse proxy** -- When deployed behind a reverse proxy (e.g., Nginx, Traefik), the proxy's forwarded origin must match one of the `CORS_ORIGINS` entries.

## Pod Log Streaming Issues

### Pod logs return empty or timeout

**Symptoms:** The pod logs viewer shows no content, or the request times out.

**Possible causes and solutions:**

1. **Container not started** -- If the pod is in `Pending` or `ContainerCreating` phase, no logs are available yet. Wait for the pod to reach `Running` state.

2. **Wrong container name** -- Multi-container pods (e.g., with sidecar exporters) require specifying the correct container name. The logs viewer defaults to the first container if none is specified.

3. **Timeout too short** -- Pod log streaming uses the `K8S_LOG_TIMEOUT` setting (default: 30 seconds). For large log volumes, increase this value:
   ```bash
   K8S_LOG_TIMEOUT=60
   ```

4. **RBAC missing** -- The service account needs `get` permission on `pods/log` resources. Verify:
   ```bash
   kubectl auth can-i get pods/log -n <namespace> --as=system:serviceaccount:<sa-namespace>:<sa-name>
   ```

## K8s API Timeout Errors

### Operations fail with timeout errors

**Symptoms:** K8s operations (list, create, patch) fail intermittently with timeout messages.

**Possible causes and solutions:**

1. **Slow API server** -- In large clusters, the Kubernetes API server may take longer to respond. Increase `K8S_API_TIMEOUT`:
   ```bash
   K8S_API_TIMEOUT=30
   ```

2. **Network latency** -- When the backend runs outside the cluster (e.g., via kubeconfig), network latency adds to API call duration. Consider deploying the backend inside the cluster.

3. **Too many resources** -- Listing all clusters or templates across many namespaces can be slow. Check the Kubernetes API server performance and consider namespace-scoped queries.

## Database Connection Pool Exhaustion

### Backend becomes unresponsive under load

**Symptoms:** API requests hang or return 500 errors. Backend logs show "connection pool exhausted" messages.

**Possible causes and solutions:**

1. **Pool too small** -- The default pool max size is 10 connections. Under high concurrency, this may be insufficient. Increase `DB_POOL_MAX_SIZE`:
   ```bash
   DB_POOL_MAX_SIZE=20
   ```

2. **Long-running queries** -- Queries that exceed `DB_COMMAND_TIMEOUT` (default: 30 seconds) are cancelled but may hold connections. Investigate slow queries in PostgreSQL.

3. **Connection leaks** -- If the backend is crashing and restarting, stale connections may accumulate. Restart PostgreSQL or configure idle connection cleanup in `pg_hba.conf`.

## SQLite Issues

### SQLite file permission errors

**Symptoms:** Backend fails to start with "unable to open database file" or "readonly database" errors.

**Possible causes and solutions:**

1. **Directory does not exist** -- The parent directory for the SQLite file must exist. The backend does not create parent directories automatically.
   ```bash
   mkdir -p ./data
   ```

2. **Incorrect ownership in container** -- When running in a container, the volume mount must be writable by the container user. For Podman, use the `:U` flag to remap ownership:
   ```bash
   podman run -v ~/.aerospike-cluster-manager:/app/data:U ...
   ```

3. **Read-only filesystem** -- Ensure the volume is not mounted as read-only. Check your compose file or `podman run` command for `:ro` flags on the data volume.

### WAL mode lock issues

**Symptoms:** Backend logs show "database is locked" errors under concurrent access.

**Possible causes and solutions:**

1. **Network filesystem** -- SQLite WAL mode does not work reliably on network filesystems (NFS, CIFS, SMB). Use a local filesystem for the SQLite database file, or switch to PostgreSQL for shared storage.

2. **Multiple processes** -- SQLite supports a single writer at a time. If multiple backend processes are writing simultaneously (e.g., multiple Gunicorn workers), consider either reducing to a single worker or switching to PostgreSQL.

3. **Stale lock file** -- If the backend crashed while holding a write lock, a `-wal` or `-shm` file may be left behind. These are normally cleaned up on the next connection. If the database remains locked, stop all backend processes and delete the `-wal` and `-shm` files alongside the database file, then restart.

## PostgreSQL Connection Pool Exhaustion

### Backend becomes unresponsive under load (PostgreSQL)

**Symptoms:** API requests hang or return 500 errors. Backend logs show "connection pool exhausted" or "too many connections" messages.

**Possible causes and solutions:**

1. **Pool too small** -- The default pool max size is 10 connections. Under high concurrency, this may be insufficient. Increase `DB_POOL_MAX_SIZE`:
   ```bash
   DB_POOL_MAX_SIZE=20
   ```

2. **Long-running queries** -- Queries that exceed `DB_COMMAND_TIMEOUT` (default: 30 seconds) are cancelled but may hold connections briefly. Investigate slow queries in PostgreSQL logs.

3. **Connection leaks** -- If the backend crashes and restarts repeatedly, stale connections may accumulate in PostgreSQL. Monitor active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'aerospike_manager';
   ```

4. **PostgreSQL max_connections limit** -- The PostgreSQL server itself has a `max_connections` limit (default: 100). Ensure `DB_POOL_MAX_SIZE` multiplied by the number of backend replicas does not exceed this limit.

## Database Migration (SQLite to PostgreSQL)

### Migrating from SQLite to PostgreSQL

When scaling from a single-instance deployment to a multi-replica setup, you may need to migrate data from SQLite to PostgreSQL.

**Steps:**

1. **Export data from SQLite** -- Use the SQLite CLI to dump connection profiles:
   ```bash
   sqlite3 ./data/connections.db ".dump connections" > connections_dump.sql
   ```

2. **Create the PostgreSQL database** -- Ensure the target database exists:
   ```bash
   psql -h <host> -U <user> -c "CREATE DATABASE aerospike_manager;"
   ```

3. **Start the backend with PostgreSQL** -- Set `ENABLE_POSTGRES=true` and `DATABASE_URL` to point to the new database. The backend will create the required tables on startup.

4. **Re-create connection profiles** -- Connection profiles can be re-created via the UI or by importing a previously exported JSON backup. The SQLite and PostgreSQL schemas are identical, but SQL dialect differences (e.g., autoincrement syntax) make direct SQL import unreliable. Using the application-level import/export feature is the safest approach.

### Migrating from PostgreSQL to SQLite

To simplify a deployment by removing the PostgreSQL dependency:

1. Export connection profiles from the UI using the export feature.
2. Stop the api and remove the `ENABLE_POSTGRES` and `DATABASE_URL` environment variables (or set `ENABLE_POSTGRES=false`).
3. Restart the api -- it will create a fresh SQLite database.
4. Import the connection profiles via the UI.

## Split-Brain Detection

### Cluster health reports split-brain detected

**Symptoms:** The cluster health dashboard shows `splitBrainDetected: true` even though the cluster appears to be running normally.

**Possible causes and solutions:**

1. **Actual split-brain** -- Network partitions can cause Aerospike nodes to form separate sub-clusters. Each sub-cluster thinks it is the full cluster, leading to data inconsistency. Check Aerospike server logs for heartbeat timeout messages and verify network connectivity between all pods:
   ```bash
   kubectl exec -n <namespace> <pod-name> -- asinfo -v "cluster-stable:"
   ```

2. **Stale status** -- The operator may not have updated the `aerospikeClusterSize` field after a recent topology change. Wait for the next reconciliation cycle or trigger a force reconcile from the config drift card.

3. **Node rejoining** -- If a node recently restarted or rejoined, the reported cluster size may temporarily lag behind the actual cluster state. The split-brain flag should clear on the next health poll once all nodes converge.

**Note:** Split-brain detection is intentionally suppressed during transitional phases (`InProgress`, `ScalingUp`, `ScalingDown`, `RollingRestart`, etc.) and when not all expected pods are ready, to avoid false positives.

## Circuit Breaker Stuck

### Circuit breaker tripped and cluster is not reconciling

**Symptoms:** The reconciliation health dashboard shows "Circuit Breaker Active" with a "TRIPPED" badge. The operator is not attempting to reconcile the cluster.

**Possible causes and solutions:**

1. **Repeated reconciliation failures** -- The operator trips the circuit breaker after reaching the failure threshold to prevent rapid retry loops. Check the "Last reconcile error" field in the health card for the root cause (e.g., invalid CR spec, missing secrets, storage provisioning errors).

2. **Transient issue resolved** -- If the underlying issue has been fixed (e.g., a missing secret was created, a node came back online), click the **Reset Circuit Breaker** button on the reconciliation health card or call the API directly:
   ```bash
   curl -X POST http://<api>/api/k8s/clusters/<namespace>/<name>/reset-circuit-breaker
   ```

3. **Persistent configuration error** -- If the circuit breaker keeps tripping after reset, the CR likely has a configuration that the operator cannot reconcile. Check the operator pod logs for detailed error messages and fix the CR spec.

## Orphaned PVCs

### PVC status shows orphaned volumes after scale-down

**Symptoms:** The PVC status panel shows PVCs with an amber "(orphan)" indicator after scaling down the cluster.

**Possible causes and solutions:**

1. **Expected behavior** -- Kubernetes StatefulSet PVCs are intentionally retained after scale-down to preserve data. If you scale back up, the PVCs will be reattached to the new pods automatically.

2. **Manual cleanup needed** -- If the scale-down is permanent and you want to reclaim storage, delete the orphaned PVCs manually:
   ```bash
   kubectl delete pvc <pvc-name> -n <namespace>
   ```

3. **Cascade delete enabled** -- If `cascadeDelete` is enabled on the storage volume configuration, PVCs should be cleaned up automatically when the cluster is deleted. However, scale-down does not trigger cascade deletion -- only full cluster deletion does.

## General Tips

- **Check api logs** -- The API logs detailed error information. Set `LOG_LEVEL=DEBUG` for verbose output.
- **Use the health endpoint** -- `GET /api/health?detail=true` returns component-level health status including database connectivity.
- **Verify environment variables** -- Many issues stem from misconfigured environment variables. Double-check `K8S_MANAGEMENT_ENABLED`, `DATABASE_URL`, and `CORS_ORIGINS`. See the [Architecture Guide](./architecture.md#environment-configuration) for the full variable reference.
- **Inspect Kubernetes events** -- The events timeline in the UI (or `kubectl get events`) provides operator-level diagnostic information.
- **Check operator logs** -- For K8s management issues, the operator logs often contain the root cause. Look at the operator pod logs in the operator's namespace.
- **Tune timeouts** -- For slow environments, adjust `K8S_API_TIMEOUT`, `K8S_LOG_TIMEOUT`, and `DB_COMMAND_TIMEOUT` as needed.
