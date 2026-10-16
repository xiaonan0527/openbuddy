export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(!['GET', 'HEAD'].includes(options.method || 'GET') ? { 'X-OpenBuddy-Request': '1' } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const remove = path => api(path, { method: 'DELETE' });
export const fileUrl = (workspaceId, path) => `/api/file?${new URLSearchParams({ workspaceId, path })}`;

export async function uploadFile(file, workspaceId) {
  const data = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < data.length; index += 8192) binary += String.fromCharCode(...data.subarray(index, index + 8192));
  return post('/upload', { workspaceId, name: file.name, base64: btoa(binary) });
}

export const formatDate = value => value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '尚未运行';
export const formatSize = value => value < 1024 ? `${value || 0} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
