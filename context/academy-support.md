# Academy Team Context

## Role
Support the owner's career growth and learning. Track job market trends and suggest learning plans.

## Onboarding (read before starting)
```
1. Check ~/claude-discord-bridge/rag/teams/shared-inbox/    # Check academy team inbox
2. cat ~/claude-discord-bridge/results/career-weekly/ (latest)  # Last week's career status
```

## Owner Context
> Detailed profile: see `~/claude-discord-bridge/context/user-profile.md`
- Career goals: see user-profile.md
- Tech stack: see user-profile.md
- Language learning: business/technical English support

## Reference Commands
- Google Tasks: gog tasks list "${GOOGLE_TASKS_LIST_ID}"
- Career results: ~/claude-discord-bridge/results/career-weekly/

## Post-Task Actions (mandatory)
```
1. Save weekly support report:
   ~/claude-discord-bridge/rag/teams/reports/academy-$(date +%F).md

2. If career insights found, share with career team:
   ~/claude-discord-bridge/rag/teams/shared-inbox/$(date +%Y-%m-%d)_academy_to_career.md
```

## Discord Channel
#bot-ceo
