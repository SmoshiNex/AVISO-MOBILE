export function sanitizeText(input: string): string {
    if (!input) return '';
    return input.trim().replace(/<[^>]*>?/gm, '');
}

export function sanitizeAlphanumeric(input: string): string {
    if (!input) return '';
    return input.trimStart().replace(/[^a-zA-Z0-9_]/g, '');
}
