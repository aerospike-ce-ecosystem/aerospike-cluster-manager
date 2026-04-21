/**
 * UDF types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/udf.py
 */

export interface UDFModule {
  filename: string;
  type: "LUA";
  hash: string;
  content?: string | null;
}

export interface UploadUDFRequest {
  filename: string;
  content: string;
}
