export const siteConfig = {
  name: "Aerospike Cluster Manager",
  url: "",
  description: "Operational dashboard for Aerospike CE clusters.",
  baseLinks: {
    home: "/",
    clusters: "/clusters",
    ackoTemplates: "/acko/templates",
  },
} as const

export const clusterSections = {
  overview: (clusterId: string) => `/clusters/${clusterId}`,
  sets: (clusterId: string) => `/clusters/${clusterId}/sets`,
  set: (clusterId: string, namespace: string, set: string) =>
    `/clusters/${clusterId}/sets/${namespace}/${set}`,
  record: (clusterId: string, namespace: string, set: string, key: string) =>
    `/clusters/${clusterId}/sets/${namespace}/${set}/records/${key}`,
  admin: (clusterId: string) => `/clusters/${clusterId}/admin`,
  secondaryIndexes: (clusterId: string) => `/clusters/${clusterId}/secondary-indexes`,
  udfs: (clusterId: string) => `/clusters/${clusterId}/udfs`,
} as const

export type SiteConfig = typeof siteConfig
