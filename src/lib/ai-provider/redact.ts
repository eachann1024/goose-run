/**
 * 发送给第三方 AI 端点前的密钥脱敏层（合规底线）。
 * 命中常见密钥/令牌模式的片段替换为 [REDACTED:<类型>]，避免把用户凭据外送。
 * 参考 ClipGate / Warp Secret Redaction 的模式表。
 */

interface RedactRule {
  label: string;
  re: RegExp;
}

const RULES: RedactRule[] = [
  // OpenAI / 兼容 key：sk-、sk-proj-
  { label: "openai", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g },
  // Anthropic
  { label: "anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  // GitHub token：ghp_/gho_/ghu_/ghs_/ghr_/github_pat_
  { label: "github", re: /\b(?:gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  // AWS Access Key Id
  { label: "aws", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  // Google API key
  { label: "google", re: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
  // Slack token
  { label: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // JWT（三段 base64url）
  { label: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  // Bearer 头里的令牌
  { label: "bearer", re: /\b(Bearer)\s+[A-Za-z0-9._-]{16,}/gi },
  // 常见环境变量赋值里的密钥：FOO_TOKEN=xxx / API_KEY=xxx / PASSWORD=xxx / SECRET=xxx
  {
    label: "env",
    re: /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[=:]\s*['"]?([^\s'"]{6,})/gi,
  },
];

/** 对一段文本做密钥脱敏，返回替换后的文本 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { label, re } of RULES) {
    if (label === "bearer") {
      out = out.replace(re, "$1 [REDACTED:bearer]");
    } else if (label === "env") {
      out = out.replace(re, "$1=[REDACTED:secret]");
    } else {
      out = out.replace(re, `[REDACTED:${label}]`);
    }
  }
  return out;
}
