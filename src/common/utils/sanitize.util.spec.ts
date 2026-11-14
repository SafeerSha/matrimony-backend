import {
  sanitizeText,
  sanitizeStringArray,
  sanitizeObject,
  containsMaliciousPattern,
} from './sanitize.util';

describe('sanitize.util', () => {
  describe('sanitizeText', () => {
    it('returns undefined for null or undefined input', () => {
      expect(sanitizeText(undefined)).toBeUndefined();
      expect(sanitizeText(null)).toBeUndefined();
    });

    it('removes simple HTML script tags', () => {
      const input = "<script>alert('xss')</script>Hello World";
      expect(sanitizeText(input)).toBe("alert('xss')Hello World");
    });

    it('neutralizes nested HTML tag bypasses', () => {
      // Classic bypass <<script>script>alert(1)<</script>/script>
      const input = "<<script>script>alert(1)<</script>/script>";
      const result = sanitizeText(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('</script>');
    });

    it('strips null bytes and control characters', () => {
      const input = "safe\u0000text\u0007with\u001Fcontrol";
      expect(sanitizeText(input)).toBe('safetextwithcontrol');
    });

    it('strips Trojan Source bidirectional override characters', () => {
      const input = "admin\u202Ereversed\u202Ctext";
      expect(sanitizeText(input)).toBe('adminreversedtext');
    });

    it('neutralizes dangerous pseudoprotocols (javascript:, vbscript:, data:)', () => {
      const input = 'javascript:alert(1)';
      expect(sanitizeText(input)).toBe('alert(1)');
    });

    it('neutralizes inline event handlers like onerror and onload', () => {
      const input = 'img src=x onerror=alert(1)';
      expect(sanitizeText(input)).toContain('no_handler=alert(1)');
      expect(sanitizeText(input)).not.toContain('onerror=');
    });

    it('enforces maximum length truncation', () => {
      const longInput = 'a'.repeat(200);
      const result = sanitizeText(longInput, 50);
      expect(result?.length).toBe(50);
    });

    it('preserves legitimate multilingual and Indian names/text', () => {
      const malayalam = 'അനൂപ് മേനോൻ';
      const hindi = 'राजेश शर्मा';
      expect(sanitizeText(malayalam)).toBe(malayalam);
      expect(sanitizeText(hindi)).toBe(hindi);
    });
  });

  describe('sanitizeStringArray', () => {
    it('sanitizes each item in an array and caps count and length', () => {
      const arr = [
        '<b>Cooking</b>',
        'Travel <script>xss</script>',
        '   Reading   ',
      ];
      const result = sanitizeStringArray(arr, 10, 50);
      expect(result).toEqual(['Cooking', 'Travel xss', 'Reading']);
    });

    it('handles JSON stringified arrays safely', () => {
      const jsonArr = JSON.stringify(['Football', '<b>Music</b>']);
      expect(sanitizeStringArray(jsonArr)).toEqual(['Football', 'Music']);
    });
  });

  describe('sanitizeObject', () => {
    it('deeply sanitizes nested objects and arrays', () => {
      const payload = {
        firstName: '<b>John</b>',
        profile: {
          bio: '<script>evil()</script>Hello!',
          hobbies: ['<img src=x onerror=alert(1)>Swimming', 'Chess'],
        },
      };

      const sanitized = sanitizeObject(payload);
      expect(sanitized.firstName).toBe('John');
      expect(sanitized.profile.bio).toBe('evil()Hello!');
      expect(sanitized.profile.hobbies[0]).not.toContain('<img');
      expect(sanitized.profile.hobbies[1]).toBe('Chess');
    });

    it('protects against Prototype Pollution (__proto__, constructor, prototype)', () => {
      const maliciousPayload = JSON.parse(
        '{"__proto__": {"isAdmin": true}, "constructor": {"polluted": true}, "name": "Safe"}'
      );

      const cleaned = sanitizeObject(maliciousPayload);
      expect(cleaned.__proto__?.isAdmin).toBeUndefined();
      expect(cleaned.constructor?.polluted).toBeUndefined();
      expect(cleaned.name).toBe('Safe');
    });

    it('preserves passwords and secrets without stripping special characters', () => {
      const authPayload = {
        email: 'user@example.com',
        password: 'P@$$w0rd<with>Special!&Chars',
        refreshToken: 'raw_jwt_token',
      };

      const cleaned = sanitizeObject(authPayload);
      expect(cleaned.password).toBe('P@$$w0rd<with>Special!&Chars');
      expect(cleaned.email).toBe('user@example.com');
      expect(cleaned.refreshToken).toBe('raw_jwt_token');
    });
  });

  describe('containsMaliciousPattern', () => {
    it('detects common injection payloads', () => {
      expect(containsMaliciousPattern("<script>alert('xss')</script>")).toBe(true);
      expect(containsMaliciousPattern("1' UNION SELECT * FROM users--")).toBe(true);
      expect(containsMaliciousPattern('javascript:void(0)')).toBe(true);
      expect(containsMaliciousPattern('Normal Safe Profile Description')).toBe(false);
    });
  });
});
