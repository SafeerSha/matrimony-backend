const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Wiping All Database Tables (Clean Reset) ---');

  // 1. Check counts before wipe
  const [
    userCount,
    profileCount,
    preferenceCount,
    connectionCount,
    photoCount,
    messageCount,
    notificationCount,
    otpCount,
    deviceCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.preference.count(),
    prisma.connection.count(),
    prisma.photo.count(),
    prisma.message.count(),
    prisma.notification.count(),
    prisma.otpVerification.count(),
    prisma.userDevice.count(),
  ]);

  console.log('Current row counts:');
  console.log({
    users: userCount,
    profiles: profileCount,
    preferences: preferenceCount,
    connections: connectionCount,
    photos: photoCount,
    messages: messageCount,
    notifications: notificationCount,
    otpVerifications: otpCount,
    userDevices: deviceCount,
  });

  // 2. Wipe tables safely using CASCADE TRUNCATE
  console.log('\nExecuting TRUNCATE TABLE ... CASCADE ...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "User", 
      "Profile", 
      "Preference", 
      "Connection", 
      "Photo", 
      "Message", 
      "Notification", 
      "OtpVerification", 
      "UserDevice" 
    CASCADE;
  `);

  // 3. Verify counts after wipe
  const [
    postUserCount,
    postProfileCount,
    postPreferenceCount,
    postConnectionCount,
    postPhotoCount,
    postMessageCount,
    postNotificationCount,
    postOtpCount,
    postDeviceCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.preference.count(),
    prisma.connection.count(),
    prisma.photo.count(),
    prisma.message.count(),
    prisma.notification.count(),
    prisma.otpVerification.count(),
    prisma.userDevice.count(),
  ]);

  console.log('\nVerified post-wipe row counts:');
  console.log({
    users: postUserCount,
    profiles: postProfileCount,
    preferences: postPreferenceCount,
    connections: postConnectionCount,
    photos: postPhotoCount,
    messages: postMessageCount,
    notifications: postNotificationCount,
    otpVerifications: postOtpCount,
    userDevices: postDeviceCount,
  });

  console.log('\nAll tables successfully wiped and reset to fresh state!');
}

main()
  .catch((e) => {
    console.error('Failed to wipe database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
