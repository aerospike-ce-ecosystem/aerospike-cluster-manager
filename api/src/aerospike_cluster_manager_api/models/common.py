from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    message: str


class PaginatedResponse[T](BaseModel):
    """Standardized paginated response envelope.

    Use this as a base for any endpoint that returns paginated data.
    Example usage::

        class RecordListResponse(PaginatedResponse[AerospikeRecord]):
            pass  # inherits items, page, pageSize, totalCount, hasMore
    """

    items: list[T]
    page: int = Field(ge=1)
    pageSize: int = Field(ge=1)
    totalCount: int | None = None
    hasMore: bool
