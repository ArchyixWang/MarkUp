from pydantic import BaseModel


class UploadPayload(BaseModel):
    file_id: str
    team_id: str
    filename: str
    content_type: str
    category: str
    size: int
    url: str
    created_at: str | None = None
