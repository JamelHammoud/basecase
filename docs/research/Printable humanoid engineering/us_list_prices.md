# US list prices for a small 3D-printed hobby humanoid (budget estimates, seen 2026-10-17)

How to read these notes:
- **"Fetched"** means I loaded the store page itself on 2026-10-17 and read the price there. **"Snippet"** means the price came from a search-engine summary of the store page. The page may be cached, so its date is unknown and it is less reliable. Mark snippet rows as lower confidence in the BOM tool.
- No Amazon, eBay or AliExpress/Alibaba prices are used. I fetched nothing from amazon.com.
- Prices are USD before tax and shipping. Stock status is recorded where the page showed it.
- Several sites blocked automated fetches (RobotShop, B&H, Micro Center, McMaster-Carr, Bolt Depot, the Bambu Lab US store and DigiKey all returned 403/402/empty). For those items the price comes from a snippet or is listed under Gaps.

---

## 1. Feetech / Waveshare serial bus servos (STS3215 C018 12 V, ST3215 12 V, STS3215 C001 7.4 V, STS3250)

### Takeaway
A 12 V, 30 kg·cm STS3215-class servo costs about **$22–24 each** from US-facing official channels: Seeed $23.99 (10+ $22.99), with a US warehouse option, and Waveshare $21.99 with small quantity breaks. The 7.4 V C001 is about $22 at Seeed. No authorized US source for the STS3250 (50 kg·cm) was found, and EU and grey-market resellers list it at about $74–97.

### Cited Findings
- **Seeed Studio, "Feetech ST3215-C047 12V 30Kg Servo"** (SKU 108090003; Seeed's name for the 12 V 30 kg·cm, 1:345 STS3215): **"$23.99"**, **"10+: $22.99"**, "In stock". Warehouse options are United States, China and Germany. Single units only, no multi-pack. Fetched — [Seeed](https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)
- **Seeed Studio, "Feetech ST3215 C001 Servo 7.4V 1:345 Gear Ratio"**: **"$21.99"**, **"10+: $20.99"**, "In stock". Fetched — [Seeed](https://www.seeedstudio.com/STS3215-19kg-cm-7-4V-Serial-Servo-p-6338.html)
- Seeed also lists the 7.4 V C044 (1:191) and C046 (1:147) gear-ratio variants. Prices were not checked — [Seeed C044](https://www.seeedstudio.com/Feetech-ST-3215-C044-Heavy-Duty-Servo-7-4V-1-191-Gear-Reduction-p-6460.html), [Seeed C046](https://www.seeedstudio.com/Feetech-ST-3215-C046-Standard-Torque-Servo-7-4V-1-147-Gear-Reduction-p-6461.html)
- **Waveshare, "ST3215 Series Serial Bus Servo … Options For 30kg.cm@12V / 19.5kg.cm@7.4V"**:
  - Range "$16.99 - $21.99".
  - With SKU 22414 (30 kg·cm @ 12 V) selected, the page shows **"$21.99"**. The quantity tiers render garbled; they appear to be about $21.19 (qty 2), $20.79 (qty 3) and $20.63 (qty 4+). Confirm these on the live page.
  - No multi-pack listed. Stock not stated ("Add to Cart" is shown). The 7.4 V version is SKU 33014, priced on its own page and not captured.
  - Fetched — [Waveshare](https://www.waveshare.com/st3215-servo.htm), [Waveshare SKU 22414](https://www.waveshare.com/st3215-servo.htm?sku=22414)
- Waveshare also sells an ST3215-HS (20 kg·cm @ 12 V, 106 RPM, high speed). Price not captured — [Waveshare ST3215-HS](https://www.waveshare.com/st3215-hs-servo-motor.htm)
- **RobotShop** lists "FeeTech 12V 30kg.cm Magnetic Encoding Servo STS3215", "Waveshare 30KG Serial Bus Servo…" and "Magnetic Encoding Servo STS3215 7.4V 19kg.cm". The pages returned 403, so no price was captured — [RobotShop STS3215 12V](https://www.robotshop.com/products/feetech-12v-30kgcm-magnetic-encoding-servo-sts3215), [RobotShop Waveshare 30KG](https://www.robotshop.com/products/waveshare-30kg-serial-bus-servo-high-precision-torque-w-360-deg-encoder), [RobotShop STS3215 7.4V](https://www.robotshop.com/products/magnetic-encoding-servo-sts3215-74v-19kgcm)
- **STS3250 (12 V, 50 kg·cm)**, for comparison only. These are not authorized US distributors:
  - OpenELAB: STS3250-C002 at $73.99 on the English page (€75.85 on EU pages). Snippet — [OpenELAB](https://openelab.com/products/feetech-sts3250-c002-servo-12v)
  - AIFitLab: ST-3250-C001 "With Bracket" at $97.00, backordered. Snippet — [AIFitLab](https://aifitlab.com/products/feetech-sts3250-servo-motor)
  - Neither Waveshare's ST3215 page nor Seeed shows an STS3250 or 50 kg option — [Waveshare](https://www.waveshare.com/st3215-servo.htm)

### Inferences
- For a BOM estimate, use **$22.00–$24.00 per 12 V servo** at single quantity, or about **$23.00 each at 10+** (Seeed). Twenty servos come to roughly $460–480 before shipping.
- Feetech's "C018" code does not appear on Seeed or Waveshare. Seeed calls its 12 V 30 kg·cm part "C047". Treat C018 and C047 as the same class (12 V, 30 kg·cm, 1:345), but confirm the suffix with the seller.

### Gaps
- No Feetech-direct US store or authorized US STS3250 source was found. Use about $74–97 only as a rough comparison.
- RobotShop US prices could not be read (403).
- None of the official stores listed multi-packs (Waveshare, Seeed). Bundle pricing only appears inside SO-ARM101 kits, which were not priced.

---

## 2. Waveshare Bus Servo Adapter (A)

### Takeaway
**$4.99** at Waveshare.

### Cited Findings
- "Serial Bus Servo Driver Board … Applicable for ST/SC Series Serial Bus Servos (Bus Servo Adapter (A), SKU 25514)": **"$4.99"**. Stock not stated ("Add to Cart" is shown). Fetched — [Waveshare](https://www.waveshare.com/bus-servo-adapter-a.htm)
- Seeed offers a driver board add-on at "$5.9" on its STS3215 page — [Seeed](https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)

### Inferences
- Budget $5.00–6.00.

### Gaps
- Waveshare's stock status and US shipping cost were not shown.

---

## 3. Raspberry Pi 5 (4 GB, 8 GB)

### Takeaway
After the 2026 memory-driven price rises, the official US list prices are **$110 (4 GB)** and **$175 (8 GB)**, confirmed at PiShop.us. Adafruit currently charges more: $130 and $200.

### Cited Findings
- **PiShop.us**, "Raspberry Pi 5/4GB": **"$110.00"**, "IN STOCK". Fetched — [PiShop](https://www.pishop.us/product/raspberry-pi-5-4gb/)
- **PiShop.us**, "Raspberry Pi 5/8GB" (SC1112): **"$175.00"**, "IN STOCK". Fetched — [PiShop](https://www.pishop.us/product/raspberry-pi-5-8gb/)
- **Adafruit**, "Raspberry Pi 5 - 4 GB RAM" (#5812): **"$130.00"**, In stock, max 2 per customer. Fetched — [Adafruit](https://www.adafruit.com/product/5812)
- **Adafruit**, "Raspberry Pi 5 - 8 GB RAM" (#5813): **"$200.00"**, In stock, max 2 per customer. Fetched — [Adafruit](https://www.adafruit.com/product/5813)
- Price history from the press:
  - The April 1, 2026 increase took the 4 GB to $110 and the 8 GB to $175 (Liliputing, per search summary) — [Gigazine](https://www.gigazine.net/gsc_news/en/20260402-raspberry-pi-price-increases)
  - The February 2026 round set $85 (4 GB) and $125 (8 GB) — [OMG! Ubuntu](https://www.omgubuntu.co.uk/2026/02/raspberry-pi-annouce-more-price-rises)
  - The December 2025 baseline was $70 and $95 — [3DTested](https://www.3dtested.com/raspberry-pi/raspberry-pi-5-price-increases-drastically-as-ai-shortage-bites-16gb-version-now-usd205-second-price-increase-in-three-months-over-70-percent-more-expensive-than-original-msrp)
  - Related coverage — [TechSpot](https://www.techspot.com/news/111165-raspberry-pi-prices-soar-amid-ai-memory-shortage.html)

### Inferences
- Use **$110 / $175** as the "list" estimate and note that retailers vary (Adafruit is about +$20–25). Prices have changed three times in about four months, so recheck before buying.

### Gaps
- I did not fetch raspberrypi.com's own price list. CanaKit and Micro Center were not checked; Micro Center blocks automated fetches.

---

## 4. Pi Active Cooler, Camera Module 3 (Standard and Wide), Pi 5 camera cable

### Takeaway
At Adafruit: Active Cooler **$13.50**, Camera Module 3 **$29.25**, Camera Module 3 Wide **$38.50**, Pi 5 camera cable (22-to-15 pin, 200 mm) **$2.70**.

### Cited Findings
- "Official Raspberry Pi 5 Active Cooler" (#5815): **"$13.50"**, In stock, max 5 per customer. Fetched — [Adafruit](https://www.adafruit.com/product/5815)
- "Raspberry Pi Camera Module 3 Standard - 12MP Autofocus" (#5657): **"$29.25"**, "In stock". Fetched — [Adafruit](https://www.adafruit.com/product/5657)
- Variants on the same page: "12MP 120 Degree Wide Angle Lens" (Camera Module 3 Wide) **$38.50**, NoIR $25.00, Wide NoIR $38.50. Stock for these variants was not shown. Fetched — [Adafruit](https://www.adafruit.com/product/5657)
- "Raspberry Pi 5 FPC Camera Cable - 22-pin 0.5mm to 15-pin 1mm - 200mm long" (#5818): **"$2.70"**, "In stock". The 300 mm version (#5819) is $3.16 and in stock; the 500 mm is $2.50. Fetched — [Adafruit 5818](https://www.adafruit.com/product/5818), [Adafruit 5819](https://www.adafruit.com/product/5819)

### Inferences
- Odd figures like $29.25 and $13.50 suggest Adafruit has passed on tariff or cost increases. Camera Module 3 was historically $25 / $35 (Wide) list, but I did not verify current official list prices here.

### Gaps
- No second-source check (PiShop or CanaKit) for the cooler and cameras; the PiShop cable URL I tried returned 404.

---

## 5. Adafruit BNO085 (#4754) and STEMMA QT cable

### Takeaway
BNO085 breakout **$29.50** (in stock); STEMMA QT 100 mm cable **$0.95**.

### Cited Findings
- "Adafruit 9-DOF Orientation IMU Fusion Breakout - BNO085 (BNO080) - STEMMA QT / Qwiic" (#4754): **"$29.50"**, $26.55 for 10–99, $23.60 for 100+. "In stock". Fetched — [Adafruit](https://www.adafruit.com/product/4754)
- The same page offers "STEMMA QT / Qwiic JST SH 4-pin Cable - 100mm Long" as a **$0.95** add-on. Fetched — [Adafruit 4754](https://www.adafruit.com/product/4754), [Adafruit 4210](https://www.adafruit.com/product/4210)
- Other cable lengths (snippet, possibly stale): 50 mm $0.95, 200 mm $1.25, 300 mm $1.25, 400 mm $1.50 — [Adafruit 4210](https://www.adafruit.com/product/4210)

### Inferences
- Budget about $30.50 for the IMU plus one cable.

### Gaps
- None significant.

---

## 6. 5 V ≥5 A buck regulator (Pololu)

### Takeaway
The D36V50F5 (5 V, 5.5 A) is **$39.95**. The cheapest Pololu 5 V ≥5 A option found is the **D24V50F5 (5 V, 5 A, 38 V max input) at $32.95**. The newer D42V55F5 (5 V, 6 A, 60 V max input) is also $39.95. All are "Rationed".

### Cited Findings
- "5V, 5.5A Step-Down Voltage Regulator D36V50F5" (#4091): **"1: 39.95; 5: 36.75"**. Status "Rationed (Active and Preferred)", backorders allowed. Fetched — [Pololu 4091](https://www.pololu.com/product/4091)
- "5V, 5A Step-Down Voltage Regulator D24V50F5" (#2851): **"1: 32.95; 5: 30.31"**, input 6–38 V, "Rationed (Active)", backorders allowed. Fetched — [Pololu 2851](https://www.pololu.com/product/2851)
- "5V, 6A Step-Down Voltage Regulator D42V55F5" (#5571): $39.95 (1), $36.75 (5), "Rationed (Active and Preferred)". A category page shows some D42V55Fx parts as out of stock. Snippet — [Pololu 5571](https://www.pololu.com/product/5571), [Pololu category](https://www.pololu.com/category/354/d42v55fx-step-down-voltage-regulators)

### Inferences
- On a 3S pack (max 12.6 V), the D24V50F5's 38 V input limit is plenty, so it is the cheapest suitable choice. A Pi 5 under load plus peripherals is near the edge of 5 A; use the D36V50F5 or D42V55F5 if you want headroom.

### Gaps
- "Rationed" means the per-order quantity may be limited. The actual stock count was not shown.

---

## 7. 3S 11.1 V 2200 mAh LiPo with XT60

### Takeaway
Gens Ace 3S 2200 mAh XT60 packs cost **$22.69–$35.09** at ReadyMadeRC, depending on C rating. The common 25C G-Tech pack is **$26.79** at BuddyRC (the Gens Ace US store) and **$29.99** at ReadyMadeRC with XT60/EC3/Deans.

### Cited Findings
- ReadyMadeRC search results (fetched; all "In Stock"):
  - "Gens Ace Bashing 11.1V 2200mAh 35C 3S1P Lipo Battery Pack XT60": **$22.69**
  - "Gens Ace 2200mAh 3S 11.1V 25C G-Tech Lipo Battery Pack With XT60, EC3, and Deans": **$29.99**
  - "Gens Ace Adventure 2200mAh 3S 11.1V 60C LiPo Battery Pack with XT60": **$35.09**
  - "…25C G-Tech Lipo Battery Pack, EC3" (no XT60): $26.79
  - Sources — [ReadyMadeRC search](https://www.readymaderc.com/search?q=gens+ace+2200+3s), [ReadyMadeRC product](https://readymaderc.com/products/details/gens-ace-2200mah-3s-lipo-battery)
- **BuddyRC**, "Gens Ace 2200mAh 3S 25C 11.1V G-Tech Lipo Battery Pack With XT60 Connector" (SKU GA-B-25C-2200-3S1P-XT60-GT): sale price $26.79. Snippet — [BuddyRC](https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)
- **Classic RC Shop**, "Gens Ace G-Tech Smart 3S LiPo Battery 25C (11.1V/2200mAh) w/XT60": $26.99; one page shows it out of stock. Snippet — [Classic RC Shop](https://classicrcshop.com/products/gens-ace-g-tech-smart-3s-lipo-battery-25c-11-1v-2200mah-w-xt60-connector)

### Inferences
- Budget **$23–30 per pack**. A 25C 2200 mAh pack gives 55 A continuous, which is plenty for a set of STS3215s (2.7 A stall each at 12 V).

### Gaps
- Ovonic, HobbyKing US and RaceDayQuads 3S 2200 prices were not captured.

---

## 8. 2S–4S LiPo balance charger (XT60) and LiPo safe bag

### Takeaway
At RaceDayQuads: ToolkitRC **M4AC (2–4S, 30 W, AC, XT60) $35.99**, ToolkitRC **C6 (1–6S, 50 W, AC, XT60) $35.99**, ToolkitRC M450 (2–4S, 50 W) $47.99, all in stock. The M6AC ($71.99) is sold out. LiPo bags run **$5.99–$16.99** (RDQ pouch $5.99 on sale, RDQ bag $10.99, Lumenier $16.99).

### Cited Findings
- RaceDayQuads ToolkitRC listings (fetched):
  - "M4AC 30W 2.5A 2-4S AC Smart (XT60)" **$35.99**, in stock
  - "C6 50W 5A 1-6S Compact AC (XT60)" **$35.99**, in stock
  - "M450 2-4S 50W 5A Mini Balance" **$47.99**, in stock
  - "M7 AC 200W 15A 2-6S" **$91.49**, in stock
  - "M6AC 300W 15A 1-6S AC (XT60)" **$71.99, Sold Out**
  - Sources — [RDQ search](https://www.racedayquads.com/search?q=toolkitrc+m6ac), [RDQ M4AC](https://www.racedayquads.com/products/toolkitrc-m4ac-30w-2-5a-2-4s-ac-smart-charger-xt60), [RDQ C6](https://www.racedayquads.com/products/toolkitrc-c6-50w-5a-1-6s-compact-ac-charger-xt60)
- RaceDayQuads LiPo bags (fetched; per-item stock not shown):
  - "RDQ LiPo Safe Pouch - Choose Your Color" **$5.99** sale (reg. $7.49)
  - "RDQ LiPo Bag - Choose Your Color" **$10.99**
  - "Lumenier LiPo Safe Bag" **$16.99**
  - "Torvol LiPo Safe Pouch" $32.99
  - Sources — [RDQ bag search](https://www.racedayquads.com/search?q=lipo+safe+bag), [RDQ Lumenier](https://www.racedayquads.com/products/lumenier-fireproof-lipo-bag), [RDQ bag](https://www.racedayquads.com/products/rdq-lipo-bag-choose-your-color)
- ISDT Q6 Nano (DC input only, XT60): $34.99, **Sold out** at Progressive RC US. Snippet — [Progressive RC](https://www.progressiverc.com/products/isdt-q6-nano)

### Inferences
- The M4AC or C6 (AC input, about $36) is the cheapest self-contained option. DC-only chargers such as the Q6 Nano also need a power supply.

### Gaps
- No ISDT 608AC US price was found.

---

## 9. XT60 pigtails, 20 A switch, inline blade fuse holder, 18 AWG silicone wire

### Takeaway
- XT60 pigtails cost **$1.99–2.49 each** or **$6.49 for a 4-pack** (RDQ, 14 AWG).
- 18 AWG silicone wire is **$2.49 per 1 ft red + 1 ft black** (RDQ).
- A Littelfuse FHAC0001ZXJ 20 A inline ATO fuse holder is about **$6.43–7.37** at DigiKey (snippet).
- SparkFun's illuminated covered toggle (marked "20A") is **$4.75**, but its 20 A DC rating is doubtful. A properly rated Carling 20 A DC rocker from DigiKey costs about $5–29.

### Cited Findings
- **RaceDayQuads XT60 pigtails** (fetched; per-item stock not shown):
  - "XT60 Pigtail 14AWG 3" - Male or Female" **$1.99**
  - "XT60 Pigtail 14AWG 4" - Female" $2.49
  - "4 Pack of XT60 Pigtails 14AWG 4" - Black" **$6.49** (reg. $7.00)
  - "Flywoo XT60H 14AWG Black Pigtail (2pcs) - Male/Female" **$3.99**
  - Sources — [RDQ search](https://www.racedayquads.com/search?q=xt60+pigtail), [RDQ 3" pigtail](https://www.racedayquads.com/products/xt60-pigtail-14awg-3-male-or-female), [RDQ Flywoo 2pcs](https://www.racedayquads.com/products/flywoo-xt60h-14awg-black-pigtail-2pcs-male-female)
- **18 AWG silicone wire**, RaceDayQuads "Silicone Wire (1 Ft. Red, 1 Ft. Black) - Choose Your Gauge" (12–24 AWG incl. 18 AWG): **$2.49**. The product shows "In stock", but the variant selector was ambiguous about 18 AWG. Fetched — [RDQ](https://www.racedayquads.com/products/silicone-wire-2-ft-red-and-black-pair)
  - Adafruit's silicone wire category shows 26/30 AWG single wire and 20–28 AWG ribbon; no 18 AWG single wire was found — [Adafruit category 282](https://www.adafruit.com/category/282)
- **Inline fuse holder**, DigiKey Littelfuse FHAC0001ZXJ (20 A, 32 V, ATO/ATC, free-hanging inline, 16 AWG leads): $6.43 or $7.37 at qty 1, depending on snapshot.
  - Variants FHAC0001ZXJA (red wire) $5.82 and FHAC0001ZXJG $6.83.
  - The 25 A FHAC0003ZXJB uses 14 AWG leads.
  - Snippets — [DigiKey FHAC0001ZXJ](https://www.digikey.com/en/products/detail/littelfuse-inc/FHAC0001ZXJ/2004062), [DigiKey FHAC0001ZXJA](https://www.digikey.com/en/products/detail/littelfuse-commercial-vehicle-products/FHAC0001ZXJA/4556497), [Littelfuse FHAC0003ZXJB](https://littelfuse.com/products/fuse-blocks-fuseholders-and-fuse-accessories/automotive-and-commercial-vehicle-fuse-holders/ato-fhac/fhac0003zxjb.aspx)
  - DigiKey also lists Littelfuse 0287-series ATO blade fuses (e.g. 0287005.PXCN 5 A, 0287010.PXCN 10 A, 0287015.PXCN 15 A); prices not captured — [DigiKey 0287010.PXCN](https://www.digikey.com/en/products/detail/littelfuse-inc/0287010.PXCN/2519807)
- **Switch**, SparkFun "Toggle Switch and Cover - Illuminated (Red)" (COM-11310): **"$4.75"**, "In stock". Fetched — [SparkFun](https://www.sparkfun.com/products/11310)
  - A similar Adafruit covered toggle is also marked "20 A", but its listing reportedly recommends 1–2 A max and 12 V max (snippet), so these hobby toggles should not be relied on at 20 A — [Adafruit 3219](https://www.adafruit.com/product/3219)
  - Carling Contura 20 A rated rocker switches at DigiKey (e.g. V1D1G66B-00000-000, SPST): snippet range about $5–29, lead times 8–16 weeks — [DigiKey V1D1G66B](https://www.digikey.com/en/products/detail/V1D1G66B-00000-000/432-1294-ND/3025051)

### Inferences
- Budget: pigtail pair about $4, fuse holder plus a few fuses about $10, a genuinely DC-rated 20 A switch about $10–15, and 18 AWG wire about $5 for 2–4 ft.
- Servo stall current is high, so many builders use a low-current switch driving a MOSFET or relay instead of a 20 A mechanical switch.

### Gaps
- No US hobby-store price was confirmed for a DC-rated 20 A rocker (DigiKey blocked fetch).
- ATO fuse pack prices were not captured. Pololu does not appear to sell bare 18 AWG silicone wire, only 18 AWG-lead connectors.

---

## 10. Waveshare 1.28inch round LCD (GC9A01)

### Takeaway
**$14.99** at Waveshare.

### Cited Findings
- "240×240, General 1.28inch Round LCD Display Module, 65K RGB" (SKU 19192): **"$14.99"**. Tier text: $14.59 (1–9 shown in the tier table), $14.39 (10–49), $14.31 (50–99). Stock not stated. Fetched — [Waveshare](https://www.waveshare.com/1.28inch-lcd-module.htm)

### Inferences
- Budget $15 each; a two-eye face is about $30.

### Gaps
- No US distributor cross-check.

---

## 11. microSD 64 GB A2 (SanDisk Extreme), non-Amazon

### Takeaway
B&H lists the SanDisk 64 GB Extreme UHS-I microSDXC (SDSQXAH-064G-AN6MA, A2/V30, 170/80 MB/s) at about **$34.25**. That figure is a snippet; the page blocked direct fetch. Micro Center lists Extreme PLUS 64 GB A2 cards, but I could not read their price.

### Cited Findings
- B&H, "SanDisk 64GB Extreme UHS-I microSDXC Memory Card SDSQXAH-064G-AN6MA": $34.25 with SD adapter. Snippet — [B&H](https://www.bhphotovideo.com/c/product/1770151-REG/sandisk_sdsqxah_064g_an6ma_64gb_extreme_uhs_i_microsdxc.html)
- B&H also lists a newer "SDSQXH9-064G-GZ6MA" 64 GB Extreme; price not captured — [B&H](https://www.bhphotovideo.com/c/product/1955705-REG/sandisk_sdsqxh9_064g_gz6ma_64gb_extreme_uhs_i_microsd.html)
- Micro Center lists "Sandisk Extreme PLUS 64GB microSDXC … U3 V30 A2" (product 712522) and (651840). Fetch returned 403, so no price — [Micro Center 712522](https://www.microcenter.com/product/712522/sandisk-extreme-plus-64gb-microsdxc-card-uhs-i-flash-memory-card-u3-v30-a2-micro-sd-card), [Micro Center 651840](https://www.microcenter.com/product/651840/sandisk-64gb-extreme-plus-microsdxc-class-10-a2-uhs-3-v30-flash-memory-card-with-adapter)
- Best Buy marketplace: $39.94 (third-party marketplace seller, not Best Buy itself). Snippet — [Best Buy](https://www.bestbuy.com/product/sandisk-micro-sd-memory-card-for-64gb-uhs-i-action-camera-with-adapter/JXJ62C6YPS/sku/12941263)

### Inferences
- Budget **$15–35**. The B&H snippet may reflect list price rather than the typical street price; a European listing showed €12.90. Treat $34.25 as an upper estimate.

### Gaps
- No fetched, dated non-Amazon US price. Recheck B&H or Micro Center manually.

---

## 12. Bambu Lab US store filament (PLA Basic, PETG HF, TPU 95A HF)

### Takeaway
All figures are snippets, because the US store returned HTTP 402 to direct fetch:
- **PLA Basic 1 kg**: $22.99 with spool, $19.99 refill.
- **PETG HF 1 kg**: $18.99 with spool, $15.99 refill. Another page says $19.99, and one page says PETG HF is discontinued.
- **TPU 95A HF 1 kg**: $41.99 with spool. No refill was found.
- Bulk (10+ rolls) pricing drops PLA and PETG to about $12.5–12.6 per roll.

### Cited Findings
- **PLA Basic**: "$12.64 USD/roll (Lowest price for 10+ rolls)", MSRP $22.99. Embedded variant data: refill (1 kg, no spool) $19.99, with spool $22.99. Snippet — [Bambu US PLA Basic](https://us.store.bambulab.com/products/pla-basic-filament?id=565815336288092179)
- **PETG HF**:
  - Product page: "$12.47 USD/roll (Lowest price for 10+ rolls)", MSRP $15.99. Variants: $18.99 with spool, $15.99 refill. The same page reportedly says PETG HF is discontinued and won't be restocked.
  - A second listing shows $19.99, with 4+ rolls from $14.99/$17.99.
  - Snippet — [Bambu US PETG HF](https://us.store.bambulab.com/products/petg-hf), [alt listing](https://us.store.bambulab.com/collections/all-filaments/products/petg-hf)
- **TPU 95A HF**: $41.99 USD for 1 kg with spool, same price for every color. Not AMS-compatible; dry before use. Snippet — [Bambu US TPU 95A HF](https://us.store.bambulab.com/products/tpu-95a-hf)
- Refill collection — [Bambu US refills](https://us.store.bambulab.com/collections/filament-refill)

### Inferences
- Budget **PLA about $20–23/kg, PETG HF about $16–19/kg, TPU 95A HF about $42/kg** at single-roll pricing.
- If PETG HF really is discontinued, plan on regular Bambu PETG or a third-party PETG.

### Gaps
- No fetched, dated confirmation of any Bambu price or stock. No TPU 95A HF refill (spool-less) option was found.

---

## 13. M3 heat-set inserts, M3 and M2 screws

### Takeaway
- **CNC Kitchen M3×5.7 inserts (100 pcs)**: €9.40 from Germany, with the 100-pc variant shown sold out. No US stock was found for CNC Kitchen or Ruthex.
- **Bolt Depot A2 stainless DIN 912**: M3×8 **$4.07/100**, M3×12 **$4.43/100**, M3×30 $6.89/100 (snippets).
- **Bolt Depot black-oxide 12.9**: M3×8 $7.62/100.
- M2 socket caps exist at Bolt Depot (e.g. M2×10 #6365, M2×12 #6366), but prices were not captured.

### Cited Findings
- **CNC Kitchen**, "Heat Set Insert M3 x 5.7 … Standard 100 Stk / pcs": **"Regular price €9,40 EUR"**, taxes included. The page shows both "Auf Lager" and "Sold out" for the 100-pc variant. "Shipping from Germany to the World"; no US warehouse. Fetched — [CNC Kitchen](https://cnckitchen.store/products/heat-set-insert-m3-x-5-7-100-pieces)
- **Ruthex** M3×5.7 100-pc (item RUT-GE-M3x57-001) is sold by 3DJake (EU) in USD. No US retailer was found apart from Amazon and eBay, which are excluded — [3DJake](https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces?sai=15206)
- **Bolt Depot** (snippets; the site returned 403 to fetch):
  - #6379 M3×0.5×8 A2: "$0.06 / ea, $4.07 / 100, $34.60 / 1,000" — [Bolt Depot 3mm A2 list](https://www.boltdepot.com/Metric_socket_cap_Stainless_steel_18-8_(A-2)_3mm_x_0.5mm.aspx)
  - #6381 M3×0.5×12 A2: $0.06 ea, $4.43/100, $37.60/1,000 — [Bolt Depot 3mm A2 list](https://www.boltdepot.com/Metric_socket_cap_Stainless_steel_18-8_(A-2)_3mm_x_0.5mm.aspx)
  - #6385 M3×30 A2: $0.10 ea, $6.89/100 — [Bolt Depot 6385](https://boltdepot.com/Product-Details?product=6385)
  - #13635 M3×8 12.9 black oxide: $0.11 ea, $7.62/100 — [Bolt Depot 13635](https://boltdepot.com/Product-Details?product=13635)
  - #6365 M2×0.4×10 A2 (no price shown) — [Bolt Depot 6365](https://boltdepot.com/Product-Details?product=6365)
  - #6366 M2×12 A2 — [Bolt Depot 6366](https://boltdepot.com/Product-Details?product=6366)

### Inferences
- Budget **M3 screws about $4–5 per 100 per length** (A2). Four lengths (6/8/10/12) come to about $17–20.
- Inserts: about $10–12 plus international shipping from CNC Kitchen. US sellers outside Amazon were not found; budget about $12–15 per 100 as an estimate.

### Gaps
- M3×6 and M3×10 Bolt Depot prices were not captured; they are likely similar to M3×8 ($4.07/100), but this is unverified.
- McMaster-Carr prices could not be read (the page came back empty). No M2 price was captured.
- No pre-made M3 SHCS assortment was priced from a non-Amazon source.

---

## 14. Bearings (MR106ZZ 6×10×3, 608ZZ)

### Takeaway
VXB **608ZZ 10-pack: $8.88 or $17.99**. **MR106ZZ 10-pack: $29.99 or $46.00**. In both cases the page labels are swapped, so the lower figure is probably the actual price. Orders take 5–10 business days to process.

### Cited Findings
- "10-Pack 608ZZ Ball Bearings 8x22x7mm": the page shows "Regular price $8.88" and "Sale price $17.99, you save $9.11" (labels inconsistent). Pack of 10. Shows "Quantity exceeds stock" and "Orders currently take 5-10 business days to process". Fetched — [VXB 608ZZ 10-pack](https://vxb.com/products/10-pack-608zz-ball-bearings-8x22x7mm)
- "10-Pack 6x10mm - Double Shielded 6x10x3 Miniature Bearing" (MR106ZZ, chrome steel): "Regular price $29.99 Sale price $46.00 you save $16.01" (labels inconsistent). Pack of 10, same stock and processing notices. Fetched — [VXB MR106ZZ 10-pack](https://www.vxb.com/6x10-Shielded-6x10x3-Miniature-Bearing-p/mr106zz.htm)
- Single MR106ZZ about $7.77–9.99 (snippet) — [VXB single](https://vxb.com/6x10x3-Shielded-Bearing-Miniature-p/MR106ZZ-1.htm), [VXB single 2](https://vxb.com/products/mr106zz-miniature-shielded-ball-bearing-6mm-x-10mm)

### Inferences
- Budget 608ZZ about $9–18 per 10 and MR106ZZ about $30–46 per 10. VXB's MR106ZZ is pricey; McMaster or a Japanese-brand distributor may differ.

### Gaps
- McMaster bearing prices could not be read.

---

## 15. Feetech 5264 3-pin servo cables and STS3215 aluminium horn

### Takeaway
Waveshare 5264-3PIN cable **6-packs (300 mm, 900 mm, or 3+3 mixed)** are listed in a **$1.99–$3.99** range; the per-option price was not shown. No separately sold STS3215/ST3215 aluminium horn was found from an official US channel. Waveshare's ST3215 ships with an aluminium (6061-T6) horn.

### Cited Findings
- "5264-3PIN Servo Cable (6PCS), options for 300mm / 900mm lengths, Compatible with ST / SC / CF series servos":
  - Options: SKU 34171 (300 mm ×6), 34172 (900 mm ×6), 34322 (3×300 + 3×900 mm)
  - Price range **"$1.99 - $3.99"**; stock not stated
  - Fetched — [Waveshare](https://www.waveshare.com/sr-cable-5264-3pin.htm)
- The ST3215 uses a 5264/2.54 3P connector — [Waveshare wiki](https://www.waveshare.com/wiki/ST3215_Servo)
- Waveshare describes the ST3215 as coming with "high strength aluminum servo wheels" (T6061). The RobotShop STS3215 listing gives a plastic POM horn with a 25T spline — [Waveshare](https://www.waveshare.com/st3215-servo.htm), [RobotShop](https://www.robotshop.com/products/magnetic-encoding-servo-sts3215-74v-19kgcm)
- Pololu's 3-pin JR servo extensions do not fit the 5264 bus connector — [Pololu servo cables](https://www.pololu.com/category/112/servo-cables)

### Inferences
- Budget about $4 per 6-pack of cables. Buy Waveshare ST3215s if you want aluminium horns included; otherwise "no official US source found" for a separate horn.

### Gaps
- The exact per-option cable price was not captured.
- Feetech's own spare aluminium horn was not found from a US distributor (no non-Amazon US source found).
