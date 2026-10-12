export interface ParsedDeviceInfo {
  deviceType: 'DESKTOP' | 'MOBILE';
  browser: string;
  os: string;
  deviceName: string;
  location: string;
  ipAddress?: string;
}

export function parseUserAgentAndHeaders(
  userAgentHeader?: string,
  clientIp?: string,
  geoHeader?: string,
): ParsedDeviceInfo {
  const ua = userAgentHeader || '';

  // 1. Detect App vs Browser
  const isApp = ua.includes('ShaadiChat') || ua.includes('MatrimonyApp');

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
    browser = 'ShaadiChat App';
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
    deviceName = `ShaadiChat ${os} Mobile App`;
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
  const location = geoHeader || 'Kochi, Kerala';

  return {
    deviceType,
    browser,
    os,
    deviceName,
    location,
    ipAddress: clientIp || '127.0.0.1',
  };
}
