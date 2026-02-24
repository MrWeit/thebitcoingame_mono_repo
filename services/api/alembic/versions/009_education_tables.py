"""Phase 8: Education System — tracks, lessons, completions.

Creates education_tracks, education_lessons, user_lesson_completions,
user_track_completions tables and seeds 4 tracks with 24 lessons.

Revision ID: 009_education_tables
Revises: 008_social_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "009_education_tables"
down_revision: str | None = "008_social_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Education Tracks ---
    op.create_table(
        "education_tracks",
        sa.Column("id", sa.String(10), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("lesson_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("estimated_minutes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # --- Education Lessons ---
    op.create_table(
        "education_lessons",
        sa.Column("id", sa.String(10), primary_key=True),
        sa.Column("track_id", sa.String(10), sa.ForeignKey("education_tracks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("estimated_minutes", sa.Integer, nullable=False, server_default="5"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("track_id", "order", name="uq_lesson_track_order"),
    )
    op.create_index("idx_lesson_track", "education_lessons", ["track_id", "order"])

    # --- User Lesson Completions ---
    op.create_table(
        "user_lesson_completions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger, nullable=False),
        sa.Column("track_id", sa.String(10), sa.ForeignKey("education_tracks.id"), nullable=False),
        sa.Column("lesson_id", sa.String(10), sa.ForeignKey("education_lessons.id"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson"),
    )
    op.create_index("idx_user_lesson_user", "user_lesson_completions", ["user_id", "track_id"])
    op.create_index("idx_user_lesson_completed", "user_lesson_completions", [sa.text("completed_at DESC")])

    # --- User Track Completions ---
    op.create_table(
        "user_track_completions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger, nullable=False),
        sa.Column("track_id", sa.String(10), sa.ForeignKey("education_tracks.id"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "track_id", name="uq_user_track"),
    )
    op.create_index("idx_user_track_user", "user_track_completions", ["user_id"])

    # --- Seed Education Content ---
    _seed_tracks()
    _seed_lessons()


def downgrade() -> None:
    op.drop_table("user_track_completions")
    op.drop_table("user_lesson_completions")
    op.drop_table("education_lessons")
    op.drop_table("education_tracks")


def _seed_tracks() -> None:
    """Insert 4 education tracks."""
    tracks_table = sa.table(
        "education_tracks",
        sa.column("id", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("lesson_count", sa.Integer),
        sa.column("estimated_minutes", sa.Integer),
        sa.column("order", sa.Integer),
    )
    op.bulk_insert(tracks_table, [
        {
            "id": "1",
            "title": "What's Happening on My Bitaxe?",
            "description": "Understand what your little miner is actually doing, from hashes to shares to the block lottery.",
            "lesson_count": 5,
            "estimated_minutes": 20,
            "order": 1,
        },
        {
            "id": "2",
            "title": "Understanding Bitcoin",
            "description": "From digital money to the lightning network \u2014 everything you need to know about Bitcoin.",
            "lesson_count": 8,
            "estimated_minutes": 45,
            "order": 2,
        },
        {
            "id": "3",
            "title": "Securing Your Bitcoin",
            "description": "Learn how to properly secure your Bitcoin with hardware wallets, seed phrases, and best practices.",
            "lesson_count": 5,
            "estimated_minutes": 30,
            "order": 3,
        },
        {
            "id": "4",
            "title": "Running a Node",
            "description": "Set up your own Bitcoin full node and connect your miner to it for maximum sovereignty.",
            "lesson_count": 6,
            "estimated_minutes": 35,
            "order": 4,
        },
    ])


def _seed_lessons() -> None:
    """Insert all 24 lessons with full Markdown content from education.ts."""
    lessons_table = sa.table(
        "education_lessons",
        sa.column("id", sa.String),
        sa.column("track_id", sa.String),
        sa.column("order", sa.Integer),
        sa.column("title", sa.String),
        sa.column("estimated_minutes", sa.Integer),
        sa.column("content", sa.Text),
    )

    lessons = [
        # =====================================================================
        # Track 1: What's Happening on My Bitaxe? (5 lessons)
        # =====================================================================
        {
            "id": "1-1",
            "track_id": "1",
            "order": 1,
            "title": "What is Mining?",
            "estimated_minutes": 4,
            "content": """## What is Bitcoin Mining?

Your Bitaxe is a tiny computer doing one thing over and over: **guessing numbers**.

Bitcoin mining is the process of trying to find a special number (called a **nonce**) that, when combined with a block of transactions and run through a mathematical function, produces a result that meets certain criteria.

Think of it like a lottery where your miner buys tickets by computing hashes. Each hash is a guess. Your Bitaxe makes about **500 billion guesses per second**.

### Why Does This Matter?

Mining is what keeps Bitcoin secure. Every 10 minutes, one miner somewhere in the world finds the winning number and gets to add a new block of transactions to the Bitcoin blockchain. They earn the **block reward** (currently 3.125 BTC) plus transaction fees.

### Your Miner's Role

Your Bitaxe is competing against massive mining farms, but that's what makes it exciting. It's like buying a lottery ticket \u2014 except your miner buys millions of tickets every second, 24 hours a day.

**Your current hashrate means you're making approximately {hashrate} guesses per second.**""",
        },
        {
            "id": "1-2",
            "track_id": "1",
            "order": 2,
            "title": "What is a Hash?",
            "estimated_minutes": 4,
            "content": """## What is a Hash?

A hash is the result of running data through a mathematical function called **SHA-256**. It always produces a fixed-length output that looks like random gibberish.

For example:
- Input: "Hello" -> Hash: `185f8db3271...`
- Input: "Hello!" -> Hash: `334d016f755...`

Notice how adding just one character completely changes the output? That's what makes hashing powerful \u2014 you can't predict the output, and you can't reverse-engineer the input.

### How Mining Uses Hashes

Your Bitaxe takes a block template (containing transactions waiting to be confirmed), adds a random number (the nonce), and hashes the whole thing. If the resulting hash starts with enough zeros, you've found a valid block!

The number of leading zeros required is determined by the **difficulty** \u2014 the higher the difficulty, the more zeros needed, and the harder it is to find a valid hash.

### Think of It Like This

Imagine rolling a 1,000-sided die and trying to get a number below 5. That's essentially what your miner does \u2014 but with numbers so large they're almost incomprehensible.""",
        },
        {
            "id": "1-3",
            "track_id": "1",
            "order": 3,
            "title": "What is Difficulty?",
            "estimated_minutes": 4,
            "content": """## Understanding Difficulty

Difficulty is a measure of how hard it is to find a valid hash. The Bitcoin network adjusts difficulty every 2,016 blocks (roughly every two weeks) to ensure blocks are found approximately every 10 minutes.

### Share Difficulty vs Network Difficulty

There are two types of difficulty you'll see on The Bitcoin Game:

1. **Share Difficulty** \u2014 The difficulty of the shares your miner submits to the pool. This is much lower than network difficulty and proves your miner is working.

2. **Network Difficulty** \u2014 The difficulty required to actually find a Bitcoin block. This is astronomically higher.

### The Numbers in Perspective

Your miner finds shares at difficulty around **{shareDiff}**. The current network difficulty is **{networkDiff}**. That means finding a block is approximately **{ratio} times harder** than finding a share.

### Why We Track Your Best Difficulty

Every share your miner submits has a difficulty score. Occasionally, by pure luck, your miner will find a share with an unusually high difficulty. We track your **best difficulty** because if that number ever reaches the network difficulty, you've found a block!

Your best difficulty this week is like your highest lottery ticket number. The closer it gets to the network difficulty, the closer you came to winning.""",
        },
        {
            "id": "1-4",
            "track_id": "1",
            "order": 4,
            "title": "The Block Lottery",
            "estimated_minutes": 4,
            "content": """## The Block Lottery

Finding a Bitcoin block with a Bitaxe is like winning the lottery. But unlike a regular lottery, you're playing 24/7, and your odds improve with every hash.

### How Probability Works

With a Bitaxe running at ~500 GH/s and a network difficulty of ~100T, your odds of finding a block in any given 10-minute window are roughly **1 in 200 million**.

That sounds impossible, but consider:
- There are 52,560 ten-minute windows in a year
- Your miner never sleeps
- The pool has thousands of miners contributing

### Solo vs Pool Mining

On The Bitcoin Game, you're **solo mining** \u2014 meaning if YOUR miner finds a block, YOU get the full 3.125 BTC reward. In a traditional pool, rewards are shared among all participants based on their hashrate contribution.

Solo mining with a Bitaxe is essentially playing the lottery. The expected time to find a block might be hundreds of years, but someone has to win, and it could be you on any given day.

### Every Sunday: Your Weekly Recap

Each week, we take your best difficulty share and turn it into a game. The weekly games show you how close you came to finding a block, making the experience fun even when you don't win the jackpot.""",
        },
        {
            "id": "1-5",
            "track_id": "1",
            "order": 5,
            "title": "Why This Matters for Bitcoin",
            "estimated_minutes": 4,
            "content": """## Why Solo Mining Matters

You might wonder: if my Bitaxe is so small compared to industrial miners, why bother?

### Decentralization

Bitcoin's security depends on mining being **distributed** across many participants. When mining is concentrated in a few large pools, it creates risks. Your Bitaxe, along with thousands of others, helps keep Bitcoin decentralized.

### Censorship Resistance

Large mining pools can be pressured by governments to censor certain transactions. Solo miners can't be censored \u2014 your Bitaxe will mine any valid transaction.

### Learning by Doing

Running a miner gives you first-hand understanding of how Bitcoin works. You're not just reading about it \u2014 you're participating in the network.

### The Movement

The solo mining movement (often called "pleb mining") is growing. Thousands of people around the world run small miners like Bitaxes. Together, they represent a meaningful portion of Bitcoin's hashrate and a powerful statement about decentralization.

**By running your Bitaxe, you're not just playing a game \u2014 you're helping secure the most important monetary network in human history.**""",
        },

        # =====================================================================
        # Track 2: Understanding Bitcoin (8 lessons)
        # =====================================================================
        {
            "id": "2-1",
            "track_id": "2",
            "order": 1,
            "title": "What is Money? Why Bitcoin?",
            "estimated_minutes": 6,
            "content": """## What is Money?

Money is a technology for storing and exchanging value. Throughout history, humans have used shells, salt, gold, and paper as money. Each had trade-offs in durability, portability, divisibility, and scarcity.

### The Problem with Modern Money

Government-issued currencies (fiat money) can be printed at will, diluting the value of your savings. Since 1971, when the US dollar was disconnected from gold, the purchasing power of the dollar has declined by over 85%.

### Enter Bitcoin

Bitcoin was created in 2009 by the pseudonymous Satoshi Nakamoto. It's the first form of money that is:

- **Scarce**: Only 21 million will ever exist
- **Digital**: Exists purely as information
- **Decentralized**: No single entity controls it
- **Permissionless**: Anyone can use it
- **Censorship-resistant**: No one can stop a valid transaction

Bitcoin combines the scarcity of gold with the portability of digital money.""",
        },
        {
            "id": "2-2",
            "track_id": "2",
            "order": 2,
            "title": "How Bitcoin Works",
            "estimated_minutes": 6,
            "content": """## How Bitcoin Works

At its core, Bitcoin is a shared ledger (the blockchain) maintained by thousands of computers around the world.

### Transactions

When you send Bitcoin, you create a transaction that says "I'm sending X bitcoin from address A to address B." This transaction is signed with your private key (like a digital signature) and broadcast to the network.

### Blocks

Transactions are grouped into blocks. Each block contains a reference to the previous block, forming a chain \u2014 the blockchain. This chain goes all the way back to the very first block (the "genesis block") created by Satoshi Nakamoto on January 3, 2009.

### Mining (Your Part!)

Miners like your Bitaxe compete to add the next block to the chain. The winner gets the block reward plus transaction fees. This process is called Proof of Work \u2014 it requires real energy expenditure, which is what gives Bitcoin its security.

### Consensus

All nodes on the network follow the same rules. If someone tries to cheat (double-spend, create coins out of thin air), their block will be rejected by every honest node.""",
        },
        {
            "id": "2-3",
            "track_id": "2",
            "order": 3,
            "title": "What is the Halving?",
            "estimated_minutes": 5,
            "content": """## The Halving

Every 210,000 blocks (approximately every 4 years), the block reward is cut in half. This event is called the **halving**.

### History of Halvings

- **2009**: Block reward starts at 50 BTC
- **2012**: First halving \u2014 reward drops to 25 BTC
- **2016**: Second halving \u2014 reward drops to 12.5 BTC
- **2020**: Third halving \u2014 reward drops to 6.25 BTC
- **2024**: Fourth halving \u2014 reward drops to 3.125 BTC
- **2028**: Next halving \u2014 reward will drop to 1.5625 BTC

### Why It Matters

The halving enforces Bitcoin's scarcity. Unlike fiat currencies where governments can print unlimited amounts, Bitcoin's supply schedule is mathematically fixed and known in advance.

By approximately 2140, the last Bitcoin will be mined. After that, miners will earn only transaction fees. The total supply will be exactly 21,000,000 BTC \u2014 no more, ever.

### Impact on Mining

Each halving reduces mining revenue by 50% (in BTC terms). This means the Bitcoin price must increase over time for mining to remain profitable \u2014 and historically, it always has.""",
        },
        {
            "id": "2-4",
            "track_id": "2",
            "order": 4,
            "title": "Bitcoin vs Traditional Finance",
            "estimated_minutes": 6,
            "content": """## Bitcoin vs Traditional Finance

### Speed

Traditional international wire transfers take 3-5 business days. Bitcoin transactions are confirmed in approximately 10 minutes, and the Lightning Network enables near-instant payments.

### Cost

International wire transfers cost $25-50+. Bitcoin on-chain transactions typically cost $1-5, and Lightning payments cost fractions of a cent.

### Access

2 billion people worldwide don't have access to banking. All you need for Bitcoin is a phone and internet connection.

### Control

With traditional banking, the bank controls your money. They can freeze your account, deny transactions, or even seize your funds. With Bitcoin, if you hold your own keys, no one can take your money.

### Transparency

Bitcoin's blockchain is a public ledger. Anyone can verify the total supply, transaction history, and mining activity. Try getting that level of transparency from a central bank.

### Trade-offs

Bitcoin isn't perfect. Transaction throughput is limited, price volatility can be high, and the learning curve is steep. But for its intended purpose \u2014 sovereign, censorship-resistant money \u2014 nothing else comes close.""",
        },
        {
            "id": "2-5",
            "track_id": "2",
            "order": 5,
            "title": "What is a Wallet?",
            "estimated_minutes": 5,
            "content": """## What is a Bitcoin Wallet?

A Bitcoin wallet doesn't actually store Bitcoin. Instead, it stores the **private keys** that give you the ability to spend Bitcoin associated with your addresses.

### Keys and Addresses

- **Private Key**: A secret number that proves ownership. Never share this.
- **Public Key**: Derived from the private key. Used to generate addresses.
- **Address**: What you give to people to receive Bitcoin (starts with bc1q, 1, or 3).

### Types of Wallets

**Hot Wallets** (connected to the internet):
- Mobile apps (e.g., Sparrow, BlueWallet)
- Desktop apps
- Web wallets

**Cold Wallets** (offline):
- Hardware wallets (e.g., ColdCard, Trezor, Ledger)
- Paper wallets
- Steel/metal backups

### The Golden Rule

"Not your keys, not your coins." If you don't control the private keys, you don't truly own the Bitcoin. Exchanges can get hacked, freeze withdrawals, or go bankrupt.

For any significant amount of Bitcoin, use a hardware wallet and keep your seed phrase backed up securely offline.""",
        },
        {
            "id": "2-6",
            "track_id": "2",
            "order": 6,
            "title": "Sending and Receiving Bitcoin",
            "estimated_minutes": 6,
            "content": """## Sending and Receiving Bitcoin

### Receiving Bitcoin

1. Open your wallet
2. Generate a new receiving address
3. Share the address with the sender (QR code or text)
4. Wait for the transaction to be confirmed

Pro tip: Use a new address for each transaction for better privacy.

### Sending Bitcoin

1. Get the recipient's Bitcoin address
2. Enter the amount to send
3. Set the fee (higher fee = faster confirmation)
4. Review and confirm the transaction
5. Your wallet signs the transaction with your private key
6. The transaction is broadcast to the network

### Confirmations

After your transaction is included in a block, it has 1 confirmation. Each subsequent block adds another confirmation. For most transactions, 3-6 confirmations is considered secure.

### Fees

Bitcoin transaction fees are based on the size of your transaction in bytes, not the amount being sent. Fees fluctuate based on network demand. You can check current fee rates before sending.

### Important: Transactions are Irreversible

Once a Bitcoin transaction is confirmed, it cannot be reversed. Always double-check the address before sending. There is no customer support to call.""",
        },
        {
            "id": "2-7",
            "track_id": "2",
            "order": 7,
            "title": "The Lightning Network",
            "estimated_minutes": 6,
            "content": """## The Lightning Network

The Lightning Network is a "Layer 2" solution built on top of Bitcoin that enables fast, cheap, and scalable payments.

### The Problem

Bitcoin's base layer can process about 7 transactions per second. For global adoption, that's not enough.

### How Lightning Works

1. Two parties open a **payment channel** by locking Bitcoin in a multi-signature address on-chain
2. They can then send unlimited transactions between each other instantly and nearly free
3. When they're done, they close the channel and the final balance is settled on-chain

### Network of Channels

You don't need a direct channel with everyone. Payments can be routed through a network of channels, hopping from node to node until they reach the destination.

### Benefits

- **Speed**: Payments confirm in milliseconds
- **Cost**: Fees are typically fractions of a cent
- **Scale**: Can handle millions of transactions per second
- **Privacy**: Individual transactions aren't recorded on the blockchain

### Real-World Use

Lightning is already used for everyday payments in many countries, tipping on social media, streaming sats for content, and micropayments that would be impractical on-chain.""",
        },
        {
            "id": "2-8",
            "track_id": "2",
            "order": 8,
            "title": "Bitcoin's Future",
            "estimated_minutes": 6,
            "content": """## Bitcoin's Future

Bitcoin has gone from a whitepaper written by an anonymous person to a trillion-dollar asset class in just 15 years. What comes next?

### Adoption Trends

- Nation-state adoption (El Salvador made Bitcoin legal tender in 2021)
- Institutional investment (ETFs, corporate treasuries)
- Growing Lightning Network for everyday payments
- Increasing solo mining with devices like the Bitaxe

### Technical Development

Bitcoin development is conservative by design \u2014 stability and security are prioritized over new features. Current areas of development include:

- **Taproot**: Enhanced privacy and smart contract capabilities
- **Lightning**: Continued scaling improvements
- **Mining**: More efficient hardware, renewable energy adoption

### The Solo Mining Renaissance

Devices like the Bitaxe represent a return to Bitcoin's roots \u2014 individual miners participating in the network. As more people run small miners, the network becomes more decentralized and resilient.

### Your Role

By running a Bitaxe and learning about Bitcoin, you're part of a global movement. Whether or not your miner finds a block, you're contributing to the security and decentralization of the most important monetary innovation in generations.

**Keep mining. Keep learning. Keep stacking.**""",
        },

        # =====================================================================
        # Track 3: Securing Your Bitcoin (5 lessons)
        # =====================================================================
        {
            "id": "3-1",
            "track_id": "3",
            "order": 1,
            "title": "Hardware Wallets Explained",
            "estimated_minutes": 6,
            "content": """## Hardware Wallets

A hardware wallet is a physical device that stores your private keys offline. It's the gold standard for Bitcoin security.

### How They Work

Your private keys never leave the device. When you want to send Bitcoin, the transaction is sent to the hardware wallet, signed inside the device, and the signed transaction is sent back \u2014 all without the private key ever being exposed to your computer.

### Popular Hardware Wallets

- **ColdCard**: Bitcoin-only, air-gapped, considered the most secure
- **Trezor**: Open-source, supports multiple coins
- **Ledger**: Popular but closed-source secure element
- **Jade**: Open-source, by Blockstream

### Why Not Just Use a Phone App?

Phone and desktop wallets are "hot wallets" \u2014 they're connected to the internet, making them vulnerable to malware, hacking, and phishing. Hardware wallets eliminate these attack vectors by keeping keys offline.

### When to Get One

If you have more Bitcoin than you'd be comfortable losing, it's time for a hardware wallet. Many people consider $500-1000 as the threshold, but there's no wrong time to improve your security.""",
        },
        {
            "id": "3-2",
            "track_id": "3",
            "order": 2,
            "title": "Seed Phrases \u2014 Your Master Key",
            "estimated_minutes": 6,
            "content": """## Seed Phrases

When you set up a hardware wallet, it generates a **seed phrase** \u2014 typically 12 or 24 words that encode your master private key.

### What It Is

The seed phrase is the ultimate backup of your Bitcoin. From these words, every private key and address in your wallet can be regenerated. If your hardware wallet breaks, is lost, or stolen, you can restore everything with just the seed phrase.

### Critical Rules

1. **Write it down on paper or metal** \u2014 never store digitally
2. **Never photograph it** \u2014 photos sync to cloud services
3. **Never type it into a website** \u2014 no legitimate service will ask for it
4. **Never share it with anyone** \u2014 not support, not friends, no one
5. **Store it in a secure location** \u2014 safe, safety deposit box, etc.

### What If Someone Gets Your Seed Phrase?

They have complete access to all your Bitcoin. There is no recovery, no customer support, no reversal. Your seed phrase IS your Bitcoin.

### Passphrase (25th Word)

Advanced users can add a passphrase (sometimes called the "25th word") for additional security. This creates a completely different wallet from the same seed words.""",
        },
        {
            "id": "3-3",
            "track_id": "3",
            "order": 3,
            "title": "Self-Custody Best Practices",
            "estimated_minutes": 6,
            "content": """## Self-Custody Best Practices

Taking custody of your own Bitcoin is empowering \u2014 and a responsibility.

### The Basics

1. **Use a hardware wallet** for significant amounts
2. **Back up your seed phrase** on metal (fire/water resistant)
3. **Test your backup** \u2014 restore a small amount before loading it up
4. **Use strong PINs** on your hardware wallet
5. **Keep firmware updated** on your devices

### Operational Security

- Don't tell people how much Bitcoin you own
- Use a dedicated computer for Bitcoin transactions if possible
- Verify receiving addresses on the hardware wallet screen, not just your computer
- Be skeptical of all unsolicited messages about Bitcoin

### Multi-Signature Setups

For larger amounts, consider a multi-signature wallet that requires 2-of-3 or 3-of-5 keys to sign a transaction. This protects against loss of a single key and provides redundancy.

### Inheritance Planning

What happens to your Bitcoin if something happens to you? Consider:
- A sealed letter with instructions (not the seed phrase itself)
- A multi-sig setup where a trusted party holds one key
- A time-locked transaction as a dead-man's switch""",
        },
        {
            "id": "3-4",
            "track_id": "3",
            "order": 4,
            "title": "Setting Up Your First Wallet",
            "estimated_minutes": 6,
            "content": """## Setting Up Your First Wallet

Let's walk through setting up a hardware wallet step by step.

### Before You Start

- Buy your hardware wallet directly from the manufacturer
- Make sure the packaging is sealed and untampered
- Have pen and paper ready for your seed phrase
- Set aside 30 minutes of uninterrupted time

### Step-by-Step

1. **Unbox and connect** the device to your computer
2. **Install the companion app** (Sparrow Wallet is recommended for Bitcoin)
3. **Initialize the device** \u2014 it will generate your seed phrase
4. **Write down your seed phrase** carefully on paper
5. **Verify your seed phrase** \u2014 the device will quiz you
6. **Set a strong PIN** (6+ digits recommended)
7. **Generate your first receiving address**
8. **Send a small test amount** to verify everything works
9. **Store your seed phrase** in a secure location

### Important Notes

- Never rush this process
- Double-check every word of your seed phrase
- The seed phrase IS your wallet \u2014 the hardware is just a convenience
- Consider ordering a metal seed phrase backup (steel plates)

### Your Mining Rewards

If you find a block with your Bitaxe, the 3.125 BTC reward will go to the address configured in your mining settings. Make sure that address belongs to a wallet you control!""",
        },
        {
            "id": "3-5",
            "track_id": "3",
            "order": 5,
            "title": "Backup Strategies",
            "estimated_minutes": 6,
            "content": """## Backup Strategies

Your backup strategy is the difference between losing everything and sleeping soundly.

### Paper Backup

- Write seed phrase clearly on acid-free paper
- Store in a fireproof safe
- Consider making two copies in different locations
- Pros: Simple, no special equipment needed
- Cons: Vulnerable to fire, water, degradation

### Metal Backup

- Stamp or engrave seed words into steel/titanium plates
- Products: Seedplate, Blockplate, Cryptosteel
- Survives fire up to 1,500\u00b0C, water, crushing
- Pros: Nearly indestructible
- Cons: More expensive, takes time to set up

### Geographic Distribution

The 3-2-1 rule:
- **3** copies of your backup
- **2** different media types (paper + metal)
- **1** offsite location

### What NOT to Do

- Don't store seed phrases in cloud storage
- Don't take photos of your seed phrase
- Don't store in a password manager
- Don't split your seed phrase across locations (it weakens security)
- Don't use a "brain wallet" (memorization alone)

### Regular Verification

Check your backups periodically. Make sure they're readable, intact, and accessible. A backup you can't access when needed is no backup at all.""",
        },

        # =====================================================================
        # Track 4: Running a Node (6 lessons)
        # =====================================================================
        {
            "id": "4-1",
            "track_id": "4",
            "order": 1,
            "title": "Why Run a Node?",
            "estimated_minutes": 5,
            "content": """## Why Run a Bitcoin Node?

A Bitcoin node is a computer running the Bitcoin software that validates every transaction and block. It's your own copy of the entire Bitcoin blockchain.

### Verification, Not Trust

When you use someone else's node (like an exchange or a block explorer), you're trusting them to give you accurate information. Running your own node means you verify everything yourself.

"Don't trust, verify" \u2014 this is the Bitcoin ethos.

### Benefits

1. **Privacy**: Your transactions aren't broadcast through a third party
2. **Security**: You validate your own transactions
3. **Independence**: No reliance on external services
4. **Network health**: Every node strengthens the network
5. **Badge**: Earn the "Node Runner" badge on The Bitcoin Game!

### What a Node Does

- Downloads and validates the entire blockchain (~600 GB)
- Verifies every transaction follows the rules
- Relays valid transactions and blocks to other nodes
- Rejects invalid transactions and blocks
- Provides wallet functionality for maximum privacy""",
        },
        {
            "id": "4-2",
            "track_id": "4",
            "order": 2,
            "title": "Hardware Requirements",
            "estimated_minutes": 5,
            "content": """## Hardware for Running a Node

You don't need a powerful computer to run a Bitcoin node. Here's what you need:

### Minimum Requirements

- **CPU**: Any modern processor (even a Raspberry Pi 4 works)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Storage**: 1 TB SSD (the blockchain is ~600 GB and growing)
- **Internet**: Stable connection, no data cap preferred

### Popular Node Hardware

**Raspberry Pi Setup** (~$150-200):
- Raspberry Pi 4/5 (4GB+ RAM)
- 1 TB NVMe SSD with USB adapter
- Case with fan cooling
- Power supply

**Dedicated Mini PC** (~$200-400):
- Intel NUC or similar
- 8 GB RAM
- 1 TB NVMe SSD
- More powerful, faster sync

**Pre-built Node** (~$300-500):
- Start9, Umbrel, or similar
- Plug-and-play experience
- Includes node management software
- Great for beginners

### Storage Considerations

The blockchain grows by about 50-80 GB per year. A 2 TB drive will last you many years. SSDs are strongly recommended over HDDs for performance.""",
        },
        {
            "id": "4-3",
            "track_id": "4",
            "order": 3,
            "title": "Step-by-Step Node Setup",
            "estimated_minutes": 7,
            "content": """## Setting Up Your Bitcoin Node

### Option 1: Bitcoin Core (Direct)

1. Download Bitcoin Core from bitcoincore.org
2. Verify the download signature
3. Install and run
4. Wait for Initial Block Download (IBD) \u2014 this takes 1-7 days
5. Configure your firewall to allow port 8333

### Option 2: Start9 or Umbrel (Recommended for Beginners)

1. Flash the OS image to your SSD
2. Boot your node hardware
3. Follow the web-based setup wizard
4. Select Bitcoin Core from the app marketplace
5. Start syncing

### Initial Block Download (IBD)

Your node needs to download and verify every block since January 3, 2009. This process:
- Downloads ~600 GB of data
- Validates every transaction in history
- Takes 1-7 days depending on hardware and internet
- Uses significant CPU during validation

### Configuration Tips

- Allow port 8333 through your firewall to help the network
- Enable automatic pruning if you have limited storage
- Set -dbcache=4096 (or more) during IBD for faster sync
- Consider running Tor for privacy

### After Setup

Once synced, your node quietly runs in the background, validating blocks as they come in. It typically uses minimal resources during normal operation.""",
        },
        {
            "id": "4-4",
            "track_id": "4",
            "order": 4,
            "title": "Connecting Your Miner to Your Node",
            "estimated_minutes": 6,
            "content": """## Connecting Your Bitaxe to Your Node

The ultimate setup: your Bitaxe mining through your own node. Maximum sovereignty.

### Why Connect to Your Own Node?

- You validate your own blocks
- No trusted third parties in the entire mining process
- You choose which transactions to include
- True solo mining in every sense

### Setup with CKPool

1. Install ckpool/ckproxy on your node
2. Configure it to use your Bitcoin Core instance
3. Point your Bitaxe stratum settings to your node's IP
4. Your Bitaxe now mines through YOUR node

### Setup with Public Solo Pools

If running your own stratum server is too complex, you can still connect your node to The Bitcoin Game's pool while using your node for block validation and wallet functionality.

### The Config

```
Stratum URL: stratum+tcp://[your-node-ip]:3333
Username: [your-btc-address]
Password: x
```

### Verification

After connecting, check your node's logs to confirm:
- Your Bitaxe is connecting successfully
- Shares are being submitted
- Block templates are being generated from your node's mempool""",
        },
        {
            "id": "4-5",
            "track_id": "4",
            "order": 5,
            "title": "Node Maintenance",
            "estimated_minutes": 6,
            "content": """## Maintaining Your Node

Running a node is mostly hands-off, but occasional maintenance keeps things running smoothly.

### Regular Tasks

**Weekly:**
- Check that your node is synced (compare block height with a block explorer)
- Monitor disk space usage

**Monthly:**
- Check for Bitcoin Core updates
- Review log files for errors
- Verify your backup configuration

**Quarterly:**
- Update Bitcoin Core when new versions are released
- Clean up old log files
- Check hardware health (temperatures, disk health)

### Troubleshooting Common Issues

**Node falls behind / not syncing:**
- Check internet connection
- Restart Bitcoin Core
- Check disk space

**High disk usage:**
- Enable pruning: set prune=550 in bitcoin.conf
- This keeps only recent blocks (minimum 550 MB)

**High CPU usage:**
- Normal during IBD
- If persistent, check for reindexing
- Reduce maxconnections if needed

### Updates

When updating Bitcoin Core:
1. Stop the running instance
2. Download the new version
3. Verify the signature
4. Install and restart
5. Your node will continue from where it left off""",
        },
        {
            "id": "4-6",
            "track_id": "4",
            "order": 6,
            "title": "Earn the Node Runner Badge",
            "estimated_minutes": 5,
            "content": """## Earn the "Node Runner" Badge

Running a Bitcoin node is a significant contribution to the network. On The Bitcoin Game, it's recognized with the **Node Runner** badge.

### Badge Tiers

- **Node Runner** (Rare, 150 XP): Verified running any Bitcoin full node
- **Pruned but Proud** (Common, 100 XP): Running a pruned node
- **Archival Node** (Epic, 250 XP): Running a full archival node

### How to Verify

1. Go to Settings > Node Verification
2. Enter your node's Tor onion address or IP
3. Our system will check:
   - Node is reachable
   - Running Bitcoin Core
   - Blockchain is synced
   - Node version
4. Badge awarded upon successful verification!

### What Counts

- Bitcoin Core (any version in the last 2 major releases)
- Must be synced to within 10 blocks of tip
- Must be reachable for verification
- Pruned nodes count for "Pruned but Proud"
- Full archival nodes (no pruning) qualify for "Archival Node"

### The Stats

Currently, only about **15%** of The Bitcoin Game's users run their own node. By running one, you're in an elite group of sovereign Bitcoiners.

**Keep your node running, keep the network strong!**""",
        },
    ]

    op.bulk_insert(lessons_table, lessons)
