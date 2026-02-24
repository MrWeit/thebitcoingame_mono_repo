"""Unit tests for invite code generation."""

import string

import pytest

from tbg.social.invite_codes import (
    INVITE_CHARSET,
    INVITE_LENGTH,
    generate_invite_code,
    normalize_invite_code,
)


class TestInviteCodes:
    """Test invite code generation."""

    def test_code_is_8_chars(self):
        code = generate_invite_code()
        assert len(code) == INVITE_LENGTH
        assert len(code) == 8

    def test_code_is_alphanumeric_uppercase(self):
        code = generate_invite_code()
        assert all(c in string.ascii_uppercase + string.digits for c in code)

    def test_codes_are_unique(self):
        codes = {generate_invite_code() for _ in range(1000)}
        assert len(codes) == 1000

    def test_code_charset_is_correct(self):
        assert INVITE_CHARSET == string.ascii_uppercase + string.digits

    def test_normalize_invite_code_uppercase(self):
        assert normalize_invite_code("abc12345") == "ABC12345"

    def test_normalize_invite_code_mixed_case(self):
        assert normalize_invite_code("Abc12345") == "ABC12345"

    def test_normalize_invite_code_already_upper(self):
        assert normalize_invite_code("ABC12345") == "ABC12345"

    def test_code_has_no_lowercase(self):
        for _ in range(100):
            code = generate_invite_code()
            assert code == code.upper()

    def test_code_only_contains_valid_chars(self):
        for _ in range(100):
            code = generate_invite_code()
            for c in code:
                assert c in INVITE_CHARSET
