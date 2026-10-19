-- Run in Supabase after the base schema, seller-role migration, and
-- orders_checkout_migration.sql. Live Selbuy recommendations are calculated
-- from real Selbuy products and interactions. The optional Retailrocket
-- crosswalk must only contain verified product-to-item relationships.

alter table public.products
  add column if not exists ai_item_id bigint;

create unique index if not exists idx_products_ai_item_id_unique
  on public.products(ai_item_id)
  where ai_item_id is not null;

create index if not exists idx_products_active_ai_item_id
  on public.products(ai_item_id)
  where status = 'active' and ai_item_id is not null;

create or replace function public.recommend_live_catalog(
  p_user_id uuid,
  p_limit integer default 12
)
returns table (
  product_id uuid,
  score numeric,
  reason text,
  collaborative_score numeric,
  content_score numeric,
  popularity_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_role text;
  buyer_active boolean;
begin
  select role, is_active
  into buyer_role, buyer_active
  from public.users
  where id = p_user_id;

  if not found or buyer_role <> 'buyer' or buyer_active is false then
    raise exception 'An active buyer account is required for recommendations.';
  end if;

  return query
  with
  buyer_interests as (
    select lower(trim(value)) as interest
    from public.users u
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(u.interests) = 'array'
          then u.interests
        else '[]'::jsonb
      end
    ) as interests(value)
    where u.id = p_user_id
  ),
  history_signals as (
    select
      i.product_id,
      sum(i.weight)::double precision as weight
    from public.interactions i
    where i.user_id = p_user_id
      and i.interaction_type in ('view', 'save', 'purchase')
    group by i.product_id
    union all
    select
      s.product_id,
      4::double precision as weight
    from public.saved_items s
    where s.user_id = p_user_id
      and not exists (
        select 1
        from public.interactions i
        where i.user_id = s.user_id
          and i.product_id = s.product_id
          and i.interaction_type = 'save'
      )
  ),
  history as (
    select
      h.product_id,
      sum(h.weight)::double precision as weight
    from history_signals h
    group by h.product_id
  ),
  other_user_activity as (
    select
      i.user_id,
      i.product_id,
      sum(i.weight)::double precision as weight
    from public.interactions i
    where i.user_id <> p_user_id
      and i.interaction_type in ('view', 'save', 'purchase')
    group by i.user_id, i.product_id
  ),
  popularity as (
    select
      i.product_id,
      sum(i.weight)::double precision as weight
    from public.interactions i
    where i.interaction_type in ('view', 'save', 'purchase')
    group by i.product_id
  ),
  candidates as (
    select p.*
    from public.products p
    where p.status = 'active'
      and not exists (
        select 1 from history h where h.product_id = p.id
      )
  ),
  raw_scores as (
    select
      c.id as candidate_id,
      coalesce((
        select sum(
          ln(1 + h.weight)
          * ln(1 + source_activity.weight)
          * ln(1 + target_activity.weight)
        )
        from history h
        join other_user_activity source_activity
          on source_activity.product_id = h.product_id
        join other_user_activity target_activity
          on target_activity.user_id = source_activity.user_id
         and target_activity.product_id = c.id
      ), 0)::double precision as collaborative_raw,
      (
        coalesce((
          select max(
            case
              when lower(trim(c.category)) = bi.interest then 3.0
              else 0.0
            end
          )
          from buyer_interests bi
        ), 0)
        + coalesce((
          select sum(
            (
              case
                when lower(trim(c.category)) = lower(trim(source.category))
                  then 3.0
                else 0.0
              end
              + case
                  when c.product_type = source.product_type then 1.0
                  else 0.0
                end
              + case
                  when c.condition = source.condition then 0.5
                  else 0.0
                end
              + (
                  0.5
                  / (
                      1
                      + abs(ln(greatest(c.price, 0.01) / greatest(source.price, 0.01)))
                    )
                )
            ) * ln(1 + h.weight)
          )
          from history h
          join public.products source on source.id = h.product_id
        ), 0)
      )::double precision as content_raw,
      coalesce((
        select ln(1 + pop.weight)
        from popularity pop
        where pop.product_id = c.id
      ), 0)::double precision as popularity_raw
    from candidates c
  ),
  normalized as (
    select
      r.*,
      case
        when max(r.collaborative_raw) over () > 0
          then r.collaborative_raw / max(r.collaborative_raw) over ()
        else 0
      end as collaborative_normalized,
      case
        when max(r.content_raw) over () > 0
          then r.content_raw / max(r.content_raw) over ()
        else 0
      end as content_normalized,
      case
        when max(r.popularity_raw) over () > 0
          then r.popularity_raw / max(r.popularity_raw) over ()
        else 0
      end as popularity_normalized
    from raw_scores r
  ),
  ranked as (
    select
      n.*,
      (
        0.55 * n.collaborative_normalized
        + 0.30 * n.content_normalized
        + 0.15 * n.popularity_normalized
      ) as final_score
    from normalized n
  )
  select
    r.candidate_id,
    round(r.final_score::numeric, 6),
    case
      when r.collaborative_normalized >= r.content_normalized
        and r.collaborative_normalized >= r.popularity_normalized
        and r.collaborative_normalized > 0
        then 'Buyers with similar interests also viewed this product'
      when r.content_normalized > 0
        then 'Matches your interests or the products you viewed, saved, or purchased'
      when r.popularity_normalized > 0
        then 'Popular with Selbuy buyers'
      else 'Recently added to Selbuy'
    end,
    round(r.collaborative_normalized::numeric, 6),
    round(r.content_normalized::numeric, 6),
    round(r.popularity_normalized::numeric, 6)
  from ranked r
  order by r.final_score desc, r.popularity_raw desc, r.candidate_id
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
end
$$;

revoke all on function public.recommend_live_catalog(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.recommend_live_catalog(uuid, integer)
  to service_role;
