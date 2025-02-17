import { ethers } from 'hardhat';
import {
  MockFactory,
  MockPool,
  MockTimeAlgebraBasePluginV1,
  MockTimeDSFactory,
  BasePluginV1Factory,
  SubscriptionPluginFactory,
  AlgebraSubscriptionPlugin,
  TestERC20,
} from '../../typechain';
import { tokensFixture } from './externalFixtures';
import { encodePriceSqrt } from '../shared/utilities';

type Fixture<T> = () => Promise<T>;
interface MockFactoryFixture {
  mockFactory: MockFactory;
}
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function mockFactoryFixture(): Promise<MockFactoryFixture> {
  const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
  const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

  return { mockFactory };
}

interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraBasePluginV1;
  mockPluginFactory: MockTimeDSFactory;
  mockPool: MockPool;
}

// Monday, October 5, 2020 9:00:00 AM GMT-05:00
export const TEST_POOL_START_TIME = 1601906400;
export const TEST_POOL_DAY_BEFORE_START = 1601906400 - 24 * 60 * 60;

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  //const { token0, token1, token2 } = await tokensFixture()

  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(mockFactory)) as any as MockTimeDSFactory;

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  await mockPool.initialize(encodePriceSqrt(1, 1));

  await mockPluginFactory.createPlugin(mockPool, ZERO_ADDRESS, ZERO_ADDRESS);
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  const mockDSOperatorFactory = await ethers.getContractFactory('MockTimeAlgebraBasePluginV1');
  const plugin = mockDSOperatorFactory.attach(pluginAddress) as any as MockTimeAlgebraBasePluginV1;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
  };
};

interface SubPluginFixture extends MockFactoryFixture {
  subscriptionPluginFactory: SubscriptionPluginFactory;
  mockPool: MockPool;
  token0: TestERC20;
  token1: TestERC20;
  paymentToken: TestERC20;
}

export const algebraSubscriptionPluginFixture: Fixture<SubPluginFixture> = async function (): Promise<SubPluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const { token0, token1 } = await tokensFixture();
  const { token0: paymentToken } = await tokensFixture();

  const SubscriptionPluginFactory = await ethers.getContractFactory('MockTimeSubPluginFactory');
  const subscriptionPluginFactory = (await SubscriptionPluginFactory.deploy(mockFactory)) as any as SubscriptionPluginFactory;

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  await mockFactory.stubPool(token0, token1, mockPool);

  return {
    subscriptionPluginFactory,
    mockPool,
    mockFactory,
    token0,
    token1,
    paymentToken,
  };
};

interface PluginFactoryFixture extends MockFactoryFixture {
  pluginFactory: BasePluginV1Factory;
}

export const pluginFactoryFixture: Fixture<PluginFactoryFixture> = async function (): Promise<PluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();

  const pluginFactoryFactory = await ethers.getContractFactory('BasePluginV1Factory');
  const pluginFactory = (await pluginFactoryFactory.deploy(mockFactory)) as any as BasePluginV1Factory;

  return {
    pluginFactory,
    mockFactory,
  };
};
