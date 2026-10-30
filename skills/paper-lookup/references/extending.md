# Adding a database

This skill is designed to grow. Each database is a self-contained file in `references/`.

To add one:

1. Create `references/<name>.md` following the shape of the existing files: base URL, auth, key endpoints with parameter tables, example calls, response shape, pagination and count behavior, rate limits, identifier conventions, and known hazards.
2. Add a row to the Route table and an entry to the Databases index in `SKILL.md`.
3. If the new API paginates, add an adapter to `scripts/paginate.py` and a case to whatever test suite the host keeps for this skill.

Run every call you document and record what came back, including the failure modes — the hazard sections in these files are the part that earns the skill its keep.
