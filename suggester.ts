import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile, App } from 'obsidian';
import KGHelperPlugin from './main';
import { createRelationNoteFromSuggester } from './commands/quickCreate';

// 定义建议项的类型
interface Suggestion {
    label: string;
    value: string;
    type: 'type' | 'concept' | 'final';
}

// 关系类型及其描述
const RELATION_TYPES: Record<string, string> = { 'i': '影响', 'c': '对比', 'a': '关联', 'u': '应用' };

export class RelationSuggester extends EditorSuggest<Suggestion> {
    plugin: KGHelperPlugin;
    private allNotes: TFile[];

    constructor(plugin: KGHelperPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        // 更新笔记缓存, 确保获取最新列表
        this.allNotes = this.app.vault.getMarkdownFiles(); 
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        const match = line.match(/(?:^|\s)(@@)(.*)/); // 匹配行首或空格后的 @@
        
        if (match) {
            const triggerStr = match[1];
            const query = match[2] || '';
            const triggerStart = line.lastIndexOf(triggerStr);
            
            return {
                start: { line: cursor.line, ch: triggerStart },
                end: cursor,
                query: query,
            };
        }
        return null;
    }

    getSuggestions(context: EditorSuggestContext): Suggestion[] {
        const query = context.query;
        const parts = query.split(/;|；/);
        const lastPart = parts[parts.length - 1];
        const lastWord = lastPart.split(/_/).pop()?.trim() || '';

        const suggestions: Suggestion[] = [];
        const finalTitleParts = this.parseQueryToParts(query);

        // 始终将“最终创建”选项放在第一位 (如果语法有效)
        if (finalTitleParts) {
            suggestions.push({
                type: 'final',
                label: `创建笔记: ${finalTitleParts.title}`,
                value: query // 传递原始query, 以便在select时重新解析
            });
        }

        // 上下文1: 输入关系类型
        if (parts.length === 1 && !query.includes('；') && !query.includes(';')) {
            const filteredTypes = Object.entries(RELATION_TYPES)
                .filter(([abbr, name]) => abbr.startsWith(query.toLowerCase()) || name.startsWith(query));
            
            suggestions.push(...filteredTypes.map(([abbr, name]) => ({
                type: 'type',
                label: `${abbr}: ${name}`,
                value: `${abbr}； `
            })));
        }
        // 上下文2: 输入概念名称
        else if (lastWord) {
             const matchingNotes = this.allNotes
                .filter(file => file.basename.toLowerCase().includes(lastWord.toLowerCase()))
                .slice(0, 10);
            
            suggestions.push(...matchingNotes.map(file => ({
                type: 'concept',
                label: file.basename,
                value: file.basename
            })));
        }
        
        return suggestions;
    }

    renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
        el.setText(suggestion.label);
    }

    async selectSuggestion(suggestion: Suggestion, evt: MouseEvent | KeyboardEvent): Promise<void> {
        const editor = this.context.editor;
        const query = this.context.query;
        
        // 【核心交互】使用 Tab 键进行补全
        if (evt.key === 'Tab') {
            evt.preventDefault(); // 阻止默认的 Tab 行为
            
            if (suggestion.type === 'type' || suggestion.type === 'concept') {
                let newQuery;
                if (suggestion.type === 'type') {
                    newQuery = suggestion.value;
                } else {
                    const parts = query.split(/;|；/);
                    const lastPart = parts[parts.length - 1];
                    const words = lastPart.split(/_/);
                    words[words.length - 1] = suggestion.value; // 替换最后一个词
                    parts[parts.length - 1] = words.join('_');
                    newQuery = parts.join('；');
                }
                const newText = `@@${newQuery}`;
                editor.replaceRange(newText, this.context.start, this.context.end);
            }
            return;
        }

        // 【核心交互】使用 Enter 键进行最终创建
        if (evt.key === 'Enter') {
            if (suggestion.type === 'final') {
                const finalParts = this.parseQueryToParts(suggestion.value);
                if (!finalParts) return;

                const newFile = await createRelationNoteFromSuggester(this.plugin.app, this.plugin.settings, finalParts.title, finalParts.head, finalParts.tail);
                if (newFile) {
                    const linkText = `[[${newFile.basename}]]`;
                    editor.replaceRange(linkText, this.context.start, this.context.end);
                    this.app.workspace.getLeaf('tab').openFile(newFile);
                }
            }
        }
    }

    // --- 辅助函数 ---

    parseQueryToParts(query: string): { title: string; head: string[]; tail: string[] } | null {
        const firstSemicolon = query.indexOf(';') !== -1 ? query.indexOf(';') : query.indexOf('；');
        if (firstSemicolon === -1) return null;

        const typeAbbr = query.substring(0, firstSemicolon).trim().toLowerCase();
        const relationType = RELATION_TYPES[typeAbbr];
        if (!relationType) return null;

        const rest = query.substring(firstSemicolon + 1);
        const parts = rest.split(/;|；/);
        
        const headConcepts = (parts[0] || '').split(/_/).map(p => p.trim()).filter(Boolean);
        const tailConcepts = (parts[1] || '').split(/_/).map(p => p.trim()).filter(Boolean);
        
        if (headConcepts.length === 0) return null;

        const headStr = headConcepts.join('_');
        const tailStr = tailConcepts.join('_');

        const title = tailStr ? `${headStr}-${relationType}-${tailStr}` : `${headStr}-${relationType}-`;
        
        return { title, head: headConcepts, tail: tailConcepts };
    }
}

