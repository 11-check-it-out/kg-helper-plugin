import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import KGHelperPlugin from './main';
import { DEFAULT_CONCEPT_TEMPLATE_PATH, DEFAULT_RELATION_TEMPLATE_PATH } from './types';

/**
 * 插件的设置页面类
 */
export class KGHelperSettingTab extends PluginSettingTab {
    plugin: KGHelperPlugin;

    constructor(app: App, plugin: KGHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'KG Helper 插件设置' });

        // --- 自动补全所需的数据列表 ---
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const templatePathsDatalist = document.createElement('datalist');
        templatePathsDatalist.id = 'kg-template-paths';
        for (const file of markdownFiles) {
            const option = document.createElement('option');
            option.value = file.path;
            templatePathsDatalist.appendChild(option);
        }
        containerEl.appendChild(templatePathsDatalist);

        const folders = new Set<string>();
        folders.add('/');
        for (const file of this.app.vault.getFiles()) {
            if (file.parent) {
                folders.add(file.parent.path);
            }
        }
        const folderPaths = Array.from(folders).sort();
        const folderPathsDatalist = document.createElement('datalist');
        folderPathsDatalist.id = 'kg-folder-paths';
        for (const folderPath of folderPaths) {
            const option = document.createElement('option');
            option.value = folderPath;
            folderPathsDatalist.appendChild(option);
        }
        containerEl.appendChild(folderPathsDatalist);

        // --- 设置项 ---
        new Setting(containerEl)
            .setName('概念模板文件路径')
            .addText(text => {
                text.inputEl.setAttribute('list', 'kg-template-paths');
                text.setPlaceholder('例如: templates/KG概念模板.md').setValue(this.plugin.settings.conceptTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.conceptTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => button.setButtonText('创建默认模板').onClick(() => this.createDefaultTemplate('concept')));

        new Setting(containerEl)
            .setName('关系模板文件路径')
            .addText(text => {
                text.inputEl.setAttribute('list', 'kg-template-paths');
                text.setPlaceholder('例如: templates/KG关系模板.md').setValue(this.plugin.settings.relationTemplatePath)
                    .onChange(async (value) => {
                        this.plugin.settings.relationTemplatePath = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => button.setButtonText('创建默认模板').onClick(() => this.createDefaultTemplate('relation')));

        let defaultFolderSetting: Setting;
        new Setting(containerEl)
            .setName('新笔记存放位置')
            .setDesc('选择通过“选中文本”或“无选择”方式创建新笔记时的默认存放位置。')
            .addDropdown(dropdown => {
                dropdown.addOption('current', '在当前笔记同一目录存放').addOption('fixed', '在用户指定目录存放')
                    .setValue(this.plugin.settings.newNoteLocationMode)
                    .onChange(async (value: 'current' | 'fixed') => {
                        this.plugin.settings.newNoteLocationMode = value;
                        await this.plugin.saveSettings();
                        if (defaultFolderSetting) {
                            defaultFolderSetting.settingEl.style.display = value === 'fixed' ? '' : 'none';
                        }
                    });
            });

        defaultFolderSetting = new Setting(containerEl)
            .setName('指定目录路径')
            .setDesc('当选择“在用户指定目录存放”时, 新笔记将存放在此。使用 "/" 代表根目录。')
            .addText(text => {
                text.inputEl.setAttribute('list', 'kg-folder-paths');
                text.setPlaceholder('例如: inbox 或 /').setValue(this.plugin.settings.defaultFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultFolder = value;
                        await this.plugin.saveSettings();
                    });
            });
        defaultFolderSetting.settingEl.style.display = this.plugin.settings.newNoteLocationMode === 'fixed' ? '' : 'none';

        new Setting(containerEl)
            .setName('父概念属性名称')
            .setDesc('修改此处不会自动更新您现有的模板文件。您可以通过“创建默认模板”按钮来生成使用新名称的模板。')
            .addText(text => text.setPlaceholder('例如: parent 或 父概念').setValue(this.plugin.settings.parentKey)
                .onChange(async (value) => {
                    this.plugin.settings.parentKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('继承模式')
            .setDesc('选择从父笔记继承属性时的方式。')
            .addDropdown(dropdown => dropdown
                .addOption('full', '继承属性与值').addOption('structure', '仅继承属性')
                .setValue(this.plugin.settings.inheritanceMode)
                .onChange(async (value: 'full' | 'structure') => {
                    this.plugin.settings.inheritanceMode = value;
                    await this.plugin.saveSettings();
                }));

        // 【新】自动创建概念笔记的开关
        new Setting(containerEl)
            .setName('自动创建不存在的概念笔记')
            .setDesc('开启后, 当使用快捷指令(例如 @@i;...)时, 如果头部或尾部的概念笔记不存在, 插件将自动为您创建它们。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCreateConcepts)
                .onChange(async (value) => {
                    this.plugin.settings.autoCreateConcepts = value;
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

# 关联

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

