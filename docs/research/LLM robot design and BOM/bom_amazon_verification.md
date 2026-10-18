# Automatic BOMs for hobby robots: verified Amazon US links, live prices, budgets, and how LLM tools generate BOMs

Research date: 2026-10-17. Several Amazon dates below come from secondary sources and changed during 2026. Where sources conflict, the conflict is stated.

## 1. Amazon Product Advertising API 5.0 and its successor (Creators API): status, eligibility, operations, fields, limits, ToS, SDKs

### Takeaway
PA-API 5.0 is retired. Its docs (webservices.amazon.com/paapi5) now 302-redirect to a deprecation notice, and calls return HTTP 403 `AccessDenied`. The replacement is the **Amazon Creators API**: OAuth 2.0 client credentials, lowerCamelCase payloads, the same four operations (GetItems, SearchItems, GetVariations, GetBrowseNodes), OffersV2 only, and official SDKs for Node.js, Python, PHP and Java. Three things make it a poor fit for a desktop BOM tool:
- It requires an approved Associates account with recent qualifying sales (reported as 10 in the last 30 days).
- The Associates agreement bars Associates content and links in client-side software (other than approved mobile apps).
- API content may be cached for at most 24 hours (images never), and a client application may not cache it at all.

### Cited Findings
**Status and dates**
- The old PA-API docs URL https://webservices.amazon.com/paapi5/documentation/ (and its api-rates page) now 302-redirects to `affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation`. That page says PA-API 5 "has been deprecated and is being replaced by the Creators API" and is "no longer the recommended way to access Amazon's product catalog". Calls to PA-API 5 get HTTP 403 with error code `AccessDenied`. The page gives no retirement date. — [Creators API: PA-API v5 deprecation](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)
- Dates conflicted across 2026:
  - Earlier PA-API docs said deprecation on April 30, 2026 (FAQ) or May 15, 2026. — [PA-API FAQ](https://webservices.amazon.com/paapi5/documentation/faq.html); [Open Library issue #12255 "PA-API deprecated April 30, 2026"](https://github.com/internetarchive/openlibrary/issues/12255)
  - One developer article says Amazon stops maintaining PA-API on April 30, 2026 and retires the endpoint on May 15, 2026. It notes the public migration guide doesn't publish retirement dates, so the dates appear to come from Associates emails. — [DEV Community (th3nate)](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek)
  - A plugin vendor's changelog says that on Feb 24, 2026 Amazon announced PA-API v5 retires May 15, 2026, and on Jun 20, 2026 Amazon set **June 30, 2026** as the retirement deadline. — [Keywordrush blog](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)
  - Other secondary sources say the same. — [FreshStore blog](https://blog.freshstore.com/amazon-creators-api-pa-api-retirement/); [paapiplugin.com](https://paapiplugin.com/amazon-is-retiring-pa-api-v5-is-your-affiliate-plugin-ready/)
- **Offers V1 is gone.** The old docs said "Offers is deprecated. Use OffersV2 instead." — [PA-API GetItems (amazon.ca mirror)](https://webservices.amazon.ca/paapi5/documentation/get-items.html). Keywordrush reports the Offers V1 retirement was extended to January 31, 2026. — [Keywordrush](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)
- **Credential versions:**
  - v2.x credentials use Cognito; v3.x use Login with Amazon (LwA).
  - Keywordrush's Sep 5, 2026 update says v2.x credentials stop working after **September 11, 2026**. — [Keywordrush](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/) (secondary; not confirmed on an Amazon page)

**Auth, endpoint and SDKs**
- "CreatorsAPI uses secure authentication with OAuth 2.0 client credentials flow." "Your credentials work globally across all marketplaces." The credential version (e.g. 3.1, 3.2) "only determines which token endpoint to use". — [Creators API FAQ](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/frequently-asked-questions)
- Migration guide: the main change is AWS SigV4 → OAuth 2.0, and "existing Product Advertising API credentials will not work with the Creators API". — [Migrating to Creators API from PA-API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi)
- Official SDKs exist for Node.js, Python, PHP and Java. The Node SDK is installed with `npm install` / `npm run build`, and the SDKs handle token caching and renewal. — [Creators API: Using SDK](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-sdk) (via search snippet)
- Endpoints, as reported by a developer:
  - API host: `https://creatorsapi.amazon/catalog/v1/`
  - v2.x tokens: Cognito, e.g. `creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token` for NA, scope `creatorsapi/default`. Requests send `Authorization: Bearer <token>, Version <v>` plus an `x-marketplace` header.
  - v3.x tokens: LwA at `api.amazon.com/auth/o2/token`, scope `creatorsapi::default`.
  - Parameters are lowerCamelCase: `itemIds`, `partnerTag`, `resources[]`, `searchIndex`, `itemCount`.
  — [DEV Community](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek)
- Credentials are created in Associates Central under Tools → Creators API → Create Credential, and the secret is shown once. Tokens last about an hour. — [Keywordrush](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)

**Eligibility**
- The onboarding page says "Once you have an Amazon Associates account, you can register for the Creators API" and "The Associates Program is free to join". It gives no sales threshold. — [Creators API onboarding](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding)
- Secondary sources say "Amazon requires at least 10 qualifying referred sales in the last 30 days to access Creators API", that the account must have final-accepted Associates status, and that "only the primary account owner can register". — [DEV Community](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek). Keywordrush also cites the "10 qualifying sales in 30 days" rule and the `AssociateNotEligible` error. — [Keywordrush](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)
- The often-cited "3 qualifying sales in 180 days" rule (the PA-API-era Associates account approval rule) was not confirmed on any current Amazon page I fetched. The Participation Requirements page has no API sales rule. — [Associates Participation Requirements](https://affiliate-program.amazon.com/gp/associates/help/operating/participation/)

**Operations and fields**
- **Operations:** GetBrowseNodes, GetItems, SearchItems, GetVariations.
- **Resources:** BrowseNodeInfo, BrowseNodes, Images, ItemInfo, ParentASIN, SearchRefinements, VariationSummary. GetVariations returns items that "differ by a consistent theme such as size or color".
  — [Creators API reference](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference)
- **GetItems parameters:**
  - `itemIds` (up to 10, required), `itemIdType` (`ASIN` only), `partnerTag` (required).
  - `condition`: `Any` (default) or `New`. It can return 0 offers.
  - `resources` (default `itemInfo.title`).
- **GetItems resources** include `offersV2.listings.price` (buying price), `offersV2.listings.availability` ("maximum quantity that can be purchased"), `offersV2.listings.isBuyBoxWinner`, `offersV2.listings.merchantInfo`, `itemInfo.manufactureInfo` and `itemInfo.productInfo`.
- **GetItems errors:** invalid or inaccessible ids come back in an `errors` array, e.g. code `ItemNotAccessible`. Responses may come in a different order, so match items by ASIN.
  — [Creators API GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items)
- PA-API 5 availability guidance (legacy): offers have an availability type such as available now, preorderable or backorderable (`Offers.Listings.Availability.Type`). — [PA-API: Determining availability](https://webservices.amazon.com/paapi5/documentation/use-cases/using-offer-information/determining-availability.html)

**Rate limits**
- Legacy PA-API limits:
  - New accounts got 1 TPS and 8,640 TPD for the first 30 days, then limits scaled with shipped revenue up to 10 TPS.
  - A GetItems call with 10 ASINs counts as one transaction.
  — [PA-API API rates (amazon.ca mirror)](https://webservices.amazon.ca/paapi5/documentation/troubleshooting/api-rates.html)
- Users reported 429s well below 1 TPS. — [AWS re:Post: PA-API 429](https://www.repost.aws/questions/QUaMFKckEsRrqXVbVBEGTpdg/product-advertising-api-429-too-many-requests)
- The Creators API Concepts page has an "API Rates and Limits" section, but no numbers were visible. — [Creators API Concepts](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts)

**ToS on prices, caching and apps** (all quoted from the Associates Program Policies — [Program Policies](https://affiliate-program.amazon.com/help/operating/policies))
- Section 2(i): "You will include a date/time stamp adjacent to your display of pricing or availability information" if you "refresh the Product Advertising Content displayed on your application less frequently than hourly", with the disclaimer "Product prices and availability are accurate as of the date/time indicated and are subject to change."
- Section 2(h): "You will not store or cache Product Advertising Content consisting of an image". Other content may be cached "for up to 24 hours", after which "you must immediately thereafter refresh and re-display" it. Also: "the client application may not store or cache Product Advertising Content."
- Section 2(b): you must "display both the lowest 'new' price and, if we provide it to you, the lowest 'used' price". Special Links must get pricing "via Creators API or PA API".
- IP License §1 excludes "any use of data mining, robots, or similar data gathering and extraction tools". §2(e) bars use "for the purpose of aggregating, analyzing, extracting, or repurposing any Product Advertising Content".
- **Client-side software ban** (Participation Requirements §7a): Content or Special Links may not be used with "any client-side software application (e.g., a browser plug-in, helper object, toolbar, extension, or component or any other application executable or installable by an end user) on any device, including computers… other than Approved Mobile Applications", unless there is a separate written agreement. — [Associates Participation Requirements](https://affiliate-program.amazon.com/gp/associates/help/operating/participation/)
- Approved Mobile Applications must, among other things, be distributed through Google Play, Apple or Amazon stores, be free, not offer price tracking, and not render Amazon pages in WebViews. — [ConductAtlas summary of Associates Mobile App policy](https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/provision/CA-P-064406/unapproved-mobile-app-links-disqualified/) (third-party)
- Enforcement precedent: in 2017 Amazon terminated the Delicious Library (a macOS desktop app) Associates account for links in client-side software. — [Michael Tsai blog, Oct 26 2017](https://mjtsai.com/blog/?p=19354)

### Inferences
- An Electron desktop app is "an application executable or installable by an end user". Embedding Associates affiliate tags, or showing Creators API prices inside the app, conflicts with §7a unless Amazon agrees in writing. The client app also may not cache API content at all. Plain non-affiliate `amazon.com/dp/<ASIN>` links opened in the system browser aren't Associates "Special Links", so the Associates rules don't govern them (the general Conditions of Use still apply).
- The Creators API can't be the app's built-in price source:
  - A hobby user is unlikely to have 10 referred sales in 30 days, so "bring your own Creators API key" works only for the few users who are active Associates.
  - Even then, displaying the data in a desktop client likely breaches §7a.
  - A compliant route would be a server-side web service owned by an eligible Associate, which this app doesn't have.
- If the app ever does use Creators API data, these rules apply: timestamp and disclaimer next to every price, cache under 24 hours, no image caching, show the lowest new price, and use `condition=New` for BOMs.

### Gaps
- No official Amazon page I could fetch states the Creators API sales threshold, its rate limits, or the final PA-API shutdown date. The Troubleshooting and Rate Limits subpages weren't fetched.
- Exact OffersV2 field shapes (e.g. `price.money.amount`, `availability.type`/`message`, `dealDetails`) weren't confirmed on the Creators API reference page.
- The Amazon.com Conditions of Use page (nodeId=508088) returned HTTP 503, so its current text couldn't be quoted directly (see §2 for third-party copies).

## 2. Alternatives (Keepa, Rainforest/Traject, Canopy, SerpApi, Oxylabs), costs, what they return, and the legality of scraping amazon.com

### Takeaway
Third-party Amazon data APIs are cheap at hobby volumes and need no Associates status:
- **Keepa:** about 1 token per ASIN; plans from about €49/month (third-party figure).
- **Rainforest (Traject Data):** $23/month for 500 credits up to $9,000/month.
- **Canopy:** reportedly 100 free requests per month, then about $0.01 per request.
- **SerpApi:** Amazon search engine; pricing not confirmed.

All but Keepa (its own price-history database) scrape Amazon pages. Rainforest says outright that it provides "web-scraped data". Amazon's Conditions of Use exclude "data mining, robots, or similar data gathering and extraction tools", and robots.txt blocks every major AI crawler user-agent (ClaudeBot, Claude-User, GPTBot…) from the whole site. A responsible desktop app should not scrape amazon.com itself. Instead:
- Open links in the user's browser for the final check.
- Optionally verify through a third-party API using the **user's own key**, so the user carries that vendor's ToS.
- Prefer distributor APIs (Digi-Key, Mouser, Nexar) for electronics, since they are licensed for this.

### Cited Findings
**Keepa** — [Keepa: How plans work](https://keepa.com/api-docs/plans-tokens.html); [Keepa API docs](https://keepa.com/api-docs/)
- Token costs: 1 token per ASIN, +6 tokens per offer page (up to 10 offers per page), 10 tokens per product search page, 5 per Deals request, 50 per Best Sellers list.
- Unused tokens expire after 60 minutes. Plans are prepaid monthly and rate-limited by a token bucket.
- Plan prices (third-party, July 2026): €49/month for 20 tokens/min (892,800 tokens/month), about €129 for 60/min, €459 for 250/min, €2,499 for 2,000/min. — [RevenueGeeks Keepa pricing](https://revenuegeeks.com/keepa-pricing/)
- Keepa serves data from its own periodically updated database rather than live fetches. — [SocialCrawl comparison 2026](https://www.socialcrawl.dev/blog/best-amazon-product-data-apis-2026) (vendor-written comparison)

**Rainforest API (Traject Data)** — [Traject Data Rainforest pricing](https://trajectdata.com/ecommerce/rainforest-api/pricing/)
- Official pricing (billed annually): Hobbyist $23/month, 500 credits ($0.06 per extra credit); Starter $83/month, 10,000; Production $375/month, 250,000; BigData $1,000/month, 1M; ScaleUp $2,200/month, 2.5M; Platform $4,000/month, 5M; Volume $9,000/month, 20M. A free trial is offered.
- Returns: titles, bullets, attributes, variations, live and historical price, coupons, availability, seller/fulfillment context, and Buy Box owner/price (FBA/FBM).
- States it is "not affiliated with or endorsed by Amazon" and provides "web-scraped data from public domain sources".
- A competitor's comparison listed Starter at $59 for 10,000. That conflicts with the official $83, which may reflect monthly vs annual billing or a price change. — [ASINSpotlight vs Rainforest](https://www.asinspotlight.com/blog/asinspotlight-api-vs-rainforest-api)

**Canopy API**
- 100 free requests/month, then $0.01 per request; Premium about $400+/month for 100K requests plus $0.004 each. Offers REST, GraphQL and an MCP server. — [mybesh.com listing](https://mybesh.com/tool/canopy-api); [SocialCrawl](https://www.socialcrawl.dev/blog/best-amazon-product-data-apis-2026) (third-party; Canopy's own pricing URL returned 404)

**SerpApi**
- Amazon search engine (`engine=amazon`, `amazon_domain` defaults to amazon.com).
- Returns `asin`, `price`/`extracted_price`, `price_unit`, `old_price`, `rating`, `reviews`, a `prime` flag, `options` (variant summary text), `delivery`, `bought_last_month` and `badges`. There's no explicit stock field.
- Cached searches (1 hour) are free. Plan prices weren't stated on the page.
— [SerpApi Amazon Search API](https://serpapi.com/amazon-search-api)

**Oxylabs**
- No source fetched. See Gaps.

**Amazon's own terms and robots.txt**
- amazon.com robots.txt (fetched 2026-10):
  - For `User-agent: *`, `/dp/` is generally allowed. Specific subpaths are disallowed: `/dp/product-availability/`, `/dp/twister-update/` (the variation switcher), `/dp/shipping/` and others, plus `/gp/offer-listing/` (with exceptions), `/gp/cart` and `/ap/signin`.
  - `Disallow: /` for AI agents including ClaudeBot, Claude-User, Claude-SearchBot, GPTBot, ChatGPT-User, PerplexityBot and CCBot.
  — [amazon.com/robots.txt](https://www.amazon.com/robots.txt)
- Conditions of Use license clause (third-party copies): the license excludes "any use of data mining, robots, or similar data gathering and extraction tools" and collecting product listings, descriptions or prices. — [ConductAtlas: Amazon COU data-mining provision](https://conductatlas.com/platform/amazon/amazon-conditions-of-use/provision/CA-P-018441/prohibition-on-data-mining-and-scraping-tools/); [Scribd copy](https://www.scribd.com/document/875709813/Amazon). Official page: [Amazon Conditions of Use](https://amazon.com/gp/help/customer/display.html?ie=UTF8&nodeId=508088) (HTTP 503 when fetched).
- Legal commentary: scraping public Amazon data isn't automatically illegal under US case law, but the ToS ban is enforceable as a contract matter. These are vendor blogs with an interest in scraping. — [Thunderbit](https://thunderbit.com/blog/is-scraping-amazon-legal); [ScrapeHero](https://www.scrapehero.com/is-scraping-amazon-legal/)

### Inferences
- Because robots.txt explicitly disallows Claude-User and similar agents, an agent-driven fetch of amazon.com pages inside the app (e.g. the CAD agent's WebFetch) to "verify" a link conflicts with Amazon's stated crawler policy. This app's agent should not fetch Amazon pages.
- Recommended architecture, lowest risk first:
  1. Store `{ASIN, verifiedAt, verifiedBy}` in the catalog from a human or maintainer check, and show "Checked ⟨date⟩".
  2. Open `https://www.amazon.com/dp/<ASIN>` in the system browser (the app already uses `setWindowOpenHandler`). The user sees the live price and availability. No affiliate tag.
  3. Add an optional "Check prices" button using the user's own Keepa, Rainforest or Canopy key in Settings. Show a timestamp and "prices may change".
  4. Electronics should come from Digi-Key, Mouser or Nexar, which license price and stock data for this use (§4).
- At BOM scale, with about 20–60 line items per robot rechecked weekly, Keepa's cheapest plan (about 0.9M tokens/month) or Canopy's free tier covers a single user. Keepa's 1 token per ASIN is the cheapest per-check source but isn't live. Rainforest/Canopy are live but scraped.

### Gaps
- Oxylabs Amazon API pricing and fields weren't researched.
- SerpApi plan pricing and whether it has an Amazon product (single ASIN) engine weren't confirmed. Only the search engine was documented on the fetched page.
- Keepa's and Traject's own ToS (redistribution and display rights in a desktop app) weren't read.
- Canopy pricing wasn't verified on a first-party page.

## 3. Detecting dead or wrong links and matching a listing to a maker part number or spec

### Takeaway
With an API, use GetItems / product lookup by ASIN:
- `ItemNotAccessible` or a missing item means the ASIN is dead.
- Zero `condition=New` offers, or no Buy Box winner, means it's unavailable.
- ParentASIN and GetVariations reveal a parent/child variation listing, where the BOM must pin the exact child ASIN.

Matching must be done against structured fields (manufacturer, model/part number, unit count, title tokens for size), not titles alone. Hardware like "M3×10 socket head, 100-pack" needs pack-size parsing so per-unit cost is computed correctly.

### Cited Findings
- **Dead or unavailable items:** GetItems reports invalid or inaccessible ASINs in an `errors` array (`ItemNotAccessible`). The array appears when some items succeed and others fail. `condition=New` may return 0 offers. `offersV2.listings.isBuyBoxWinner` flags the Buy Box offer, and `merchantInfo` gives the seller. — [Creators API GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items)
- **Variations:** the ParentASIN resource returns an item's parent. GetVariations returns siblings that differ "by a consistent theme such as size or color". VariationSummary summarises them. — [Creators API reference](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference)
- **Structured fields for matching:** `itemInfo.manufactureInfo` (manufacturing attributes) and `itemInfo.productInfo` (non-technical attributes). — [Creators API GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items)
- **Legacy availability:** offers report an availability type (now, preorderable, backorderable). — [PA-API Determining availability](https://webservices.amazon.com/paapi5/documentation/use-cases/using-offer-information/determining-availability.html)
- **Third-party APIs:**
  - SerpApi returns `price_unit` (unit pricing) and `options` text (e.g. "4 sizes"), which help spot multi-variant or multi-pack listings. — [SerpApi Amazon](https://serpapi.com/amazon-search-api)
  - Rainforest returns variations and Buy Box/seller context. — [Traject Rainforest](https://trajectdata.com/ecommerce/rainforest-api/pricing/)
- Amazon's robots.txt disallows `/dp/twister-update/` and `/dp/product-availability/`, the endpoints a scraper would use to resolve variations and availability, which is another reason not to resolve them by scraping. — [amazon.com/robots.txt](https://www.amazon.com/robots.txt)
- **Case study (SO-101 BOM):** it mixes per-unit rows (servos, boards) with per-pack rows ("USB-C Cable, 2 pcs", "Table Clamp, 4pcs" at Qty 1). Its CN column priced the same pack inconsistently between two tables (×2/×4 in one, not the other). The two-arm CN and JP totals don't add up (CN line items sum to ¥1,354.76 vs ¥1,343.16 stated). — [TheRobotStudio SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)

### Inferences
- **Suggested link states for the app:**
  - Verified: ASIN resolves, a New Buy Box offer exists, and the match checks pass.
  - Unavailable: resolves but has no New offer.
  - Dead: `ItemNotAccessible`.
  - Changed: title or manufacture info no longer matches the stored maker part number or spec.
  - Unchecked: no API key, or the last check is too old.
- **Matching rules:**
  1. Normalize the maker part number (strip spaces and dashes, case-fold) and require it in `manufactureInfo` (model or part number) or the title.
  2. For hardware, parse thread (M2/M2.5/M3), length (`x10`, `10mm`), head type, material/finish and pack count (`100pcs`, `100-pack`, `(100)`). Require exact thread and length, and treat a "kit/assortment" title as a mismatch.
  3. Reject parent ASINs. Store the child ASIN plus the variation attributes the user needs.
  4. Compute `unitCost = offerPrice / packCount`. Store both pack price and pack count.
- **ASIN format:** ASINs are 10 alphanumeric characters (non-book ASINs typically start with "B0"). A regex check catches typos but says nothing about validity. This rule isn't from a fetched source; check before relying on it.

### Gaps
- No primary source fetched on amazon.com's redirect behavior for retired ASINs (e.g. redirect to a successor ASIN, "Currently unavailable", or 404 "Dogs of Amazon" page).
- The exact `itemInfo.manufactureInfo` sub-fields (e.g. `itemPartNumber`, `model`) and `productInfo.unitCount` weren't confirmed on the Creators API resource page.
- No published algorithm or tool was found that matches Amazon listings to ISO fastener specs.

## 4. BOM tooling (Octopart/Nexar, Digi-Key, Mouser, KiCad, Flux, CAD BOM tables) and LLM agents that generate purchasable BOMs

### Takeaway
Electronics BOM tools ground every line in a distributor or aggregator database instead of letting a model invent part numbers or links:
- **Nexar/Octopart:** priced by matched parts, with a free Evaluation tier.
- **Digi-Key:** ProductDetails gives real-time price and stock; keyword search can be up to 24 hours stale.
- **KiCost:** builds a costed spreadsheet from a KiCad BOM.
- **Flux AI:** Hybrid RAG part search over live supply data.

Mechanical CAD (Onshape) BOM tables are property-driven: Part Number and Description columns plus admin-defined custom properties. I found no peer-reviewed paper on LLM agents producing purchasable robot BOMs. The nearest evidence is about hallucinated identifiers: about 19.7% of LLM-suggested software packages were hallucinated. That supports a "catalog-only, never free-text part numbers" design.

### Cited Findings
**Nexar / Octopart** — [Nexar: Compare API plans](https://nexar.com/compare-plans); [Nexar FAQ](https://support.nexar.com/support/solutions/articles/101000497890-frequently-asked-questions); [Altium: Octopart API plans](https://developer.altium.com/octopart-api-plans)
- Plans: Evaluation (up to 100 matched parts, free), Standard (up to 2,000), Pro (up to 15,000), Enterprise (custom).
- The FAQ instead cites a lifetime Evaluation part limit of 1,000, and says usage counts returned part objects and resets monthly. Paid prices are shown after sign-up.
- Octopart v3 users were migrated to Nexar. — [Nexar: Migration from Octopart v3](https://support.nexar.com/support/solutions/articles/101000434416-migration-from-octopart-v3-api)

**Digi-Key and Mouser**
- Digi-Key v4: `/products/v4/search/{partNumber}/productdetails`. Keyword search data "is cached and may be up to 24 hours stale. Please use ProductDetails for real time pricing and availability". There are daily and per-minute limits that return 429, and sandbox apps can't call production. — [Digi-Key developer FAQ: products, plans and APIs](https://developer.digikey.com/faq/products-plans-and-apis); [Digi-Key FAQ: response codes](https://developer.digikey.com/faq/api-response-unexpected-response-and-error-codes)
- A 1,000 requests/day default is reported only by secondary sources. — [Jentic Digi-Key listing](https://jentic.com/apis/digikey); [Digi-Key forum: API limit](https://forum.digikey.com/t/required-api-limit-to-be-increased/67924)
- Mouser: not researched (see Gaps).

**KiCad**
- KiCost reads a KiCad schematic BOM and builds a cost spreadsheet with per-distributor quantity-break pricing. You can enter your own pricing for parts distributors don't carry.
- Current releases use the Kitspace PartInfo API, which relies on paid third-party services and on donations ("will have to be shut down" if donations run out).
— [KiCost docs](https://kicost.readthedocs.io/en/latest/readme.html); [KiCost GitHub](https://github.com/hildogjr/KiCost)
- KiBoM generates BOMs without external libraries. — [KiCad forum: BOM export script](https://forum.kicad.info/t/kicad-bom-export-script/1018)

**Flux AI** (all vendor claims)
- Hybrid Retrieval-Augmented Generation plus agentic search planning for part discovery, with keyword and vector results fused and re-ranked. — [Flux blog, June 5 2025](https://unified.flux.ai/p/blog/smarter-part-search-just-got-a-major-upgrade)
- Live supply-chain pricing and availability tied to the project, and the AI searches real-time supply data for in-stock parts. — [Flux blog, Jan 29 2026](https://www.flux.ai/p/blog/design-real-time-supply-chain-visibility-2026)
- Copilot "can generate a bill of materials (BOM)" and help find sources (2023). — [Flux Copilot announcement](https://flux.ai/p/blog/flux-copilot-the-first-ai-powered-hardware-design-assistant)
- No independent accuracy data was found.

**Onshape**
- BOM default columns are Item Number, Quantity, Part Number and Description.
- Admins can define custom properties and a default BOM template, and users can add columns.
- Editing a BOM cell updates the part's properties.
- "Show assembly only" lets a purchased subassembly be one line with one vendor part number.
— [Onshape help: Bill of Materials](https://cad.onshape.com/help/Content/bill_of_material.htm); [Onshape tech tip](https://www.onshape.com/en/resource-center/tech-tips/viewing-sorting-editing-bill-of-materials)

**LLM agents and hallucination**
- Package hallucination study: about 19.7% of package names generated by 16 code LLMs were hallucinated. RAG and fine-tuning reduced this. — [arXiv 2406.10279 (summary)](https://fugumt.com/fugumt/paper_check/2406.10279v1)
- Survey of hallucinations in LLM agents: errors compound across reasoning, tool use and memory. — [arXiv 2509.18970](https://arxiv.org/html/2509.18970v1)
- An LLM multi-agent mechatronics design framework has an electronics agent that reuses existing hardware and checks available resources. It notes weak handling of real-time constraints and doesn't produce a grounded purchasable BOM. — [arXiv 2504.14681](https://arxiv.org/pdf/2504.14681)

### Inferences
- **Design pattern for this app's agent:**
  - The BOM is derived from scene parts (`componentId` → catalog record; hardware spec key → `HARDWARE_FAMILIES`), never from agent free text.
  - The agent may only cite catalog keys (it already uses `find_parts` / `add_parts` with catalog keys, and unknown keys are reported as problems).
  - Links and prices come from the catalog or a verification API, never from model output. This mirrors Flux's retrieval grounding and the package-hallucination lesson.
  - Printed parts become "filament (g)" lines computed from mesh volume (the kernel already returns volume).
- Electronics lines (Pi, sensors, boards) can carry Digi-Key or Mouser part numbers as a second source with licensed real-time price and stock (ProductDetails). Amazon then stays a convenience link.

### Gaps
- Mouser Search API (part-number search, keys, limits) wasn't researched.
- JITX and Fusion 360 BOM features weren't researched.
- No product or paper was found that generates robot BOMs with verified Amazon links. Absence of evidence is from a limited search.
- Nexar paid tier prices aren't public.

## 5. How open-source printable robots publish BOMs with prices and links

### Takeaway
BOMs are published as markdown tables in the README (SO-101, with per-region price columns and vendor links) or as linked Google Sheets/Feishu wikis (Open Duck Mini) and docs sites (ToddlerBot, Berkeley Humanoid Lite on GitBook). Quantities mix per-unit and per-pack rows. Totals are stated by hand and can drift from line items. Servos usually come from Alibaba/AliExpress or the maker, and Amazon covers commodity items (cables, PSUs, clamps, tools).

### Cited Findings
**SO-101** (TheRobotStudio / LeRobot) — [SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)
- Markdown tables with Part, Qty and US/EU/CN/JP price columns, each linked to a vendor (Alibaba for STS3215 servos, Amazon for the control board, USB-C cables, PSU, table clamps and screwdriver; TaoBao and Akizuki Denshi for CN/JP).
- Totals: two arms (leader + follower) US $229.88 / €226.3 / ¥1,343.16 CN / ¥44,530 JP; one follower arm US $121.94.
- STS3215 at $13.89 each, with three gear ratios (1/345 ×7, 1/191 ×2, 1/147 ×3 for the two-arm set).
- Per-pack rows ("USB-C Cable, 2 pcs", "Table Clamp, 4pcs") at Qty 1. Some CN links are missing. The CN/JP two-arm totals don't match the sum of their line items. There's no changelog of link changes.

**Open Duck Mini v2** — [Open_Duck_Mini GitHub](https://github.com/apirrone/Open_Duck_Mini)
- BOM in a Google Sheet (https://docs.google.com/spreadsheets/d/1gq4iWWHEJVgAA_eemkTEsshXqrYlFxXAPwO515KpCJc) and a Chinese Feishu wiki.
- The README says only "The full BOM cost should be under $400!"

**ToddlerBot**
- The full BOM is on the project docs site (hshi74.github.io/toddlerbot). ROBOTIS sells a bundle of only the Dynamixel parts. — [ROBOTIS US ToddlerBot bundle](https://www.robotis.us/toddlerbot-bundle-kit/)
- About $4,300 total, varying with sourcing. — [Korben (secondary)](https://korben.info/en/toddlerbot-4300-dollar-robot-embarrasses-tech-giants.html)

**Berkeley Humanoid Lite**
- "Total hardware cost is under $5,000 (based on U.S. market prices)", from e-commerce platforms and desktop 3D printers, with every custom part inside a 200 × 200 × 200 mm print volume. — [arXiv 2504.17249](https://arxiv.org/pdf/2504.17249)
- Table III reportedly gives about $4,312 US vs $3,236 China, including 10 × 6512 actuators at $188 and 12 × 5010 at $136. — [R&D World (secondary)](https://www.rdworldonline.com/berkeley-debuts-5000-open-source-humanoid-built-with-desktop-3d-printers/)
- The GitHub README links to GitBook docs and has no BOM. — [Berkeley-Humanoid-Lite GitHub](https://github.com/HybridRobotics/Berkeley-Humanoid-Lite)

### Inferences
- Common schema: Part, Qty, unit or pack price, per-region price columns, a vendor link per region, and footnotes for bundles and alternatives. Missing: pack count as its own column, a "price as of" date, part numbers separate from links, and computed totals.
- Link rot is mostly unmeasured, but the signals are there: hand-maintained totals that drift, missing regional links, and bundle footnotes. An app that generates the BOM from the scene with dated price checks avoids all of these.
- The US vs China cost gap (about 25% for Berkeley Humanoid Lite) suggests showing "Amazon US" and "direct/AliExpress" tiers.

### Gaps
- Petoi and Poppy BOM formats weren't researched.
- Open Duck Mini's sheet (columns, vendors, actual total) and ToddlerBot's docs BOM page weren't fetched.
- No measured link-rot rate exists for any of these projects.

## 6. Budget modeling: per-pack vs per-unit, shipping/tax, filament, spares, price tiers

### Takeaway
There's little primary guidance. What the sources show:
- Real BOMs mix pack and unit pricing (SO-101).
- Regional sourcing changes totals by about 25% (Berkeley Humanoid Lite US vs China).
- Distributor APIs give quantity-break pricing (KiCost).
- Price data must carry a timestamp (Amazon policy).

A budget model should keep pack price, pack count, quantity needed, packs to buy, and leftover. It should report both "cash to spend" (whole packs) and "cost of what's used" (per unit), with an "as of" date.

### Cited Findings
- **Pack vs unit:** in SO-101, cables and clamps are bought as packs at Qty 1, while servos are per unit. The same pack was priced inconsistently across two tables. — [SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)
- **Regional tiers:** Berkeley Humanoid Lite costs about $4,312 US vs $3,236 China, per its paper's Table III as reported. — [R&D World](https://www.rdworldonline.com/berkeley-debuts-5000-open-source-humanoid-built-with-desktop-3d-printers/); [arXiv 2504.17249](https://arxiv.org/pdf/2504.17249)
- **Quantity breaks:** KiCost outputs per-distributor pricing at different order quantities and accepts user-entered pricing for parts distributors don't carry. — [KiCost docs](https://kicost.readthedocs.io/en/latest/readme.html)
- **Unit price field:** SerpApi returns `price_unit` for Amazon listings. — [SerpApi Amazon](https://serpapi.com/amazon-search-api)
- **Timestamp requirement:** Amazon-sourced price displays need a date/time stamp and the "accurate as of" disclaimer when refreshed less often than hourly. — [Associates Program Policies](https://affiliate-program.amazon.com/help/operating/policies)
- **Budget targets:** Open Duck Mini states a budget target ("under $400") rather than an itemized total. — [Open_Duck_Mini](https://github.com/apirrone/Open_Duck_Mini)

### Inferences
- **Suggested BOM line model:** `{source: catalog key, qtyNeeded, packCount, packPrice, currency, packsToBuy = ceil((qtyNeeded + spares)/packCount), cashCost = packsToBuy × packPrice, usedCost = qtyNeeded × packPrice/packCount, leftover, priceAsOf, priceSource, linkStatus}`.
- **Fastener consolidation:** merge identical hardware specs across the scene before computing packs. Twelve M3×10 and eight M3×10 means one 100-pack, not two.
- **Spares:** default +10% or +2 for fasteners and inserts. Zero for servos unless the user opts in.
- **Filament:** grams = printed volume × material density (PLA about 1.24 g/cm³, PETG about 1.27, from general knowledge, not a fetched source) × an infill/shell factor. Cost = grams × spool price / spool grams. These densities and the method need sourcing before use.
- **Shipping and tax:** show as user-set lines or percentages (US sales tax varies by state). Don't estimate them from Amazon data, since the APIs above don't return tax.
- **Tiers:**
  - "Budget": cheapest verified listing or direct-from-maker.
  - "Recommended": the catalog's pinned listing.
  - "Fast": Prime/Buy Box.
  Each total is labeled with its price-check date.

### Gaps
- No primary source was found for hobby-robot shipping/tax modeling, filament cost conventions, or spare-part ratios in published robot BOMs.
- Whether the Creators API or the third-party APIs return shipping cost or Prime eligibility per offer wasn't confirmed. SerpApi exposes a `delivery` string and `prime` flag only.
