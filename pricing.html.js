// // ══════════════════════════════════════════════════════════════════
// // ✅ Cloudflare Pages Function — تعترض طلب pricing.html عند الحافة
// // (Edge) قبل ما توصل الصفحة للمتصفح، وتُدرج فيها حالة "انتهى العرض
// // المجاني" مباشرة (Server-Side Rendering جزئي) إذا كانت هذه الحالة
// // معروفة ومؤكدة بشكل دائم.
// //
// // السبب: sold_out بعد أن يصبح true هو حدث "لمرة واحدة" ثم يبقى ثابتاً
// // لسنوات (لا رجوع من true لـ false). بما أنه لا يوجد "حالتين محتملتين"
// // فـ هذه اللحظة، فلا يوجد أي مبرر منطقي لانتظار طلب JavaScript من طرف
// // المتصفح لتأكيدها — يمكن حسم الأمر عند الحافة وتسليم HTML جاهز بالحالة
// // الصحيحة من أول بايت، فلا يحدث أي وميض على الإطلاق، ولا حتى وميض قصير
// // جداً.
// //
// // آلية العمل:
// // 1. نجيب الصفحة الأصلية (asset ثابت) من نفس مشروع Cloudflare Pages.
// // 2. نتحقق من /pricing_status على الـ API. الباك إند يرسل الآن
// //    Cache-Control: public, max-age=31536000, immutable بمجرد أن يصبح
// //    sold_out=true بشكل دائم، فهذا الطلب سيُخدَّم من كاش Cloudflare
// //    نفسه (Edge Cache) فـ الغالبية العظمى من الأحيان — زمن استجابة شبه
// //    معدوم (عادة أقل من 5-20 ميلي ثانية، ومعظمها زمن شبكة داخلي بين
// //    مراكز Cloudflare، لا يصل حتى لخادمك).
// // 3. إذا sold_out === true، نستعمل HTMLRewriter لتعديل الـ HTML الخام
// //    مباشرة: نحذف class="pending" عن بطاقة الخطة المجانية، ونظهر حالة
// //    "نفدت الأماكن" — كل هذا قبل ما يوصل أي بايت للمتصفح.
// // 4. إذا sold_out === false، أو تعذر التحقق لأي سبب (شبكة، مهلة...)،
// //    نسلّم الصفحة الأصلية كما هي بلا أي تعديل — الفرونت إند (JavaScript
// //    فـ pricing.html) يتكفل بالمنطق المعتاد (إخفاء البطاقة حتى وصول
// //    الرد الحقيقي، بلا localStorage ولا حالة قديمة)، تماماً كما هو مبني
// //    حالياً. هذا يضمن أن أي عطل هنا لا يكسر الصفحة أبداً — أسوأ سيناريو
// //    هو الرجوع لنفس السلوك الحالي (تأخير بسيط، بلا معلومة خاطئة).
// // ══════════════════════════════════════════════════════════════════

// const PRICING_STATUS_URL = "https://api.liketwin.com/pricing_status";

// export async function onRequest(context) {
//   const { next } = context;

//   // نجيب الصفحة الأصلية أولاً (الملف الثابت pricing.html كما هو)
//   const response = await next();

//   // نتدخل فقط فـ ردود HTML ناجحة — أي شيء آخر (خطأ، نوع محتوى مختلف)
//   // نسلّمه كما هو بلا لمسه
//   const contentType = response.headers.get("content-type") || "";
//   if (!response.ok || !contentType.includes("text/html")) {
//     return response;
//   }

//   let soldOut = false;
//   try {
//     // ✅ مهلة قصيرة جداً (600ms): إذا لم يرد الكاش/الخادم بسرعة كافية،
//     // نتراجع فوراً لتسليم الصفحة الأصلية بلا أي تأخير محسوس على المستخدم
//     // — أسوأ حالة هي نفس السلوك الحالي (JS من طرف العميل يتكفل بالباقي)
//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), 600);

//     const statusRes = await fetch(PRICING_STATUS_URL, {
//       signal: controller.signal,
//       // ✅ نستفيد من كاش Cloudflare نفسه عند الحافة (منفصل عن كاش
//       // المتصفح)، فبعد أول طلب ناجح تصبح القراءات التالية شبه فورية
//       cf: { cacheTtl: 31536000, cacheEverything: true },
//     });
//     clearTimeout(timeoutId);

//     if (statusRes.ok) {
//       const data = await statusRes.json();
//       soldOut = data && data.status === "ok" && data.sold_out === true;
//     }
//   } catch (e) {
//     // تعذر التحقق (شبكة، مهلة، خطأ فـ الـ API...) — لا نكسر الصفحة،
//     // فقط نسلّمها كما هي ونترك JS من طرف العميل يتكفل بالمنطق المعتاد
//     soldOut = false;
//   }

//   if (!soldOut) {
//     return response;
//   }

//   // ✅ العرض انتهى بشكل مؤكد ودائم — نُدرج الحالة النهائية مباشرة فـ
//   // الـ HTML قبل التسليم، فتصل الصفحة للمتصفح جاهزة من أول بايت
//   class RemovePendingClass {
//     element(el) {
//       const existing = el.getAttribute("class") || "";
//       const cleaned = existing
//         .split(/\s+/)
//         .filter((c) => c && c !== "pending")
//         .concat(["sold-out"])
//         .join(" ");
//       el.setAttribute("class", cleaned);
//     }
//   }

//   class ShowSoldOutState {
//     element(el) {
//       const existing = el.getAttribute("class") || "";
//       if (!existing.split(/\s+/).includes("visible")) {
//         el.setAttribute("class", `${existing} visible`.trim());
//       }
//     }
//   }

//   class MarkSoldOutInHead {
//     element(el) {
//       // ✅ علامة صغيرة فـ <head> يقرأها JS من طرف العميل: تخبره أن حالة
//       // "انتهى العرض" مُدرجة مسبقاً فـ HTML (Server-Side)، فيتجنب أي
//       // تكرار غير ضروري للعمل (مثل استدعاء activateSoldOutUI مرة أخرى)
//       el.append(
//         '<meta name="lt-free-sold-out" content="1">',
//         { html: true }
//       );
//     }
//   }

//   const rewritten = new HTMLRewriter()
//     .on("#freePlanCard", new RemovePendingClass())
//     .on("#soldOutState", new ShowSoldOutState())
//     .on("head", new MarkSoldOutInHead())
//     .transform(response);

//   return rewritten;
// }
