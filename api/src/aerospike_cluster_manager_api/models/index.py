from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SecondaryIndex(BaseModel):
    name: str
    namespace: str
    set: str
    bin: str
    type: Literal["numeric", "string", "geo2dsphere"]
    state: Literal["ready", "building", "error"]


class CreateIndexRequest(BaseModel):
    namespace: str = Field(min_length=1, max_length=31)
    set: str = Field(min_length=1, max_length=63)
    bin: str = Field(min_length=1, max_length=15)
    name: str = Field(min_length=1, max_length=255)
    type: Literal["numeric", "string", "geo2dsphere"]
