import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.core.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)


def send_email_verification_code(email: str, code: str, purpose: str) -> None:
    subject = "MarkUp 邮箱验证码"
    purpose_label = {
        "register": "注册账号",
        "bind_email": "绑定邮箱",
        "reset_password": "重置密码",
        "team_payment_password_reset": "重置企业钱包支付密码",
    }.get(purpose, "邮箱验证")
    text = (
        f"你正在进行 MarkUp（马克派）{purpose_label}操作。\n\n"
        f"验证码：{code}\n"
        f"验证码将在 {settings.email_code_expire_minutes} 分钟后过期，请勿转发给他人。\n"
    )
    send_email(email, subject, text)


def send_team_invitation_email(email: str, invite_url: str, message: str | None = None) -> None:
    subject = "MarkUp 企业邀请"
    text = "你收到了一封 MarkUp（马克派）企业邀请。\n\n"
    if message:
        text += f"邀请说明：{message}\n\n"
    text += f"请打开以下链接处理邀请：\n{invite_url}\n"
    send_email(email, subject, text)


def send_email(to_email: str, subject: str, text: str) -> None:
    if not settings.smtp_enabled:
        logger.info("email_delivery_skipped_dev_mode", extra={"email": to_email, "subject": subject})
        return
    validate_smtp_settings()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = format_sender()
    message["To"] = to_email
    message.set_content(text)
    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                login_smtp(server)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                login_smtp(server)
                server.send_message(message)
    except smtplib.SMTPException as exc:
        logger.exception("email_delivery_failed", extra={"email": to_email, "subject": subject})
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "邮件发送失败，请稍后重试") from exc


def validate_smtp_settings() -> None:
    missing = []
    for key, value in {
        "SMTP_HOST": settings.smtp_host,
        "SMTP_USERNAME": settings.smtp_username,
        "SMTP_PASSWORD": settings.smtp_password,
        "SMTP_FROM_EMAIL": settings.smtp_from_email,
    }.items():
        if not value:
            missing.append(key)
    if missing:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"SMTP 未配置，请设置 {', '.join(missing)}")


def login_smtp(server: smtplib.SMTP) -> None:
    if settings.smtp_username and settings.smtp_password:
        server.login(settings.smtp_username, settings.smtp_password)


def format_sender() -> str:
    sender = settings.smtp_from_email or settings.smtp_username or ""
    if settings.smtp_from_name:
        return f"{settings.smtp_from_name} <{sender}>"
    return sender
