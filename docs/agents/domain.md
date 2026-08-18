# Domain documentation

Engineering skills must use T3 Code's existing documentation model. Do not require or introduce a
parallel `CONTEXT.md`, `CONTEXT-MAP.md`, or ADR hierarchy merely to satisfy a skill convention.

## Read before exploring

- Read `AGENTS.md` for the product principles, architecture summary, repository constraints, and
  core terminology.
- Read `docs/internals/glossary.md` for the canonical domain vocabulary.
- Read the relevant material under `docs/internals/` for architecture and contributor behavior.
- Read the relevant material under `docs/operations/` for operational workflows.
- Read the relevant material under `docs/user/` for shipped user-facing behavior.

## Vocabulary

Use the terms defined by `AGENTS.md` and `docs/internals/glossary.md`. Do not drift to synonyms for
environment, project, thread, turn, provider, client, command, event, projector, reactor, receipt, or
checkpoint when those terms are applicable.

If a feature introduces durable product vocabulary, update the existing glossary. If it changes
user-visible behavior, update `docs/user/`; architecture belongs in `docs/internals/`; operational
runbooks belong in `docs/operations/`.

## Existing decisions

There is currently no dedicated ADR directory. Treat explicit decisions in `AGENTS.md` and relevant
documents under `docs/internals/` as constraints. If future decision records are added using the
repository's own conventions, consult the relevant records rather than assuming a particular path.
