# Selbuy Semester 7 Frontend: Role-Based Marketplace Core

Semester 7 separates Buyer, Business Seller and Individual Seller workflows. Live bidding and admin features are planned for a later project phase.

## Run
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Run `npm install`.
4. Run `npm run dev`.

## Expected backend endpoints
- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/products`
- GET `/api/products/:id`
- GET `/api/products/mine`
- POST `/api/products` business or individual seller only
- DELETE `/api/products/:id` listing owner only
- POST `/api/interactions` buyer only
- POST `/api/saved-items` buyer only
- GET `/api/saved-items` buyer only
- GET `/api/recommendations?limit=12` buyer only
- GET `/api/recommendations/similar/:productId?limit=4` public

## Core behavior
Guests browse and open details without login. Buyers select interests at registration, filter products by type and seller type, save products and receive recommendations. Business sellers create new fixed-price listings with stock counts. Individual sellers create single-unit used listings with condition, usage, defects and location details. Run `Schema/role_based_seller_modules.sql` after the existing Supabase schema before testing seller registration or listings.

Buyers can add fixed-price products to their cart, check out multiple products together, and track or cancel eligible orders. Sellers can review customer orders and move them through Placed, Confirmed, Shipped and Delivered. Apply `Schema/orders_checkout_migration.sql` after the seller-role migration before using cart checkout or order management; order placement atomically reserves stock and cancellation restores it.

After the order migration, apply `Schema/recommendation_catalog_migration.sql` to power personalized recommendations from Selbuy's own products and marketplace activity. Do not assign Retailrocket item IDs to Selbuy products unless you have a verified product-to-item crosswalk.