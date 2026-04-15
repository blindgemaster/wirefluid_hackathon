// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal interface matching the DON's PlayerThresholdFeed.
/// Mirrors fact/contracts/src/sports/PlayerThresholdFeed.sol.
/// Reading `getStat(playerId, statKey).thresholdMet` is the scholarship trigger.
interface IPlayerThresholdFeed {
    function feedId() external view returns (bytes32);

    function getThreshold(bytes32 playerId, bytes32 statKey)
        external
        view
        returns (uint256 threshold, bool exists);

    function getStat(bytes32 playerId, bytes32 statKey)
        external
        view
        returns (uint256 value, bool thresholdMet, uint256 updatedAt);

    event ThresholdTriggered(
        bytes32 indexed feedId, bytes32 indexed playerId, bytes32 statKey, uint256 value, uint256 threshold
    );
}
