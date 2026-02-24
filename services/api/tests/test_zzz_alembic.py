"""Alembic migration tests.

File named test_zzz_alembic.py to sort LAST in pytest collection order.
"""

import subprocess


def test_alembic_upgrade_head() -> None:
    """alembic upgrade head succeeds without errors."""
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic upgrade failed: {result.stderr}"


def test_alembic_current_shows_head() -> None:
    """alembic current shows the latest revision."""
    result = subprocess.run(
        ["alembic", "current"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "002_auth_tables" in result.stdout
