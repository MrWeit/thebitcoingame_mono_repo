/* ── Shop Mock Data for The Bitcoin Game Store ── */

export type ProductCategory = "miners" | "nodes" | "bundles" | "merch";

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductReview {
  author: string;
  rating: number;
  date: string;
  text: string;
}

export interface Product {
  slug: string;
  name: string;
  category: ProductCategory;
  shortDescription: string;
  longDescription: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  specs: ProductSpec[];
  inStock: boolean;
  badge?: "BEST SELLER" | "NEW" | "SALE" | "LIMITED";
  relatedSlugs: string[];
  reviews: ProductReview[];
  whatsIncluded?: string[];
  setupGuide?: string[];
}

export interface CategoryInfo {
  slug: string;
  name: string;
  description: string;
  icon: string; // Phosphor icon name
  productCount: number;
  startingPrice: number;
}

/* ── Category Definitions ── */
export const shopCategories: CategoryInfo[] = [
  {
    slug: "miners",
    name: "Miners",
    description: "Bitaxe, NerdAxe, and other solo mining hardware. Quiet, efficient, and ready to mine.",
    icon: "Hammer",
    productCount: 6,
    startingPrice: 59,
  },
  {
    slug: "nodes",
    name: "Nodes",
    description: "Run your own Bitcoin full node. Verify everything. Be sovereign.",
    icon: "Desktop",
    productCount: 3,
    startingPrice: 199,
  },
  {
    slug: "bundles",
    name: "Starter Kits",
    description: "Perfect gift bundles for new Bitcoiners. Miner + wallet + guide — everything in one box.",
    icon: "Gift",
    productCount: 4,
    startingPrice: 69,
  },
  {
    slug: "merch",
    name: "Merchandise",
    description: "World Cup jerseys, badge pins, mining gear. Represent your mining identity.",
    icon: "TShirt",
    productCount: 6,
    startingPrice: 9,
  },
];

/* ── Featured Products (slugs) ── */
export const featuredProductSlugs = [
  "bitaxe-ultra",
  "ultimate-bundle",
  "start9-embassy",
  "world-cup-jersey",
  "nerdaxe",
  "beginner-bundle",
];

/* ── Special Offer ── */
export const specialOffer = {
  title: "Bitaxe Ultra Bundle",
  description: "Bitaxe Ultra + Trezor Safe 3 + Steel Seed Plate",
  price: 299,
  originalPrice: 379,
  savings: 80,
  slug: "ultimate-bundle",
  category: "bundles" as ProductCategory,
};

/* ── Miners (6 products) ── */
const miners: Product[] = [
  {
    slug: "bitaxe-ultra",
    name: "Bitaxe Ultra",
    category: "miners",
    shortDescription: "The fastest open-source home miner",
    longDescription:
      "The Bitaxe Ultra is the flagship open-source Bitcoin miner designed for home use. With 1.2 TH/s of SHA-256 hashrate at just 15 watts, it's the perfect device to start solo mining and join The Bitcoin Game. Silent operation, WiFi connectivity, and a beautiful OLED display make this the gold standard of home mining hardware. Pre-configured for TheBitcoinGame.com — plug in, connect to WiFi, and start playing within minutes.",
    price: 249,
    rating: 4.9,
    reviewCount: 124,
    specs: [
      { label: "Hashrate", value: "1.2 TH/s" },
      { label: "Power", value: "15W" },
      { label: "Chip", value: "BM1368" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "WiFi + USB-C" },
      { label: "Weight", value: "240g" },
      { label: "Display", value: "0.96\" OLED" },
      { label: "Cooling", value: "Active (40mm fan)" },
    ],
    inStock: true,
    badge: "BEST SELLER",
    relatedSlugs: ["bitaxe-gamma", "bitaxe-hex", "ultimate-bundle"],
    whatsIncluded: [
      "Bitaxe Ultra unit",
      "USB-C power cable",
      "Quick start guide",
      "Pre-configured for TheBitcoinGame.com",
      "Hex wrench for heatsink",
    ],
    setupGuide: [
      "Unbox and connect the USB-C cable to a 5V/3A power supply",
      "The Bitaxe creates a WiFi hotspot — connect from your phone",
      "Enter your home WiFi credentials in the web interface",
      "Set your stratum URL to solo.thebitcoingame.com:3333",
      "Enter your Bitcoin address and click Save",
      "Watch your dashboard light up on thebitcoingame.com!",
    ],
    reviews: [
      { author: "SatoshiFan42", rating: 5, date: "2026-01-15", text: "This thing is amazing. Silent, efficient, and the OLED display is a nice touch. Found my first billion-difficulty share within a week!" },
      { author: "BitcoinMike", rating: 5, date: "2026-01-10", text: "Upgraded from the Gamma and the difference is noticeable. 1.2 TH/s is insane for 15 watts. Setup took literally 3 minutes." },
      { author: "MiningNewbie", rating: 5, date: "2025-12-28", text: "My first miner ever. The pre-configuration for TheBitcoinGame made it so easy — I was mining within 5 minutes of opening the box." },
      { author: "HashMasterDE", rating: 4, date: "2025-12-20", text: "Great hardware, only wish it came with the power supply included. Had to buy a USB-C PD adapter separately." },
      { author: "NodeRunner01", rating: 5, date: "2025-12-15", text: "Running 3 of these. Best hashrate-per-watt ratio on the market. The games on TBG make mining actually fun." },
    ],
  },
  {
    slug: "bitaxe-gamma",
    name: "Bitaxe Gamma",
    category: "miners",
    shortDescription: "Best value for beginners",
    longDescription:
      "The Bitaxe Gamma delivers excellent performance at an accessible price point. With 500 GH/s hashrate and just 12 watts of power consumption, it's the ideal entry point for new solo miners. The compact form factor sits quietly on any desk, and the built-in WiFi makes setup a breeze. Start your mining journey without breaking the bank.",
    price: 89,
    rating: 4.7,
    reviewCount: 89,
    specs: [
      { label: "Hashrate", value: "500 GH/s" },
      { label: "Power", value: "12W" },
      { label: "Chip", value: "BM1366" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "WiFi + USB-C" },
      { label: "Weight", value: "180g" },
    ],
    inStock: true,
    relatedSlugs: ["bitaxe-ultra", "nerdaxe", "beginner-bundle"],
    whatsIncluded: ["Bitaxe Gamma unit", "USB-C cable", "Quick start card"],
    setupGuide: [
      "Connect USB-C power (5V/2A minimum)",
      "Join the Bitaxe WiFi hotspot from your phone",
      "Configure home WiFi in the web interface",
      "Set stratum to solo.thebitcoingame.com:3333",
      "Enter your Bitcoin address and start mining!",
    ],
    reviews: [
      { author: "NewMiner2026", rating: 5, date: "2026-01-20", text: "Perfect first miner. Quiet enough for my bedroom and the games on TBG make it exciting." },
      { author: "CryptoRio", rating: 4, date: "2026-01-08", text: "Good value but I wish it had the OLED display like the Ultra. Still, great performance for the price." },
      { author: "BitaxeBob", rating: 5, date: "2025-12-30", text: "Bought 5 of these for my family. Everyone is now competing on the leaderboard!" },
    ],
  },
  {
    slug: "nerdaxe",
    name: "NerdAxe",
    category: "miners",
    shortDescription: "Open source champion",
    longDescription:
      "The NerdAxe is a fully open-source Bitcoin miner built by the community, for the community. At 480 GH/s and just 10 watts, it offers the best power efficiency in its class. The exposed PCB design has become iconic in the solo mining community, and the active development community means regular firmware updates and improvements.",
    price: 59,
    rating: 4.8,
    reviewCount: 201,
    specs: [
      { label: "Hashrate", value: "480 GH/s" },
      { label: "Power", value: "10W" },
      { label: "Chip", value: "BM1366" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "WiFi" },
      { label: "Weight", value: "120g" },
    ],
    inStock: true,
    relatedSlugs: ["bitaxe-gamma", "beginner-bundle", "lucky-miner-lv06"],
    whatsIncluded: ["NerdAxe PCB assembly", "USB-C cable", "Sticker pack"],
    setupGuide: [
      "Power via USB-C (5V/2A)",
      "Connect to NerdAxe hotspot",
      "Configure WiFi and stratum settings",
      "Set pool to solo.thebitcoingame.com:3333",
      "You're mining!",
    ],
    reviews: [
      { author: "OpenSourceMax", rating: 5, date: "2026-02-01", text: "Love that this is fully open source. The community firmware updates are fantastic." },
      { author: "MiningViking", rating: 5, date: "2026-01-18", text: "Running 10 of these little guys. Best watts-per-hash in the game. Norway approves." },
      { author: "TechReviewer", rating: 4, date: "2026-01-05", text: "Great miner but the exposed PCB design isn't for everyone. Consider a case if you have pets or kids." },
    ],
  },
  {
    slug: "bitaxe-hex",
    name: "Bitaxe Hex",
    category: "miners",
    shortDescription: "Maximum home hashrate",
    longDescription:
      "The Bitaxe Hex pushes home mining to its limits with 3.0 TH/s of hashrate. Six ASIC chips work in harmony to deliver unprecedented performance in a desktop form factor. At 18 watts, it's remarkably efficient for its class. This is the miner for serious solo miners who want the best possible odds.",
    price: 399,
    rating: 4.9,
    reviewCount: 47,
    specs: [
      { label: "Hashrate", value: "3.0 TH/s" },
      { label: "Power", value: "18W" },
      { label: "Chips", value: "6x BM1368" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "WiFi + USB-C" },
      { label: "Weight", value: "380g" },
      { label: "Display", value: "1.3\" OLED" },
      { label: "Cooling", value: "Dual 40mm fans" },
    ],
    inStock: true,
    badge: "NEW",
    relatedSlugs: ["bitaxe-ultra", "ultimate-bundle", "nerdaxe"],
    whatsIncluded: ["Bitaxe Hex unit", "USB-C PD cable", "Power supply (20V/2A)", "Quick start guide", "Premium carry case"],
    setupGuide: [
      "Connect the included 20V power supply via USB-C",
      "Join the Bitaxe Hex WiFi hotspot",
      "Configure your network and stratum settings",
      "Set pool to solo.thebitcoingame.com:3333",
      "Enter your Bitcoin address",
      "Watch 3 TH/s of hashing power light up your dashboard!",
    ],
    reviews: [
      { author: "WhaleHash", rating: 5, date: "2026-02-05", text: "3 TH/s on my desk. This is the future of home mining. My difficulty scores have gone through the roof." },
      { author: "SatoshiHunter42", rating: 5, date: "2026-01-28", text: "Worth every penny. The dual fans keep it cool and quiet. Premium feel all around." },
      { author: "BlockChaser99", rating: 5, date: "2026-01-20", text: "Upgraded from the Ultra. The jump from 1.2 to 3.0 TH/s is incredible. Finding billion-difficulty shares daily." },
    ],
  },
  {
    slug: "lucky-miner-lv06",
    name: "Lucky Miner LV06",
    category: "miners",
    shortDescription: "Compact and affordable",
    longDescription:
      "The Lucky Miner LV06 packs 500 GH/s into one of the smallest Bitcoin miners available. Its ultra-compact design makes it perfect for tight spaces, and the built-in screen shows real-time hashrate and share statistics. A great choice for miners who want performance without the footprint.",
    price: 69,
    rating: 4.5,
    reviewCount: 156,
    specs: [
      { label: "Hashrate", value: "500 GH/s" },
      { label: "Power", value: "12W" },
      { label: "Chip", value: "BM1366" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "WiFi" },
      { label: "Weight", value: "150g" },
    ],
    inStock: true,
    relatedSlugs: ["nerdaxe", "bitaxe-gamma", "beginner-bundle"],
    whatsIncluded: ["Lucky Miner LV06 unit", "USB-C cable"],
    setupGuide: [
      "Power via USB-C",
      "Connect to the miner's WiFi hotspot",
      "Set stratum to solo.thebitcoingame.com:3333",
      "Add your Bitcoin address and save",
      "Mining starts automatically!",
    ],
    reviews: [
      { author: "CompactMiner", rating: 5, date: "2026-01-25", text: "Tiny but mighty. Fits on my monitor stand and I forget it's even there." },
      { author: "BudgetMiner", rating: 4, date: "2026-01-12", text: "Great for the price. Not as polished as the Bitaxe but gets the job done." },
      { author: "StackingSats", rating: 5, date: "2025-12-30", text: "My bedroom miner. Dead silent and the screen is fun to watch." },
    ],
  },
  {
    slug: "antminer-s9-refurb",
    name: "Antminer S9 (Refurb)",
    category: "miners",
    shortDescription: "Industrial-grade, refurbished",
    longDescription:
      "The legendary Bitmain Antminer S9 — fully refurbished and tested. At 14 TH/s, it dwarfs home miners in raw hashrate. However, at 1400W power consumption, it's not for everyone. Best suited for miners with cheap electricity who want maximum hashrate. Each unit is professionally cleaned, re-pasted, and tested for 48 hours before shipping.",
    price: 149,
    rating: 4.2,
    reviewCount: 312,
    specs: [
      { label: "Hashrate", value: "14 TH/s" },
      { label: "Power", value: "1400W" },
      { label: "Chips", value: "189x BM1387" },
      { label: "Algorithm", value: "SHA-256" },
      { label: "Interface", value: "Ethernet" },
      { label: "Weight", value: "4.2kg" },
      { label: "Noise", value: "76 dB" },
      { label: "Cooling", value: "Dual industrial fans" },
    ],
    inStock: true,
    badge: "SALE",
    relatedSlugs: ["bitaxe-hex", "bitaxe-ultra", "nerdaxe"],
    whatsIncluded: ["Refurbished Antminer S9", "Power cable", "Ethernet cable", "Test report certificate"],
    setupGuide: [
      "Place in a well-ventilated area (this miner is LOUD)",
      "Connect Ethernet cable to your router",
      "Connect power supply (APW3++ or compatible, sold separately)",
      "Access the web interface via your router's DHCP client list",
      "Configure pool to solo.thebitcoingame.com:3333",
      "Enter your Bitcoin address and worker name",
    ],
    reviews: [
      { author: "GarageMinER", rating: 4, date: "2026-01-30", text: "Put this in my garage. Loud as a jet engine but 14 TH/s for $149 is unbeatable. Heats the garage nicely in winter." },
      { author: "IndustrialMike", rating: 4, date: "2026-01-18", text: "Refurb quality was great. Been running 3 weeks straight with no issues." },
      { author: "PowerBill", rating: 3, date: "2026-01-05", text: "Amazing hashrate but my electricity bill went up $40/month. Only worth it if you have cheap power." },
    ],
  },
];

/* ── Nodes (3 products) ── */
const nodes: Product[] = [
  {
    slug: "start9-embassy",
    name: "Start9 Embassy",
    category: "nodes",
    shortDescription: "Plug-and-play Bitcoin + Lightning node",
    longDescription:
      "The Start9 Embassy is the premium Bitcoin node experience. Running Bitcoin Core and Lightning Network out of the box, it gives you complete sovereignty over your transactions. The beautiful web interface makes managing your node as easy as using an app. Verify your own transactions, run your own Lightning channels, and truly be your own bank.",
    price: 499,
    rating: 4.8,
    reviewCount: 87,
    specs: [
      { label: "Processor", value: "Quad-core ARM" },
      { label: "RAM", value: "8GB" },
      { label: "Storage", value: "1TB NVMe SSD" },
      { label: "Software", value: "StartOS" },
      { label: "Bitcoin Core", value: "Pre-installed" },
      { label: "Lightning", value: "LND / CLN" },
      { label: "Tor", value: "Built-in" },
      { label: "Interface", value: "Ethernet + WiFi" },
    ],
    inStock: true,
    relatedSlugs: ["umbrel-home", "raspiblitz-diy", "bitaxe-ultra"],
    whatsIncluded: ["Start9 Embassy unit", "Power adapter", "Ethernet cable", "Quick start guide", "Recovery seed card"],
    setupGuide: [
      "Connect Ethernet and power",
      "Visit embassy.local in your browser",
      "Create your master password",
      "Bitcoin Core begins syncing automatically (takes 2-3 days)",
      "Install Lightning and other services from the marketplace",
      "Connect your wallet to your own node!",
    ],
    reviews: [
      { author: "Sovereign99", rating: 5, date: "2026-01-22", text: "The interface is beautiful. Finally running my own node without any command line. This is what sovereignty looks like." },
      { author: "LightningFan", rating: 5, date: "2026-01-10", text: "Running 5 Lightning channels through this. Rock solid for months." },
      { author: "PrivacyMax", rating: 4, date: "2025-12-28", text: "Love the Tor integration. Only wish it had more storage options out of the box." },
    ],
  },
  {
    slug: "umbrel-home",
    name: "Umbrel Home",
    category: "nodes",
    shortDescription: "Beautiful home server for Bitcoin",
    longDescription:
      "Umbrel Home is where design meets sovereignty. The stunning hardware and intuitive app store make running a Bitcoin node feel like using a premium consumer product. Install Bitcoin Core, Lightning, and dozens of self-hosted apps from the Umbrel App Store. The sleek enclosure looks great in any home setup.",
    price: 449,
    rating: 4.7,
    reviewCount: 134,
    specs: [
      { label: "Processor", value: "Quad-core ARM" },
      { label: "RAM", value: "8GB" },
      { label: "Storage", value: "1TB SSD" },
      { label: "Software", value: "umbrelOS" },
      { label: "App Store", value: "100+ apps" },
      { label: "Interface", value: "Ethernet + WiFi" },
    ],
    inStock: true,
    badge: "BEST SELLER",
    relatedSlugs: ["start9-embassy", "raspiblitz-diy", "bitaxe-ultra"],
    whatsIncluded: ["Umbrel Home unit", "Power adapter", "Ethernet cable", "Setup guide"],
    setupGuide: [
      "Connect Ethernet and power",
      "Visit umbrel.local in your browser",
      "Follow the setup wizard",
      "Install Bitcoin Core from the App Store",
      "Wait for initial block download (2-4 days)",
      "Point your wallet to your own node!",
    ],
    reviews: [
      { author: "DesignLover", rating: 5, date: "2026-02-01", text: "The most beautiful piece of Bitcoin hardware I own. The app store is incredible." },
      { author: "HomeServer", rating: 5, date: "2026-01-15", text: "Running Bitcoin, Lightning, Nextcloud, and Pi-hole all on one device. Amazing." },
      { author: "TechSkeptic", rating: 4, date: "2026-01-02", text: "Great UI but occasional slowdowns when syncing. 8GB RAM feels tight with many apps." },
    ],
  },
  {
    slug: "raspiblitz-diy",
    name: "RaspiBlitz DIY Kit",
    category: "nodes",
    shortDescription: "DIY Raspberry Pi node kit",
    longDescription:
      "For the builders and tinkerers — the RaspiBlitz DIY Kit gives you everything you need to build your own Bitcoin and Lightning node from scratch. Based on the legendary RaspiBlitz project, this kit includes a Raspberry Pi 5, SSD, touchscreen, and custom case. Learn how Bitcoin works at the deepest level while building your own sovereign infrastructure.",
    price: 199,
    rating: 4.6,
    reviewCount: 203,
    specs: [
      { label: "Computer", value: "Raspberry Pi 5" },
      { label: "RAM", value: "8GB" },
      { label: "Storage", value: "1TB USB SSD" },
      { label: "Display", value: "3.5\" LCD Touchscreen" },
      { label: "Software", value: "RaspiBlitz OS" },
      { label: "Assembly", value: "Required (~30 min)" },
    ],
    inStock: true,
    relatedSlugs: ["start9-embassy", "umbrel-home", "beginner-bundle"],
    whatsIncluded: ["Raspberry Pi 5 (8GB)", "1TB USB SSD", "3.5\" LCD touchscreen", "Custom 3D-printed case", "Power supply", "microSD card (pre-flashed)", "Assembly guide"],
    setupGuide: [
      "Assemble the case and attach the touchscreen",
      "Insert the pre-flashed microSD card",
      "Connect the SSD via USB",
      "Connect power and Ethernet",
      "Follow the LCD prompts to set up",
      "Bitcoin Core begins syncing (3-5 days on Pi)",
    ],
    reviews: [
      { author: "DIYBitcoin", rating: 5, date: "2026-01-28", text: "Building this taught me more about Bitcoin than any book. The touchscreen is great for monitoring." },
      { author: "PiEnthusiast", rating: 5, date: "2026-01-10", text: "Perfect weekend project. Assembly took 20 minutes, then just wait for the blockchain to sync." },
      { author: "FirstNode", rating: 4, date: "2025-12-20", text: "Good kit but syncing on Pi takes forever. Wish they offered an SSD with pre-synced blockchain." },
    ],
  },
];

/* ── Starter Kits (4 bundles) ── */
const bundles: Product[] = [
  {
    slug: "beginner-bundle",
    name: "Beginner Bundle",
    category: "bundles",
    shortDescription: "Start mining for less",
    longDescription:
      "The perfect entry point into Bitcoin mining. This bundle includes a NerdAxe miner, our comprehensive quick start guide, and a pack of mining-themed stickers to show off your new hobby. Everything you need to set up your first miner and join The Bitcoin Game in under 10 minutes.",
    price: 69,
    originalPrice: 79,
    rating: 4.8,
    reviewCount: 89,
    specs: [
      { label: "Miner", value: "NerdAxe (480 GH/s)" },
      { label: "Guide", value: "Printed quick start" },
      { label: "Extras", value: "Sticker pack (10)" },
      { label: "Savings", value: "$10" },
    ],
    inStock: true,
    relatedSlugs: ["nerdaxe", "solo-miner-kit", "orange-pill-gift"],
    whatsIncluded: ["NerdAxe miner", "USB-C cable", "Printed quick start guide", "TheBitcoinGame sticker pack (10)", "Welcome card with QR code"],
    reviews: [
      { author: "NewToMining", rating: 5, date: "2026-01-25", text: "Perfect starter kit. The guide made everything crystal clear. Mining in 10 minutes!" },
      { author: "GiftGiver", rating: 5, date: "2026-01-15", text: "Bought this for my nephew. He was so excited to start mining Bitcoin!" },
      { author: "BudgetMiner", rating: 4, date: "2026-01-02", text: "Great value. The stickers are a fun touch." },
    ],
  },
  {
    slug: "solo-miner-kit",
    name: "Solo Miner Kit",
    category: "bundles",
    shortDescription: "Mine + secure your sats",
    longDescription:
      "The complete solo mining package. Includes the Bitaxe Gamma for mining, a Trezor Safe 3 hardware wallet to secure your Bitcoin, and a steel seed backup plate to protect your recovery phrase. This bundle has everything a solo miner needs — from generating hashrate to safely storing any rewards.",
    price: 199,
    originalPrice: 239,
    rating: 4.9,
    reviewCount: 67,
    specs: [
      { label: "Miner", value: "Bitaxe Gamma (500 GH/s)" },
      { label: "Wallet", value: "Trezor Safe 3" },
      { label: "Backup", value: "Steel seed plate" },
      { label: "Savings", value: "$40" },
    ],
    inStock: true,
    badge: "BEST SELLER",
    relatedSlugs: ["bitaxe-gamma", "ultimate-bundle", "beginner-bundle"],
    whatsIncluded: ["Bitaxe Gamma miner", "Trezor Safe 3 hardware wallet", "Steel seed backup plate", "Stamping tool for seed words", "Quick start guide"],
    reviews: [
      { author: "SecurityFirst", rating: 5, date: "2026-01-30", text: "Love that this includes proper seed backup. Most bundles skip security — not this one." },
      { author: "SoloMinerPT", rating: 5, date: "2026-01-18", text: "Everything I needed in one box. The steel plate gives real peace of mind." },
      { author: "BitcoinDad", rating: 5, date: "2026-01-05", text: "Gifted to myself for Christmas. No regrets. $40 savings is legit." },
    ],
  },
  {
    slug: "ultimate-bundle",
    name: "Ultimate Bundle",
    category: "bundles",
    shortDescription: "The complete experience",
    longDescription:
      "The ultimate Bitcoin mining starter pack. Includes the flagship Bitaxe Ultra miner (1.2 TH/s), a Trezor Safe 3 hardware wallet, a steel seed backup plate, and a limited-edition World Cup jersey. This is the premium package for miners who want the best of everything — maximum hashrate, top-tier security, and a way to represent at the next World Cup.",
    price: 399,
    originalPrice: 479,
    rating: 4.9,
    reviewCount: 34,
    specs: [
      { label: "Miner", value: "Bitaxe Ultra (1.2 TH/s)" },
      { label: "Wallet", value: "Trezor Safe 3" },
      { label: "Backup", value: "Steel seed plate" },
      { label: "Bonus", value: "World Cup jersey" },
      { label: "Savings", value: "$80" },
    ],
    inStock: true,
    badge: "LIMITED",
    relatedSlugs: ["bitaxe-ultra", "solo-miner-kit", "world-cup-jersey"],
    whatsIncluded: [
      "Bitaxe Ultra miner (1.2 TH/s)",
      "Trezor Safe 3 hardware wallet",
      "Steel seed backup plate + stamping tool",
      "World Cup 2027 jersey (size selection at checkout)",
      "Premium unboxing experience",
    ],
    reviews: [
      { author: "WhaleHash", rating: 5, date: "2026-02-02", text: "The ultimate gift to yourself. Premium packaging, amazing hardware, and the jersey is fire." },
      { author: "AllInBTC", rating: 5, date: "2026-01-20", text: "Worth every penny. Saving $80 over buying separately plus the jersey is exclusive to this bundle." },
      { author: "MiningViking", rating: 5, date: "2026-01-10", text: "Bought this for my wife to orange-pill her. She's now higher on the leaderboard than me." },
    ],
  },
  {
    slug: "orange-pill-gift",
    name: "Orange Pill Gift Set",
    category: "bundles",
    shortDescription: "Convert a nocoiner",
    longDescription:
      "The perfect gift for someone who doesn't own any Bitcoin yet. This beautifully packaged set includes a Bitaxe Gamma miner, a welcome card explaining Bitcoin and solo mining, a premium gift box, and 30 days of free access to our education platform. Turn any curious friend or family member into a Bitcoiner — one hash at a time.",
    price: 149,
    originalPrice: 174,
    rating: 4.7,
    reviewCount: 56,
    specs: [
      { label: "Miner", value: "Bitaxe Gamma (500 GH/s)" },
      { label: "Box", value: "Premium gift packaging" },
      { label: "Access", value: "30-day education pass" },
      { label: "Savings", value: "$25" },
    ],
    inStock: true,
    relatedSlugs: ["bitaxe-gamma", "beginner-bundle", "solo-miner-kit"],
    whatsIncluded: [
      "Bitaxe Gamma miner",
      "Premium gift box with magnetic closure",
      "Welcome card with QR code to thebitcoingame.com",
      "\"What is Bitcoin?\" booklet",
      "30-day education platform access code",
      "Sticker pack",
    ],
    reviews: [
      { author: "OrangePiller", rating: 5, date: "2026-01-28", text: "Gave this to my dad for his birthday. He now checks his difficulty score every morning." },
      { author: "GiftPro", rating: 5, date: "2026-01-15", text: "The packaging is beautiful. Looks like an Apple product unboxing. Perfect for gifting." },
      { author: "BitcoinMom", rating: 4, date: "2026-01-03", text: "My son loved it! The education access was a nice bonus. Only wish the booklet was longer." },
    ],
  },
];

/* ── Merchandise (6 products) ── */
const merch: Product[] = [
  {
    slug: "world-cup-jersey",
    name: "World Cup 2027 Jersey",
    category: "merch",
    shortDescription: "Custom country jersey",
    longDescription:
      "Represent your country in the Solo Mining World Cup with this premium jersey. Made from moisture-wicking performance fabric with sublimated graphics that won't fade. Features your country flag, The Bitcoin Game logo, and \"Solo Mining World Cup 2027\" on the back. Available in all 47 participating countries. Choose your country at checkout.",
    price: 49,
    rating: 4.8,
    reviewCount: 178,
    specs: [
      { label: "Material", value: "100% polyester, moisture-wicking" },
      { label: "Print", value: "Sublimated (won't fade)" },
      { label: "Sizes", value: "XS - 3XL" },
      { label: "Countries", value: "All 47 available" },
    ],
    inStock: true,
    badge: "BEST SELLER",
    relatedSlugs: ["mining-streak-hoodie", "i-mine-solo-tee", "block-finder-pin"],
    whatsIncluded: ["World Cup 2027 Jersey"],
    reviews: [
      { author: "WorldCupFan", rating: 5, date: "2026-02-05", text: "The quality is amazing. Wore it to a Bitcoin meetup and got so many compliments." },
      { author: "PortugalMiner", rating: 5, date: "2026-01-20", text: "Portugal jersey looks incredible. The sublimated print quality is top-notch." },
      { author: "JerseyCollector", rating: 4, date: "2026-01-10", text: "Great jersey but runs a bit small. Order one size up." },
    ],
  },
  {
    slug: "i-mine-solo-tee",
    name: "\"I Mine Solo\" T-Shirt",
    category: "merch",
    shortDescription: "Premium cotton tee",
    longDescription:
      "A clean, minimalist t-shirt that says it all. \"I Mine Solo\" in clean typography on the front, with a small Bitaxe silhouette on the back collar. Made from 100% premium combed cotton with a relaxed fit. The perfect everyday shirt for the solo mining community.",
    price: 29,
    rating: 4.6,
    reviewCount: 234,
    specs: [
      { label: "Material", value: "100% combed cotton, 180gsm" },
      { label: "Fit", value: "Relaxed" },
      { label: "Colors", value: "Black, Orange, White" },
      { label: "Sizes", value: "XS - 3XL" },
    ],
    inStock: true,
    relatedSlugs: ["mining-streak-hoodie", "satoshis-hat", "sticker-pack"],
    whatsIncluded: ["T-Shirt"],
    reviews: [
      { author: "FashionMiner", rating: 5, date: "2026-01-28", text: "Incredibly soft cotton. The design is subtle enough to wear anywhere." },
      { author: "DailyWear", rating: 4, date: "2026-01-15", text: "Nice shirt. The black one is my favorite — the orange text really pops." },
      { author: "Minimalist", rating: 5, date: "2026-01-05", text: "Finally, Bitcoin merch that doesn't look like a walking billboard. Clean design." },
    ],
  },
  {
    slug: "block-finder-pin",
    name: "Block Finder Pin",
    category: "merch",
    shortDescription: "Gold-plated enamel badge pin",
    longDescription:
      "A premium gold-plated enamel pin celebrating the rarest achievement in solo mining — finding a block. Features a Bitcoin logo with a pickaxe crossed behind it, finished in 24k gold plating with hard enamel fill. Whether you've found a block or aspire to, this pin is a statement piece for any Bitcoin enthusiast.",
    price: 19,
    rating: 4.9,
    reviewCount: 89,
    specs: [
      { label: "Material", value: "Zinc alloy, 24k gold plate" },
      { label: "Fill", value: "Hard enamel" },
      { label: "Size", value: "25mm diameter" },
      { label: "Backing", value: "Butterfly clutch" },
    ],
    inStock: true,
    badge: "NEW",
    relatedSlugs: ["world-cup-jersey", "sticker-pack", "i-mine-solo-tee"],
    whatsIncluded: ["Block Finder pin", "Backing card", "Micro velvet pouch"],
    reviews: [
      { author: "PinCollector", rating: 5, date: "2026-02-01", text: "The gold plating is gorgeous. Wear it on my jacket every day." },
      { author: "BlockFinder", rating: 5, date: "2026-01-20", text: "Found block #887,456 last month. This pin is my trophy. Beautiful craftsmanship." },
      { author: "GiftIdea", rating: 5, date: "2026-01-08", text: "Bought 5 of these for my mining crew. Perfect little gift." },
    ],
  },
  {
    slug: "mining-streak-hoodie",
    name: "Mining Streak Hoodie",
    category: "merch",
    shortDescription: "Embroidered hoodie",
    longDescription:
      "Stay warm while your miner stays hot. This premium hoodie features an embroidered flame icon and \"Streak\" text on the chest — a nod to the mining streak system in The Bitcoin Game. Made from heavyweight 350gsm cotton blend with a kangaroo pocket and metal-tipped drawstrings. The perfect hoodie for late-night mining sessions.",
    price: 59,
    rating: 4.7,
    reviewCount: 112,
    specs: [
      { label: "Material", value: "80% cotton / 20% polyester, 350gsm" },
      { label: "Decoration", value: "Embroidered" },
      { label: "Colors", value: "Black, Charcoal" },
      { label: "Sizes", value: "S - 3XL" },
    ],
    inStock: true,
    relatedSlugs: ["i-mine-solo-tee", "world-cup-jersey", "satoshis-hat"],
    whatsIncluded: ["Hoodie"],
    reviews: [
      { author: "HoodieLife", rating: 5, date: "2026-01-30", text: "Heavyweight and warm. The embroidery quality is excellent. My go-to hoodie now." },
      { author: "StreakMaster", rating: 5, date: "2026-01-18", text: "52-week streak and this hoodie to prove it. Perfect combo." },
      { author: "WinterMiner", rating: 4, date: "2026-01-05", text: "Great quality but only available in black and charcoal. Would love a navy option." },
    ],
  },
  {
    slug: "satoshis-hat",
    name: "Satoshi's Apprentice Hat",
    category: "merch",
    shortDescription: "Embroidered cap",
    longDescription:
      "A clean, classic cap with \"Satoshi's Apprentice\" embroidered in small text on the front. Unstructured 6-panel design with an adjustable brass clasp. Made from washed cotton for a lived-in feel from day one. Subtle enough for daily wear, meaningful enough for fellow Bitcoiners to recognize.",
    price: 24,
    rating: 4.5,
    reviewCount: 67,
    specs: [
      { label: "Material", value: "Washed cotton" },
      { label: "Style", value: "Unstructured 6-panel" },
      { label: "Closure", value: "Adjustable brass clasp" },
      { label: "One Size", value: "Adjustable" },
    ],
    inStock: true,
    relatedSlugs: ["i-mine-solo-tee", "mining-streak-hoodie", "sticker-pack"],
    whatsIncluded: ["Cap"],
    reviews: [
      { author: "HatGuy", rating: 5, date: "2026-01-22", text: "Minimalist and classy. Other Bitcoiners always comment on it." },
      { author: "DailyDriver", rating: 4, date: "2026-01-10", text: "Nice cap. The washed cotton feels great. Brass clasp is a premium touch." },
      { author: "SunMiner", rating: 5, date: "2025-12-30", text: "Perfect for mining in the backyard. Keeps the sun out while I check my stats." },
    ],
  },
  {
    slug: "sticker-pack",
    name: "Bitaxe Sticker Pack",
    category: "merch",
    shortDescription: "10 vinyl stickers",
    longDescription:
      "A collection of 10 premium vinyl stickers featuring designs from The Bitcoin Game universe. Includes Bitaxe silhouettes, mining-themed illustrations, the Block Finder badge, streak flames, and the World Cup logo. Waterproof and UV-resistant — perfect for laptops, water bottles, miners, and anywhere else you want to show your mining pride.",
    price: 9,
    rating: 4.4,
    reviewCount: 445,
    specs: [
      { label: "Count", value: "10 stickers" },
      { label: "Material", value: "Premium vinyl" },
      { label: "Finish", value: "Matte + Glossy mix" },
      { label: "Waterproof", value: "Yes" },
    ],
    inStock: true,
    relatedSlugs: ["block-finder-pin", "i-mine-solo-tee", "beginner-bundle"],
    whatsIncluded: ["10 premium vinyl stickers", "Resealable packaging"],
    reviews: [
      { author: "StickerFan", rating: 5, date: "2026-02-03", text: "Great quality vinyl. Put them on my laptop and they look amazing." },
      { author: "BitaxeLover", rating: 4, date: "2026-01-15", text: "Nice variety of designs. The Block Finder sticker is my favorite." },
      { author: "BulkBuyer", rating: 4, date: "2026-01-02", text: "Bought 5 packs to hand out at meetups. Everyone loves them." },
    ],
  },
];

/* ── All Products combined ── */
export const allProducts: Product[] = [...miners, ...nodes, ...bundles, ...merch];

/* ── Get products by category ── */
export function getProductsByCategory(category: ProductCategory): Product[] {
  return allProducts.filter((p) => p.category === category);
}

/* ── Get product by slug ── */
export function getProductBySlug(slug: string): Product | undefined {
  return allProducts.find((p) => p.slug === slug);
}

/* ── Get related products ── */
export function getRelatedProducts(product: Product): Product[] {
  return product.relatedSlugs
    .map((slug) => allProducts.find((p) => p.slug === slug))
    .filter((p): p is Product => p !== undefined);
}

/* ── Get featured products ── */
export function getFeaturedProducts(): Product[] {
  return featuredProductSlugs
    .map((slug) => allProducts.find((p) => p.slug === slug))
    .filter((p): p is Product => p !== undefined);
}

/* ── Category slug → display info mapping ── */
const categorySlugMap: Record<string, ProductCategory> = {
  bitaxe: "miners",
  miners: "miners",
  nodes: "nodes",
  bundles: "bundles",
  merch: "merch",
};

export function resolveCategorySlug(slug: string): ProductCategory | undefined {
  return categorySlugMap[slug];
}

/* ── Sort options ── */
export type SortOption = "popular" | "price-asc" | "price-desc" | "new";

export function sortProducts(products: Product[], sort: SortOption): Product[] {
  const sorted = [...products];
  switch (sort) {
    case "popular":
      return sorted.sort((a, b) => b.reviewCount - a.reviewCount);
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "new":
      return sorted.sort((a, b) => (b.badge === "NEW" ? 1 : 0) - (a.badge === "NEW" ? 1 : 0));
    default:
      return sorted;
  }
}
