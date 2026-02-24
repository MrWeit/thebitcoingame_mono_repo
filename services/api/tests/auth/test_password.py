"""Tests for password hashing and validation."""

import pytest

from tbg.auth.password import (
    PasswordStrengthError,
    check_needs_rehash,
    hash_password,
    validate_password_strength,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "SecureP@ss1"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_wrong_password_rejected(self):
        hashed = hash_password("CorrectP@ss1")
        assert verify_password("WrongP@ss1", hashed) is False

    def test_password_strength_validation(self):
        validate_password_strength("StrongP@ss1")  # Should not raise

    def test_empty_password_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("")

    def test_short_password_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("Short1")

    def test_no_uppercase_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("nouppercase1")

    def test_no_lowercase_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("NOLOWERCASE1")

    def test_no_digit_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("NoDigitHere")

    def test_too_long_password_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("A" * 100 + "a" * 29 + "1")

    def test_hash_is_argon2id(self):
        hashed = hash_password("TestP@ss1")
        assert hashed.startswith("$argon2id$")

    def test_check_needs_rehash(self):
        hashed = hash_password("TestP@ss1")
        assert check_needs_rehash(hashed) is False

    def test_whitespace_only_rejected(self):
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("   ")
