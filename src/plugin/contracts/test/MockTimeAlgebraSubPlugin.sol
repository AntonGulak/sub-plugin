// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../AlgebraSubscriptionPlugin.sol';

// used for testing time dependent behavior
contract MockTimeAlgebraSubPlugin is AlgebraSubscriptionPlugin {
  // Monday, October 5, 2020 9:00:00 AM GMT-05:00
  uint256 public time = 1601906400;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    address _paymentToken,
    uint32 _subscriptionTime,
    uint128 _subscriptionCost,
    address _feeReceiver,
    uint8 _subscriptionConfig,
    bytes32 _subscriptionsMerkleRoot
  )
    AlgebraSubscriptionPlugin(
      _pool,
      _factory,
      _pluginFactory,
      _paymentToken,
      _subscriptionTime,
      _subscriptionCost,
      _feeReceiver,
      _subscriptionConfig,
      _subscriptionsMerkleRoot
    )
  {
    //
  }

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function _blockTimestamp() internal view override returns (uint256) {
    return time;
  }

  function checkBlockTimestamp() external view returns (bool) {
    require(super._blockTimestamp() == block.timestamp);
    return true;
  }

  function setInitilized(bool _isInitialized) external {
    isInitialized = _isInitialized;
  }
}
