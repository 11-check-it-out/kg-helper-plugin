import { TWPilotSettings } from "../types";

/**
 * 根据模板和动态数据, 生成最终用于创建新笔记的内容
 * @param templateContent 模板文件的原始内容
 * @param settings 插件的设置
 * @param uid 动态生成的唯一ID
 * @param noteType 'concept' 或 'relation'
 * @param title (可选) 新笔记的标题, 用于生成关系笔记的别名
 * @returns 处理后的完整笔记内容
 */
export function getModifiedContent(
    templateContent: string,
    settings: TWPilotSettings,
    uid: string,
    noteType: 'concept' | 'relation',
    title?: string
): string {
    const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const fmMatch = templateContent.match(fmRegex);

    const parentKey = settings.parentKey.trim() || 'parent';
    const desiredOrder = ['uid', 'aliases', 'type', parentKey, 'publish'];
    let frontmatterObject: Record<string, any> = {};

    // 1. 解析模板中的 frontmatter
    if (fmMatch) {
        const fmContent = fmMatch[1];
        fmContent.split('\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                let value: any = line.substring(colonIndex + 1).trim();
                
                // 尝试将 "[]" 或 "[a, b]" 这样的字符串解析为数组
                if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
                    const listStr = value.substring(1, value.length - 1).trim();
                    value = listStr ? listStr.split(',').map(s => s.trim().replace(/^"|"$/g, '')) : [];
                }
                if (key) { frontmatterObject[key] = value; }
            }
        });
    }
    
    // 2. 动态赋值/修改
    frontmatterObject['uid'] = uid;
    frontmatterObject['type'] = noteType;

    if (noteType === 'relation' && title) {
        const parts = title.split('-');
        if (parts.length === 3) {
            const [conceptA, relation, conceptB] = parts.map(p => p.trim());
            if (relation === '关联' || relation === '对比') {
                const reverseAlias = `${conceptB}-${relation}-${conceptA}`;
                let currentAliases = frontmatterObject['aliases'];
                if (!Array.isArray(currentAliases)) {
                    currentAliases = [];
                }
                if (!currentAliases.includes(reverseAlias)) {
                    currentAliases.push(reverseAlias);
                }
                frontmatterObject['aliases'] = currentAliases;
            }
        }
    }

    // 3. 按指定顺序重新构建 frontmatter 字符串
    let newFmContent = '';
    const processedKeys = new Set<string>();

    desiredOrder.forEach(key => {
        if (frontmatterObject.hasOwnProperty(key)) {
            const value = frontmatterObject[key];
            if (Array.isArray(value)) {
                newFmContent += value.length === 0 ? `${key}: []\n` : `${key}:\n${value.map(item => `  - "${item}"`).join('\n')}\n`;
            } else {
                newFmContent += `${key}: ${value || ''}\n`;
            }
            processedKeys.add(key);
        }
    });

    Object.keys(frontmatterObject).forEach(key => {
        if (!processedKeys.has(key)) {
            const value = frontmatterObject[key];
             if (Array.isArray(value)) {
                newFmContent += value.length === 0 ? `${key}: []\n` : `${key}:\n${value.map(item => `  - "${item}"`).join('\n')}\n`;
            } else {
                newFmContent += `${key}: ${value || ''}\n`;
            }
        }
    });

    const newFmBlock = `---\n${newFmContent.trim()}\n---\n`;

    return fmMatch ? templateContent.replace(fmRegex, newFmBlock) : newFmBlock + '\n' + templateContent;
}

