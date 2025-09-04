import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import TWPilotPlugin from './main';
import { DEFAULT_CONCEPT_TEMPLATE_PATH, DEFAULT_RELATION_TEMPLATE_PATH, AIProvider } from './types';
import { testAIConnection } from './utils/aiService'; // <-- CORRECTED PATH

export class TWPilotSettingTab extends PluginSettingTab {
    plugin: TWPilotPlugin;

    constructor(app: App, plugin: TWPilotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'ThoughtWeaver Pilot 插件设置' });

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

        // --- 基础设置 ---
        containerEl.createEl('h3', { text: '基础设置' });

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

        // --- 快捷创建设置 ---
        containerEl.createEl('h3', { text: '快捷创建 (@@)' });

        new Setting(containerEl)
            .setName('自动创建不存在的概念笔记')
            .setDesc('开启后, 当使用快捷指令(例如 @@i;...)时, 如果头部或尾部的概念笔记不存在, 插件将自动为您创建它们。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCreateConcepts)
                .onChange(async (value) => {
                    this.plugin.settings.autoCreateConcepts = value;
                    await this.plugin.saveSettings();
                }));
        
        const autoLinkSetting = new Setting(containerEl)
            .setName('自动在概念笔记中插入链接')
            .setDesc('开启后, 当创建关系笔记时, 会自动在所涉及的概念笔记的指定章节下追加链接。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLinkOnCreation)
                .onChange(async (value) => {
                    this.plugin.settings.autoLinkOnCreation = value;
                    await this.plugin.saveSettings();
                    relationLinkConfigContainer.style.display = value ? '' : 'none';
                }));
        
        const relationLinkConfigContainer = containerEl.createDiv();
        relationLinkConfigContainer.style.display = this.plugin.settings.autoLinkOnCreation ? '' : 'none';
        
        const descFragment = document.createDocumentFragment();
        descFragment.append(
            '当创建形如“概念A - 关系 - 概念B”的笔记时，插件会自动将这篇关系笔记的链接，分别插入到“概念A”和“概念B”笔记的指定章节末尾。',
            descFragment.createEl('br'),
            '左侧输入框对应“概念A”(关系发起方)，右侧输入框对应“概念B”(关系接收方)。'
        );
        new Setting(relationLinkConfigContainer)
            .setDesc(descFragment);

        const relationTypes: { [key: string]: { headDesc: string; tailDesc: string } } = {
            '关联': { headDesc: '关联方 (A)', tailDesc: '关联方 (B)' },
            '对比': { headDesc: '对比方 (A)', tailDesc: '对比方 (B)' },
            '影响': { headDesc: '影响发起方 (A)', tailDesc: '影响接收方 (B)' },
            '应用': { headDesc: '应用技术 (A)', tailDesc: '应用领域 (B)' }
        };
        
        const displayOrder = ['关联', '对比', '影响', '应用'];

        for (const type of displayOrder) {
            const config = relationTypes[type];
            new Setting(relationLinkConfigContainer)
                .setName(`“${type}”关系`)
                .addText(text => {
                    text.setPlaceholder(config.headDesc)
                        .setValue(this.plugin.settings.relationLinkConfigs[type]?.headSection || '')
                        .onChange(async (value) => {
                            this.plugin.settings.relationLinkConfigs[type].headSection = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addText(text => {
                    text.setPlaceholder(config.tailDesc)
                        .setValue(this.plugin.settings.relationLinkConfigs[type]?.tailSection || '')
                        .onChange(async (value) => {
                            this.plugin.settings.relationLinkConfigs[type].tailSection = value;
                            await this.plugin.saveSettings();
                        });
                });
        }

        // --- AI 功能设置 ---
        containerEl.createEl('h3', { text: 'AI 功能设置' });

        new Setting(containerEl)
            .setName('AI 服务提供商')
            .setDesc('选择用于“AI建议标题”功能的语言模型服务。')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('gemini', 'Google Gemini')
                    .addOption('deepseek', 'DeepSeek')
                    .setValue(this.plugin.settings.aiProvider)
                    .onChange(async (value: AIProvider) => {
                        this.plugin.settings.aiProvider = value;
                        await this.plugin.saveSettings();
                        this.display(); 
                    });
            });

        const handleTestClick = async (button: any) => {
            button.setDisabled(true).setButtonText("测试中...");
            const success = await testAIConnection(this.plugin.settings);
            if (success) {
                new Notice("连接成功！API Key 有效。", 5000);
            }
            // 失败的 Notice 已经在 testAIConnection 内部处理了
            button.setDisabled(false).setButtonText("测试连接");
        };

        if (this.plugin.settings.aiProvider === 'gemini') {
            new Setting(containerEl)
                .setName('Google Gemini API Key')
                .setDesc('在此处输入您的 Google AI Gemini API Key。')
                .addText(text => text
                    .setPlaceholder('请输入 Gemini API Key')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.setAttribute('type', 'password')
                )
                .addButton(button => button
                    .setButtonText("测试连接")
                    .onClick(() => handleTestClick(button))
                );
        }

        if (this.plugin.settings.aiProvider === 'deepseek') {
            new Setting(containerEl)
                .setName('DeepSeek API Key')
                .setDesc('在此处输入您的 DeepSeek API Key。')
                .addText(text => text
                    .setPlaceholder('请输入 DeepSeek API Key')
                    .setValue(this.plugin.settings.deepseekApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.deepseekApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.setAttribute('type', 'password')
                )
                .addButton(button => button
                    .setButtonText("测试连接")
                    .onClick(() => handleTestClick(button))
                );
        }
    }

    async createDefaultTemplate(noteType: 'concept' | 'relation') {
        const path = noteType === 'concept' ? DEFAULT_CONCEPT_TEMPLATE_PATH : DEFAULT_RELATION_TEMPLATE_PATH;
        const settingKey = noteType === 'concept' ? 'conceptTemplatePath' : 'relationTemplatePath';
        
        try {
            const parentKey = this.plugin.settings.parentKey.trim() || 'parent';
            const templateContent = `---
uid: 
aliases: []
type: ${noteType}
${parentKey}:
publish: true
---

# 概述



# 关联



# 对比



# 影响因素



# 影响



# 应用
`;
            const folder = 'templates';
            if (!await this.app.vault.adapter.exists(folder)) {
                await this.app.vault.createFolder(folder);
            }
            if (await this.app.vault.adapter.exists(path)) {
                const noteTypeName = noteType === 'concept' ? '概念' : '关系';
                new Notice(`默认${noteTypeName}模板文件已存在, 操作取消。`);
                return;
            }
            await this.app.vault.create(path, templateContent);
            this.plugin.settings[settingKey] = path;
            await this.plugin.saveSettings();
            this.display();
            const noteTypeName = noteType === 'concept' ? '概念' : '关系';
            new Notice(`默认${noteTypeName}模板已成功创建于 ${path}`);
        } catch (e) {
            console.error("创建默认模板失败:", e);
            new Notice("创建模板失败, 请检查开发者控制台。");
        }
    }
}

