# Contributing to CatMap

Thanks for your interest in CatMap! This project is open source and welcomes
bug reports, ideas, and pull requests.

## Getting started

1. Fork the repository and clone your fork.
2. Copy the environment file: `cp .env.example .env`
3. Run locally with Docker:

   ```bash
   docker compose up --build
   ```

   - App: http://localhost:5173
   - API docs: http://localhost:8000/docs

4. Or run backend and frontend separately — see [README.md](README.md).

## Running tests

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

CI also builds the frontend (`npm run build` in `frontend/`).

## Making changes

- Keep pull requests focused — one feature or fix per PR.
- Match existing code style and naming.
- Add or update tests for backend behavior changes.
- Do not commit secrets (`.env`, API keys, `ADMIN_TOKEN`, GA IDs).

## Reporting issues

Use [GitHub Issues](https://github.com/DRYTRIX/CatMap/issues):

- **Bugs** — steps to reproduce, expected vs actual behavior, browser/OS if relevant.
- **Features** — describe the use case and why it helps CatMap users.

For security issues, see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind and
respectful in all project spaces.
