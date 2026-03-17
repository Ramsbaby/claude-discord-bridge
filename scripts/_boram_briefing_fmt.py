#!/usr/bin/env python3
# _boram_briefing_fmt.py — boram-briefing.sh 헬퍼: preply-today.sh JSON → Discord 메시지
# Usage: echo <preply_json> | python3 _boram_briefing_fmt.py [YYYY-MM-DD]
# preply-today.sh 포맷: {scheduledLessons, cancelledCompensations, totalsByCurrency, ...}

import json, sys
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
CLOCK = {
    0:'🕛', 1:'🕐', 2:'🕑', 3:'🕒', 4:'🕓', 5:'🕔',
    6:'🕕', 7:'🕖', 8:'🕗', 9:'🕘', 10:'🕙', 11:'🕚',
    12:'🕛', 13:'🕐', 14:'🕑', 15:'🕒', 16:'🕓', 17:'🕔',
    18:'🕕', 19:'🕖', 20:'🕗', 21:'🕘', 22:'🕙', 23:'🕚',
}

target_date = sys.argv[1] if len(sys.argv) > 1 else datetime.now(KST).strftime('%Y-%m-%d')

try:
    data = json.load(sys.stdin)
except Exception:
    print("📅 일정 데이터를 읽지 못했어요 😅")
    sys.exit(0)

lessons = data.get('scheduledLessons', [])
cancelled = data.get('cancelledCompensations', [])
totals = data.get('totalsByCurrency', {})

# 수업 없는 날
if not lessons and not cancelled:
    print(f"☀️ 보람님, 좋은 아침이에요! 💕\n오늘({target_date})은 수업이 없어요~ 푹 쉬세요! 😊")
    sys.exit(0)

# 수업 목록 빌드
lines = []

# 인트로
count = len(lessons)
lines.append(f"☀️ 보람님, 좋은 아침이에요! 오늘 수업 **{count}건** 있어요 💕")
lines.append("")

# 수업별 라인
for lesson in lessons:
    start = lesson.get('startAt', '')
    student = lesson.get('student', '?').capitalize()
    amount = lesson.get('amount', 0)
    currency = lesson.get('currency', 'USD')

    # 시간 파싱 (HH:MM 형식)
    try:
        h = int(start.split(':')[0])
        clock = CLOCK.get(h, '🕐')
    except Exception:
        clock = '🕐'

    if amount:
        lines.append(f"- {clock} {start} · {student} **${amount:.2f}**")
    else:
        lines.append(f"- {clock} {start} · {student}")

# 취소 보상금
if cancelled:
    lines.append("")
    lines.append("💸 취소 보상:")
    for c in cancelled:
        student = c.get('student', '?').capitalize()
        amount = c.get('amount', 0)
        currency = c.get('currency', 'USD')
        lines.append(f"- {student} +${amount:.2f} (취소 보상)")

# 총 수입
lines.append("")
if totals:
    for currency, total in totals.items():
        lines.append(f"💰 **오늘 총 수입: ${total:.2f} {currency}** ✨")
else:
    # 수동 합산
    total_usd = sum(l.get('amount', 0) for l in lessons if l.get('currency') == 'USD')
    total_usd += sum(c.get('amount', 0) for c in cancelled if c.get('currency') == 'USD')
    if total_usd:
        lines.append(f"💰 **오늘 총 수입: ${total_usd:.2f} USD** ✨")

lines.append("")
lines.append("오늘도 파이팅이에요! 🌟")

print('\n'.join(lines))
