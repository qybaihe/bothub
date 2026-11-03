import { type ReactNode, memo } from 'react'
import { cn } from '@/lib/cn'

/** Lightweight markdown for assistant bubbles (headings, lists, bold, code). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]!
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    last = match.index + token.length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let block = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        code.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre
          key={`code-${block++}`}
          className="my-2 overflow-x-auto rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-[12.5px] leading-relaxed"
          data-lang={lang || undefined}
        >
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Heading
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const cls =
        level === 1
          ? 'mt-2 mb-1 text-[15px] font-semibold'
          : level === 2
            ? 'mt-2 mb-1 text-[14.5px] font-semibold'
            : 'mt-1.5 mb-0.5 text-[14px] font-semibold'
      blocks.push(
        <div key={`h-${block++}`} className={cls}>
          {renderInline(heading[2]!, `h${block}`)}
        </div>
      )
      i += 1
      continue
    }

    // Unordered list run
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i] ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^\s*[-*•]\s+/, '')
        items.push(
          <li key={`li-${block}-${items.length}`} className="leading-[1.55]">
            {renderInline(itemText, `li${block}-${items.length}`)}
          </li>
        )
        i += 1
      }
      blocks.push(
        <ul key={`ul-${block++}`} className="my-1.5 list-disc space-y-1 pl-5">
          {items}
        </ul>
      )
      continue
    }

    // Ordered list run
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^\s*\d+\.\s+/, '')
        items.push(
          <li key={`oli-${block}-${items.length}`} className="leading-[1.55]">
            {renderInline(itemText, `oli${block}-${items.length}`)}
          </li>
        )
        i += 1
      }
      blocks.push(
        <ol key={`ol-${block++}`} className="my-1.5 list-decimal space-y-1 pl-5">
          {items}
        </ol>
      )
      continue
    }

    // Blank line
    if (!line.trim()) {
      i += 1
      continue
    }

    // Paragraph: merge consecutive plain lines
    const para: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^\s*[-*•]\s+/.test(lines[i] ?? '') &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').startsWith('```')
    ) {
      para.push(lines[i] ?? '')
      i += 1
    }
    blocks.push(
      <p key={`p-${block++}`} className="my-1 leading-[1.6] first:mt-0 last:mb-0">
        {renderInline(para.join('\n'), `p${block}`)}
      </p>
    )
  }

  return blocks
}

export const MarkdownText = memo(function MarkdownText({
  text,
  className
}: {
  text: string
  className?: string
}) {
  // Fast path for short plain replies (no markdown markers).
  if (!/[*_`#\-]|\n\d+\./.test(text) && !text.includes('```')) {
    return <span className={cn('whitespace-pre-wrap break-words', className)}>{text}</span>
  }
  return <div className={cn('break-words [&_p+p]:mt-2', className)}>{renderBlocks(text)}</div>
})
