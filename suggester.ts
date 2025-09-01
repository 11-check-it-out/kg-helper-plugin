import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import KGHelperPlugin from './main';
import { createRelationNoteFromSuggester } from './commands/quickCreate';

// =============================
// @@i；概念a；概念b  →  《概念a-影响-概念b》
// =============================

interface Suggestion {
  label: string;
  value: string;
  type: 'type' | 'concept' | 'final';
}

const RELATION_TYPES: Record<string, string> = {
  i: '影响',
  c: '对比',
  a: '关联',
  u: '应用',
};

export class RelationSuggester extends EditorSuggest<Suggestion> {
  plugin: KGHelperPlugin;
  private allNotes: TFile[] = [];

  constructor(plugin: KGHelperPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.allNotes = this.app.vault.getMarkdownFiles();
  }

  // 找到光标前最近一次出现的 @@
  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const lineBefore = editor.getLine(cursor.line).substring(0, cursor.ch);
    const atat = lineBefore.lastIndexOf('@@');
    if (atat === -1) return null;

    const queryText = lineBefore.substring(atat + 2); // 不含 @@
    return {
      start: { line: cursor.line, ch: atat },
      end: cursor,
      query: queryText,
    };
  }

  // 生成候选项
  getSuggestions(context: EditorSuggestContext): Suggestion[] {
    if (!this.allNotes || this.allNotes.length === 0) {
      this.allNotes = this.app.vault.getMarkdownFiles();
    }

    const query = (context.query || '').trim();
    const parts = query.split(/;|；/);

    const out: Suggestion[] = [];

    // 若已可形成标题，追加 final 项
    const parsed = this.parseQueryToParts(query);
    if (parsed) {
      out.push({ type: 'final', label: `创建笔记: ${parsed.title}`, value: query });
    }

    // 阶段1：选择关系类型（无分号时）
    if (parts.length === 1 && query.indexOf('；') === -1 && query.indexOf(';') === -1) {
      const q = parts[0].trim().toLowerCase();
      let pairs = Object.entries(RELATION_TYPES);
      if (q) {
        pairs = pairs.filter(([abbr, name]) => abbr.indexOf(q) === 0 || name.indexOf(q) === 0);
      }
      if (pairs.length === 0) pairs = Object.entries(RELATION_TYPES);

      for (const [abbr, name] of pairs) {
        out.push({ type: 'type', label: `${abbr}: ${name}`, value: `${abbr}；` });
      }
      return out;
    }

    // 阶段2/3：概念联想（头、尾）
    const lastPart = parts[parts.length - 1] || '';
    const lastWord = (lastPart.split(/_/).pop() || '').trim();

    const pool = this.allNotes;
    const cand = lastWord
      ? pool.filter(f => f.basename.toLowerCase().includes(lastWord.toLowerCase())).slice(0, 10)
      : pool.slice(0, 10);

    for (const f of cand) {
      out.push({ type: 'concept', label: f.basename, value: f.basename });
    }

    return out;
  }

  renderSuggestion(s: Suggestion, el: HTMLElement): void {
    el.setText(s.label);
  }

  async selectSuggestion(s: Suggestion, _evt: MouseEvent | KeyboardEvent): Promise<void> {
    if (s.type === 'final') {
      const parsed = this.parseQueryToParts(s.value);
      if (!parsed) return;

      const newFile = await createRelationNoteFromSuggester(
        this.plugin.app,
        this.plugin.settings,
        parsed.title,
        parsed.head,
        parsed.tail
      );

      if (newFile) {
        const linkText = `[[${newFile.basename}]]`;
        this.context.editor.replaceRange(linkText, this.context.start, this.context.end);
        this.app.workspace.getLeaf('tab').openFile(newFile);
      }
      return;
    }

    // 非 final：应用到 @@ 查询并再次触发联想
    this.applySuggestion(s);
    setTimeout(() => {
      this.app.commands.executeCommandById('editor:trigger-suggest');
    }, 40);
  }

  // 将选择写回，并把光标置于 @@ 片段末尾
  applySuggestion(s: Suggestion): void {
    const editor = this.context.editor;
    const query = this.context.query || '';

    let newQuery: string;
    if (s.type === 'type') {
      newQuery = s.value; // 例如 "i；"
    } else {
      const parts = query.split(/;|；/);
      const lastPart = parts[parts.length - 1] || '';
      const words = lastPart.split(/_/);
      words[words.length - 1] = s.value; // 替换末尾关键词
      parts[parts.length - 1] = words.join('_');
      newQuery = parts.join('；');
    }

    const start = this.context.start;
    const text = `@@${newQuery}`;
    editor.replaceRange(text, start, this.context.end);
    editor.setCursor({ line: start.line, ch: start.ch + text.length });
  }

  // 解析查询为标题与数组
  parseQueryToParts(query: string): { title: string; head: string[]; tail: string[] } | null {
    const q = (query || '').trim();
    if (!q) return null;

    const semi = q.indexOf(';') !== -1 ? q.indexOf(';') : q.indexOf('；');
    if (semi === -1) return null;

    const typeAbbr = q.substring(0, semi).trim().toLowerCase();
    const rel = RELATION_TYPES[typeAbbr];
    if (!rel) return null;

    const rest = q.substring(semi + 1);
    const segs = rest.split(/;|；/);

    const head = (segs[0] || '').split(/_/).map(s => s.trim()).filter(Boolean);
    const tail = (segs[1] || '').split(/_/).map(s => s.trim()).filter(Boolean);
    if (head.length === 0) return null;

    const headStr = head.join('_');
    const tailStr = tail.join('_');
    const title = tailStr ? `${headStr}-${rel}-${tailStr}` : `${headStr}-${rel}-`;

    return { title, head, tail };
  }
}
