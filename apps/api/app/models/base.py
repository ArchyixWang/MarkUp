from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, ClassVar

from app.core.security import generate_object_id, now_utc


@dataclass
class MongoDocument:
    collection_name: ClassVar[str]
    id: str = field(default_factory=generate_object_id)

    @classmethod
    def from_doc(cls, doc: dict | None):
        if not doc:
            return None
        data = dict(doc)
        data["id"] = data.pop("_id")
        allowed_fields = set(cls.__dataclass_fields__)
        data = {key: value for key, value in data.items() if key in allowed_fields}
        return cls(**data)

    def to_doc(self) -> dict[str, Any]:
        data = normalize_document(asdict(self))
        data["_id"] = data.pop("id")
        return data


def utcnow() -> datetime:
    return now_utc().replace(tzinfo=None)


def normalize_document(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: normalize_document(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [normalize_document(item) for item in value]
    return value
