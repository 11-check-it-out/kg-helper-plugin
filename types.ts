export interface RelationLinkConfig {
    headSection: string;
    tailSection: string;
}

// 定义 AI 提供商的类型
export type AIProvider = 'gemini' | 'deepseek';

export interface TWPilotSettings {
    // AI 设置
    aiProvider: AIProvider; // 【新】选择 AI 服务提供商
    geminiApiKey: string;   // 【修改】原 apiKey 重命名
    deepseekApiKey: string; // 【新】DeepSeek 的 API Key

    // 基础设置
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

export const DEFAULT_SETTINGS: TWPilotSettings = {
    // AI 默认设置
    aiProvider: 'gemini',
    geminiApiKey: '',
    deepseekApiKey: '',

    // 基础默认设置
    conceptTemplatePath: '',
    relationTemplatePath: '',
    newNoteLocationMode: 'current',
    defaultFolder: '/',
    parentKey: 'parent',
    inheritanceMode: 'full',
    autoCreateConcepts: false,
    autoLinkOnCreation: true,
    relationLinkConfigs: {    
        '影响': { headSection: '影响', tailSection: '影响因素' },
        '对比': { headSection: '对比', tailSection: '对比' },
        '关联': { headSection: '关联', tailSection: '关联' },
        '应用': { headSection: '应用', tailSection: '应用' }
    }
}

export const DEFAULT_CONCEPT_TEMPLATE_PATH = 'templates/KG概念模板.md';
export const DEFAULT_RELATION_TEMPLATE_PATH = 'templates/KG关系模板.md';