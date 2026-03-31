require("dotenv").config();
// ✅ Connect to dashboard server
const http = require("http");

function saveRequestToDB(request) {
  const data = JSON.stringify({ ...request, clientId: "clinic" });
  const options = {
    hostname: "localhost",
    port: 3000,
    path: "/api/requests",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  };
  const req = http.request(options, (res) => {
    console.log(`📊 Saved to dashboard: ${res.statusCode}`);
  });
  req.on("error", (e) => console.error("❌ Dashboard save failed:", e.message));
  req.write(data);
  req.end();
}
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const conversations = {};
const userStates = {};
const pendingRequests = [];

const DOCTOR_NUMBER = "972524505228@c.us"; // نفس رقم العيادة

const SYSTEM_PROMPT = `
أنت مساعد ذكي لعيادة النور. مهمتك الرد على أسئلة المرضى بشكل ودي وسريع.

معلومات العيادة:
- الاسم: عيادة النور
- هاتف العيادة: 04-3750228 (خلال ساعات العمل فقط)
- واتساب: 972-52-450-5228+

ساعات العمل:
- الأحد حتى الخميس: صباحاً ٨:٠٠-١١:٠٠ | مساءً ١٦:٠٠-١٩:٠٠
- الجمعة: ١٤:٠٠-١٧:٠٠
- السبت: ١٠:٠٠-١٣:٠٠

فحوصات الدم:
- الأحد حتى الخميس من ٩:٠٠ حتى ١٢:٠٠ فقط — يلزم تحديد موعد مسبق

قواعد مهمة:
- رد دائماً باللغة التي يكتب بها المريض (عربي أو عبري)
- كن مختصراً وودياً
- لا تعطي معلومات طبية أو تشخيصات أبداً
- إذا كان السؤال خارج نطاق عمل العيادة قل: "للمزيد من المعلومات يرجى الاتصال بالعيادة على 04-3750228"
`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// كشف نية المريض
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function detectIntent(message) {
  const msg = message.toLowerCase();

  const sick_leave = ["אישור מחלה", "ايشور محلاه", "اشور محلاه", "تقرير مرضي", "ورقة مرضية", "מחלה", "بدي ورقة", "اجازة مرضية"];
  const appointment = ["تعيين دور", "موعد", "קביעת תור", "תור", "بدي دور", "احجز", "بدي موعد", "تعيين موعد"];
  const blood_test = ["فحص دم", "تحليل دم", "بدي فحص دم", "فحوصات دم", "فحص الدم", "בדיקת דם"];
  const medication = ["روشتة", "روشتيت", "دواء", "تجديد", "وصفة", "מרשם", "תרופה", "بدي دواء", "تجديد دواء", "دواء جديد"];

  if (sick_leave.some(k => msg.includes(k.toLowerCase()))) return "sick_leave";
  if (blood_test.some(k => msg.includes(k.toLowerCase()))) return "blood_test";
  if (appointment.some(k => msg.includes(k.toLowerCase()))) return "appointment";
  if (medication.some(k => msg.includes(k.toLowerCase()))) return "medication";
  return "other";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// إرسال ملخص للدكتور
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function sendSummaryToDoctor(request) {
  let summary = `🔔 *طلب جديد — عيادة النور*\n`;
  summary += `━━━━━━━━━━━━━━━━━━\n`;
  summary += `📋 النوع: *${request.type}*\n`;
  summary += `🕐 الوقت: ${request.time}\n`;
  summary += `📱 رقم المريض: ${request.phone}\n`;
  summary += `🪪 رقم الهوية: ${request.id}\n`;

  if (request.type === "אישור מחלה") {
    summary += `📅 من تاريخ: ${request.dateFrom}\n`;
    summary += `📅 حتى تاريخ: ${request.dateTo}\n`;
  }

  if (request.type === "فحص دم") {
    summary += `🧪 نوع الفحص: ${request.testType}\n`;
    summary += `🍽️ صيام: ${request.fasting}\n`;
    summary += `📄 إحالة طبيب: ${request.referral}\n`;
    summary += `💊 أدوية حالية: ${request.medications}\n`;
  }

  if (request.type === "تعيين موعد") {
    summary += `👤 الاسم: ${request.name}\n`;
    summary += `🔄 نوع الزيارة: ${request.visitType}\n`;
    summary += `🩺 سبب الزيارة: ${request.reason}\n`;
    summary += `💊 أعراض: ${request.symptoms}\n`;
    summary += `🏥 قوبة حولים: ${request.healthFund}\n`;
    summary += `⏰ الوقت المفضل: ${request.preferredTime}\n`;
  }

  if (request.type === "طلب دواء") {
    summary += `💊 نوع الطلب: ${request.medType}\n`;
    summary += `💊 اسم الدواء: ${request.medName}\n`;
    summary += `📅 شهري: ${request.isMonthly}\n`;
    summary += `🩺 السبب: ${request.reason}\n`;
    summary += `⚠️ حساسية: ${request.allergies}\n`;
    summary += `💊 أدوية أخرى: ${request.otherMeds}\n`;
  }

  if (request.type === "طلب آخر") {
    summary += `💬 وصف المشكلة: ${request.description}\n`;
  }

  try {
    await client.sendMessage(DOCTOR_NUMBER, summary);
    console.log("📤 Summary sent to doctor!");
  } catch (err) {
    console.error("❌ Failed to send to doctor:", err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// معالجة الـ State Machine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handleState(msg, userId, userMessage) {
  const state = userStates[userId];

  // الخطوة الأولى دائماً: رقم الهوية
  if (state.step === "ask_id") {
    state.data.id = userMessage;

    if (state.type === "sick_leave") {
      state.step = "ask_date_from";
      return "شكراً! 📅 من أي تاريخ تريد التقرير المرضي؟\n(مثال: ٢٧ مارس ٢٠٢٦)";
    }
    if (state.type === "blood_test") {
      state.step = "ask_test_type";
      return "شكراً! 🧪 ما نوع فحص الدم المطلوب؟\n(مثال: صورة دم كاملة، سكر، كوليسترول، وظائف كلى...)";
    }
    if (state.type === "appointment") {
      state.step = "ask_name";
      return "شكراً! 👤 ما هو اسمك الكامل؟";
    }
    if (state.type === "medication") {
      state.step = "ask_med_type";
      return "💊 ما الذي تحتاجه؟\n1️⃣ تجديد روشتة دواء شهري\n2️⃣ دواء جديد\n\n(اكتب *تجديد* أو *جديد*)";
    }
    if (state.type === "other") {
      state.step = "ask_description";
      return "شكراً! 💬 باختصار، ما هي المشكلة أو الطلب اللي تحتاج مساعدة فيه؟";
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SICK LEAVE FLOW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (state.type === "sick_leave") {
    if (state.step === "ask_date_from") {
      state.data.dateFrom = userMessage;
      state.step = "ask_date_to";
      return "📅 حتى أي تاريخ؟\n(مثال: ٢٩ مارس ٢٠٢٦)";
    }

    if (state.step === "ask_date_to") {
      state.data.dateTo = userMessage;

      const request = {
        type: "אישור מחלה",
        time: new Date().toLocaleString("ar-IL"),
        phone: userId.replace("@c.us", "").replace("@lid", ""),
        id: state.data.id,
        dateFrom: state.data.dateFrom,
        dateTo: state.data.dateTo,
      };

      pendingRequests.push(request);
      saveRequestToDB(request);
      await sendSummaryToDoctor(request);
      delete userStates[userId];

      return `✅ *تم تسجيل طلبك بنجاح!*\n\n📋 ملخص الطلب:\n🪪 رقم الهوية: ${state.data.id}\n📅 من تاريخ: ${state.data.dateFrom}\n📅 حتى تاريخ: ${state.data.dateTo}\n\nسيراجع الطبيب طلبك. يرجى الحضور شخصياً لاستلام التقرير خلال ساعات العمل. 😊`;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOOD TEST FLOW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (state.type === "blood_test") {
    if (state.step === "ask_test_type") {
      state.data.testType = userMessage;
      state.step = "ask_fasting";
      return "🍽️ هل ستكون صائماً عند إجراء الفحص؟ (نعم / لا)";
    }

    if (state.step === "ask_fasting") {
      state.data.fasting = userMessage;
      state.step = "ask_referral";
      return "📄 هل عندك إحالة من طبيب؟ (نعم / لا)";
    }

    if (state.step === "ask_referral") {
      state.data.referral = userMessage;
      state.step = "ask_medications";
      return "💊 هل تأخذ أي أدوية حالياً؟\n(اذكرها أو اكتب 'لا')";
    }

    if (state.step === "ask_medications") {
      state.data.medications = userMessage;

      const request = {
        type: "فحص دم",
        time: new Date().toLocaleString("ar-IL"),
        phone: userId.replace("@c.us", "").replace("@lid", ""),
        id: state.data.id,
        testType: state.data.testType,
        fasting: state.data.fasting,
        referral: state.data.referral,
        medications: state.data.medications,
      };

      pendingRequests.push(request);
      await sendSummaryToDoctor(request);
      delete userStates[userId];

      return `✅ *تم تسجيل طلب فحص الدم!*\n\n📋 ملخص:\n🪪 رقم الهوية: ${state.data.id}\n🧪 نوع الفحص: ${state.data.testType}\n🍽️ صيام: ${state.data.fasting}\n📄 إحالة: ${state.data.referral}\n💊 أدوية: ${state.data.medications}\n\n⏰ فحوصات الدم: الأحد-الخميس من ٩:٠٠ حتى ١٢:٠٠ مع موعد مسبق.\nللتأكيد اتصل: 04-3750228 😊`;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // APPOINTMENT FLOW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (state.type === "appointment") {
    if (state.step === "ask_name") {
      state.data.name = userMessage;
      state.step = "ask_visit_type";
      return "🔄 هل هذه زيارة أولى أم متابعة؟\n(أولى / متابعة)";
    }

    if (state.step === "ask_visit_type") {
      state.data.visitType = userMessage;
      state.step = "ask_reason";
      return "🩺 ما هو سبب الزيارة؟\n(مثال: ضغط دم، سكر، فحص عام، ألم في الظهر...)";
    }

    if (state.step === "ask_reason") {
      state.data.reason = userMessage;
      state.step = "ask_symptoms";
      return "💊 هل عندك أعراض معينة؟ صِفها باختصار:\n(أو اكتب 'لا' إذا ما في)";
    }

    if (state.step === "ask_symptoms") {
      state.data.symptoms = userMessage;
      state.step = "ask_health_fund";
      return "🏥 ما هي قوبة حولים (صندوق الصحة)؟\n(كللت / مكابي / מאוחדת / לאומית)";
    }

    if (state.step === "ask_health_fund") {
      state.data.healthFund = userMessage;
      state.step = "ask_time";
      return "⏰ ما هو الوقت المفضل للموعد؟\n(مثال: الأحد صباحاً، أي يوم مساءً، أقرب وقت...)";
    }

    if (state.step === "ask_time") {
      state.data.preferredTime = userMessage;

      const request = {
        type: "تعيين موعد",
        time: new Date().toLocaleString("ar-IL"),
        phone: userId.replace("@c.us", "").replace("@lid", ""),
        id: state.data.id,
        name: state.data.name,
        visitType: state.data.visitType,
        reason: state.data.reason,
        symptoms: state.data.symptoms,
        healthFund: state.data.healthFund,
        preferredTime: state.data.preferredTime,
      };

      pendingRequests.push(request);
      await sendSummaryToDoctor(request);
      delete userStates[userId];

      return `✅ *تم تسجيل طلب الموعد!*\n\n📋 ملخص:\n🪪 رقم الهوية: ${state.data.id}\n👤 الاسم: ${state.data.name}\n🔄 نوع الزيارة: ${state.data.visitType}\n🩺 السبب: ${state.data.reason}\n💊 الأعراض: ${state.data.symptoms}\n🏥 قوبة حولים: ${state.data.healthFund}\n⏰ الوقت المفضل: ${state.data.preferredTime}\n\nسنتواصل معك قريباً لتأكيد الموعد. 😊`;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MEDICATION FLOW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (state.type === "medication") {
    if (state.step === "ask_med_type") {
      state.data.medType = userMessage;
      state.step = "ask_med_name";

      const isRenewal =
        userMessage.includes("تجديد") ||
        userMessage.includes("نفس") ||
        userMessage.includes("شهري") ||
        userMessage.includes("1");

      if (isRenewal) {
        state.data.medType = "تجديد روشتة شهرية";
        return "💊 ما هو اسم الدواء اللي تريد تجديده؟";
      }

      state.data.medType = "دواء جديد";
      return "💊 ما هو اسم الدواء المطلوب؟\n(إذا ما تعرف الاسم، صِف الحالة اللي تحتاج دواء لها)";
    }

    if (state.step === "ask_med_name") {
      state.data.medName = userMessage;
      state.step = "ask_is_monthly";
      return "📅 هل هذا دواء شهري منتظم؟\n(نعم / لا)";
    }

    if (state.step === "ask_is_monthly") {
      state.data.isMonthly = userMessage;

      const isNotMonthly =
        userMessage.includes("لا") ||
        userMessage.includes("لأ") ||
        userMessage.includes("לא") ||
        userMessage.includes("مش");

      if (isNotMonthly) {
        state.step = "ask_med_reason";
        return "🩺 ما هو سبب الحاجة لهذا الدواء؟\n(صِف الأعراض أو الحالة باختصار)";
      }

      state.data.reason = "دواء شهري منتظم";
      state.step = "ask_med_allergies";
      return "⚠️ هل عندك حساسية من أي أدوية؟\n(اذكرها أو اكتب 'لا')";
    }

    if (state.step === "ask_med_reason") {
      state.data.reason = userMessage;
      state.step = "ask_med_allergies";
      return "⚠️ هل عندك حساسية من أي أدوية؟\n(اذكرها أو اكتب 'لا')";
    }

    if (state.step === "ask_med_allergies") {
      state.data.allergies = userMessage;
      state.step = "ask_other_meds";
      return "💊 هل تأخذ أدوية أخرى حالياً؟\n(اذكرها أو اكتب 'لا')";
    }

    if (state.step === "ask_other_meds") {
      state.data.otherMeds = userMessage;

      const request = {
        type: "طلب دواء",
        time: new Date().toLocaleString("ar-IL"),
        phone: userId.replace("@c.us", "").replace("@lid", ""),
        id: state.data.id,
        medType: state.data.medType,
        medName: state.data.medName,
        isMonthly: state.data.isMonthly,
        reason: state.data.reason,
        allergies: state.data.allergies,
        otherMeds: state.data.otherMeds,
      };

      pendingRequests.push(request);
      await sendSummaryToDoctor(request);
      delete userStates[userId];

      return `✅ *تم تسجيل طلب الدواء!*\n\n📋 ملخص:\n🪪 رقم الهوية: ${state.data.id}\n💊 نوع الطلب: ${state.data.medType}\n💊 اسم الدواء: ${state.data.medName}\n📅 شهري: ${state.data.isMonthly}\n🩺 السبب: ${state.data.reason}\n⚠️ حساسية: ${state.data.allergies}\n💊 أدوية أخرى: ${state.data.otherMeds}\n\nسيراجع الطبيب طلبك وسنتواصل معك قريباً. 😊`;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // OTHER FLOW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (state.type === "other" && state.step === "ask_description") {
    state.data.description = userMessage;

    const request = {
      type: "طلب آخر",
      time: new Date().toLocaleString("ar-IL"),
      phone: userId.replace("@c.us", "").replace("@lid", ""),
      id: state.data.id,
      description: state.data.description,
    };

    pendingRequests.push(request);
    await sendSummaryToDoctor(request);
    delete userStates[userId];

    return `✅ *تم استلام طلبك!*\n\n📋 ملخص:\n🪪 رقم الهوية: ${state.data.id}\n💬 الطلب: ${state.data.description}\n\nسيتواصل معك فريق العيادة قريباً.\nللاستفسار: 04-3750228 😊`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI reply للأسئلة العامة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function getAIReply(userId, userMessage) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", parts: [{ text: userMessage }] });
  if (conversations[userId].length > 10) conversations[userId] = conversations[userId].slice(-10);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent({ contents: conversations[userId] });
  const reply = result.response.text();
  conversations[userId].push({ role: "model", parts: [{ text: reply }] });
  return reply;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// إعداد WhatsApp
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { execSync } = require("child_process");

function findChromium() {
  const paths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/run/current-system/sw/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
  ];
  for (const p of paths) {
    try {
      execSync(`test -f ${p}`);
      return p;
    } catch {}
  }
  try {
    return execSync("which chromium || which chromium-browser || which google-chrome")
      .toString().trim();
  } catch {}
  return null;
}

const chromiumPath = findChromium();
console.log("🌐 Chromium path:", chromiumPath);

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    ...(chromiumPath && { executablePath: chromiumPath }),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  },
});
client.on("qr", (qr) => {
  console.log("📱 Scan this QR code with WhatsApp Business:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ عيادة النور WhatsApp AI Assistant is running!");
  console.log("📊 أوامر: 'ملخص' لعرض الطلبات | 'مسح' لمسحها");
});

client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return;
  if (msg.from === "status@broadcast") return;

  const userId = msg.from;
  const userMessage = msg.body.trim();
  console.log(`📩 Message from ${userId}: ${userMessage}`);

  try {
    // ✅ أوامر الإدارة
    if (userMessage === "ملخص") {
      if (pendingRequests.length === 0) {
        await msg.reply("📋 لا يوجد طلبات جديدة حتى الآن.");
        return;
      }
      let summary = `📋 *ملخص الطلبات* (${pendingRequests.length} طلب)\n━━━━━━━━━━━━━━━━━━\n\n`;
      pendingRequests.forEach((req, i) => {
        summary += `*${i + 1}. ${req.type}*\n🕐 ${req.time}\n📱 ${req.phone}\n🪪 ${req.id}\n\n`;
      });
      await msg.reply(summary);
      return;
    }

    if (userMessage === "مسح") {
      pendingRequests.length = 0;
      await msg.reply("✅ تم مسح جميع الطلبات.");
      return;
    }

    // ✅ إذا المريض في منتصف flow
    if (userStates[userId]) {
      const reply = await handleState(msg, userId, userMessage);
      await msg.reply(reply);
      return;
    }

    // ✅ كشف النية وبدء الـ flow
    const intent = detectIntent(userMessage);

    if (intent === "sick_leave") {
      userStates[userId] = { type: "sick_leave", step: "ask_id", data: {} };
      await msg.reply("بالتأكيد! 😊\nلتجهيز طلب تقرير مرضي، أرجو إرسال *رقم هويتك* أولاً:");
      return;
    }

    if (intent === "blood_test") {
      userStates[userId] = { type: "blood_test", step: "ask_id", data: {} };
      await msg.reply("حسناً! 😊\nلتسجيل طلب فحص دم، أرجو إرسال *رقم هويتك* أولاً:\n\n⏰ فحوصات الدم: الأحد-الخميس من ٩:٠٠ حتى ١٢:٠٠ مع موعد مسبق.");
      return;
    }

    if (intent === "appointment") {
      userStates[userId] = { type: "appointment", step: "ask_id", data: {} };
      await msg.reply("بكل سرور! 😊\nلتعيين موعد، أرجو إرسال *رقم هويتك* أولاً:");
      return;
    }

    if (intent === "medication") {
      userStates[userId] = { type: "medication", step: "ask_id", data: {} };
      await msg.reply("بالتأكيد! 😊\nلطلب الدواء، أرجو إرسال *رقم هويتك* أولاً:");
      return;
    }

    if (intent === "other") {
      userStates[userId] = { type: "other", step: "ask_id", data: {} };
      await msg.reply("أهلاً! 😊\nأرجو إرسال *رقم هويتك* أولاً حتى نتمكن من مساعدتك:");
      return;
    }

    // ✅ أسئلة عامة
    const reply = await getAIReply(userId, userMessage);
    await msg.reply(reply);
    console.log(`✅ Replied: ${reply}`);

  } catch (err) {
    console.error("❌ Error:", err);
    await msg.reply("عذراً، حدث خطأ. يرجى الاتصال بالعيادة مباشرة على الرقم 04-3750228");
  }
});

client.on("disconnected", (reason) => {
  console.log("⚠️ WhatsApp disconnected:", reason);
  console.log("🔄 Restart the bot to reconnect...");
});

client.initialize();
