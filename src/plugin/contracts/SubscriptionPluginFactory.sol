// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './AlgebraSubscriptionPlugin.sol';

import './libraries/Subscriptions.sol';

/// @title Algebra Integral 1.0 default plugin factory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
contract SubscriptionPluginFactory {
  using Subscriptions for uint8;

  bytes32 public constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');
  bytes32 public immutable POOLS_ADMINISTRATOR_ROLE;

  address public immutable algebraFactory;

  mapping(address poolAddress => address pluginAddress) public pluginByPool;

  constructor(address _algebraFactory) {
    require(_algebraFactory != address(0), 'Incorrect factory');

    POOLS_ADMINISTRATOR_ROLE = IAlgebraFactory(_algebraFactory).POOLS_ADMINISTRATOR_ROLE();
    algebraFactory = _algebraFactory;
  }

  function createPlugin(address, address, address) external pure returns (address) {
    revert('Cannot be a base plugin');
  }

  function createPluginForExistingPool(
    address token0,
    address token1,
    address paymentToken,
    uint32 subscriptionTime,
    uint128 subscriptionCost,
    address feesReceiver,
    uint8 subscriptionConfig,
    bytes32 subscriptionsMerkleRoot
  ) external returns (address) {
    require(paymentToken != address(0), 'Incorrect payment token');
    require(subscriptionTime != 0, 'Incorrect subscription time');
    require(feesReceiver != address(0), 'Incorrect fees receiver');
    //0 bit == MSG_SENDER_FLAG, 1 bit == RECIPIENT_FLAG, 2 bit == TX_ORIGIN_FLAG
    require(subscriptionConfig << 5 != 0, 'Incorrect subscription config');

    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(POOLS_ADMINISTRATOR_ROLE, msg.sender), 'Only pool admin');

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool, paymentToken, subscriptionTime, subscriptionCost, feesReceiver, subscriptionConfig, subscriptionsMerkleRoot);
  }

  function _createPlugin(
    address pool,
    address paymentToken,
    uint32 subscriptionTime,
    uint128 subscriptionCost,
    address feesReceiver,
    uint8 subscriptionConfig,
    bytes32 subscriptionsMerkleRoot
  ) internal virtual returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    AlgebraSubscriptionPlugin subPlagin = new AlgebraSubscriptionPlugin(
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
