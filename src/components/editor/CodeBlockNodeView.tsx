'use client';

import { NodeViewContent, NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCodeSnippet } from '@/lib/editor/codeFormat';
import {
  detectCodeLanguageMeta,
  normalizeCodeLanguage,
  shouldAutoCorrectLanguage,
} from '@/lib/editor/codeLowlight';

type ActionStatus = 'idle' | 'working' | 'success' | 'error';

const languageDisplayNames: Record<string, string> = {
  bash: 'Bash',
  css: 'CSS',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  scss: 'SCSS',
  sql: 'SQL',
  typescript: 'TypeScript',
  yaml: 'YAML',
};

const feedbackResetDelayMs = 1400;
const copyTooltipDelayMs = 1000;

const CopyIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m12 3 1.8 3.9L18 8.7l-3.2 2.9.8 4.3L12 13.8l-3.6 2.1.8-4.3L6 8.7l4.2-1.8L12 3Z" />
    <path d="M20 2v4" />
    <path d="M22 4h-4" />
    <path d="M4 16v4" />
    <path d="M6 18H2" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
    <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlertIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 9v4" strokeLinecap="round" />
    <path d="M12 17h.01" strokeLinecap="round" />
    <path d="M10.3 3.6 2.8 16.2A2 2 0 0 0 4.5 19h15a2 2 0 0 0 1.7-2.8L13.7 3.6a2 2 0 0 0-3.4 0Z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18" strokeLinecap="round" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" strokeLinecap="round" />
    <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" />
    <path d="M10 11v6" strokeLinecap="round" />
    <path d="M14 11v6" strokeLinecap="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3H3v5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 21H3v-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m3 8 6-6" strokeLinecap="round" />
    <path d="m21 8-6-6" strokeLinecap="round" />
    <path d="m3 16 6 6" strokeLinecap="round" />
    <path d="m21 16-6 6" strokeLinecap="round" />
  </svg>
);

const CollapseIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 3H3v6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 21H3v-6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 21h6v-6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m3 9 6-6" strokeLinecap="round" />
    <path d="m21 9-6-6" strokeLinecap="round" />
    <path d="m3 15 6 6" strokeLinecap="round" />
    <path d="m21 15-6 6" strokeLinecap="round" />
  </svg>
);

const LineNumbersIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6h8" strokeLinecap="round" />
    <path d="M4 12h8" strokeLinecap="round" />
    <path d="M4 18h8" strokeLinecap="round" />
    <path d="M17 5v14" strokeLinecap="round" />
    <path d="M20 8h-3" strokeLinecap="round" />
    <path d="M20 16h-3" strokeLinecap="round" />
  </svg>
);

export function CodeBlockNodeView(props: NodeViewProps) {
  const { editor, node, updateAttributes, getPos } = props;
  const [copyStatus, setCopyStatus] = useState<ActionStatus>('idle');
  const [formatStatus, setFormatStatus] = useState<ActionStatus>('idle');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [copyTooltip, setCopyTooltip] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const relabelAggressiveRef = useRef(false);
  const formatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const code = node.textContent ?? '';
  const hasCode = code.trim().length > 0;
  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code]);
  const lines = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1), [lineCount]);
  const languageFromNode = normalizeCodeLanguage(
    typeof node.attrs.language === 'string' ? node.attrs.language : null,
  );
  const detection = useMemo(() => detectCodeLanguageMeta(code), [code]);
  const detectedLanguage = detection.language;
  const effectiveLanguage = languageFromNode ?? detectedLanguage;
  const languageLabel = effectiveLanguage ? languageDisplayNames[effectiveLanguage] ?? effectiveLanguage : 'Plain Text';
  const resetCodeScrollToTop = useCallback(() => {
    setScrollTop(0);
    window.requestAnimationFrame(() => {
      const scroller = contentScrollRef.current;
      if (!scroller) return;
      scroller.scrollTop = 0;
    });
  }, []);

  useEffect(() => {
    if (!detectedLanguage) return;

    if (languageFromNode && shouldAutoCorrectLanguage({
      currentLanguage: languageFromNode,
      code,
      detection,
      aggressive: relabelAggressiveRef.current,
    })) {
      updateAttributes({ language: detectedLanguage });
      relabelAggressiveRef.current = false;
      return;
    }

    if (languageFromNode) {
      relabelAggressiveRef.current = false;
      return;
    }
    updateAttributes({ language: detectedLanguage });
    relabelAggressiveRef.current = false;
  }, [code, detectedLanguage, detection, languageFromNode, updateAttributes]);

  useEffect(() => {
    return () => {
      if (formatTimeoutRef.current) clearTimeout(formatTimeoutRef.current);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (copyTooltipTimeoutRef.current) clearTimeout(copyTooltipTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsExpanded(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded]);

  const setCopyStatusTemporarily = useCallback((status: Exclude<ActionStatus, 'working'>) => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setCopyStatus(status);
    copyTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), feedbackResetDelayMs);
  }, []);

  const setFormatStatusTemporarily = useCallback((status: Exclude<ActionStatus, 'working'>) => {
    if (formatTimeoutRef.current) clearTimeout(formatTimeoutRef.current);
    setFormatStatus(status);
    formatTimeoutRef.current = setTimeout(() => setFormatStatus('idle'), feedbackResetDelayMs);
  }, []);

  const showCopyTooltipFor = useCallback((text: string) => {
    if (copyTooltipTimeoutRef.current) clearTimeout(copyTooltipTimeoutRef.current);
    setCopyTooltip(text);
    copyTooltipTimeoutRef.current = setTimeout(() => {
      setCopyTooltip(null);
    }, copyTooltipDelayMs);
  }, []);

  const replaceCodeContent = useCallback(
    (nextCode: string) => {
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (typeof pos !== 'number') return;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      const tr = editor.state.tr.insertText(nextCode, from, to);
      editor.view.dispatch(tr);
    },
    [editor, getPos, node.nodeSize],
  );

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatusTemporarily('success');
      showCopyTooltipFor('Copied');
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopyStatusTemporarily(copied ? 'success' : 'error');
        showCopyTooltipFor(copied ? 'Copied' : 'Copy failed');
      } catch {
        setCopyStatusTemporarily('error');
        showCopyTooltipFor('Copy failed');
      }
    }
  }, [code, setCopyStatusTemporarily, showCopyTooltipFor]);

  const formatCode = useCallback(async () => {
    if (!code.trim()) {
      setFormatStatusTemporarily('error');
      return;
    }

    setFormatStatus('working');
    const result = await formatCodeSnippet(code, languageFromNode ?? detectedLanguage);

    if (result.error) {
      setFormatStatusTemporarily('error');
      return;
    }

    if (result.formatted !== code) {
      replaceCodeContent(result.formatted);
    }

    if (result.language && result.language !== languageFromNode) {
      updateAttributes({ language: result.language });
    }

    setFormatStatusTemporarily('success');
  }, [
    code,
    detectedLanguage,
    languageFromNode,
    replaceCodeContent,
    setFormatStatusTemporarily,
    updateAttributes,
  ]);

  const formatIcon = formatStatus === 'success' ? <CheckIcon /> : formatStatus === 'error' ? <AlertIcon /> : <SparklesIcon />;
  const copyIcon = copyStatus === 'success' ? <CheckIcon /> : copyStatus === 'error' ? <AlertIcon /> : <CopyIcon />;
  const expandToMax = useCallback(() => {
    setIsExpanded(true);
  }, []);
  const toggleExpanded = useCallback(() => {
    setIsExpanded((value) => {
      const next = !value;
      if (!next) {
        resetCodeScrollToTop();
      }
      return next;
    });
  }, [resetCodeScrollToTop]);

  return (
    <NodeViewWrapper
      className="tulis-code-block"
      data-language={effectiveLanguage ?? 'plain'}
      data-expanded={isExpanded ? 'true' : 'false'}
      data-lines={showLineNumbers ? 'true' : 'false'}
    >
      <div className="tulis-code-block-toolbar" contentEditable={false}>
        <span className="tulis-code-language">{languageLabel}</span>
        <div className="tulis-code-actions">
          <div className="tulis-code-action-anchor">
            {copyTooltip && <span className="tulis-code-tooltip">{copyTooltip}</span>}
            <button
              type="button"
              onClick={() => void copyCode()}
              className="tulis-code-action"
              title="Copy code"
              aria-label="Copy code"
            >
              {copyIcon}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void formatCode()}
            className={`tulis-code-action ${formatStatus === 'working' ? 'is-working' : ''}`}
            title="Beautify code"
            aria-label="Beautify code"
            disabled={formatStatus === 'working'}
          >
            {formatIcon}
          </button>
          <button
            type="button"
            onClick={toggleExpanded}
            className="tulis-code-action"
            title={isExpanded ? 'Collapse block' : 'Expand block'}
            aria-label={isExpanded ? 'Collapse code block' : 'Expand code block'}
            aria-pressed={isExpanded}
          >
            {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
          <button
            type="button"
            onClick={() => setShowLineNumbers((value) => !value)}
            className="tulis-code-action"
            title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            aria-label={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            aria-pressed={showLineNumbers}
          >
            <LineNumbersIcon />
          </button>
          <button
            type="button"
            onClick={() => replaceCodeContent('')}
            className="tulis-code-action"
            title="Clear all"
            aria-label="Clear all code"
            disabled={!hasCode}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="tulis-code-body">
        {showLineNumbers && (
          <div className="tulis-code-gutter" aria-hidden="true">
            <div className="tulis-code-gutter-inner" style={{ transform: `translateY(${-scrollTop}px)` }}>
              {lines.map((line) => (
                <span key={line} className="tulis-code-line-number">
                  {line}
                </span>
              ))}
            </div>
          </div>
        )}
        <div
          className="tulis-code-scroll"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onMouseDown={expandToMax}
          onTouchStart={expandToMax}
          onFocusCapture={expandToMax}
          onInputCapture={() => {
            relabelAggressiveRef.current = true;
          }}
          onPasteCapture={() => {
            relabelAggressiveRef.current = true;
            setIsExpanded(true);
            resetCodeScrollToTop();
          }}
          ref={contentScrollRef}
        >
          <NodeViewContent
            className={`tulis-code-content${effectiveLanguage ? ` language-${effectiveLanguage}` : ''}`}
            onFocusCapture={expandToMax}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
