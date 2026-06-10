from fastapi import APIRouter

from app.api.v1 import ai_resources, ai_reviews, audit_logs, auth, datasets, exports, labels, notifications, platform, platform_agent, profile, reviews, task_publish_assistant, tasks, teams, template_assistant, templates, uploads, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(platform.router, prefix="/platform", tags=["platform"])
api_router.include_router(platform_agent.router, prefix="/platform-agent", tags=["platform-agent"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(labels.router, prefix="/labels", tags=["labels"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(ai_resources.router, prefix="/ai-resources", tags=["ai-resources"])
api_router.include_router(ai_reviews.router, prefix="/ai-reviews", tags=["ai-reviews"])
api_router.include_router(template_assistant.router, prefix="/ai", tags=["template-assistant"])
api_router.include_router(task_publish_assistant.router, prefix="/ai", tags=["task-publish-assistant"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
