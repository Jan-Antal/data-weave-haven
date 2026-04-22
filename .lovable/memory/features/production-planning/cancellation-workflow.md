---
name: Cancellation & Return-to-TPV Workflow
description: Cancelled and returned production items are soft-deleted with badges in TPV List, wiped on re-send
type: feature
---
Cancelled production items: soft-delete (status='cancelled') with red badge `✕ Zrušeno · {reason}` in TPV List, tooltip shows date + user.

Returned-to-TPV items (rework): soft-delete (status='returned', returned_at, returned_by) with **orange #ea580c** badge `↩ Vráceno z výroby` in TPV List, tooltip shows date + user. Available via right-click in WeeklySilos (item + bundle level), InboxPanel, and PlanVyrobyTableView for both `production_schedule` and `production_inbox`. Hidden for is_midflight/is_historical schedule rows.

Re-send from TPV List (`executeSendToProduction`): wipes ALL prior `cancelled` AND `returned` rows for that item_code in both inbox + schedule before inserting new pending — guarantees one current production state per TPV item. Active-status check excludes cancelled+returned via `.not("status","in","(cancelled,returned)")`.

DB triggers `validate_production_schedule_status` and `validate_production_inbox_status` allow status `'returned'`. Schema: `production_schedule.returned_at/returned_by`, `production_inbox.returned_at/returned_by`.
