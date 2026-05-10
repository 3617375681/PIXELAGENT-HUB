import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowRateLimiter } from './rateLimiter.js';

test('FixedWindowRateLimiter allows up to limit in one window', () => {
  const limiter = new FixedWindowRateLimiter(2, 60_000);
  const t0 = 1_000;

  const first = limiter.consume('k1', t0);
  const second = limiter.consume('k1', t0 + 1);
  const third = limiter.consume('k1', t0 + 2);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test('FixedWindowRateLimiter resets after window', () => {
  const limiter = new FixedWindowRateLimiter(1, 100);
  const first = limiter.consume('k1', 1000);
  const second = limiter.consume('k1', 1001);
  const third = limiter.consume('k1', 1201);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(third.allowed, true);
});
