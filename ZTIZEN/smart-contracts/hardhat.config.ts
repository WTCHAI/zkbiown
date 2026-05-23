import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    compilers: [
      {
        version: "0.8.34",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
    ],
    overrides: {
      // HonkVerifier (auto-generated Barretenberg assembly) has deep Yul stack
      // usage that exceeds the limit when viaIR is enabled — compile it without
      // the IR pipeline so its inline assembly blocks are left untouched.
      "contracts/NoirVerifier.sol": {
        version: "0.8.34",
        settings: {
          viaIR: false,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      // Public RPC — no API key needed, handles large contract deployments
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      timeout: 300000, // 5 min — large contracts (HonkVerifier) take longer
      gas: "auto",
      gasPrice: "auto",
    },
    arbitrumSepolia: {
      type: "http",
      chainType: "l1",
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      timeout: 300000,
      gas: "auto",
      gasPrice: "auto",
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
    blockscout: {
      enabled: true,
    },
  },
});
