import { expect } from "chai";
import { ethers, network } from "hardhat";

import {
  buildOrderStatus,
  defaultBuyNowMirrorFulfillment,
  getItemETH,
  randomHex,
  toBN,
  toKey,
} from "./utils/encoding";
import { faucet } from "./utils/faucet";
import { seaportFixture } from "./utils/fixtures";
import { VERSION, simulateAdvancedMatchOrders } from "./utils/helpers";

import type { ConsiderationInterface } from "../typechain-types";
import type { SeaportFixtures } from "./utils/fixtures";
import type { AdvancedOrder } from "./utils/types";
import { BigNumber, Wallet } from "ethers";

describe(`Advanced orders (Seaport v${VERSION})`, function () {
  const { provider } = ethers;
  const owner = new ethers.Wallet(randomHex(32), provider);

  let marketplaceContract: ConsiderationInterface;
  let checkExpectedEvents: SeaportFixtures["checkExpectedEvents"];
  let createMirrorBuyNowOrder: SeaportFixtures["createMirrorBuyNowOrder"];
  let createOrder: SeaportFixtures["createOrder"];
  let getTestItem1155: SeaportFixtures["getTestItem1155"];
  let getTestItem20: SeaportFixtures["getTestItem20"];
  let mintAndApprove1155: SeaportFixtures["mintAndApprove1155"];
  let mintAndApproveERC20: SeaportFixtures["mintAndApproveERC20"];
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
      createMirrorBuyNowOrder,
      createOrder,
      getTestItem1155,
      getTestItem20,
      marketplaceContract,
      mintAndApprove1155,
      mintAndApproveERC20,
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

  describe("Partial fills", async () => {
    it("Partial fills (standard)", async () => {
      // Seller mints nft
      const { nftId, amount } = await mintAndApprove1155(
        seller,
        marketplaceContract.address,
        10000
      );

      console.log("nft id", nftId.toString(), amount.toString());

      const offer = [getTestItem1155(nftId, amount.mul(10), amount.mul(10))];

      const consideration = [
        getItemETH(amount.mul(1000), amount.mul(1000), seller.address),
        getItemETH(amount.mul(10), amount.mul(10), zone.address),
        getItemETH(amount.mul(20), amount.mul(20), owner.address),
      ];

      const { order, orderHash, value } = await createOrder(
        seller,
        zone,
        offer,
        consideration,
        1 // PARTIAL_OPEN
      );

      console.log("order value", value.toString());
      const payValue = value.mul(2).div(amount.mul(10));
      console.log("order payValue", payValue.toString());

      let orderStatus = await marketplaceContract.getOrderStatus(orderHash);
      console.log("order status 0", orderHash, orderStatus);
      expect({ ...orderStatus }).to.deep.equal(
        buildOrderStatus(false, false, 0, 0)
      );

      order.numerator = 2; // fill two tenths or one fifth
      order.denominator = 10; // fill two tenths or one fifth

      console.log(
        "order nft id",
        order.parameters.offer[0].identifierOrCriteria.toString()
      );
      console.log(
        "order offer amount",
        order.parameters.offer[0].startAmount.toString()
      );
      console.log(JSON.stringify(order, null, 2));

      const buyerBalance0 = await provider.getBalance(buyer.address);

      await withBalanceChecks([order], 0, [], async () => {
        const tx = marketplaceContract
          .connect(buyer)
          .fulfillAdvancedOrder(
            order,
            [],
            toKey(0),
            ethers.constants.AddressZero,
            {
              value,
            }
          );
        const receipt = await (await tx).wait();
        await checkExpectedEvents(
          tx,
          receipt,
          [
            {
              order,
              orderHash,
              fulfiller: buyer.address,
              fulfillerConduitKey: toKey(0),
            },
          ],
          undefined,
          []
        );

        return receipt;
      });

      const buyerBalance1 = await provider.getBalance(buyer.address);
      orderStatus = await marketplaceContract.getOrderStatus(orderHash);
      console.log("order status 1", orderHash, orderStatus);

      console.log("buyer paid:", buyerBalance0.sub(buyerBalance1).toString());
      // expect({ ...orderStatus }).to.deep.equal(
      //   buildOrderStatus(true, false, 2, 10)
      // );

      // order.numerator = 1; // fill one half
      // order.denominator = 2; // fill one half

      // await withBalanceChecks([order], 0, [], async () => {
      //   const tx = marketplaceContract
      //     .connect(buyer)
      //     .fulfillAdvancedOrder(
      //       order,
      //       [],
      //       toKey(0),
      //       ethers.constants.AddressZero,
      //       {
      //         value,
      //       }
      //     );
      //   const receipt = await (await tx).wait();
      //   await checkExpectedEvents(
      //     tx,
      //     receipt,
      //     [
      //       {
      //         order,
      //         orderHash,
      //         fulfiller: buyer.address,
      //         fulfillerConduitKey: toKey(0),
      //       },
      //     ],
      //     undefined,
      //     []
      //   );

      //   return receipt;
      // });

      // orderStatus = await marketplaceContract.getOrderStatus(orderHash);

      // expect({ ...orderStatus }).to.deep.equal(
      //   buildOrderStatus(true, false, 14, 20)
      // );

      // // Fill remaining; only 3/10ths will be fillable
      // order.numerator = 1; // fill one half
      // order.denominator = 2; // fill one half

      // const ordersClone = [{ ...order }] as AdvancedOrder[];
      // for (const [, clonedOrder] of Object.entries(ordersClone)) {
      //   clonedOrder.parameters.startTime = order.parameters.startTime;
      //   clonedOrder.parameters.endTime = order.parameters.endTime;

      //   for (const [j, offerItem] of Object.entries(
      //     clonedOrder.parameters.offer
      //   )) {
      //     offerItem.startAmount = order.parameters.offer[+j].startAmount;
      //     offerItem.endAmount = order.parameters.offer[+j].endAmount;
      //   }

      //   for (const [j, considerationItem] of Object.entries(
      //     clonedOrder.parameters.consideration
      //   )) {
      //     considerationItem.startAmount =
      //       order.parameters.consideration[+j].startAmount;
      //     considerationItem.endAmount =
      //       order.parameters.consideration[+j].endAmount;
      //   }
      // }

      // ordersClone[0].numerator = 3;
      // ordersClone[0].denominator = 10;

      // await withBalanceChecks(ordersClone, 0, [], async () => {
      //   const tx = marketplaceContract
      //     .connect(buyer)
      //     .fulfillAdvancedOrder(
      //       order,
      //       [],
      //       toKey(0),
      //       ethers.constants.AddressZero,
      //       {
      //         value,
      //       }
      //     );
      //   const receipt = await (await tx).wait();
      //   await checkExpectedEvents(
      //     tx,
      //     receipt,
      //     [
      //       {
      //         order: ordersClone[0],
      //         orderHash,
      //         fulfiller: buyer.address,
      //       },
      //     ],
      //     undefined,
      //     []
      //   );

      //   return receipt;
      // });

      // orderStatus = await marketplaceContract.getOrderStatus(orderHash);
      // console.log('order status', orderHash, orderStatus);
      // expect({ ...orderStatus }).to.deep.equal(
      //   buildOrderStatus(true, false, 40, 40)
      // );
    });
    // it("Partial fills (standard, additional permutations)", async () => {
    //   // Seller mints nft
    //   const { nftId, amount } = await mintAndApprove1155(
    //     seller,
    //     marketplaceContract.address,
    //     10000
    //   );

    //   const offer = [getTestItem1155(nftId, amount.mul(10), amount.mul(10))];

    //   const consideration = [
    //     getItemETH(amount.mul(1000), amount.mul(1000), seller.address),
    //     getItemETH(amount.mul(10), amount.mul(10), zone.address),
    //     getItemETH(amount.mul(20), amount.mul(20), owner.address),
    //   ];

    //   const { order, orderHash, value } = await createOrder(
    //     seller,
    //     zone,
    //     offer,
    //     consideration,
    //     1 // PARTIAL_OPEN
    //   );

    //   let orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(false, false, 0, 0)
    //   );

    //   order.numerator = 2; // fill two tenths or one fifth
    //   order.denominator = 10; // fill two tenths or one fifth

    //   await withBalanceChecks([order], 0, [], async () => {
    //     const tx = marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(
    //         order,
    //         [],
    //         toKey(0),
    //         ethers.constants.AddressZero,
    //         {
    //           value,
    //         }
    //       );
    //     const receipt = await (await tx).wait();
    //     await checkExpectedEvents(
    //       tx,
    //       receipt,
    //       [
    //         {
    //           order,
    //           orderHash,
    //           fulfiller: buyer.address,
    //           fulfillerConduitKey: toKey(0),
    //         },
    //       ],
    //       undefined,
    //       []
    //     );

    //     return receipt;
    //   });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 2, 10)
    //   );

    //   order.numerator = 1; // fill one tenth
    //   order.denominator = 10; // fill one tenth

    //   await withBalanceChecks([order], 0, [], async () => {
    //     const tx = marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(
    //         order,
    //         [],
    //         toKey(0),
    //         ethers.constants.AddressZero,
    //         {
    //           value,
    //         }
    //       );
    //     const receipt = await (await tx).wait();
    //     await checkExpectedEvents(
    //       tx,
    //       receipt,
    //       [
    //         {
    //           order,
    //           orderHash,
    //           fulfiller: buyer.address,
    //           fulfillerConduitKey: toKey(0),
    //         },
    //       ],
    //       undefined,
    //       []
    //     );

    //     return receipt;
    //   });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 3, 10)
    //   );

    //   // Fill all available; only 7/10ths will be fillable
    //   order.numerator = 1; // fill all available
    //   order.denominator = 1; // fill all available

    //   const ordersClone = [{ ...order }] as AdvancedOrder[];
    //   for (const [, clonedOrder] of Object.entries(ordersClone)) {
    //     clonedOrder.parameters.startTime = order.parameters.startTime;
    //     clonedOrder.parameters.endTime = order.parameters.endTime;

    //     for (const [j, offerItem] of Object.entries(
    //       clonedOrder.parameters.offer
    //     )) {
    //       offerItem.startAmount = order.parameters.offer[+j].startAmount;
    //       offerItem.endAmount = order.parameters.offer[+j].endAmount;
    //     }

    //     for (const [j, considerationItem] of Object.entries(
    //       clonedOrder.parameters.consideration
    //     )) {
    //       considerationItem.startAmount =
    //         order.parameters.consideration[+j].startAmount;
    //       considerationItem.endAmount =
    //         order.parameters.consideration[+j].endAmount;
    //     }
    //   }

    //   ordersClone[0].numerator = 7;
    //   ordersClone[0].denominator = 10;

    //   await withBalanceChecks(ordersClone, 0, [], async () => {
    //     const tx = marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(
    //         order,
    //         [],
    //         toKey(0),
    //         ethers.constants.AddressZero,
    //         {
    //           value,
    //         }
    //       );
    //     const receipt = await (await tx).wait();
    //     await checkExpectedEvents(
    //       tx,
    //       receipt,
    //       [
    //         {
    //           order: ordersClone[0],
    //           orderHash,
    //           fulfiller: buyer.address,
    //         },
    //       ],
    //       undefined,
    //       []
    //     );

    //     return receipt;
    //   });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 10, 10)
    //   );
    // });
    // it("Partial fills (match)", async () => {
    //   // Seller mints nft
    //   const { nftId, amount } = await mintAndApprove1155(
    //     seller,
    //     marketplaceContract.address,
    //     10000
    //   );

    //   const offer = [getTestItem1155(nftId, amount.mul(10), amount.mul(10))];

    //   const consideration = [
    //     getItemETH(amount.mul(1000), amount.mul(1000), seller.address),
    //     getItemETH(amount.mul(10), amount.mul(10), zone.address),
    //     getItemETH(amount.mul(20), amount.mul(20), owner.address),
    //   ];

    //   const { order, orderHash, value } = await createOrder(
    //     seller,
    //     zone,
    //     offer,
    //     consideration,
    //     1 // PARTIAL_OPEN
    //   );

    //   let orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(false, false, 0, 0)
    //   );

    //   order.numerator = 2; // fill two tenths or one fifth
    //   order.denominator = 10; // fill two tenths or one fifth

    //   let mirrorObject;
    //   mirrorObject = await createMirrorBuyNowOrder(buyer, zone, order);

    //   const fulfillments = defaultBuyNowMirrorFulfillment;

    //   let executions = await simulateAdvancedMatchOrders(
    //     marketplaceContract,
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     owner,
    //     value
    //   );

    //   expect(executions.length).to.equal(4);

    //   const tx = marketplaceContract.connect(owner).matchAdvancedOrders(
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     {
    //       value,
    //     }
    //   );
    //   const receipt = await (await tx).wait();
    //   await checkExpectedEvents(
    //     tx,
    //     receipt,
    //     [
    //       {
    //         order,
    //         orderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //     ],
    //     executions
    //   );

    //   await checkExpectedEvents(
    //     tx,
    //     receipt,
    //     [
    //       {
    //         order: mirrorObject.mirrorOrder,
    //         orderHash: mirrorObject.mirrorOrderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //     ],
    //     executions
    //   );

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 2, 10)
    //   );

    //   order.numerator = 1; // fill one tenth
    //   order.denominator = 10; // fill one tenth

    //   mirrorObject = await createMirrorBuyNowOrder(buyer, zone, order);

    //   executions = await simulateAdvancedMatchOrders(
    //     marketplaceContract,
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     owner,
    //     value
    //   );

    //   const tx2 = marketplaceContract.connect(owner).matchAdvancedOrders(
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     {
    //       value,
    //     }
    //   );
    //   const receipt2 = await (await tx2).wait();
    //   await checkExpectedEvents(
    //     tx2,
    //     receipt2,
    //     [
    //       {
    //         order,
    //         orderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //       {
    //         order: mirrorObject.mirrorOrder,
    //         orderHash: mirrorObject.mirrorOrderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //     ],
    //     executions
    //   );

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 3, 10)
    //   );

    //   // Fill all available; only 7/10ths will be fillable
    //   order.numerator = 7; // fill all available
    //   order.denominator = 10; // fill all available

    //   mirrorObject = await createMirrorBuyNowOrder(buyer, zone, order);

    //   executions = await simulateAdvancedMatchOrders(
    //     marketplaceContract,
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     owner,
    //     value
    //   );

    //   const tx3 = await marketplaceContract.connect(owner).matchAdvancedOrders(
    //     [order, mirrorObject.mirrorOrder],
    //     [], // no criteria resolvers
    //     fulfillments,
    //     {
    //       value,
    //     }
    //   );
    //   const receipt3 = await tx3.wait();
    //   await checkExpectedEvents(
    //     tx3,
    //     receipt3,
    //     [
    //       {
    //         order,
    //         orderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //       {
    //         order: mirrorObject.mirrorOrder,
    //         orderHash: mirrorObject.mirrorOrderHash,
    //         fulfiller: ethers.constants.AddressZero,
    //       },
    //     ],
    //     executions
    //   );
    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, 10, 10)
    //   );
    // });

    // it("Simplifies fraction when numerator/denominator would overflow", async () => {
    //   const numer1 = toBN(2).pow(100);
    //   const denom1 = toBN(2).pow(101);
    //   const numer2 = toBN(2).pow(20);
    //   const denom2 = toBN(2).pow(22);
    //   const amt = 8;
    //   await mintAndApproveERC20(buyer, marketplaceContract.address, amt);
    //   // Seller mints nft
    //   const { nftId } = await mintAndApprove1155(
    //     seller,
    //     marketplaceContract.address,
    //     10000,
    //     undefined,
    //     amt
    //   );

    //   const offer = [getTestItem1155(nftId, amt, amt)];

    //   const consideration = [getTestItem20(amt, amt, seller.address)];
    //   const { order, orderHash, value } = await createOrder(
    //     seller,
    //     undefined,
    //     offer,
    //     consideration,
    //     1, // PARTIAL_OPEN
    //     undefined,
    //     undefined,
    //     undefined,
    //     undefined,
    //     undefined,
    //     true
    //   );
    //   let orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(false, false, 0, 0)
    //   );

    //   // 1/2
    //   order.numerator = numer1 as any; // would error here if cast to number (due to overflow)
    //   order.denominator = denom1 as any;

    //   await withBalanceChecks([order], 0, [], async () => {
    //     const tx = marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(order, [], toKey(0), buyer.address, {
    //         value,
    //       });
    //     const receipt = await (await tx).wait();
    //     await checkExpectedEvents(
    //       tx,
    //       receipt,
    //       [
    //         {
    //           order,
    //           orderHash,
    //           fulfiller: buyer.address,
    //           fulfillerConduitKey: toKey(0),
    //         },
    //       ],
    //       undefined,
    //       []
    //     );

    //     return receipt;
    //   });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, numer1, denom1)
    //   );

    //   order.numerator = +numer2;
    //   order.denominator = +denom2;

    //   await marketplaceContract
    //     .connect(buyer)
    //     .fulfillAdvancedOrder(order, [], toKey(0), buyer.address, {
    //       value,
    //     });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, toBN(3), toBN(4))
    //   );
    // });

    // it("Reverts when numerator/denominator overflow", async () => {
    //   const prime1 = toBN(2).pow(7).sub(1);
    //   const prime2 = toBN(2).pow(61).sub(1);
    //   const prime3 = toBN(2).pow(107).sub(1);
    //   const amt = prime1.mul(prime2).mul(prime3);
    //   await mintAndApproveERC20(buyer, marketplaceContract.address, amt);
    //   // Seller mints nft
    //   const { nftId } = await mintAndApprove1155(
    //     seller,
    //     marketplaceContract.address,
    //     10000,
    //     undefined,
    //     amt
    //   );

    //   const offer = [getTestItem1155(nftId, amt, amt)];

    //   const consideration = [getTestItem20(amt, amt, seller.address)];
    //   const { order, orderHash, value } = await createOrder(
    //     seller,
    //     undefined,
    //     offer,
    //     consideration,
    //     1, // PARTIAL_OPEN
    //     undefined,
    //     undefined,
    //     undefined,
    //     undefined,
    //     undefined,
    //     true
    //   );
    //   let orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(false, false, 0, 0)
    //   );

    //   // 1/2
    //   order.numerator = 1;
    //   order.denominator = prime2 as any; // would error here if cast to number (due to overflow)

    //   await withBalanceChecks([order], 0, [], async () => {
    //     const tx = marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(order, [], toKey(0), buyer.address, {
    //         value,
    //       });
    //     const receipt = await (await tx).wait();
    //     await checkExpectedEvents(
    //       tx,
    //       receipt,
    //       [
    //         {
    //           order,
    //           orderHash,
    //           fulfiller: buyer.address,
    //           fulfillerConduitKey: toKey(0),
    //         },
    //       ],
    //       undefined,
    //       []
    //     );

    //     return receipt;
    //   });

    //   orderStatus = await marketplaceContract.getOrderStatus(orderHash);

    //   expect({ ...orderStatus }).to.deep.equal(
    //     buildOrderStatus(true, false, toBN(1), prime2)
    //   );

    //   order.numerator = prime1 as any; // would error here if cast to number (due to overflow)
    //   order.denominator = prime3 as any;

    //   await expect(
    //     marketplaceContract
    //       .connect(buyer)
    //       .fulfillAdvancedOrder(order, [], toKey(0), buyer.address, {
    //         value,
    //       })
    //   ).to.be.revertedWith(
    //     "0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
    //   );
    // });
  });
});
