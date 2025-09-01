/**
 * 单个关系类型的链接配置
 */
export interface RelationLinkConfig {
    headSection: string; // 头部概念笔记中, 用于插入链接的章节名
    tailSection: string; // 尾部概念笔记中, 用于插入链接的章节名
}

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
    autoCreateConcepts: boolean;
    autoLinkOnCreation: boolean;
    relationLinkConfigs: Record<string, RelationLinkConfig>;
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
    autoCreateConcepts: false,
    autoLinkOnCreation: true,
    // 【更新】根据您的反馈调整了默认值
    relationLinkConfigs: {    
        '关联': { headSection: '关联', tailSection: '关联' },
        '对比': { headSection: '对比', tailSection: '对比' },
        '影响': { headSection: '影响', tailSection: '影响因素' },
        '应用': { headSection: '应用', tailSection: '应用' }
    }
}

// 默认模板文件的存放路径, 用于“一键创建”功能
export const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
export const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md';

