from __future__ import annotations

from pydantic import BaseModel, Field


class CreateSampleDataRequest(BaseModel):
    namespace: str = Field(min_length=1, max_length=31)
    set_name: str = Field(default="sample_set", min_length=1, max_length=63, alias="setName")
    record_count: int = Field(default=1234, ge=1, le=10000, alias="recordCount")
    create_indexes: bool = Field(default=True, alias="createIndexes")

    model_config = {"populate_by_name": True}


class CreateSampleDataResponse(BaseModel):
    records_created: int = Field(alias="recordsCreated")
    records_failed: int = Field(default=0, alias="recordsFailed")
    indexes_created: list[str] = Field(default_factory=list, alias="indexesCreated")
    indexes_skipped: list[str] = Field(default_factory=list, alias="indexesSkipped")
    indexes_failed: list[str] = Field(default_factory=list, alias="indexesFailed")
    elapsed_ms: int = Field(alias="elapsedMs")

    model_config = {"populate_by_name": True}
