import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";

import { deployContract } from "./utils/contracts";
import {
  convertSignatureToEIP2098,
  defaultAcceptOfferMirrorFulfillment,
  defaultBuyNowMirrorFulfillment,
  getBasicOrderExecutions,
  getBasicOrderParameters,
  getItemETH,
  random128,
  randomBN,
  randomHex,
  toAddress,
  toBN,
  toKey,
} from "./utils/encoding";
import { faucet } from "./utils/faucet";
import { seaportFixture } from "./utils/fixtures";
import { VERSION, minRandom, simulateMatchOrders } from "./utils/helpers";

import type {
  ConduitInterface,
  ConsiderationInterface,
  EIP1271Wallet,
  EIP1271Wallet__factory,
  TestERC20,
  TestERC721,
  TestZone,
} from "../typechain-types";
import type { SeaportFixtures } from "./utils/fixtures";
import type { Wallet } from "ethers";

const { parseEther, formatEther, keccak256 } = ethers.utils;

/**
 * Buy now or accept offer for a single ERC721 or ERC1155 in exchange for
 * ETH, WETH or ERC20
 */
describe(`Basic buy now or accept offer flows (Seaport v${VERSION})`, function () {
  const { provider } = ethers;
  const owner = new ethers.Wallet(randomHex(32), provider);

  let conduitKeyOne: string;
  let conduitOne: ConduitInterface;
  let EIP1271WalletFactory: EIP1271Wallet__factory;
  let marketplaceContract: ConsiderationInterface;
  let stubZone: TestZone;
  let testERC20: TestERC20;
  let testERC721: TestERC721;

  let checkExpectedEvents: SeaportFixtures["checkExpectedEvents"];
  let createMirrorAcceptOfferOrder: SeaportFixtures["createMirrorAcceptOfferOrder"];
  let createMirrorBuyNowOrder: SeaportFixtures["createMirrorBuyNowOrder"];
  let createOrder: SeaportFixtures["createOrder"];
  let getTestItem1155: SeaportFixtures["getTestItem1155"];
  let getTestItem20: SeaportFixtures["getTestItem20"];
  let getTestItem721: SeaportFixtures["getTestItem721"];
  let mint721: SeaportFixtures["mint721"];
  let mintAndApprove1155: SeaportFixtures["mintAndApprove1155"];
  let mintAndApprove721: SeaportFixtures["mintAndApprove721"];
  let mintAndApproveERC20: SeaportFixtures["mintAndApproveERC20"];
  let set721ApprovalForAll: SeaportFixtures["set721ApprovalForAll"];
  let withBalanceChecks: SeaportFixtures["withBalanceChecks"];

  after(async () => {
    await network.provider.request({
      method: "hardhat_reset",
    });
  });

  before(async () => {
    await faucet(owner.address, provider);

    ({
      checkExpectedEvents,
      conduitKeyOne,
      conduitOne,
      createMirrorAcceptOfferOrder,
      createMirrorBuyNowOrder,
      createOrder,
      EIP1271WalletFactory,
      getTestItem1155,
      getTestItem20,
      getTestItem721,
      marketplaceContract,
      mint721,
      mintAndApprove1155,
      mintAndApprove721,
      mintAndApproveERC20,
      set721ApprovalForAll,
      stubZone,
      testERC20,
      testERC721,
      withBalanceChecks,
    } = await seaportFixture(owner));
  });

  let seller: Wallet;
  let buyer: Wallet;
  let zone: Wallet;

  let sellerContract: EIP1271Wallet;
  let buyerContract: EIP1271Wallet;
  let buyerb1: any;
  let buyerb2: any;

  beforeEach(async () => {
    // Setup basic buyer/seller wallets with ETH
    seller = new ethers.Wallet(randomHex(32), provider);
    buyer = new ethers.Wallet(randomHex(32), provider);
    zone = new ethers.Wallet(randomHex(32), provider);

    sellerContract = await EIP1271WalletFactory.deploy(seller.address);
    buyerContract = await EIP1271WalletFactory.deploy(buyer.address);

    for (const wallet of [seller, buyer, zone, sellerContract, buyerContract]) {
      await faucet(wallet.address, provider);
    }

    let addrs = {
      seller: seller.address,
      zone: zone.address,
      owner: owner.address,
      buyer: buyer.address,
      conduitOne: conduitOne.address,
      marketplaceContract: marketplaceContract.address,
      stubZone: stubZone.address,
      testERC20: testERC20.address,
      testERC721: testERC721.address,
    }
    console.log('addresses', addrs);

    buyerb1 = await provider.getBalance(buyer.address);
    console.log('buyer balance before', formatEther(buyerb1));
    console.log('seller balance before', formatEther(await provider.getBalance(seller.address)));
    console.log('zone balance before', formatEther(await provider.getBalance(zone.address)));
    console.log('owner balance before', formatEther(await provider.getBalance(owner.address)));
  });

  this.afterEach(async ()=> {
    buyerb2 = await provider.getBalance(buyer.address);
    console.log('buyer paied', formatEther(buyerb1.sub(buyerb2)));
    console.log('buyer balance end', formatEther(buyerb2));
    console.log('seller balance end', formatEther(await provider.getBalance(seller.address)));
    console.log('zone balance end', formatEther(await provider.getBalance(zone.address)));
    console.log('owner balance end', formatEther(await provider.getBalance(owner.address)));
  })

  describe("A single ERC721 is to be transferred", async () => {

    it("ERC721 <=> ETH (match)", async () => {
      const nftId = await mintAndApprove721(
        seller,
        marketplaceContract.address
      );

      const offer = [getTestItem721(nftId)];

      const consideration = [
        getItemETH(parseEther("10"), parseEther("10"), seller.address),
        getItemETH(parseEther("1"), parseEther("1"), zone.address),
        getItemETH(parseEther("1"), parseEther("1"), owner.address),
      ];

      const { order, orderHash, value } = await createOrder(
        seller,
        zone,
        offer,
        consideration,
        0 // FULL_OPEN
      );

      const { mirrorOrder, mirrorOrderHash } = await createMirrorBuyNowOrder(
        buyer,
        zone,
        order
      );

      const fulfillments = defaultBuyNowMirrorFulfillment;

      const executions = await simulateMatchOrders(
        marketplaceContract,
        [order, mirrorOrder],
        fulfillments,
        buyer,
        value
      );
      expect(executions.length).to.equal(4);

      console.log('fulfillments', JSON.stringify(fulfillments, null, 2));

      const tx = marketplaceContract
        .connect(owner)
        .matchOrders([order, mirrorOrder], fulfillments, {
          value,
        });
      const receipt = await (await tx).wait();
      await checkExpectedEvents(
        tx,
        receipt,
        [
          {
            order,
            orderHash,
            fulfiller: ethers.constants.AddressZero,
          },
          {
            order: mirrorOrder,
            orderHash: mirrorOrderHash,
            fulfiller: ethers.constants.AddressZero,
          },
        ],
        executions
      );
      return receipt;
    });

  });


/*
  describe("A single ERC1155 is to be transferred", async () => {
    describe("[Buy now] User fulfills a sell order for a single ERC1155", async () => {
      it("ERC1155 <=> ETH (standard)", async () => {
        // Seller mints nft
        const { nftId, amount } = await mintAndApprove1155(
          seller,
          marketplaceContract.address
        );

        const offer = [getTestItem1155(nftId, amount, amount)];

        const consideration = [
          getItemETH(parseEther("10"), parseEther("10"), seller.address),
          getItemETH(parseEther("1"), parseEther("1"), zone.address),
          getItemETH(parseEther("1"), parseEther("1"), owner.address),
        ];

        const { order, orderHash, value } = await createOrder(
          seller,
          zone,
          offer,
          consideration,
          0 // FULL_OPEN
        );

        await withBalanceChecks([order], 0, undefined, async () => {
          const tx = marketplaceContract
            .connect(buyer)
            .fulfillOrder(order, toKey(0), {
              value,
            });
          const receipt = await (await tx).wait();
          await checkExpectedEvents(tx, receipt, [
            {
              order,
              orderHash,
              fulfiller: buyer.address,
              fulfillerConduitKey: toKey(0),
            },
          ]);

          return receipt;
        });
      });

      it("ERC1155 <=> ETH (match)", async () => {
        // Seller mints nft
        const { nftId, amount } = await mintAndApprove1155(
          seller,
          marketplaceContract.address
        );

        const offer = [getTestItem1155(nftId, amount, amount)];

        const consideration = [
          getItemETH(parseEther("10"), parseEther("10"), seller.address),
          getItemETH(parseEther("1"), parseEther("1"), zone.address),
          getItemETH(parseEther("1"), parseEther("1"), owner.address),
        ];

        const { order, orderHash, value } = await createOrder(
          seller,
          zone,
          offer,
          consideration,
          0 // FULL_OPEN
        );

        const { mirrorOrder, mirrorOrderHash } = await createMirrorBuyNowOrder(
          buyer,
          zone,
          order
        );

        const fulfillments = defaultBuyNowMirrorFulfillment;

        const executions = await simulateMatchOrders(
          marketplaceContract,
          [order, mirrorOrder],
          fulfillments,
          owner,
          value
        );

        expect(executions.length).to.equal(4);

        const tx = marketplaceContract
          .connect(owner)
          .matchOrders([order, mirrorOrder], fulfillments, {
            value,
          });
        const receipt = await (await tx).wait();
        await checkExpectedEvents(
          tx,
          receipt,
          [
            {
              order,
              orderHash,
              fulfiller: ethers.constants.AddressZero,
            },
            {
              order: mirrorOrder,
              orderHash: mirrorOrderHash,
              fulfiller: ethers.constants.AddressZero,
            },
          ],
          executions
        );
        return receipt;
      });
      it("ERC1155 <=> ETH (match via conduit)", async () => {
        // Seller mints nft
        const { nftId, amount } = await mintAndApprove1155(
          seller,
          conduitOne.address
        );

        const offer = [getTestItem1155(nftId, amount, amount)];

        const consideration = [
          getItemETH(parseEther("10"), parseEther("10"), seller.address),
          getItemETH(parseEther("1"), parseEther("1"), zone.address),
          getItemETH(parseEther("1"), parseEther("1"), owner.address),
        ];

        const { order, orderHash, value } = await createOrder(
          seller,
          zone,
          offer,
          consideration,
          0, // FULL_OPEN
          [],
          null,
          seller,
          ethers.constants.HashZero,
          conduitKeyOne
        );

        const { mirrorOrder, mirrorOrderHash } = await createMirrorBuyNowOrder(
          buyer,
          zone,
          order
        );

        const fulfillments = defaultBuyNowMirrorFulfillment;

        const executions = await simulateMatchOrders(
          marketplaceContract,
          [order, mirrorOrder],
          fulfillments,
          owner,
          value
        );

        expect(executions.length).to.equal(4);

        const tx = marketplaceContract
          .connect(owner)
          .matchOrders([order, mirrorOrder], fulfillments, {
            value,
          });
        const receipt = await (await tx).wait();
        await checkExpectedEvents(
          tx,
          receipt,
          [
            {
              order,
              orderHash,
              fulfiller: ethers.constants.AddressZero,
            },
            {
              order: mirrorOrder,
              orderHash: mirrorOrderHash,
              fulfiller: ethers.constants.AddressZero,
            },
          ],
          executions
        );
        return receipt;
      });
      it("ERC1155 <=> ERC20 (standard)", async () => {
        // Seller mints nft
        const { nftId, amount } = await mintAndApprove1155(
          seller,
          marketplaceContract.address
        );

        // Buyer mints ERC20
        const tokenAmount = minRandom(100);
        await mintAndApproveERC20(
          buyer,
          marketplaceContract.address,
          tokenAmount
        );

        const offer = [getTestItem1155(nftId, amount, amount)];

        const consideration = [
          getTestItem20(
            tokenAmount.sub(100),
            tokenAmount.sub(100),
            seller.address
          ),
          getTestItem20(50, 50, zone.address),
          getTestItem20(50, 50, owner.address),
        ];

        const { order, orderHash } = await createOrder(
          seller,
          zone,
          offer,
          consideration,
          0 // FULL_OPEN
        );

        await withBalanceChecks([order], 0, undefined, async () => {
          const tx = marketplaceContract
            .connect(buyer)
            .fulfillOrder(order, toKey(0));
          const receipt = await (await tx).wait();
          await checkExpectedEvents(tx, receipt, [
            {
              order,
              orderHash,
              fulfiller: buyer.address,
              fulfillerConduitKey: toKey(0),
            },
          ]);

          return receipt;
        });
      });
      it("ERC1155 <=> ERC20 (basic)", async () => {
        // Seller mints nft
        const { nftId, amount } = await mintAndApprove1155(
          seller,
          marketplaceContract.address
        );

        // Buyer mints ERC20
        const tokenAmount = minRandom(100);
        await mintAndApproveERC20(
          buyer,
          marketplaceContract.address,
          tokenAmount
        );

        const offer = [getTestItem1155(nftId, amount, amount)];

        const consideration = [
          getTestItem20(
            tokenAmount.sub(100),
            tokenAmount.sub(100),
            seller.address
          ),
          getTestItem20(50, 50, zone.address),
          getTestItem20(50, 50, owner.address),
        ];

        const { order, orderHash } = await createOrder(
          seller,
          zone,
          offer,
          consideration,
          0 // FULL_OPEN
        );

        const basicOrderParameters = getBasicOrderParameters(
          3, // ERC20ForERC1155
          order
        );

        await withBalanceChecks([order], 0, undefined, async () => {
          const tx = marketplaceContract
            .connect(buyer)
            .fulfillBasicOrder(basicOrderParameters);
          const receipt = await (await tx).wait();
          await checkExpectedEvents(
            tx,
            receipt,
            [
              {
                order,
                orderHash,
                fulfiller: buyer.address,
              },
            ],
            getBasicOrderExecutions(order, buyer.address, conduitKeyOne)
          );

          return receipt;
        });
      });
    });

  });
  */
});
