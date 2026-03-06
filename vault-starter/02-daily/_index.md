# Daily Reports

Morning standups, insights, and daily summaries.

## This Week's Standups

```dataview
TABLE file.cday as "Date"
FROM "02-daily/standup"
SORT file.cday DESC
LIMIT 7
```

## Recent Insights

```dataview
LIST
FROM "02-daily/insights"
SORT file.cday DESC
LIMIT 5
```
