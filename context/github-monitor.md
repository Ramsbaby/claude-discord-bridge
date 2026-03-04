# GitHub Monitor

## Purpose
Check GitHub notifications every hour on the hour and summarize new issues, PRs, mentions, etc.

## Notes
- Use `gh api notifications` command (requires gh CLI authentication)
- If no notifications, output simply: "GitHub: No notifications"
- Avoid excessive output; summarize by title
