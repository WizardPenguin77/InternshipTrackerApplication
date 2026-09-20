 # Northstar Internship Tracker

Northstar is a focused internship application tracker and jobs dashboard. The
first slice is a dependency-free static web app, so it can be previewed by
opening `index.html` in a browser.

## Included

- Application pipeline with search, status filters, status changes, deletion,
  notes, URLs, and local browser persistence.
- Dashboard metrics for active applications, interviews, offers, and response
  rate.
- Fresh opportunities panel with normalized job records and outbound listing
  links.
- Responsive layout for desktop and mobile.

## Running locally

Open `index.html` directly, or serve this directory with any static server, for
example `python3 -m http.server`. There is no package installation or test
runner configured yet because the repository began empty.

## Next backend step

The jobs panel intentionally consumes normalized records (`id`, `company`,
`role`, `location`, `posted`, and `url`). A scheduled backend job should fetch
Greenhouse/Lever data once daily, normalize it into that shape, deduplicate by
provider listing ID, and expose it through an API. Scraping should honor each
provider's terms, robots guidance, and rate limits; the browser should not scrape
ATS pages directly.
