

## Analysis

**Root cause 1: Login tracking fails for Viewers due to SELECT permission.**
In `useLoginTracking.ts` line 120-131, `logLoginEvent` calls `.insert({...}).select("id, created_at").single()`. The data_log SELECT RLS policy only allows owner/admin/pm roles. So for Viewers (and konstrukters), the insert succeeds but `.select()` fails, throwing an error and preventing the login from being recorded in sessionStorage. The DB dedup check (line 78-84) also fails for the same reason.

**Root cause 2: Session heartbeat works, but login tracking doesn't persist.**
`useSessionTracking.ts` uses client-generated UUIDs and avoids `.select()`, so heartbeats should work for all roles. But `logLoginEvent` breaks, so login counts show 0.

**Root cause 3: Uživatelé tab only sources users from data_log.**
`useUserAnalytics.ts` builds the user list exclusively from `data_log` entries. Users with no successful data_log entries (due to the SELECT failure above) never appear.

## Plan

### 1. Fix login tracking for all roles (`useLoginTracking.ts`)
- Generate a UUID client-side (same pattern as `useSessionTracking.ts`)
- Remove `.select("id, created_at").single()` from the insert call
- For the DB dedup SELECT query (line 78-84): wrap in try/catch and gracefully skip dedup if SELECT fails (Viewers can't read data_log). The tab-level and in-memory guards still prevent duplicates.

### 2. Source user list from profiles table (`useUserAnalytics.ts`)
- Add a query to fetch all users from `profiles` joined with their role from `user_roles`
- Build the initial `userMap` from profiles (all registered users appear by default with 0 stats)
- Then overlay data_log stats on top (actions, logins, sessions)
- Users with no data_log entries show: last_activity = null, total_actions = 0, login info = "Nikdy"
- Sort: users with recent activity first, then alphabetically

### 3. Display improvements in Uživatelé tab (`DataLogPanel.tsx`)
- Show user's full name (from profiles) instead of just email where available
- Show role badge next to user name
- Show "Nikdy" for users who have never logged in
- Show "0 akcí" for users with no tracked actions

**No database migrations needed** — all fixes are client-side code changes.

