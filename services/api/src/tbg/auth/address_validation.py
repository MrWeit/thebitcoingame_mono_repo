"""
Bitcoin address format validation.

Supports P2PKH (1...), P2WPKH (bc1q...), and P2TR (bc1p...) on mainnet,
plus testnet/signet variants (tb1q..., tb1p...).
Rejects P2SH (3...) addresses.
"""

from __future__ import annotations

import hashlib

from tbg.auth._bech32 import decode as bech32_decode


def validate_btc_address(address: str, network: str = "mainnet") -> bool:
    """
    Validate a Bitcoin address format.

    Args:
        address: The Bitcoin address string to validate.
        network: The expected network ("mainnet", "testnet", or "signet").

    Returns:
        True if the address format is valid.

    Raises:
        ValueError: If the address format is unsupported or invalid.
    """
    if not address or not isinstance(address, str):
        msg = "Address must be a non-empty string"
        raise ValueError(msg)

    # Reject P2SH
    if address.startswith("3"):
        msg = "P2SH addresses (3...) are not supported"
        raise ValueError(msg)

    # P2PKH (legacy)
    if address.startswith("1") or address.startswith("m") or address.startswith("n"):
        return _validate_p2pkh(address, network)

    # Bech32 / Bech32m (segwit)
    if address.startswith(("bc1", "tb1")):
        return _validate_bech32(address, network)

    msg = f"Unsupported address format: {address[:10]}..."
    raise ValueError(msg)


def get_address_type(address: str) -> str:
    """
    Return the address type string.

    Returns:
        One of: "p2pkh", "p2wpkh", "p2tr".

    Raises:
        ValueError: If the address format is unsupported.
    """
    if address.startswith("1") or address.startswith("m") or address.startswith("n"):
        return "p2pkh"
    if address.startswith("bc1q") or address.startswith("tb1q"):
        return "p2wpkh"
    if address.startswith("bc1p") or address.startswith("tb1p"):
        return "p2tr"
    if address.startswith("3"):
        msg = "P2SH addresses are not supported"
        raise ValueError(msg)
    msg = f"Unsupported address format: {address[:10]}..."
    raise ValueError(msg)


def _validate_p2pkh(address: str, network: str) -> bool:
    """Validate a P2PKH address (Base58Check)."""
    if network == "mainnet" and not address.startswith("1"):
        msg = "P2PKH mainnet addresses must start with '1'"
        raise ValueError(msg)
    if network in ("testnet", "signet") and not address.startswith(("m", "n")):
        msg = "P2PKH testnet/signet addresses must start with 'm' or 'n'"
        raise ValueError(msg)
    if not 25 <= len(address) <= 34:
        msg = "Invalid P2PKH address length"
        raise ValueError(msg)
    # Validate Base58Check
    try:
        decoded = _base58_decode(address)
    except ValueError as e:
        msg = f"Invalid P2PKH address: {e}"
        raise ValueError(msg) from e
    if len(decoded) != 25:
        msg = "Invalid P2PKH decoded length"
        raise ValueError(msg)
    # Verify checksum
    payload = decoded[:-4]
    checksum = decoded[-4:]
    expected = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    if checksum != expected:
        msg = "Invalid P2PKH address checksum"
        raise ValueError(msg)
    return True


def _validate_bech32(address: str, network: str) -> bool:
    """Validate a bech32/bech32m segwit address."""
    expected_hrp = "bc" if network == "mainnet" else "tb"
    try:
        hrp, version, program = bech32_decode(address)
    except ValueError as e:
        msg = f"Invalid bech32 address: {e}"
        raise ValueError(msg) from e

    if hrp != expected_hrp:
        msg = f"Address HRP '{hrp}' does not match expected '{expected_hrp}' for {network}"
        raise ValueError(msg)

    # P2WPKH: version 0, 20-byte program
    if version == 0 and len(program) == 20:
        return True
    # P2WSH: version 0, 32-byte program
    if version == 0 and len(program) == 32:
        return True
    # P2TR: version 1, 32-byte program
    if version == 1 and len(program) == 32:
        return True
    msg = f"Unsupported witness version {version} with program length {len(program)}"
    raise ValueError(msg)


_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _base58_decode(s: str) -> bytes:
    """Decode a Base58 string to bytes."""
    n = 0
    for char in s:
        idx = _BASE58_ALPHABET.find(char)
        if idx == -1:
            msg = f"Invalid Base58 character: {char}"
            raise ValueError(msg)
        n = n * 58 + idx
    # Convert to bytes
    result = n.to_bytes((n.bit_length() + 7) // 8, "big") if n > 0 else b""
    # Preserve leading zeros
    pad_size = 0
    for char in s:
        if char == "1":
            pad_size += 1
        else:
            break
    return b"\x00" * pad_size + result
