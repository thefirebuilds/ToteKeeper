# Storefront package and tote update

The storefront now uses $125 / $225 / $399 annually for 2 / 4 / 10 storage credits. One Large tote uses one credit and one XL uses two. Big is highlighted as best value: $39.90 per credit per year, about 36% below Small's $62.50. Medium is $56.25 per credit. Monthly enrollment remains paused; monthly rates were not changed.

The tote cards show about 9 gallons (Large) and 19 gallons (XL), one approximate internal size, and a 50 lb packed-tote limit. The weight is a proposed service packing limit, not a manufacturer rating or an estimate of the weight of arbitrary contents. No tote-weighing or oversized-item weight workflow was added. Detailed manufacturer dimensions remain in configuration for reference, but are not displayed in the main tote cards.

Manufacturer nominal capacities are 9 and 18.75 gallons: 18.75 / 9 = 2.083, or about 108% more capacity. The customer copy rounds this to "about twice". Sources: [Large tote](https://www.milkcrates1.com/collections/totes), [XL tote](https://www.milkcratesdirect.com/attached-lid-tote-xl/heavy-duty-attached-lid-tote-xl). Interior dimensions are conservatively rounded and fit varies with the tapered container and packing.

The shared storefront configuration supplies demo quotes and optional local sandbox amounts. New Medium/Big sandbox annual Prices use immutable v2 keys; retired v1 definitions remain for previously saved purchases. Catalog creation remains an explicit operator command. No Stripe API calls, live subscription changes, or Django database/Offering updates were made. Production Django's approved offerings and provider Price mappings must be reviewed separately before taking payments at these prices.
