// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WhatsBot Platform
// كيف تستخدمه:
//   node index.js --config configs/barber-abu-ahmad.js
//   node index.js --config configs/clinic-nour.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
require("dotenv").config();

// ✅ قرأ الـ config من الـ command line
const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const configPath = configIndex !== -1 ? args[configIndex + 1] : null;

if (!configPath) {
  console.error("❌ يجب تحديد ملف الـ config:");
  console.error("   node index.js --config configs/barber-abu-ahmad.js");
  process.exit(1);
}

const config = require("./" + configPath);
console.log(`🚀 Starting bot for: ${config.name} (${config.type})`);

// ✅ شغّل البوت المناسب حسب النوع
if (config.type === "barber") {
  require("./bots/barberBot")(config);
} else if (config.type === "clinic") {
  require("./bots/clinicBot")(config);
} else {
  console.error(`❌ نوع غير معروف: ${config.type}`);
  process.exit(1);
}

// ✅ شغّل السيرفر والداشبورد
require("./server");
