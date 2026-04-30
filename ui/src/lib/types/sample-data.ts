export interface CreateSampleDataRequest {
  namespace: string
  setName?: string
  recordCount?: number
  createIndexes?: boolean
}

export interface CreateSampleDataResponse {
  recordsCreated: number
  indexesCreated: string[]
  indexesSkipped: string[]
  elapsedMs: number
}
