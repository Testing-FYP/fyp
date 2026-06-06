# AI Prompts

This folder stores one prompt template per AI interaction. Each prompt file includes the instruction style, output rules, and any dynamic `{{PLACEHOLDER}}` tokens that the route fills before sending it to the AI provider.

| Prompt file | Used by | Purpose |
| --- | --- | --- |
| `generate-budget-filter.txt` | `app/api/generate/route.ts` | Filters real flights, hotels, transport, and place options against the user's budget. |
| `generate-trip-concierge.txt` | `app/api/generate/route.ts` | Generates the trip summary, places to visit, and upsell options. |
| `budget-estimates-daily-cost.txt` | `app/api/budget-estimates/route.ts` | Estimates daily place/activity costs for budget auto-allocation. |
| `surprise-destinations.txt` | `app/api/surprise/route.ts` | Generates surprise destination recommendations. |
| `transport-pricing.txt` | `app/api/transport/route.ts` | Generates destination-specific transport pricing options. |
