import { App, Notice, TFile } from 'obsidian';

/**
 * 查找文件 (按名称或别名)
 */
export function findFile(sanitizedTitle: string, app: App): TFile | null {
    const files = app.vault.getMarkdownFiles();
    const lowerSanitizedTitle = sanitizedTitle.toLowerCase();
    const fileByName = files.find(file => file.basename.toLowerCase() === lowerSanitizedTitle);
    if (fileByName) return fileByName;

    for (const file of files) {
        const metadata = app.metadataCache.getFileCache(file);
        const aliases = metadata?.frontmatter?.aliases;
        if (aliases && Array.isArray(aliases)) {
            if (aliases.some(alias => String(alias).toLowerCase() === lowerSanitizedTitle)) {
                return file;
            }
        }
    }
    return null;
}

/**
 * 安全地读取模板文件的内容
 */
export async function getTemplateContent(templatePath: string, app: App): Promise<string | null> {
    const templateFile = app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) {
        new Notice(`错误: 模板文件未找到。\n路径是: "${templatePath}"`, 10000);
        return null;
    }
    return await app.vault.read(templateFile);
}

