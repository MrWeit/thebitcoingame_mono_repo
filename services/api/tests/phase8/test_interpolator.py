"""Unit tests for content_interpolator.py — 6 test cases."""

from __future__ import annotations

import pytest

from tbg.education.content_interpolator import (
    format_number,
    get_user_interpolation_data,
    interpolate_content,
)


# Test 1: Interpolate content — all 4 placeholders
class TestInterpolateContent:
    def test_all_four_placeholders_replaced(self) -> None:
        markdown = "Hash: {hashrate}, Diff: {shareDiff}, Net: {networkDiff}, Ratio: {ratio}"
        user_data = {
            "hashrate": "500.0G H/s",
            "shareDiff": "65,536",
            "networkDiff": "86.4T",
            "ratio": "1.3G",
        }
        result = interpolate_content(markdown, user_data)
        assert result == "Hash: 500.0G H/s, Diff: 65,536, Net: 86.4T, Ratio: 1.3G"
        assert "{hashrate}" not in result
        assert "{shareDiff}" not in result
        assert "{networkDiff}" not in result
        assert "{ratio}" not in result

    # Test 2: Unknown placeholder left as-is
    def test_unknown_placeholder_left_as_is(self) -> None:
        markdown = "Known: {hashrate}, Unknown: {unknownThing}"
        user_data = {"hashrate": "500.0G H/s"}
        result = interpolate_content(markdown, user_data)
        assert result == "Known: 500.0G H/s, Unknown: {unknownThing}"

    # Test 3: No placeholders — content unchanged
    def test_no_placeholders_unchanged(self) -> None:
        markdown = "## This is just plain Markdown\n\nNo placeholders here."
        result = interpolate_content(markdown, {"hashrate": "500G"})
        assert result == markdown

    # Test: Multiple occurrences of same placeholder
    def test_multiple_same_placeholder(self) -> None:
        markdown = "First: {hashrate}, Second: {hashrate}"
        result = interpolate_content(markdown, {"hashrate": "500G"})
        assert result == "First: 500G, Second: 500G"

    # Test: Empty user_data
    def test_empty_user_data(self) -> None:
        markdown = "Hash: {hashrate}"
        result = interpolate_content(markdown, {})
        assert result == "Hash: {hashrate}"


# Test 4-6: format_number
class TestFormatNumber:
    # Test 4: Trillions
    def test_trillions(self) -> None:
        assert format_number(86_400_000_000_000) == "86.4T"
        assert format_number(86_388_558_925_171) == "86.4T"

    # Test 5: Billions
    def test_billions(self) -> None:
        assert format_number(500_000_000_000) == "500.0G"
        assert format_number(1_500_000_000) == "1.5G"

    # Test 6: Thousands
    def test_thousands(self) -> None:
        assert format_number(65536) == "65,536"
        assert format_number(1000) == "1,000"

    def test_millions(self) -> None:
        assert format_number(5_000_000) == "5.0M"

    def test_small_numbers(self) -> None:
        assert format_number(0.5) == "0.50"
        assert format_number(999) == "999.00"


# Test: get_user_interpolation_data
@pytest.mark.asyncio
class TestGetUserInterpolationData:
    async def test_default_values_when_redis_empty(self) -> None:
        """When Redis has no data, sensible defaults are returned."""

        class MockRedis:
            async def get(self, key: str) -> None:
                return None

        data = await get_user_interpolation_data(123, MockRedis())
        assert "H/s" in data["hashrate"]
        assert data["shareDiff"] == "65,536"
        assert "T" in data["networkDiff"]
        assert data["ratio"]  # Non-empty

    async def test_custom_values_from_redis(self) -> None:
        """When Redis has data, those values are used."""
        redis_data = {
            "user:hashrate:42": "1000000000000",  # 1T
            "user:share_diff:42": "131072",
            "network:difficulty": "100000000000000",  # 100T
        }

        class MockRedis:
            async def get(self, key: str) -> str | None:
                return redis_data.get(key)

        data = await get_user_interpolation_data(42, MockRedis())
        assert data["hashrate"] == "1.0T H/s"
        assert data["shareDiff"] == "131,072"
        assert data["networkDiff"] == "100.0T"
