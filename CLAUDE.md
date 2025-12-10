**Tools**: gh is available to you for creating issues and any other use.

**Workflow**: Commit and push code on completion of every issue.

**Development**
- Use `npm run dev` for regular development (CSS changes, code updates, etc.)
- Use `npm run dev:fresh` only when starting fresh or after schema changes
- Database location: `.database/v3/d1/miniflare-D1DatabaseObject/18be79d38fd2493c122fe83ebdebd2a91b476bf2c9583d675f2c8071ba86e8ed.sqlite`
- The `.database/` directory is PERSISTENT and tracked in git (only .sqlite file, not -wal/-shm)
- The `.wrangler/` directory is temporary and can be safely deleted
- When using wrangler, start with `npx wrangler`
- **CRITICAL**: Do not empty or delete the `.database/` directory or database file without alerting the user first

**Implementation order**
- Implement in descending order of descending: first achieve successful upload, relationships, linking, visibility of data, ui and entry confirmation and management, then reports, etc.
- Read SYSTEM.md before making logic changes.
