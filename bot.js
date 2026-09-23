const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const config = require('./config');

const SESSION_DIR = path.join(__dirname, 'session');

let sock = null;
let startTime = null;
let latestPairingCode = null;

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h} ساعت ${m} دقیقه ${s} ثانیه`;
}

function boxMessage(title, body) {
  return `*「 ${title} 」*\n\n${body}\n\n${config.FOOTER}`;
}

// ---------------- دستورات ربات (همه به فارسی) ----------------
async function handleCommand(m, text) {
  const prefix = config.PREFIX;
  if (!text || !text.startsWith(prefix)) return;

  const body = text.slice(prefix.length).trim();
  const command = body.split(' ')[0].toLowerCase();
  const args = body.split(' ').slice(1);
  const jid = m.key.remoteJid;

  const senderNumber = (m.key.participant || m.key.remoteJid || '').split('@')[0];
  const isOwner = senderNumber === config.OWNER_NUMBER;

  try {
    switch (command) {
      case 'منو':
      case 'menu': {
        const uptime = startTime ? formatUptime(Date.now() - startTime) : '۰';
        const text = boxMessage(config.BOT_NAME,
`👑 مالک: ${config.OWNER_NAME}
✒️ پیشوند: ${prefix}
🧬 نسخه: ${config.BOT_VERSION}
⏰ مدت فعالیت: ${uptime}

📜 *دستورات موجود:*
• ${prefix}منو — نمایش همین منو
• ${prefix}پینگ — بررسی سرعت پاسخ‌دهی
• ${prefix}زنده — وضعیت آنلاین بودن ربات
• ${prefix}مالک — اطلاعات مالک ربات
• ${prefix}کانال — لینک کانال پشتیبانی`);

        await sock.sendMessage(jid, { image: { url: config.LOGO }, caption: text }, { quoted: m });
        break;
      }

      case 'پینگ':
      case 'ping': {
        const start = Date.now();
        const sent = await sock.sendMessage(jid, { text: '⏳ در حال بررسی...' }, { quoted: m });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, { text: `📡 *پینگ:* ${latency} میلی‌ثانیه` }, { quoted: m });
        break;
      }

      case 'زنده':
      case 'alive': {
        const uptime = startTime ? formatUptime(Date.now() - startTime) : '۰';
        const text = boxMessage('✅ ربات فعال است',
`سلام! من ${config.BOT_NAME} هستم و در حال حاضر آنلاینم.

👤 مالک: ${config.OWNER_NAME}
⏰ مدت فعالیت: ${uptime}`);
        await sock.sendMessage(jid, { image: { url: config.LOGO }, caption: text }, { quoted: m });
        break;
      }

      case 'مالک':
      case 'owner': {
        const text = boxMessage('👑 اطلاعات مالک',
`نام: ${config.OWNER_NAME}
شماره: +${config.OWNER_NUMBER}`);
        await sock.sendMessage(jid, { text }, { quoted: m });
        break;
      }

      case 'کانال':
      case 'channel': {
        await sock.sendMessage(jid, { text: `📢 کانال پشتیبانی:\n${config.CHANNEL_LINK}` }, { quoted: m });
        break;
      }

      default:
        // دستور ناشناخته - سکوت می‌کنیم تا اسپم نشه
        break;
    }
  } catch (err) {
    console.error('خطا در اجرای دستور:', err);
    try { await sock.sendMessage(jid, { text: '❌ در اجرای دستور خطایی رخ داد.' }, { quoted: m }); } catch (e) {}
  }
}

// ---------------- مدیریت استوری‌ها ----------------
function setupStatusHandler() {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.key || msg.key.remoteJid !== 'status@broadcast' || !msg.key.participant) return;
    try {
      if (config.AUTO_READ_STATUS) {
        await sock.readMessages([msg.key]);
      }
      if (config.AUTO_LIKE_STATUS) {
        const emoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
      }
    } catch (err) {
      console.error('خطا در پردازش استوری:', err.message || err);
    }
  });
}

// ---------------- مدیریت پیام‌های عادی ----------------
function setupMessageHandler() {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.remoteJid === 'status@broadcast') return;
    if (m.key.fromMe) return; // به پیام‌های خودمون پاسخ ندیم

    if (config.AUTO_RECORDING) {
      try { await sock.sendPresenceUpdate('recording', m.key.remoteJid); } catch (e) {}
    }

    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      '';

    await handleCommand(m, text);
  });
}

// ---------------- اتصال اصلی به واتساپ ----------------
async function startBot(onPairingCode) {
  await fs.ensureDir(SESSION_DIR);
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Safari'),
  });

  // اگر هنوز به هیچ شماره‌ای وصل نیستیم، کد پیرینگ درخواست کن
  if (!sock.authState.creds.registered && config.OWNER_NUMBER) {
    let retries = config.MAX_RETRIES;
    while (retries > 0) {
      try {
        await delay(1500);
        latestPairingCode = await sock.requestPairingCode(config.OWNER_NUMBER);
        console.log(`\n🔑 کد پیرینگ شما: ${latestPairingCode}\n`);
        if (onPairingCode) onPairingCode(latestPairingCode);
        break;
      } catch (err) {
        retries--;
        await delay(2000);
      }
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      startTime = Date.now();
      console.log('✅ ربات با موفقیت به واتساپ متصل شد!');
      try {
        const jid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.sendMessage(jid, {
          text: boxMessage('✅ اتصال موفق', `${config.BOT_NAME} با موفقیت متصل و فعال شد.\n\nبرای دیدن دستورات: ${config.PREFIX}منو`),
        });
      } catch (e) { console.error('ارسال پیام خوش‌آمد ناموفق بود:', e.message); }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (loggedOut) {
        console.log('⚠️ ربات از واتساپ خارج شد. پوشه‌ی session رو پاک کن و دوباره پیر کن.');
        try { await fs.remove(SESSION_DIR); } catch (e) {}
      } else {
        console.log('🔄 اتصال قطع شد، در حال اتصال مجدد...');
        setTimeout(() => startBot(), 5000);
      }
    }
  });

  setupStatusHandler();
  setupMessageHandler();

  return sock;
}

function getLatestPairingCode() {
  return latestPairingCode;
}

module.exports = { startBot, getLatestPairingCode };
