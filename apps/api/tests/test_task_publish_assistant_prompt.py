from app.schemas.task_publish_assistant import TaskPublishAssistantChatRequest
from app.services.task_publish_assistant_service import _build_prompt


def test_task_publish_assistant_prompt_constrains_changes_to_publish_wizard_fields() -> None:
    request = TaskPublishAssistantChatRequest(
        workspace_id="team-1",
        team_id="team-1",
        draft_task_id="task-1",
        current_task_draft={
            "templateAndData": {
                "templateSchema": {
                    "schema_version": "1.1",
                    "tabs": [{
                        "id": "tab-label",
                        "title": "标注",
                        "components": [{"id": "rating", "type": "Scale", "field": "rating", "label": "评分"}],
                    }],
                },
                "showItemMappings": [{"showItemKey": "show_image", "showItemLabel": "图片"}],
            }
        },
        message="帮我补全 AI 预审和企业内流转配置",
    )

    prompt = _build_prompt(request, request.current_task_draft)

    assert "templateAndData.templateSchema" in prompt
    assert "不允许返回 create_field/delete_field/update_field" in prompt
    assert "after 只能使用任务发布向导能应用的字段" in prompt
    assert "share_enabled / expire_hours" in prompt
    assert "internal_labeler_ids / internal_labeler_allocations" in prompt
    assert "after.mapping" in prompt
    assert "ai_review_matrix 每项至少包含" in prompt
