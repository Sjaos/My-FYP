-- Run once in the Supabase SQL Editor after My project Schema.txt and
-- role_based_seller_modules.sql. This migration enables atomic cart checkout,
-- stock reservation, purchase recommendation signals, and order transitions.

alter table public.orders
  add column if not exists seller_id uuid,
  add column if not exists product_snapshot jsonb not null default '{}'::jsonb;

update public.orders o
set
  seller_id = p.seller_id,
  product_snapshot = case
    when o.product_snapshot = '{}'::jsonb then jsonb_build_object(
      'title', p.title,
      'price', p.price,
      'imageUrl', p.image_url,
      'category', p.category,
      'condition', p.condition,
      'quantity', 1,
      'lineTotal', p.price
    )
    else o.product_snapshot
  end
from public.products p
where p.id = o.product_id
  and (o.seller_id is null or o.product_snapshot = '{}'::jsonb);

alter table public.orders
  alter column seller_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
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

create index if not exists idx_orders_seller_id
  on public.orders(seller_id);

alter table public.products
  drop constraint if exists products_stock_quantity_check,
  drop constraint if exists products_seller_listing_rules_check;

alter table public.products
  add constraint products_stock_quantity_check
    check (stock_quantity >= 0),
  add constraint products_seller_listing_rules_check
    check (
      (
        seller_type = 'business_seller'
        and product_type = 'new'
        and condition = 'New'
        and stock_quantity >= 0
        and (status <> 'active' or stock_quantity > 0)
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

update public.products
set status = 'sold'
where seller_type = 'business_seller'
  and stock_quantity = 0
  and status = 'active';

alter table public.interactions
  drop constraint if exists interactions_interaction_type_check;

alter table public.interactions
  add constraint interactions_interaction_type_check
  check (interaction_type in ('view', 'save', 'purchase'));

create or replace function public.place_fixed_price_orders(
  p_buyer_id uuid,
  p_items jsonb,
  p_shipping_info jsonb
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_role text;
  buyer_active boolean;
  item jsonb;
  product_row public.products%rowtype;
  order_row public.orders%rowtype;
  requested_product_id uuid;
  requested_quantity integer;
  remaining_stock integer;
  product_snapshot jsonb;
begin
  select role, is_active
  into buyer_role, buyer_active
  from public.users
  where id = p_buyer_id;

  if not found or buyer_role <> 'buyer' or buyer_active is false then
    raise exception 'An active buyer account is required to place an order.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your cart must be an array of products.';
  end if;

  if jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Add between 1 and 50 different products to your cart.';
  end if;

  if p_shipping_info is null
     or jsonb_typeof(p_shipping_info) <> 'object' then
    raise exception 'Valid shipping information is required.';
  end if;

  for item in
    select entries.value
    from jsonb_array_elements(p_items) as entries(value)
    order by entries.value ->> 'productId'
  loop
    requested_product_id := (item ->> 'productId')::uuid;
    requested_quantity := (item ->> 'quantity')::integer;

    if requested_quantity is null or requested_quantity < 1 then
      raise exception 'Product quantities must be positive whole numbers.';
    end if;

    select *
    into product_row
    from public.products
    where id = requested_product_id
    for update;

    if not found
       or product_row.status <> 'active'
       or product_row.selling_method <> 'fixed_price' then
      raise exception 'A product in your cart is no longer available for fixed-price purchase.';
    end if;

    if product_row.seller_id = p_buyer_id then
      raise exception 'You cannot purchase your own product.';
    end if;

    if product_row.seller_type = 'individual_seller'
       and requested_quantity <> 1 then
      raise exception 'Used products from individual sellers are single-unit listings.';
    end if;

    if product_row.stock_quantity < requested_quantity then
      raise exception 'Not enough stock for "%". Available quantity: %.',
        product_row.title, product_row.stock_quantity;
    end if;

    remaining_stock := product_row.stock_quantity - requested_quantity;

    product_snapshot := jsonb_build_object(
      'title', product_row.title,
      'price', product_row.price,
      'imageUrl', product_row.image_url,
      'category', product_row.category,
      'condition', product_row.condition,
      'quantity', requested_quantity,
      'lineTotal', product_row.price * requested_quantity
    );

    insert into public.orders (
      user_id,
      seller_id,
      product_id,
      product_snapshot,
      shipping_info,
      payment_status,
      order_status
    )
    values (
      p_buyer_id,
      product_row.seller_id,
      product_row.id,
      product_snapshot,
      p_shipping_info,
      'Cash on Delivery',
      'Placed'
    )
    returning * into order_row;

    if product_row.seller_type = 'business_seller' then
      update public.products
      set
        stock_quantity = remaining_stock,
        status = case
          when remaining_stock = 0 then 'sold'
          else 'active'
        end
      where id = product_row.id;
    else
      update public.products
      set status = 'sold'
      where id = product_row.id;
    end if;

    insert into public.interactions (
      user_id,
      product_id,
      interaction_type,
      weight
    )
    values (
      p_buyer_id,
      product_row.id,
      'purchase',
      8
    );

    return next order_row;
  end loop;

  return;
end
$$;

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_actor_id uuid,
  p_new_status text
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  actor_role text;
  product_row public.products%rowtype;
  ordered_quantity integer;
begin
  select *
  into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  select role
  into actor_role
  from public.users
  where id = p_actor_id
    and is_active is distinct from false;

  if not found then
    raise exception 'Active account not found.';
  end if;

  if actor_role = 'buyer' then
    if order_row.user_id <> p_actor_id
       or order_row.order_status <> 'Placed'
       or p_new_status <> 'Cancelled' then
      raise exception 'Buyers can cancel only their own orders that are still placed.';
    end if;
  elsif actor_role in ('business_seller', 'individual_seller') then
    if order_row.seller_id <> p_actor_id then
      raise exception 'Sellers can update only their own orders.';
    end if;

    if not (
      (order_row.order_status = 'Placed'
        and p_new_status in ('Confirmed', 'Cancelled'))
      or (order_row.order_status = 'Confirmed'
        and p_new_status in ('Shipped', 'Cancelled'))
      or (order_row.order_status = 'Shipped'
        and p_new_status = 'Delivered')
    ) then
      raise exception 'That order status transition is not allowed.';
    end if;
  else
    raise exception 'Only buyers and sellers can update orders.';
  end if;

  if p_new_status = 'Cancelled' then
    select *
    into product_row
    from public.products
    where id = order_row.product_id
    for update;

    if found then
      ordered_quantity := greatest(
        coalesce(
          (order_row.product_snapshot ->> 'quantity')::integer,
          1
        ),
        1
      );

      if product_row.seller_type = 'business_seller' then
        update public.products
        set
          stock_quantity = stock_quantity + ordered_quantity,
          status = case
            when status = 'sold' and stock_quantity = 0 then 'active'
            else status
          end
        where id = product_row.id;
      elsif product_row.seller_type = 'individual_seller'
            and product_row.status = 'sold' then
        update public.products
        set status = 'active'
        where id = product_row.id;
      end if;
    end if;
  end if;

  update public.orders
  set order_status = p_new_status
  where id = order_row.id
  returning * into order_row;

  return next order_row;
  return;
end
$$;

revoke all on function public.place_fixed_price_orders(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.transition_order_status(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.place_fixed_price_orders(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.transition_order_status(uuid, uuid, text)
  to service_role;
