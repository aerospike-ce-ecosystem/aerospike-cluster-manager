from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class UDFModule(BaseModel):
    filename: str
    type: Literal["LUA"] = "LUA"
    hash: str
    content: str | None = None


class UploadUDFRequest(BaseModel):
    filename: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_.-]{1,255}$")
    content: str = Field(min_length=1)
