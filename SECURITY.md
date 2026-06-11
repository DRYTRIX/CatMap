# Security Policy

## Reporting a vulnerability

If you discover a security issue in CatMap, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Use [GitHub Security Advisories](https://github.com/DRYTRIX/CatMap/security/advisories/new)
   to report privately, or contact the maintainers via [drytrix.com](https://drytrix.com).

We will acknowledge your report and work on a fix as quickly as possible.

## Abuse and moderation

CatMap is a public, anonymous map. To report inappropriate sightings (spam, not a
cat, offensive content):

- Use the **Report** button on any sighting in the app.
- Sightings are auto-hidden after multiple reports from distinct devices.

Server operators can moderate via the admin API when `ADMIN_TOKEN` is configured
(see [README.md](README.md)).

## Supported versions

Security fixes are applied to the `main` branch. Deploy the latest commit to
production after updates.
