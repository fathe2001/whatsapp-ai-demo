// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLINIC CONFIG TEMPLATE
// نسخ هذا الملف لكل عيادة جديدة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
module.exports = {
  type: "clinic",

  // ✏️ معلومات أساسية
  name: "عيادة النور",
  address: "كفرمندا",
  phone: "04-3750228",
  whatsapp: "972524505228",      // بدون + وبدون مسافات
  doctorNumber: "972524505228",  // رقم الدكتور لاستلام الملخصات

  // ✏️ ساعات العمل
  openTime: "08:00",
  closeTime: "19:00",
  offDays: [],
  schedule: {
    "Sunday":    { morning: "08:00-11:00", evening: "16:00-19:00" },
    "Monday":    { morning: "08:00-11:00", evening: "16:00-19:00" },
    "Tuesday":   { morning: "08:00-11:00", evening: "16:00-19:00" },
    "Wednesday": { morning: "08:00-11:00", evening: "16:00-19:00" },
    "Thursday":  { morning: "08:00-11:00", evening: "16:00-19:00" },
    "Friday":    { morning: "14:00-17:00", evening: null },
    "Saturday":  { morning: "10:00-13:00", evening: null },
  },

  // ✏️ معلومات طبية
  bloodTestHours: "09:00-12:00",
  bloodTestDays: ["Sunday","Monday","Tuesday","Wednesday","Thursday"],
  healthFunds: ["כללית", "מכבי", "מאוחדת", "לאומית"],

  // ✏️ الخدمات المتاحة
  services: ["sick_leave", "appointment", "blood_test", "medication", "other"],

  // ✏️ لغة الرد
  language: "arabic+hebrew",

  // ✏️ معلومات إضافية تظهر في ردود البوت
  extra: "",
};
