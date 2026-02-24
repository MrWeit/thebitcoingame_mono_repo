"""
Bech32 / Bech32m encoding and decoding (BIP173 / BIP350).

Minimal pure-Python implementation for Bitcoin address encoding.
Reference: https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki
           https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki
"""

from __future__ import annotations

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32_CONST = 1
BECH32M_CONST = 0x2BC830A3


def _bech32_polymod(values: list[int]) -> int:
    """Internal function that computes the Bech32 checksum."""
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ value
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp: str) -> list[int]:
    """Expand HRP into values for checksum computation."""
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _bech32_verify_checksum(hrp: str, data: list[int]) -> int | None:
    """Verify a checksum. Returns the encoding constant if valid, None otherwise."""
    const = _bech32_polymod(_bech32_hrp_expand(hrp) + data)
    if const == BECH32_CONST:
        return BECH32_CONST
    if const == BECH32M_CONST:
        return BECH32M_CONST
    return None


def _bech32_create_checksum(hrp: str, data: list[int], spec: int) -> list[int]:
    """Compute the checksum values given HRP and data."""
    values = _bech32_hrp_expand(hrp) + data
    polymod = _bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ spec
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]


def _convertbits(data: bytes | list[int], frombits: int, tobits: int, pad: bool = True) -> list[int] | None:
    """General power-of-2 base conversion."""
    acc = 0
    bits = 0
    ret: list[int] = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret


def decode(addr: str) -> tuple[str, int, list[int]]:
    """
    Decode a bech32 or bech32m address.

    Args:
        addr: The full bech32/bech32m address string.

    Returns:
        Tuple of (hrp, witness_version, witness_program_bytes).

    Raises:
        ValueError: If the address is invalid.
    """
    if any(ord(x) < 33 or ord(x) > 126 for x in addr):
        msg = "Invalid character in address"
        raise ValueError(msg)
    if addr.lower() != addr and addr.upper() != addr:
        msg = "Mixed case in address"
        raise ValueError(msg)
    addr = addr.lower()
    pos = addr.rfind("1")
    if pos < 1 or pos + 7 > len(addr) or len(addr) > 90:
        msg = "Invalid bech32 address format"
        raise ValueError(msg)
    hrp = addr[:pos]
    data_part = addr[pos + 1 :]
    if not all(x in CHARSET for x in data_part):
        msg = "Invalid character in data part"
        raise ValueError(msg)
    data = [CHARSET.find(x) for x in data_part]
    spec = _bech32_verify_checksum(hrp, data)
    if spec is None:
        msg = "Invalid bech32 checksum"
        raise ValueError(msg)
    decoded = data[:-6]
    if len(decoded) < 1:
        msg = "Empty data section"
        raise ValueError(msg)
    witness_version = decoded[0]
    if witness_version > 16:
        msg = f"Invalid witness version: {witness_version}"
        raise ValueError(msg)
    # Witness version 0 uses bech32, versions 1+ use bech32m
    if witness_version == 0 and spec != BECH32_CONST:
        msg = "Witness version 0 must use bech32 encoding"
        raise ValueError(msg)
    if witness_version >= 1 and spec != BECH32M_CONST:
        msg = f"Witness version {witness_version} must use bech32m encoding"
        raise ValueError(msg)
    program = _convertbits(decoded[1:], 5, 8, pad=False)
    if program is None or len(program) < 2 or len(program) > 40:
        msg = "Invalid witness program length"
        raise ValueError(msg)
    if witness_version == 0 and len(program) not in (20, 32):
        msg = "Invalid witness v0 program length"
        raise ValueError(msg)
    return hrp, witness_version, program


def encode(hrp: str, witver: int, witprog: bytes | list[int]) -> str:
    """
    Encode a segwit address.

    Args:
        hrp: Human-readable part (e.g., "bc" for mainnet, "tb" for testnet).
        witver: Witness version (0-16).
        witprog: Witness program bytes.

    Returns:
        The bech32/bech32m encoded address string.

    Raises:
        ValueError: If the inputs are invalid.
    """
    spec = BECH32_CONST if witver == 0 else BECH32M_CONST
    converted = _convertbits(list(witprog), 8, 5)
    if converted is None:
        msg = "Failed to convert witness program"
        raise ValueError(msg)
    data = [witver] + converted
    checksum = _bech32_create_checksum(hrp, data, spec)
    return hrp + "1" + "".join(CHARSET[d] for d in data + checksum)
