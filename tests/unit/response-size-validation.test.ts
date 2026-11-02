import { describe, it, expect } from 'vitest';
import { GitHubError } from '@/lib/github/errors';
import { readJsonWithSizeLimit } from '@/lib/github/client';

describe('readJsonWithSizeLimit', () => {
  it('accepts normal-sized responses', async () => {
    const response = new Response('{"test": "data"}', {
      headers: { 'content-length': '17' },
    });

    const result = await readJsonWithSizeLimit(response, 10_000_000);
    expect(result).toEqual({ test: 'data' });
  });

  it('rejects responses exceeding size limit via Content-Length', async () => {
    const response = new Response('{"test": "data"}', {
      headers: { 'content-length': '20000000' }, // 20MB
    });

    await expect(readJsonWithSizeLimit(response, 10_000_000)).rejects.toThrow(GitHubError);
    await expect(readJsonWithSizeLimit(response, 10_000_000)).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('rejects responses exceeding size limit via streaming', async () => {
    // Create a large JSON string (1MB)
    const largeData = { data: 'x'.repeat(1_000_000) };
    const largeJson = JSON.stringify(largeData);
    const response = new Response(largeJson);

    await expect(readJsonWithSizeLimit(response, 100_000)).rejects.toThrow(GitHubError);
  });

  it('handles missing Content-Length header', async () => {
    const response = new Response('{"test": "data"}');
    // No Content-Length header

    const result = await readJsonWithSizeLimit(response, 10_000_000);
    expect(result).toEqual({ test: 'data' });
  });

  it('rejects invalid JSON', async () => {
    const response = new Response('not valid json', {
      headers: { 'content-length': '13' },
    });

    await expect(readJsonWithSizeLimit(response, 10_000_000)).rejects.toThrow(GitHubError);
  });

  it('handles empty response body', async () => {
    const response = new Response('', {
      headers: { 'content-length': '0' },
    });

    await expect(readJsonWithSizeLimit(response, 10_000_000)).rejects.toThrow(GitHubError);
  });

  it('includes size information in error message', async () => {
    const response = new Response('{"test": "data"}', {
      headers: { 'content-length': '20000000' },
    });

    try {
      await readJsonWithSizeLimit(response, 10_000_000);
      expect.fail('Should have thrown');
    } catch (error) {
      if (error instanceof GitHubError) {
        expect(error.message).toContain('exceeds maximum size');
      } else {
        expect.fail('Should throw GitHubError');
      }
    }
  });

  it('throws when response body is null', async () => {
    const response = new Response(null as unknown as BodyInit);

    await expect(readJsonWithSizeLimit(response, 10_000_000)).rejects.toThrow(GitHubError);
  });

  it('correctly counts bytes for multi-byte characters', async () => {
    const data = { test: '€€€€€' }; // Euro character is 3 bytes in UTF-8
    const json = JSON.stringify(data);
    const response = new Response(json);

    const result = await readJsonWithSizeLimit(response, 100);
    expect(result).toEqual(data);
  });
});
