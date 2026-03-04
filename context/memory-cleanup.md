# Memory Cleanup

## Purpose
Clean up old result files and session data daily at 2:00 AM.

## Notes
- Delete files older than 7 days under ~/claude-discord-bridge/results/ subdirectories
- Remove entries older than 7 days from ~/claude-discord-bridge/state/sessions.json
- Check file count before deletion, summarize cleaned file count
- Use find -mtime +7 to avoid accidentally deleting recent files
