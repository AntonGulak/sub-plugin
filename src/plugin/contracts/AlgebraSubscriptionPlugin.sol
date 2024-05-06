// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import '@cryptoalgebra/integral-periphery/contracts/libraries/TransferHelper.sol';

import './base/Timestamp256.sol';

import './libraries/Subscriptions.sol';
import './libraries/MerkleProofLib.sol';

import './interfaces/IPaymentNotifier.sol';

import 'hardhat/console.sol';

contract AlgebraSubscriptionPlugin is IAlgebraPlugin, Timestamp256 {
  using Subscriptions for uint8;
  using MerkleProofLib for bytes32[];

  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  address public immutable pool;
  address private immutable factory;
  address private immutable pluginFactory;

  address public immutable paymentToken;
  uint32 public immutable subscriptionTime;
  uint8 public immutable subscriptionConfig;

  bool public isInitialized;
  address public feesReceiver;
  uint128 public subscriptionCost;

  bytes32 public subscriptionsMerkleRoot;

  mapping(address subscriber => uint256 subscriptionEnd) public subscriptions;

  event SubscriptionCost(uint128 cost);
  event PayForSubscription(uint128 periods, address payer, address subscriber, uint256 paidAmount);
  event SubscriptionsMerkleRoot(bytes32 subscriptionsMerkleRoot);
  event ReedemSubscription(address subscriber, uint256 subscriptionEnd);

  modifier onlyPool() {
    _checkIfFromPool();
    _;
  }

  modifier onlyPluginFactoryOrManager() {
    _checkIfPlaginFactoryOrManager();
    _;
  }

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
  ) {
    (factory, pool, pluginFactory, paymentToken, subscriptionTime, subscriptionCost, feesReceiver, subscriptionConfig, subscriptionsMerkleRoot) = (
      _factory,
      _pool,
      _pluginFactory,
      _paymentToken,
      _subscriptionTime,
      _subscriptionCost,
      _feeReceiver,
      _subscriptionConfig,
      _subscriptionsMerkleRoot
    );
  }

  function initialize() external {
    require(!isInitialized, 'Already initialized');
    require(_getPluginInPool() == address(this), 'Plugin not attached');

    _updatePluginConfigInPool();

    isInitialized = true;
  }

  function payForSubscription(uint32 periods, address subscriber) external {
    require(periods != 0, 'Incorrect periods');
    require(subscriber != address(0), 'Incorrect subscriber');
    _checkIfPlaginNotInitialized();

    uint256 amountToPay;
    unchecked {
      amountToPay = periods * subscriptionCost;
    }

    TransferHelper.safeTransferFrom(paymentToken, msg.sender, feesReceiver, amountToPay);

    unchecked {
      uint256 currentSubscriptionEnd = subscriptions[subscriber];
      uint256 _timestamp = _blockTimestamp();
      if (currentSubscriptionEnd < _timestamp) subscriptions[subscriber] = _timestamp + periods * subscriptionTime;
      else subscriptions[subscriber] = currentSubscriptionEnd + periods * subscriptionTime;
    }

    emit PayForSubscription(periods, msg.sender, subscriber, amountToPay);

    _paymentNotify(periods, amountToPay, subscriber, msg.sender);
  }

  function reedemSubscription(bytes32[] memory proof, address subscriber, uint256 subscriptionEnd) external {
    require(subscriber != address(0), 'Incorrect subscriber');
    require(subscriptionEnd >= _blockTimestamp(), 'Incorrect subscriptionEnd');
    _checkIfPlaginNotInitialized();

    bool isLeaf = proof.verify(subscriptionsMerkleRoot, keccak256(abi.encodePacked(subscriber, subscriptionEnd)));

    require(isLeaf, 'Incorrect proof');

    subscriptions[subscriber] = subscriptionEnd;

    emit ReedemSubscription(subscriber, subscriptionEnd);
  }

  function setSubscriptionCost(uint128 _subscriptionCost) external onlyPluginFactoryOrManager {
    subscriptionCost = _subscriptionCost;
    emit SubscriptionCost(_subscriptionCost);
  }

  function setSubscriptionsMerkleRoot(bytes32 _subscriptionsMerkleRoot) external onlyPluginFactoryOrManager {
    subscriptionsMerkleRoot = _subscriptionsMerkleRoot;
    emit SubscriptionsMerkleRoot(_subscriptionsMerkleRoot);
  }

  // ###### HOOKS ######

  function beforeSwap(
    address msgSender,
    address recipient,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external view override onlyPool returns (bytes4) {
    _checkSubscription(msgSender, recipient);
    return IAlgebraPlugin.beforeSwap.selector;
  }

  /// @dev unused
  function afterSwap(address, address, bool, int256, uint160, int256, int256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @dev unused
  function afterInitialize(address, uint160, int24) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.beforeModifyPosition.selector;
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function _checkSubscription(address msgSender, address recipient) internal view {
    _checkIfPlaginNotInitialized();

    if (subscriptionCost != 0) {
      uint8 _subscriptionConfig = subscriptionConfig;

      _checkSubscriptionDuration(msgSender, _subscriptionConfig.hasFlag(Subscriptions.MSG_SENDER_FLAG));
      _checkSubscriptionDuration(recipient, _subscriptionConfig.hasFlag(Subscriptions.RECIPIENT_FLAG));
      _checkSubscriptionDuration(tx.origin, _subscriptionConfig.hasFlag(Subscriptions.TX_ORIGIN_FLAG));
    }
  }

  function _paymentNotify(uint32 periods, uint256 paidAmount, address subscriber, address payer) internal {
    if (subscriptionConfig.hasFlag(Subscriptions.NOTIFY_FLAG)) IPaymentNotifier(feesReceiver).notify(periods, paidAmount, subscriber, payer);
  }

  function _checkSubscriptionDuration(address subscriber, bool toCheck) internal view {
    if (toCheck) {
      require(subscriptions[subscriber] >= _blockTimestamp(), 'Subscription is out of date');
    }
  }

  function _updatePluginConfigInPool() internal {
    uint8 newPluginConfig = defaultPluginConfig;

    (, , , uint8 currentPluginConfig) = _getPoolState();
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }

  function _getPluginInPool() internal view returns (address plugin) {
    return IAlgebraPool(pool).plugin();
  }

  function _checkIfFromPool() internal view {
    require(msg.sender == pool, 'Only pool can call this');
  }

  function _getPoolState() internal view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig) {
    (price, tick, fee, pluginConfig, , ) = IAlgebraPoolState(pool).globalState();
  }

  function _checkIfPlaginFactoryOrManager() internal view {
    require(
      msg.sender == pluginFactory || IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender),
      'Only plugin factory or manager can call this'
    );
  }

  function _checkIfPlaginNotInitialized() internal view {
    bool _isInitialized = isInitialized;
    require(_isInitialized, 'Not initialized');
  }
}
