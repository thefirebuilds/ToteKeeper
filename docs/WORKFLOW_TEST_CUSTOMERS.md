# MVP workflow test customers

These fictional customers use password `password` and have customer permissions only.
Login: https://portal.162-243-163-103.sslip.io/accounts/login/

| Username | Annual test plan | Starting scenario |
| --- | --- | --- |
| blake1 | Small, $125 / 2 units | New customer; registered totes; ready to request pickup |
| blake2 | Medium, $225 / 4 units | Pickup requested; one visit credit reserved |
| blake3 | Big, $399 / 10 units | Pickup confirmed; one visit credit reserved |
| blake4 | Small, $125 / 2 units | Completed pickup; stored totes; ready for return |
| blake5 | Medium, $225 / 4 units | Return in progress; totes in transit |
| blake6 | Big, $399 / 10 units | Stored totes; included credits exhausted |
| blake7 | Medium, $225 / 4 units | Active paid term with cancellation scheduled; stored totes |
| blake8 | Small, $125 / 2 units | Past due; stored totes; new booking blocked |

All inventory, addresses, balances and subscriptions are fictional and labeled TEST.
The XL fixture tote consumes two storage units. Fake service area `00000` has test
windows 5, 7, 10 and 14 days after creation. Completed pickup history is dated seven
days earlier. The exhausted balance includes an explicit synthetic prior-usage ledger
adjustment. Both portal contracts and legacy staff subscriptions are seeded.

Customer email addresses are `thefirebuilds+totekeeper-blake1@gmail.com`, etc.
These operator-owned fixture aliases are preverified so customer login works; global
verification, staff MFA and authorization rules stay in force. Optional service reminders
are disabled. Creation sends no emails and queues no notifications. Subsequent manual
workflow actions may send required transactional mail to these aliases in the operator's
Gmail inbox through the normal worker.

No Stripe customer, price, subscription, invoice or checkout is created or linked.
Amounts and paid/past-due states are local fixtures, not payment verification. Test
offerings and legacy plans remain drafts and cannot be purchased publicly. Payment
checkout, provider billing management and provider cancellation cannot be tested with
these rows; use separately enrolled Stripe sandbox customers for those integrations.
In particular blake6 has no purchasable paid extra visit configured. blake7 represents
the state after cancellation scheduling; it does not create a provider cancellation event.

Reproduce against a local development database:

```powershell
cd apps/api
$env:DEBUG='true'
$env:USE_SQLITE='true'
python manage.py migrate
python manage.py seed_workflow_customers --mailbox thefirebuilds@gmail.com
python manage.py test portal.test_workflow_customers
```

A non-development MVP server additionally requires `--allow-sandbox-server` and a
configured Stripe sandbox key. Live keys are rejected. The command is atomic, refuses
collisions with unrelated usernames/email aliases and preserves existing fixture
passwords and workflow progress on rerun. It never deletes or resets accounts.
Do not retain these shared-password test accounts when opening the service to customers;
deactivate their Django users before switching to live billing.
