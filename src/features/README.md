# Feature modules

Each implemented capability owns its presentation components, server actions,
validation, queries, and orchestration. App Router files compose those modules;
they do not contain provider credentials or direct cross-tenant data access.

- `catalogue`: products, variants, inventory, and private product media
- `creative-studio`: briefs, AI jobs, generated assets, editing, and approvals
- `campaigns`: draft planning, audiences, budgets, and approved creative selection
- `onboarding`: first organization and business profile creation
- `organizations`: organization membership queries

Provider adapters, BlobStore implementations, authentication, database access,
and tenancy authorization are shared infrastructure under `src/lib`.

Meta publishing, ad spend execution, WhatsApp, CRM, payments, analytics, and
video remain outside the implemented feature surface.
