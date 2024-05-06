// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './MockTimeAlgebraSubPlugin.sol';

import '../SubscriptionPluginFactory.sol';

contract MockTimeSubPluginFactory is SubscriptionPluginFactory {
  constructor(address _algebraFactory) SubscriptionPluginFactory(_algebraFactory) {
    //
  }

  function _createPlugin(
    address pool,
    address paymentToken,
    uint32 subscriptionTime,
    uint128 subscriptionCost,
    address feesReceiver,
    uint8 subscriptionConfig,
    bytes32 subscriptionsMerkleRoot
  ) internal override returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    AlgebraSubscriptionPlugin subPlagin = new MockTimeAlgebraSubPlugin(
      pool,
      algebraFactory,
      address(this),
      paymentToken,
      subscriptionTime,
      subscriptionCost,
      feesReceiver,
      subscriptionConfig,
      subscriptionsMerkleRoot
    );
    pluginByPool[pool] = address(subPlagin);
    return address(subPlagin);
  }
}
