// TODO: SignMessage
import { verify } from '@noble/ed25519';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { FC, useCallback, useState } from 'react';
import { notify } from "../utils/notifications";
import { Program, AnchorProvider, web3, BN, setProvider, utils } from '@coral-xyz/anchor';
import idl from './crowdfunding.json';
import { Crowdfunding } from './crowdfunding';
import { PublicKey } from '@solana/web3.js';
import { createHmac } from 'crypto';

const idl_string = JSON.stringify(idl);
const idl_object = JSON.parse(idl_string);
const programID = new PublicKey(idl.address);

export const CrowdFundingFC: FC = () => {
    // const { publicKey, signMessage } = useWallet();
    const ourWallet = useWallet();
    const { connection } = useConnection();
    const [campaigns, setCampaigns] = useState([]);
    const getProvider = () => {
        const provider = new AnchorProvider(connection, ourWallet, AnchorProvider.defaultOptions());
        setProvider(provider);
        return provider;
    }

    const getUrlSeed = (url: string): string => {
        let url_seed = createHmac('sha256', url)
            .update('I love cupcakes')
            .digest('hex');
        // take last 8 symbols of url_seed
        url_seed = url_seed.slice(-8);
        return url_seed;
    }

    const getCampaignAccount = (program: Program<Crowdfunding>, authorityPubkey: PublicKey, url_seed: string): PublicKey => {
        const [campaignAccount] = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode(url_seed),
                utils.bytes.utf8.encode('CF_SEED'),
                authorityPubkey.toBuffer(),
            ],
            program.programId
        );
        return campaignAccount;
    }

    // const initCampaign = async (goal, deadline, url) => {
    const initCampaign = async () => {
        let [goal, deadline, url] = [1, Date.now() / 1000 + 60, "http://my-campaign.com"]

        try {
            const provider = getProvider();
            const program = new Program<Crowdfunding>(idl_object, provider);
            const url_seed = getUrlSeed(`${url}?campaignTime=${deadline}`).toString();

            const campaignAccount: PublicKey = getCampaignAccount(program, provider.publicKey, url_seed);

            const tx = await program.methods.initialize(
                new BN(goal),
                new BN(deadline),
                url,
                url_seed
            )
                .accounts(
                    {
                        authority: provider.publicKey,
                    }
                )
                .rpc({ commitment: "confirmed", skipPreflight: true });

            notify({ type: 'success', message: 'Campaign create successful!', txid: tx });
            console.log(`New campaign created: { goal: ${goal}, deadline: ${deadline}, url: ${url}}`);
        } catch (error: any) {
            notify({ type: 'error', message: `Campaign creation failed!`, description: error?.message });
            console.log('error', `Campaign creation failed! ${error?.message}`);
        }
    }

    const getCampaigns = async () => {
        try {
            const provider = getProvider();
            const program = new Program<Crowdfunding>(idl_object, provider);
            const decoder = new TextDecoder();

            let campaigns = await Promise.all((await connection.getParsedProgramAccounts(programID)).map(async campaign => ({
                ...(await program.account.campaign.fetch(campaign.pubkey)),
                pubkey: campaign.pubkey,
            })));

            campaigns = campaigns.map(campaign => ({
                ...campaign,
                urlString: decoder.decode(new Uint8Array(campaign.url)),
            }));
            console.log(campaigns);
            setCampaigns(campaigns);

            console.log('Campaign list success');
        } catch (error: any) {
            notify({ type: 'error', message: `Campaign list failed!`, description: error?.message });
            console.log('error', `Campaign list failed! ${error?.message}`);
        }
    }

    const contributeCampaign = async (publicKey) => {
        const op = "Contribute to campaign:";
        try {
            const provider = getProvider();
            const program = new Program<Crowdfunding>(idl_object, provider);
            const campaignAccount = publicKey;

            const tx = await program.methods.contribute(new BN(0.1 * web3.LAMPORTS_PER_SOL)).accounts({
                campaign: campaignAccount,
                contributor: provider.publicKey,
            }).rpc({ commitment: "confirmed", skipPreflight: true });

            notify({ type: 'success', message: `${op} successful`, txid: tx });
            console.log(`${op} tx = ${tx}`);
        } catch (error: any) {

            notify({ type: 'error', message: `${op} failed`, description: error?.message });
            console.log('error', `${op} failed! ${error?.message}`);
        }
    }

    const withdrawCampaign = async (publicKey) => {
        const op = "Withdraw from campaign:";

        try {
            const provider = getProvider();
            const program = new Program<Crowdfunding>(idl_object, provider);

            const campaignAccount = publicKey;

            const tx = await program.methods.withdraw().accounts({
                campaign: campaignAccount,
                //@ts-ignore
                authority: provider.publicKey,
            }).rpc({ commitment: "confirmed", skipPreflight: true });

            notify({ type: 'success', message: `${op} successful`, txid: tx });
            console.log(`${op} tx = ${tx}`);
        } catch (error: any) {

            notify({ type: 'error', message: `${op} failed`, description: error?.message });
            console.log('error', `${op} failed! ${error?.message}`);
        }
    }

    return (
        <div>
            {
                campaigns.map((campaign, index) => {
                    let campaign_deadline = (new Date(campaign.deadline.toNumber() * 1000)).toString();
                    let isActive = new Date() < new Date(campaign.deadline.toNumber() * 1000);
                    return (
                        <div key={index} className='md:heroContent flex flex-col'>
                            <h1>{campaign.urlString.toString()}</h1>
                            <span>{campaign.pubkey.toString()}</span>
                            <span>raised amount: {campaign.raisedAmount.toString()}</span>
                            <span>goal: {campaign.goal.toString()}</span>
                            <span>deadline: {campaign_deadline}</span>
                            <span>isActive: {isActive.toString()}</span>
                            <button
                                className="group w-60 m-2 btn animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:from-white hover:to-purple-300 text-black"
                                onClick={() => contributeCampaign(campaign.pubkey)}
                            >
                                <span>Contribute 0.1 sol</span>
                            </button>
                            <button
                                className="group w-60 m-2 btn animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:from-white hover:to-purple-300 text-black"
                                onClick={() => withdrawCampaign(campaign.pubkey)}
                            >
                                <span>Withdraw campaign funds</span>
                            </button>
                        </div>
                    )
                })
            }
            <div className="flex flex-row justify-center">
                <div className="relative group items-center">
                    <div className="m-1 absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 
                rounded-lg blur opacity-20 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <button
                        className="group w-60 m-2 btn animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:from-white hover:to-purple-300 text-black"
                        // onClick={onClick} disabled={!publicKey}
                        onClick={initCampaign}
                    >
                        <div className="hidden group-disabled:block">
                            Wallet not connected
                        </div>
                        <span className="block group-disabled:hidden" >
                            Create Campaign
                        </span>
                    </button>

                    <button
                        className="group w-60 m-2 btn animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:from-white hover:to-purple-300 text-black"
                        // onClick={onClick} disabled={!publicKey}
                        onClick={getCampaigns}
                    >
                        <div className="hidden group-disabled:block">
                            Wallet not connected
                        </div>
                        <span className="block group-disabled:hidden" >
                            List Campaigns
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};
