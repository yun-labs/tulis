import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginGraphql from 'prettier/plugins/graphql';
import * as prettierPluginHtml from 'prettier/plugins/html';
import prettierPluginJava from 'prettier-plugin-java';
import * as prettierPluginMarkdown from 'prettier/plugins/markdown';
import * as prettierPluginPostcss from 'prettier/plugins/postcss';
import * as prettierPluginTypescript from 'prettier/plugins/typescript';
import * as prettierPluginYaml from 'prettier/plugins/yaml';
import { format as formatSql } from 'sql-formatter';
import { detectCodeLanguage, isStrictJsonSnippet, normalizeCodeLanguage } from '@/lib/editor/codeLowlight';

type FormatterParser =
  | 'babel'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'scss'
  | 'markdown'
  | 'yaml'
  | 'graphql'
  | 'java'
  | 'sql';

const parserByLanguage: Record<string, FormatterParser> = {
  javascript: 'babel',
  typescript: 'typescript',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  markdown: 'markdown',
  yaml: 'yaml',
  java: 'java',
  sql: 'sql',
};

const allPlugins = [
  prettierPluginBabel,
  prettierPluginEstree,
  prettierPluginGraphql,
  prettierPluginHtml,
  prettierPluginJava,
  prettierPluginMarkdown,
  prettierPluginPostcss,
  prettierPluginTypescript,
  prettierPluginYaml,
];

export type FormatCodeResult = {
  formatted: string;
  language: string | null;
  parser: FormatterParser | null;
  error: string | null;
};

export const formatCodeSnippet = async (
  source: string,
  preferredLanguage?: string | null,
): Promise<FormatCodeResult> => {
  const sourceIsStrictJson = isStrictJsonSnippet(source);
  const normalizedPreferred = normalizeCodeLanguage(preferredLanguage);
  const detectedLanguage = detectCodeLanguage(source);
  const preferredIsJsonCompatible = normalizedPreferred === 'json' || normalizedPreferred === 'javascript' || normalizedPreferred === 'typescript';
  const language = sourceIsStrictJson && preferredIsJsonCompatible
    ? 'json'
    : normalizedPreferred ?? detectedLanguage;
  const parser = language ? parserByLanguage[language] ?? null : null;

  if (!parser) {
    return {
      formatted: source,
      language,
      parser: null,
      error: 'No formatter available for this language yet.',
    };
  }

  if (parser === 'sql') {
    try {
      const formatted = formatSql(source, {
        language: 'sql',
        tabWidth: 2,
        linesBetweenQueries: 1,
      });

      return {
        formatted,
        language,
        parser,
        error: null,
      };
    } catch (error) {
      return {
        formatted: source,
        language,
        parser,
        error: error instanceof Error ? error.message : 'Unable to format this SQL block.',
      };
    }
  }

  try {
    const formatted = await prettier.format(source, {
      parser,
      plugins: allPlugins,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    });

    return {
      formatted,
      language,
      parser,
      error: null,
    };
  } catch (error) {
    return {
      formatted: source,
      language,
      parser,
      error: error instanceof Error ? error.message : 'Unable to format this code block.',
    };
  }
};
