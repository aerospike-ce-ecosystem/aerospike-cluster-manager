# Aerospike Data Management Guide

This guide covers the data-oriented features of the Aerospike Cluster Manager for interacting with Aerospike clusters directly.

## Connection Management

The home page (`/`) displays all saved connection profiles. Each connection is represented by a color-coded card with a live health indicator.

### Connection Profiles

Each profile stores:

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Display name for the connection |
| Hosts | Yes | One or more Aerospike server hostnames |
| Port | Yes | Aerospike service port (default: 3000) |
| Cluster Name | No | Expected cluster name for validation |
| Username | No | Authentication username (when ACL is enabled) |
| Password | No | Authentication password |
| Color | Yes | Color indicator for the sidebar |

### Operations

- **Create** -- Add a new connection profile with the connection form dialog.
- **Edit** -- Modify an existing connection's settings.
- **Delete** -- Remove a connection profile and close its cached client.
- **Test Connection** -- Validate connectivity without saving the profile. Reports node count, namespace count, server build, and edition.
- **Health Check** -- Continuous health polling in the sidebar (configurable interval).
- **Import / Export** -- Share connection profiles across team members via JSON export/import.

## Cluster Dashboard

The cluster overview page (`/cluster/{connId}`) shows:

- **Node list** -- All nodes in the cluster with address, port, build version, edition, and cluster size.
- **Namespace summary** -- Namespace count, memory/device usage, replication factor, and HWM thresholds.
- **Set browsing** -- Navigate into sets within each namespace to see object counts and tombstone counts.
- **Real-time metrics** -- TPS charts, client connections, memory/device usage time series (10-minute rolling history).

## Record Browser

The record browser (`/browser/{connId}`) provides a spreadsheet-like data grid for browsing Aerospike records.

### Navigation

1. Select a namespace from the namespace list.
2. Select a set within the namespace.
3. Records are displayed in a paginated data grid with configurable page size (up to 500).

### CRUD Operations

- **Create** -- Add new records with arbitrary bins (string, integer, float, list, map, bytes). Supports TTL configuration.
- **Edit** -- Modify existing records inline or via an editor dialog.
- **Duplicate** -- Clone a record with a new primary key.
- **Delete** -- Remove individual records by primary key.
- **View** -- Inspect full record details including metadata (generation, TTL, key digest).

### Filtered Scan

Scan records with expression-based filters:

- Filter by bin value, type, or metadata.
- Select specific bins to return (reduces network transfer).
- Combine multiple filter conditions.

### Batch Read

Retrieve multiple records by primary key in a single request. Enter a list of primary keys and the batch read returns all matching records.

## Query Builder

The Query Builder is not a separate route -- it is accessed via the **query toolbar** on the Record Browser page (`/browser/{connId}`). It supports three query strategies:

1. **Primary Key Lookup** -- Direct record retrieval by namespace, set, and primary key. Integer keys are auto-detected.
2. **Predicate Query** -- Filter records using secondary index predicates (equality match, range query) on indexed bins.
3. **Full Scan** -- Scan all records in a namespace/set with optional bin selection and max record limits.

All strategies support:
- **Expression Filters** -- Server-side expression filters for additional conditions.
- **Bin Selection** -- Choose specific bins to return.
- **Execution Stats** -- View execution time, scanned record count, and returned record count.

## Secondary Index Management

The indexes page (`/indexes/{connId}`) manages secondary indexes on Aerospike bins.

- **Create Index** -- Define indexes on numeric, string, or geo2dsphere bin types for any namespace/set/bin combination.
- **Delete Index** -- Remove indexes by name from a given namespace.
- **Index State** -- View index status (ready, building, error) across all namespaces.

## User & Role Management (ACL)

The admin page (`/admin/{connId}`) manages Aerospike access control lists. Requires security to be enabled in `aerospike.conf`.

### Users

- List all users with assigned roles, read/write quotas, and active connection counts.
- Create new users with username, password, and role assignments.
- Change user passwords.
- Delete users.

### Roles

- List all roles with privileges, IP allowlists, and quotas.
- Create roles with granular privileges (per-namespace, per-set permissions) and CIDR-based allowlists.
- Delete unused roles.

A CE limitation banner is shown when security features are not available.

## UDF Management

The UDFs page (`/udfs/{connId}`) manages Lua User-Defined Functions:

- **List** -- View all registered UDF modules with filename, type, and content hash.
- **Upload** -- Register a new Lua UDF module by pasting script content in the browser.
- **Delete** -- Remove a registered UDF module by filename.

## Prometheus Metrics & Monitoring

The cluster dashboard provides real-time metrics with historical time-series data:

- **TPS Charts** -- Read and write transactions per second (10-minute rolling history).
- **Client Connections** -- Active connection count over time.
- **Memory Usage** -- Per-namespace memory utilization (used vs total).
- **Device Usage** -- Per-namespace device/SSD utilization.
- **Read/Write Success Rates** -- Cumulative success and error counts per namespace.
- **Uptime** -- Cluster uptime aggregated across nodes.

## Sample Data Generator

Generate deterministic sample data for testing and demonstration:

- **Record Generation** -- Create a configurable number of sample records in any namespace/set.
- **Secondary Indexes** -- Optionally create indexes on sample data bins.

## Settings

The settings page (`/settings`) provides:

- **Theme** -- Light, Dark, or System theme selection.
- **CE Limitations** -- Reference card showing Aerospike Community Edition restrictions (max nodes, namespaces, data capacity, durable deletes, XDR).
- **About** -- Application version and framework information.
- **Keyboard Shortcuts** -- `Cmd+B` (toggle sidebar).

## See also

- [Architecture Overview](./architecture.md)
- [Kubernetes Cluster Management Guide](./k8s-management.md)
