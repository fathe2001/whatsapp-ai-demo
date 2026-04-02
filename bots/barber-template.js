// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BARBER CONFIG TEMPLATE
// نسخ هذا الملف لكل حلاق جديد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
module.exports = {
  type: "barber",

  // ✏️ معلومات أساسية
  name: "حلاقة أبو أحمد",
  address: "شارع الرئيسي، كفرمندا",
  phone: "0543222909",
  whatsapp: "972543222909",      // بدون + وبدون مسافات
  doctorNumber: null,            // مش مطلوب للحلاق

  // ✏️ ساعات العمل
  openTime: "10:00",
  closeTime: "21:00",
  offDays: ["Sunday"],           // أيام الإجازة بالإنجليزي
  slotDuration: 30,              // مدة الموعد بالدقائق

  // ✏️ الأسعار
  price: 70,
  currency: "₪",
  services: [
    { name: "حلاقة عادية", price: 70 },
    { name: "حلاقة + لحية", price: 100 },
    { name: "لحية فقط", price: 50 },
  ],

  // ✏️ لغة الرد
  language: "arabic+hebrew",    // arabic | hebrew | arabic+hebrew

  // ✏️ رسائل مخصصة (اختياري)
  welcomeMsg: null,              // null = رسالة افتراضية
  confirmationMsg: null,         // null = رسالة افتراضية
};
