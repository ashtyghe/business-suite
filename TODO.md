# Todo List

## Cleanup
- [x] Extract Notes tab (~210 lines) from JobDetail — tightly coupled with modals
- [x] Remove duplicate declarations in monolith causing esbuild build failure (~5,000 lines removed)
- [x] Restore missing HamburgerIcon component (lost during page extraction)
- [x] Add missing StatusBadge import in monolith
- [x] Add missing Fragment import in Dashboard

## Features
- [ ] Digital asset management (DAM) for templates, contracts, compliance docs
- [ ] Drag-and-drop reordering for job phases and tasks
- [ ] Notifications system (in-app + push) for overdue invoices, expiring docs, job updates

## Integrations
- [ ] Webhook support for real-time Xero payment status updates (replace polling)

## Technical Debt
- [ ] Unit and integration tests for critical flows (quoting, invoicing, bill extraction)
- [x] Replace inline styles with CSS modules
- [ ] Optimistic UI updates for better perceived performance
