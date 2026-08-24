# Economic attachment storage plan — staging only

Status: implementation prepared, external storage disabled by default.

## Binding decisions

- Render service remains on the **Free** compute plan.
- No Render persistent disk, plan upgrade, payment method, or production change is authorized.
- Production service and real documents remain out of scope.
- Gemini and attachment validation use synthetic documents only.
- The default attachment provider remains `SERVER_FS`.
- R2 is selected only when `ATTACHMENT_STORAGE_PROVIDER=R2` and all four server-side R2 variables are present.
- Missing or invalid configuration fails closed before any external request.

## Why this is economical

The observed staging peak was approximately 137 MiB RAM (about 27% of the 512 MiB Free limit) and approximately 0.0102 CPU against a 0.15 limit. Capacity did not justify a compute upgrade. The missing feature was durable bytes: Render Free has an ephemeral filesystem and does not support persistent disks.

Cloudflare R2 Standard currently includes 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free egress each month. This code does not create an account or bucket and does not enable billable usage.

## Activation boundary

These variables are server-side secrets:

```text
ATTACHMENT_STORAGE_PROVIDER=R2
R2_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<bucket-scoped-access-key>
R2_SECRET_ACCESS_KEY=<bucket-scoped-secret>
R2_BUCKET=<staging-only-standard-bucket>
```

Never use a public browser variable prefix. The token should be scoped to the staging bucket and only the object operations required by the application.

## Synthetic capacity evidence

The CI benchmark calculates conservative document counts using decimal 10 GB storage, one write per document, and four reads per document per month. Approximate storage-bound capacities:

| Synthetic average size | Documents inside 10 GB |
| ---: | ---: |
| 256 KiB | 38,146 |
| 512 KiB | 19,073 |
| 1 MiB | 9,536 |
| 2 MiB | 4,768 |
| 5 MiB | 1,907 |
| 10 MiB (API maximum) | 953 |

These are planning estimates, not a promise of permanent free pricing. Before activation, confirm current pricing and establish usage alerts.

## Rollback

Set `ATTACHMENT_STORAGE_PROVIDER=SERVER_FS` (or remove it) and redeploy staging. Existing R2 metadata remains authoritative and must not be silently relabeled; a migration/export procedure is required before retiring an active provider.
