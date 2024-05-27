use anchor_lang::prelude::*;

pub const CF_SEED: &str = "CF_SEED";
pub const URL_LENGTH: usize = 256;

declare_id!("6HpyohHGRewtg4A3GFnbsBRYXTXVLvSZWtJFKmkZx4QZ");

#[program]
pub mod crowdfunding {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        goal: u64,
        deadline: i64,
        url: String,
        url_seed: String,
    ) -> Result<()> {
        msg!("Received goal: {}", goal);
        msg!("Received deadline: {}", deadline);
        msg!("Received url: {}", url);
        msg!("Received url_seed: {}", url_seed);

        msg!("std::mem::size_of::<Campaign>() = {}", std::mem::size_of::<Campaign>());
        msg!("Campaign::LEN = {}", Campaign::LEN);

        let campaign = &mut ctx.accounts.campaign;

        require!(
            url.as_bytes().len() <= URL_LENGTH,
            CFError::URLTooLong
        );
        require!(goal > 0, CFError::GoalTooLow);
        require!(deadline > Clock::get()?.unix_timestamp, CFError::DeadlineTooLow);


        campaign.authority = *ctx.accounts.authority.key;
        campaign.goal = goal;
        campaign.deadline = deadline;

        campaign.raised_amount = 0;
        // campaign.url = url;
        let mut url_data = [0u8; URL_LENGTH];
        url_data[..url.as_bytes().len()].copy_from_slice(url.as_bytes());
        campaign.url = url_data;

        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let campaign = &ctx.accounts.campaign;

        msg!("Campaign deadline: {}", campaign.deadline);
        msg!("Current timestamp: {}", Clock::get()?.unix_timestamp);

        require!(campaign.deadline > Clock::get()?.unix_timestamp, CFError::CampaignEnded);


        let instruction = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.contributor.key(),
            &ctx.accounts.campaign.key(),
            amount
        );
        anchor_lang::solana_program::program::invoke(
            &instruction,
            &[
                ctx.accounts.contributor.to_account_info(),
                ctx.accounts.campaign.to_account_info(),
            ]
        )?;

        let campaign = &mut ctx.accounts.campaign;
        campaign.raised_amount += amount;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let authority = &mut ctx.accounts.authority;

        msg!("Campaign deadline: {}", campaign.deadline);
        msg!("Current timestamp: {}", Clock::get()?.unix_timestamp);
        
        require!(campaign.authority == *authority.key, CFError::WrongUser);
        require!(campaign.deadline < Clock::get()?.unix_timestamp, CFError::CampaignStillActive);
        require!(campaign.raised_amount >= campaign.goal, CFError::GoalNotReached);

        let rent_balance = Rent::get()?.minimum_balance(campaign.to_account_info().data_len());
        msg!("campaign.raised_amount = {}, rent_balance = {}", campaign.raised_amount, rent_balance);
        let amount = campaign.raised_amount.checked_sub(rent_balance).unwrap();

        **campaign.to_account_info().try_borrow_mut_lamports()? -= amount;
        **authority.to_account_info().try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}



#[derive(Accounts)]
#[instruction(goal: u64, deadline: i64, url: String, url_seed: String)]
pub struct Initialize<'info> {
    #[account(init, 
        payer = authority, 
        // space = 8 + std::mem::size_of::<Campaign>(), 
        // space = 8 + Campaign::LEN, 
        space = 8 + Campaign::size(),
        seeds = [
            // url.as_bytes(),
            url_seed.as_bytes(),
            CF_SEED.as_bytes(),
            authority.key().as_ref()
        ], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Campaign {
    pub authority: Pubkey,
    pub url: [u8; URL_LENGTH],
    // pub url: String,
    pub goal: u64,
    pub deadline: i64,
    pub raised_amount: u64,
}
impl Campaign {
    const LEN: usize = 32 + 8 + 8 + 8 + URL_LENGTH;
    pub fn size() -> usize {
        std::mem::size_of::<Self>()
    }
}

#[error_code]
pub enum CFError {

    #[msg("Wrong user.")]
    WrongUser,
    #[msg("The goal is too low.")]
    GoalTooLow,
    #[msg("The deadline is too low.")]
    DeadlineTooLow,

    #[msg("URL too long.")]
    URLTooLong,
    #[msg("The campaign has ended.")]
    CampaignEnded,
    #[msg("The campaign is still active.")]
    CampaignStillActive,
    #[msg("The goal has not been reached.")]
    GoalNotReached,
}
