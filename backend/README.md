# Selbuy Semester 7 Backend: Role-Based Marketplace Core

This backend matches the React frontend and enforces separate buyer, business-seller and individual-seller account types. Live bidding, Socket.io, admin tools, seller analytics and OTP remain outside this core release.

## Included
- Buyer, business-seller and individual-seller registration and JWT login
- Server-side email, role, duplicate-account and role-permission validation
- Public product browsing, search, filter, sort, and details
- Business sellers can list new fixed-price products and manage stock
- Individual sellers can list one used item with condition, usage, defects and location details
- Seller-only product creation, editing, image upload, listing lifecycle controls, and deletion
- Sold listings cannot be reactivated; listings need available stock before activation
- Buyer-only saved items and view/save interactions
- Public similar-product recommendations
- Buyer-personalized recommendations using interests plus view/save behavior
- Supabase-backed persistence for users, listings, orders and interactions

New registrations are stored as pending signups, not as users. The user
account is inserted only after the email link is confirmed. Existing accounts
keep their current login behavior until they request verification. Verification
tokens are stored as SHA-256 hashes, expire after 24 hours, and can only be
used once. The legacy `REQUIRE_EMAIL_VERIFICATION` environment flag does not
control this per-account behavior.

## Run
1. Run `npm install`
2. Create `backend/.env`
3. Add Supabase and JWT environment variables
4. Run `npm run dev`
5. Test `GET /api/health`

## Email verification

Before using this flow, apply `Schema/email_verification_migration.sql` in the
Supabase SQL Editor. It creates the pending-registration table and the
transactional database function that inserts the user only after successful
verification. Set these values in `backend/.env`:

```env
APP_BASE_URL=http://localhost:5173
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your-brevo-smtp-login
BREVO_SMTP_KEY=your-brevo-smtp-key
BREVO_FROM_EMAIL=your-verified-sender
BREVO_FROM_NAME=Selbuy
```

Keep SMTP credentials private and do not commit `.env`. For local testing
without sending real email, set `EMAIL_DELIVERY_MODE=mock`, restart the backend,
register a test account, and open the returned `verificationPreviewUrl`.
Confirm verification by clicking **Verify email** on that page; the token is
not consumed by a page load. Mock mode is rejected in production. Remove
`EMAIL_DELIVERY_MODE=mock` and restart the backend to send through Brevo. Mock
delivery is limited to localhost app URLs.

The check-email screen offers a resend action for pending registrations.
It displays a 60-second resend countdown, and the backend enforces the same
cooldown. Existing accounts only become subject to verification after
requesting a verification email. The verification page asks for a final
confirmation click so automated email security scanners do not consume the
one-time link.

## AI recommendation service

The trained-model health endpoint requires the FastAPI service to be running.
From the `ai-service` directory in PowerShell, start it with:

```powershell
..\.venv\Scripts\python.exe -m uvicorn src.main:app --host 127.0.0.1 --port 8000
```

Keep this process running while using trained-model endpoints. The live
Selbuy-catalog recommender remains available independently.

## Database

The backend uses Supabase PostgreSQL for users, products,
saved items, interactions, orders and recommendation data.
Product images are currently stored in the local uploads folder.

After applying the existing database schema, run
`Schema/role_based_seller_modules.sql` in the Supabase SQL Editor. It
migrates legacy seller accounts where their listing types make the new role
unambiguous, adds listing-type and stock columns, and enforces the role rules.
Legacy business listings receive a conservative starting stock of 1; sellers
should verify and update quantities after migration. The migration stops if a
legacy seller has both New and Used listings; resolve those listings to one
seller type before rerunning it. Existing users should log in again after
migration to receive a token with their new role.

Then run `Schema/orders_checkout_migration.sql` in the Supabase SQL Editor.
It adds atomic multi-item fixed-price checkout, safe stock reservation and
restoration on cancellation, purchase recommendation signals, and order-status
transition rules. Do not enable the updated checkout UI until this migration
has completed successfully.

## Demo accounts after seed
- Buyer: `buyer@selbuy.test` / `password`
- Individual seller: `seller@selbuy.test` / `password`
- Business seller: `business@selbuy.test` / `password`

## Endpoint contract
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/verify-email`
- POST `/api/auth/resend-verification`
- GET `/api/products`
- GET `/api/products/mine`
- GET `/api/products/:id`
- POST `/api/products`
- DELETE `/api/products/:id`
- GET/POST `/api/saved-items`
- POST `/api/interactions`
- GET `/api/orders` (buyer order history)
- GET `/api/orders/seller` (seller order queue)
- GET `/api/orders/address`
- POST `/api/orders/place` (one product or cart items)
- PATCH `/api/orders/:orderId/status` (seller progress or buyer cancellation)
- GET `/api/recommendations`
- GET `/api/recommendations/similar/:productId`

## Important
Auctions can be selected only in a later release; this backend currently
rejects auction listings rather than publishing a listing that buyers cannot
bid on. Checkout uses Cash on Delivery as a recorded demo payment method;
online payment-gateway settlement and physical delivery services remain out
of scope.

Product images currently use the local uploads folder. Recommendation quality
is reported from offline evaluation and must not be presented as live Selbuy
marketplace performance.

After the order migration, run
`Schema/recommendation_catalog_migration.sql` to enable recommendations on
the real Selbuy catalog. The live hybrid ranker combines Selbuy user
interactions, saved products, product category/type/condition/price, buyer
interests, and popularity; it does not pretend that unrelated Retailrocket
item IDs are Selbuy products.

The trained Retailrocket model remains an offline recommendation experiment.
Live use of that model requires a verified product-to-item crosswalk; never
assign arbitrary IDs. Products without verified mappings continue to receive
live-catalog recommendations from Selbuy data. `GET /api/recommendations/health/ai`
reports model health and optional catalog
mapping counts.

From `ai-service/`, retrain and compare popularity, content-based,
item-collaborative, and hybrid variants with a chronological leave-one-out
evaluation:

```powershell
..\.venv\Scripts\python.exe -m src.train_m3
..\.venv\Scripts\python.exe -m unittest test_training.py
..\.venv\Scripts\python.exe test_recommender.py
```

Training writes the deployable model to
`ai-service/artifacts/selbuy_m3_bundle.joblib`, evaluation comparisons to
`ai-service/reports/evaluation_metrics.json`, and training details to
`ai-service/reports/training_metadata.json`. The report includes Precision@K,
Recall@K, MAP@K, and Hit Rate@K for the same held-out users across the four
variants. The trained artifact is fitted on all filtered interactions after
holdout evaluation. Retailrocket is an offline experiment with view,
add-to-cart, and transaction events; it contains no Selbuy saves or auction
bids. Do not map its item IDs to Selbuy products without a verified crosswalk.

Latest offline run (1,000 held-out users, K=10):

| Variant | Precision@10 | Recall@10 | MAP@10 | Hit Rate@10 |
|---|---:|---:|---:|---:|
| Popularity | 0.0002 | 0.002 | 0.001200 | 0.002 |
| Content-based | 0.0029 | 0.029 | 0.010206 | 0.029 |
| Item-collaborative | 0.0035 | 0.035 | 0.015881 | 0.035 |
| Hybrid | 0.0054 | 0.054 | 0.023476 | 0.054 |

The final `selbuy-m3-v2` artifact was fitted on 781,524 filtered interactions
(65,970 users and 36,126 items). The hybrid leads these tested baselines on
this offline split, but the results are modest and do not measure live Selbuy
performance. Training streams item-category files and batches nearest-neighbor
queries to limit peak memory use.

### Selbuy-catalog training prototype

The database currently contains too few Selbuy examples to claim a reliable
Selbuy-trained model. A separate pipeline can train on Selbuy product and
interaction exports without Retailrocket item-ID mapping. It accepts an active
product CSV with `product_id,title,description,category,product_type,condition,price`
and an interaction CSV with `user_id,product_id,interaction_type,created_at`.
Supported interactions are `view`, `save`, and `purchase`. The evaluation
holds out each eligible buyer's latest distinct product.

Run an explicitly labelled synthetic pipeline demonstration:

```powershell
..\.venv\Scripts\python.exe -m src.train_selbuy_model --synthetic-demo
```

This reproducibly generates 120 synthetic marketplace listings and 600
interactions from 60 synthetic demo buyers in
`ai-service/data/synthetic_demo/`. The CSV values are invented; they are not
exports from real Selbuy accounts or evidence of real customer behavior.
It writes only `ai-service/demo_artifacts/selbuy_synthetic_demo_bundle.joblib`
and `ai-service/reports/selbuy_synthetic_demo_evaluation.json`. Synthetic
results verify the pipeline only: they are not real performance results and
must not be used for recommendations to real buyers.

To train with real Selbuy exports instead:

```powershell
..\.venv\Scripts\python.exe -m src.train_selbuy_model --products-csv data/selbuy/products.csv --interactions-csv data/selbuy/interactions.csv
```

That creates `ai-service/artifacts/selbuy_catalog_hybrid_bundle.joblib` and
`ai-service/reports/selbuy_catalog_evaluation.json`. Export only the fields
needed for training, protect the CSVs, and do not include buyer names or
emails. This prototype artifact is not yet loaded by the website's
recommendation endpoint; connecting a model trained on real Selbuy data is a
separate integration step. At the time this workflow was added, Selbuy had
only 3 products and 16 interaction rows, which is insufficient for a credible
recommendation-quality claim.

### Recommendation integration smoke test

Run the normal backend and FastAPI services, then sign in through the website
as a buyer and open `/recommendations`. The home page and recommendation page
show whether results come from the Selbuy live-catalog hybrid, the trained
FastAPI model, or the JavaScript fallback. A fallback-only result must not be
reported as trained-model output.

The public integration health check is:

```powershell
Invoke-RestMethod http://localhost:5000/api/recommendations/health/ai
```

On 2026-10-18, the local smoke check confirmed FastAPI model `selbuy-m3-v2`
health, a successful buyer recommendation response (`200`) from
`selbuy-live-catalog-hybrid`, and a successful similar-product response from
`javascript-fallback`. At that time the catalog had 3 products (2 active), 0
verified trained-model mappings, and the buyer endpoint returned 1 active
recommendation. This validates the current live-catalog route, not integration
of the offline trained artifact with Selbuy products.
