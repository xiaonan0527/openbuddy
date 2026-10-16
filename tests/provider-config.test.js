import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProvider, publicProvider } from '../server/provider.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), projectDirectory = path.join(root, 'project');
  fs.mkdirSync(home); fs.mkdirSync(projectDirectory);
  return { home, projectDirectory, env: {} };
}
function config(file, { endpoint = 'https://api.example.org/v1', credential = 'fixture-model-credential', envKey } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `model = "fixture-model"\nmodel_provider = "custom"\n[model_providers.custom]\nbase_url = ${JSON.stringify(endpoint)}\nwire_api = "responses"\n${envKey ? `env_key = ${JSON.stringify(envKey)}` : `experimental_bearer_token = ${JSON.stringify(credential)}`}\n`);
}

test('project config overrides user config and environment without exposing credentials', t => {
  const options = fixture(t);
  config(path.join(options.projectDirectory, 'config.local.toml'));
  config(path.join(options.home, '.config/openbuddy/config.toml'), { credential: 'fixture-other-credential' });
  options.env.OPENBUDDY_API_KEY = 'fixture-environment-credential';
  const provider = loadProvider({}, options);
  assert.equal(provider.apiKey, 'fixture-model-credential');
  assert.equal(provider.source, '项目 config.local.toml');
  const visible = publicProvider({}, options);
  assert.equal(visible.configured, true);
  assert.equal(JSON.stringify(visible).includes(provider.apiKey), false);
  assert.equal(JSON.stringify(visible).includes(options.home), false);
});

test('explicit config must exist and does not silently fall back to an account', t => {
  const options = fixture(t);
  options.env.OPENBUDDY_CONFIG_PATH = path.join(options.home, 'absent.toml');
  options.env.OPENAI_API_KEY = 'fixture-environment-credential';
  assert.throws(() => loadProvider({}, options), /不存在/);
});

test('OpenBuddy environment overrides Codex and model settings override defaults', t => {
  const options = fixture(t);
  config(path.join(options.home, '.codex/config.toml'));
  Object.assign(options.env, { OPENBUDDY_BASE_URL: 'http://127.0.0.1:9999/v1', OPENBUDDY_MODEL: 'environment-model', OPENBUDDY_API_KEY: 'fixture-environment-credential' });
  const provider = loadProvider({}, options);
  assert.equal(provider.model, 'environment-model');
  assert.equal(provider.source, '本机环境变量');
  assert.equal(provider.baseUrl, 'http://127.0.0.1:9999/v1');
  assert.equal(loadProvider({ model: 'task-model' }, options).model, 'task-model');
});

test('custom endpoint cannot borrow Codex auth.json or another env_key', t => {
  const options = fixture(t);
  fs.mkdirSync(path.join(options.home, '.codex'));
  fs.writeFileSync(path.join(options.home, '.codex/auth.json'), JSON.stringify({ OPENAI_API_KEY: 'fixture-unrelated-account-credential' }));
  config(path.join(options.projectDirectory, 'config.local.toml'), { envKey: 'PROVIDER_SCOPED_KEY' });
  assert.throws(() => loadProvider({}, options), /API Key/);
  options.env.OPENAI_API_KEY = 'fixture-unrelated-environment-credential';
  assert.throws(() => loadProvider({}, options), /API Key/);
  options.env.PROVIDER_SCOPED_KEY = 'fixture-correct-scoped-credential';
  assert.equal(loadProvider({}, options).apiKey, 'fixture-correct-scoped-credential');
});

test('Codex custom endpoint cannot borrow standard account credentials', t => {
  const options = fixture(t);
  config(path.join(options.home, '.codex/config.toml'), { envKey: 'MISSING_KEY' });
  fs.writeFileSync(path.join(options.home, '.codex/auth.json'), JSON.stringify({ OPENAI_API_KEY: 'fixture-unrelated-account-credential' }));
  assert.throws(() => loadProvider({}, options), /API Key/);
});

test('templates and URLs containing credentials, queries or fragments fail closed', t => {
  const options = fixture(t);
  Object.assign(options.env, { OPENBUDDY_API_KEY: 'YOUR_API_KEY', OPENBUDDY_MODEL: 'YOUR_MODEL_ID', OPENBUDDY_BASE_URL: 'https://api.example.com/v1' });
  assert.equal(publicProvider({}, options).configured, false);
  options.env.OPENBUDDY_API_KEY = 'fixture-credential'; options.env.OPENBUDDY_MODEL = 'fixture-model';
  assert.throws(() => loadProvider({}, options), /模板/);
  for (const suffix of ['?token=fixture', '#fixture', '']) {
    options.env.OPENBUDDY_BASE_URL = suffix ? `https://api.example.org/v1${suffix}` : 'https://fixture-user:fixture-pass@api.example.org/v1';
    assert.throws(() => loadProvider({}, options), /无内嵌凭据/);
  }
});
