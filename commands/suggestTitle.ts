import { App, Modal, Notice, Setting } from 'obsidian';
import { TWPilotSettings } from '../types';
import { suggestTitleWithAI } from '../utils/aiService';

/**
 * 用于显示 AI 标题建议的弹窗
 */
class SuggestionModal extends Modal {
    suggestedTitle: string;
    reasoning: string;
    onSubmit: (title: string) => void;

    constructor(app: App, title: string, reasoning: string, onSubmit: (title: string) => void) {
        super(app);
        this.suggestedTitle = title;
        this.reasoning = reasoning;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'AI 标题建议' });

        // 显示 AI 的理由
        const reasoningEl = contentEl.createEl('p', { text: `理由: ${this.reasoning}` });
        reasoningEl.style.color = 'var(--text-muted)';
        reasoningEl.style.fontSize = 'var(--font-ui-small)';
        
        // 可编辑的输入框，允许用户修改
        new Setting(contentEl)
            .setName('建议标题')
            .addText(text =>
                text.setValue(this.suggestedTitle)
                    .onChange(value => {
                        this.suggestedTitle = value;
                    })
                    .inputEl.style.width = '100%'
            );
        
        // 操作按钮
        new Setting(contentEl)
            .addButton(btn =>
                btn.setButtonText('应用')
                    .setCta() // "Call To Action" 样式，使其更突出
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.suggestedTitle);
                    }))
            .addButton(btn =>
                btn.setButtonText('取消')
                    .onClick(() => {
                        this.close();
                    }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

/**
 * "AI 建议标题" 命令的核心逻辑
 */
export async function suggestTitleCommand(app: App, settings: TWPilotSettings) {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice('请先打开一个笔记文件。');
        return;
    }

    const content = await app.vault.read(activeFile);
    if (!content.trim()) {
        new Notice('笔记内容为空，无法提供建议。');
        return;
    }

    const thinkingNotice = new Notice('AI 正在思考...', 0); // 0 表示通知不会自动消失

    try {
        const suggestion = await suggestTitleWithAI(content, settings);
        thinkingNotice.hide(); // 收到结果后隐藏 "思考中" 通知

        if (suggestion) {
            new SuggestionModal(app, suggestion.title, suggestion.reasoning, async (finalTitle) => {
                const newPath = activeFile.parent.path === '/' 
                    ? `${finalTitle}.md` 
                    : `${activeFile.parent.path}/${finalTitle}.md`;
                
                try {
                    await app.fileManager.renameFile(activeFile, newPath);
                    new Notice(`笔记已重命名为: ${finalTitle}`);
                } catch (renameError) {
                    console.error("ThoughtWeaver Pilot Rename Error:", renameError);
                    new Notice('重命名失败，可能已存在同名文件。');
                }
            }).open();
        }
    } catch (error) {
        thinkingNotice.hide();
        // 错误通知已在 aiService 中处理
    }
}
