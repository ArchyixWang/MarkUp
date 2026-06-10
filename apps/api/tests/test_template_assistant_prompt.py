from app.schemas.template_assistant import TemplateAssistantChatRequest
from app.schemas.production import TemplateComponent, TemplateSchemaPayload, TemplateTab
from app.services.template_assistant_service import SUPPORTED_COMPONENT_TYPE_LIST, _build_prompt


def test_template_assistant_prompt_prefers_first_tab_for_new_child_tabs() -> None:
    request = TemplateAssistantChatRequest(
        workspace_id="team-1",
        template_id="template-1",
        template_name="示例模板",
        template_description="测试模板",
        current_template=TemplateSchemaPayload(
            schema_version="1.0",
            tabs=[
                TemplateTab(id="tab-1", title="第一页", components=[TemplateComponent(id="field-1", type="TextInput", field="title", label="标题")]),
                TemplateTab(id="tab-2", title="第二页", components=[]),
            ],
            components=[],
        ),
        message="帮我新增一个备注页签",
    )

    prompt = _build_prompt(request, request.current_template.model_dump())

    assert "新增子 tab / 新页签" in prompt
    assert "默认优先放在第一页" in prompt
    assert "tabs[0]" in prompt
    assert "可应用 schema 契约" in prompt
    assert "targetFieldId" in prompt
    assert "options 必须使用" in prompt
    for component_type in SUPPORTED_COMPONENT_TYPE_LIST:
        assert component_type in prompt
