import { Plugin } from 'obsidian';
import { KGHelperSettings, DEFAULT_SETTINGS } from './types';
import { KGHelperSettingTab } from './settings';
import { createOrLinkNote } from './commands/createNote';
import { inheritPropertiesFromParent } from './commands/inheritProperties';
import { addReverseAliasForCurrentNote } from './commands/addAlias';

/**
 * 插件的主类, 作为程序的入口
 * 职责:
 * 1. 加载和保存设置
 * 2. 初始化设置页面
 * 3. 注册所有命令
 */
export default class KGHelperPlugin extends Plugin {
    settings: KGHelperSettings;

    async onload() {
        // 加载插件设置
        await this.loadSettings();

        // 添加设置页面
        this.addSettingTab(new KGHelperSettingTab(this.app, this));

        // --- 命令注册 ---

        this.addCommand({
            id: 'smart-create-concept-note',
            name: '智能创建或链接概念笔记',
            callback: () => createOrLinkNote(this.app, this.settings, 'concept')
        });

        this.addCommand({
            id: 'smart-create-relation-note',
            name: '智能创建或链接关系笔记',
            callback: () => createOrLinkNote(this.app, this.settings, 'relation')
        });

        this.addCommand({
            id: 'inherit-properties-from-parent',
            name: '从父笔记继承属性',
            editorCallback: () => inheritPropertiesFromParent(this.app, this.settings)
        });

        this.addCommand({
            id: 'add-reverse-alias',
            name: '为关系笔记补全反向别名',
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

