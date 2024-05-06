// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.20;

library Subscriptions {
  function hasFlag(uint8 pluginConfig, uint256 flag) internal pure returns (bool res) {
    assembly {
      res := gt(and(pluginConfig, flag), 0)
    }
  }

  uint256 internal constant MSG_SENDER_FLAG = 1;
  uint256 internal constant RECIPIENT_FLAG = 1 << 1;
  uint256 internal constant TX_ORIGIN_FLAG = 1 << 2;
  uint256 internal constant NOTIFY_FLAG = 1 << 3;
}
