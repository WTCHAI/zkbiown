/**
 * Gas Benchmark — ZTIZENCircom interaction pipeline on Sepolia
 *
 * Loads already-deployed contract addresses from a deployment JSON (produced by
 * deploy-circom.ts), then runs the registration + verification steps and records
 * gas used + gwei cost per tx.
 *
 * Usage:
 *   # 1. Deploy first (once):
 *   npx hardhat run scripts/deploy-circom.ts --network sepolia
 *
 *   # 2. Benchmark interactions (rerun freely):
 *   DEPLOYMENT=./deployments/circom-<chainId>-<ts>.json \
 *     npx hardhat run scripts/gas-benchmark-circom.ts --network sepolia
 *     npx hardhat run scripts/gas-benchmark-circom.ts --network arbitrumSepolia
 *
 *   # Skip verifyProof (needs real snarkjs proof — placeholder will revert):
 *   SKIP_PROOF=true DEPLOYMENT=... npx hardhat run ...
 *
 * Proof inputs:
 *   Replace PLACEHOLDER_PA/PB/PC/PUB_SIGNALS below with real snarkjs output
 *   from the /proof-demo page for production-accurate verifyProof gas.
 */

import { network, artifacts } from "hardhat"
import { formatEther, formatGwei, getContract, type Hex } from "viem"
import * as fs from "fs"

// ─── Demo proof values (replace with real snarkjs output) ─────────────────────
const PLACEHOLDER_PA = ["0x1fbebfe478f4ca65d3d708382cb151066cca238719ca8e68d326e0668551ee3e","0x2dc0ee99c61c05f48c34f78831f23e4e1fc4f844e7d9d17462038a8f198d3729"]
const PLACEHOLDER_PB = [["0x23759f2bd3fe69c5b4b2fa667b720c864c6ea86a540c5e505f3e52576739c08d","0x1e6b65e385aceec1a4e44788d92a4d28a610eb9f31794a2f87c3d1a47046ff1c"],["0x2e3db749ad8353f4ad3012b9ae82bdee4644c6d688dc3a6ee8b7b0ecf6d01843","0x099e04855baa190bdd71764eba151b5a7483191396af083e8861f918ad4c945c"]]
const PLACEHOLDER_PC = ["0x1c5231231b0f6e0079229e72fdc42bcb33ce932ff5cfde4620be4c953763d82f","0x1928121c120cf92ea4695a277deea822d43de6be670347e58d5692d35c640033"]
const PLACEHOLDER_PUB_SIGNALS = ["0x0000000000000000000000000000000000000000000000000000000000000080","0x0f61f770518d048dcb4cd25fd6bad535363803ce81ed22632194d092a95d3629","0x1c742bc40ff44002eb19a61849a68960b94baf8b43700633c1b9bc82a9d397ed","0x0c5d4f3a5bf3dc19c7a3217cc003edc9d115dec945a54e8fa16e98002ae2bf3f","0x17dad8beecced393c072d9c595d75d6704d36807315e41f8456c39f3b57d1cee","0x2c24e5d159fb2df62c48da6549ff9e08b05e30578f3e49d0f8577067d82e7d49","0x0d466c2fef6985f7bb72bb89d7e968d53d2fac1544f95c060a02f6223406979a","0x1754fcb789bc5c69594928777a00da60d3942df255681a422b68be728604d286","0x194643baea6bf302bff4f9c555b57d140de9ec330bdafd6a121f3928733e7c5e","0x2f861ccfed785d7d0bb845e9ad9a8f2a3474ac2d357dcb08b211efc39861db4c","0x11c3308bfebec7d4b58a494e86ea4437eeea483bc0be2707dbc8c188db6dee3d","0x2597f5044bff46ff34b1dbe0dd128b6c3b52bc009bf91276b1c67440b55ca64c","0x20a917a9245c586a0be17eb5589423f50e0ce2020b728174c7b468bb4f068980","0x1ce55bb0272e6852345adf305f6d178ee79e01d2ac6a0f4e2a8c8f695578791f","0x030d91daa3f204295d71ffdb76f47295c9b4a786b6c8fb79dfcbbb122b0c7a7a","0x2f32acb49f461a57d86f6dae238b53ef1d766a2cd09bce9c5fb88a52c76fd925","0x1233faf24cf56f039d01c287b39cba9c1577d9ece15f8c49ba56f10ad32f9103","0x0b7401c68a55d593f677085ffc940e45c72551ebc59084dbe7e6c193cdeb1b43","0x0640adaaff72f16b3a883b573e2d20257bc52efd1b9dd5ac24c6d7ae1b8a98f5","0x2e52b1a91d4ff1a0d7651cb4c4555ee3b06d084a5c4d9ac16bd09eb1fe114730","0x265afebad2249547d8933d3864926bbe407c0a336155b74506135bc9c8fa2ec7","0x1ee9429515b6bcac88af0fc9a8c4ca61a063875155d081872b71b03bb0655e86","0x04f56588a68d3dba31b0c4af589410567373bb07e17acb4cc84c5a0d7f4ba461","0x220b59f2b39faeabf4ed4d9db96119d6f03fea88e76b989afc11ab319a8cd432","0x1c170c882c19047466d0e95ee5f07b6d3f072d1438dbcf79dcedbaa6f7680b82","0x27098d00a2dea3b29a57e36a4a39450d16e06820d7f60ecc0799ca40cb1b6886","0x0c8c462a9550ee1c395ff88606cf6024f96a6eae491e330cd47973be2c31440b","0x19c8a76f92e21aa866d73442a9ea2ca9f2184f559280b75e8dc3bbc49dbc3a5b","0x11f4ad453e171995b56c01194b9f790966a90c5af92a79df742f4d20a3098117","0x2b991147c05df4a795cdcffe75176bdbe15818b5702ede4f476ba334a02b1b18","0x08cfa36a64498479cd5098fd9220d94fdc1878d7a1bbc266bcf2d31e78e9f25c","0x2cc65b510af29a82e37a750d11985cd8641459417ac4f2bb1a0d4d51c9f88982","0x271492cc90c33754466e0ed306f196a48fb20e48df29ad02b4d28bc3e399e522","0x0ffcbdd3c9d59a3bcc3d18682b1a8399404e93ba8d83ed8c616e396f9dde1563","0x0c8bd6cfa290ffdfa9103bd4c8523c9ca1e717fd262fb817b2e3094d8f816c79","0x06decdf8a3501f384abca8d0e7ed053b4ca3b030ff1f69ef2e8b77674196fd66","0x247d03ac640a02955659e980fa07f03b4fd1d33d50fd178674382f8dd01cda93","0x2971784409b7935382fb53d089f73e60f67da8c4f5cbc30476f65a7a920dd9a7","0x0e0888562515e3a4fcd6a37eb7ee8f9383b12be681e2fbf37060aa2a084e8fec","0x2618de8ce72a36049c4635a33d68250e4c168187d06ec4e930619273c701974a","0x0b0506e7b633ce287cbf8600aa79a461a161bb929a2924124835fef671992f55","0x08a9f3e140cde11b14e453da42069d85a0b54b36e3a91f3009d6d245a973b3f5","0x21cc49a16c2d9e002d9686905d78edffcf72151e0b0f31594d08c86837cbae9e","0x28f71319ac68d26bf60db51703cad517e8283c5667b735604a8a46a96fdd4853","0x18f892cf85aa689480f3cb32fd830bb1ecc177579e62c3c1932f496c8249e75f","0x10fe758874f6ad4b880bab4192c56535e187f8a7d3e1e1896c1f64c6d07ec4ae","0x238907610110edc23e7a7c945ff867f0bb5fb8f745791f4c96d82f7edb899a45","0x271439a9c2a462cd96e6067583dbb00cbcc4cac7fbe221e987d2ed454be27f3f","0x0d81a1337b297f4d6f154a06f32136c3322b18bc381aeb7b72a96998c65f67a0","0x2597c12e2939b943c9a37ff9e2e27c29985c44e51afbdb5a10c1f1794fc90b8b","0x25c8a08a63022df62f1cfde0c0940971bb0400d7f35a8f71dfd4003b3109d434","0x00b3277e0d9ead68ec89954da193f875fc207fa2a3948add155d15f5d55d7a62","0x237755c34b7ce4d4ffce96f869f8e0d73e6b38b02703c216ec8e9ba73d6df3e6","0x0acf0d5f6685e0260b2f0a0090c72c2ba32da0b419b6b1902cbd09ed6f004a75","0x03ca83a3c163e3071541fddf76d1575e1a9da87d4af4594109879dabf4c5af10","0x2edf0d2ceaa1a6091dd41f1f97a76cb960421bf489fc654cac7d96e8f569890c","0x08c6bb8f951b4909729f3d89d429d15de1f46ec3898db34d6519eb9ba8362a0e","0x03562a52876037591868f3d4864590556907b0ca553cd488a13ba3deb4a16426","0x14e92efe9dc53c7068b7b0ef7c47cdeca569b9994cfc9ed243490a15d475902a","0x0e4faf52ce4d890458902032c1760f07a2fc7f5c9e34bc70f8c7562467bc835c","0x0655f51f65ff8a018129cc5a4866792f1fb992f4a894e81dbdc95769b9f19b49","0x1605ed69d2b74b9496239e900e5fae782db5c09f0538fbc82b1eb777f86abf6f","0x1af0cb06b67b42c3d127beada804b9f15411a0dbe180a68aec07cc20b41d7894","0x2c52a09f570b2ea2b55a4be265a5e83e540bf8bfcb97b4798933e312f159659d","0x2f1e42d8ed314c985c80d93b40737122c4a420b4d5faab242770f2adbe670a5f","0x02f1f063eeaaaadac46be22b9d9f6389ff2e995f061120bdd52269c2a31951c0","0x1ea78e07749670b06e56a9d229b21674f842e962357f83bf1a26335d50e29d2d","0x147e7d9824b75534ee096745eade0fab59124b880c0c5bff179128e60d01a20b","0x0cbf7e2d15b255b1f2b5293fb24a146a83c27dbda08da1505c9d0a80142b43ef","0x0e47735f387c1a55895e261331fdfc66fb008ff74390c201f76140297b396c0f","0x1407626268eeb0cddd2c5cb77f2a2777ec50e74a2688bc6ddc36f68dcb2bbc00","0x26b16b183771a964ba9f8424dcde06832c7964b8db8b264b44a07f8502391857","0x1fef6707aa0d02db7c8379189219c3ed0ba88107bf2d4eb3d5651a1693278966","0x242e2139e8c60ebee2ca9c9f74c915a55739a0509bc18da1229a07396ffca98c","0x006493ff9286bb3888d8e7c8540ec95c6f605173b56dd95d8dc1b48c34e50283","0x1d589b8ffe59bd495de1a7a1248608986990ed949d17cb60d75c08ca99812f21","0x2ff9c20d592315ba6dc7ddd50a53a323fcca093d5e7aded10d21f60f91a9d495","0x1e06ae62c19cbe6bbb1f131b30e7c114a0f9e0f4559e5563fcf9de47f6eccfae","0x0f2687e478c3dea9be828c90c368abd7096967493391113e62a2d06b200ba12e","0x049d1bd069b37ddb4bf6e4a8fad472ae14836e41cf55f52ba8cf6827787c2af9","0x0e713f49bc6b6f5552496772cf6e8bec593f14c5773500b6b997095210179dcc","0x242a3fc343654a599dc223305a344c0cd85c4c8b09ebfdd97d4c533c7ae436ec","0x261dddd5133c3c33ed4bcac4663cce6e943dd13f3d0e877888ae19b6ff59881f","0x1c9235bad8a10956afe6d4a8f90522da3e696a7e790bbc902d94bcb3bde6a660","0x0274d50da3cd0d29b81fcbd61711d532626ef1fe8a4ef53ccdba4fda2abd9017","0x2a4fb7b51926021e9f2e7a4e25b6ef2e9d1ffcc573557af20e511014d22a50c3","0x1ea63ba28f985551477c840867cd6fa7582b8b82adadf55d68834dcf1050a792","0x0ec8a1995835d198a32d5d96fe4b6e96ea8b0587db63878ac599e00d554ab98d","0x02d007a2923a120a7180ee5d597982167772f592915f38395437ec3049581f28","0x24e76839ed597d976b8bec6de46015bcc2bbebb0c79d0ef33165a4c4fa2b99d8","0x11d5e095f70b821837bc6890162cbf1ffbd39467cbd53d8668c4e0456ae7abcb","0x18c3b83d360c60c24a09fb64d08daa1c87e552c097feef074f5497220a58637f","0x21ccc997b862d8e3722997e5ae1209809c2439680934672a0084ffe9c7f15449","0x225d373677800d908680d18cdeaa1edfd8aa917303d99fd5c2405374caaefdf8","0x168b89fd899b6efcce3b8ccff31d7ec7cf1c4c82da50903cf3277d4545048828","0x11aa1d124626a7b141cb571bef0755aee0e24adfc4867154831a5a14f1b5402a","0x08c234c6564210ae83d9190dd9dd291203cd1f99d8ee11455810dc31a28819c3","0x08fe5d37a9a61c8356008f3249a209f767ea88627287744684830c48e634b154","0x269819cf7c25335fe999c03deba55a5cecdad88d290ccf8adb37cf24c69a0208","0x1a6c76b492171eba4337b4d1d07d635154265f16aa48d944c5dd2ba1f18783eb","0x0836be93586b4bc035e53d669e42889cc1022fae7bbc57c4da0232368804c713","0x032526e90e8865744447213a43cddd624163e4d8d53d80c398c3e91bab1de7d3","0x033dbfd201bc78720671c582bedee4152b293691ed0de3d488f2fe4e79579189","0x0c3d889db274fb86eb3aa08ebdb3b9266a8b40d8582bb0326897e20bc425dc78","0x15bc0d6bb237e482b7f3c2d87f45682e4bfd13270920bd21db7260e953364a6c","0x12a2e18e89b28730d8b5ed24e97d0071e085e6bb75cb344fc46f703f559408a6","0x26952fe1f5cc6151d5f354cf6bad6a35f582f6a5cca45e4da4396d5ce1c60a34","0x253b690596041fec0f86ad4a8ce41add9d98283c302493bf27d934655b991fd3","0x0e5bb4b634fae31b303f1c8a101a9794a535bbdd65e407d9ad02835349273802","0x2aeb524e4a22982595ad5de5d7fcf6b58782cb77ee16b93d1b45e42851ecd3e8","0x05da067332da67761a0ffb7fa95a5b76a80f3d7faab9f10e50fd8eae22e8fa78","0x03ae29d652943509754ad1df0faf89e786541a5c87f1b027c1a6c1114815a4a9","0x2af950057db2ff455a88d0f899f0df9c481f603d52b1f6821398bc93e687ae21","0x01d34f0daa3da51feed695c76268e272a321e554c45d7865beb521defc8ed515","0x25f45fba3465626e7dfb641cd95752af4c84a51a07088854313520d0622a14ce","0x024031b8087682453b06652c77174a6d4f2d183d34107f15363aa0d1eadeae30","0x27214fa902eb2782728b07ed765bfece3012a06ef3508cd46d5dab917b559a31","0x12423494f64b7602bf2688ef3c552d27ddc9e172ce52853b33d1d7d21ea143ce","0x23a17553e37b47a4e493f0390d9924d7e19ce3d2165c1c7c15e06c2354a3fcad","0x109c171dacda40ab92d8f2d9ef934d4602ee35ccbfc46262b55424a9471663a1","0x022350bffa00db1d938c59399b811b47aff50e188157892ba014e363dc783109","0x09b956b6e58e71bf69c5f6373c5e312b34c2743b8ee3e61d80fea0e38fd3bc69","0x006f800c0f9b5ff640eb9f178d7729636bbdcfde9a5baca20e37a8fb895aaa8d","0x114e5c6522053eb89aab04a2ddaa7dca622faf1480c119b82782f5acfcdf366f","0x0986efcb6dc0aa4be2c639c8a649614b8d1b3b62ae3d47fe223cbb2457eecf4f","0x2fdf3f1235ff938091f5f8deec7534c248767650a34818751c2abe7f8343eb64","0x23296991525a65c6cb21de069642b1a44c114b7282cfc640a44e008ba6b3d89d","0x24d42742d3a8646f6deabc97f52fe0720f1c659c0e1d84d3d8b8f0cb3067b733","0x0d576f97e36cbfc3780cf818773b3ff3c69b1fb9d893e45a21366992fd4f72f4"]

// ─── Demo IDs (must be bytes32) ────────────────────────────────────────────────
const CREDENTIAL_ID = '0x63726564656e7469616c00000000000000000000000000000000000000000000' as Hex
const SERVICE_ID    = '0x7365727669636500000000000000000000000000000000000000000000000000' as Hex
const PRODUCT_TX_ID = '0x70726f6475637454780000000000000000000000000000000000000000000000' as Hex
const INITIAL_NONCE = 1n

// ─── Gas row tracking ──────────────────────────────────────────────────────────

interface GasRow {
  step:         string
  gasUsed:      bigint
  gasPriceGwei: bigint
  costEth:      bigint   // in wei
  txHash:       Hex
}

const rows: GasRow[] = []

async function recordTx(
  step: string,
  txHash: Hex,
  publicClient: Awaited<ReturnType<typeof import("viem").createPublicClient>>
): Promise<bigint> {
  const receipt  = await publicClient.waitForTransactionReceipt({ hash: txHash })
  const gasUsed  = receipt.gasUsed
  const gasPrice = (receipt as any).effectiveGasPrice ?? 0n
  const costWei  = gasUsed * gasPrice

  rows.push({
    step,
    gasUsed,
    gasPriceGwei: gasPrice / 1_000_000_000n,
    costEth:      costWei,
    txHash,
  })

  console.log(`  ✓ ${step}`)
  console.log(`    gas: ${gasUsed.toLocaleString()}  price: ${formatGwei(gasPrice)} gwei  cost: ${formatEther(costWei)} ETH`)
  return gasUsed
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const skipProof    = process.env.SKIP_PROOF === 'true'
  const deploymentPath = process.env.DEPLOYMENT

  if (!deploymentPath) {
    console.error('❌ DEPLOYMENT env var required.')
    console.error('   Run deploy-circom.ts first, then:')
    console.error('   DEPLOYMENT=./deployments/circom-<chainId>-<ts>.json npx hardhat run ...')
    process.exit(1)
  }

  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ Deployment file not found: ${deploymentPath}`)
    process.exit(1)
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
  const { CircomVerifier: verifierAddress, ZTIZENCircom: mainAddress } = deployment.contracts

  console.log('═══════════════════════════════════════════════════════════')
  console.log(' ZTIZENCircom Gas Benchmark  (interaction steps only)')
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`CircomVerifier : ${verifierAddress}`)
  console.log(`ZTIZENCircom   : ${mainAddress}\n`)

  const conn = await network.connect()
  const { viem } = conn
  const [deployer] = await viem.getWalletClients()
  const publicClient = await viem.getPublicClient()

  const chainId = await publicClient.getChainId()
  const balance = await publicClient.getBalance({ address: deployer.account.address })
  console.log(`Network chain ID : ${chainId}`)
  console.log(`Deployer         : ${deployer.account.address}`)
  console.log(`Balance          : ${formatEther(balance)} ETH\n`)

  const ztizenCircomArtifact = await artifacts.readArtifact('ZTIZENCircom')

  const ztizen = getContract({
    address: mainAddress as Hex,
    abi:     ztizenCircomArtifact.abi,
    client:  { public: publicClient, wallet: deployer },
  })

  // ── Step 1: addWhitelistedUser ──────────────────────────────────────────────
  console.log('Step 1 — addWhitelistedUser')
  const whitelistHash = await ztizen.write.addWhitelistedUser([deployer.account.address])
  await recordTx('addWhitelistedUser', whitelistHash, publicClient as any)
  console.log()

  // ── Step 2: registerCredential ──────────────────────────────────────────────
  console.log('Step 2 — registerCredential')
  const registerHash = await ztizen.write.registerCredential([
    CREDENTIAL_ID,
    deployer.account.address,
    1n,  // version
  ])
  await recordTx('registerCredential', registerHash, publicClient as any)
  console.log()

  // ── Step 3: initializeCredentialForService ──────────────────────────────────
  console.log('Step 3 — initializeCredentialForService')
  const initHash = await ztizen.write.initializeCredentialForService([
    CREDENTIAL_ID,
    SERVICE_ID,
    INITIAL_NONCE,
  ])
  await recordTx('initializeCredentialForService', initHash, publicClient as any)
  console.log()

  // ── Step 4: setZKVerificationEnabled ────────────────────────────────────────
  console.log('Step 4 — setZKVerificationEnabled')
  const enableHash = await ztizen.write.setZKVerificationEnabled([true])
  await recordTx('setZKVerificationEnabled', enableHash, publicClient as any)
  console.log()

  // ── Step 5: verifyProof ──────────────────────────────────────────────────────
  if (skipProof) {
    console.log('Step 5 — verifyProof  (SKIPPED — set SKIP_PROOF=false to include)\n')
  } else {
    console.log('Step 5 — verifyProof')
    console.log('  ⚠  Using placeholder proof — replace pA/pB/pC/pubSignals with real snarkjs output')

    const pubSignals129 = PLACEHOLDER_PUB_SIGNALS.slice(0, 129) as unknown as readonly [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
    ]

    try {
      const verifyHash = await ztizen.write.verifyProof([
        CREDENTIAL_ID,
        SERVICE_ID,
        INITIAL_NONCE,
        PRODUCT_TX_ID,
        PLACEHOLDER_PA as unknown as readonly [bigint, bigint],
        PLACEHOLDER_PB as unknown as readonly [readonly [bigint, bigint], readonly [bigint, bigint]],
        PLACEHOLDER_PC as unknown as readonly [bigint, bigint],
        pubSignals129,
      ])
      await recordTx('verifyProof', verifyHash, publicClient as any)
    } catch (e: any) {
      console.log(`  ✗ verifyProof reverted (expected with placeholder proof): ${e.shortMessage ?? e.message}`)
      console.log('  → Paste real pA/pB/pC/pubSignals from /proof-demo to get accurate gas\n')
    }
    console.log()
  }

  // ── Summary table ────────────────────────────────────────────────────────────
  printSummary(rows)

  // Save results
  const out = {
    network:      chainId,
    deployer:     deployer.account.address,
    deployment:   deploymentPath,
    contracts:    { CircomVerifier: verifierAddress, ZTIZENCircom: mainAddress },
    timestamp:    new Date().toISOString(),
    rows: rows.map(r => ({
      step:         r.step,
      gasUsed:      r.gasUsed.toString(),
      gasPriceGwei: r.gasPriceGwei.toString(),
      costEth:      formatEther(r.costEth),
      txHash:       r.txHash,
    })),
    totalGas:     rows.reduce((s, r) => s + r.gasUsed, 0n).toString(),
    totalCostEth: formatEther(rows.reduce((s, r) => s + r.costEth, 0n)),
  }

  const outPath = `./deployments/gas-benchmark-circom-${Date.now()}.json`
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`💾 Results saved to ${outPath}`)
}

function printSummary(rows: GasRow[]) {
  const col1 = Math.max(34, ...rows.map(r => r.step.length)) + 2
  const line  = '─'.repeat(col1 + 16 + 14 + 20)

  console.log('\n' + '═'.repeat(line.length))
  console.log(' Gas Cost Summary — ZTIZENCircom interaction steps')
  console.log('═'.repeat(line.length))
  console.log(
    'Step'.padEnd(col1) +
    'Gas Used'.padStart(14) +
    'Gas Price'.padStart(12) +
    'Cost (ETH)'.padStart(18)
  )
  console.log(line)

  for (const r of rows) {
    console.log(
      r.step.padEnd(col1) +
      r.gasUsed.toLocaleString().padStart(14) +
      `${r.gasPriceGwei} gwei`.padStart(12) +
      formatEther(r.costEth).padStart(18)
    )
  }

  console.log(line)
  const totalGas  = rows.reduce((s, r) => s + r.gasUsed, 0n)
  const totalCost = rows.reduce((s, r) => s + r.costEth, 0n)
  console.log(
    'TOTAL'.padEnd(col1) +
    totalGas.toLocaleString().padStart(14) +
    ''.padStart(12) +
    formatEther(totalCost).padStart(18)
  )
  console.log('═'.repeat(line.length) + '\n')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Benchmark failed:', err)
    process.exit(1)
  })
