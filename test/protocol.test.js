const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const { expect, assert } = require("chai");
const Dai = artifacts.require("Dai");
const Factory = artifacts.require("LendersFactory");
const unERC20Proxy = artifacts.require("UnERC20Proxy");
const unERC20 = artifacts.require("UNERC20");
const DataProvider = artifacts.require("DataProvider");
const InterestRate = artifacts.require("InterestRateStatergy");

chai.use(chaiAsPromised);

contract("Factory Contract", (accounts) => {
  let dai;
  let factory;
  let unERC20ProxyContract;
  let urERC20contract;
  let interestRate;
  let dataProvider;

  describe("create new liquidity contract and provide liquidity", async () => {
    before(async () => {
      dai = await Dai.new(web3.utils.toWei("10000"), { from: accounts[0] });

      urERC20contract = await unERC20.new();

      await urERC20contract.initialize(dai.address, "Dai", "Dai", accounts[0]);

      unERC20ProxyContract = await unERC20Proxy.new(
        urERC20contract.address,
        "0x",
        {
          from: accounts[0],
        }
      );

      interestRate = await InterestRate.new();

      dataProvider = await DataProvider.new();

      await interestRate.initialize(dataProvider.address, 5);

      factory = await Factory.new(
        unERC20ProxyContract.address,
        urERC20contract.address,
        dataProvider.address,
        interestRate.address,
        {
          from: accounts[0],
        }
      );
      await dataProvider.initialize(10, 5, factory.address);
    });

    it("implementation contract is correct", async () => {
      assert.equal(
        urERC20contract.address,
        await unERC20ProxyContract.getImplementation()
      );
    });
  });

  describe("Liquidity Contract", async () => {
    let daiTokenWrapper;
    let daiAddress;

    it("create a new token wrapper contract", async () => {
      await factory.createLiquidityContract(dai.address, "Dai", "Dai");

      daiAddress = await factory.getContractAddress(dai.address);

      daiTokenWrapper = new web3.eth.Contract(unERC20.abi, daiAddress);
      const name = await daiTokenWrapper.methods.name().call();
      assert.equal(name, "Dai");
    });

    it("number of contracts is stored correctly", async () => {
      const numberOfContracts = await dataProvider.getContracts();
      assert.equal(numberOfContracts.length, 1);
      assert.equal(dai.address, numberOfContracts[0][0]);
    });

    it("adding liquidity", async () => {
      // approve dai spending
      await dai.approve(factory.address, web3.utils.toWei("5000"));
      assert.equal(
        await dai.allowance(accounts[0], factory.address),
        web3.utils.toWei("5000")
      );

      await factory.addLiquidity(web3.utils.toWei("4000"), dai.address);
      assert.equal(await dai.balanceOf(daiAddress), web3.utils.toWei("4000"));

      assert.equal(
        await daiTokenWrapper.methods.getTotalLiquidity().call(),
        web3.utils.toWei("4000")
      );

      const getLiquidityFromDataProvider = await dataProvider.getTotalLiquidity(
        dai.address
      );
      assert.equal(getLiquidityFromDataProvider, web3.utils.toWei("4000"));
    });

    it("withdraw liquidity", async () => {
      await factory.withdrawLiquidity(web3.utils.toWei("200"), dai.address, {
        from: accounts[0],
      });
      assert.equal(
        await daiTokenWrapper.methods.getTotalLiquidity().call(),
        web3.utils.toWei("3800")
      );

      const getLiquidityFromDataProvider = await dataProvider.getTotalLiquidity(
        dai.address
      );

      assert.equal(getLiquidityFromDataProvider, web3.utils.toWei("3800"));
    });

    it("add back liquiditiy", async () => {
      await factory.addLiquidity(web3.utils.toWei("200"), dai.address);
      assert.equal(
        await daiTokenWrapper.methods.getTotalLiquidity().call(),
        web3.utils.toWei("4000")
      );
    });

    it("interest values tests", async () => {
      const dataInput = await dataProvider.getValuesForInterestCalculation(
        daiAddress
      );

      assert.equal(dataInput[0], 10);
      assert.equal(dataInput[1], 5);
      assert.equal(dataInput[2], 0);
      assert.equal(dataInput[3], web3.utils.toWei("4000"));
    });

    it("return proxy function", async () => {
      const proxyAddress = await dataProvider.returnProxy(dai.address);
      assert.equal(proxyAddress, daiTokenWrapper._address);
    });

    it("Interest Calculation Functions Working", async () => {
      const amount = web3.utils.toWei("1500"); // 18 digits

      const data = await interestRate.calculatePaymentAmount(
        dai.address,
        amount,
        1
      );

      assert.equal(web3.utils.fromWei(data[0]), 6.5);
      assert.equal(web3.utils.fromWei(data[1]), 75);
    });

    it("account[2] issues a loan", async () => {
      await dai.transfer(accounts[2], 2000);

      assert.equal(await dai.balanceOf(accounts[2]), 2000);

      await factory.payInterest(dai.address, web3.utils.toWei("1500"), 1, {
        value: web3.utils.toWei("81.5", "ether"), // calculated above
        from: accounts[2],
      });

      await factory.issueLoan(dai.address, 1, web3.utils.toWei("1500"), {
        from: accounts[2],
      });

      assert.equal(
        await daiTokenWrapper.methods.balanceOf(accounts[2]).call(),
        web3.utils.toWei("1500")
      );

      const getUsedLiquidiityFromDataProvider =
        await dataProvider.getUsedLiquidity(dai.address);
      assert(getUsedLiquidiityFromDataProvider, web3.utils.toWei("1500"));
    });

    it("accounts[2] paybacks the loan", async () => {
      await factory.paybackLoan(dai.address, web3.utils.toWei("1500"), {
        from: accounts[2],
      });

      assert.equal(
        await daiTokenWrapper.methods.balanceOf(accounts[2]).call(),
        0
      );
    });

    it("getUserDetails() function", async () => {
      const dataUser = await dataProvider.getUserDetailsForGivenContract(
        accounts[2],
        dai.address
      );

      assert(dataUser.borrowedAmount, web3.utils.toWei("1500"));

      const dataLiquiditiyProvider =
        await dataProvider.getUserDetailsForGivenContract(
          accounts[0],
          dai.address
        );

      assert(dataUser.borrowedAmount, web3.utils.toWei("1500"));
    });

    // balanceSupply Test
    it("balanceSupply() test", async () => {
      assert(
        await factory.balanceSupply.call(dai.address),
        web3.utils.toWei("1500")
      );
    });

    // transfer events test
  });
});
