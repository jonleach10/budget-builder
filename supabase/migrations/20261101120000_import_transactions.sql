-- Stores one upload, all of it or none of it. This file is public, so it holds
-- no account digits or other real data.

-- Marks the accounts counted as savings on Overview. Which accounts those are
-- is set outside this repo.
alter table public.accounts
  add column is_savings boolean not null default false;

-- Postgres runs a function call as one transaction, so any failure stores
-- nothing. Security invoker keeps every policy in force, including the MFA
-- requirement. user_id comes from its column default, never from a row.
create function public.import_transactions(
  p_rows jsonb,
  p_rates jsonb,
  p_pairs jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new bigint;
  v_possible_duplicates bigint;
begin
  -- A row in someone else's account could otherwise conflict with a stored row
  -- and count as skipped, which would show that the row exists. Accounts this
  -- session can't read include all of them on a password-only session.
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming (account_id uuid)
    where not exists (
      select 1 from public.accounts as account
      where account.id = incoming.account_id
    )
  ) then
    raise exception 'An import row names an account this session can''t use.'
      using errcode = '42501';
  end if;

  insert into public.fx_rates (rate_date, base, quote, rate)
  select incoming.rate_date, incoming.base, incoming.quote, incoming.rate
  from jsonb_populate_recordset(null::public.fx_rates, p_rates) as incoming
  on conflict do nothing;

  -- A stored row is never updated here, so a re-import can't undo an edit.
  with inserted as (
    insert into public.transactions (
      account_id, fingerprint, posted_on, purchased_on,
      amount_minor, currency, description, purpose,
      original_amount_minor, original_currency, original_rate,
      bank_type, bank_category, ppd_id, ordering_party_id, transfer_number,
      balance_minor, base_amount_minor, base_currency, base_rate,
      type, category_id, category_source, suggested_category_id,
      possible_duplicate
    )
    select
      incoming.account_id, incoming.fingerprint, incoming.posted_on, incoming.purchased_on,
      incoming.amount_minor, incoming.currency, incoming.description, incoming.purpose,
      incoming.original_amount_minor, incoming.original_currency, incoming.original_rate,
      incoming.bank_type, incoming.bank_category, incoming.ppd_id,
      incoming.ordering_party_id, incoming.transfer_number,
      incoming.balance_minor, incoming.base_amount_minor, incoming.base_currency, incoming.base_rate,
      incoming.type, incoming.category_id, incoming.category_source, incoming.suggested_category_id,
      coalesce(incoming.possible_duplicate, false)
    from jsonb_populate_recordset(null::public.transactions, p_rows) as incoming
    on conflict (account_id, fingerprint) do nothing
    returning possible_duplicate
  )
  select count(*), count(*) filter (where possible_duplicate)
  into v_new, v_possible_duplicates
  from inserted;

  -- A pair updates both rows or neither, so an edited row can't leave its
  -- partner half-paired. A type of 'transfer' or null means JL hasn't chosen
  -- something else for the row. Each pair is { moneyOut, moneyIn }, with each
  -- side as { accountId, fingerprint }.
  with open_pairs as (
    select
      gen_random_uuid() as pair_id,
      money_out.id as money_out_id,
      money_in.id as money_in_id
    from jsonb_array_elements(p_pairs) as pair
    join public.transactions as money_out
      on money_out.account_id = (pair -> 'moneyOut' ->> 'accountId')::uuid
      and money_out.fingerprint = pair -> 'moneyOut' ->> 'fingerprint'
    join public.transactions as money_in
      on money_in.account_id = (pair -> 'moneyIn' ->> 'accountId')::uuid
      and money_in.fingerprint = pair -> 'moneyIn' ->> 'fingerprint'
    where money_out.transfer_pair_id is null
      and money_in.transfer_pair_id is null
      and (money_out.type is null or money_out.type = 'transfer')
      and (money_in.type is null or money_in.type = 'transfer')
  )
  update public.transactions as stored
  set type = 'transfer', transfer_pair_id = open_pairs.pair_id
  from open_pairs
  where stored.id in (open_pairs.money_out_id, open_pairs.money_in_id);

  return jsonb_build_object(
    'new', v_new,
    'skipped', jsonb_array_length(p_rows) - v_new,
    'possible_duplicates', v_possible_duplicates
  );
end
$$;

-- Postgres gives every new function to public, and Supabase can add anon.
revoke execute on function public.import_transactions(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_transactions(jsonb, jsonb, jsonb)
  to authenticated;
