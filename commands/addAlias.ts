import { App, Notice, TFile } from 'obsidian';

/**
 * "为关系笔记补全反向别名"命令的核心逻辑
 */
export async function addReverseAliasForCurrentNote(app: App) {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("请先打开一个笔记文件。");
        return;
    }

    try {
        const title = activeFile.basename;
        const parts = title.split('-');
        
        if (parts.length !== 3) {
            new Notice("这不是一个标准的关系笔记标题 (例如: a-关联-b)。");
            return;
        }

        const [conceptA, relation, conceptB] = parts.map(p => p.trim());

        if (relation !== '关联' && relation !== '对比') {
            new Notice("只有“关联”和“对比”类型的关系笔记需要补全反向别名。");
            return;
        }

        const reverseAlias = `${conceptB}-${relation}-${conceptA}`;

        await app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            let aliases = frontmatter.aliases;
            if (!Array.isArray(aliases)) {
                aliases = [];
            }
            if (aliases.includes(reverseAlias)) {
                new Notice("反向别名已存在。");
                return; // 中断修改
            }
            if (!aliases.includes(reverseAlias)) {
                aliases.push(reverseAlias);
            }
            frontmatter.aliases = aliases;
            new Notice(`成功添加别名: "${reverseAlias}"`);
        });

    } catch (err) {
        console.error("ThoughtWeaver Pilot Plugin - 添加别名时出错:", err);
        new Notice("发生未知错误, 请检查开发者控制台。");
    }
}

