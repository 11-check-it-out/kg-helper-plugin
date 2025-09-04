import { requestUrl, Notice } from 'obsidian';
import { TWPilotSettings } from '../types';

export interface TitleSuggestion {
    title: string;
    reasoning: string;
}

// 定义一个通用的、优化后的系统提示词
const systemPrompt = `你是一名专业的知识管理分析师，擅长为笔记进行主题标引和命名。你的任务是分析用户提供的笔记内容，并为其生成一个结构化、精确的标题。

请严格遵循以下步骤：
1.  **分析笔记类型**：首先，判断这篇笔记的核心目的是什么。
    * **概念笔记 (Concept Note)**：如果笔记主要是在定义、描述或聚合关于 **一个核心主题** 的信息，则判定为“概念笔记”。
    * **关系笔记 (Relation Note)**：如果笔记主要是在探讨 **两个或多个核心主题** 之间的互动、比较或因果，则判定为“关系笔记”。

2.  **遵循命名原则生成标题**：
    * 对于 **“概念笔记”**，标题必须遵循图书馆学“叙词”的原则：
        * **必须是名词短语**：标题的核心必须是一个名词。
        * **避免介词结构**：禁止使用“的”字结构。将“A的B”转换为“AB”或“B（A）”的形式。例如，一篇关于“父母的心理控制”的笔记，正确的标题是“父母心理控制”，而不是“父母的心理控制”。一篇关于“钢铁的属性”的笔记，正确的标题是“钢铁属性”。
    * 对于 **“关系笔记”**，标题必须严格遵循 **“主题A-关系类型-主题B”** 的格式。

3.  **确定关系类型**：在生成“关系笔记”标题时，你必须从以下四个选项中选择最贴切的一个作为“关系类型”：
    * **关联**：用于描述两个主题之间存在的一般性联系或相关性。
    * **对比**：用于描述两个主题之间的异同点。
    * **影响**：用于描述一个主题如何导致、改变或作用于另一个主题（因果关系）。
    * **应用**：用于描述一个主题（通常是理论、技术或方法）如何在另一个主题（通常是领域或问题）上被使用。

4.  **格式化输出**：你的最终回答 **必须** 是一个不含任何额外文本的、格式正确的 JSON 对象。该对象应包含两个键：
    - "title": 你生成的最终标题。
    - "reasoning": 一句简短的中文解释，说明你为什么会生成这个标题（例如，“笔记核心是探讨A对B的因果作用，因此判定为影响关系。”）。`;

// --- Gemini 调用逻辑 ---
async function getGeminiSuggestion(content: string, apiKey: string): Promise<TitleSuggestion | null> {
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
        let suggestion: TitleSuggestion | null = null;
        if (aiProvider === 'gemini') {
            if (!geminiApiKey) throw new Error('尚未配置 Google Gemini API Key。');
            suggestion = await getGeminiSuggestion(testContent, geminiApiKey);
        } else if (aiProvider === 'deepseek') {
            if (!deepseekApiKey) throw new Error('尚未配置 DeepSeek API Key。');
            suggestion = await getDeepSeekSuggestion(testContent, deepseekApiKey);
        } else {
            throw new Error('未知的 AI 服务提供商。');
        }
        
        if (suggestion && suggestion.title) {
            return true;
        } else {
            throw new Error("API 返回了无效的或空的建议。");
        }
    } catch (error) {
        new Notice(`连接测试失败: ${error.message}`);
        console.error(`ThoughtWeaver Pilot ${aiProvider} Connection Test Error:`, error);
        return false;
    }
}

