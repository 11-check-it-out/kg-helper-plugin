/**
 * 清理文件名中的非法字符
 * @param fileName 原始文件名
 * @returns 清理后的文件名
 */
 export function sanitizeFileName(fileName: string): string {
    if (!fileName) return '';
    return fileName.replace(/[\\/:\*\?"<>\|]/g, '');
}

/**
 * 从 Wikilink 格式中解析出笔记名称
 * e.g., "[[Note Name|Display Text]]" -> "Note Name"
 * @param link 包含 Wikilink 的字符串
 * @returns 笔记名称, 或 null
 */
export function parseWikilink(link: string): string | null {
    if (typeof link !== 'string') return null;
    const match = link.match(/\[\[([^|\]]+)/);
    return match ? match[1].trim() : null;
}

