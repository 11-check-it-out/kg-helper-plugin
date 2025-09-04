import { App, Notice, TFile } from 'obsidian';
import moment from 'moment';
import { TWPilotSettings } from '../types';
import { getModifiedContent } from '../utils/frontmatterUtils';
import { getTemplateContent, findFile } from '../utils/fileUtils';
import { sanitizeFileName } from '../utils/stringUtils';
import { insertLinkUnderHeading } from '../utils/fileModificationUtils';

/**
 * 自动创建不存在的概念笔记
 */
async function autoCreateConceptNotes(
    app: App,
    settings: TWPilotSettings,
    conceptNames: string[]
): Promise<void> {
    const templatePath = settings.conceptTemplatePath.trim();
    if (!templatePath) {
        new Notice("警告: 未设置概念模板路径, 无法自动创建概念笔记。");
        return;
    }

    const templateContent = await getTemplateContent(templatePath, app);
    if (templateContent === null) return;

    for (const name of conceptNames) {
        const sanitizedName = sanitizeFileName(name);
        if (sanitizedName && !findFile(sanitizedName, app)) {
            const uid = moment().format("YYYYMMDDHHmmss");
            const modifiedContent = getModifiedContent(templateContent, settings, uid, 'concept', sanitizedName);
            
            let folder = settings.defaultFolder.trim();
            if (folder === '' || folder === '/') folder = '/';
            const newFilePath = `${folder === '/' ? '' : folder}/${sanitizedName}.md`;

            try {
                await app.vault.create(newFilePath.replace(/^\//, ''), modifiedContent);
                new Notice(`已自动创建概念笔记: "${sanitizedName}"`);
            } catch (e) {
                console.error("创建概念笔记失败: ", e);
                new Notice(`创建笔记 "${sanitizedName}" 失败。`);
            }
        }
    }
}

/**
 * 【新】在概念笔记中自动插入链接
 */
async function autoInsertRelationLink(
    app: App,
    settings: TWPilotSettings,
    relationFile: TFile,
    relationType: string,
    headConcepts: string[],
    tailConcepts: string[]
) {
    const linkText = `[[${relationFile.basename}]]`;
    const config = settings.relationLinkConfigs[relationType];
    
    if (!config) {
        console.warn(`ThoughtWeaver Pilot: 未找到关系类型 "${relationType}" 的链接配置。`);
        return;
    }

    // 为头部概念插入链接
    for (const conceptName of headConcepts) {
        const file = findFile(sanitizeFileName(conceptName), app);
        if (file) {
            await insertLinkUnderHeading(app, file, config.headSection, linkText);
        }
    }

    // 为尾部概念插入链接
    for (const conceptName of tailConcepts) {
        const file = findFile(sanitizeFileName(conceptName), app);
        if (file) {
            await insertLinkUnderHeading(app, file, config.tailSection, linkText);
        }
    }
}


/**
 * 根据快捷输入的结果, 创建一篇新的关系笔记
 */
export async function createRelationNoteFromSuggester(
    app: App,
    settings: TWPilotSettings,
    title: string,
    relationType: string,
    headConcepts: string[],
    tailConcepts: string[]
): Promise<TFile | null> {
    // 如果设置开启, 则自动创建不存在的概念笔记
    if (settings.autoCreateConcepts) {
        const allConcepts = [...headConcepts, ...tailConcepts];
        await autoCreateConceptNotes(app, settings, allConcepts);
    }
    
    const templatePath = settings.relationTemplatePath.trim();
    if (!templatePath) {
        new Notice("请先在 ThoughtWeaver Pilot 插件设置中指定“关系模板文件路径”!");
        return null;
    }

    const templateContent = await getTemplateContent(templatePath, app);
    if (templateContent === null) return null;

    const uid = moment().format("YYYYMMDDHHmmss");
    const modifiedContent = getModifiedContent(templateContent, settings, uid, 'relation', title);
    
    let folder: string;
    const activeFile = app.workspace.getActiveFile();
    if (settings.newNoteLocationMode === 'fixed') {
        folder = settings.defaultFolder.trim();
    } else {
        folder = (activeFile && activeFile.parent) ? activeFile.parent.path : '/';
    }
    if (folder === '' || folder === '/') folder = '/';
    
    const sanitizedTitle = sanitizeFileName(title);
    const newFilePath = `${folder === '/' ? '' : folder}/${sanitizedTitle}.md`;
    
    const existingFile = app.vault.getAbstractFileByPath(newFilePath.replace(/^\//, ''));
    if (existingFile) {
        new Notice(`笔记 "${sanitizedTitle}" 已存在。`);
        return existingFile as TFile;
    }

    const newFile = await app.vault.create(newFilePath.replace(/^\//, ''), modifiedContent);
    new Notice(`成功创建笔记: ${sanitizedTitle}`);

    // 【新】如果开启了自动链接, 执行链接插入操作
    if (settings.autoLinkOnCreation && newFile) {
        await autoInsertRelationLink(app, settings, newFile, relationType, headConcepts, tailConcepts);
    }

    return newFile;
}
