// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Abstract contract with modified blockTimestamp functionality
/// @notice Allows the pool and other contracts to get a timestamp
/// @dev Can be overridden in tests to make testing easier
abstract contract Timestamp256 {
  /// @dev This function is created for testing by overriding it.
  /// @return A timestamp
  function _blockTimestamp() internal view virtual returns (uint256) {
    return block.timestamp; // truncation is desired
  }
}
