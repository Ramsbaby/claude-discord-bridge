# RAG Health Check

## Purpose
Check RAG indexing system integrity daily at 3:00 AM.

## Check Items
1. **Indexing status**: Last 3 entries in rag-index.log -- no errors and chunk count maintained/increasing
2. **LanceDB size**: Detect abnormal growth (>500MB) or decrease
3. **Tracked file count**: Alert if index-state.json entries are 0

## Normal Criteria
- No "Error" in logs
- Chunk count not decreased from previous day
- LanceDB directory exists

## Output Rules
- Normal: `RAG: OK (XXXX chunks, XXX sources)`
- Warning: `RAG Warning: [issue description]`

## Notes
- L1 task -- results go to file only. Anomalies will be aggregated in next weekly-kpi
- rag-index.mjs runs hourly (cron `0 * * * *`)
