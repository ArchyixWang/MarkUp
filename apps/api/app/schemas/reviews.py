from pydantic import BaseModel, Field, model_validator


class ReviewSubmissionRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|revise)$")
    comment: str | None = Field(default=None, max_length=2000)
    revised_answers: dict | None = None

    @model_validator(mode="after")
    def validate_comment(self):
        if self.decision in {"rejected", "revise"} and not (self.comment or "").strip():
            raise ValueError("打回或要求修改必须填写原因")
        if self.decision == "revise" and not self.revised_answers:
            raise ValueError("直接修订必须提交修订后的标注答案")
        return self


class BatchReviewSubmissionRequest(ReviewSubmissionRequest):
    submission_ids: list[str] = Field(min_length=1, max_length=100)
