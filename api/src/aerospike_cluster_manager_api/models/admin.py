from __future__ import annotations

from pydantic import BaseModel, Field


class Privilege(BaseModel):
    code: str = Field(min_length=1, max_length=63)
    namespace: str | None = Field(default=None, max_length=31)
    set: str | None = Field(default=None, max_length=63)


class AerospikeUser(BaseModel):
    username: str
    roles: list[str]
    readQuota: int
    writeQuota: int
    connections: int


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=63)
    password: str = Field(min_length=1, max_length=255)
    roles: list[str] | None = None


class ChangePasswordRequest(BaseModel):
    username: str = Field(min_length=1, max_length=63)
    password: str = Field(min_length=1, max_length=255)


class AerospikeRole(BaseModel):
    name: str
    privileges: list[Privilege]
    whitelist: list[str]
    readQuota: int
    writeQuota: int


class CreateRoleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=63)
    privileges: list[Privilege]
    whitelist: list[str] | None = None
    readQuota: int | None = None
    writeQuota: int | None = None
