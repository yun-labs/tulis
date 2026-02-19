import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import html from 'highlight.js/lib/languages/xml';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';

const languageDefinitions = {
  bash,
  css,
  go,
  html,
  java,
  javascript,
  json,
  markdown,
  python,
  scss,
  sql,
  typescript,
  yaml,
} as const;

export const editorLowlight = createLowlight();

Object.entries(languageDefinitions).forEach(([name, language]) => {
  editorLowlight.register(name, language);
});

const aliasToLanguage: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  yml: 'yaml',
  md: 'markdown',
  xml: 'html',
};

const supportedLanguages = new Set([
  ...Object.keys(languageDefinitions),
  ...Object.keys(aliasToLanguage),
]);

type DetectionStrategy = 'deterministic' | 'relevance';

export type CodeLanguageDetection = {
  language: string | null;
  strategy: DetectionStrategy;
  relevance: number;
  secondRelevance: number;
};

export const normalizeCodeLanguage = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  if (!supportedLanguages.has(normalized)) return null;
  return aliasToLanguage[normalized] ?? normalized;
};

export const isStrictJsonSnippet = (code: string): boolean => {
  const snippet = code.trim();
  if (!snippet) return false;

  // Keep JSON detection conservative to avoid reclassifying normal JS snippets.
  if (!(snippet.startsWith('{') || snippet.startsWith('['))) {
    return false;
  }

  try {
    const parsed = JSON.parse(snippet);
    return typeof parsed !== 'undefined';
  } catch {
    return false;
  }
};

export const isLikelySqlSnippet = (code: string): boolean => {
  const snippet = code.trim();
  if (!snippet) return false;

  const startsLikeSql = /^(with|select|insert|update|delete|create|alter|drop|truncate|merge)\b/i.test(snippet);
  if (!startsLikeSql) return false;

  const hasCoreClauses = /\b(from|where|join|group\s+by|order\s+by|having|limit|values|set|into)\b/i.test(snippet);
  const hasSqlPunctuation = /;|\*/.test(snippet);

  return hasCoreClauses || hasSqlPunctuation;
};

export const isLikelyJavaSnippet = (code: string): boolean => {
  const snippet = code.trim();
  if (!snippet) return false;

  const hasJavaSignature = /(System\.out\.println|public\s+class|import\s+java\.|package\s+[a-z0-9_.]+;)/i.test(snippet);
  const hasTypedMembers = /\b(?:public|private|protected)?\s*(?:static\s+)?(?:void|int|long|double|float|boolean|String)\s+[A-Za-z_]\w*\b/.test(snippet);
  const hasCStyleBlocks = /{[\s\S]*}/.test(snippet);

  return hasJavaSignature || (hasTypedMembers && hasCStyleBlocks);
};

const deterministicDetectors: Array<{ language: string; test: (code: string) => boolean }> = [
  { language: 'json', test: isStrictJsonSnippet },
  { language: 'sql', test: isLikelySqlSnippet },
  { language: 'java', test: isLikelyJavaSnippet },
];

const rankLanguagesByRelevance = (snippet: string): Array<{ language: string; relevance: number }> => {
  const registered = editorLowlight.listLanguages();
  const scored = registered.map((language) => {
    try {
      const result = editorLowlight.highlight(language, snippet);
      return {
        language,
        relevance: typeof result.data?.relevance === 'number' ? result.data.relevance : 0,
      };
    } catch {
      return {
        language,
        relevance: 0,
      };
    }
  });

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored;
};

export const detectCodeLanguageMeta = (code: string): CodeLanguageDetection => {
  const snippet = code.trim();
  if (!snippet) {
    return {
      language: null,
      strategy: 'relevance',
      relevance: 0,
      secondRelevance: 0,
    };
  }

  const deterministicMatch = deterministicDetectors.find(({ test }) => test(snippet));
  if (deterministicMatch) {
    return {
      language: deterministicMatch.language,
      strategy: 'deterministic',
      relevance: Number.POSITIVE_INFINITY,
      secondRelevance: 0,
    };
  }

  const ranked = rankLanguagesByRelevance(snippet);
  const best = ranked[0];
  const second = ranked[1];

  const normalizedLanguage = normalizeCodeLanguage(best?.language ?? null);

  return {
    language: normalizedLanguage,
    strategy: 'relevance',
    relevance: best?.relevance ?? 0,
    secondRelevance: second?.relevance ?? 0,
  };
};

export const detectCodeLanguage = (code: string): string | null => detectCodeLanguageMeta(code).language;

export const shouldAutoCorrectLanguage = ({
  currentLanguage,
  code,
  detection,
  aggressive = false,
}: {
  currentLanguage: string;
  code: string;
  detection: CodeLanguageDetection;
  aggressive?: boolean;
}): boolean => {
  const normalizedCurrent = normalizeCodeLanguage(currentLanguage);
  if (!normalizedCurrent || !detection.language || normalizedCurrent === detection.language) {
    return false;
  }

  if (detection.strategy === 'deterministic') {
    return true;
  }

  // Avoid noisy flips while user is still typing short snippets unless user just pasted/typed.
  if (!aggressive && code.trim().length < 24) {
    return false;
  }

  let currentRelevance = 0;
  try {
    const result = editorLowlight.highlight(normalizedCurrent, code);
    currentRelevance = typeof result.data?.relevance === 'number' ? result.data.relevance : 0;
  } catch {
    currentRelevance = 0;
  }

  if (aggressive) {
    return detection.relevance >= 2 && detection.relevance - currentRelevance >= 1;
  }

  const margin = detection.relevance - Math.max(detection.secondRelevance, currentRelevance);
  return detection.relevance >= 4 && margin >= 2;
};
