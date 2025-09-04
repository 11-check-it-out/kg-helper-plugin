import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import TWPilotPlugin from './main';
import { createRelationNoteFromSuggester } from './commands/quickCreate';

// =============================
// @@i；概念a，概念b；概念c  →  《概念a_概念b-影响-概念c》
// - 头/尾概念内部可用 中文逗号/英文逗号/下划线 分隔，标题统一用下划线拼接
// - 每个概念都可用候选逐个补全
// - final 仅在头尾都非空时出现
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
  plugin: TWPilotPlugin;
  private allNotes: TFile[] = [];

  constructor(plugin: TWPilotPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.allNotes = this.app.vault.getMarkdownFiles();

    // --- 兜底绑定 Enter/Tab，确保在不同环境下回车/Tab 可用 ---
    // Enter：严格调用 selectSuggestion
    // @ts-ignore
    this.scope.register([], 'Enter', (evt: KeyboardEvent) => {
      evt.preventDefault();
      // @ts-ignore
      if (evt.stopPropagation) evt.stopPropagation();
      // @ts-ignore
      const chooser = this.suggestions?.chooser;
      // @ts-ignore
      const values: Suggestion[] | undefined = this.suggestions?.values;
      // @ts-ignore
      const sel: Suggestion | undefined = values && chooser ? values[chooser.selectedItem] : undefined;
      if (sel) {
        // 调用类方法（不要在这里直接写入编辑器，避免状态不同步）
        this.selectSuggestion(sel, evt);
      }
    });

    // Tab：非 final 走“快速应用+重触发”；final 走完整选择
    // @ts-ignore
    this.scope.register([], 'Tab', (evt: KeyboardEvent) => {
      evt.preventDefault();
      // @ts-ignore
      if (evt.stopPropagation) evt.stopPropagation();
      // @ts-ignore
      const chooser = this.suggestions?.chooser;
      // @ts-ignore
      const values: Suggestion[] | undefined = this.suggestions?.values;
      // @ts-ignore
      const sel: Suggestion | undefined = values && chooser ? values[chooser.selectedItem] : undefined;
      if (!sel) return;
      if (sel.type === 'final') {
        this.selectSuggestion(sel, evt);
      } else {
        this.applySuggestion(sel);
        setTimeout(() => {
          this.app.commands.executeCommandById('editor:trigger-suggest');
        }, 30);
      }
    });
  }

  // 找到光标前最近一次出现的 @@
  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const lineBefore = editor.getLine(cursor.line).substring(0, cursor.ch);
    const atat = lineBefore.lastIndexOf('@@');
    if (atat === -1) return null;

    const queryText = lineBefore.substring(atat + 2); // 不含 @@ 本身
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

    // 仅当头尾都填写时显示 final
    const parsed = this.parseQueryToParts(query);
    let canFinal = false;
    {
      const firstSemi = query.indexOf(';') !== -1 ? query.indexOf(';') : query.indexOf('；');
      if (firstSemi !== -1) {
        const rest = query.substring(firstSemi + 1);
        const segs = rest.split(/;|；/);
        const headFilled = (segs[0] || '').trim().length > 0;
        const tailFilled = (segs[1] || '').trim().length > 0;
        canFinal = headFilled && tailFilled;
      }
    }
    if (parsed && canFinal) {
      out.push({ type: 'final', label: `创建笔记: ${parsed.title}`, value: query });
    }

    // 阶段1：关系类型（无分号）
    if (parts.length === 1 && query.indexOf('；') === -1 && query.indexOf(';') === -1) {
      const q = parts[0].trim().toLowerCase();
      let pairs = Object.entries(RELATION_TYPES);
      if (q) pairs = pairs.filter(([abbr, name]) => abbr.indexOf(q) === 0 || name.indexOf(q) === 0);
      if (pairs.length === 0) pairs = Object.entries(RELATION_TYPES);

      for (const [abbr, name] of pairs) out.push({ type: 'type', label: `${abbr}: ${name}`, value: `${abbr}；` });
      return out;
    }

    // 阶段2/3：概念联想（头、尾）
    const lastPart = parts[parts.length - 1] || '';
    const lastWord = (lastPart.split(/[_，,]/).pop() || '').trim();

    const pool = this.allNotes;
    const cand = lastWord
      ? pool.filter(f => f.basename.toLowerCase().includes(lastWord.toLowerCase())).slice(0, 10)
      : pool.slice(0, 10);

    for (const f of cand) out.push({ type: 'concept', label: f.basename, value: f.basename });

    return out;
  }

  renderSuggestion(s: Suggestion, el: HTMLElement): void {
    el.setText(s.label);
  }

  async selectSuggestion(s: Suggestion, evt: MouseEvent | KeyboardEvent): Promise<void> {
    // 防止默认回车插入换行
    if (evt && 'preventDefault' in evt) {
      evt.preventDefault();
      // @ts-ignore
      if ((evt as any).stopPropagation) (evt as any).stopPropagation();
    }

    if (s.type === 'final') {
      const parsed = this.parseQueryToParts(s.value);
      if (!parsed) return;

      const newFile = await createRelationNoteFromSuggester(
        this.plugin.app,
        this.plugin.settings,
        parsed.title,
        parsed.relation,
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

    // 非 final：根据阶段分别处理
    if (s.type === 'type') {
      // 选择关系类型后，立即进入“头概念”联想
      this.applySuggestion(s);
      setTimeout(() => {
        this.app.commands.executeCommandById('editor:trigger-suggest');
      }, 30);
      return;
    }

    // s.type === 'concept'
    const q = this.context.query || '';
    let editingTail = false;
    const firstSemi = q.indexOf(';') !== -1 ? q.indexOf(';') : q.indexOf('；');
    if (firstSemi !== -1) {
      const rest = q.substring(firstSemi + 1);
      const segs = rest.split(/;|；/);
      editingTail = segs.length >= 2; // 有第二段即认为在编辑尾概念
    }

    this.applySuggestion(s);

    if (editingTail) {
      // 尾概念阶段：继续打开候选（便于立即选择 final 或继续补尾概念）
      setTimeout(() => {
        this.app.commands.executeCommandById('editor:trigger-suggest');
      }, 30);
    } else {
      // 头概念阶段：选中后先关闭候选，等待输入分号进入尾概念阶段
      this.close();
    }
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
      const idx = parts.length - 1;
      const seg = parts[idx] || '';
      // 仅替换片段中“最后一个概念词”，保留用户使用的分隔符（逗号/中文逗号/下划线）
      const replaced = seg.replace(/[^_，,]*$/, s.value);
      parts[idx] = replaced;
      newQuery = parts.join('；');
    }

    const start = this.context.start;
    const text = `@@${newQuery}`;
    editor.replaceRange(text, start, this.context.end);
    editor.setCursor({ line: start.line, ch: start.ch + text.length });
  }

  // 解析查询为标题与数组
  parseQueryToParts(query: string): { title: string; relation: string; head: string[]; tail: string[] } | null {
    const q = (query || '').trim();
    if (!q) return null;

    const semi = q.indexOf(';') !== -1 ? q.indexOf(';') : q.indexOf('；');
    if (semi === -1) return null;

    const typeAbbr = q.substring(0, semi).trim().toLowerCase();
    const rel = RELATION_TYPES[typeAbbr];
    if (!rel) return null;

    const rest = q.substring(semi + 1);
    const segs = rest.split(/;|；/);

    const head = (segs[0] || '').split(/[_，,]/).map(s => s.trim()).filter(Boolean);
    const tail = (segs[1] || '').split(/[_，,]/).map(s => s.trim()).filter(Boolean);
    if (head.length === 0) return null;

    const headStr = head.join('_');
    const tailStr = tail.join('_');
    const title = tailStr ? `${headStr}-${rel}-${tailStr}` : `${headStr}-${rel}-`;

    return { title, relation: rel, head, tail };
  }
}
