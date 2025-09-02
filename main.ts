import { Plugin } from 'obsidian';
import { KGHelperSettings, DEFAULT_SETTINGS } from './types';
import { KGHelperSettingTab } from './settings';
import { createOrLinkNote } from './commands/createNote';
import { inheritPropertiesFromParent } from './commands/inheritProperties';
import { addReverseAliasForCurrentNote } from './commands/addAlias';
import { RelationSuggester } from './suggester'; // 【新】导入建议器

/**
 * 插件的主类, 作为程序的入口
 */
export default class KGHelperPlugin extends Plugin {
    settings: KGHelperSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new KGHelperSettingTab(this.app, this));

        // 【新】注册我们的快捷输入建议器
        this.registerEditorSuggest(new RelationSuggester(this));

        // --- 命令注册 ---
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

    onunload() { }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

