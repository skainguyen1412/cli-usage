import { describe, it, expect } from 'vitest';
import { expandPath } from '../../src/utils/config';
import os from 'os';
import path from 'path';

describe('Config Utils', () => {
  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const home = os.homedir();
      expect(expandPath('~/foo')).toBe(path.join(home, 'foo'));
      expect(expandPath('~')).toBe(home);
    });

    it('should not modify absolute paths', () => {
      expect(expandPath('/tmp/foo')).toBe('/tmp/foo');
    });

    it('should not modify relative paths without ~', () => {
      expect(expandPath('./foo')).toBe('./foo');
    });
  });
});
