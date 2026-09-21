# Backend Data Contract

## Purpose

Define the data model and permissions for the Internship Tracker's future Supabase backend.

Core principles:

- Shared jobs are canonical, read-only records for users.
- User tracking data belongs only to the authenticated user.
- Saved state and application status are separate.
- Google authentication identifies users.
- Row Level Security enforces ownership.
- Custom jobs remain private.

## Authentication

- Use Supabase Auth with Google OAuth.
- Each authenticated user is identified by their Supabase user ID.
- Unauthenticated users may browse the daily job listing but cannot save, track, or create jobs.
- Secret and service-role keys must never be exposed in browser code.
- Database policies must enforce authorization rather than relying only on the client.

## Shared Jobs

The `jobs` table contains canonical daily listings.

Expected fields:

- `id`
- `provider`
- `provider_job_id`
- `company`
- `role`
- `location`
- `work_mode`
- `description`
- `application_url`
- `posted_at`
- `first_seen_at`
- `last_seen_at`
- `is_active`
- `created_at`
- `updated_at`

Rules:

- Provider and provider job ID should prevent duplicate ingestion.
- Users may read jobs but may not create, edit, or delete them.
- Daily refreshes update existing records instead of creating duplicates.
- Scraper failures must not erase previously valid jobs.
- Inactive jobs remain visible in the daily listing.
- Relative dates are display-only; `posted_at` is the canonical timestamp.

## User Job Tracking

The `user_jobs` table stores each user's relationship to a shared or custom job.

Expected fields:

- `id`
- `user_id`
- Nullable `job_id`
- `is_saved`
- `status`
- `application_date`
- `notes`
- `next_step`
- `company`
- `role`
- `location`
- `application_url`
- `created_at`
- `updated_at`

Rules:

- Every record belongs to exactly one authenticated user.
- A user may have only one tracking record per shared job.
- A custom job has a null `job_id` and is stored in `user_jobs`.
- `is_saved` is independent from application `status`.
- Application statuses are `Applied`, `Interview`, `Offer`, and `Rejected`.
- Users may override `role` and `location` in `user_jobs` only.
- User overrides never modify the shared daily listing.
- Removing saved state does not delete status, notes, or application history.
- Deleting a `user_jobs` record removes it from the user's personal list.
- Deleting a `user_jobs` record never deletes the shared job.
- Deleted tracking records may be recreated from the daily listing or as a new custom job.

## Custom Jobs

Custom jobs are private `user_jobs` records with no shared `job_id`.

They:

- Require company, role, and a valid HTTP(S) application URL unless otherwise documented.
- Are visible only to their owner.
- Do not appear in the shared daily listing automatically.
- May be deleted from the owner's personal list without affecting shared jobs.

## Daily Feed Overlay

The daily listing is assembled by:

1. Reading shared `jobs`.
2. Reading the current user's matching `user_jobs`, when authenticated.
3. Overlaying that user's saved state, application status, and permitted role/location overrides.
4. Leaving the shared job record unchanged.

Unauthenticated users see the shared listing without a personal overlay and cannot create one.

Marking a job as saved or applied updates `user_jobs`, never `jobs`.

## Permissions

| Resource | Anonymous | Authenticated user | Backend ingestion |
|---|---|---|---|
| `jobs` | Read only | Read only | Create, update, archive |
| Own `user_jobs` | No access | Read, create, update, delete | No access unless explicitly required |
| Other users' `user_jobs` | No access | No access | No access |
| Profile data | No access | Own profile only | No access unless explicitly required |

Required security rules:

- Enable RLS on every exposed table.
- Private records must require `user_id = auth.uid()`.
- Users must never write to canonical shared jobs.
- Database constraints must enforce valid statuses and ownership.

## Acceptance Criteria

The implementation must eventually verify that:

- Anonymous users can read shared jobs but cannot access private tracking data.
- User A cannot read or modify User B's tracking records.
- Authenticated users can read shared jobs but cannot modify them.
- Saving the same shared job twice is idempotent.
- Custom jobs remain private.
- Users can override role and location only in their own tracking records.
- Unsaving preserves application history.
- Deleting a personal tracking record removes it from the personal list only.
- User-specific state appears correctly over shared jobs.
- Invalid statuses and malformed URLs are rejected.
- Job refreshes do not create duplicate provider listings.
- Existing jobs remain visible when they become inactive or when ingestion fails.

