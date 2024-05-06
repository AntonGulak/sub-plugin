import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import checkTimepointEquals from './shared/checkTimepointEquals';
import { expect } from './shared/expect';
import { TEST_POOL_START_TIME, algebraSubscriptionPluginFixture } from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, expandTo18Decimals, getMaxTick, getMinTick } from './shared/utilities';

import { MockPool, MockTimeAlgebraSubPlugin, SubscriptionPluginFactory, MockFactory, TestERC20 } from '../typechain';

import snapshotGasCost from './shared/snapshotGasCost';
import { subscribe } from 'diagnostics_channel';

const day = 60n * 60n * 24n;
const msgSenderFlag = 1n;
const recipientFlag = 2n;
const txOriginFlag = 4n;
const notifyFlag = 8n;

describe('AlgebraSubscriptionPlugin', () => {
  let wallet: Wallet, otherWallet: Wallet;
  let mockPool: MockPool; // mock of AlgebraPool
  let subscriptionPluginFactory: SubscriptionPluginFactory; // modified plugin factory
  let mockFactory: MockFactory;
  let token0: TestERC20;
  let token1: TestERC20;
  let paymentToken: TestERC20;
  let feesReceiver: Wallet;

  const startTime: bigint = 1601906400n;

  async function createAndInitPlugin(
    subscriptionTime: string | bigint | number,
    subscriptionCost: string | bigint,
    subscriptionConfig: string | bigint | number,
    subMerkleRoot?: string
  ): Promise<MockTimeAlgebraSubPlugin> {
    if (!subMerkleRoot) {
      subMerkleRoot = ethers.ZeroHash;
    }

    await mockFactory.grantRole(await mockFactory.POOLS_ADMINISTRATOR_ROLE(), wallet);
    await subscriptionPluginFactory.createPluginForExistingPool(
      token0,
      token1,
      paymentToken,
      subscriptionTime,
      subscriptionCost,
      feesReceiver,
      subscriptionConfig,
      subMerkleRoot
    );
    const pluginAddress = await subscriptionPluginFactory.pluginByPool(mockPool);

    const AlgebraSubscriptionPluginFactory = await ethers.getContractFactory('MockTimeAlgebraSubPlugin');

    const subPlugin = AlgebraSubscriptionPluginFactory.attach(pluginAddress) as any as MockTimeAlgebraSubPlugin;

    await mockPool.setPlugin(subPlugin);
    await subPlugin.initialize();

    return subPlugin;
  }

  before('prepare signers', async () => {
    [wallet, otherWallet, feesReceiver] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test AlgebraBasePluginV1', async () => {
    ({ mockPool, subscriptionPluginFactory, mockFactory, token0, token1, paymentToken } = await loadFixture(algebraSubscriptionPluginFixture));
  });

  describe('#payForSubscription', async () => {
    it('Should correct pay for subscription (first time, 1 period, payer==subscriber)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      const payerBalanceBefore = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceBefore = await paymentToken.balanceOf(feesReceiver);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      const payerBalanceAfter = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceAfter = await paymentToken.balanceOf(feesReceiver);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + periods * subscriptionTime);
      expect(payerBalanceBefore - payerBalanceAfter).to.equal(amountToPay);
      expect(feesReceiverBalanceAfter - feesReceiverBalanceBefore).to.equal(amountToPay);
    });

    it('Should correct pay for subscription (first time, 1 period, payer!=subscriber)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      const payerBalanceBefore = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceBefore = await paymentToken.balanceOf(feesReceiver);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, otherWallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, otherWallet, amountToPay);

      const payerBalanceAfter = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceAfter = await paymentToken.balanceOf(feesReceiver);

      expect(await subPlugin.subscriptions(otherWallet)).to.equal(startTime + periods * subscriptionTime);
      expect(payerBalanceBefore - payerBalanceAfter).to.equal(amountToPay);
      expect(feesReceiverBalanceAfter - feesReceiverBalanceBefore).to.equal(amountToPay);
    });

    it('Should correct pay for subscription (first time, 5 period)', async () => {
      const subscriptionCost = 100n;
      const periods = 5n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      const payerBalanceBefore = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceBefore = await paymentToken.balanceOf(feesReceiver);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      const payerBalanceAfter = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceAfter = await paymentToken.balanceOf(feesReceiver);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + periods * subscriptionTime);
      expect(payerBalanceBefore - payerBalanceAfter).to.equal(amountToPay);
      expect(feesReceiverBalanceAfter - feesReceiverBalanceBefore).to.equal(amountToPay);
    });

    it('Should correct pay for subscription (in series: 5, 5)', async () => {
      const subscriptionCost = 100n;
      const periods = 10n;
      const partOfPeriods = periods / 2n;

      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;
      const partOfAmountToPay = subscriptionCost * partOfPeriods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      const payerBalanceBefore = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceBefore = await paymentToken.balanceOf(feesReceiver);

      await paymentToken.approve(subPlugin.target, amountToPay);

      await expect(subPlugin.payForSubscription(partOfPeriods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(partOfPeriods, wallet, wallet, partOfAmountToPay);

      await expect(subPlugin.payForSubscription(partOfPeriods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(partOfPeriods, wallet, wallet, partOfAmountToPay);

      const payerBalanceAfter = await paymentToken.balanceOf(wallet);
      const feesReceiverBalanceAfter = await paymentToken.balanceOf(feesReceiver);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + periods * subscriptionTime);
      expect(payerBalanceBefore - payerBalanceAfter).to.equal(amountToPay);
      expect(feesReceiverBalanceAfter - feesReceiverBalanceBefore).to.equal(amountToPay);
    });

    it('Should renew subscription if the previous one has expired', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + periods * subscriptionTime);

      const advanceTime = subscriptionTime * 2n;

      await subPlugin.advanceTime(advanceTime);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + advanceTime + periods * subscriptionTime);
    });

    it('Should renew subscription if the previous one has expired', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + periods * subscriptionTime);

      const advanceTime = subscriptionTime * 2n;

      await subPlugin.advanceTime(advanceTime);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet))
        .to.be.emit(subPlugin, 'PayForSubscription')
        .withArgs(periods, wallet, wallet, amountToPay);

      expect(await subPlugin.subscriptions(wallet)).to.equal(startTime + advanceTime + periods * subscriptionTime);
    });

    it('Should check Incorrect periods', async () => {
      const subscriptionCost = 100n;
      const periods = 0n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet)).to.be.revertedWith('Incorrect periods');
    });

    it('Should check Incorrect subscriber', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, ethers.ZeroAddress)).to.be.revertedWith('Incorrect subscriber');
    });

    it('Should check plugin Not initialized', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);
      await subPlugin.setInitilized(false);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await expect(subPlugin.payForSubscription(periods, wallet)).to.be.revertedWith('Not initialized');
    });
  });

  describe('#swap', async () => {
    it('Should correct swap with subscription (MSG_SENDER_FLAG, payer == recipient)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await subPlugin.payForSubscription(periods, wallet);

      await mockPool.swap(wallet, true, 100, 1, ethers.ZeroHash);
    });

    it('Should correct swap with subscription (MSG_SENDER_FLAG, payer != recipient)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, msgSenderFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await subPlugin.payForSubscription(periods, wallet);

      await mockPool.swap(otherWallet, true, 100, 1, ethers.ZeroHash);
    });

    it('Should correct swap with subscription (RECIPIENT_FLAG, payer == recipient)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, recipientFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await subPlugin.payForSubscription(periods, wallet);

      await mockPool.swap(wallet, true, 100, 1, ethers.ZeroHash);
    });

    it('Should should throw an error without subscription (RECIPIENT_FLAG, payer != recipient)', async () => {
      const subscriptionCost = 100n;
      const subscriptionTime = 30n * day;

      await createAndInitPlugin(subscriptionTime, subscriptionCost, recipientFlag);

      await expect(mockPool.swap(wallet, true, 100, 1, ethers.ZeroHash)).to.be.revertedWith('Subscription is out of date');
    });

    it('Should should throw an error without own subscription (RECIPIENT_FLAG, payer != recipient)', async () => {
      const subscriptionCost = 100n;
      const periods = 1n;
      const subscriptionTime = 30n * day;
      const amountToPay = subscriptionCost * periods;

      const subPlugin: MockTimeAlgebraSubPlugin = await createAndInitPlugin(subscriptionTime, subscriptionCost, recipientFlag);

      await paymentToken.approve(subPlugin.target, amountToPay);
      await subPlugin.payForSubscription(periods, wallet);

      await expect(mockPool.swap(otherWallet, true, 100, 1, ethers.ZeroHash)).to.be.revertedWith('Subscription is out of date');
    });
  });
});
