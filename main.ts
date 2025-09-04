import { App, Notice, Plugin, TFile } from 'obsidian';
import moment from 'moment';
import { TWPilotSettings, DEFAULT_SETTINGS } from './types';
import { TWPilotSettingTab } from './settings';
import { createOrLinkNote } from './commands/createNote';
import { inheritPropertiesFromParent } from './commands/inheritProperties';
import { addReverseAliasForCurrentNote } from './commands/addAlias';
import { RelationSuggester } from './suggester';
import { getTemplateContent } from './utils/fileUtils';
import { getModifiedContent } from './utils/frontmatterUtils';
import { suggestTitleCommand } from './commands/suggestTitle';

/**
 * 插件的主类, 作为程序的入口
 */
export default class TWPilotPlugin extends Plugin {
    settings: TWPilotSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new TWPilotSettingTab(this.app, this));

        // --- 核心功能注册 ---
        this.registerEditorSuggest(new RelationSuggester(this));
        
        // 注册文件创建事件监听器，用于自动应用模板
        this.registerEvent(
            this.app.vault.on('create', (file) => this.handleFileCreate(file))
        );

        // --- 命令注册 ---
        this.addCommand({
            id: 'ai-suggest-title',
            name: 'AI 建议标题',
            editorCallback: () => suggestTitleCommand(this.app, this.settings)
        });

        this.addCommand({
            id: 'smart-create-concept-note',
            name: '智能创建或链接概念笔记',
            hotkeys: [{ modifiers: ["Alt"], key: "c" }],
            callback: () => createOrLinkNote(this.app, this.settings, 'concept')
        });

        this.addCommand({
            id: 'smart-create-relation-note',
            name: '智能创建或链接关系笔记',
            hotkeys: [{ modifiers: ["Alt"], key: "r" }],
            callback: () => createOrLinkNote(this.app, this.settings, 'relation')
        });

        this.addCommand({
            id: 'inherit-properties-from-parent',
            name: '从父笔记继承属性',
            hotkeys: [{ modifiers: ["Alt"], key: "i" }],
            editorCallback: () => inheritPropertiesFromParent(this.app, this.settings)
        });

        this.addCommand({
            id: 'add-reverse-alias',
            name: '为关系笔记补全反向别名',
            hotkeys: [{ modifiers: ["Alt"], key: "a" }],
            editorCallback: () => addReverseAliasForCurrentNote(this.app)
        });
    }

    /**
     * 处理新文件创建事件的核心函数
     * 当通过点击链接等方式创建空文件时，自动应用模板
     */
    async handleFileCreate(file: TFile) {
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        const content = await this.app.vault.cachedRead(file);
        if (content.trim() !== '') {
            return;
        }

        const relationPattern = /.+-(影响|对比|关联|应用)-.+/;
        const isRelationNote = relationPattern.test(file.basename);
        const noteType = isRelationNote ? 'relation' : 'concept';

        const templatePath = (noteType === 'concept' 
            ? this.settings.conceptTemplatePath 
            : this.settings.relationTemplatePath).trim();

        if (!templatePath) {
            return;
        }

        try {
            const templateContent = await getTemplateContent(templatePath, this.app);
            if (templateContent === null) return;

            const uid = moment().format("YYYYMMDDHHmmss");
            const newContent = getModifiedContent(
                templateContent,
                this.settings,
                uid,
                noteType,
                file.basename
            );

            await this.app.vault.modify(file, newContent);
            new Notice(`ThoughtWeaver Pilot: 已自动为 "${file.basename}" 应用模板`);
        } catch (err) {
            console.error("ThoughtWeaver Pilot - 自动应用模板时出错:", err);
            new Notice("ThoughtWeaver Pilot: 自动应用模板失败。");
        }
    }

    onunload() { }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

