# TailorPro: entity-relationship diagram

> **Generated** by `npm run docs:erd` from the live database. **Do not edit by hand.**
> `tests/integration/erd.test.ts` fails when the schema changes and this file is not regenerated.
> Shows the `public` schema as of the latest migration. Primary key = PK, foreign key = FK.
> Every relationship is drawn as many-to-one (child `}o--||` parent); uniqueness rules such as one active owner per
> workspace and one subscription per workspace are enforced in the database and described in `DATABASE_SCHEMA.md`.

```mermaid
erDiagram
  audit_logs {
    uuid id PK
    uuid workspace_id FK
    uuid actor_id FK
    text action
    text entity
    uuid entity_id "nullable"
    jsonb diff
    timestamptz created_at
  }
  business_members {
    uuid workspace_id PK
    uuid user_id PK
    text role
    jsonb permissions
    text status
    timestamptz created_at
    timestamptz updated_at
    integer version
  }
  businesses {
    uuid id PK
    text name
    text owner_name
    text phone
    text email "nullable"
    text location
    char country
    char currency FK
    text business_type
    text timezone
    text logo_path "nullable"
    text status
    uuid created_by FK
    timestamptz created_at
    timestamptz updated_at
    integer version
    timestamptz archived_at "nullable"
    uuid archived_by FK
  }
  currencies {
    char code PK
    text name
    smallint minor_unit_exponent
    boolean enabled
  }
  platform_admins {
    uuid user_id PK
    timestamptz created_at
  }
  platform_settings {
    text key PK
    jsonb value
    text description
    timestamptz updated_at
  }
  profiles {
    uuid id PK
    text full_name
    text phone_e164 "nullable"
    text email "nullable"
    text locale
    timestamptz created_at
    timestamptz updated_at
    integer version
  }
  subscription_plans {
    uuid id PK
    text code
    text name
    jsonb limits
    boolean limits_approved
    bigint price_minor_monthly "nullable"
    bigint price_minor_annual "nullable"
    char currency FK
    boolean active
    timestamptz created_at
    timestamptz updated_at
    integer version
  }
  subscriptions {
    uuid id PK
    uuid workspace_id FK
    uuid plan_id FK
    text status
    text billing_period "nullable"
    timestamptz current_period_start "nullable"
    timestamptz current_period_end "nullable"
    timestamptz grace_ends_at "nullable"
    timestamptz created_at
    timestamptz updated_at
    integer version
  }
  audit_logs }o--|| profiles : "actor_id"
  audit_logs }o--|| businesses : "workspace_id"
  business_members }o--|| profiles : "user_id"
  business_members }o--|| businesses : "workspace_id"
  businesses }o--|| profiles : "archived_by"
  businesses }o--|| profiles : "created_by"
  businesses }o--|| currencies : "currency"
  platform_admins }o--|| profiles : "user_id"
  subscription_plans }o--|| currencies : "currency"
  subscriptions }o--|| subscription_plans : "plan_id"
  subscriptions }o--|| businesses : "workspace_id"
```

## Links to the authentication system
- `profiles.id` references `auth.users.id` (Supabase Auth, outside the `public` schema).
