import { Fragment } from 'react';

interface RichTextLinksProps {
  text: string;
  linkClassName?: string;
}

function isSafeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function RichTextLinks({ text, linkClassName }: RichTextLinksProps) {
  if (!text) return null;

  // Match either markdown links [teks](https://...) or direct URLs https://...
  const tokenRegex = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>'"]+)/gi;
  const nodes: Array<
    | { type: 'text'; value: string }
    | { type: 'link'; label: string; href: string }
  > = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      const label = match[1].trim();
      const safeHref = isSafeHttpUrl(match[2].trim());
      if (label && safeHref) {
        nodes.push({ type: 'link', label, href: safeHref });
      } else {
        nodes.push({ type: 'text', value: match[0] });
      }
      lastIndex = match.index + match[0].length;
    } else if (match[3] !== undefined) {
      let rawUrl = match[3];
      let trailing = '';
      // Strip trailing punctuation often placed at the end of a sentence
      while (/[.,;!?)]$/.test(rawUrl)) {
        const lastChar = rawUrl.slice(-1);
        if (lastChar === ')') {
          const openParens = (rawUrl.match(/\(/g) || []).length;
          const closeParens = (rawUrl.match(/\)/g) || []).length;
          if (closeParens <= openParens) break;
        }
        trailing = lastChar + trailing;
        rawUrl = rawUrl.slice(0, -1);
      }

      const safeHref = isSafeHttpUrl(rawUrl);
      if (safeHref) {
        nodes.push({ type: 'link', label: rawUrl, href: safeHref });
        if (trailing) {
          nodes.push({ type: 'text', value: trailing });
        }
      } else {
        nodes.push({ type: 'text', value: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', value: text.slice(lastIndex) });
  }

  const defaultLinkClass =
    linkClassName ||
    'underline decoration-sky-500/60 underline-offset-2 font-medium text-sky-600 transition-colors hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 break-all';

  return (
    <>
      {nodes.map((node, idx) =>
        node.type === 'link' ? (
          <a
            key={`rtl-${idx}`}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={defaultLinkClass}
          >
            {node.label}
          </a>
        ) : (
          <Fragment key={`rtt-${idx}`}>{node.value}</Fragment>
        )
      )}
    </>
  );
}
