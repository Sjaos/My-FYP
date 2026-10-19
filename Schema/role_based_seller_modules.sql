-- Run this once in the Supabase SQL Editor after the existing Selbuy schema.
-- Legacy seller accounts with both New and Used listings are ambiguous; decide
-- which seller type they should use and split those listings before rerunning.

do $$
begin
  if exists (
    select 1
    from public.users u
    join public.products p on p.seller_id = u.id
    where u.role = 'seller'
    group by u.id
    having count(distinct p.condition) > 1
  ) then
    raise exception
      'A legacy seller has both New and Used listings. Resolve those listings to one seller type before applying this migration.';
  end if;
end
$$;

alter table public.users
drop constraint if exists users_role_check;

alter table public.products
  add column if not exists seller_type text,
  add column if not exists product_type text,
  add column if not exists stock_quantity integer,
  add column if not exists item_condition text,
  add column if not exists usage_duration text,
  add column if not exists defects text,
  add column if not exists location text,
  add column if not exists selling_method text;

update public.users u
set role = case
  when exists (
    select 1
    from public.products p
    where p.seller_id = u.id
      and p.condition = 'New'
  ) then 'business_seller'
  else 'individual_seller'
end
where u.role = 'seller';

update public.products p
set
  seller_type = case
    when u.role = 'business_seller' then 'business_seller'
    else 'individual_seller'
  end,
  product_type = case
    when p.condition = 'New' then 'new'
    else 'used'
  end,
  stock_quantity = case
    when u.role = 'business_seller'
      then greatest(coalesce(p.stock_quantity, 1), 1)
    else 1
  end,
  item_condition = case
    when p.condition = 'Used' then p.item_condition
    else null
  end,
  selling_method = coalesce(p.selling_method, 'fixed_price')
from public.users u
where u.id = p.seller_id;

alter table public.users
add constraint users_role_check
check (
  role in (
    'buyer',
    'business_seller',
    'individual_seller'
  )
);

alter table public.orders
add column if not exists seller_id uuid,
add column if not exists product_snapshot jsonb not null default '{}'::jsonb;

alter table public.orders
alter column seller_id
  set default null;

update public.orders o
set seller_id = p.seller_id
from public.products p
where o.product_id = p.id
and o.seller_id is null;

alter table public.orders
alter column seller_id set not null;

do $$
begin
if not exists (
  select 1 from pg_constraint
  where conname = 'orders_seller_id_fk'
    and conrelid = 'public.orders'::regclass
) then
  alter table public.orders
    add constraint orders_seller_id_fk
    foreign key (seller_id)
    references public.users(id)
    on delete restrict;
end if;
end
$$;

alter table public.products
alter column seller_type set not null,
alter column product_type set not null,
alter column stock_quantity set default 1,
alter column stock_quantity set not null,
alter column selling_method set default 'fixed_price',
alter column selling_method set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_seller_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_seller_type_check
    check (
      seller_type in (
        'business_seller',
        'individual_seller'
      )
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_product_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_product_type_check
    check (product_type in ('new', 'used'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_stock_quantity_check
    check (stock_quantity >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_item_condition_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_item_condition_check
    check (
      item_condition is null
      or item_condition in ('Like New', 'Good', 'Fair')
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_selling_method_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_selling_method_check
    check (selling_method = 'fixed_price');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_seller_listing_rules_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_seller_listing_rules_check
    check (
      (
        seller_type = 'business_seller'
        and product_type = 'new'
        and condition = 'New'
        and stock_quantity >= 1
        and item_condition is null
        and selling_method = 'fixed_price'
      )
      or
      (
        seller_type = 'individual_seller'
        and product_type = 'used'
        and condition = 'Used'
        and stock_quantity = 1
        and (
          item_condition is null
          or item_condition in ('Like New', 'Good', 'Fair')
        )
        and selling_method = 'fixed_price'
      )
    );
  end if;
end
$$;

create index if not exists idx_products_seller_type
on public.products(seller_type);

create index if not exists idx_products_product_type
on public.products(product_type);

create index if not exists idx_orders_seller_id
on public.orders(seller_id);
