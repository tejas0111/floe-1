# Floe 🌊

### High-Performance Multi-Chain Bridge for Walrus Storage

[![Tatum Hackathon](https://img.shields.io/badge/Hackathon-Tatum-blueviolet)](https://tatum.io)
[![Walrus Storage](https://img.shields.io/badge/Storage-Walrus-blue)](https://walrus.xyz)
[![Multi-Chain](https://img.shields.io/badge/Anchoring-Multi--Chain-success)](https://tatum.io)

**Floe** is a decentralized infrastructure bridge that connects the high-efficiency storage of **Walrus (Sui)** with the massive multi-chain ecosystem via **Tatum**. It allows developers and users to store data once on Walrus and instantly anchor its provenance across 10+ blockchains including Ethereum, Base, Polygon, and more.

---

## 🚀 The Vision

Modern dApps face a dilemma: **Decentralized storage is fragmented.** 
- Walrus offers incredible performance and cost-efficiency but lives in its own ecosystem. 
- Users on Base or Ethereum want to "own" their data on their native chain.

**Floe solves this.** We provide the plumbing that allows a file to be sharded on Walrus while its "Soul" (metadata and ownership) is minted as a provenance-aware asset on any chain supported by Tatum.

---

## ✨ Key Features

- **⚡ Walrus-Native Pipeline:** Optimized chunked uploads with automatic sharding and storage health metrics.
- **🔗 Universal Anchoring:** One-click provenance minting across **Base, Sepolia, Polygon, Arbitrum, Optimism, and more** using Tatum's NFT Express.
- **🕵️ Global Discovery:** Leverages Tatum's unified indexer to search for and verify file provenance across the entire multi-chain landscape.
- **🛠️ Developer-First:** Includes a professional **CLI**, **SDK**, and **Bash Wrapper** for seamless integration into any workflow.
- **📊 SaaS-Grade Dashboard:** Real-time upload tracking, multi-chain status monitoring, and storage health metrics.

---

## 🛠️ Tech Stack

- **Storage:** [Walrus](https://walrus.xyz) (Decentralized Storage Protocol)
- **Multi-Chain Connectivity:** [Tatum SDK & API](https://tatum.io)
- **Backend:** Node.js, Express, TypeScript, Redis
- **Frontend:** React, Tailwind CSS, Vite
- **Infrastructure:** Docker, GitHub Actions (CI)

---

## 🏁 Quick Start

### Prerequisites
- Node.js `>=20`
- Redis
- [Tatum API Key](https://dashboard.tatum.io)
- Walrus Aggregator/Publisher access

### 1. Clone & Install
```bash
git clone https://github.com/tejas0111/floe-1.git
cd floe-1
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your keys:
```bash
TATUM_API_KEY=your_key_here
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.site
```

### 3. Launch the Demo
```bash
npm run demo
```
This starts the **API** (Port 3011) and the **Dashboard** (Port 3012).

---

## 📦 Developer Tools

### CLI
```bash
npm install -g @floehq/cli
floe upload my-video.mp4 --chain base
```

### SDK
```typescript
import { FloeClient } from '@floehq/sdk';

const floe = new FloeClient({ apiKey: '...' });
const result = await floe.upload(fileBuffer, { anchorChain: 'polygon' });
console.log(`Anchored at: ${result.anchorTxId}`);
```

### Bash Wrapper
```bash
./scripts/floe.sh upload test.txt --target-chain sepolia
```

---

## 📄 License
MIT © [Floe HQ](https://github.com/floehq)
