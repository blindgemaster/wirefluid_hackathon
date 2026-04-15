export const playerThresholdFeedAbi = [
  { name: "feedId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "schemaId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "aggregator", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "description", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "getThreshold", type: "function", stateMutability: "view", inputs: [{ name: "playerId", type: "bytes32" }, { name: "statKey", type: "bytes32" }], outputs: [{ name: "threshold", type: "uint256" }, { name: "exists", type: "bool" }] },
  { name: "getStat", type: "function", stateMutability: "view", inputs: [{ name: "playerId", type: "bytes32" }, { name: "statKey", type: "bytes32" }], outputs: [{ name: "value", type: "uint256" }, { name: "thresholdMet", type: "bool" }, { name: "updatedAt", type: "uint256" }] },
  { name: "registerThreshold", type: "function", stateMutability: "nonpayable", inputs: [{ name: "playerId", type: "bytes32" }, { name: "statKey", type: "bytes32" }, { name: "threshold", type: "uint256" }], outputs: [] },
  { name: "ThresholdRegistered", type: "event", inputs: [{ name: "playerId", type: "bytes32", indexed: true }, { name: "statKey", type: "bytes32", indexed: true }, { name: "threshold", type: "uint256", indexed: false }] },
  { name: "ThresholdTriggered", type: "event", inputs: [{ name: "feedId", type: "bytes32", indexed: true }, { name: "playerId", type: "bytes32", indexed: true }, { name: "statKey", type: "bytes32", indexed: false }, { name: "value", type: "uint256", indexed: false }, { name: "threshold", type: "uint256", indexed: false }] },
] as const;
