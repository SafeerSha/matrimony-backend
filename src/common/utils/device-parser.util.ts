import * as geoip from 'geoip-lite';

export interface ParsedDeviceInfo {
  deviceType: 'DESKTOP' | 'MOBILE';
  browser: string;
  os: string;
  deviceName: string;
  location: string;
  ipAddress?: string;
}

const INDIAN_STATES: Record<string, string> = {
  AN: 'Andaman and Nicobar',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CT: 'Chhattisgarh',
  DN: 'Dadra and Nagar Haveli',
  DD: 'Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OR: 'Odisha',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UT: 'Uttarakhand',
  WB: 'West Bengal',
};

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India',
  AE: 'UAE',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  SG: 'Singapore',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  OM: 'Oman',
  BH: 'Bahrain',
  MY: 'Malaysia',
  DE: 'Germany',
  FR: 'France',
};

export function resolveGeoLocation(clientIp?: string, geoHeader?: string): string {
  // 1. If upstream reverse proxy (Cloudflare, Vercel, Nginx) already identified the city
  if (geoHeader && geoHeader.trim() && geoHeader.trim().toLowerCase() !== 'unknown') {
    return geoHeader.trim();
  }

  // 2. Perform offline GeoIP lookup on clientIp
  if (clientIp) {
    const cleanIp = clientIp.split(',')[0].trim();
    const isPrivate =
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp === 'localhost' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.16.') ||
      cleanIp.startsWith('172.17.') ||
      cleanIp.startsWith('172.18.') ||
      cleanIp.startsWith('172.19.') ||
      cleanIp.startsWith('172.2') ||
      cleanIp.startsWith('172.3');

    if (!isPrivate) {
      try {
        const geo = geoip.lookup(cleanIp);
        if (geo) {
          const city = geo.city?.trim();
          const countryName = COUNTRY_NAMES[geo.country] || geo.country;
          const stateName = geo.country === 'IN' ? (INDIAN_STATES[geo.region] || geo.region) : geo.region;

          if (city && stateName) {
            return `${city}, ${stateName}`;
          }
          if (city && countryName) {
            return `${city}, ${countryName}`;
          }
          if (stateName && countryName) {
            return `${stateName}, ${countryName}`;
          }
          if (countryName) {
            return countryName;
          }
        }
      } catch {
        // Fall through to fallback
      }
    }
  }

  // 3. Sensible default for development / local network
  return 'Kochi, Kerala';
}

export function parseUserAgentAndHeaders(
  userAgentHeader?: string,
  clientIp?: string,
  geoHeader?: string,
): ParsedDeviceInfo {
  const ua = userAgentHeader || '';

  // 1. Detect App vs Browser
  const isApp = ua.includes('IshtamChat') || ua.includes('MatrimonyApp');

  // 2. Detect OS
  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/Windows NT 10\.0/i.test(ua)) {
    os = 'Windows 11';
  } else if (/Windows NT 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Detect Browser
  let browser = 'Browser';
  if (isApp) {
    browser = 'IshtamChat App';
  } else if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Opera|OPR\//i.test(ua)) {
    browser = 'Opera';
  }

  // 4. Device Type
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const deviceType: 'DESKTOP' | 'MOBILE' = isMobile ? 'MOBILE' : 'DESKTOP';

  // 5. Construct Friendly Device Name
  let deviceName: string;
  if (isApp) {
    deviceName = `IshtamChat ${os} Mobile App`;
  } else if (isMobile) {
    if (/iPhone/i.test(ua)) {
      deviceName = `Safari on iPhone (${os})`;
    } else {
      deviceName = `${browser} on ${os}`;
    }
  } else {
    deviceName = `${browser} on ${os}`;
  }

  // 6. Location inference
  const location = resolveGeoLocation(clientIp, geoHeader);

  return {
    deviceType,
    browser,
    os,
    deviceName,
    location,
    ipAddress: clientIp || '127.0.0.1',
  };
}
