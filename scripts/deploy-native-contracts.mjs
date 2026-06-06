#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import solc from "solc";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const envPath = path.join(repoRoot, ".env");
const contractPath = path.join(repoRoot, "contracts", "FloeCollection.sol");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = value.replace(/^"(.*)"$/, "$1");
  }
}

function resolveImport(importPath) {
  try {
    const resolved = require.resolve(importPath, { paths: [repoRoot] });
    return { contents: fs.readFileSync(resolved, "utf8") };
  } catch {
    const localPath = path.resolve(repoRoot, importPath);
    if (fs.existsSync(localPath)) {
      return { contents: fs.readFileSync(localPath, "utf8") };
    }
    return { error: `Unable to resolve import: ${importPath}` };
  }
}

function compileContract() {
  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "contracts/FloeCollection.sol": {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = (output.errors ?? []).filter((error) => error.severity === "error");
  if (errors.length > 0) {
    const message = errors.map((error) => error.formattedMessage ?? error.message).join("\n");
    throw new Error(`Solidity compilation failed:\n${message}`);
  }

  const artifact = output.contracts["contracts/FloeCollection.sol"]?.FloeCollection;
  if (!artifact) {
    throw new Error("FloeCollection contract artifact was not produced by the compiler");
  }

  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
  };
}

function getChainConfig() {
  return [
    {
      name: "base_sepolia",
      displayName: "Base Sepolia",
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS_BASE",
      rpcEnv: "TATUM_RPC_URL_BASE",
      defaultRpcUrl: "https://sepolia.base.org",
      chainId: 84532,
    },
    {
      name: "optimism_sepolia",
      displayName: "Optimism Sepolia",
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM",
      rpcEnv: "TATUM_RPC_URL_OPTIMISM",
      defaultRpcUrl: "https://sepolia.optimism.io",
      chainId: 11155420,
    },
    {
      name: "arbitrum_sepolia",
      displayName: "Arbitrum Sepolia",
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM",
      rpcEnv: "TATUM_RPC_URL_ARBITRUM",
      defaultRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
    },
    {
      name: "avalanche_fuji",
      displayName: "Avalanche Fuji",
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE",
      rpcEnv: "TATUM_RPC_URL_AVALANCHE",
      defaultRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
    },
    {
      name: "eth_sepolia",
      displayName: "Ethereum Sepolia",
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA",
      rpcEnv: "TATUM_RPC_URL_SEPOLIA",
      defaultRpcUrl: "https://ethereum-sepolia.publicnode.com",
      chainId: 11155111,
    },
  ];
}

function upsertEnvValue(envText, key, value) {
  const lines = envText.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!updated) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    nextLines.push(`${key}=${value}`);
  }

  return nextLines.join("\n");
}

async function main() {
  loadEnvFile(envPath);

  const privateKey = (process.env.TATUM_TEST_PRIVATE_KEY ?? process.env.DEPLOY_PRIVATE_KEY ?? "").trim();
  if (!privateKey) {
    throw new Error("TATUM_TEST_PRIVATE_KEY is not set in .env");
  }

  const prefixedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const compiled = compileContract();
  const wallet = new ethers.Wallet(prefixedPrivateKey);

  const contractFactoryByChain = new Map();
  const deployed = {};

  for (const chain of getChainConfig()) {
    const rpcUrl = (process.env[chain.rpcEnv] ?? chain.defaultRpcUrl ?? "").trim();
    if (!rpcUrl) {
      throw new Error(`${chain.rpcEnv} is not set and no default RPC URL is available`);
    }

    console.log(`Deploying ${chain.displayName} via ${rpcUrl}`);
    const provider = new ethers.JsonRpcProvider(rpcUrl, chain.chainId);
    const connectedWallet = wallet.connect(provider);

    let contractFactory = contractFactoryByChain.get("floe");
    if (!contractFactory) {
      contractFactory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, connectedWallet);
      contractFactoryByChain.set("floe", contractFactory);
    } else {
      contractFactory = contractFactory.connect(connectedWallet);
    }

    const contract = await contractFactory.deploy("Floe Collection", "FLOE");
    const deploymentTx = contract.deploymentTransaction();
    if (!deploymentTx) {
      throw new Error(`Deployment transaction missing for ${chain.displayName}`);
    }

    const receipt = await deploymentTx.wait();
    const address = await contract.getAddress();

    console.log(`  tx: ${receipt.hash}`);
    console.log(`  address: ${address}`);

    deployed[chain.envVar] = address;
  }

  let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [key, value] of Object.entries(deployed)) {
    envText = upsertEnvValue(envText, key, value);
  }
  fs.writeFileSync(envPath, envText.endsWith("\n") ? envText : `${envText}\n`);

  console.log("\nUpdated .env with:");
  for (const [key, value] of Object.entries(deployed)) {
    console.log(`${key}=${value}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
