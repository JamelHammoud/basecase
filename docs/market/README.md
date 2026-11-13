# Market

What the rest of the field does, who Basecase could work with, and what to build because of it. The market lane (`tools/loop/lanes/market.mjs`, brief in `tools/loop/briefs/market.md`) checks these pages once a day and proposes steps to the product lead as `loop:idea` issues.

| File | Holds |
|---|---|
| [competitors.md](competitors.md) | Tools a Basecase user could pick instead, by stage |
| [partners.md](partners.md) | Part makers, printer makers, kit makers, suppliers and platforms to work with |
| [integrations.md](integrations.md) | Imports, exports and services Basecase connects to, and how far each one goes |
| [accounts.md](accounts.md) | Accounts the lane holds: service, email, plan and date, never a secret |

## Entry format

```md
### Name

- **Link:** https://example.com
- **Checked:** 2026-11-12
- **Better than Basecase:** what they do better, each claim with a link ([source](https://example.com/page))
- **Worse than Basecase:** what Basecase does better, with a link to them and to the guide that shows it
- **Basecase should:** match it, beat it or integrate, and how, in one or two sentences
```

## Rules

- Every claim links to the page that says it. If the page doesn't say it, the claim goes. A claim about Basecase links to its guide or code.
- **Checked** is the date someone last fetched the pages behind the entry. Update an entry in place; git keeps the history.
- Names under **To check** have no entry yet.
- Accounts are free tiers or free trials only, as `jamel+<partner>@basecase.so`. Passwords live in the macOS keychain under `basecase-market-<partner>`, never in the repo. Paying, contracts and identity documents are for Jamel to decide.
