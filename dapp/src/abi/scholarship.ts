/**
 * ABIs for the Cricket Scholarship DAO contracts deployed on WireFluid testnet.
 * Mirrors ../../../../wirefluid_hackathon/src/*.sol.
 */

export const playerRegistryAbi = [
  {
    name: "getPlayer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [
      {
        components: [
          { name: "playerId", type: "bytes32" },
          { name: "wallet", type: "address" },
          { name: "attestor", type: "address" },
          { name: "age", type: "uint16" },
          { name: "region", type: "string" },
          { name: "status", type: "uint8" },
          { name: "registeredAt", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
  },
  {
    name: "isActive",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "walletOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "PlayerRegistered",
    type: "event",
    inputs: [
      { name: "playerId", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "attestor", type: "address", indexed: true },
    ],
  },
  {
    name: "PlayerActivated",
    type: "event",
    inputs: [{ name: "playerId", type: "bytes32", indexed: true }],
  },
] as const;

export const scholarshipVaultAbi = [
  {
    name: "nextScholarshipId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "scholarships",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "threshold", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "funder", type: "address" },
      { name: "claimed", type: "bool" },
      { name: "cancelled", type: "bool" },
      { name: "createdAt", type: "uint256" },
    ],
  },
  {
    name: "isClaimable",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "token",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "feed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "registry",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "createScholarship",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "threshold", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    name: "ScholarshipCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "playerId", type: "bytes32", indexed: true },
      { name: "statKey", type: "bytes32", indexed: true },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "funder", type: "address", indexed: false },
    ],
  },
  {
    name: "ScholarshipClaimed",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "playerId", type: "bytes32", indexed: true },
      { name: "payoutWallet", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const directSponsorshipAbi = [
  {
    name: "nextCommitmentId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "commitmentsOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    name: "commitments",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "sponsor", type: "address" },
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "threshold", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "message", type: "string" },
      { name: "claimed", type: "bool" },
      { name: "reclaimed", type: "bool" },
    ],
  },
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "threshold", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "message", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    name: "Committed",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "playerId", type: "bytes32", indexed: true },
      { name: "statKey", type: "bytes32", indexed: false },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "message", type: "string", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "Approval",
    type: "event",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// PlayerThresholdFeed on WireFluid exposes an admin-gated aggregator pushStat.
// The deployed instance sets the deployer EOA as aggregator, so the connected
// wallet (if it matches) can call pushStat directly from the browser.
export const playerThresholdFeedWriteAbi = [
  {
    name: "pushStat",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "aggregator",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
