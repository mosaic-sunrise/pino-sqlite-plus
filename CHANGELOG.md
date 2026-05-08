# Changelog

## [0.1.1] - 2026-05-08

### Fixed

- Transport flush errors no longer crash the worker — failures are written to stderr and the batch is dropped instead of looping in the timer.
- Removed dead AsyncLocalStorage call in `setupTestContextLogging` that gave the false impression of ALS-based context propagation.
- `schema.createSchema` now validates `tableName`, extracted column names, and JSONPath against strict regexes before interpolating into DDL.

### Changed

- Extracted `parseLevel`, `levelToString`, `extractLevelLabel`, and the `LEVELS` table into a dedicated `levels` module (single source of truth).
- Extracted `parseDuration` into a dedicated `duration` module.
- Documented global-state semantics on `setupTestContextLogging`.

### Added

- Prettier config (semicolons, single quotes, 100 width) and `format` / `format:check` npm scripts.

## [0.1.0] - 2026-04-23

### Added

- Initial release
