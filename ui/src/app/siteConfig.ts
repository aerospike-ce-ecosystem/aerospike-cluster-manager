export const siteConfig = {
  name: "Aerospike Cluster Manager",
  url: "",
  description: "Operational dashboard for Aerospike CE clusters.",
  baseLinks: {
    home: "/",
    clusters: "/clusters",
    guides: "/guides",
    ackoTemplates: "/acko/templates",
  },
} as const

// namespace / set / key are user-controlled Aerospike names and may contain
// characters that are unsafe inside a URL path ("/", "?", "#", "%", spaces).
// Callers always pass raw (decoded) values; the builders encode each segment.
// Pages reading these segments back from route params must decode them
// (safeDecodeURIComponent) before use — App Router params arrive encoded.
export const clusterSections = {
  overview: (clusterId: string) => `/clusters/${clusterId}`,
  sets: (clusterId: string) => `/clusters/${clusterId}/sets`,
  set: (clusterId: string, namespace: string, set: string) =>
    `/clusters/${clusterId}/sets/${encodeURIComponent(namespace)}/${encodeURIComponent(set)}`,
  record: (clusterId: string, namespace: string, set: string, key: string) =>
    `/clusters/${clusterId}/sets/${encodeURIComponent(namespace)}/${encodeURIComponent(set)}/records/${encodeURIComponent(key)}`,
  admin: (clusterId: string) => `/clusters/${clusterId}/admin`,
  secondaryIndexes: (clusterId: string) =>
    `/clusters/${clusterId}/secondary-indexes`,
  udfs: (clusterId: string) => `/clusters/${clusterId}/udfs`,
} as const

export type SiteConfig = typeof siteConfig
