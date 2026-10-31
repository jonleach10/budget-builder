-- The first version's tables. This file is public, so it holds no account
-- digits or other real data.

-- Number.MAX_SAFE_INTEGER. Supabase's API returns bigint as a JSON number, so a
-- larger value would lose digits in JavaScript.
create domain public.minor_units as bigint
  check (value between -9007199254740991 and 9007199254740991);

create domain public.currency_code as text
  check (value ~ '^[A-Z]{3}$');

-- Text, because Supabase's API turns numeric into a float. The shape is what
-- convertMoney accepts, which refuses a rate of zero.
create domain public.decimal_rate as text
  check (value ~ '^[0-9]+(\.[0-9]+)?$' and value ~ '[1-9]');

-- Needs one character that JavaScript's trim() keeps, so text the app calls
-- blank can't be stored. \S isn't enough: it lets a no-break space through.
create domain public.filled_text as text
  check (value ~ '[^\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name public.filled_text not null,
  last_four text not null check (last_four ~ '^[0-9]{4}$'),
  format text not null check (format in ('chase-bank', 'chase-card', 'commerzbank')),
  currency public.currency_code not null,
  country text not null check (country in ('US', 'DE')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  -- Matches resolveAccount in features/import/parseStatement.ts, which tells two
  -- accounts apart by format and can't pick between two of one format.
  unique (user_id, format, last_four)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name public.filled_text not null,
  position integer not null default 0,
  unique (user_id, id),
  unique (user_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,

  -- From the bank. Locked after insert, see the grants below.
  account_id uuid not null,
  fingerprint public.filled_text not null,
  posted_on date not null,
  purchased_on date,
  amount_minor public.minor_units not null,
  currency public.currency_code not null,
  description text not null,
  purpose text,
  original_amount_minor public.minor_units,
  original_currency public.currency_code,
  original_rate public.decimal_rate,
  bank_type text,
  bank_category text,
  ppd_id text,
  ordering_party_id text,
  transfer_number text,
  balance_minor public.minor_units,

  -- Set at import and locked, so past reports never change. Rows already in
  -- the base currency store a rate of 1.
  base_amount_minor public.minor_units not null,
  base_currency public.currency_code not null,
  base_rate public.decimal_rate not null,

  -- Review state. A null type or category means the row needs review, and a
  -- category_source of 'manual' means JL confirmed the category.
  type text check (type in ('spending', 'income', 'transfer', 'saved', 'personal')),
  category_id uuid,
  category_source text check (category_source in ('manual', 'rule', 'history', 'bank-type')),
  suggested_category_id uuid,
  note text,
  hidden boolean not null default false,
  possible_duplicate boolean not null default false,
  -- Both sides of a transfer between accounts share one value.
  transfer_pair_id uuid,

  created_at timestamptz not null default now(),

  unique (account_id, fingerprint),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, suggested_category_id)
    references public.categories (user_id, id) on delete set null (suggested_category_id),
  constraint only_spending_has_a_category
    check (category_id is null or type is not distinct from 'spending'),
  constraint source_needs_a_category
    check (category_source is null or category_id is not null),
  constraint original_amount_has_a_currency
    check (num_nonnulls(original_amount_minor, original_currency) in (0, 2))
);

create index transactions_by_month on public.transactions (user_id, posted_on);

-- A foreign key can only clear its own columns, so deleting a category needs
-- this to clear the source. Without it, source_needs_a_category refuses the
-- delete.
create function public.clear_category_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.category_source := null;
  return new;
end
$$;

revoke execute on function public.clear_category_source()
  from public, anon, authenticated;

create trigger category_source_follows_category
  before update of category_id on public.transactions
  for each row
  when (new.category_id is null)
  execute function public.clear_category_source();

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  match_on text not null check (
    match_on in ('ppdId', 'orderingPartyId', 'descriptionStartsWith', 'descriptionContains')
  ),
  value public.filled_text not null,
  position integer not null default 0,
  type text check (type in ('spending', 'income', 'transfer', 'saved', 'personal')),
  category_id uuid,
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade,
  constraint rule_gives_a_type_or_a_category
    check (num_nonnulls(type, category_id) = 1)
);

create table public.budget_amounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  country text not null check (country in ('US', 'DE')),
  category_id uuid not null,
  amount_minor public.minor_units not null,
  -- Matches currencyFor in features/budget/budget.ts.
  currency text generated always as (
    case country when 'US' then 'USD' else 'EUR' end
  ) stored,
  primary key (user_id, month, country, category_id),
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

create table public.fx_rates (
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  rate_date date not null,
  base public.currency_code not null,
  quote public.currency_code not null,
  rate public.decimal_rate not null,
  primary key (user_id, rate_date, base, quote)
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete restrict,
  base_currency public.currency_code not null default 'USD'
);

-- Every table gets the same access. Supabase can grant new tables to anon and
-- authenticated by default, so those grants are replaced here.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts', 'categories', 'transactions', 'rules',
    'budget_amounts', 'fx_rates', 'settings'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('alter table public.%I enable row level security', table_name);

    execute format(
      'create policy owner_only on public.%I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      table_name
    );

    -- The publishable key is public, so without this a stolen password could
    -- read everything through the API and never meet the app's MFA check.
    execute format(
      'create policy requires_mfa on public.%I
         as restrictive
         for all to authenticated
         using ((select auth.jwt() ->> ''aal'') = ''aal2'')
         with check ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      table_name
    );
  end loop;
end
$$;

grant select, insert, update, delete on
  public.accounts,
  public.categories,
  public.rules,
  public.budget_amounts,
  public.fx_rates,
  public.settings
to authenticated;

-- Bank date and amount stay locked: only the review columns can be updated.
grant select, insert, delete on public.transactions to authenticated;
grant update (
  type,
  category_id,
  category_source,
  suggested_category_id,
  note,
  hidden,
  possible_duplicate,
  transfer_pair_id
) on public.transactions to authenticated;
