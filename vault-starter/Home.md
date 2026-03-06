# Jarvis Vault

Welcome to your AI-managed knowledge base.

## Quick Links

- [[01-system/_index|System Status]]
- [[02-daily/_index|Daily Reports]]
- [[03-teams/_index|Team Reports]]
- [[06-knowledge/_index|Knowledge Base]]

## Recent Daily Reports

```dataview
TABLE file.cday as "Date"
FROM "02-daily/standup"
SORT file.cday DESC
LIMIT 7
```

## Team Activity

```dataview
TABLE file.cday as "Updated"
FROM "03-teams"
WHERE file.name != "_index"
SORT file.cday DESC
LIMIT 10
```
