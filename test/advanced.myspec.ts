import { expect } from "chai";
import { ethers, network } from "hardhat";

import { merkleTree } from "./utils/criteria";
import {
  buildOrderStatus,
  buildResolver,
  defaultAcceptOfferMirrorFulfillment,
  defaultBuyNowMirrorFulfillment,
  getItemETH,
  random128,
  randomBN,
  randomHex,
  toBN,
  toFulfillment,
  toFulfillmentComponents,
  toKey,
} from "./utils/encoding";
import { faucet } from "./utils/faucet";
import { seaportFixture } from "./utils/fixtures";
import {
  VERSION,
  minRandom,
  simulateAdvancedMatchOrders,
  simulateMatchOrders,
} from "./utils/helpers";

import type {
  ConduitInterface,
  ConsiderationInterface,
  TestERC1155,
  TestERC20,
  TestERC721,
} from "../typechain-types";
import type { SeaportFixtures } from "./utils/fixtures";
import type { AdvancedOrder, ConsiderationItem } from "./utils/types";
import type { Wallet } from "ethers";

const { parseEther } = ethers.utils;

describe(`Advanced orders (Seaport v${VERSION})`, function () {
  const { provider } = ethers;
  const owner = new ethers.Wallet(randomHex(32), provider);

  let conduitKeyOne: string;
  let conduitOne: ConduitInterface;
  let marketplaceContract: ConsiderationInterface;
  let testERC1155: TestERC1155;
  let testERC1155Two: TestERC1155;
  let testERC20: TestERC20;
  let testERC721: TestERC721;

  let checkExpectedEvents: SeaportFixtures["checkExpectedEvents"];
  let createMirrorAcceptOfferOrder: SeaportFixtures["createMirrorAcceptOfferOrder"];
  let createMirrorBuyNowOrder: SeaportFixtures["createMirrorBuyNowOrder"];
  let createOrder: SeaportFixtures["createOrder"];
  let getTestItem1155: SeaportFixtures["getTestItem1155"];
  let getTestItem1155WithCriteria: SeaportFixtures["getTestItem1155WithCriteria"];
  let getTestItem20: SeaportFixtures["getTestItem20"];
  let getTestItem721: SeaportFixtures["getTestItem721"];
  let getTestItem721WithCriteria: SeaportFixtures["getTestItem721WithCriteria"];
  let mint1155: SeaportFixtures["mint1155"];
  let mint721: SeaportFixtures["mint721"];
  let mint721s: SeaportFixtures["mint721s"];
  let mintAndApprove1155: SeaportFixtures["mintAndApprove1155"];
  let mintAndApprove721: SeaportFixtures["mintAndApprove721"];
  let mintAndApproveERC20: SeaportFixtures["mintAndApproveERC20"];
  let set1155ApprovalForAll: SeaportFixtures["set1155ApprovalForAll"];
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
      getTestItem1155,
      getTestItem1155WithCriteria,
      getTestItem20,
      getTestItem721,
      getTestItem721WithCriteria,
      marketplaceContract,
      mint1155,
      mint721,
      mint721s,
      mintAndApprove1155,
      mintAndApprove721,
      mintAndApproveERC20,
      set1155ApprovalForAll,
      set721ApprovalForAll,
      testERC1155,
      testERC1155Two,
      testERC20,
      testERC721,
      withBalanceChecks,
    } = await seaportFixture(owner));
  });

  let seller: Wallet;
  let buyer: Wallet;
  let zone: Wallet;

  beforeEach(async () => {
    // Setup basic buyer/seller wallets with ETH
    seller = new ethers.Wallet(randomHex(32), provider);
    buyer = new ethers.Wallet(randomHex(32), provider);
    zone = new ethers.Wallet(randomHex(32), provider);
    for (const wallet of [seller, buyer, zone]) {
      await faucet(wallet.address, provider);
    }
  });


  describe("Fulfill Available Orders", async () => {

    it("Can fulfill and aggregate multiple orders via fulfillAvailableOrders", async () => {
      // Seller mints nft
      const { nftId, amount } = await mintAndApprove1155(
        seller,
        marketplaceContract.address,
        1,
        1,
        10000
      );

      const offer = [getTestItem1155(nftId, amount.div(2), amount.div(2))];

      const consideration = [
        getItemETH(parseEther("10"), parseEther("10"), seller.address),
        getItemETH(parseEther("1"), parseEther("1"), zone.address),
        getItemETH(parseEther("1"), parseEther("1"), owner.address),
      ];

      const {
        order: orderOne,
        orderHash: orderHashOne,
        value,
      } = await createOrder(
        seller,
        zone,
        offer,
        consideration,
        0 // FULL_OPEN
      );

      const { order: orderTwo, orderHash: orderHashTwo } = await createOrder(
        seller,
        zone,
        offer,
        consideration,
        0 // FULL_OPEN
      );

      const offerComponents = [
        toFulfillmentComponents([
          [0, 0],
          [1, 0],
        ]),
      ];

      const considerationComponents = [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [0, 1],
          [1, 1],
        ],
        [
          [0, 2],
          [1, 2],
        ],
      ].map(toFulfillmentComponents);

      await withBalanceChecks(
        [orderOne, orderTwo],
        0,
        undefined,
        async () => {
          const tx = marketplaceContract
            .connect(buyer)
            .fulfillAvailableOrders(
              [orderOne, orderTwo],
              offerComponents,
              considerationComponents,
              toKey(0),
              100,
              {
                value: value.mul(2),
              }
            );
          const receipt = await (await tx).wait();
          await checkExpectedEvents(
            tx,
            receipt,
            [
              {
                order: orderOne,
                orderHash: orderHashOne,
                fulfiller: buyer.address,
              },
              {
                order: orderTwo,
                orderHash: orderHashTwo,
                fulfiller: buyer.address,
              },
            ],
            [],
            [],
            false,
            2
          );
          return receipt;
        },
        2
      );
    });


  });
});
