import { App, Notice, Plugin, TFile } from 'obsidian';
import moment from 'moment';
import { KGHelperSettings, DEFAULT_SETTINGS } from './types';
import { KGHelperSettingTab } from './settings';
import { createOrLinkNote } from './commands/createNote';
import { inheritPropertiesFromParent } from './commands/inheritProperties';
import { addReverseAliasForCurrentNote } from './commands/addAlias';
import { RelationSuggester } from './suggester';
import { getTemplateContent } from './utils/fileUtils';
import { getModifiedContent } from './utils/frontmatterUtils';

/**
 * 插件的主类, 作为程序的入口
 */
export default class KGHelperPlugin extends Plugin {
    settings: KGHelperSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new KGHelperSettingTab(this.app, this));

        this.registerEditorSuggest(new RelationSuggester(this));

        // 【新】注册文件创建事件监听器
        this.registerEvent(
            this.app.vault.on('create', (file) => this.handleFileCreate(file))
        );

        // --- 命令注册 (已添加默认快捷键) ---
        this.addCommand({
            id: 'smart-create-concept-note',
            name: '智能创建或链接概念笔记',
            hotkeys: [{ modifiers: ["Alt"], key: "c" }], // Alt + C
            callback: () => createOrLinkNote(this.app, this.settings, 'concept')
        });

        this.addCommand({
            id: 'smart-create-relation-note',
            name: '智能创建或链接关系笔记',
            hotkeys: [{ modifiers: ["Alt"], key: "r" }], // Alt + R
            callback: () => createOrLinkNote(this.app, this.settings, 'relation')
        });

        this.addCommand({
            id: 'inherit-properties-from-parent',
            name: '从父笔记继承属性',
            hotkeys: [{ modifiers: ["Alt"], key: "i" }], // Alt + I (i for inherit)
            editorCallback: () => inheritPropertiesFromParent(this.app, this.settings)
        });

        this.addCommand({
            id: 'add-reverse-alias',
            name: '为关系笔记补全反向别名',
            hotkeys: [{ modifiers: ["Alt"], key: "a" }], // Alt + A
            editorCallback: () => addReverseAliasForCurrentNote(this.app)
        });
    }

    /**
     * 【新】处理新文件创建事件的核心函数
     * 当通过点击链接等方式创建空文件时，自动应用模板
     */
    async handleFileCreate(file: TFile) {
        // 1. 安全检查：仅处理空的 markdown 文件
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return;
        }

        // 稍微延迟以确保文件系统已准备好，并再次检查文件是否为空
        // 这可以防止与其他插件或进程发生冲突
        await new Promise(resolve => setTimeout(resolve, 50)); 
        const content = await this.app.vault.cachedRead(file);
        if (content.trim() !== '') {
            return; // 文件非空，说明已有内容，插件不应干预
        }
        
        // 2. 根据文件名，智能判断笔记类型
        const relationPattern = /.+-(影响|对比|关联|应用)-.+/;
        const isRelationNote = relationPattern.test(file.basename);
        const noteType = isRelationNote ? 'relation' : 'concept';

        // 3. 获取对应的模板路径
        const templatePath = (noteType === 'concept' 
            ? this.settings.conceptTemplatePath 
            : this.settings.relationTemplatePath).trim();

        if (!templatePath) {
            return; // 如果未配置模板，则不执行任何操作
        }

        // 4. 生成模板内容并写入文件
        try {
            const templateContent = await getTemplateContent(templatePath, this.app);
            if (templateContent === null) return; // 模板不存在或无法读取

            const uid = moment().format("YYYYMMDDHHmmss");
            const newContent = getModifiedContent(
                templateContent,
                this.settings,
                uid,
                noteType,
                file.basename // 将文件名作为标题传入，以便处理别名等
            );

            await this.app.vault.modify(file, newContent);
            new Notice(`KG Helper: 已自动为 "${file.basename}" 应用模板`);
        } catch (err) {
            console.error("KG Helper - 自动应用模板时出错:", err);
            new Notice("KG Helper: 自动应用模板失败，请检查开发者控制台。");
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