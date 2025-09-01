import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, MarkdownView } from 'obsidian';
import moment from 'moment';

// 为插件设置定义一个接口(Interface), 描述了所有可配置的选项
interface KGHelperSettings {
    conceptTemplatePath: string;
    relationTemplatePath: string;
    newNoteLocationMode: 'fixed' | 'current'; // 【新】笔记存放模式
    defaultFolder: string;
    parentKey: string;
    inheritanceMode: 'full' | 'structure';
}

// 默认设置, 当用户第一次安装插件时使用
const DEFAULT_SETTINGS: KGHelperSettings = {
    conceptTemplatePath: '',
    relationTemplatePath: '',
    newNoteLocationMode: 'current', // 【新】默认为“当前目录”模式
    defaultFolder: '/',
    parentKey: 'parent',
    inheritanceMode: 'full',
}

// 默认模板文件的存放路径
const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md';

// -------------------- 插件主类 --------------------
export default class KGHelperPlugin extends Plugin {
    settings: KGHelperSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new KGHelperSettingTab(this.app, this));

        // --- 命令注册 ---
        this.addCommand({
            id: 'smart-create-concept-note',
            name: '智能创建或链接概念笔记',
            callback: () => this.createOrLinkNote('concept')
        });

        this.addCommand({
            id: 'smart-create-relation-note',
            name: '智能创建或链接关系笔记',
            callback: () => this.createOrLinkNote('relation')
        });

        this.addCommand({
            id: 'inherit-properties-from-parent',
            name: '从父笔记继承属性',
            editorCallback: () => this.inheritPropertiesFromParent()
        });

        this.addCommand({
            id: 'add-reverse-alias',
            name: '为关系笔记补全反向别名',
            editorCallback: () => this.addReverseAliasForCurrentNote()
        });
    }

    onunload() { }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- 核心功能函数 ---

    async addReverseAliasForCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
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

            await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                let aliases = frontmatter.aliases;
                if (!Array.isArray(aliases)) {
                    aliases = [];
                }
                if (aliases.includes(reverseAlias)) {
                    new Notice("反向别名已存在。");
                    return; // 通过返回来中断 processFrontMatter 的修改
                }
                if (!aliases.includes(reverseAlias)) {
                    aliases.push(reverseAlias);
                }
                frontmatter.aliases = aliases;
                new Notice(`成功添加别名: "${reverseAlias}"`);
            });

        } catch (err) {
            console.error("KG Helper Plugin - 添加别名时出错:", err);
            new Notice("发生未知错误, 请检查开发者控制台 (Ctrl+Shift+I)。");
        }
    }

    async inheritPropertiesFromParent() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("请先打开一个笔记文件。");
            return;
        }

        try {
            const fileCache = this.app.metadataCache.getFileCache(activeFile);
            const currentFrontmatter = fileCache?.frontmatter || {};
            const parentKey = this.settings.parentKey.trim();

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
                if (foundLinks) {
                    parentLinks.push(...foundLinks);
                } else {
                    parentLinks.push(parentLinksRaw);
                }
            }

            if (parentLinks.length === 0) {
                new Notice(`"${parentKey}" 属性中没有找到有效的笔记链接。`);
                return;
            }

            const propertiesToInherit: Record<string, any> = {};
            let inheritedCount = 0;

            for (const link of parentLinks) {
                const parentNoteName = this.parseWikilink(link);
                if (!parentNoteName) continue;

                const parentFile = this.app.metadataCache.getFirstLinkpathDest(parentNoteName, activeFile.path);
                if (!parentFile) {
                    new Notice(`警告: 未找到父笔记 "${parentNoteName}"。`);
                    continue;
                }

                const parentCache = this.app.metadataCache.getFileCache(parentFile);
                const parentFrontmatter = parentCache?.frontmatter || {};

                for (const key in parentFrontmatter) {
                    if (!currentFrontmatter.hasOwnProperty(key) && key !== 'position') {
                        if (this.settings.inheritanceMode === 'full') {
                            propertiesToInherit[key] = parentFrontmatter[key];
                        } else {
                            propertiesToInherit[key] = '';
                        }
                    }
                }
            }

            if (Object.keys(propertiesToInherit).length > 0) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    for (const key in propertiesToInherit) {
                        frontmatter[key] = propertiesToInherit[key];
                        inheritedCount++;
                    }
                });
                new Notice(`成功继承了 ${inheritedCount} 个属性。`);
            } else {
                new Notice("没有需要继承的新属性。");
            }

        } catch (err) {
            console.error("KG Helper Plugin - 继承属性时出错:", err);
            new Notice("发生未知错误, 请检查开发者控制台 (Ctrl+Shift+I)。");
        }
    }

    async createOrLinkNote(noteType: 'concept' | 'relation') {
        const templatePath = (noteType === 'concept'
            ? this.settings.conceptTemplatePath
            : this.settings.relationTemplatePath).trim();

        if (!templatePath) {
            new Notice(`请先在 KG Helper 插件设置中指定“${noteType === 'concept' ? '概念' : '关系'}模板文件路径”!`);
            return;
        }

        try {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = activeView?.editor;
            const selection = editor?.getSelection()?.trim();

            if (selection && editor && activeView?.file) {
                const sanitizedTitle = this.sanitizeFileName(selection);
                if (!sanitizedTitle) { new Notice("错误: 清理后的文件名为空"); return; }

                const files = this.app.vault.getMarkdownFiles();
                const targetFile = this.findFile(sanitizedTitle, files);
                let noteToOpen: TFile;

                if (targetFile) {
                    noteToOpen = targetFile;
                } else {
                    const templateContent = await this.getTemplateContent(templatePath);
                    if (templateContent === null) return;

                    const uid = moment().format("YYYYMMDDHHmmss");
                    const modifiedContent = this.getModifiedContent(templateContent, uid, noteType, sanitizedTitle);

                    // 【更新】根据设置决定新笔记的存放位置
                    let creationFolder: string;
                    if (this.settings.newNoteLocationMode === 'fixed') {
                        creationFolder = this.settings.defaultFolder.trim();
                        if (creationFolder === '') creationFolder = '/';
                    } else { // 'current' mode
                        creationFolder = this.app.fileManager.getNewFileParent(activeView.file.path).path;
                    }

                    const newFilePath = `${creationFolder === '/' ? '' : creationFolder}/${sanitizedTitle}.md`;
                    noteToOpen = await this.app.vault.create(newFilePath, modifiedContent);
                }
                const linkText = noteToOpen.basename === selection ? `[[${noteToOpen.basename}]]` : `[[${noteToOpen.basename}|${selection}]]`;
                editor.replaceSelection(linkText);
                this.app.workspace.getLeaf('tab').openFile(noteToOpen);
                return;
            }

            const templateContent = await this.getTemplateContent(templatePath);
            if (templateContent === null) return;

            const uid = moment().format("YYYYMMDDHHmmss");
            const modifiedContent = this.getModifiedContent(templateContent, uid, noteType);
            const noteTypeName = noteType === 'concept' ? '概念' : '关系';
            const newNoteName = `未命名${noteTypeName} ${moment().format("YYYY-MM-DD HHmmss")}`;
            
            // 【更新】根据设置决定新笔记的存放位置
            let folder: string;
            const activeFile = this.app.workspace.getActiveFile();
            if (this.settings.newNoteLocationMode === 'fixed') {
                folder = this.settings.defaultFolder.trim();
            } else { // 'current' mode
                if (activeFile) {
                    folder = this.app.fileManager.getNewFileParent(activeFile.path).path;
                } else {
                    folder = '/'; // 没有当前文件时, 回退到根目录
                }
            }
            if (folder === '' || folder === '/') { folder = '/'; }
            
            const newFilePath = `${folder === '/' ? '' : folder}/${newNoteName}.md`;
            const newFile = await this.app.vault.create(newFilePath.replace(/^\//, ''), modifiedContent);
            await this.app.workspace.getLeaf('tab').openFile(newFile);
        } catch (err) {
            console.error("KG Helper Plugin - Error:", err);
            new Notice("发生未知错误, 请检查开发者控制台 (Ctrl+Shift+I)。");
        }
    }

    // --- 内部辅助函数 ---

    findFile(sanitizedTitle: string, files: TFile[]): TFile | null {
        const lowerSanitizedTitle = sanitizedTitle.toLowerCase();
        const fileByName = files.find(file => file.basename.toLowerCase() === lowerSanitizedTitle);
        if (fileByName) return fileByName;

        for (const file of files) {
            const metadata = this.app.metadataCache.getFileCache(file);
            const aliases = metadata?.frontmatter?.aliases;
            if (aliases && Array.isArray(aliases)) {
                if (aliases.some(alias => String(alias).toLowerCase() === lowerSanitizedTitle)) {
                    return file;
                }
            }
        }
        return null;
    }

    async getTemplateContent(templatePath: string): Promise<string | null> {
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
        if (!(templateFile instanceof TFile)) {
            new Notice(`错误: 模板文件未找到。\n插件使用的路径是:\n"${templatePath}"`, 10000);
            return null;
        }
        return await this.app.vault.read(templateFile);
    }

    parseWikilink(link: string): string | null {
        if (typeof link !== 'string') return null;
        const match = link.match(/\[\[([^|\]]+)/);
        return match ? match[1].trim() : null;
    }

    sanitizeFileName(fileName: string): string {
        if (!fileName) return '';
        return fileName.replace(/[\\/:\*\?"<>\|]/g, '');
    }

    getModifiedContent(templateContent: string, uid: string, noteType: string, title?: string): string {
        const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const fmMatch = templateContent.match(fmRegex);

        const parentKey = this.settings.parentKey.trim() || 'parent';
        const desiredOrder = ['uid', 'aliases', 'type', parentKey, 'publish'];
        let frontmatterObject: Record<string, any> = {};

        if (fmMatch) {
            const fmContent = fmMatch[1];
            fmContent.split('\n').forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex > -1) {
                    const key = line.substring(0, colonIndex).trim();
                    let value: any = line.substring(colonIndex + 1).trim();

                    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
                        const listStr = value.substring(1, value.length - 1).trim();
                        if (listStr) {
                            value = listStr.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                        } else {
                            value = [];
                        }
                    }
                    if (key) { frontmatterObject[key] = value; }
                }
            });
        }

        frontmatterObject['uid'] = uid;
        frontmatterObject['type'] = noteType;

        if (noteType === 'relation' && title) {
            const parts = title.split('-');
            if (parts.length === 3) {
                const [conceptA, relation, conceptB] = parts.map(p => p.trim());
                if (relation === '关联' || relation === '对比') {
                    const reverseAlias = `${conceptB}-${relation}-${conceptA}`;
                    let currentAliases = frontmatterObject['aliases'];
                    if (!Array.isArray(currentAliases)) {
                        currentAliases = [];
                    }
                    if (!currentAliases.includes(reverseAlias)) {
                        currentAliases.push(reverseAlias);
                    }
                    frontmatterObject['aliases'] = currentAliases;
                }
            }
        }

        let newFmContent = '';
        const processedKeys = new Set<string>();

        desiredOrder.forEach(key => {
            if (frontmatterObject.hasOwnProperty(key)) {
                const value = frontmatterObject[key];
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        newFmContent += `${key}: []\n`;
                    } else {
                        newFmContent += `${key}:\n`;
                        value.forEach(item => {
                            newFmContent += `  - "${item}"\n`;
                        });
                    }
                } else {
                    newFmContent += `${key}: ${value || ''}\n`;
                }
                processedKeys.add(key);
            }
        });

        Object.keys(frontmatterObject).forEach(key => {
            if (!processedKeys.has(key)) {
                const value = frontmatterObject[key];
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        newFmContent += `${key}: []\n`;
                    } else {
                        newFmContent += `${key}:\n`;
                        value.forEach(item => {
                            newFmContent += `  - "${item}"\n`;
                        });
                    }
                } else {
                    newFmContent += `${key}: ${value || ''}\n`;
                }
            }
        });

        const newFmBlock = `---\n${newFmContent.trim()}\n---\n`;

        if (fmMatch) {
            return templateContent.replace(fmRegex, newFmBlock);
        } else {
            return newFmBlock + '\n' + templateContent;
        }
    }
}


// -------------------- 插件设置页面类 --------------------
class KGHelperSettingTab extends PluginSettingTab {
    plugin: KGHelperPlugin;

    constructor(app: App, plugin: KGHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'KG Helper 插件设置' });

        // 【新】为模板路径输入框创建自动补全的数据列表
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const templatePathsDatalist = document.createElement('datalist');
        templatePathsDatalist.id = 'kg-template-paths';
        for (const file of markdownFiles) {
            const option = document.createElement('option');
            option.value = file.path;
            templatePathsDatalist.appendChild(option);
        }
        containerEl.appendChild(templatePathsDatalist);

        new Setting(containerEl)
            .setName('概念模板文件路径')
            .addText(text => {
                // 【新】关联 datalist 以实现自动补全
                text.inputEl.setAttribute('list', 'kg-template-paths');
                text
                    .setPlaceholder('例如: templates/KG概念模板.md')
                    .setValue(this.plugin.settings.conceptTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.conceptTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => button
                .setButtonText('创建默认模板')
                .onClick(() => this.createDefaultTemplate('concept'))
            );

        new Setting(containerEl)
            .setName('关系模板文件路径')
            .addText(text => {
                // 【新】关联 datalist 以实现自动补全
                text.inputEl.setAttribute('list', 'kg-template-paths');
                text
                    .setPlaceholder('例如: templates/KG关系模板.md')
                    .setValue(this.plugin.settings.relationTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.relationTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => button
                .setButtonText('创建默认模板')
                .onClick(() => this.createDefaultTemplate('relation'))
            );

        // 【新】存放位置设置
        const defaultFolderSetting = new Setting(containerEl); // 创建一个容器以便控制其可见性
        
        new Setting(containerEl)
            .setName('新笔记存放位置')
            .setDesc('选择通过“选中文本”或“无选择”方式创建新笔记时的默认存放位置。')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('current', '在当前笔记同一目录存放')
                    .addOption('fixed', '在用户指定目录存放')
                    .setValue(this.plugin.settings.newNoteLocationMode)
                    .onChange(async (value: 'current' | 'fixed') => {
                        this.plugin.settings.newNoteLocationMode = value;
                        await this.plugin.saveSettings();
                        // 根据选择, 显示或隐藏下方的“指定目录”设置项
                        defaultFolderSetting.settingEl.style.display = value === 'fixed' ? '' : 'none';
                    });
            });

        defaultFolderSetting
            .setName('指定目录路径')
            .setDesc('当选择“在用户指定目录存放”时, 新笔记将存放在此。使用 "/" 代表根目录。')
            .addText(text => text
                .setPlaceholder('例如: inbox 或 /')
                .setValue(this.plugin.settings.defaultFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFolder = value;
                    await this.plugin.saveSettings();
                }));
        // 根据初始值决定是否显示
        defaultFolderSetting.settingEl.style.display = this.plugin.settings.newNoteLocationMode === 'fixed' ? '' : 'none';

        new Setting(containerEl)
            .setName('父概念关键词')
            .addText(text => text
                .setPlaceholder('例如: parent 或 父概念')
                .setValue(this.plugin.settings.parentKey)
                .onChange(async (value) => {
                    this.plugin.settings.parentKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('继承模式')
            .setDesc('选择从父笔记继承属性时的方式。')
            .addDropdown(dropdown => dropdown
                // 【修正】使用您要求的准确名称
                .addOption('full', '继承属性与值')
                .addOption('structure', '仅继承属性')
                .setValue(this.plugin.settings.inheritanceMode)
                .onChange(async (value: 'full' | 'structure') => {
                    this.plugin.settings.inheritanceMode = value;
                    await this.plugin.saveSettings();
                }));
    }

    async createDefaultTemplate(noteType: 'concept' | 'relation') {
        const path = noteType === 'concept' ? DEFAULT_CONCEPT_TEMPLATE_PATH : DEFAULT_RELATION_TEMPLATE_PATH;
        const settingKey = noteType === 'concept' ? 'conceptTemplatePath' : 'relationTemplatePath';

        try {
            const parentKey = this.plugin.settings.parentKey.trim() || 'parent';
            const dynamicTemplateContent = `---
uid: 
aliases: []
type: 
${parentKey}:
publish: true
---

# 概述

# 关系

# 对比

# 应用
`;
            const folder = 'templates';
            if (!await this.app.vault.adapter.exists(folder)) {
                await this.app.vault.createFolder(folder);
            }
            if (await this.app.vault.adapter.exists(path)) {
                new Notice('默认模板文件已存在, 操作取消。');
                return;
            }
            await this.app.vault.create(path, dynamicTemplateContent);
            this.plugin.settings[settingKey] = path;
            await this.plugin.saveSettings();
            this.display();
            new Notice(`默认模板已成功创建于 ${path}`);
        } catch (e) {
            console.error("创建默认模板失败:", e);
            new Notice("创建模板失败, 请检查开发者控制台。");
        }
    }
}

