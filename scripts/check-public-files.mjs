import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Inspect the actual Git release set, never ignored local configuration/data.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked files: stage the intended source before checking.');
const forbidden = /(?:^|\/)(?:node_modules|\.data|dist|release(?:-final)?|\.codex|\.claude|\.ssh|\.aws)(?:\/|$)|(?:^|\/)(?:\.env(?!\.example$)(?:\..*)?|config\.local\.toml|model-providers\.json(?:\..*\.tmp)?|auth\.json|credentials\.json|\.DS_Store)$|\.(?:pem|key|p12|pfx|log)$/i;
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider-token', /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/],
  ['URL-credential', /https?:\/\/[^\s/'"<>]+:[^\s/'"<>@]+@/],
  ['personal-home-path', /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\//],
  ['private-network-address', /\b192\.168\.\d{1,3}\.\d{1,3}\b/]
];
const findings = [];
for (const file of files) {
  if (forbidden.test(file)) findings.push({ file, rule: 'private-or-generated-file' });
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) { findings.push({ file, rule: 'symlink-requires-review' }); continue; }
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) continue;
  const lines = buffer.toString('utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Public synthetic auth fixtures are test inputs, never live values.
    if (file.startsWith('tests/') && /fixture-(?:user|pass)/.test(lines[i])) continue;
    for (const [rule, pattern] of patterns) if (pattern.test(lines[i])) findings.push({ file, line: i + 1, rule });
  }
}
if (findings.length) {
  // Only locations and categories are emitted; never echo suspected secrets.
  console.error(JSON.stringify({ status: 'failed', findings }, null, 2));
  process.exitCode = 1;
} else console.log(`Public file check passed: ${files.length} tracked files; no matching secret formats, personal paths or private data files.`);
