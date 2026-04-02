// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// clinicBot.js — بوت العيادة
// يقبل أي config ويشتغل عليه
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { execSync } = require("child_process");
const http = require("http");

module.exports = function startClinicBot(config) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const conversations = {};
  const userStates = {};
  const pendingRequests = [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // إرسال ملخص للدكتور
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function sendSummaryToDoctor(request) {
    let summary = `🔔 *طلب جديد — ${config.name}*\n━━━━━━━━━━━━\n`;
    summary += `📋 *${request.type}*\n`;
    summary += `🕐 ${request.time}\n`;
    summary += `📱 ${request.phone}\n`;
    summary += `🪪 ${request.id}\n`;

    if (request.type === "אישור מחלה") {
      summary += `📅 من: ${request.dateFrom}\n📅 حتى: ${request.dateTo}\n`;
    }
    if (request.type === "فحص دم") {
      summary += `🧪 ${request.testType}\n🍽️ صيام: ${request.fasting}\n📄 إحالة: ${request.referral}\n💊 أدوية: ${request.medications}\n`;
    }
    if (request.type === "تعيين موعد") {
      summary += `👤 ${request.name}\n🔄 ${request.visitType}\n🩺 ${request.reason}\n💊 ${request.symptoms}\n🏥 ${request.healthFund}\n⏰ ${request.preferredTime}\n`;
    }
    if (request.type === "طلب دواء") {
      summary += `💊 ${request.medType}\n💊 ${request.medName}\n📅 شهري: ${request.isMonthly}\n🩺 ${request.reason}\n⚠️ حساسية: ${request.allergies}\n`;
    }
    if (request.type === "طلب آخر") {
      summary += `💬 ${request.description}\n`;
    }

    try {
      await client.sendMessage(`${config.doctorNumber}@c.us`, summary);
    } catch (err) {
      console.error(`❌ [${config.name}] Failed to notify doctor:`, err.message);
    }

    // حفظ في السيرفر
    const data = JSON.stringify({ ...request, clientId: config.whatsapp });
    const req = http.request({ hostname:"localhost", port: process.env.PORT||3000, path:"/api/requests", method:"POST", headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)} }, ()=>{});
    req.on("error", ()=>{});
    req.write(data); req.end();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // كشف النية
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function detectIntent(message) {
    const m = message.toLowerCase();
    if (["אישור מחלה","ايشور محلاه","اشور محلاه","تقرير مرضي","ورقة مرضية","מחלה","بدي ورقة","اجازة مرضية"].some(k=>m.includes(k.toLowerCase()))) return "sick_leave";
    if (["فحص دم","تحليل دم","בדיקת דם","فحوصات دم"].some(k=>m.includes(k.toLowerCase()))) return "blood_test";
    if (["تعيين دور","موعد","קביעת תור","תור","بدي دور","احجز","بدي موعد"].some(k=>m.includes(k.toLowerCase()))) return "appointment";
    if (["روشتة","روشتيت","دواء","תרופה","מרשם","تجديد","وصفة"].some(k=>m.includes(k.toLowerCase()))) return "medication";
    return "other";
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // State Machine
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function handleState(userId, userMessage) {
    const state = userStates[userId];
    const phone = userId.replace("@c.us","").replace("@lid","");

    // الخطوة الأولى دائماً: الهوية
    if (state.step === "ask_id") {
      state.data.id = userMessage;
      if (state.type === "sick_leave")  { state.step = "ask_date_from"; return "📅 من أي تاريخ تريد التقرير المرضي؟\n(مثال: ٢٧ مارس ٢٠٢٦)"; }
      if (state.type === "blood_test")  { state.step = "ask_test_type"; return "🧪 ما نوع فحص الدم؟\n(مثال: صورة دم كاملة، سكر، كوليسترول...)"; }
      if (state.type === "appointment") { state.step = "ask_name"; return "👤 ما هو اسمك الكامل؟"; }
      if (state.type === "medication")  { state.step = "ask_med_type"; return "💊 ما الذي تحتاجه؟\n1️⃣ تجديد روشتة شهرية\n2️⃣ دواء جديد"; }
      if (state.type === "other")       { state.step = "ask_description"; return "💬 باختصار، ما هي مشكلتك أو طلبك؟"; }
    }

    // SICK LEAVE
    if (state.type === "sick_leave") {
      if (state.step === "ask_date_from") { state.data.dateFrom = userMessage; state.step = "ask_date_to"; return "📅 حتى أي تاريخ؟"; }
      if (state.step === "ask_date_to") {
        state.data.dateTo = userMessage;
        const req = { type:"אישור מחלה", time:new Date().toLocaleString("ar-IL"), phone, id:state.data.id, dateFrom:state.data.dateFrom, dateTo:state.data.dateTo };
        pendingRequests.push(req); await sendSummaryToDoctor(req); delete userStates[userId];
        return `✅ *تم تسجيل طلبك!*\n\n🪪 ${state.data.id}\n📅 من ${state.data.dateFrom} حتى ${state.data.dateTo}\n\nيرجى الحضور شخصياً لاستلام التقرير. 😊`;
      }
    }

    // BLOOD TEST
    if (state.type === "blood_test") {
      if (state.step === "ask_test_type") { state.data.testType = userMessage; state.step = "ask_fasting"; return "🍽️ هل ستكون صائماً؟ (نعم / لا)"; }
      if (state.step === "ask_fasting")   { state.data.fasting = userMessage; state.step = "ask_referral"; return "📄 هل عندك إحالة من طبيب؟ (نعم / لا)"; }
      if (state.step === "ask_referral")  { state.data.referral = userMessage; state.step = "ask_medications"; return "💊 هل تأخذ أي أدوية؟ (اذكرها أو اكتب لا)"; }
      if (state.step === "ask_medications") {
        state.data.medications = userMessage;
        const req = { type:"فحص دم", time:new Date().toLocaleString("ar-IL"), phone, id:state.data.id, testType:state.data.testType, fasting:state.data.fasting, referral:state.data.referral, medications:state.data.medications };
        pendingRequests.push(req); await sendSummaryToDoctor(req); delete userStates[userId];
        const schedule = config.bloodTestDays?.join(", ") || "الأحد-الخميس";
        return `✅ *تم تسجيل طلب فحص الدم!*\n\n🧪 ${state.data.testType}\n⏰ أوقات الفحص: ${schedule} ${config.bloodTestHours}\n\nللتأكيد اتصل: ${config.phone} 😊`;
      }
    }

    // APPOINTMENT
    if (state.type === "appointment") {
      if (state.step === "ask_name")        { state.data.name = userMessage; state.step = "ask_visit_type"; return "🔄 هل هذه زيارة أولى أم متابعة؟"; }
      if (state.step === "ask_visit_type")  { state.data.visitType = userMessage; state.step = "ask_reason"; return "🩺 ما هو سبب الزيارة؟"; }
      if (state.step === "ask_reason")      { state.data.reason = userMessage; state.step = "ask_symptoms"; return "💊 هل عندك أعراض معينة؟ (أو اكتب لا)"; }
      if (state.step === "ask_symptoms")    { state.data.symptoms = userMessage; state.step = "ask_health_fund"; return `🏥 ما هي قوبة حولים؟\n${config.healthFunds?.join(" / ") || "كللت / מכבי / מאוחדת / לאומית"}`; }
      if (state.step === "ask_health_fund") { state.data.healthFund = userMessage; state.step = "ask_time"; return "⏰ ما هو الوقت المفضل للموعد؟"; }
      if (state.step === "ask_time") {
        state.data.preferredTime = userMessage;
        const req = { type:"تعيين موعد", time:new Date().toLocaleString("ar-IL"), phone, id:state.data.id, name:state.data.name, visitType:state.data.visitType, reason:state.data.reason, symptoms:state.data.symptoms, healthFund:state.data.healthFund, preferredTime:state.data.preferredTime };
        pendingRequests.push(req); await sendSummaryToDoctor(req); delete userStates[userId];
        return `✅ *تم تسجيل طلب الموعد!*\n\n👤 ${state.data.name}\n🩺 ${state.data.reason}\n⏰ ${state.data.preferredTime}\n\nسنتواصل معك قريباً. 😊`;
      }
    }

    // MEDICATION
    if (state.type === "medication") {
      if (state.step === "ask_med_type") {
        const isRenewal = ["تجديد","نفس","شهري","1"].some(k => userMessage.includes(k));
        state.data.medType = isRenewal ? "تجديد روشتة شهرية" : "دواء جديد";
        state.step = "ask_med_name";
        return `💊 ما هو اسم الدواء${isRenewal ? " اللي تريد تجديده" : " المطلوب"}؟`;
      }
      if (state.step === "ask_med_name")     { state.data.medName = userMessage; state.step = "ask_is_monthly"; return "📅 هل هذا دواء شهري منتظم؟ (نعم / لا)"; }
      if (state.step === "ask_is_monthly") {
        state.data.isMonthly = userMessage;
        const notMonthly = ["لا","לא","مش"].some(k => userMessage.includes(k));
        if (notMonthly) { state.step = "ask_med_reason"; return "🩺 ما هو سبب الحاجة لهذا الدواء؟"; }
        state.data.reason = "دواء شهري منتظم";
        state.step = "ask_med_allergies";
        return "⚠️ هل عندك حساسية من أي أدوية؟ (اذكرها أو اكتب لا)";
      }
      if (state.step === "ask_med_reason")    { state.data.reason = userMessage; state.step = "ask_med_allergies"; return "⚠️ هل عندك حساسية من أي أدوية؟"; }
      if (state.step === "ask_med_allergies") { state.data.allergies = userMessage; state.step = "ask_other_meds"; return "💊 هل تأخذ أدوية أخرى؟ (اذكرها أو اكتب لا)"; }
      if (state.step === "ask_other_meds") {
        state.data.otherMeds = userMessage;
        const req = { type:"طلب دواء", time:new Date().toLocaleString("ar-IL"), phone, id:state.data.id, medType:state.data.medType, medName:state.data.medName, isMonthly:state.data.isMonthly, reason:state.data.reason, allergies:state.data.allergies, otherMeds:state.data.otherMeds };
        pendingRequests.push(req); await sendSummaryToDoctor(req); delete userStates[userId];
        return `✅ *تم تسجيل طلب الدواء!*\n\n💊 ${state.data.medName}\n🩺 ${state.data.reason}\n\nسيراجع الطبيب طلبك. 😊`;
      }
    }

    // OTHER
    if (state.type === "other" && state.step === "ask_description") {
      const req = { type:"طلب آخر", time:new Date().toLocaleString("ar-IL"), phone, id:state.data.id, description:userMessage };
      pendingRequests.push(req); await sendSummaryToDoctor(req); delete userStates[userId];
      return `✅ *تم استلام طلبك!*\n\n💬 ${userMessage}\n\nسيتواصل معك فريق العيادة قريباً. للاستفسار: ${config.phone} 😊`;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const scheduleText = config.schedule
    ? Object.entries(config.schedule).filter(([,v])=>v.morning).map(([d,v])=>`${d}: ${v.morning}${v.evening?" | "+v.evening:""}`).join("\n")
    : `${config.openTime} - ${config.closeTime}`;

  const SYSTEM_PROMPT = `
أنت مساعد ذكي لـ${config.name}.
الهاتف: ${config.phone}
العنوان: ${config.address || ""}
ساعات العمل:\n${scheduleText}
فحوصات الدم: ${config.bloodTestHours} (${config.bloodTestDays?.join(", ") || "الأحد-الخميس"})
${config.extra || ""}
قواعد: رد باللغة التي يكتب بها المريض (عربي أو عبري). مختصر وودي. لا تشخيصات طبية.
  `;

  async function getAIReply(userId, userMessage) {
    if (!conversations[userId]) conversations[userId] = [];
    conversations[userId].push({ role:"user", parts:[{text:userMessage}] });
    if (conversations[userId].length > 10) conversations[userId] = conversations[userId].slice(-10);
    const model = genAI.getGenerativeModel({ model:"gemini-2.5-flash", systemInstruction:SYSTEM_PROMPT });
    const result = await model.generateContent({ contents:conversations[userId] });
    const reply = result.response.text();
    conversations[userId].push({ role:"model", parts:[{text:reply}] });
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
    authStrategy: new LocalAuth({ clientId:`clinic-${config.whatsapp}` }),
    puppeteer: {
      ...(chromiumPath && { executablePath:chromiumPath }),
      args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"],
    },
  });

  client.on("qr", qr => { console.log(`📱 QR for ${config.name}:`); qrcode.generate(qr, { small:true }); });
  client.on("ready", () => console.log(`✅ ${config.name} bot is running!`));

  client.on("message", async (msg) => {
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;
    const userId = msg.from;
    const userMessage = msg.body.trim();
    console.log(`📩 [${config.name}] ${userId}: ${userMessage}`);

    try {
      // أوامر إدارة
      if (userMessage === "ملخص" || userMessage === "סיכום") {
        if (!pendingRequests.length) { await msg.reply("📋 لا يوجد طلبات جديدة."); return; }
        let s = `📋 *ملخص الطلبات* (${pendingRequests.length})\n━━━━━━━━━━━━\n\n`;
        pendingRequests.forEach((r,i) => s += `*${i+1}. ${r.type}*\n🕐 ${r.time}\n📱 ${r.phone}\n🪪 ${r.id}\n\n`);
        await msg.reply(s); return;
      }
      if (userMessage === "مسح") { pendingRequests.length = 0; await msg.reply("✅ تم مسح الطلبات."); return; }

      // flow نشط
      if (userStates[userId]) {
        const reply = await handleState(userId, userMessage);
        if (reply) await msg.reply(reply);
        return;
      }

      // تحية
      const greetings = ["مرحبا","هلا","اهلا","السلام","صباح","مساء","hi","hello","שלום","היי"];
      if (greetings.some(g => userMessage.toLowerCase().includes(g))) {
        await msg.reply(`أهلاً بك في ${config.name}! 😊\n\nكيف يمكنني مساعدتك؟\n\n🏥 تقرير مرضي\n📅 تعيين موعد\n🧪 فحص دم\n💊 طلب دواء\n❓ أي استفسار آخر`);
        return;
      }

      const intent = detectIntent(userMessage);

      const intentMap = {
        sick_leave:  { type:"sick_leave",  reply:`بالتأكيد! 😊\nلتجهيز طلب تقرير مرضي، أرجو إرسال *رقم هويتك* أولاً:` },
        blood_test:  { type:"blood_test",  reply:`حسناً! 😊\nلتسجيل فحص دم، أرجو إرسال *رقم هويتك* أولاً:\n\n⏰ أوقات الفحص: ${config.bloodTestDays?.slice(0,3).join(", ")} ${config.bloodTestHours}` },
        appointment: { type:"appointment", reply:`بكل سرور! 😊\nلتعيين موعد، أرجو إرسال *رقم هويتك* أولاً:` },
        medication:  { type:"medication",  reply:`بالتأكيد! 😊\nلطلب الدواء، أرجو إرسال *رقم هويتك* أولاً:` },
        other:       { type:"other",       reply:`أهلاً! 😊\nأرجو إرسال *رقم هويتك* أولاً حتى نتمكن من مساعدتك:` },
      };

      if (intentMap[intent]) {
        userStates[userId] = { type:intentMap[intent].type, step:"ask_id", data:{} };
        await msg.reply(intentMap[intent].reply);
        return;
      }

      const reply = await getAIReply(userId, userMessage);
      await msg.reply(reply);

    } catch (err) {
      console.error(`❌ [${config.name}]`, err.message);
      await msg.reply(`عذراً، حدث خطأ. يرجى الاتصال على ${config.phone}`);
    }
  });

  client.on("disconnected", reason => console.log(`⚠️ [${config.name}] disconnected:`, reason));
  client.initialize();
};
