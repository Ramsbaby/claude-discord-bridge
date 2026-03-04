# Disk Alert

## Purpose
Check disk usage every hour at :10 and warn if over 90%.

## Notes
- Use `df -h /` to check root partition
- Output only when over 90%; no output if normal
- Keep warning messages concise
