const express = require('express');
const path = require('path');
const { startBot, getLatestPairingCode } = require('./bot');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(__dirname)); // برای سرو کردن pair.html

// صفحه‌ی اصلی: نمایش صفحه‌ی پیرینگ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

// وضعیت فعلی ربات (کد پیرینگ در صورت وجود)
app.get('/status', (req, res) => {
  res.json({ code: getLatestPairingCode() });
});

app.listen(PORT, () => {
  console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
  startBot((code) => {
    console.log(`کد پیرینگ آماده شد: ${code}`);
  });
});
