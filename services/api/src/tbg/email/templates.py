"""
Email templates for The Bitcoin Game.

All templates use inline CSS for maximum email client compatibility.
Branded with dark theme and Bitcoin orange (#F7931A) accents.

Each template function returns (subject, html_body, text_body).
"""

from __future__ import annotations

# Color constants
BG_DARK = "#06080C"
BG_CARD = "#0D1117"
BG_SURFACE = "#161B22"
ORANGE = "#F7931A"
TEXT_PRIMARY = "#F0F6FC"
TEXT_SECONDARY = "#8B949E"
BORDER = "#21262D"


def _base_layout(content: str, app_name: str = "The Bitcoin Game") -> str:
    """Wrap content in the base email layout."""
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{app_name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: {BG_DARK}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: {BG_DARK};">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%;">
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <span style="font-size: 28px; font-weight: 700; color: {ORANGE};">&#x20BF;</span>
                            <span style="font-size: 22px; font-weight: 700; color: {TEXT_PRIMARY}; margin-left: 8px;">{app_name}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: {BG_CARD}; border: 1px solid {BORDER}; border-radius: 12px; padding: 40px 32px;">
                            {content}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-top: 32px;">
                            <p style="color: {TEXT_SECONDARY}; font-size: 12px; line-height: 1.5; margin: 0;">
                                This email was sent by {app_name}.<br>
                                If you didn't expect this email, you can safely ignore it.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def _button(url: str, label: str) -> str:
    """Render an orange CTA button."""
    return f"""\
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px auto;">
    <tr>
        <td align="center" style="background-color: {ORANGE}; border-radius: 8px;">
            <a href="{url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #FFFFFF; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                {label}
            </a>
        </td>
    </tr>
</table>"""


def welcome_email(display_name: str | None, verify_url: str) -> tuple[str, str, str]:
    """
    Welcome email sent after email registration.

    Returns:
        (subject, html_body, text_body)
    """
    name = display_name or "Miner"
    subject = "Welcome to The Bitcoin Game"
    content = f"""\
<h1 style="color: {TEXT_PRIMARY}; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Welcome to The Bitcoin Game!</h1>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">Hi {name},</p>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
    Your account has been created. Please verify your email address to unlock the full mining experience.
</p>
{_button(verify_url, "Verify Email Address")}
<p style="color: {TEXT_SECONDARY}; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0;">
    This link expires in <strong style="color: {TEXT_PRIMARY};">24 hours</strong>.
    If you didn't create an account, ignore this email.
</p>
<hr style="border: none; border-top: 1px solid {BORDER}; margin: 24px 0;">
<p style="color: {TEXT_SECONDARY}; font-size: 12px; line-height: 1.5; margin: 0;">
    If the button doesn't work, copy and paste this URL:<br>
    <a href="{verify_url}" style="color: {ORANGE}; word-break: break-all;">{verify_url}</a>
</p>"""
    html_body = _base_layout(content)
    text_body = (
        f"Hi {name},\n\n"
        f"Welcome to The Bitcoin Game! Please verify your email address "
        f"by visiting this link:\n\n{verify_url}\n\n"
        f"This link expires in 24 hours.\n\n"
        f"If you did not create an account, please ignore this email.\n\n"
        f"-- The Bitcoin Game Team"
    )
    return subject, html_body, text_body


def verify_email(verify_url: str, expires_hours: int = 24) -> tuple[str, str, str]:
    """
    Email verification (resend).

    Returns:
        (subject, html_body, text_body)
    """
    subject = "Verify your email address"
    content = f"""\
<h1 style="color: {TEXT_PRIMARY}; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Verify your email</h1>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
    Click the button below to verify your email address.
</p>
{_button(verify_url, "Verify Email Address")}
<p style="color: {TEXT_SECONDARY}; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0;">
    This link expires in <strong style="color: {TEXT_PRIMARY};">{expires_hours} hours</strong>.
    If you didn't request this, ignore this email.
</p>
<hr style="border: none; border-top: 1px solid {BORDER}; margin: 24px 0;">
<p style="color: {TEXT_SECONDARY}; font-size: 12px; line-height: 1.5; margin: 0;">
    If the button doesn't work, copy and paste this URL:<br>
    <a href="{verify_url}" style="color: {ORANGE}; word-break: break-all;">{verify_url}</a>
</p>"""
    html_body = _base_layout(content)
    text_body = (
        f"Verify your email address\n\n"
        f"Click this link to verify your email:\n\n{verify_url}\n\n"
        f"This link expires in {expires_hours} hours.\n\n"
        f"If you didn't request this, please ignore this email.\n\n"
        f"-- The Bitcoin Game Team"
    )
    return subject, html_body, text_body


def password_reset(reset_url: str, expires_minutes: int = 60) -> tuple[str, str, str]:
    """
    Password reset email.

    Returns:
        (subject, html_body, text_body)
    """
    subject = "Reset your password"
    hours_text = "1 hour" if expires_minutes == 60 else f"{expires_minutes} minutes"
    content = f"""\
<h1 style="color: {TEXT_PRIMARY}; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Reset your password</h1>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
    We received a request to reset your password for The Bitcoin Game.
    Click the button below to choose a new password.
</p>
{_button(reset_url, "Reset Password")}
<p style="color: {TEXT_SECONDARY}; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0;">
    This link expires in <strong style="color: {TEXT_PRIMARY};">{hours_text}</strong>.
    If you didn't request this, your password will remain unchanged.
</p>
<hr style="border: none; border-top: 1px solid {BORDER}; margin: 24px 0;">
<p style="color: {TEXT_SECONDARY}; font-size: 12px; line-height: 1.5; margin: 0;">
    If the button doesn't work, copy and paste this URL:<br>
    <a href="{reset_url}" style="color: {ORANGE}; word-break: break-all;">{reset_url}</a>
</p>"""
    html_body = _base_layout(content)
    text_body = (
        f"Reset your password\n\n"
        f"We received a request to reset your password.\n\n"
        f"Click this link to set a new password:\n\n{reset_url}\n\n"
        f"This link expires in {hours_text}.\n\n"
        f"If you didn't request a password reset, please ignore this email. "
        f"Your password will remain unchanged.\n\n"
        f"-- The Bitcoin Game Team"
    )
    return subject, html_body, text_body


def password_changed(display_name: str | None) -> tuple[str, str, str]:
    """
    Password changed notification.

    Returns:
        (subject, html_body, text_body)
    """
    name = display_name or "Miner"
    subject = "Your password has been changed"
    content = f"""\
<h1 style="color: {TEXT_PRIMARY}; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Password changed</h1>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">Hi {name},</p>
<p style="color: {TEXT_SECONDARY}; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
    Your password for The Bitcoin Game was successfully changed.
</p>
<div style="background-color: {BG_SURFACE}; border: 1px solid {BORDER}; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="color: {ORANGE}; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">
        Didn't make this change?
    </p>
    <p style="color: {TEXT_SECONDARY}; font-size: 14px; line-height: 1.5; margin: 0;">
        If you didn't change your password, your account may be compromised.
        Contact support immediately.
    </p>
</div>"""
    html_body = _base_layout(content)
    text_body = (
        f"Hi {name},\n\n"
        f"Your password for The Bitcoin Game was successfully changed.\n\n"
        f"If you didn't make this change, your account may be compromised. "
        f"Contact support immediately.\n\n"
        f"If this wasn't you, please contact support.\n\n"
        f"-- The Bitcoin Game Team"
    )
    return subject, html_body, text_body
