"""
Bitcoin message signing verification.

Supports:
  - P2PKH (1...) — Legacy compressed/uncompressed
  - P2WPKH (bc1q...) — Native SegWit v0
  - P2TR (bc1p...) — Taproot (Schnorr / BIP-340)

Uses coincurve for secp256k1 operations. No dependency on full Bitcoin node.
"""

from __future__ import annotations

import base64
import hashlib
import struct
from enum import Enum

from coincurve import PublicKey
from coincurve.ecdsa import deserialize_compact


class AddressType(Enum):
    """Bitcoin address types."""

    P2PKH = "p2pkh"
    P2WPKH = "p2wpkh"
    P2TR = "p2tr"


def verify_bitcoin_signature(
    address: str,
    message: str,
    signature_base64: str,
) -> bool:
    """
    Verify a Bitcoin signed message.

    Args:
        address: Bitcoin address (P2PKH, P2WPKH, or P2TR).
        message: The original message that was signed.
        signature_base64: Base64-encoded signature.

    Returns:
        True if signature is valid for the given address.

    Raises:
        ValueError: If address format is unsupported.
    """
    try:
        sig_bytes = base64.b64decode(signature_base64)
    except Exception:
        return False

    msg_hash = _message_hash(message)
    addr_type = _detect_address_type(address)

    if addr_type == AddressType.P2TR:
        return _verify_schnorr(address, msg_hash, sig_bytes)
    return _verify_ecdsa(address, msg_hash, sig_bytes, addr_type)


def _message_hash(message: str) -> bytes:
    """
    Bitcoin message signing hash: SHA256(SHA256(prefix || varint(len) || message)).

    Prefix: "\\x18Bitcoin Signed Message:\\n"
    """
    prefix = b"\x18Bitcoin Signed Message:\n"
    msg_bytes = message.encode("utf-8")
    varint = _encode_varint(len(msg_bytes))
    payload = prefix + varint + msg_bytes
    return hashlib.sha256(hashlib.sha256(payload).digest()).digest()


def _encode_varint(n: int) -> bytes:
    """Encode integer as Bitcoin varint."""
    if n < 0xFD:
        return struct.pack("<B", n)
    if n <= 0xFFFF:
        return b"\xfd" + struct.pack("<H", n)
    if n <= 0xFFFFFFFF:
        return b"\xfe" + struct.pack("<I", n)
    return b"\xff" + struct.pack("<Q", n)


def _detect_address_type(address: str) -> AddressType:
    """Detect Bitcoin address type from prefix."""
    if address.startswith("1"):
        return AddressType.P2PKH
    if address.startswith("bc1q"):
        return AddressType.P2WPKH
    if address.startswith("bc1p"):
        return AddressType.P2TR
    # Testnet / signet variants
    if address.startswith(("tb1q", "m", "n")):
        return AddressType.P2WPKH
    if address.startswith("tb1p"):
        return AddressType.P2TR
    msg = f"Unsupported address format: {address[:10]}..."
    raise ValueError(msg)


def _verify_ecdsa(
    address: str,
    msg_hash: bytes,
    sig_bytes: bytes,
    addr_type: AddressType,
) -> bool:
    """Verify ECDSA signature (P2PKH / P2WPKH)."""
    if len(sig_bytes) != 65:
        return False

    flag = sig_bytes[0]
    if flag < 27 or flag > 34:
        return False

    compressed = flag >= 31
    recovery_id = (flag - 27) & 3

    try:
        recoverable_sig = deserialize_compact(sig_bytes[1:], recovery_id)
        pubkey = PublicKey.from_signature_and_message(
            recoverable_sig, msg_hash, hasher=None
        )
        derived = _pubkey_to_address(pubkey, addr_type, compressed)
        return derived == address
    except Exception:
        return False


def _verify_schnorr(
    address: str,
    msg_hash: bytes,
    sig_bytes: bytes,
) -> bool:
    """Verify Schnorr signature (P2TR / BIP-340)."""
    # BIP-340 Schnorr signatures are 64 bytes
    if len(sig_bytes) == 65:
        sig_bytes = sig_bytes[1:]  # Strip recovery byte if present
    if len(sig_bytes) != 64:
        return False

    try:
        from coincurve import PublicKeyXOnly

        x_only_bytes = _decode_bech32m_witness(address)
        pubkey = PublicKeyXOnly(x_only_bytes)
        return pubkey.verify(sig_bytes, msg_hash)  # type: ignore[no-any-return]
    except Exception:
        return False


def _pubkey_to_address(
    pubkey: PublicKey,
    addr_type: AddressType,
    compressed: bool,
) -> str:
    """Derive a Bitcoin address from a public key."""
    pub_bytes = pubkey.format(compressed=compressed)

    if addr_type == AddressType.P2PKH:
        return _pubkey_to_p2pkh(pub_bytes)
    if addr_type == AddressType.P2WPKH:
        return _pubkey_to_p2wpkh(pub_bytes)
    msg = f"Cannot derive address for type: {addr_type}"
    raise ValueError(msg)


def _pubkey_to_p2pkh(pub_bytes: bytes) -> str:
    """Public key -> P2PKH address (Base58Check)."""
    sha256_hash = hashlib.sha256(pub_bytes).digest()
    ripemd160 = hashlib.new("ripemd160", sha256_hash).digest()
    versioned = b"\x00" + ripemd160  # Mainnet prefix
    checksum = hashlib.sha256(hashlib.sha256(versioned).digest()).digest()[:4]
    return _base58_encode(versioned + checksum)


def _pubkey_to_p2wpkh(pub_bytes: bytes) -> str:
    """Public key -> P2WPKH bech32 address."""
    sha256_hash = hashlib.sha256(pub_bytes).digest()
    witness_hash = hashlib.new("ripemd160", sha256_hash).digest()
    from tbg.auth._bech32 import encode as bech32_encode

    return bech32_encode("bc", 0, witness_hash)


def _decode_bech32m_witness(address: str) -> bytes:
    """Decode witness program from bech32m (taproot) address."""
    from tbg.auth._bech32 import decode as bech32_decode

    _, version, witness = bech32_decode(address)
    if version != 1:
        msg = f"Expected witness version 1 (taproot), got {version}"
        raise ValueError(msg)
    return bytes(witness)


def _base58_encode(data: bytes) -> str:
    """Base58Check encoding."""
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(data, "big")
    result = ""
    while n > 0:
        n, remainder = divmod(n, 58)
        result = alphabet[remainder] + result
    # Preserve leading zeros
    for byte in data:
        if byte == 0:
            result = "1" + result
        else:
            break
    return result
