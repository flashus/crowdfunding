import * as anchor from "@coral-xyz/anchor";
import { Program, utils } from "@coral-xyz/anchor";
import { Crowdfunding } from "../target/types/crowdfunding";
import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { createHmac } from 'node:crypto';
import { assert } from "chai";

const INIT_AIRDROP_AMNT = 1000000000;

describe("crowdfunding", () => {
  // Configure the client to use the local cluster.
  // anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  const program = anchor.workspace.Crowdfunding as Program<Crowdfunding>;

  const authority = anchor.web3.Keypair.generate();
  const rent_balance = 3118080;//  await provider.connection.getMinimumBalanceForRentExemption(0);

  let campaignAccount: PublicKey;
  let initialAuthorityBalance: number;

  beforeEach(async () => {

    await airdrop(provider.connection, authority.publicKey);
    initialAuthorityBalance = await provider.connection.getBalance(authority.publicKey);
    console.log("Initial balance: " + initialAuthorityBalance);
  });

  it("Is initialized!", async () => {
    const goal: number = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 86400); // 1 day from now
    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    console.log("url_seed: " + url_seed);

    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const tx = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);

    console.log("Your transaction signature", tx);

    const campaignAccData = await program.account.campaign.fetch(campaignAccount);
    assert.notEqual(tx, null);
    assert.notEqual(campaignAccount, null);
    assert.equal(campaignAccData.authority.toString(), authority.publicKey.toString());
    assert.ok(campaignAccData.goal.eq(new anchor.BN(goal)));
    assert.ok(campaignAccData.deadline.eq(new anchor.BN(deadline)));
    const utf8ByteArray_url = stringToUtf8ByteArray(url);
    const paddedByteArray_url = padByteArrayWithZeroes(utf8ByteArray_url, 256);

    assert.strictEqual(campaignAccData.url.toString(), paddedByteArray_url.toString());
  });

  it("Contribute to campaign", async () => {
    const amount = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 86400); // 1 day from now
    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const tx0 = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);
    const balance_init = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_init, rent_balance);

    const tx = await contributeToCampaign(provider, program, campaignAccount, amount);
    console.log("Your transaction signature", tx);

    const campaignAccData = await program.account.campaign.fetch(campaignAccount);
    assert.notEqual(tx, null);
    assert.equal(campaignAccData.authority.toString(), authority.publicKey.toString());
    assert.ok(campaignAccData.goal.eq(new anchor.BN(goal)));
    assert.ok(campaignAccData.deadline.eq(new anchor.BN(deadline)));

    //check if amount is added by checking campaign wallet balance
    const balance = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance, amount + rent_balance);
  });

  it("Withdraw funds", async () => {
    const amount = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 5); // ends now
    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const balance_authority0 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority0, initialAuthorityBalance);

    const tx_init = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);
    const balance_init = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_init, rent_balance);

    const tx_contrib = await contributeToCampaign(provider, program, campaignAccount, amount);

    const balance = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance, amount + rent_balance);
    const balance_authority1 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority1, initialAuthorityBalance - rent_balance);

    //wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    const tx_withdraw = await withdrawFunds(provider, program, campaignAccount, authority);
    console.log("Your transaction signature", tx_withdraw);

    const balance_withdraw = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_withdraw, rent_balance * 2);

    const balance_authority2 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority2, initialAuthorityBalance - (rent_balance * 2) + amount);

  });

  // unhappy path
  it("Error: Withdraw funds non-funded campaign", async () => {
    const amount = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 5); // now + 5 seconds

    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const balance_authority0 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority0, initialAuthorityBalance);

    const tx_init = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);
    const balance_init = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_init, rent_balance);

    const tx_contrib = await contributeToCampaign(provider, program, campaignAccount, amount);

    //wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    const balance = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance, amount + rent_balance);
    const balance_authority1 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority1, initialAuthorityBalance - rent_balance);


    let thisShouldFail = "This should fail"
    try {
      const tx_withdraw = await withdrawFunds(provider, program, campaignAccount, authority);
    } catch (error) {
      thisShouldFail = "Failed"
      assert.isTrue(error.message.includes("The goal has not been reached."))
    }
    assert.strictEqual(thisShouldFail, "Failed")
  });

  it("Error: long URL init error", async () => {
    const amount = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 86400); // 1 day from now
    const url = "https://example.com/campaign?" + deadline + "a".repeat(256);

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    let thisShouldFail = "This should fail"
    try {
      const tx_init = await program.methods.initialize(
        new anchor.BN(goal),
        new anchor.BN(deadline),
        url,
        url_seed.toString()
      )
        .accounts(
          {
            // campaign: campaignAccount,
            authority: authority.publicKey,
          }
        )
        .signers([authority])
        .rpc({ commitment: "confirmed", skipPreflight: true })
    } catch (error) {
      thisShouldFail = "Failed"
      assert.isTrue(error.message.includes("URL too long."))
    }
    assert.strictEqual(thisShouldFail, "Failed")
  });

  it("Error: Withdraw funds before campaign ends", async () => {
    const amount = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 86400); // 1 day from now
    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const balance_authority0 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority0, initialAuthorityBalance);

    const tx_init = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);
    const balance_init = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_init, rent_balance);

    const tx_contrib = await contributeToCampaign(provider, program, campaignAccount, amount);

    const balance = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance, amount + rent_balance);
    const balance_authority1 = await provider.connection.getBalance(authority.publicKey);
    assert.equal(balance_authority1, initialAuthorityBalance - rent_balance);

    let thisShouldFail = "This should fail"
    try {
      const tx_withdraw = await withdrawFunds(provider, program, campaignAccount, authority);
    } catch (error) {
      thisShouldFail = "Failed"
      assert.isTrue(error.message.includes("The campaign is still active."))
    }
    assert.strictEqual(thisShouldFail, "Failed")

  });

  it("Error: Contribute funds to closed campaign", async () => {
    const amount = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
    const goal: number = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    const deadline: number = (Date.now() / 1000 + 5); // now + 5 seconds

    const url = "https://example.com/campaign?" + deadline;

    let url_seed = getUrlSeed(url);
    campaignAccount = getCampaignAccount(program, authority, url_seed);
    console.log("Campaign account: " + campaignAccount.toString());

    const tx_init = await initializeCampaign(provider, program, campaignAccount, authority, goal, deadline, url, url_seed);
    const balance_init = await provider.connection.getBalance(campaignAccount);
    assert.equal(balance_init, rent_balance);
    //wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    let thisShouldFail = "This should fail"
    try {
      const tx_contrib = await contributeToCampaign(provider, program, campaignAccount, amount);
    } catch (error) {
      thisShouldFail = "Failed"
      assert.isTrue(error.message.includes("The campaign has ended."))
    }
    assert.strictEqual(thisShouldFail, "Failed")
  });


});


function getUrlSeed(url: string) {
  let url_seed = createHmac('sha256', url)
    .update('I love cupcakes')
    .digest('hex');
  // take last 8 symbols of url_seed
  url_seed = url_seed.slice(-8);
  return url_seed;
}

function getCampaignAccount(program: anchor.Program<Crowdfunding>, authority: anchor.web3.Keypair, url_seed: string): PublicKey {

  const [campaignAccount] = PublicKey.findProgramAddressSync(
    [
      utils.bytes.utf8.encode(url_seed),
      utils.bytes.utf8.encode('CF_SEED'),
      authority.publicKey!.toBuffer(),
    ],
    program.programId
  );
  return campaignAccount;
}

async function initializeCampaign(provider: anchor.AnchorProvider, program: Program<Crowdfunding>, campaignAccount: PublicKey, authority: anchor.web3.Keypair, goal: number, deadline: number, url: string, url_seed: string) {

  console.log("Initializing campaign with the following parameters:");
  console.log("Goal:", goal);
  console.log("Deadline:", deadline);
  console.log("URL:", url);

  /*
  // serialization errors traced below  (uncomment for trace)

  const instruction = await program.methods.initialize(
    new anchor.BN(goal),
    new anchor.BN(deadline),
    url,
    url_seed.toString()
  )
    .accounts({
      campaign: campaignAccount,
      authority: authority.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([authority])
    .instruction();


  console.log("Serialized instruction:", instruction);

  let coder = new BorshInstructionCoder(CrowdfundingIDL);
  let args = coder.decode(instruction.data, "base58");
  console.log(args);
*/

  try {
    const tx = await program.methods.initialize(
      new anchor.BN(goal),
      new anchor.BN(deadline),
      url,
      url_seed.toString()
    )
      .accounts(
        {
          authority: authority.publicKey,
        }
      )
      .signers([authority])
      .rpc({ commitment: "confirmed", skipPreflight: true })

    console.log('Campaign initialized:', campaignAccount.toString());
    console.log('Transaction signature:', tx);
    return tx;

  } catch (error) {
    console.error("Failed to initialize campaign:", error);
  }
}

async function contributeToCampaign(
  provider: anchor.AnchorProvider,
  program: anchor.Program<Crowdfunding>,
  campaignPublicKey: PublicKey,
  amount: number): Promise<string> {

  const contributor = anchor.web3.Keypair.generate();

  await airdrop(provider.connection, contributor.publicKey);

  /*
  // serialization trace (uncomment to check)
  const tx0 = await program.methods.contribute(
    new anchor.BN(amount),
  )
    .accounts({
      campaign: campaignPublicKey,
      contributor: contributor.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([contributor])
    .instruction();

  console.log("Serialized instruction:", tx0);
  */

  const tx = await program.methods.contribute(
    new anchor.BN(amount),
  )
    .accounts({
      campaign: campaignPublicKey,
      contributor: contributor.publicKey,
    })
    .signers([contributor])
    .rpc({ commitment: "confirmed", skipPreflight: true });


  console.log('Contributed to campaign: ', campaignPublicKey.toString(), 'with amount: ', amount, 'lamports', 'transaction: ', tx);
  return tx;
}

async function withdrawFunds(provider: anchor.AnchorProvider, program: Program<Crowdfunding>, campaignPublicKey: PublicKey, authority) {

  const tx = await program.methods.withdraw()
    .accounts({
      campaign: campaignPublicKey,
      //@ts-ignore
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed", skipPreflight: true });

  console.log('Funds withdrawn from campaign:', campaignPublicKey.toString());
}

async function airdrop(connection: anchor.web3.Connection, address: any, amount = INIT_AIRDROP_AMNT) {
  await connection.confirmTransaction(await connection.requestAirdrop(address, amount), "confirmed");
}

function stringToUtf8ByteArray(inputString: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(inputString);
}

// Function to pad a byte array with zeroes to a specified length
function padByteArrayWithZeroes(byteArray: Uint8Array, length: number): Uint8Array {
  if (byteArray.length >= length) {
    return byteArray;
  }

  const paddedArray = new Uint8Array(length);
  paddedArray.set(byteArray, 0);
  return paddedArray;
}
