"""Phase 8 test fixtures — education tracks, lessons, and test users."""

from __future__ import annotations

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.database import get_session


async def _seed_education_data(db: AsyncSession) -> None:
    """Insert test education tracks and lessons directly."""
    # Check if already seeded
    result = await db.execute(text("SELECT COUNT(*) FROM education_tracks"))
    if result.scalar() and result.scalar() > 0:
        return

    # Re-run the seed from migration
    await db.execute(text("""
        INSERT INTO education_tracks (id, title, description, lesson_count, estimated_minutes, "order")
        VALUES
        ('1', 'What''s Happening on My Bitaxe?', 'Understand what your little miner is actually doing.', 5, 20, 1),
        ('2', 'Understanding Bitcoin', 'From digital money to the lightning network.', 8, 45, 2),
        ('3', 'Securing Your Bitcoin', 'Learn how to properly secure your Bitcoin.', 5, 30, 3),
        ('4', 'Running a Node', 'Set up your own Bitcoin full node.', 6, 35, 4)
        ON CONFLICT (id) DO NOTHING
    """))

    # Insert Track 1 lessons (5)
    await db.execute(text("""
        INSERT INTO education_lessons (id, track_id, "order", title, estimated_minutes, content)
        VALUES
        ('1-1', '1', 1, 'What is Mining?', 4, '## What is Mining?\n\nYour Bitaxe makes {hashrate} guesses per second.'),
        ('1-2', '1', 2, 'What is a Hash?', 4, '## What is a Hash?\n\nA hash is the result of SHA-256.'),
        ('1-3', '1', 3, 'What is Difficulty?', 4, '## Understanding Difficulty\n\nShare diff: {shareDiff}. Network: {networkDiff}. Ratio: {ratio}.'),
        ('1-4', '1', 4, 'The Block Lottery', 4, '## The Block Lottery\n\nFinding a block is like winning the lottery.'),
        ('1-5', '1', 5, 'Why This Matters', 4, '## Why Solo Mining Matters\n\nDecentralization and censorship resistance.')
        ON CONFLICT (id) DO NOTHING
    """))

    # Insert Track 2 lessons (8)
    await db.execute(text("""
        INSERT INTO education_lessons (id, track_id, "order", title, estimated_minutes, content)
        VALUES
        ('2-1', '2', 1, 'What is Money?', 6, '## What is Money?\n\nBitcoin was created in 2009.'),
        ('2-2', '2', 2, 'How Bitcoin Works', 6, '## How Bitcoin Works\n\nBlockchain is a shared ledger.'),
        ('2-3', '2', 3, 'The Halving', 5, '## The Halving\n\nEvery 210,000 blocks the reward halves.'),
        ('2-4', '2', 4, 'Bitcoin vs TradFi', 6, '## Bitcoin vs Traditional Finance\n\nSpeed, cost, access.'),
        ('2-5', '2', 5, 'What is a Wallet?', 5, '## What is a Wallet?\n\nA wallet stores your private keys.'),
        ('2-6', '2', 6, 'Sending and Receiving', 6, '## Sending and Receiving\n\nTransactions are irreversible.'),
        ('2-7', '2', 7, 'Lightning Network', 6, '## Lightning Network\n\nLayer 2 for fast payments.'),
        ('2-8', '2', 8, 'Bitcoin Future', 6, '## Bitcoin Future\n\nKeep mining. Keep learning.')
        ON CONFLICT (id) DO NOTHING
    """))

    # Insert Track 3 lessons (5)
    await db.execute(text("""
        INSERT INTO education_lessons (id, track_id, "order", title, estimated_minutes, content)
        VALUES
        ('3-1', '3', 1, 'Hardware Wallets', 6, '## Hardware Wallets\n\nOffline key storage.'),
        ('3-2', '3', 2, 'Seed Phrases', 6, '## Seed Phrases\n\nYour master key backup.'),
        ('3-3', '3', 3, 'Self-Custody', 6, '## Self-Custody\n\nNot your keys, not your coins.'),
        ('3-4', '3', 4, 'First Wallet Setup', 6, '## Setting Up Your First Wallet\n\nStep by step.'),
        ('3-5', '3', 5, 'Backup Strategies', 6, '## Backup Strategies\n\nThe 3-2-1 rule.')
        ON CONFLICT (id) DO NOTHING
    """))

    # Insert Track 4 lessons (6)
    await db.execute(text("""
        INSERT INTO education_lessons (id, track_id, "order", title, estimated_minutes, content)
        VALUES
        ('4-1', '4', 1, 'Why Run a Node?', 5, '## Why Run a Node?\n\nDon''t trust, verify.'),
        ('4-2', '4', 2, 'Hardware Requirements', 5, '## Hardware Requirements\n\nRaspberry Pi or NUC.'),
        ('4-3', '4', 3, 'Node Setup', 7, '## Node Setup\n\nBitcoin Core or Umbrel.'),
        ('4-4', '4', 4, 'Connecting Your Miner', 6, '## Connecting Your Miner\n\nMaximum sovereignty.'),
        ('4-5', '4', 5, 'Node Maintenance', 6, '## Node Maintenance\n\nMonthly checkups.'),
        ('4-6', '4', 6, 'Node Runner Badge', 5, '## Node Runner Badge\n\nEarn the badge!')
        ON CONFLICT (id) DO NOTHING
    """))

    await db.commit()


@pytest_asyncio.fixture
async def seeded_education_db(client) -> AsyncSession:
    """Seed education data and return a session for assertions."""
    async for session in get_session():
        await _seed_education_data(session)
        yield session
        break
