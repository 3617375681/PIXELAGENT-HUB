import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWebServerConfig, resolveRunTimeoutMs } from './config.js';

test('loadWebServerConfig parses numeric defaults', () => {
  const cfg = loadWebServerConfig({
    NODE_ENV: 'development',
    ALLOW_UNAUTH_IN_DEV: 'true',
  });
  assert.equal(cfg.port, 3100);
  assert.equal(cfg.runTimeoutMs, 120000);
  assert.deepEqual(cfg.runTimeoutMsByMode, {});
  assert.equal(cfg.maxRunConcurrency, 3);
  assert.equal(cfg.runRateLimitPerMinute, 30);
  assert.equal(cfg.runQueueSize, 20);
  assert.equal(cfg.runMaxRetries, 0);
});

test('loadWebServerConfig parses per-mode run timeouts', () => {
  const cfg = loadWebServerConfig({
    NODE_ENV: 'development',
    ALLOW_UNAUTH_IN_DEV: 'true',
    RUN_TIMEOUT_MS: '90000',
    RUN_TIMEOUT_MS_PIPELINE: '45000',
    RUN_TIMEOUT_MS_VOTE: '30000',
  });
  assert.equal(cfg.runTimeoutMs, 90000);
  assert.equal(cfg.runTimeoutMsByMode.pipeline, 45000);
  assert.equal(cfg.runTimeoutMsByMode.vote, 30000);
  assert.equal(resolveRunTimeoutMs(cfg, 'pipeline'), 45000);
  assert.equal(resolveRunTimeoutMs(cfg, 'vote'), 30000);
  assert.equal(resolveRunTimeoutMs(cfg, 'parallel'), 90000);
});

test('loadWebServerConfig requires api key when auth enabled', () => {
  assert.throws(() => {
    loadWebServerConfig({
      NODE_ENV: 'development',
      ALLOW_UNAUTH_IN_DEV: 'false',
      RECORDS_API_KEY: '',
    });
  });
});

test('loadWebServerConfig rejects weak production api key', () => {
  assert.throws(() => {
    loadWebServerConfig({
      NODE_ENV: 'production',
      ALLOW_UNAUTH_IN_DEV: 'false',
      RECORDS_API_KEY: 'short-key',
    });
  });
});
