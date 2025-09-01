/**
 * KG Helper 插件的所有设置项
 */
 export interface KGHelperSettings {
    conceptTemplatePath: string;
    relationTemplatePath: string;
    newNoteLocationMode: 'fixed' | 'current';
    defaultFolder: string;
    parentKey: string;
    inheritanceMode: 'full' | 'structure';
}

/**
 * 插件的默认设置
 */
export const DEFAULT_SETTINGS: KGHelperSettings = {
    conceptTemplatePath: '',
    relationTemplatePath: '',
    newNoteLocationMode: 'current',
    defaultFolder: '/',
    parentKey: 'parent',
    inheritanceMode: 'full',
}

/**
 * 默认模板文件的存放路径
 */
export const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
export const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md';

