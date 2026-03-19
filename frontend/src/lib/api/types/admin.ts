import type { BinValue, RecordKey } from "./records";

// === Admin ===
export interface AerospikeUser {
  username: string;
  roles: string[];
  readQuota: number;
  writeQuota: number;
  connections: number;
}

export interface AerospikeRole {
  name: string;
  privileges: Privilege[];
  whitelist: string[];
  readQuota: number;
  writeQuota: number;
}

export interface Privilege {
  code: string;
  namespace?: string;
  set?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  roles: string[];
}

export interface CreateRoleRequest {
  name: string;
  privileges: Privilege[];
  whitelist?: string[];
  readQuota?: number;
  writeQuota?: number;
}

// === UDF ===
export type UDFType = "LUA";

export interface UDFModule {
  filename: string;
  type: UDFType;
  hash: string;
  content?: string;
}

export interface ApplyUDFRequest {
  key: RecordKey;
  module: string;
  functionName: string;
  args: BinValue[];
}

// === Terminal ===
export interface TerminalCommand {
  id: string;
  command: string;
  output: string;
  timestamp: string;
  success: boolean;
}
