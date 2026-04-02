// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// barberBot.js — بوت الحلاق
// يقبل أي config ويشتغل عليه
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { execSync } = require("child_process");

module.exports = function startBarberBot(config) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const conversations = {};
  const userStates = {};
  const bookings = {};

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Booking Engine
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function generateSlots() {
    const slots = [];
    const [oH, oM] = config.openTime.split(":").map(Number);
    const [cH, cM] = config.closeTime.split(":").map(Number);
    let cur = oH * 60 + oM;
    const end = cH * 60 + cM;
    while (cur + config.slotDuration <= end) {
      slots.push(`${String(Math.floor(cur/60)).padStart(2,"0")}:${String(cur%60).padStart(2,"0")}`);
      cur += config.slotDuration;
    }
    return slots;
  }

  function getAvailableSlots(date) {
    const day = new Date(date).toLocaleDateString("en-US", { weekday: "long" });
    if (config.offDays.includes(day)) return [];
    const all = generateSlots();
    const booked = bookings[date] || {};
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    return all.filter(slot => {
      if (booked[slot]) return false;
      if (date === today) {
        const [h, m] = slot.split(":").map(Number);
        const t = new Date(); t.setHours(h, m, 0);
        return t > now;
      }
      return true;
    });
  }

  function createBooking(date, time, phone, name) {
    if (!bookings[date]) bookings[date] = {};
    if (bookings[date][time]) {
      const alts = getAvailableSlots(date).slice(0, 3);
      return { success: false, alternatives: alts };
    }
    bookings[date][time] = { phone, name, status: "confirmed", createdAt: new Date() };
    return { success: true };
  }

  function cancelBooking(phone, date, time) {
    if (bookings[date]?.[time]?.phone === phone) {
      delete bookings[date][time];
      return true;
    }
    return false;
  }

  function getCustomerBookings(phone) {
    const result = [];
    for (const [date, slots] of Object.entries(bookings)) {
      for (const [time, b] of Object.entries(slots)) {
        if (b.phone === phone && b.status === "confirmed") {
          result.push({ date, time, ...b });
        }
      }
    }
    return result.sort((a, b) => new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time));
  }

  function getNext7Days() {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
      if (!config.offDays.includes(dayName)) {
        const slots = getAvailableSlots(dateStr);
        if (slots.length > 0) {
          days.push({
            date: dateStr,
            label: i === 0 ? "اليوم" : i === 1 ? "غداً" : formatDate(dateStr),
            slots,
          });
        }
      }
    }
    return days;
  }

  function formatDate(dateStr) {
    const daysAr = { Sunday:"الأحد", Monday:"الاثنين", Tuesday:"الثلاثاء", Wednesday:"الأربعاء", Thursday:"الخميس", Friday:"الجمعة", Saturday:"السبت" };
    const monthsAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const d = new Date(dateStr);
    return `${daysAr[d.toLocaleDateString("en-US",{weekday:"long"})]} ${d.getDate()} ${monthsAr[d.getMonth()]}`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تذكير قبل ساعة
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function scheduleReminder(userId, date, time, name) {
    const [h, m] = time.split(":").map(Number);
    const apptTime = new Date(date);
    apptTime.setHours(h, m, 0);
    const reminderTime = new Date(apptTime.getTime() - 60 * 60 * 1000);
    const delay = reminderTime.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(async () => {
        try {
          await client.sendMessage(userId,
            `⏰ *تذكير بموعدك!*\n\nمرحباً ${name}،\nموعدك في *${config.name}* بعد ساعة.\n\n🕐 الوقت: ${time}\n📍 ${config.address}\n\nنراك قريباً! 💈`
          );
        } catch {}
      }, delay);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // كشف النية
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function detectIntent(msg) {
    const m = msg.toLowerCase();
    if (["إلغاء","الغ","ألغي","cancel","ביטול"].some(k => m.includes(k))) return "cancel";
    if (["حجوزاتي","موعدي","متى موعدي","הזמנות שלי"].some(k => m.includes(k))) return "my_bookings";
    if (["حجز","موعد","بدي دور","book","תור","קביעת","بدي أجي","وقت فاضي"].some(k => m.includes(k))) return "book";
    if (["وين","عنوان","موقع","מיקום","איפה"].some(k => m.includes(k))) return "location";
    if (["سعر","كم","بكم","מחיר","כמה"].some(k => m.includes(k))) return "price";
    if (["ساعات","متى تفتح","دوام","שעות"].some(k => m.includes(k))) return "hours";
    if (["فاضي","مشغول","في وقت","هل في"].some(k => m.includes(k))) return "available";
    return "other";
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // State Machine
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function handleState(userId, userMessage) {
    const state = userStates[userId];
    const phone = userId.replace("@c.us","").replace("@lid","");

    if (state.step === "select_date") {
      const days = getNext7Days();
      const i = parseInt(userMessage) - 1;
      if (isNaN(i) || i < 0 || i >= days.length) return `يرجى إرسال رقم من 1 إلى ${days.length}.`;
      state.data.date = days[i].date;
      state.data.dateLabel = days[i].label;
      state.step = "select_time";
      const slots = getAvailableSlots(state.data.date);
      return `⏰ *الأوقات المتاحة — ${state.data.dateLabel}:*\n\n${slots.map((s,i)=>`${i+1}. ${s}`).join("\n")}\n\nاختر رقم الوقت:`;
    }

    if (state.step === "select_time") {
      const slots = getAvailableSlots(state.data.date);
      const i = parseInt(userMessage) - 1;
      if (isNaN(i) || i < 0 || i >= slots.length) return `يرجى إرسال رقم من 1 إلى ${slots.length}.`;
      state.data.time = slots[i];
      state.step = "enter_name";
      return `✏️ ما هو اسمك الكامل؟`;
    }

    if (state.step === "enter_name") {
      if (userMessage.trim().length < 3) return "يرجى إدخال اسمك الكامل.";
      state.data.name = userMessage.trim();
      state.step = "confirm";
      const services = config.services?.map(s=>`✂️ ${s.name}: ${s.price}${config.currency}`).join("\n") || `✂️ حلاقة: ${config.price}${config.currency}`;
      return `✅ *تأكيد الحجز:*\n\n👤 ${state.data.name}\n📅 ${state.data.dateLabel}\n⏰ ${state.data.time}\n💈 ${config.name}\n\n${services}\n\nاكتب *نعم* للتأكيد أو *لا* للإلغاء:`;
    }

    if (state.step === "confirm") {
      const yes = ["نعم","اه","أكيد","yes","כן","تمام","موافق"].some(k => userMessage.toLowerCase().includes(k));
      if (yes) {
        const result = createBooking(state.data.date, state.data.time, phone, state.data.name);
        if (!result.success) {
          delete userStates[userId];
          return `⚠️ عذراً! هذا الوقت حُجز للتو.\n\nأوقات بديلة:\n${result.alternatives.map((s,i)=>`${i+1}. ${s}`).join("\n")}\n\nأرسل *حجز* لتجربة وقت آخر.`;
        }
        await notifyBarber(`🔔 *حجز جديد!*\n👤 ${state.data.name}\n📱 ${phone}\n📅 ${state.data.dateLabel}\n⏰ ${state.data.time}`);
        scheduleReminder(userId, state.data.date, state.data.time, state.data.name);
        delete userStates[userId];
        return `🎉 *تم تأكيد حجزك!*\n\n👤 ${state.data.name}\n📅 ${state.data.dateLabel}\n⏰ ${state.data.time}\n📍 ${config.address}\n\nنتطلع لرؤيتك! 💈\n\nللإلغاء اكتب: *إلغاء*`;
      }
      delete userStates[userId];
      return "تم إلغاء الحجز. أرسل *حجز* في أي وقت. 💈";
    }

    if (state.step === "select_cancel") {
      const myBookings = getCustomerBookings(phone);
      const i = parseInt(userMessage) - 1;
      if (isNaN(i) || i < 0 || i >= myBookings.length) return `يرجى إرسال رقم من 1 إلى ${myBookings.length}.`;
      state.data.cancelDate = myBookings[i].date;
      state.data.cancelTime = myBookings[i].time;
      state.step = "confirm_cancel";
      return `هل تريد إلغاء موعد *${formatDate(state.data.cancelDate)}* الساعة *${state.data.cancelTime}*؟\n\nاكتب *نعم* للتأكيد.`;
    }

    if (state.step === "confirm_cancel") {
      const yes = ["نعم","اه","yes","כן"].some(k => userMessage.toLowerCase().includes(k));
      if (yes) {
        const ok = cancelBooking(phone, state.data.cancelDate, state.data.cancelTime);
        delete userStates[userId];
        if (ok) {
          await notifyBarber(`❌ *إلغاء موعد*\n📅 ${formatDate(state.data.cancelDate)}\n⏰ ${state.data.cancelTime}`);
          return `✅ تم إلغاء موعدك.\n\nيمكنك الحجز مجدداً في أي وقت. 💈`;
        }
      }
      delete userStates[userId];
      return "موعدك لا يزال محجوزاً.";
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تنبيه الحلاق
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function notifyBarber(message) {
    try {
      await client.sendMessage(`${config.whatsapp}@c.us`, message);
    } catch {}
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AI للأسئلة العامة
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const SYSTEM_PROMPT = `
أنت مساعد ذكي لـ${config.name}.
العنوان: ${config.address}
ساعات العمل: ${config.openTime} - ${config.closeTime}
إجازة: ${config.offDays.join(", ")}
الأسعار: ${config.services?.map(s=>`${s.name}: ${s.price}${config.currency}`).join(" | ") || `${config.price}${config.currency}`}
للحجز: اكتب "حجز" | للإلغاء: اكتب "إلغاء"
رد باللغة التي يكتب بها الزبون (عربي أو عبري). كن مختصراً وودياً.
  `;

  async function getAIReply(userId, userMessage) {
    if (!conversations[userId]) conversations[userId] = [];
    conversations[userId].push({ role: "user", parts: [{ text: userMessage }] });
    if (conversations[userId].length > 10) conversations[userId] = conversations[userId].slice(-10);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: SYSTEM_PROMPT });
    const result = await model.generateContent({ contents: conversations[userId] });
    const reply = result.response.text();
    conversations[userId].push({ role: "model", parts: [{ text: reply }] });
    return reply;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WhatsApp Client
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function findChromium() {
    for (const p of ["/usr/bin/chromium","/usr/bin/chromium-browser","/usr/bin/google-chrome"]) {
      try { execSync(`test -f ${p}`); return p; } catch {}
    }
    try { return execSync("which chromium || which chromium-browser").toString().trim(); } catch {}
    return null;
  }

  const chromiumPath = findChromium();
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `barber-${config.whatsapp}` }),
    puppeteer: {
      ...(chromiumPath && { executablePath: chromiumPath }),
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"],
    },
  });

  client.on("qr", qr => {
    console.log(`📱 QR for ${config.name}:`);
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => console.log(`✅ ${config.name} bot is running!`));

  client.on("message", async (msg) => {
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

    const userId = msg.from;
    const userMessage = msg.body.trim();
    const phone = userId.replace("@c.us","").replace("@lid","");
    console.log(`📩 [${config.name}] ${phone}: ${userMessage}`);

    try {
      // أمر ملخص اليوم للحلاق
      if (userMessage === "ملخص" || userMessage === "סיכום") {
        const today = new Date().toISOString().split("T")[0];
        const todayBookings = Object.entries(bookings[today] || {}).filter(([,b]) => b.status === "confirmed");
        if (!todayBookings.length) { await msg.reply("📋 لا يوجد حجوزات اليوم."); return; }
        let s = `📋 *حجوزات اليوم — ${formatDate(today)}*\n\n`;
        todayBookings.sort(([a],[b])=>a.localeCompare(b)).forEach(([t,b]) => s += `⏰ ${t} — 👤 ${b.name}\n`);
        await msg.reply(s); return;
      }

      // flow نشط
      if (userStates[userId]) {
        const reply = await handleState(userId, userMessage);
        if (reply) await msg.reply(reply);
        return;
      }

      // تحية
      const greetings = ["مرحبا","هلا","اهلا","السلام","صباح","مساء","hi","hello","שלום","היי"];
      if (greetings.some(g => userMessage.toLowerCase().includes(g))) {
        const welcomeMsg = config.welcomeMsg ||
          `أهلاً وسهلاً! 💈\n*${config.name}*\n\nكيف يمكنني مساعدتك؟\n\n✂️ *حجز* — لحجز موعد\n📋 *حجوزاتي* — مواعيدك\n❌ *إلغاء* — إلغاء موعد\n📍 *موقع* — العنوان\n💰 *سعر* — الأسعار`;
        await msg.reply(welcomeMsg); return;
      }

      const intent = detectIntent(userMessage);

      if (intent === "book") {
        const days = getNext7Days();
        if (!days.length) { await msg.reply("لا يوجد أوقات متاحة. تواصل معنا مباشرة."); return; }
        userStates[userId] = { step: "select_date", data: {} };
        let r = `📅 *اختر اليوم:*\n\n`;
        days.forEach((d,i) => r += `${i+1}. ${d.label} — ${d.slots.length} وقت متاح\n`);
        await msg.reply(r); return;
      }

      if (intent === "cancel") {
        const myBookings = getCustomerBookings(phone);
        if (!myBookings.length) { await msg.reply("لا يوجد مواعيد نشطة."); return; }
        userStates[userId] = { step: "select_cancel", data: {} };
        let r = "❌ *اختر الموعد للإلغاء:*\n\n";
        myBookings.forEach((b,i) => r += `${i+1}. ${formatDate(b.date)} ⏰ ${b.time}\n`);
        await msg.reply(r); return;
      }

      if (intent === "my_bookings") {
        const myBookings = getCustomerBookings(phone);
        if (!myBookings.length) { await msg.reply("لا يوجد مواعيد. أرسل *حجز* لحجز موعد."); return; }
        let r = "📋 *مواعيدك:*\n\n";
        myBookings.forEach(b => r += `📅 ${formatDate(b.date)} ⏰ ${b.time}\n`);
        await msg.reply(r); return;
      }

      if (intent === "location") { await msg.reply(`📍 *${config.name}*\n${config.address}\n\n${config.phone}`); return; }

      if (intent === "price") {
        const s = config.services?.map(s=>`✂️ ${s.name}: ${s.price}${config.currency}`).join("\n") || `✂️ حلاقة: ${config.price}${config.currency}`;
        await msg.reply(`💰 *الأسعار:*\n\n${s}\n\nللحجز: *حجز*`); return;
      }

      if (intent === "hours") {
        await msg.reply(`🕐 *ساعات العمل:*\n\n${config.openTime} - ${config.closeTime}\nإجازة: ${config.offDays.join(", ")}\n\nللحجز: *حجز*`); return;
      }

      if (intent === "available") {
        const today = new Date().toISOString().split("T")[0];
        const slots = getAvailableSlots(today);
        if (!slots.length) { await msg.reply("لا يوجد أوقات اليوم. اكتب *حجز* ليوم آخر."); return; }
        await msg.reply(`✅ *متاح اليوم:*\n\n${slots.slice(0,5).join(" | ")}\n\nللحجز: *حجز*`); return;
      }

      const reply = await getAIReply(userId, userMessage);
      await msg.reply(reply);

    } catch (err) {
      console.error(`❌ [${config.name}]`, err.message);
      await msg.reply(`عذراً، حدث خطأ. تواصل معنا: ${config.phone}`);
    }
  });

  client.on("disconnected", reason => console.log(`⚠️ [${config.name}] disconnected:`, reason));
  client.initialize();
};
