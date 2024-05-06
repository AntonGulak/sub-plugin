// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.20;

interface IPaymentNotifier {
  function notify(uint32 periods, uint256 paidAmount, address subscriber, address payer) external;
}
