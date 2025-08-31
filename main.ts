import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, MarkdownView, TextComponent } from 'obsidian';
import moment from 'moment';

// 为插件设置定义一个接口(Interface), 描述了所有可配置的选项
interface KGHelperSettings {
    conceptTemplatePath: string;
    relationTemplatePath: string; // 【新】关系模板路径
    defaultFolder: string;
    parentKey: string;
}

// 默认设置, 当用户第一次安装插件时使用
const DEFAULT_SETTINGS: KGHelperSettings = {
    conceptTemplatePath: '',
    relationTemplatePath: '', // 【新】
    defaultFolder: '/', 
    parentKey: 'parent',
}

// 默认模板文件的存放路径
const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md'; // 【新】

// -------------------- 插件主类 --------------------
export default class KGHelperPlugin extends Plugin {
    settings: KGHelperSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new KGHelperSettingTab(this.app, this));

        // 命令1: 创建概念笔记
        this.addCommand({
            id: 'smart-create-concept-note',
            name: '智能创建或链接概念笔记',
            callback: () => {
                if (!this.settings.conceptTemplatePath || !this.settings.conceptTemplatePath.trim()) {
                    new Notice("请先在 KG Helper 插件设置中指定“概念模板文件路径”!");
                    return;
                }
                this.createOrLinkNote('concept');
            }
        });

        // 【新】命令2: 创建关系笔记
        this.addCommand({
            id: 'smart-create-relation-note',
            name: '智能创建或链接关系笔记',
            callback: () => {
                if (!this.settings.relationTemplatePath || !this.settings.relationTemplatePath.trim()) {
                    new Notice("请先在 KG Helper 插件设置中指定“关系模板文件路径”!");
                    return;
                }
                this.createOrLinkNote('relation');
            }
        });
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- 【重构】核心功能函数 ---
    // 将概念和关系笔记的创建逻辑合并到一个通用函数中
    async createOrLinkNote(noteType: 'concept' | 'relation') {
        try {
            const templatePath = (noteType === 'concept' 
                ? this.settings.conceptTemplatePath 
                : this.settings.relationTemplatePath).trim();

            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = activeView?.editor;
            const selection = editor?.getSelection()?.trim();

            // 场景1: 有选中文本, 创建或链接
            if (selection && editor && activeView?.file) {
                const sanitizedTitle = this.sanitizeFileName(selection);
                if (!sanitizedTitle) { new Notice("错误: 清理后的文件名为空"); return; }
                
                const lowerSanitizedTitle = sanitizedTitle.toLowerCase();
                const files = this.app.vault.getMarkdownFiles();
                const fileByName = files.find(file => file.basename.toLowerCase() === lowerSanitizedTitle);
                let fileByAlias: TFile | null = null;
                
                if (!fileByName) {
                    for (const file of files) {
                        const metadata = this.app.metadataCache.getFileCache(file);
                        const aliases = metadata?.frontmatter?.aliases;
                        if (aliases && Array.isArray(aliases)) {
                            if (aliases.some(alias => String(alias).toLowerCase() === lowerSanitizedTitle)) {
                                fileByAlias = file;
                                break;
                            }
                        }
                    }
                }
                
                const targetFile = fileByName || fileByAlias;
                let noteToOpen: TFile;

                if (targetFile) {
                    noteToOpen = targetFile;
                } else {
                    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
                    if (!(templateFile instanceof TFile)) {
                        new Notice(`错误: 模板文件未找到。\n插件使用的路径是:\n"${templatePath}"`, 10000);
                        return;
                    }
                    const templateContent = await this.app.vault.read(templateFile);
                    const uid = moment().format("YYYYMMDDHHmmss");
                    // 【新】创建关系笔记时, 传入标题以生成反向别名
                    const modifiedContent = this.getModifiedContent(templateContent, uid, noteType, sanitizedTitle);
                    
                    const currentFilePath = activeView.file.path;
                    const currentFolder = this.app.fileManager.getNewFileParent(currentFilePath).path;
                    const newFilePath = `${currentFolder === '/' ? '' : currentFolder}/${sanitizedTitle}.md`;
                    noteToOpen = await this.app.vault.create(newFilePath, modifiedContent);
                }
                const linkText = noteToOpen.basename === selection ? `[[${noteToOpen.basename}]]` : `[[${noteToOpen.basename}|${selection}]]`;
                editor.replaceSelection(linkText);
                this.app.workspace.getLeaf('tab').openFile(noteToOpen);
                return;
            }

            // 场景2: 没有选中文本, 创建一篇新的
            const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
            if (!(templateFile instanceof TFile)) {
                new Notice(`错误: 模板文件未找到。\n插件使用的路径是:\n"${templatePath}"`, 10000);
                return;
            }
            const templateContent = await this.app.vault.read(templateFile);
            const uid = moment().format("YYYYMMDDHHmmss");
            const modifiedContent = this.getModifiedContent(templateContent, uid, noteType);
            const noteTypeName = noteType === 'concept' ? '概念' : '关系';
            const newNoteName = `未命名${noteTypeName} ${moment().format("YYYY-MM-DD HHmmss")}`;
            let folder = this.settings.defaultFolder.trim();
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
    sanitizeFileName(fileName: string): string {
        if (!fileName) return '';
        return fileName.replace(/[\\/:\*\?"<>\|]/g, '');
    }

    // 【更新】增加 title 参数, 用于处理关系笔记的别名
    getModifiedContent(templateContent: string, uid: string, noteType: string, title?: string): string {
        const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const fmMatch = templateContent.match(fmRegex);

        const parentKey = this.settings.parentKey.trim() || 'parent';
        const desiredOrder = ['uid', 'aliases', 'type', parentKey, 'publish'];
        let frontmatterObject: Record<string, any> = {};

        if (fmMatch) {
            const fmContent = fmMatch[1];
            fmContent.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    if (key) { frontmatterObject[key] = value; }
                }
            });
        }
        
        frontmatterObject['uid'] = uid;
        frontmatterObject['type'] = noteType;

        // 【新】为关系笔记添加反向别名
        if (noteType === 'relation' && title) {
            const parts = title.split('-');
            if (parts.length === 3) {
                const [conceptA, relation, conceptB] = parts.map(p => p.trim());
                if (relation === '关联' || relation === '对比') {
                    const reverseAlias = `${conceptB}-${relation}-${conceptA}`;
                    let currentAliases = frontmatterObject['aliases'] || '[]';
                    let aliasListStr = currentAliases.substring(1, currentAliases.length - 1).trim();
                    
                    const aliasList = aliasListStr ? aliasListStr.split(',').map(s => s.trim()) : [];
                    if (!aliasList.includes(reverseAlias)) {
                        aliasList.push(reverseAlias);
                    }
                    frontmatterObject['aliases'] = `[${aliasList.join(', ')}]`;
                }
            }
        }

        let newFmContent = '';
        const processedKeys = new Set<string>();

        desiredOrder.forEach(key => {
            if (frontmatterObject.hasOwnProperty(key)) {
                newFmContent += `${key}: ${frontmatterObject[key]}\n`;
                processedKeys.add(key);
            }
        });

        Object.keys(frontmatterObject).forEach(key => {
            if (!processedKeys.has(key)) {
                newFmContent += `${key}: ${frontmatterObject[key]}\n`;
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

        // -- 概念模板设置 --
        new Setting(containerEl)
            .setName('概念模板文件路径')
            .setDesc('用于创建“概念笔记”的模板文件。')
            .addText(text => {
                text
                    .setPlaceholder('例如: templates/KG概念模板.md')
                    .setValue(this.plugin.settings.conceptTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.conceptTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('创建默认模板')
                    .setTooltip('在仓库中自动创建一个推荐的模板文件')
                    .onClick(async () => {
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
                        await this.createDefaultTemplate(DEFAULT_CONCEPT_TEMPLATE_PATH, dynamicTemplateContent, 'conceptTemplatePath');
                    });
            });

        // 【新】关系模板设置
        new Setting(containerEl)
            .setName('关系模板文件路径')
            .setDesc('用于创建“关系笔记”的模板文件。')
            .addText(text => {
                text
                    .setPlaceholder('例如: templates/KG关系模板.md')
                    .setValue(this.plugin.settings.relationTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.relationTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('创建默认模板')
                    .setTooltip('在仓库中自动创建一个推荐的模板文件')
                    .onClick(async () => {
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
                        await this.createDefaultTemplate(DEFAULT_RELATION_TEMPLATE_PATH, dynamicTemplateContent, 'relationTemplatePath');
                    });
            });


        new Setting(containerEl)
            .setName('新笔记默认存放文件夹')
            .setDesc('当没有选中文本时, 新创建的笔记将存放在此文件夹。使用 "/" 代表根目录。')
            .addText(text => text
                .setPlaceholder('例如: inbox 或 /')
                .setValue(this.plugin.settings.defaultFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFolder = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('父概念关键词')
            .setDesc('在 frontmatter 中用于表示继承关系的关键词。')
            .addText(text => text
                .setPlaceholder('例如: parent 或 父概念')
                .setValue(this.plugin.settings.parentKey)
                .onChange(async (value) => {
                    this.plugin.settings.parentKey = value;
                    await this.plugin.saveSettings();
                }));
    }

    // 【新】创建默认模板的辅助函数
    async createDefaultTemplate(path: string, content: string, settingKey: 'conceptTemplatePath' | 'relationTemplatePath') {
        try {
            const folder = 'templates';
            if (!await this.app.vault.adapter.exists(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const templateExists = await this.app.vault.adapter.exists(path);
            if (templateExists) {
                new Notice('默认模板文件已存在, 操作取消。');
                return;
            }
            await this.app.vault.create(path, content);
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

