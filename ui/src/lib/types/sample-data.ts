export interface CreateSampleDataRequest {
  namespace: string
  setName?: string
  recordCount?: number
  createIndexes?: boolean
}

export interface CreateSampleDataResponse {
  recordsCreated: number
  recordsFailed: number
  indexesCreated: string[]
  indexesSkipped: string[]
  indexesFailed: string[]
  elapsedMs: number
}
