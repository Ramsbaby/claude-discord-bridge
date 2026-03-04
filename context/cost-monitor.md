# Cost Monitor

## Purpose
Every Sunday at 09:00, estimate bot system costs and detect abnormal spending early.

## Cost Structure
| Item | Unit Price | Estimated Monthly Cost |
|------|-----------|----------------------|
| RAG embedding (text-embedding-3-small) | $0.02/1M tokens | ~$0.03 |
| rag-health/security-scan cron | claude -p call (Max subscription) | $0 extra |
| All cron tasks | claude -p call (Max subscription) | $0 extra |

## Warning Thresholds
- Weekly embedding cost > $0.10 -> Anomaly signal (rapid indexing increase)
- Monthly OpenAI API cost > $10 -> Warning
- RAG sources > 500 -> Size review recommended

## Calculation Method
- Embedding tokens = new chunk count x avg 500 tokens
- Cost = tokens / 1,000,000 x $0.02

## Output Format
```
Cost Summary (YYYY-MM-DD)
RAG embedding: $X.XXXX (N chunks x 500 tokens)
Cumulative cron executions: N (claude -p, Max subscription = $0)
Monthly estimate: ~$X.XX
Status: Normal / Warning
```
