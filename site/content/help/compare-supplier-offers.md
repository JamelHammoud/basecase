---
title: Compare supplier offers
date: 2026-11-20
collection: build-and-print
type: task
keywords:
  - quote
  - supplier
  - purchasing plan
  - csv
related:
  - export-remaining-purchases
  - count-the-parts-you-already-own
covers:
  - src/components/build/SupplierOfferSheet.tsx
  - src/components/build/useSupplierOffers.ts
  - src/components/build/OfferFields.tsx
  - src/components/build/OfferMatch.tsx
  - src/components/build/OfferComparison.tsx
  - src/utils/supplierOffers.ts
  - src/utils/supplierOfferCsv.ts
---

Compare dated quotes against the quantities you have left to buy, then download your selected offers with their sources and delivery estimates.

1. In **Build**, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Supplier Offers**.
3. In **Destination**, enter the delivery region from your quotes, such as US-CA.
4. In **Required arrival date**, enter the date you need the purchases to arrive.
5. Click **Save**.
6. Click **Download CSV Template**.
7. Fill in the downloaded columns with evidence from the supplier's quote.
8. Under **Import Supplier CSV**, choose the completed file.
9. For each offer, choose its **BOM item**, check **Units per order**, then click **Confirm Match and Packaging**.
10. Select the offer for each line, then click **Export Purchasing Plan**.

![Two imported Pico 2 offers awaiting exact BOM matching and packaging confirmation](/help/compare-supplier-offers/confirm.png)

To open **Supplier Offers**, you can press [[⌘K]] and choose **Supplier Offers**. To enter a quote without a file, click **Enter Quote**, fill in its fields and click **Add Quote**.

![Manual quote fields for quantities, currency, destination, dates and source reference](/help/compare-supplier-offers/quote.png)

You can import up to 500 rows and 1 MiB. Manufacturer and supplier part numbers keep their text format, including leading zeros. Start by matching the exact manufacturer and manufacturer part number in the saved listing. If you can't identify an item, leave its identity unresolved.

In Quantity Breaks, enter order quantities and prices, such as `1:12|10:10`. In Available Orders, enter the number of ordering units rather than individual pieces. For three boards sold in packs of two, you buy two packs. Subtract owned stock from the demand before rounding.

Use an ISO timestamp with a timezone for Observed At and Expires At, such as `2026-11-20T12:00:00Z`. Use `YYYY-MM-DD` for arrival dates. Leave missing dates and availability blank. In Destination, enter an exact match for your plan's destination. You can enter a quote number or URL in Source Reference.

![Selected Shop B offer with its pack quantity, price, quoted arrival and observation timestamp](/help/compare-supplier-offers/comparison.png)

You use the same selection for the comparison and download, with a separate total for each currency. Leave an offer unresolved if the quote has expired, the evidence is older than 60 days, the stock is insufficient or the delivery date is missing. Prices exclude charges that the supplier left out of the quote.

Use **Edit Match** to correct packaging or reconfirm a changed listing. You keep the original quote intact. After a reload, you keep your offers and selections. If you edit owned stock, you get an updated calculation of the remaining demand.

Use the arrival estimate for purchasing alone. You still need to resolve printing, fabrication and assembly as separate inputs. Selecting an offer does not place an order, reserve stock or change Checks. You can use the existing [BOM export](/help/export-remaining-purchases) without offers.
