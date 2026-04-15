// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IPlayerThresholdFeed.sol";

/// @notice Test double for the DON PlayerThresholdFeed. Mirrors the public
/// read surface the vault + sponsorship contracts rely on.
contract MockPlayerThresholdFeed is IPlayerThresholdFeed {
    bytes32 public override feedId;

    struct ThresholdConfig {
        uint256 threshold;
        bool exists;
    }

    struct Stat {
        uint256 value;
        bool thresholdMet;
        uint256 updatedAt;
    }

    mapping(bytes32 => mapping(bytes32 => ThresholdConfig)) private _thresholds;
    mapping(bytes32 => mapping(bytes32 => Stat)) private _stats;

    constructor(bytes32 _feedId) {
        feedId = _feedId;
    }

    function registerThreshold(bytes32 playerId, bytes32 statKey, uint256 threshold) external {
        _thresholds[playerId][statKey] = ThresholdConfig({threshold: threshold, exists: true});
    }

    /// @notice Simulates a DON aggregator pushing a stat update.
    function pushStat(bytes32 playerId, bytes32 statKey, uint256 value) external {
        ThresholdConfig storage t = _thresholds[playerId][statKey];
        require(t.exists, "no threshold");
        bool met = value >= t.threshold;
        Stat storage s = _stats[playerId][statKey];
        bool wasMet = s.thresholdMet;
        s.value = value;
        s.thresholdMet = met;
        s.updatedAt = block.timestamp;
        if (met && !wasMet) {
            emit ThresholdTriggered(feedId, playerId, statKey, value, t.threshold);
        }
    }

    function getThreshold(bytes32 playerId, bytes32 statKey)
        external
        view
        override
        returns (uint256 threshold, bool exists)
    {
        ThresholdConfig storage t = _thresholds[playerId][statKey];
        return (t.threshold, t.exists);
    }

    function getStat(bytes32 playerId, bytes32 statKey)
        external
        view
        override
        returns (uint256 value, bool thresholdMet, uint256 updatedAt)
    {
        Stat storage s = _stats[playerId][statKey];
        return (s.value, s.thresholdMet, s.updatedAt);
    }
}
