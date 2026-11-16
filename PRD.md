# TailorPro — Master Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Approved for technical planning and implementation  
**Initial Market:** Malawi  
**Product Type:** Multi-tenant SaaS  
**Platform:** Mobile-first Progressive Web Application (PWA)

---

# 1. Product Overview

## 1.1 Product Name

TailorPro (working name).

## 1.2 Product Vision

Build an affordable, simple, reliable digital management platform that helps individual tailors and small tailoring businesses manage customers, body measurements, garment orders, production deadlines, payments, and customer communication.

The platform replaces unreliable paper-based recordkeeping with secure digital records while remaining usable in environments with unreliable internet connectivity.

## 1.3 Problem Statement

Many local tailoring businesses rely on physical notebooks to manage customer measurements and orders.

This creates several problems:

- Customer records can be lost or damaged.
- Previous measurements are difficult to retrieve.
- Order deadlines are forgotten.
- Production progress is difficult to monitor.
- Deposits and outstanding balances can be mismanaged.
- Customer communication is inconsistent.
- Business owners lack visibility into their operations.

TailorPro will address these problems through one integrated application.

## 1.4 Product Objectives

1. Digitize customer and measurement records.
2. Make customer information easy to retrieve.
3. Improve order and production tracking.
4. Reduce missed collection deadlines.
5. Improve payment recordkeeping.
6. Support essential offline operations.
7. Protect business data through cloud storage and backup.
8. Establish a scalable subscription business.

## 1.5 Target Market

Initial target:

- Individual tailors.
- Small tailoring shops.
- Tailoring businesses with multiple workers.

Initial geographical market: Malawi.

Future expansion: Other African markets.

---

# 2. Product Scope

## 2.1 MVP Modules

1. Authentication and business registration.
2. Business workspace management.
3. Dashboard.
4. Customer management.
5. Measurement management.
6. Garment and order management.
7. Production workflow.
8. Deadline and reminder management.
9. Payment management.
10. WhatsApp message preparation.
11. Offline data management.
12. Cloud synchronization.
13. Security and backup.
14. Subscription management foundation.

## 2.2 Out of Scope for MVP

Do not implement these features in the first release:

- AI garment design generation.
- Customer-facing mobile application.
- Automated WhatsApp messaging.
- Automated SMS services.
- Mobile money payment gateway integration.
- Advanced inventory management.
- Multi-branch management.
- Advanced accounting.
- Payroll.
- Complex AI forecasting.

Keep the architecture extensible without implementing these prematurely.

---

# 3. User Roles and Permissions

## 3.1 Platform Administrator

Responsible for platform-level management.

Permissions:

- View registered businesses.
- Manage subscription plans.
- Manage platform configuration.
- Monitor system health.
- Suspend or reactivate accounts according to documented policies.
- View aggregated platform statistics.

Platform administrators must not automatically have unrestricted access to customers' personal measurements or payment details.

Any exceptional support access must be authorized, logged, and limited.

## 3.2 Business Owner

Permissions:

- Manage business profile.
- Manage customers.
- Manage measurements.
- Create and manage orders.
- Record payments.
- View business reports.
- Manage subscription.
- Eventually invite workers.

## 3.3 Tailor / Staff

For future multi-user support:

- View authorized customers.
- Record measurements.
- Create and update orders.
- Update production status.
- View authorized payment information.

Business owners must control staff permissions.

The initial MVP may operate with one user per business, but the database must support multiple users belonging to one workspace.

---

# 4. Functional Requirements

## 4.1 Authentication and Registration

Users must be able to:

- Register with name, email or supported phone-based identity.
- Authenticate securely.
- Create a business workspace.
- Log out.
- Recover account access.
- Manage their profile.

Business registration fields:

- Business name.
- Owner name.
- Phone number.
- Email (optional where appropriate).
- Physical location.
- Country.
- Currency.
- Business type.

Initial currency: MWK.

Each business receives a unique workspace ID.

## 4.2 Business Workspace Isolation

The system must use a multi-tenant architecture.

Every business-owned record must contain a workspace identifier.

Requirements:

- A user must only access authorized workspaces.
- Database-level authorization must enforce tenant isolation.
- Backend APIs must validate workspace membership.
- Frontend filtering alone is insufficient.
- Storage files must follow equivalent access restrictions.
- Cross-tenant access attempts must fail.

Use PostgreSQL Row Level Security (RLS) where appropriate.

Write automated tests proving that Business A cannot retrieve or modify Business B's records.

## 4.3 Customer Management

Each customer must have:

- Unique ID.
- Full name.
- Phone number.
- Optional email.
- Optional address.
- Notes.
- Creation date.
- Last updated date.

Features:

- Register customer.
- Edit customer.
- Search by name or phone.
- View customer history.
- View previous orders.
- View measurement history.
- Archive customer.
- Restore archived customer where permitted.

Prevent accidental duplicate customers by checking phone numbers and warning about possible matches.

Do not assume phone numbers are globally unique across businesses.

## 4.4 Measurement Management

Measurements must support different garment types.

Initial templates:

- Shirt.
- Trousers.
- Dress.
- Suit.
- Traditional clothing.
- Custom garment.

Each measurement template should define:

- Measurement name.
- Display label.
- Measurement unit.
- Required or optional status.
- Display order.

Initial measurement unit: centimetres.

Support custom measurement fields and configurable templates.

Example shirt measurements:

- Chest.
- Shoulder.
- Neck.
- Sleeve length.
- Shirt length.
- Waist.
- Wrist.

Example trouser measurements:

- Waist.
- Hip.
- Thigh.
- Knee.
- Trouser length.
- Inseam.
- Bottom opening.

Important requirements:

1. A customer can have multiple measurement profiles.
2. A customer can have measurement history.
3. Measurements can be copied into a new order.
4. Measurements can be updated independently.
5. Old measurements must remain accessible.
6. Each order must store an immutable snapshot of the measurements used at creation.
7. Measurement units must be explicit.
8. The system must not silently convert or reinterpret measurement values.

## 4.5 Garment and Order Management

Every order must include:

- Unique order number.
- Customer ID.
- Workspace ID.
- Garment type.
- Garment description.
- Quantity.
- Reference image (optional).
- Measurement snapshot.
- Agreed price.
- Order creation date.
- Promised collection date.
- Current production status.
- Notes.
- Payment summary.

Support multiple garments in one customer order.

The data model should distinguish an order from its individual garment items.

Example:

Order ORD-0001:

- Two shirts.
- One pair of trousers.
- One agreed collection date.
- Individual garment descriptions and quantities.

Do not assume all garments in an order necessarily have identical measurements.

## 4.6 Order Status Workflow

Initial statuses:

1. Received.
2. Cutting.
3. Sewing.
4. Finishing.
5. Ready for collection.
6. Collected.
7. On hold.
8. Cancelled.

Requirements:

- Tailor can update status.
- Status changes must be timestamped.
- Record the user who made the change.
- Display status history.
- Support notes for status changes.

A collection deadline must never automatically change an order to Ready for Collection.

Only an authorized user can confirm that a garment is ready.

Cancelled orders must retain their historical payment records.

## 4.7 Deadline Management

Dashboard categories:

- Due today.
- Due tomorrow.
- Due within seven days.
- Upcoming.
- Overdue.
- Ready for collection.

The system must calculate deadline categories using the business's configured timezone.

Initial timezone: Africa/Blantyre.

Provide visual indicators for urgent orders.

A future Workload Assistant may identify orders at risk based on remaining work and available capacity.

For the MVP, use transparent rules rather than AI predictions.

## 4.8 Dashboard

The dashboard should display:

- Total active customers.
- Orders received today.
- Active orders.
- Orders due today.
- Orders due tomorrow.
- Overdue orders.
- Ready for collection.
- Outstanding balances.
- Recent activity.

Every metric must be calculated from actual database records.

Dashboard values must update after relevant operations and after synchronization.

Provide an empty state for new businesses.

## 4.9 Payment Management

Support:

- Cash.
- Bank transfer.
- Mobile money.
- Other configurable payment methods.

Each payment must have:

- Unique transaction ID.
- Workspace ID.
- Order ID.
- Amount.
- Payment method.
- Transaction date.
- Optional reference.
- Recorded-by user.
- Optional notes.

Financial rules:

Total paid = Sum of valid payment transactions.

Outstanding balance = Order total - Total paid.

Do not allow an ordinary payment transaction to silently overwrite an earlier payment.

Implement explicit correction, reversal, or refund transactions with an audit trail.

Validate:

- Payment amount must be positive.
- Payment cannot exceed the remaining balance unless overpayments are explicitly supported and correctly accounted for.
- Currency must match the order currency.
- Cancelled orders must retain payment history.

Generate printable receipts.

The MVP is a payment-recording tool, not a complete accounting system.

## 4.10 WhatsApp Integration

The MVP should support click-to-send WhatsApp messages.

Message templates:

- Order confirmation.
- Deposit confirmation.
- Garment ready for collection.
- Collection reminder.
- Order delay notification.
- Outstanding balance reminder.

Requirements:

- Prepare a message using actual customer and order data.
- Open the WhatsApp conversation through an appropriate supported link.
- Let the tailor review and send the message.
- Never claim that a message was delivered merely because WhatsApp opened.

The system must not automatically send messages in the MVP.

## 4.11 Reference Images

Allow attaching optional images to orders.

Examples:

- Customer design reference.
- Fabric pattern.
- Garment style.
- Finished garment photograph.

Requirements:

- Validate file type and size.
- Compress large images.
- Use secure object storage.
- Enforce workspace access restrictions.
- Support offline upload queues.
- Preserve image-to-order relationships.

---

# 5. Offline-First Architecture

Offline operation is a core product requirement.

Do not treat it as a feature to add at the end.

## 5.1 Technology

Proposed:

- PWA.
- IndexedDB.
- Dexie.js.
- Service Worker.
- Custom synchronization API.
- PostgreSQL as the authoritative cloud database.

## 5.2 Offline Capabilities

The following must work offline after the relevant data has been downloaded:

- View customer records.
- Search locally available customers.
- View measurement records.
- Create customers.
- Edit customers.
- Create orders.
- Record payments.
- Update production statuses.
- View locally available order history.

The application must display synchronization status.

Suggested states:

- Saved locally.
- Pending synchronization.
- Synchronizing.
- Synchronized.
- Synchronization failed.
- Conflict requires attention.

## 5.3 Synchronization Engine

Implement a reliable synchronization system.

Requirements:

1. Generate UUIDs on the client.
2. Save changes locally before reporting successful local persistence.
3. Maintain an outbox of pending operations.
4. Synchronize when connectivity returns and when the application is opened.
5. Use idempotency keys.
6. Retry failed operations safely.
7. Track server acknowledgments.
8. Prevent duplicate records.
9. Handle interrupted uploads.
10. Detect conflicting modifications.

Do not rely exclusively on browser background sync because browser support varies.

Implement foreground synchronization and retry mechanisms.

## 5.4 Conflict Resolution

Do not blindly use last-write-wins for all data.

Define explicit conflict rules:

- Independent records should synchronize independently.
- Payment transactions should be append-only.
- Order history should be preserved.
- Measurement changes must retain history.
- Concurrent edits to important order fields should be detected.
- Conflicts requiring business decisions should be presented to the user.

The user must never silently lose a payment or important measurement change.

## 5.5 Data Synchronization Security

- Authenticate synchronization requests.
- Verify workspace membership server-side.
- Validate every operation.
- Reject unauthorized record IDs.
- Prevent cross-tenant synchronization.
- Never trust client-provided workspace IDs without authorization checks.

## 5.6 Offline Acceptance Tests

Test:

- Create an order offline.
- Close the browser.
- Restart the device.
- Reopen the application.
- Confirm the order remains available.
- Restore internet.
- Confirm successful synchronization.
- Repeat synchronization.
- Confirm no duplicate order is created.
- Simulate network interruption during synchronization.
- Confirm safe retry.
- Simulate simultaneous edits from two devices.
- Confirm conflict handling.

---

# 6. Proposed Database Architecture

Use PostgreSQL.

Recommended initial entities:

1. users
2. businesses
3. business_members
4. subscription_plans
5. subscriptions
6. customers
7. measurement_templates
8. measurement_template_fields
9. customer_measurements
10. measurement_values
11. orders
12. order_items
13. order_measurement_snapshots
14. order_status_history
15. payments
16. payment_adjustments
17. order_attachments
18. notification_templates
19. reminder_events
20. audit_logs
21. synchronization metadata

Important design requirements:

- UUID primary keys.
- Workspace foreign keys on tenant-owned records.
- Appropriate indexes.
- Referential integrity.
- Created and updated timestamps.
- Archival/deletion metadata.
- Database constraints for financial invariants.
- Version fields for synchronization.
- Unique idempotency identifiers for transactional operations.

Use migrations for all schema changes.

Do not manually modify production database structures without migrations.

The developer must produce a documented entity relationship diagram before completing the database implementation.

---

# 7. Security and Privacy

Implement:

- Secure authentication.
- Password recovery.
- Role-based authorization.
- PostgreSQL RLS.
- Secure storage policies.
- HTTPS.
- Input validation.
- Rate limiting.
- Audit logging.
- Secure session handling.
- Protection against common web vulnerabilities.
- Regular backups.
- Documented recovery procedures.

Measurements and customer details are sensitive business records.

Do not expose them through public URLs or unrestricted storage buckets.

Implement account deletion and data export policies that respect legal obligations and financial record retention requirements.

Review applicable Malawi data protection requirements before launch.

---

# 8. Subscription and SaaS Architecture

The platform must support multiple subscription plans.

Proposed plans:

### Free

- Limited active orders.
- Basic customer management.
- Basic measurements.
- Essential dashboard.

### Solo

- Higher order limits.
- More customer records.
- Full measurement history.
- Payment tracking.
- Deadline reminders.
- Cloud backup.

### Shop

- Multiple authorized workers.
- Shared records.
- Role-based access.
- Advanced reports.

Pricing must be validated with real Malawi tailors.

Use MWK initially.

The architecture must support monthly and annual billing.

## 8.1 Subscription Rules

- Subscription status must be stored centrally.
- Plan limits must be enforced server-side.
- Expired subscriptions must not erase historical data.
- Users must receive appropriate renewal notifications.
- Grace periods must be configurable.
- Platform administrators must be able to manage plans.

Initially, support manually verified subscription payments.

Do not implement a payment gateway until a suitable provider and integration have been evaluated.

---

# 9. User Interface Requirements

Design principles:

- Mobile-first.
- Simple navigation.
- Large touch targets.
- Readable typography.
- Fast forms.
- Minimal unnecessary screens.
- Clear status indicators.
- Accessible colour contrast.
- Consistent design system.

Primary navigation:

1. Dashboard.
2. Customers.
3. Measurements.
4. Orders.
5. Payments.
6. Settings.

Provide prominent quick actions:

- Add customer.
- Create order.
- Record payment.
- Search customer.

The application should be usable by someone with basic smartphone skills.

Avoid complex accounting-style interfaces.

Support responsive desktop layouts without compromising the mobile experience.

---

# 10. Reports and Business Insights

MVP reports:

- Orders received by period.
- Orders completed by period.
- Orders currently active.
- Overdue orders.
- Revenue collected.
- Outstanding balances.
- Payment history.

Clearly distinguish:

- Order value.
- Cash collected.
- Outstanding customer balances.
- Actual business profit.

Do not label revenue as profit.

Advanced expense tracking and profitability analysis are future features.

---

# 11. Performance and Reliability Requirements

Proposed acceptance targets:

- Common application interactions should feel responsive on typical Android devices.
- Cached customer searches should work without network requests.
- Local records should be persisted before showing a successful-save confirmation.
- Dashboard queries should be appropriately indexed.
- Images should be optimized.
- Synchronization should recover from temporary connectivity failures.
- Critical operations must not lose data after application restart.

Test using realistic low-end Android devices and limited network conditions.

Do not claim offline reliability based only on desktop browser tests.

---

# 12. Testing Strategy

## Unit Tests

Test:

- Payment calculations.
- Order status transitions.
- Deadline calculations.
- Measurement validation.
- Subscription limits.
- Synchronization conflict rules.

## Integration Tests

Test:

- Authentication.
- Workspace creation.
- Customer registration.
- Measurement management.
- Order creation.
- Payment recording.
- File access restrictions.
- Cloud synchronization.

## Security Tests

Test:

- Cross-tenant access.
- Unauthorized workspace access.
- Storage access restrictions.
- API authorization.
- Privilege escalation.
- Payment manipulation.

## End-to-End Tests

Test complete user journeys:

1. Register a business.
2. Create a customer.
3. Record measurements.
4. Create an order.
5. Record a deposit.
6. Update production status.
7. Mark the garment ready.
8. Prepare a WhatsApp notification.
9. Record final payment.
10. Mark the order collected.

## Offline Tests

Execute the offline acceptance scenarios defined in Section 5.

All critical financial, security, and data integrity tests must pass before production release.

---

# 13. Deployment and Operations

Prepare:

- Development environment.
- Staging environment.
- Production environment.
- Environment variable management.
- Database migration workflow.
- Automated testing pipeline.
- Backup strategy.
- Monitoring.
- Error logging.
- Recovery documentation.

Use separate credentials and databases for development, staging, and production.

Document backup frequency, retention, and restoration procedures.

A backup is not considered verified until restoration has been tested.

---

# 14. Phased Implementation Plan

Claude Code must implement the product in controlled phases.

## Phase 0 — Technical Planning

- Review the complete PRD.
- Identify missing requirements.
- Evaluate the proposed technology stack.
- Identify architectural risks.
- Produce the architecture document.
- Produce the database ERD.
- Produce the security model.
- Produce the synchronization design.
- Produce the implementation plan.

Do not begin full implementation before this review.

## Phase 1 — Foundation

- Project initialization.
- Design system.
- Authentication.
- Business registration.
- Multi-tenant architecture.
- Database migrations.
- RLS policies.
- Basic dashboard.

## Phase 2 — Customer and Measurement Management

- Customer registration.
- Customer search.
- Measurement templates.
- Measurement records.
- Measurement history.
- Measurement snapshots.

## Phase 3 — Orders and Production

- Order creation.
- Multiple garment items.
- Reference images.
- Production workflow.
- Deadline dashboard.
- Status history.

## Phase 4 — Payments and Communication

- Payment recording.
- Balance calculations.
- Receipts.
- Payment history.
- WhatsApp message preparation.

## Phase 5 — Offline Engine

- IndexedDB implementation.
- Local persistence.
- Outbox.
- Synchronization API.
- Conflict detection.
- Retry handling.
- Multi-device synchronization.
- Offline acceptance testing.

## Phase 6 — SaaS Management

- Subscription plans.
- Plan limits.
- Subscription lifecycle.
- Platform administration.
- Business settings.

## Phase 7 — Testing and Release Preparation

- Security testing.
- Performance testing.
- End-to-end testing.
- Backup restoration testing.
- Low-end device testing.
- Pilot preparation.
- Deployment documentation.

---

# 15. Product Success Metrics

Initial pilot goals:

- 10 pilot businesses.
- At least 80% weekly active usage.
- At least 80% of new orders recorded digitally.
- At least 99% successful synchronization after retries.
- Zero duplicate orders caused by synchronization.
- At least five pilot businesses willing to pay.

Review these targets after 4–6 weeks of pilot operation.

Measure retention, subscription conversion, support requirements, and actual operating costs before scaling.

---

# 16. Critical Instructions to Claude Code

Act as a senior SaaS architect, product engineer, database engineer, security engineer, and quality assurance specialist.

Your responsibility is not merely to produce code that appears functional.

You must deliver a reliable, testable implementation that follows this PRD.

Mandatory instructions:

1. Critically review the PRD before implementation.
2. Identify contradictions and missing requirements.
3. Do not silently remove requirements.
4. Challenge unnecessary architectural complexity.
5. Never claim a feature is complete without implementation and verification.
6. Do not use mock data as proof of functionality.
7. Do not weaken authorization to make development easier.
8. Never rely on frontend-only tenant isolation.
9. Treat offline synchronization as a core architectural responsibility.
10. Never silently overwrite financial transactions.
11. Write automated tests for critical business rules.
12. Use migrations for database changes.
13. Document important technical decisions.
14. Keep development phases independently testable.
15. Maintain a clear implementation progress document.
16. Do not expose secrets in source code.
17. Do not deploy unverified code to production.

After each phase:

- Run relevant tests.
- Inspect failures.
- Correct defects.
- Document what was implemented.
- Document what remains.
- Provide evidence of verification.

If an external service requires credentials, explain precisely what is needed and provide a safe setup procedure.

Do not invent API credentials or claim integrations work without testing them.

## Final Definition of Done

TailorPro is not production-ready simply because the application starts.

Production readiness requires:

- Functional customer management.
- Correct measurement history.
- Reliable order management.
- Correct payment calculations.
- Working deadline management.
- Enforced tenant isolation.
- Tested offline persistence.
- Verified synchronization.
- Tested backup restoration.
- Successful critical security tests.
- Successful end-to-end workflows.
- Deployment and recovery documentation.

**End of PRD.**