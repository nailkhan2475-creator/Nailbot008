module.exports = {
  // ---------------- هویت ربات ----------------
  BOT_NAME: 'ربات نیل سایبر',
  OWNER_NAME: 'نیل سایبر',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '93785293400', // فقط عدد، بدون + یا فاصله
  BOT_VERSION: '1.0.0',
  PREFIX: '.', // پیشوند دستورات، مثلا .منو

  // ---------------- ظاهر ----------------
  LOGO: 'https://files.catbox.moe/sb24ud.jpg',
  FOOTER: '> قدرت گرفته از نیل سایبر',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbD6HQVDuMRbzvsG9n3O',

  // ---------------- رفتار خودکار ----------------
  AUTO_READ_STATUS: true,   // مشاهده‌ی خودکار استوری‌های مخاطبین
  AUTO_LIKE_STATUS: true,   // ری‌اکشن خودکار به استوری‌ها
  AUTO_LIKE_EMOJI: ['❤️', '🔥', '🌟', '💯', '🌸'],
  AUTO_RECORDING: false,    // نمایش "در حال ضبط صدا..." هنگام دریافت پیام

  MAX_RETRIES: 3,
};
