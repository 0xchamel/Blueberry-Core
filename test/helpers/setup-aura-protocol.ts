import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, utils } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  BlueBerryBank,
  CoreOracle,
  IWETH,
  MockOracle,
  SoftVault,
  WERC20,
  ProtocolConfig,
  IComptroller,
  ERC20,
  IUniswapV2Router02,
  HardVault,
  FeeManager,
  UniV3WrappedLib,
  CurveOracle,
  WAuraPools,
  AuraSpell,
} from "../../typechain-types";
import { ADDRESS, CONTRACT_NAMES } from "../../constant";

const CUSDC = ADDRESS.bUSDC;
const CDAI = ADDRESS.bDAI;
const CCRV = ADDRESS.bCRV;
const WETH = ADDRESS.WETH;
const USDC = ADDRESS.USDC;
const USDT = ADDRESS.USDT;
const DAI = ADDRESS.DAI;
const FRAX = ADDRESS.FRAX;
const CRV = ADDRESS.CRV;
const AURA = ADDRESS.AURA;
const BAL = ADDRESS.BAL;
const ETH_PRICE = 1600;

export interface AuraProtocol {
  werc20: WERC20;
  waura: WAuraPools;
  mockOracle: MockOracle;
  curveOracle: CurveOracle;
  oracle: CoreOracle;
  config: ProtocolConfig;
  bank: BlueBerryBank;
  auraSpell: AuraSpell;
  usdcSoftVault: SoftVault;
  crvSoftVault: SoftVault;
  daiSoftVault: SoftVault;
  hardVault: HardVault;
  feeManager: FeeManager;
  uniV3Lib: UniV3WrappedLib;
}

export const setupAuraProtocol = async (): Promise<AuraProtocol> => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;

  let usdc: ERC20;
  let dai: ERC20;
  let crv: ERC20;
  let weth: IWETH;
  let werc20: WERC20;
  let waura: WAuraPools;
  let mockOracle: MockOracle;
  let curveOracle: CurveOracle;
  let oracle: CoreOracle;
  let auraSpell: AuraSpell;

  let config: ProtocolConfig;
  let feeManager: FeeManager;
  let bank: BlueBerryBank;
  let usdcSoftVault: SoftVault;
  let crvSoftVault: SoftVault;
  let daiSoftVault: SoftVault;
  let hardVault: HardVault;

  [admin, alice, treasury] = await ethers.getSigners();
  usdc = <ERC20>await ethers.getContractAt("ERC20", USDC);
  dai = <ERC20>await ethers.getContractAt("ERC20", DAI);
  crv = <ERC20>await ethers.getContractAt("ERC20", CRV);
  weth = <IWETH>await ethers.getContractAt(CONTRACT_NAMES.IWETH, WETH);

  // Prepare USDC
  // deposit 80 eth -> 80 WETH
  await weth.deposit({ value: utils.parseUnits("100") });

  // swap 40 WETH -> USDC, 40 WETH -> DAI
  await weth.approve(ADDRESS.UNI_V2_ROUTER, ethers.constants.MaxUint256);
  const uniV2Router = <IUniswapV2Router02>(
    await ethers.getContractAt(
      CONTRACT_NAMES.IUniswapV2Router02,
      ADDRESS.UNI_V2_ROUTER
    )
  );
  await uniV2Router.swapExactTokensForTokens(
    utils.parseUnits("30"),
    0,
    [WETH, USDC],
    admin.address,
    ethers.constants.MaxUint256
  );
  await uniV2Router.swapExactTokensForTokens(
    utils.parseUnits("30"),
    0,
    [WETH, DAI],
    admin.address,
    ethers.constants.MaxUint256
  );
  // Swap 40 weth -> crv
  await weth.approve(ADDRESS.SUSHI_ROUTER, ethers.constants.MaxUint256);
  const sushiRouter = <IUniswapV2Router02>(
    await ethers.getContractAt(
      CONTRACT_NAMES.IUniswapV2Router02,
      ADDRESS.SUSHI_ROUTER
    )
  );
  await sushiRouter.swapExactTokensForTokens(
    utils.parseUnits("40"),
    0,
    [WETH, CRV],
    admin.address,
    ethers.constants.MaxUint256
  );
  // Try to swap some crv to usdc -> Swap router test
  await crv.approve(ADDRESS.SUSHI_ROUTER, 0);
  await crv.approve(ADDRESS.SUSHI_ROUTER, ethers.constants.MaxUint256);
  await sushiRouter.swapExactTokensForTokens(
    utils.parseUnits("10"),
    0,
    [CRV, WETH, USDC],
    admin.address,
    ethers.constants.MaxUint256
  );

  const LinkedLibFactory = await ethers.getContractFactory("UniV3WrappedLib");
  const LibInstance = await LinkedLibFactory.deploy();

  const MockOracle = await ethers.getContractFactory(CONTRACT_NAMES.MockOracle);
  mockOracle = <MockOracle>await MockOracle.deploy();
  await mockOracle.deployed();
  await mockOracle.setPrice(
    [WETH, USDC, CRV, DAI, USDT, FRAX, AURA, BAL, ADDRESS.BAL_UDU],
    [
      BigNumber.from(10).pow(18).mul(ETH_PRICE),
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
      BigNumber.from(10).pow(18), // $1
    ]
  );

  const CurveOracle = await ethers.getContractFactory("CurveOracle");
  curveOracle = <CurveOracle>(
    await CurveOracle.deploy(mockOracle.address, ADDRESS.CRV_ADDRESS_PROVIDER)
  );
  await curveOracle.deployed();

  const CoreOracle = await ethers.getContractFactory(CONTRACT_NAMES.CoreOracle);
  oracle = <CoreOracle>await upgrades.deployProxy(CoreOracle);
  await oracle.deployed();

  await oracle.setRoutes(
    [WETH, USDC, CRV, DAI, USDT, FRAX, AURA, BAL, ADDRESS.BAL_UDU],
    [
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
      mockOracle.address,
    ]
  );

  // Deploy Bank
  const Config = await ethers.getContractFactory("ProtocolConfig");
  config = <ProtocolConfig>(
    await upgrades.deployProxy(Config, [treasury.address])
  );
  await config.deployed();
  // config.startVaultWithdrawFee();

  const FeeManager = await ethers.getContractFactory("FeeManager");
  feeManager = <FeeManager>(
    await upgrades.deployProxy(FeeManager, [config.address])
  );
  await feeManager.deployed();
  await config.setFeeManager(feeManager.address);

  const BlueBerryBank = await ethers.getContractFactory(
    CONTRACT_NAMES.BlueBerryBank
  );
  bank = <BlueBerryBank>(
    await upgrades.deployProxy(BlueBerryBank, [oracle.address, config.address])
  );
  await bank.deployed();

  const WERC20 = await ethers.getContractFactory(CONTRACT_NAMES.WERC20);
  werc20 = <WERC20>await upgrades.deployProxy(WERC20);
  await werc20.deployed();

  const WAuraPools = await ethers.getContractFactory(CONTRACT_NAMES.WAuraPools);
  waura = <WAuraPools>(
    await upgrades.deployProxy(WAuraPools, [AURA, ADDRESS.AURA_BOOSTER])
  );
  await waura.deployed();

  // Deploy CRV spell
  const AuraSpell = await ethers.getContractFactory(CONTRACT_NAMES.AuraSpell);
  auraSpell = <AuraSpell>(
    await upgrades.deployProxy(AuraSpell, [
      bank.address,
      werc20.address,
      WETH,
      waura.address,
    ])
  );
  await auraSpell.deployed();
  // await curveSpell.setSwapRouter(ADDRESS.SUSHI_ROUTER);
  await auraSpell.addStrategy(ADDRESS.BAL_UDU, utils.parseUnits("2000", 18));
  await auraSpell.addStrategy(
    ADDRESS.BAL_AURA_STABLE,
    utils.parseUnits("2000", 18)
  );
  await auraSpell.setCollateralsMaxLTVs(
    0,
    [USDC, CRV, DAI],
    [30000, 30000, 30000]
  );
  await auraSpell.setCollateralsMaxLTVs(
    1,
    [USDC, CRV, DAI],
    [30000, 30000, 30000]
  );

  // Setup Bank
  await bank.whitelistSpells([auraSpell.address], [true]);
  await bank.whitelistTokens([USDC, DAI, CRV], [true, true, true]);
  await bank.whitelistERC1155([werc20.address, waura.address], true);

  const HardVault = await ethers.getContractFactory(CONTRACT_NAMES.HardVault);
  hardVault = <HardVault>(
    await upgrades.deployProxy(HardVault, [config.address])
  );

  const SoftVault = await ethers.getContractFactory(CONTRACT_NAMES.SoftVault);
  usdcSoftVault = <SoftVault>(
    await upgrades.deployProxy(SoftVault, [
      config.address,
      CUSDC,
      "Interest Bearing USDC",
      "ibUSDC",
    ])
  );
  await usdcSoftVault.deployed();
  await bank.addBank(USDC, usdcSoftVault.address, hardVault.address, 9000);

  daiSoftVault = <SoftVault>(
    await upgrades.deployProxy(SoftVault, [
      config.address,
      CDAI,
      "Interest Bearing DAI",
      "ibDAI",
    ])
  );
  await daiSoftVault.deployed();
  await bank.addBank(DAI, daiSoftVault.address, hardVault.address, 8500);

  crvSoftVault = <SoftVault>(
    await upgrades.deployProxy(SoftVault, [
      config.address,
      CCRV,
      "Interest Bearing CRV",
      "ibCRV",
    ])
  );
  await crvSoftVault.deployed();
  await bank.addBank(CRV, crvSoftVault.address, hardVault.address, 9000);

  // Whitelist bank contract on compound
  const compound = <IComptroller>(
    await ethers.getContractAt("IComptroller", ADDRESS.BLB_COMPTROLLER, admin)
  );
  await compound._setCreditLimit(
    bank.address,
    CUSDC,
    utils.parseUnits("3000000")
  );
  await compound._setCreditLimit(
    bank.address,
    CCRV,
    utils.parseUnits("3000000")
  );
  await compound._setCreditLimit(
    bank.address,
    CDAI,
    utils.parseUnits("3000000")
  );

  await usdc.approve(usdcSoftVault.address, ethers.constants.MaxUint256);
  await usdc.transfer(alice.address, utils.parseUnits("500", 6));
  await usdcSoftVault.deposit(utils.parseUnits("5000", 6));

  await crv.approve(crvSoftVault.address, ethers.constants.MaxUint256);
  await crv.transfer(alice.address, utils.parseUnits("500", 18));
  await crvSoftVault.deposit(utils.parseUnits("5000", 18));

  await dai.approve(daiSoftVault.address, ethers.constants.MaxUint256);
  await dai.transfer(alice.address, utils.parseUnits("500", 18));
  await daiSoftVault.deposit(utils.parseUnits("5000", 18));

  console.log(
    "CRV Balance:",
    utils.formatEther(await crv.balanceOf(admin.address))
  );
  console.log(
    "USDC Balance:",
    utils.formatUnits(await usdc.balanceOf(admin.address), 6)
  );
  console.log(
    "DAI Balance:",
    utils.formatEther(await dai.balanceOf(admin.address))
  );

  return {
    werc20,
    waura,
    mockOracle,
    curveOracle,
    oracle,
    config,
    feeManager,
    bank,
    auraSpell,
    usdcSoftVault,
    crvSoftVault,
    daiSoftVault,
    hardVault,
    uniV3Lib: LibInstance,
  };
};
