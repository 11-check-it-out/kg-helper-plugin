import { requestUrl, Notice } from 'obsidian';
import { TWPilotSettings } from '../types';

export interface TitleSuggestion {
    title: string;
    reasoning: string;
}

// --- Gemini 调用逻辑 ---
async function getGeminiSuggestion(content: string, apiKey: string): Promise<TitleSuggestion | null> {
    const systemPrompt = `你是一个知识管理专家，精通KG笔记法。你的任务是为用户提供的笔记内容生成一个符合规范的标题。
规范如下: 1. 如果内容是关于单个核心概念，标题就是这个概念的名称。2. 如果内容是描述概念间的互动关系，标题必须遵循 "概念A-关系类型-概念B" 格式。3. 关系类型只能是：影响、对比、关联、应用。4. 你的回答必须是一个 JSON 对象，格式为：{"title": "生成的标题", "reasoning": "你为什么这么命名的简单解释"}。5. 直接输出 JSON 对象，不要包含任何额外的解释或 markdown 格式。`;
    
    try {
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `请为以下笔记内容生成标题：\n\n---\n\n${content}` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        const result = response.json;
        const suggestionText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!suggestionText) {
            console.error("ThoughtWeaver Pilot Gemini Error: API 响应中缺少有效内容", result);
            throw new Error('Gemini API 响应格式不正确。');
        }
        return JSON.parse(suggestionText) as TitleSuggestion;
    } catch (error) {
        console.error("ThoughtWeaver Pilot Gemini Error:", error);
        throw new Error('Gemini API 请求失败，请检查网络、API Key或模型权限。');
    }
}

// --- DeepSeek 调用逻辑 ---
async function getDeepSeekSuggestion(content: string, apiKey: string): Promise<TitleSuggestion | null> {
    const systemPrompt = `你是一个知识管理专家，精通KG笔记法。你的任务是为用户提供的笔记内容生成一个符合规范的标题。
规范如下: 1. 如果内容是关于单个核心概念，标题就是这个概念的名称。2. 如果内容是描述概念间的互动关系，标题必须遵循 "概念A-关系类型-概念B" 格式。3. 关系类型只能是：影响、对比、关联、应用。4. 你的回答必须是一个 JSON 对象，格式为：{"title": "生成的标题", "reasoning": "你为什么这么命名的简单解释"}。5. 直接输出 JSON 对象，不要包含任何额外的解释或 markdown 格式。`;

    try {
        const response = await requestUrl({
            url: 'https://api.deepseek.com/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": `请为以下笔记内容生成标题：\n\n---\n\n${content}` }
                ],
                response_format: { "type": "json_object" }
            })
        });
        const result = response.json;
        const suggestionText = result.choices?.[0]?.message?.content;
        if (!suggestionText) {
            console.error("ThoughtWeaver Pilot DeepSeek Error: API 响应中缺少有效内容", result);
            throw new Error('DeepSeek API 响应格式不正确。');
        }
        return JSON.parse(suggestionText) as TitleSuggestion;
    } catch (error) {
        console.error("ThoughtWeaver Pilot DeepSeek Error:", error);
        throw new Error('DeepSeek API 请求失败，请检查网络或 API Key。');
    }
}

/**
 * 【总入口】根据用户设置，调用对应的 AI 模型来建议标题
 */
export async function suggestTitleWithAI(content: string, settings: TWPilotSettings): Promise<TitleSuggestion | null> {
    const { aiProvider, geminiApiKey, deepseekApiKey } = settings;

    try {
        if (aiProvider === 'gemini') {
            if (!geminiApiKey) throw new Error('请先在插件设置中配置您的 Google Gemini API Key。');
            return await getGeminiSuggestion(content, geminiApiKey);
        } else if (aiProvider === 'deepseek') {
            if (!deepseekApiKey) throw new Error('请先在插件设置中配置您的 DeepSeek API Key。');
            return await getDeepSeekSuggestion(content, deepseekApiKey);
        } else {
            throw new Error('未知的 AI 服务提供商。');
        }
    } catch (error) {
        new Notice(error.message);
        return null;
    }
}

/**
 * 【新】测试 AI API 连接和密钥有效性
 */
export async function testAIConnection(settings: TWPilotSettings): Promise<boolean> {
    const { aiProvider, geminiApiKey, deepseekApiKey } = settings;
    const testContent = "这是一个测试。";

    try {
        if (aiProvider === 'gemini') {
            if (!geminiApiKey) throw new Error('尚未配置 Google Gemini API Key。');
            await getGeminiSuggestion(testContent, geminiApiKey);
            return true;
        } else if (aiProvider === 'deepseek') {
            if (!deepseekApiKey) throw new Error('尚未配置 DeepSeek API Key。');
            await getDeepSeekSuggestion(testContent, deepseekApiKey);
            return true;
        } else {
            throw new Error('未知的 AI 服务提供商。');
        }
    } catch (error) {
        console.error(`ThoughtWeaver Pilot ${aiProvider} Connection Test Error:`, error);
        // 错误信息已在 Notice 中显示，这里只返回 false
        return false;
    }
}

