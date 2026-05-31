import { Fragment, type ReactNode } from "react";
import { usePlatform } from "@/platform/context";

// 行内 URL 识别：http/https，止于空白与常见包裹符号
const URL_RE = /(https?:\/\/[^\s'"<>()）」』，。、]+)/g;

/**
 * 渲染一行/一段日志文本：把其中的网址变成可点链接。
 * 普通点击 = 不拦截（留给滑动选中）；按住 ⌘(Mac)/Ctrl 再点 = 打开链接。
 */
export function LogText({ text }: { text: string }) {
  const platform = usePlatform();
  if (!text) return <>{" "}</>;

  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const url = m[0];
    nodes.push(
      <span
        key={m.index}
        role="link"
        title="按住 ⌘ / Ctrl 点击打开链接"
        className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
        onClick={(e) => {
          // 仅在按住修饰键时跳转，避免误触打断选中
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            platform.openExternal?.(url);
          }
        }}
      >
        {url}
      </span>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}
