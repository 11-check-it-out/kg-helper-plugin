/**
 * 插件设置的接口, 描述了所有可配置的选项
 */
 export interface KGHelperSettings {
    conceptTemplatePath: string;
    relationTemplatePath: string;
    newNoteLocationMode: 'fixed' | 'current';
    defaultFolder: string;
    parentKey: string;
    inheritanceMode: 'full' | 'structure';
    autoCreateConcepts: boolean; // 【新】是否自动创建不存在的概念笔记
}

/**
 * 默认设置, 当用户第一次安装插件时使用
 */
export const DEFAULT_SETTINGS: KGHelperSettings = {
    conceptTemplatePath: '',
    relationTemplatePath: '',
    newNoteLocationMode: 'current',
    defaultFolder: '/',
    parentKey: 'parent',
    inheritanceMode: 'full',
    autoCreateConcepts: false, // 【新】默认为关闭
}

// 默认模板文件的存放路径, 用于“一键创建”功能
export const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
export const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md';

