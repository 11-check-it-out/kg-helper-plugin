import { App, Notice } from 'obsidian';
import { TWPilotSettings } from '../types';
import { parseWikilink } from '../utils/stringUtils';

/**
 * "从父笔记继承属性"命令的核心逻辑
 */
export async function inheritPropertiesFromParent(app: App, settings: TWPilotSettings) {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("请先打开一个笔记文件。");
        return;
    }

    try {
        const fileCache = app.metadataCache.getFileCache(activeFile);
        const currentFrontmatter = fileCache?.frontmatter || {};
        const parentKey = settings.parentKey.trim();
        
        const parentLinksRaw = currentFrontmatter[parentKey];
        if (!parentLinksRaw) {
            new Notice(`当前笔记没有找到 "${parentKey}" 属性。`);
            return;
        }

        const parentLinks: string[] = [];
        if (Array.isArray(parentLinksRaw)) {
            parentLinks.push(...parentLinksRaw.filter(item => typeof item === 'string'));
        } else if (typeof parentLinksRaw === 'string') {
            const foundLinks = parentLinksRaw.match(/\[\[.*?\]\]/g);
            parentLinks.push(...(foundLinks || [parentLinksRaw]));
        }

        if (parentLinks.length === 0) {
            new Notice(`"${parentKey}" 属性中没有找到有效的笔记链接。`);
            return;
        }

        const propertiesToInherit: Record<string, any> = {};
        for (const link of parentLinks) {
            const parentNoteName = parseWikilink(link);
            if (!parentNoteName) continue;

            const parentFile = app.metadataCache.getFirstLinkpathDest(parentNoteName, activeFile.path);
            if (!parentFile) {
                new Notice(`警告: 未找到父笔记 "${parentNoteName}"。`);
                continue;
            }

            const parentCache = app.metadataCache.getFileCache(parentFile);
            const parentFrontmatter = parentCache?.frontmatter || {};

            for (const key in parentFrontmatter) {
                if (!currentFrontmatter.hasOwnProperty(key) && key !== 'position') {
                    propertiesToInherit[key] = settings.inheritanceMode === 'full' ? parentFrontmatter[key] : '';
                }
            }
        }

        if (Object.keys(propertiesToInherit).length > 0) {
            await app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                Object.assign(frontmatter, propertiesToInherit);
            });
            new Notice(`成功继承了 ${Object.keys(propertiesToInherit).length} 个属性。`);
        } else {
            new Notice("没有需要继承的新属性。");
        }
    } catch (err) {
        console.error("ThoughtWeaver Pilot Plugin - 继承属性时出错:", err);
        new Notice("发生未知错误, 请检查开发者控制台。");
    }
}

