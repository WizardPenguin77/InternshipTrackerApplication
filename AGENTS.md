# Internship Tracker

This repository is the starting point for a web app that combines an internship
application spreadsheet with a curated jobs feed. The current implementation is
a dependency-free browser prototype so it can be opened locally without a build
step. Application records are stored in `localStorage`; job ingestion is kept
behind a small adapter boundary until a server-side scraper is added.

## Agent roles

- **Explorer (read-only):** inspect the repository, identify relevant files and
  existing conventions, and report areas that should change. Explorer must not
  edit files, commit, or push.
- **Planner (read-only):** design the implementation, data model, UX, and edge
  cases based on the Explorer findings. Planner must not edit files, commit, or
  push.
- **Analyzer (read-only):** inspect available tests and test gaps, then propose
  useful coverage. Analyzer must not edit files, commit, or push.
- **Primary agent:** combine the three reports, implement requested changes,
  verify them when approved, and report remaining risks. The primary agent must
  never commit to or push to GitHub.

All agents should preserve user changes, avoid destructive operations, and leave
Git history untouched. If tests require external dependencies or a server, ask
before installing or running them.

## Product direction

The tracker should support:

1. Logging applications with company, role, location, date, URL, notes, and
   status (`Wishlist`, `Applied`, `Interview`, `Offer`, `Rejected`).
2. Quickly changing status and viewing pipeline counts.
3. Browsing jobs ordered by newest posting date, with source, location, work
   mode, and a direct application link.
4. Refreshing the jobs feed daily once a backend can call Greenhouse/Lever
   adapters. Scraping should respect each provider's terms and rate limits;
   browser code should consume normalized job records rather than scrape pages.
