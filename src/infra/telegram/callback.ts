export function parseCallback(data:string){ const [namespace='', action='', ...parts] = data.split('|'); return { namespace, action, parts } }
