export function escapeMarkdown(value:string): string { return value.replace(/([_\-*\[\]()~`>#+=|{}.!\\])/g,'\\$1') }
