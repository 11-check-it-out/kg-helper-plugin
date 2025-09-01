import { App, Notice, TFile, MarkdownView } from 'obsidian';
import moment from 'moment';
import { KGHelperSettings } from '../types';
import { sanitizeFileName } from '../utils/stringUtils';
import { getModifiedContent } from '../utils/frontmatterUtils';

/**
 * 查找文件 (按名称或别名)
 */
function findFile(sanitizedTitle: string, files: TFile[], app: App): TFile | null {
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
 * 获取模板内容
 */
async function getTemplateContent(templatePath: string, app: App): Promise<string | null> {
    const templateFile = app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) {
        new Notice(`错误: 模板文件未找到。\n路径是: "${templatePath}"`, 10000);
        return null;
    }
    return await app.vault.read(templateFile);
}

/**
 * "智能创建或链接笔记"命令的核心逻辑
 */
export async function createOrLinkNote(app: App, settings: KGHelperSettings, noteType: 'concept' | 'relation') {
    const templatePath = (noteType === 'concept' ? settings.conceptTemplatePath : settings.relationTemplatePath).trim();

    if (!templatePath) {
        new Notice(`请在插件设置中指定“${noteType === 'concept' ? '概念' : '关系'}模板文件路径”!`);
        return;
    }

    try {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const selection = editor?.getSelection()?.trim();

        // 场景1: 有选中文本
        if (selection && editor && activeView?.file) {
            const sanitizedTitle = sanitizeFileName(selection);
            if (!sanitizedTitle) { new Notice("错误: 清理后的文件名为空"); return; }

            const files = app.vault.getMarkdownFiles();
            const targetFile = findFile(sanitizedTitle, files, app);
            let noteToOpen: TFile;

            if (targetFile) {
                noteToOpen = targetFile;
            } else {
                const templateContent = await getTemplateContent(templatePath, app);
                if (templateContent === null) return;

                const uid = moment().format("YYYYMMDDHHmmss");
                const modifiedContent = getModifiedContent(templateContent, settings, uid, noteType, sanitizedTitle);
                
                const currentFolder = activeView.file.parent.path;
                const newFilePath = `${currentFolder === '/' ? '' : currentFolder}/${sanitizedTitle}.md`;
                noteToOpen = await app.vault.create(newFilePath, modifiedContent);
            }
            const linkText = noteToOpen.basename === selection ? `[[${noteToOpen.basename}]]` : `[[${noteToOpen.basename}|${selection}]]`;
            editor.replaceSelection(linkText);
            app.workspace.getLeaf('tab').openFile(noteToOpen);
            return;
        }

        // 场景2: 无选中文本
        const templateContent = await getTemplateContent(templatePath, app);
        if (templateContent === null) return;

        const uid = moment().format("YYYYMMDDHHmmss");
        const modifiedContent = getModifiedContent(templateContent, settings, uid, noteType);
        const noteTypeName = noteType === 'concept' ? '概念' : '关系';
        const newNoteName = `未命名${noteTypeName} ${moment().format("YYYY-MM-DD HHmmss")}`;
        
        let folder: string;
        const activeFile = app.workspace.getActiveFile();
        if (settings.newNoteLocationMode === 'fixed') {
            folder = settings.defaultFolder.trim();
        } else {
            folder = (activeFile && activeFile.parent) ? activeFile.parent.path : '/';
        }
        if (folder === '' || folder === '/') { folder = '/'; }
        
        const newFilePath = `${folder === '/' ? '' : folder}/${newNoteName}.md`;
        const newFile = await app.vault.create(newFilePath.replace(/^\//, ''), modifiedContent);
        await app.workspace.getLeaf('tab').openFile(newFile);
    } catch (err) {
        console.error("KG Helper Plugin - Error:", err);
        new Notice("发生未知错误, 请检查开发者控制台 (Ctrl+Shift+I)。");
    }
}

