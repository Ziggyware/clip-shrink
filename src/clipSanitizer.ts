export type LanguageName =
  | "html"
  | "json"
  | "python"
  | "cpp"
  | "csharp"
  | "rust"
  | "markdown"
  | "javascript"
  | "typescript";

export const enum LangId {
  Html = 0,
  Json = 1,
  Python = 2,
  Cpp = 3,
  CSharp = 4,
  Rust = 5,
  Markdown = 6,
  JavaScript = 7,
  TypeScript = 8,
}

const LANG_COUNT = 9;

const LANG_NAMES: readonly LanguageName[] = [
  "html",
  "json",
  "python",
  "cpp",
  "csharp",
  "rust",
  "markdown",
  "javascript",
  "typescript",
];

export type SanitizeErrorCode =
  | "CLIPBOARD_UNAVAILABLE"
  | "CLIPBOARD_DENIED"
  | "EMPTY_INPUT";

export type SanitizeResult =
  | {
      readonly ok: true;
      readonly lang: LanguageName;
      readonly confidence: number;
      readonly output: string;
    }
  | {
      readonly ok: false;
      readonly error: SanitizeErrorCode;
      readonly detail: string;
    };

export type ClipboardReader = () => Promise<string>;

const enum FstState {
  Code = 0,
  StrDouble = 1,
  StrSingle = 2,
  StrBacktick = 3,
  StrPyTripleDouble = 4,
  StrPyTripleSingle = 5,
  LineComment = 6,
  BlockComment = 7,
  HtmlComment = 8,
  MdFence = 9,
}

// ASCII byte constants
const B_TAB = 0x09;
const B_LF = 0x0a;
const B_CR = 0x0d;
const B_SPACE = 0x20;
const B_BANG = 0x21;
const B_DQUOTE = 0x22;
const B_HASH = 0x23;
const B_DOLLAR = 0x24;
const B_AMP = 0x26;
const B_SQUOTE = 0x27;
const B_LPAREN = 0x28;
const B_RPAREN = 0x29;
const B_STAR = 0x2a;
const B_DASH = 0x2d;
const B_DOT = 0x2e;
const B_SLASH = 0x2f;
const B_COLON = 0x3a;
const B_SEMI = 0x3b;
const B_LT = 0x3c;
const B_EQ = 0x3d;
const B_GT = 0x3e;
const B_AT = 0x40;
const B_LBRACKET = 0x5b;
const B_BSLASH = 0x5c;
const B_RBRACKET = 0x5d;
const B_UNDERSCORE = 0x5f;
const B_BACKTICK = 0x60;
const B_LBRACE = 0x7b;
const B_RBRACE = 0x7d;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8");

type WeightTuple = readonly [LangId, number];

function fnv1aBytes(bytes: Uint8Array, start: number, end: number): number {
  let h = 0x811c9dc5;
  for (let i = start; i < end; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fnv1aStr(s: string): number {
  const b = ENCODER.encode(s);
  return fnv1aBytes(b, 0, b.length);
}

// Exact word-bounded token weights (positive = evidence for, negative = evidence against)
const TOKEN_WEIGHTS = new Map<number, readonly WeightTuple[]>();

function registerToken(word: string, weights: readonly WeightTuple[]): void {
  TOKEN_WEIGHTS.set(fnv1aStr(word), weights);
}

// Python tokens
registerToken("def", [[LangId.Python, 5.5], [LangId.Cpp, -2.0], [LangId.CSharp, -2.0], [LangId.Rust, -2.0], [LangId.JavaScript, -2.0], [LangId.TypeScript, -2.0]]);
registerToken("elif", [[LangId.Python, 6.0], [LangId.JavaScript, -2.0], [LangId.Cpp, -2.0]]);
registerToken("self", [[LangId.Python, 2.5], [LangId.Rust, 2.5], [LangId.CSharp, -1.5], [LangId.JavaScript, -1.5]]);
registerToken("None", [[LangId.Python, 3.0], [LangId.Rust, 2.0]]);
registerToken("True", [[LangId.Python, 3.5], [LangId.JavaScript, -1.5], [LangId.Cpp, -1.5], [LangId.CSharp, -1.5], [LangId.Rust, -1.5]]);
registerToken("False", [[LangId.Python, 3.5], [LangId.JavaScript, -1.5], [LangId.Cpp, -1.5], [LangId.CSharp, -1.5], [LangId.Rust, -1.5]]);
registerToken("lambda", [[LangId.Python, 4.5]]);
registerToken("except", [[LangId.Python, 5.0]]);
registerToken("pass", [[LangId.Python, 3.0]]);
registerToken("print", [[LangId.Python, 2.5]]);
registerToken("isinstance", [[LangId.Python, 5.0]]);
registerToken("enumerate", [[LangId.Python, 3.5]]);
registerToken("__init__", [[LangId.Python, 7.0]]);
registerToken("__name__", [[LangId.Python, 7.0]]);
registerToken("asyncio", [[LangId.Python, 5.0]]);
registerToken("from", [[LangId.Python, 1.5], [LangId.JavaScript, 1.5], [LangId.TypeScript, 1.5]]);
registerToken("import", [[LangId.Python, 1.5], [LangId.JavaScript, 1.5], [LangId.TypeScript, 1.5]]);

// Rust tokens
registerToken("fn", [[LangId.Rust, 5.5], [LangId.Python, -2.0], [LangId.Cpp, -2.0], [LangId.CSharp, -2.0], [LangId.JavaScript, -2.0]]);
registerToken("mut", [[LangId.Rust, 5.5], [LangId.Cpp, -2.0], [LangId.CSharp, -2.0]]);
registerToken("impl", [[LangId.Rust, 6.0]]);
registerToken("trait", [[LangId.Rust, 5.5]]);
registerToken("pub", [[LangId.Rust, 5.0]]);
registerToken("crate", [[LangId.Rust, 6.0]]);
registerToken("match", [[LangId.Rust, 4.0], [LangId.Python, 1.0]]);
registerToken("usize", [[LangId.Rust, 6.0]]);
registerToken("isize", [[LangId.Rust, 6.0]]);
registerToken("i32", [[LangId.Rust, 4.5]]);
registerToken("u32", [[LangId.Rust, 4.5]]);
registerToken("u64", [[LangId.Rust, 4.5]]);
registerToken("u8", [[LangId.Rust, 4.0]]);
registerToken("f64", [[LangId.Rust, 4.5]]);
registerToken("f32", [[LangId.Rust, 4.5]]);
registerToken("Vec", [[LangId.Rust, 4.5]]);
registerToken("Option", [[LangId.Rust, 3.5]]);
registerToken("Result", [[LangId.Rust, 3.5]]);
registerToken("Some", [[LangId.Rust, 3.0]]);
registerToken("Ok", [[LangId.Rust, 3.0]]);
registerToken("Err", [[LangId.Rust, 3.5]]);
registerToken("println", [[LangId.Rust, 4.0]]);
registerToken("eprintln", [[LangId.Rust, 5.5]]);
registerToken("unwrap", [[LangId.Rust, 4.5]]);
registerToken("derive", [[LangId.Rust, 4.5]]);
registerToken("mod", [[LangId.Rust, 3.5]]);

// C++ tokens
registerToken("nullptr", [[LangId.Cpp, 6.0], [LangId.CSharp, -2.0], [LangId.Rust, -2.0]]);
registerToken("constexpr", [[LangId.Cpp, 6.5]]);
registerToken("template", [[LangId.Cpp, 5.5]]);
registerToken("typename", [[LangId.Cpp, 6.0]]);
registerToken("std", [[LangId.Cpp, 5.0], [LangId.Rust, 2.0]]);
registerToken("cout", [[LangId.Cpp, 5.5]]);
registerToken("cerr", [[LangId.Cpp, 5.5]]);
registerToken("endl", [[LangId.Cpp, 5.5]]);
registerToken("size_t", [[LangId.Cpp, 5.5]]);
registerToken("uint32_t", [[LangId.Cpp, 5.5]]);
registerToken("int32_t", [[LangId.Cpp, 5.5]]);
registerToken("uint8_t", [[LangId.Cpp, 5.5]]);
registerToken("vector", [[LangId.Cpp, 3.5]]);
registerToken("unique_ptr", [[LangId.Cpp, 6.5]]);
registerToken("shared_ptr", [[LangId.Cpp, 6.5]]);
registerToken("noexcept", [[LangId.Cpp, 6.0]]);
registerToken("auto", [[LangId.Cpp, 3.5]]);
registerToken("struct", [[LangId.Cpp, 2.5], [LangId.Rust, 3.0], [LangId.CSharp, 2.5]]);
registerToken("virtual", [[LangId.Cpp, 3.5], [LangId.CSharp, 3.0]]);
registerToken("override", [[LangId.Cpp, 2.5], [LangId.CSharp, 3.5]]);

// C# tokens
registerToken("using", [[LangId.CSharp, 3.5], [LangId.Cpp, 2.0]]);
registerToken("namespace", [[LangId.CSharp, 4.0], [LangId.Cpp, 3.5], [LangId.TypeScript, 2.0]]);
registerToken("Console", [[LangId.CSharp, 6.0]]);
registerToken("WriteLine", [[LangId.CSharp, 6.0]]);
registerToken("Task", [[LangId.CSharp, 4.5]]);
registerToken("IEnumerable", [[LangId.CSharp, 6.5]]);
registerToken("Dictionary", [[LangId.CSharp, 5.0]]);
registerToken("List", [[LangId.CSharp, 3.0]]);
registerToken("decimal", [[LangId.CSharp, 5.0]]);
registerToken("internal", [[LangId.CSharp, 4.5]]);
registerToken("sealed", [[LangId.CSharp, 5.0]]);
registerToken("foreach", [[LangId.CSharp, 5.5]]);
registerToken("nameof", [[LangId.CSharp, 6.0]]);
registerToken("string", [[LangId.CSharp, 2.5], [LangId.TypeScript, 2.5], [LangId.Cpp, 1.5]]);
registerToken("bool", [[LangId.CSharp, 2.5], [LangId.Cpp, 2.5], [LangId.Rust, 2.5]]);
registerToken("public", [[LangId.CSharp, 3.0], [LangId.TypeScript, 2.0], [LangId.Cpp, 1.5]]);
registerToken("private", [[LangId.CSharp, 3.0], [LangId.TypeScript, 2.0], [LangId.Cpp, 1.5]]);
registerToken("protected", [[LangId.CSharp, 3.0], [LangId.TypeScript, 2.0], [LangId.Cpp, 1.5]]);
registerToken("static", [[LangId.CSharp, 2.5], [LangId.Cpp, 2.0], [LangId.Rust, 2.0], [LangId.JavaScript, 1.0], [LangId.TypeScript, 1.5]]);
registerToken("void", [[LangId.CSharp, 2.5], [LangId.Cpp, 2.5], [LangId.TypeScript, 2.0]]);
registerToken("var", [[LangId.CSharp, 2.5], [LangId.JavaScript, 2.0], [LangId.TypeScript, 1.5]]);

// JavaScript & TypeScript tokens
registerToken("const", [[LangId.JavaScript, 2.5], [LangId.TypeScript, 2.5], [LangId.Cpp, 1.5], [LangId.Rust, 1.5], [LangId.CSharp, 1.0]]);
registerToken("let", [[LangId.JavaScript, 2.5], [LangId.TypeScript, 2.5], [LangId.Rust, 2.5]]);
registerToken("function", [[LangId.JavaScript, 4.5], [LangId.TypeScript, 4.5], [LangId.Cpp, -2.0], [LangId.CSharp, -2.0], [LangId.Rust, -2.0]]);
registerToken("console", [[LangId.JavaScript, 4.5], [LangId.TypeScript, 4.5]]);
registerToken("undefined", [[LangId.JavaScript, 4.5], [LangId.TypeScript, 4.5]]);
registerToken("typeof", [[LangId.JavaScript, 3.5], [LangId.TypeScript, 3.5], [LangId.CSharp, 2.5]]);
registerToken("Promise", [[LangId.JavaScript, 4.0], [LangId.TypeScript, 4.0]]);
registerToken("export", [[LangId.JavaScript, 3.5], [LangId.TypeScript, 4.0]]);
registerToken("document", [[LangId.JavaScript, 3.0], [LangId.TypeScript, 3.0]]);
registerToken("window", [[LangId.JavaScript, 3.0], [LangId.TypeScript, 3.0]]);
registerToken("async", [[LangId.JavaScript, 2.0], [LangId.TypeScript, 2.0], [LangId.CSharp, 2.5], [LangId.Rust, 2.5], [LangId.Python, 2.0]]);
registerToken("await", [[LangId.JavaScript, 2.0], [LangId.TypeScript, 2.0], [LangId.CSharp, 2.5], [LangId.Rust, 2.0], [LangId.Python, 2.0]]);

// TypeScript-exclusive / strong TS tokens
registerToken("interface", [[LangId.TypeScript, 5.5], [LangId.CSharp, 3.0], [LangId.JavaScript, -3.0]]);
registerToken("readonly", [[LangId.TypeScript, 4.5], [LangId.CSharp, 3.5], [LangId.JavaScript, -3.0]]);
registerToken("implements", [[LangId.TypeScript, 5.0], [LangId.JavaScript, -3.0]]);
registerToken("keyof", [[LangId.TypeScript, 7.0], [LangId.JavaScript, -3.0]]);
registerToken("unknown", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("never", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("Record", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("Partial", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("Omit", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("Pick", [[LangId.TypeScript, 4.0], [LangId.JavaScript, -2.0]]);
registerToken("enum", [[LangId.TypeScript, 3.5], [LangId.Rust, 3.0], [LangId.CSharp, 3.0], [LangId.Cpp, 2.5], [LangId.JavaScript, -3.0]]);

// TypeScript type names that appear after `:` in annotations
const TS_TYPE_HASHES = new Set<number>([
  fnv1aStr("string"),
  fnv1aStr("number"),
  fnv1aStr("boolean"),
  fnv1aStr("void"),
  fnv1aStr("any"),
  fnv1aStr("unknown"),
  fnv1aStr("never"),
  fnv1aStr("object"),
  fnv1aStr("bigint"),
  fnv1aStr("symbol"),
  fnv1aStr("Uint8Array"),
  fnv1aStr("Float64Array"),
  fnv1aStr("Promise"),
  fnv1aStr("Record"),
  fnv1aStr("Array"),
  fnv1aStr("Map"),
  fnv1aStr("Set"),
]);

// C++ preprocessor directive names after `#`
const CPP_PREPROC_HASHES = new Set<number>([
  fnv1aStr("include"),
  fnv1aStr("define"),
  fnv1aStr("pragma"),
  fnv1aStr("ifdef"),
  fnv1aStr("ifndef"),
  fnv1aStr("endif"),
  fnv1aStr("undef"),
]);

// Common HTML tag names for `<tag` / `</tag>` detection
const HTML_TAG_HASHES = new Set<number>([
  fnv1aStr("html"),
  fnv1aStr("head"),
  fnv1aStr("body"),
  fnv1aStr("div"),
  fnv1aStr("span"),
  fnv1aStr("p"),
  fnv1aStr("a"),
  fnv1aStr("ul"),
  fnv1aStr("ol"),
  fnv1aStr("li"),
  fnv1aStr("script"),
  fnv1aStr("style"),
  fnv1aStr("link"),
  fnv1aStr("meta"),
  fnv1aStr("title"),
  fnv1aStr("section"),
  fnv1aStr("article"),
  fnv1aStr("header"),
  fnv1aStr("footer"),
  fnv1aStr("nav"),
  fnv1aStr("main"),
  fnv1aStr("form"),
  fnv1aStr("input"),
  fnv1aStr("button"),
  fnv1aStr("table"),
  fnv1aStr("tr"),
  fnv1aStr("td"),
  fnv1aStr("th"),
  fnv1aStr("img"),
  fnv1aStr("h1"),
  fnv1aStr("h2"),
  fnv1aStr("h3"),
  fnv1aStr("br"),
  fnv1aStr("hr"),
  fnv1aStr("canvas"),
  fnv1aStr("svg"),
]);

function isWhitespace(b: number): boolean {
  return b === B_SPACE || b === B_TAB || b === B_LF || b === B_CR;
}

function isAlpha(b: number): boolean {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

function isIdentStart(b: number): boolean {
  return isAlpha(b) || b === B_UNDERSCORE || b === B_DOLLAR;
}

function isIdentByte(b: number): boolean {
  return isAlpha(b) || isDigit(b) || b === B_UNDERSCORE || b === B_DOLLAR || b >= 0x80;
}

function addScore(scores: Float64Array, lang: LangId, delta: number): void {
  scores[lang] += delta;
}

function addBatch(scores: Float64Array, weights: readonly WeightTuple[]): void {
  for (let i = 0; i < weights.length; i++) {
    scores[weights[i][0]] += weights[i][1];
  }
}

export function detectLanguage(
  text: string,
  bytes: Uint8Array = ENCODER.encode(text)
): { readonly lang: LangId; readonly confidence: number } {
  const len = bytes.length;

  // 1. Strict JSON fast-path for object/array payloads
  let start = 0;
  let end = len - 1;
  while (start <= end && isWhitespace(bytes[start])) start++;
  while (end >= start && isWhitespace(bytes[end])) end--;

  if (
    start <= end &&
    ((bytes[start] === B_LBRACE && bytes[end] === B_RBRACE) ||
      (bytes[start] === B_LBRACKET && bytes[end] === B_RBRACKET))
  ) {
    try {
      JSON.parse(text);
      return { lang: LangId.Json, confidence: 1.0 };
    } catch {
      // Not valid JSON; proceed to masked classifier
    }
  }

  const scores = new Float64Array(LANG_COUNT);
  let tsExclusiveHits = 0;
  let semiLines = 0;
  let colonLines = 0;
  let slashComments = 0;
  let hashComments = 0;
  let braceCount = 0;
  let htmlOpenTags = 0;
  let htmlCloseTags = 0;
  let mdFences = 0;
  let mdHeadings = 0;
  let mdLinks = 0;
  let mdLists = 0;
  let inMdFence = false;
  let inDoubleStr = false;
  let atLineStart = true;
  let lastNonWsByte = 0;

  for (let i = start; i <= end; i++) {
    const b = bytes[i];

    // Track Markdown fenced code blocks at line start so inner code doesn't hijack classification
    if (
      atLineStart &&
      b === B_BACKTICK &&
      i + 2 <= end &&
      bytes[i + 1] === B_BACKTICK &&
      bytes[i + 2] === B_BACKTICK
    ) {
      inMdFence = !inMdFence;
      if (inMdFence) mdFences++;
      // Skip to end of fence line
      while (i <= end && bytes[i] !== B_LF) i++;
      atLineStart = true;
      lastNonWsByte = 0;
      continue;
    }

    if (inMdFence) {
      if (b === B_LF) atLineStart = true;
      else if (b !== B_SPACE && b !== B_TAB && b !== B_CR) atLineStart = false;
      continue;
    }

    // Mask double-quoted string contents (preserving triple-quote detection first)
    if (inDoubleStr) {
      if (b === B_BSLASH && i + 1 <= end) {
        i++;
      } else if (b === B_DQUOTE) {
        inDoubleStr = false;
      } else if (b === B_LF) {
        // Unclosed single-line string; reset to avoid masking entire file
        inDoubleStr = false;
        atLineStart = true;
        lastNonWsByte = 0;
      }
      continue;
    }

    if (b === B_CR) continue;

    if (b === B_LF) {
      if (lastNonWsByte === B_SEMI) semiLines++;
      else if (lastNonWsByte === B_COLON) colonLines++;
      atLineStart = true;
      lastNonWsByte = 0;
      continue;
    }

    if (b === B_SPACE || b === B_TAB) continue;

    // Line-start structural signals
    if (atLineStart) {
      if (b === B_HASH) {
        // Distinguish C++ preprocessor (#include), Rust attribute (#[), Markdown heading (# ), Python comment (#)
        if (i + 1 <= end && bytes[i + 1] === B_LBRACKET) {
          addScore(scores, LangId.Rust, 6.0);
        } else {
          let j = i + 1;
          while (j <= end && bytes[j] === B_HASH && j - i < 6) j++;
          if (j <= end && bytes[j] === B_SPACE) {
            if (j - i >= 2) {
              mdHeadings += 2; // ## or ### is almost exclusively Markdown
            } else {
              mdHeadings += 1;
              hashComments++;
            }
          } else if (j === i + 1 && j <= end && isAlpha(bytes[j])) {
            let k = j;
            while (k <= end && isIdentByte(bytes[k])) k++;
            const h = fnv1aBytes(bytes, j, k);
            if (CPP_PREPROC_HASHES.has(h)) {
              addScore(scores, LangId.Cpp, 7.5);
              addScore(scores, LangId.Python, -3.0);
              addScore(scores, LangId.Markdown, -3.0);
            } else {
              hashComments++;
            }
          } else {
            hashComments++;
          }
        }
      } else if ((b === B_DASH || b === B_STAR) && i + 1 <= end && bytes[i + 1] === B_SPACE) {
        mdLists++;
      } else if (b === B_GT && i + 1 <= end && bytes[i + 1] === B_SPACE) {
        addScore(scores, LangId.Markdown, 2.0);
      }
      atLineStart = false;
    }

    // Comments: // and /*
    if (b === B_SLASH && i + 1 <= end) {
      const next = bytes[i + 1];
      if (next === B_SLASH) {
        slashComments++;
        while (i <= end && bytes[i] !== B_LF) i++;
        atLineStart = true;
        lastNonWsByte = 0;
        continue;
      }
      if (next === B_STAR) {
        slashComments++;
        i += 2;
        while (i + 1 <= end && !(bytes[i] === B_STAR && bytes[i + 1] === B_SLASH)) i++;
        i++;
        continue;
      }
    }

    // Python triple quotes
    if (
      (b === B_DQUOTE || b === B_SQUOTE) &&
      i + 2 <= end &&
      bytes[i + 1] === b &&
      bytes[i + 2] === b
    ) {
      addScore(scores, LangId.Python, 6.0);
      i += 2;
      continue;
    }

    // C# interpolated/verbatim strings: $" and @"
    if ((b === B_DOLLAR || b === B_AT) && i + 1 <= end && bytes[i + 1] === B_DQUOTE) {
      addScore(scores, LangId.CSharp, 5.0);
      i++;
      inDoubleStr = true;
      lastNonWsByte = B_DQUOTE;
      continue;
    }

    if (b === B_DQUOTE) {
      inDoubleStr = true;
      lastNonWsByte = b;
      continue;
    }

    // HTML tags, DOCTYPE, and HTML comments
    if (b === B_LT) {
      if (i + 3 <= end && bytes[i + 1] === B_BANG && bytes[i + 2] === B_DASH && bytes[i + 3] === B_DASH) {
        addScore(scores, LangId.Html, 4.0);
        addScore(scores, LangId.Markdown, 1.5);
        i += 3;
        while (i + 2 <= end && !(bytes[i] === B_DASH && bytes[i + 1] === B_DASH && bytes[i + 2] === B_GT)) i++;
        i += 2;
        continue;
      }
      if (i + 8 <= end && bytes[i + 1] === B_BANG) {
        // <!DOCTYPE or <!doctype
        const c2 = bytes[i + 2] | 0x20;
        const c3 = bytes[i + 3] | 0x20;
        if (c2 === 0x64 && c3 === 0x6f) {
          addScore(scores, LangId.Html, 12.0);
        }
      } else if (i + 2 <= end && bytes[i + 1] === B_SLASH && isAlpha(bytes[i + 2])) {
        // Closing HTML tag </tag>
        let k = i + 2;
        while (k <= end && (isAlpha(bytes[k]) || isDigit(bytes[k]))) k++;
        if (k <= end && bytes[k] === B_GT) {
          htmlCloseTags++;
          const tagHash = fnv1aBytes(bytes, i + 2, k);
          if (HTML_TAG_HASHES.has(tagHash)) htmlCloseTags++;
        }
      } else if (i + 1 <= end && isAlpha(bytes[i + 1])) {
        let k = i + 1;
        while (k <= end && (isAlpha(bytes[k]) || isDigit(bytes[k]))) k++;
        const tagHash = fnv1aBytes(bytes, i + 1, k);
        if (HTML_TAG_HASHES.has(tagHash) && k <= end && (bytes[k] === B_GT || bytes[k] === B_SPACE)) {
          htmlOpenTags++;
        }
      }
      lastNonWsByte = b;
      continue;
    }

    // Markdown link pattern ](
    if (b === B_RBRACKET && i + 1 <= end && bytes[i + 1] === B_LPAREN) {
      mdLinks++;
      lastNonWsByte = b;
      continue;
    }

    // Multi-character operators
    if (b === B_COLON && i + 1 <= end && bytes[i + 1] === B_COLON) {
      addScore(scores, LangId.Cpp, 2.5);
      addScore(scores, LangId.Rust, 2.5);
      addScore(scores, LangId.Python, -1.5);
      addScore(scores, LangId.JavaScript, -1.5);
      i++;
      lastNonWsByte = B_COLON;
      continue;
    }

    if (b === B_DASH && i + 1 <= end && bytes[i + 1] === B_GT) {
      addScore(scores, LangId.Rust, 2.5);
      addScore(scores, LangId.Cpp, 2.0);
      addScore(scores, LangId.Python, 1.5); // return type annotation
      i++;
      lastNonWsByte = B_GT;
      continue;
    }

    if (b === B_EQ && i + 1 <= end && bytes[i + 1] === B_GT) {
      addScore(scores, LangId.JavaScript, 2.5);
      addScore(scores, LangId.TypeScript, 2.5);
      addScore(scores, LangId.CSharp, 2.5);
      addScore(scores, LangId.Rust, 2.5);
      addScore(scores, LangId.Python, -2.0);
      i++;
      lastNonWsByte = B_GT;
      continue;
    }

    if (b === B_EQ && i + 2 <= end && bytes[i + 1] === B_EQ && bytes[i + 2] === B_EQ) {
      addScore(scores, LangId.JavaScript, 4.0);
      addScore(scores, LangId.TypeScript, 4.0);
      addScore(scores, LangId.Cpp, -2.0);
      addScore(scores, LangId.CSharp, -2.0);
      addScore(scores, LangId.Rust, -2.0);
      addScore(scores, LangId.Python, -2.0);
      i += 2;
      lastNonWsByte = B_EQ;
      continue;
    }

    if (b === B_LBRACE || b === B_RBRACE) {
      braceCount++;
      lastNonWsByte = b;
      continue;
    }

    // TypeScript type annotation detector: `: <TypeName>`
    if (b === B_COLON && i + 1 <= end) {
      let k = i + 1;
      while (k <= end && bytes[k] === B_SPACE) k++;
      if (k <= end && isIdentStart(bytes[k])) {
        let tEnd = k;
        while (tEnd <= end && isIdentByte(bytes[tEnd])) tEnd++;
        const th = fnv1aBytes(bytes, k, tEnd);
        if (TS_TYPE_HASHES.has(th)) {
          addScore(scores, LangId.TypeScript, 5.0);
          addScore(scores, LangId.JavaScript, -2.5);
          tsExclusiveHits++;
        }
      }
      lastNonWsByte = b;
      continue;
    }

    // Exact word-bounded identifier tokenization
    if (isIdentStart(b)) {
      const tokStart = i;
      while (i + 1 <= end && isIdentByte(bytes[i + 1])) i++;
      const tokEnd = i + 1;

      // Rust macro invocation: ident!
      if (tokEnd <= end && bytes[tokEnd] === B_BANG && (tokEnd + 1 > end || bytes[tokEnd + 1] !== B_EQ)) {
        addScore(scores, LangId.Rust, 4.5);
      }

      const h = fnv1aBytes(bytes, tokStart, tokEnd);
      const weights = TOKEN_WEIGHTS.get(h);
      if (weights) {
        addBatch(scores, weights);
        // Track TS-exclusive keywords
        for (let wIdx = 0; wIdx < weights.length; wIdx++) {
          if (weights[wIdx][0] === LangId.JavaScript && weights[wIdx][1] < -1.0) {
            tsExclusiveHits++;
          }
        }
      }

      // Check `type <Ident> =` (TypeScript type alias)
      if (tokEnd - tokStart === 4 && h === fnv1aStr("type")) {
        let k = tokEnd;
        while (k <= end && bytes[k] === B_SPACE) k++;
        if (k <= end && isIdentStart(bytes[k])) {
          while (k <= end && isIdentByte(bytes[k])) k++;
          while (k <= end && bytes[k] === B_SPACE) k++;
          if (k <= end && (bytes[k] === B_EQ || bytes[k] === B_LT)) {
            addScore(scores, LangId.TypeScript, 6.0);
            addScore(scores, LangId.JavaScript, -3.0);
            tsExclusiveHits++;
          }
        }
      }

      lastNonWsByte = bytes[tokEnd - 1];
      continue;
    }

    lastNonWsByte = b;
  }

  // Final line terminator check
  if (lastNonWsByte === B_SEMI) semiLines++;
  else if (lastNonWsByte === B_COLON) colonLines++;

  // Aggregate structural priors (capped to prevent long-file runaway)
  const capSemi = Math.min(semiLines, 8);
  if (capSemi > 0) {
    addScore(scores, LangId.Cpp, capSemi * 0.6);
    addScore(scores, LangId.CSharp, capSemi * 0.6);
    addScore(scores, LangId.Rust, capSemi * 0.6);
    addScore(scores, LangId.JavaScript, capSemi * 0.5);
    addScore(scores, LangId.TypeScript, capSemi * 0.5);
    addScore(scores, LangId.Python, -capSemi * 1.2);
    addScore(scores, LangId.Markdown, -capSemi * 0.8);
  }

  const capColon = Math.min(colonLines, 6);
  if (capColon > 0) {
    addScore(scores, LangId.Python, capColon * 2.0);
  }

  const capSlash = Math.min(slashComments, 6);
  if (capSlash > 0) {
    addScore(scores, LangId.Cpp, capSlash * 1.0);
    addScore(scores, LangId.CSharp, capSlash * 1.0);
    addScore(scores, LangId.Rust, capSlash * 1.0);
    addScore(scores, LangId.JavaScript, capSlash * 1.0);
    addScore(scores, LangId.TypeScript, capSlash * 1.0);
    addScore(scores, LangId.Python, -capSlash * 2.5);
    addScore(scores, LangId.Html, -capSlash * 1.5);
  }

  if (hashComments > 0 && mdHeadings === 0) {
    addScore(scores, LangId.Python, Math.min(hashComments, 5) * 1.8);
  }

  if (braceCount >= 2) {
    const cb = Math.min(braceCount, 10) * 0.35;
    addScore(scores, LangId.Cpp, cb);
    addScore(scores, LangId.CSharp, cb);
    addScore(scores, LangId.Rust, cb);
    addScore(scores, LangId.JavaScript, cb);
    addScore(scores, LangId.TypeScript, cb);
  }

  if (htmlCloseTags > 0 || htmlOpenTags > 0) {
    addScore(scores, LangId.Html, htmlCloseTags * 5.0 + htmlOpenTags * 2.5);
  }

  if (mdFences > 0 || mdHeadings > 0 || mdLinks > 0 || mdLists > 0) {
    addScore(
      scores,
      LangId.Markdown,
      mdFences * 8.0 + mdHeadings * 3.5 + mdLinks * 4.5 + Math.min(mdLists, 6) * 1.5
    );
  }

  // JS vs TS tie-break: TS is a strict superset; without TS-exclusive evidence, prefer JS
  if (tsExclusiveHits > 0) {
    scores[LangId.TypeScript] += Math.max(0, scores[LangId.JavaScript]) * 0.5;
  } else {
    scores[LangId.JavaScript] += 0.5;
  }

  // Argmax + numerically stable softmax
  let bestLang: LangId = LangId.Markdown;
  let bestScore = -Infinity;
  for (let l = 0; l < LANG_COUNT; l++) {
    if (scores[l] > bestScore) {
      bestScore = scores[l];
      bestLang = l as LangId;
    }
  }

  if (bestScore <= 0.5) {
    return { lang: LangId.Markdown, confidence: 0.25 };
  }

  let sumExp = 0;
  for (let l = 0; l < LANG_COUNT; l++) {
    sumExp += Math.exp(scores[l] - bestScore);
  }

  return { lang: bestLang, confidence: 1.0 / sumExp };
}

export function stripCommentsAndWhitespace(bytes: Uint8Array, lang: LangId): Uint8Array {
  const len = bytes.length;
  const out = new Uint8Array(len);
  let w = 0;

  if (lang === LangId.Json) {
    let inStr = false;
    for (let i = 0; i < len; i++) {
      const b = bytes[i];
      if (inStr) {
        out[w++] = b;
        if (b === B_BSLASH && i + 1 < len) {
          out[w++] = bytes[++i];
        } else if (b === B_DQUOTE) {
          inStr = false;
        }
      } else {
        if (b === B_DQUOTE) {
          inStr = true;
          out[w++] = b;
        } else if (!isWhitespace(b)) {
          out[w++] = b;
        }
      }
    }
    return out.subarray(0, w);
  }

  if (lang === LangId.Python) {
    let state: FstState = FstState.Code;
    let atLineStart = true;
    let lineStartWriteIdx = 0;
    let pendingSpace = false;

    for (let i = 0; i < len; i++) {
      const b = bytes[i];

      if (state === FstState.LineComment) {
        if (b === B_LF) {
          state = FstState.Code;
          if (w > lineStartWriteIdx) {
            out[w++] = B_LF;
          } else {
            w = lineStartWriteIdx;
          }
          atLineStart = true;
          lineStartWriteIdx = w;
          pendingSpace = false;
        }
        continue;
      }

      if (state === FstState.StrDouble || state === FstState.StrSingle) {
        const quote = state === FstState.StrDouble ? B_DQUOTE : B_SQUOTE;
        out[w++] = b;
        if (b === B_BSLASH && i + 1 < len) {
          out[w++] = bytes[++i];
        } else if (b === quote) {
          state = FstState.Code;
        }
        continue;
      }

      if (state === FstState.StrPyTripleDouble || state === FstState.StrPyTripleSingle) {
        const quote = state === FstState.StrPyTripleDouble ? B_DQUOTE : B_SQUOTE;
        out[w++] = b;
        if (b === B_BSLASH && i + 1 < len) {
          out[w++] = bytes[++i];
        } else if (
          b === quote &&
          i + 2 < len &&
          bytes[i + 1] === quote &&
          bytes[i + 2] === quote
        ) {
          out[w++] = bytes[++i];
          out[w++] = bytes[++i];
          state = FstState.Code;
        }
        continue;
      }

      if (b === B_CR) continue;

      if (b === B_LF) {
        if (w > lineStartWriteIdx) {
          out[w++] = B_LF;
        } else {
          w = lineStartWriteIdx;
        }
        atLineStart = true;
        lineStartWriteIdx = w;
        pendingSpace = false;
        continue;
      }

      if (b === B_HASH) {
        state = FstState.LineComment;
        pendingSpace = false;
        continue;
      }

      if (atLineStart) {
        if (b === B_SPACE || b === B_TAB) {
          out[w++] = b;
          continue;
        }
        atLineStart = false;
      } else if (b === B_SPACE || b === B_TAB) {
        pendingSpace = true;
        continue;
      }

      if (pendingSpace) {
        out[w++] = B_SPACE;
        pendingSpace = false;
      }

      if (b === B_DQUOTE) {
        if (i + 2 < len && bytes[i + 1] === B_DQUOTE && bytes[i + 2] === B_DQUOTE) {
          out[w++] = b;
          out[w++] = bytes[++i];
          out[w++] = bytes[++i];
          state = FstState.StrPyTripleDouble;
        } else {
          out[w++] = b;
          state = FstState.StrDouble;
        }
        continue;
      }

      if (b === B_SQUOTE) {
        if (i + 2 < len && bytes[i + 1] === B_SQUOTE && bytes[i + 2] === B_SQUOTE) {
          out[w++] = b;
          out[w++] = bytes[++i];
          out[w++] = bytes[++i];
          state = FstState.StrPyTripleSingle;
        } else {
          out[w++] = b;
          state = FstState.StrSingle;
        }
        continue;
      }

      out[w++] = b;
    }

    if (w > 0 && out[w - 1] === B_LF) w--;
    return out.subarray(0, w);
  }

  if (lang === LangId.Html) {
    let state: FstState = FstState.Code;
    let pendingSpace = false;

    for (let i = 0; i < len; i++) {
      const b = bytes[i];

      if (state === FstState.HtmlComment) {
        if (b === B_DASH && i + 2 < len && bytes[i + 1] === B_DASH && bytes[i + 2] === B_GT) {
          i += 2;
          state = FstState.Code;
        }
        continue;
      }

      if (state === FstState.StrDouble || state === FstState.StrSingle) {
        const quote = state === FstState.StrDouble ? B_DQUOTE : B_SQUOTE;
        out[w++] = b;
        if (b === quote) state = FstState.Code;
        continue;
      }

      if (
        b === B_LT &&
        i + 3 < len &&
        bytes[i + 1] === B_BANG &&
        bytes[i + 2] === B_DASH &&
        bytes[i + 3] === B_DASH
      ) {
        i += 3;
        state = FstState.HtmlComment;
        continue;
      }

      if (isWhitespace(b)) {
        pendingSpace = true;
        continue;
      }

      if (pendingSpace) {
        if (w > 0 && out[w - 1] !== B_GT && b !== B_LT) {
          out[w++] = B_SPACE;
        }
        pendingSpace = false;
      }

      if (b === B_DQUOTE) state = FstState.StrDouble;
      else if (b === B_SQUOTE) state = FstState.StrSingle;

      out[w++] = b;
    }

    return out.subarray(0, w);
  }

  if (lang === LangId.Markdown) {
    let state: FstState = FstState.Code;
    let consecutiveLfs = 0;
    let trailingSpaces = 0;

    for (let i = 0; i < len; i++) {
      const b = bytes[i];
      if (b === B_CR) continue;

      if (state === FstState.HtmlComment) {
        if (b === B_DASH && i + 2 < len && bytes[i + 1] === B_DASH && bytes[i + 2] === B_GT) {
          i += 2;
          state = FstState.Code;
        }
        continue;
      }

      if (state === FstState.MdFence) {
        out[w++] = b;
        if (
          b === B_BACKTICK &&
          i + 2 < len &&
          bytes[i + 1] === B_BACKTICK &&
          bytes[i + 2] === B_BACKTICK
        ) {
          out[w++] = bytes[++i];
          out[w++] = bytes[++i];
          state = FstState.Code;
        }
        continue;
      }

      if (
        b === B_LT &&
        i + 3 < len &&
        bytes[i + 1] === B_BANG &&
        bytes[i + 2] === B_DASH &&
        bytes[i + 3] === B_DASH
      ) {
        i += 3;
        state = FstState.HtmlComment;
        continue;
      }

      if (
        b === B_BACKTICK &&
        i + 2 < len &&
        bytes[i + 1] === B_BACKTICK &&
        bytes[i + 2] === B_BACKTICK
      ) {
        trailingSpaces = 0;
        consecutiveLfs = 0;
        out[w++] = b;
        out[w++] = bytes[++i];
        out[w++] = bytes[++i];
        state = FstState.MdFence;
        continue;
      }

      if (b === B_LF) {
        w -= trailingSpaces;
        trailingSpaces = 0;
        if (w > 0 && consecutiveLfs < 2) {
          out[w++] = B_LF;
          consecutiveLfs++;
        }
        continue;
      }

      if (b === B_SPACE || b === B_TAB) {
        out[w++] = b;
        trailingSpaces++;
        continue;
      }

      trailingSpaces = 0;
      consecutiveLfs = 0;
      out[w++] = b;
    }

    w -= trailingSpaces;
    while (w > 0 && out[w - 1] === B_LF) w--;
    return out.subarray(0, w);
  }

  // C-family: C++, C#, Rust, JavaScript, TypeScript
  const allowNestedBlock = lang === LangId.Rust;
  const allowBacktick = lang === LangId.JavaScript || lang === LangId.TypeScript;
  const preservePreprocessorNewline = lang === LangId.Cpp;

  let state: FstState = FstState.Code;
  let blockDepth = 0;
  let pendingSpace = false;
  let inPreprocessor = false;

  for (let i = 0; i < len; i++) {
    const b = bytes[i];

    if (state === FstState.LineComment) {
      if (b === B_LF) {
        state = FstState.Code;
        if (inPreprocessor) {
          out[w++] = B_LF;
          inPreprocessor = false;
        } else {
          pendingSpace = true;
        }
      }
      continue;
    }

    if (state === FstState.BlockComment) {
      if (allowNestedBlock && b === B_SLASH && i + 1 < len && bytes[i + 1] === B_STAR) {
        blockDepth++;
        i++;
      } else if (b === B_STAR && i + 1 < len && bytes[i + 1] === B_SLASH) {
        blockDepth--;
        i++;
        if (blockDepth === 0) {
          state = FstState.Code;
          pendingSpace = true;
        }
      }
      continue;
    }

    if (
      state === FstState.StrDouble ||
      state === FstState.StrSingle ||
      state === FstState.StrBacktick
    ) {
      const quote =
        state === FstState.StrDouble
          ? B_DQUOTE
          : state === FstState.StrSingle
            ? B_SQUOTE
            : B_BACKTICK;
      out[w++] = b;
      if (b === B_BSLASH && i + 1 < len) {
        out[w++] = bytes[++i];
      } else if (b === quote) {
        state = FstState.Code;
      }
      continue;
    }

    if (b === B_SLASH && i + 1 < len) {
      const next = bytes[i + 1];
      if (next === B_SLASH) {
        state = FstState.LineComment;
        i++;
        continue;
      }
      if (next === B_STAR) {
        state = FstState.BlockComment;
        blockDepth = 1;
        i++;
        continue;
      }
    }

    if (preservePreprocessorNewline && inPreprocessor && b === B_LF) {
      out[w++] = B_LF;
      inPreprocessor = false;
      pendingSpace = false;
      continue;
    }

    if (isWhitespace(b)) {
      pendingSpace = true;
      continue;
    }

    if (
      preservePreprocessorNewline &&
      b === B_HASH &&
      (w === 0 || out[w - 1] === B_LF || pendingSpace)
    ) {
      if (w > 0 && out[w - 1] !== B_LF) {
        out[w++] = B_LF;
      }
      inPreprocessor = true;
      pendingSpace = false;
    }

    if (pendingSpace) {
      if (w > 0 && isIdentByte(out[w - 1]) && isIdentByte(b)) {
        out[w++] = B_SPACE;
      } else if (inPreprocessor && w > 0 && out[w - 1] !== B_HASH) {
        out[w++] = B_SPACE;
      }
      pendingSpace = false;
    }

    if (b === B_DQUOTE) {
      state = FstState.StrDouble;
    } else if (b === B_SQUOTE) {
      state = FstState.StrSingle;
    } else if (allowBacktick && b === B_BACKTICK) {
      state = FstState.StrBacktick;
    }

    out[w++] = b;
  }

  return out.subarray(0, w);
}

export async function sanitizeClipboard(
  readClipboard?: ClipboardReader
): Promise<SanitizeResult> {
  let rawText: string;

  try {
    if (readClipboard) {
      rawText = await readClipboard();
    } else if (
      typeof globalThis !== "undefined" &&
      globalThis.navigator?.clipboard?.readText
    ) {
      rawText = await globalThis.navigator.clipboard.readText();
    } else {
      return {
        ok: false,
        error: "CLIPBOARD_UNAVAILABLE",
        detail: "navigator.clipboard.readText is unavailable in this runtime.",
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      error: "CLIPBOARD_DENIED",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (rawText.length === 0) {
    return {
      ok: false,
      error: "EMPTY_INPUT",
      detail: "Clipboard contains zero bytes.",
    };
  }

  const inputBytes = ENCODER.encode(rawText);
  const { lang, confidence } = detectLanguage(rawText, inputBytes);
  const compactedBytes = stripCommentsAndWhitespace(inputBytes, lang);

  return {
    ok: true,
    lang: LANG_NAMES[lang],
    confidence,
    output: DECODER.decode(compactedBytes),
  };
}