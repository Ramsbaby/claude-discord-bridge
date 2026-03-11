/**
 * Context budget classification — determines how much compute budget to
 * allocate based on prompt content, length, and presence of images.
 *
 * Exports:
 *   LARGE_KEYWORDS   — RegExp for prompts needing large budget
 *   ANALYSIS_KEYWORDS — RegExp for analysis-type prompts
 *   ACTION_KEYWORDS   — RegExp for action-type prompts
 *   classifyBudget(prompt, hasImages) — returns 'small' | 'medium' | 'large'
 */

export const LARGE_KEYWORDS = /코드 작성|구현해|리팩터|버그 수정|에러 .{0,10}(고쳐|잡아|수정)|파일 .{0,10}(분석|수정|추가)|클래스|디버그|implement|refactor|debug|fix .{0,10}(bug|error)/i;
export const ANALYSIS_KEYWORDS = /분석|비교|설명|왜|어떻게|원리|차이|무슨|뭔|뭘|무엇|어디|어째서|review|explain|analyze|what|why|how/i;
export const ACTION_KEYWORDS = /해줘|고쳐|바꿔|만들어|삭제|수정|추가|작성|구현|확인|점검|보고|상태|알려|브리핑|요약|정리|현황|진행|처리|실행/;

/**
 * Classify the compute budget for a prompt.
 *
 * @param {string} prompt - The original user prompt (before RAG/summary injection)
 * @param {boolean} hasImages - Whether the message includes image attachments
 * @returns {'small' | 'medium' | 'large'} The budget tier
 */
export function classifyBudget(prompt, hasImages) {
  const trimmed = prompt.trim();
  // 5자 이하 단답형(왜? 맞아? 그래서?) — Sonnet으로 충분, Opus 낭비 방지
  if (trimmed.length <= 5 && !hasImages) return 'small';

  const hasLarge = LARGE_KEYWORDS.test(prompt);
  const hasAction = ACTION_KEYWORDS.test(prompt);
  const hasAnalysis = ANALYSIS_KEYWORDS.test(prompt);

  // 코드 작업·이미지·장문 → Opus
  if (hasImages || hasLarge || prompt.length > 200) return 'large';
  // 행동/분석 키워드 → medium. 단, 8자 이하 단답은 small 유지
  // ("확인" 2자 단어 하나로 200턴 낭비 방지 — 실제 명령/질문은 대부분 9자 이상)
  if ((hasAction || hasAnalysis) && trimmed.length > 8) return 'medium';
  // 짧고 단순한 질문
  if (trimmed.length <= 20) return 'small';
  return 'medium';
}
