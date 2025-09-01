import { App, Notice, TFile } from 'obsidian';

/**
 * 在指定笔记的特定章节下插入链接
 * @param app App 实例
 * @param conceptNoteFile 要修改的概念笔记文件
 * @param headingName 要寻找的章节标题 (不含 #)
 * @param linkText 要插入的 wikilink 文本
 */
export async function insertLinkUnderHeading(
    app: App,
    conceptNoteFile: TFile,
    headingName: string,
    linkText: string
): Promise<void> {
    if (!headingName) {
        new Notice(`警告: 未为 "${conceptNoteFile.basename}" 配置章节名, 链接追加至文末。`);
    }

    let content = await app.vault.read(conceptNoteFile);
    const lines = content.split('\n');
    
    // 确保链接格式正确
    const formattedLink = `- ${linkText}`;
    
    // 如果链接已存在, 则不进行任何操作
    if (content.includes(linkText)) {
        return;
    }

    let targetLine = -1;
    let headingLevel = -1;

    // 1. 寻找目标章节
    if (headingName) {
        const headingRegex = /^(#+)\s+(.*)/;
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(headingRegex);
            if (match && match[2].trim() === headingName.trim()) {
                targetLine = i;
                headingLevel = match[1].length;
                break;
            }
        }
    }

    // 2. 如果找到了章节, 确定插入位置
    if (targetLine !== -1) {
        let insertAt = lines.length; // 默认插入到最后
        // 从目标章节的下一行开始, 寻找下一个同级或更高级别的标题
        for (let i = targetLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(#+)\s+.*/);
            if (match && match[1].length <= headingLevel) {
                insertAt = i; // 找到了下一个标题, 应该插在它前面
                break;
            }
        }
        
        // 从后往前找到第一个非空行, 插入在其后
        let lastNonEmptyLine = insertAt - 1;
        while(lastNonEmptyLine > targetLine && lines[lastNonEmptyLine].trim() === '') {
            lastNonEmptyLine--;
        }
        
        lines.splice(lastNonEmptyLine + 1, 0, formattedLink);

    } else {
        // 3. 如果没找到章节, 或未配置章节名, 则追加到文章末尾
        if (content.trim().length > 0 && !content.endsWith('\n')) {
            content += '\n';
        }
        content += `\n${formattedLink}`;
        lines.splice(lines.length, 0, formattedLink); // 仅为更新内容用
    }
    
    await app.vault.modify(conceptNoteFile, lines.join('\n'));
}
