import { expect } from "chai";
import { BigNumber } from "ethers";
/**
 * Buy now or accept offer for a single ERC721 or ERC1155 in exchange for
 * ETH, WETH or ERC20
 */
describe(`test`, function () {
  it("bignumber", async () => {
    let res: any = BigNumber.from("0x329f1e0732976fab3897d703190ac1bf");
    console.log(res.toString());

    res = BigNumber.from("67287584032295404019069645475193471423");
    console.log(res);
  });

  it("reduce", async () => {
    const data: any = [
      BigNumber.from("0x013c365f9bc8"),
      BigNumber.from("0x032980f4c2"),
      BigNumber.from("0x065301e984"),
    ];

    const res = data.reduce((a: any, b: any) => a.add(b), BigNumber.from(0));

    console.log("res", res.toString());
  });
});
