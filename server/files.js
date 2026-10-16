import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const BLOCKED = /^(?:\.env(?:\..*)?|config\.local\.toml|\.ssh|\.aws|\.codex|\.workbuddy|\.claude|\.gemini|\.hermes|\.gnupg|\.npmrc|\.netrc|auth\.json|credentials(?:\.json)?|secrets?(?:\..*)?)$/i;
const TEXT_LIMIT = 2 * 1024 * 1024;
export function resolveWorkspacePath(workspace, relative = '.', { write = false } = {}) {
  if (!workspace?.path) throw new Error('工作空间不存在');
  if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative)) throw new Error('请使用工作空间内的相对路径');
  const root = fs.realpathSync(workspace.path);
  if (root.split(path.sep).some(segment => BLOCKED.test(segment))) throw new Error('不能将凭据目录用作工作空间');
  if (root === path.parse(root).root || root === os.homedir()) throw new Error('请指定独立工作目录，不要使用用户主目录或磁盘根目录');
  const parts = relative.split(/[\\/]+/);
  if (parts.some(p => p === '..' || BLOCKED.test(p))) throw new Error('路径越界或涉及受保护的配置文件');
  const target = path.resolve(root, ...parts);
  const contained = path.relative(root, target);
  if (contained.startsWith('..') || path.isAbsolute(contained)) throw new Error('路径超出工作空间');
  let current = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('不允许通过符号链接访问文件');
  }
  if (write && target === root) throw new Error('不能覆盖工作空间根目录');
  return target;
}
export async function readDirectory(workspace, relative = '.') {
  const target = resolveWorkspacePath(workspace, relative);
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter(e => !BLOCKED.test(e.name) && !e.isSymbolicLink() && !['node_modules', '.git'].includes(e.name))
    .map(e => ({ name: e.name, path: path.relative(workspace.path, path.join(target, e.name)), type: e.isDirectory() ? 'directory' : 'file', size: e.isFile() ? fs.statSync(path.join(target, e.name)).size : 0 }))
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'zh-CN') : a.type === 'directory' ? -1 : 1);
  return { path: relative, entries: entries.slice(0, 500), truncated: entries.length > 500 };
}
export async function readText(workspace, relative) {
  const target = resolveWorkspacePath(workspace, relative);
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > TEXT_LIMIT) throw new Error('只支持读取 2MB 以内的文本文件');
  const bytes = fs.readFileSync(target);
  if (bytes.includes(0)) throw new Error('这是二进制文件，请使用文档预览');
  return bytes.toString('utf8');
}
export async function writeText(workspace, relative, content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > TEXT_LIMIT) throw new Error('文本内容不能超过 2MB');
  const target = resolveWorkspacePath(workspace, relative, { write: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Revalidate after directory creation and write atomically inside the checked directory.
  resolveWorkspacePath(workspace, relative, { write: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
  return { path: relative, size: Buffer.byteLength(content), type: path.extname(relative).slice(1) || 'text' };
}
export async function createOffice(workspace, args) {
  const { format, title = '未命名文档', sections = [], rows = [], slides = [] } = args;
  if (!['docx', 'xlsx', 'pptx'].includes(format)) throw new Error('不支持的 Office 格式');
  if (!args.path?.toLowerCase().endsWith(`.${format}`)) throw new Error('文件后缀与格式必须一致');
  const target = resolveWorkspacePath(workspace, args.path, { write: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let bytes;
  if (format === 'docx') {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
    const content = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
    for (const part of sections.slice(0, 200)) {
      if (part.heading) content.push(new Paragraph({ text: part.heading, heading: HeadingLevel.HEADING_1 }));
      for (const line of String(part.text || '').split('\n')) content.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Microsoft YaHei', size: 22 })], spacing: { after: 140 } }));
    }
    bytes = await Packer.toBuffer(new Document({ creator: 'OpenBuddy', title, sections: [{ children: content }] }));
  } else if (format === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(title.slice(0, 31).replace(/[\\/*?:[\]]/g, '-'));
    rows.slice(0, 10000).forEach(row => sheet.addRow(row.slice(0, 100)));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E59' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (let c = 1; c <= sheet.columnCount; c++) sheet.getColumn(c).width = 22;
    bytes = Buffer.from(await book.xlsx.writeBuffer());
  } else {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE'; deck.author = 'OpenBuddy'; deck.title = title;
    for (const part of (slides.length ? slides : [{ title, body: sections.map(s => s.text).join('\n') }]).slice(0, 100)) {
      const slide = deck.addSlide(); slide.background = { color: 'FAFBFC' };
      slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 0.13, h: 7.5, fill: { color: '15847A' }, line: { color: '15847A' } });
      slide.addText(part.title || title, { x: 0.7, y: 0.7, w: 11.8, h: 1, fontFace: 'Microsoft YaHei', fontSize: 30, bold: true, color: '18302D', breakLine: false, fit: 'shrink' });
      slide.addText(String(part.body || ''), { x: 0.8, y: 2, w: 11.5, h: 4.7, fontFace: 'Microsoft YaHei', fontSize: 20, color: '3D4A48', valign: 'top', fit: 'shrink' });
    }
    bytes = Buffer.from(await deck.write({ outputType: 'nodebuffer' }));
  }
  resolveWorkspacePath(workspace, args.path, { write: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, target);
  return { path: args.path, size: bytes.length, type: format };
}
export async function previewFile(workspace, relative) {
  const target = resolveWorkspacePath(workspace, relative);
  const ext = path.extname(target).toLowerCase();
  if (fs.statSync(target).size > 20 * 1024 * 1024) throw new Error('预览支持 20MB 以内的文件');
  const url = `/api/file?workspaceId=${encodeURIComponent(workspace.id)}&path=${encodeURIComponent(relative)}&inline=1`;
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return { type: 'image', url };
  if (ext === '.pdf') return { type: 'pdf', url };
  if (['.pptx', '.ppt', '.xls', '.doc', '.zip'].includes(ext)) return { type: 'download', content: '此格式请下载后使用相应应用打开。' };
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ path: target });
    return { type: 'html', html: result.value, warnings: result.messages.map(m => m.message) };
  }
  if (ext === '.xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(target);
    const sheet = workbook.worksheets[0]; const rows = [];
    sheet?.eachRow({ includeEmpty: true }, (row, n) => { if (n <= 200) rows.push(row.values.slice(1).map(c => typeof c === 'object' && c !== null ? c.text ?? c.result ?? JSON.stringify(c) : c)); });
    return { type: 'table', rows, columns: rows[0]?.map((_, i) => String(i + 1)) || [] };
  }
  const content = await readText(workspace, relative);
  return ext === '.html' ? { type: 'html', html: content } : { type: 'text', content };
}
