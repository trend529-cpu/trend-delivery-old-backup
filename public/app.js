/* Previous baseline: RETURNS-OPERATIONS-ARCHIVE-SELECTION-FIX-20261017-36; current visual baseline: PREMIUM-NAVY-GOLD-UI-20261017-41 */
/* Trend build marker: IDLE-LOGOUT-1H-20261020 DRIVER-SETTLEMENT-CASH-CREDIT-PAID-VISIBILITY-20261019-2-DRIVER-SETTLEMENT-STATEMENT-DATE-FILTER-20261019-1-USE-STATEMENT-FILTER-DATE-20261019-1-SPEECH-WARNING-20261018-1-MERCHANT-STATEMENT-DEDUP-PRINT-FIX-20261018-1-SETTLEMENT-AVAILABLE-SOUND-20261018-1-DRIVER-SETTLEMENT-EGYPT-DATE-SOUND-MAINLIST-20261018-2-INVOICE-DAILY-PROOF-ACTIONS-20261019-1-UNIFIED-SETTLEMENT-PRINT-TEMPLATE-20261020-1-INVOICE-REPORT-GENERATION-DATE-20261020-1 */
/* Trend build marker: DRIVER-SETTLEMENT-CASH-CREDIT-PAID-VISIBILITY-20261019-2-DRIVER-SETTLEMENT-STATEMENT-DATE-FILTER-20261019-1-USE-STATEMENT-FILTER-DATE-20261019-1-SPEECH-WARNING-20261018-1-MERCHANT-STATEMENT-DEDUP-PRINT-FIX-20261018-1-SETTLEMENT-AVAILABLE-SOUND-20261018-1-DRIVER-SETTLEMENT-EGYPT-DATE-SOUND-MAINLIST-20261018-2-INVOICE-DAILY-PROOF-ACTIONS-20261019-1-UNIFIED-SETTLEMENT-PRINT-TEMPLATE-20261020-1-INVOICE-REPORT-GENERATION-DATE-20261020-1 */
window.__TREND_BUILD_ID = "SAVED-SETTLEMENT-CREDIT-VALUE-20261021-1-DRIVER-SETTLEMENT-CASH-CREDIT-PAID-VISIBILITY-20261019-2-DRIVER-SETTLEMENT-STATEMENT-DATE-FILTER-20261019-1-USE-STATEMENT-FILTER-DATE-20261019-1-SPEECH-WARNING-20261018-1-MERCHANT-STATEMENT-DEDUP-PRINT-FIX-20261018-1-SETTLEMENT-AVAILABLE-SOUND-20261018-1-DRIVER-SETTLEMENT-EGYPT-DATE-SOUND-MAINLIST-20261018-2-INVOICE-DAILY-PROOF-ACTIONS-20261019-1-BOOKING-SCAN-DRIVER-20261019-1";
console.info("[Trend Delivery] BUILD", "DRIVER-SETTLEMENT-CASH-CREDIT-PAID-VISIBILITY-20261019-2-DRIVER-SETTLEMENT-STATEMENT-DATE-FILTER-20261019-1-USE-STATEMENT-FILTER-DATE-20261019-1-SPEECH-WARNING-20261018-1-MERCHANT-STATEMENT-DEDUP-PRINT-FIX-20261018-1-SETTLEMENT-AVAILABLE-SOUND-20261018-1-DRIVER-SETTLEMENT-EGYPT-DATE-SOUND-MAINLIST-20261018-2-INVOICE-DAILY-PROOF-ACTIONS-20261019-1");
/* Delivery - COMBINED FRONTEND */
/* Delivery - full management frontend */
"use strict";

// Storage access can throw in some Safari/private-mode/privacy configurations.
// Keep the frontend bootstrap alive so the server cookie can restore auth.
function safeStorageGet(storage, key, fallback = null) {
  try { const value = storage.getItem(key); return value === null ? fallback : value; }
  catch (_) { return fallback; }
}
function safeStorageSet(storage, key, value) {
  try { storage.setItem(key, value); return true; } catch (_) { return false; }
}
function safeStorageRemove(storage, key) {
  try { storage.removeItem(key); return true; } catch (_) { return false; }
}

// Authentication uses one signed HttpOnly session cookie.

// Authentication credentials must live only for this browser tab/session.
// Remove legacy persistent copies from older builds so closing the browser requires login.
try { localStorage.removeItem("trend_session_v7"); localStorage.removeItem("trend_cached_user_v7"); } catch (_) {}

let LANG = safeStorageGet(localStorage, "trend_lang", "ar") || "ar";
let CURRENT_PAGE = "dashboard";
let CHAT_TIMER = null;
let CHAT_NOTIFY_TIMER = null;
let CHAT_LAST_UNREAD = null;
let CHAT_SOUND_READY = false;
let CURRENT_USER = null;

// Auto sign out after one hour without real user interaction.
// Background API polling does not count as activity.
const TREND_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const TREND_IDLE_KEY = "trend_last_activity_v1";
let trendIdleTimer = null;
let trendLastActivityWrite = 0;
let trendLastActivityAt = 0;
function trendIdleAge() {
  const stored = Number(safeStorageGet(sessionStorage, TREND_IDLE_KEY, "0")) || 0;
  const last = CURRENT_USER && trendLastActivityAt > 0 ? trendLastActivityAt : stored;
  return last > 0 ? Date.now() - last : 0;
}
function stopIdleTimer() {
  if (trendIdleTimer) clearTimeout(trendIdleTimer);
  trendIdleTimer = null;
}
function markTrendActivity() {
  if (!CURRENT_USER) return;
  const now = Date.now();
  trendLastActivityAt = now;
  // Persist at most every 10 seconds to avoid excessive storage writes on mousemove.
  if (now - trendLastActivityWrite >= 10000) {
    safeStorageSet(sessionStorage, TREND_IDLE_KEY, String(now));
    trendLastActivityWrite = now;
  }
  stopIdleTimer();
  trendIdleTimer = setTimeout(() => {
    if (!CURRENT_USER) return;
    if (trendIdleAge() >= TREND_IDLE_TIMEOUT_MS) {
      logout(true);
    } else {
      markTrendActivity();
    }
  }, TREND_IDLE_TIMEOUT_MS + 250);
}
function startIdleTimer() {
  if (!CURRENT_USER) return;
  const last = Number(safeStorageGet(sessionStorage, TREND_IDLE_KEY, "0")) || 0;
  if (!last) {
    safeStorageSet(sessionStorage, TREND_IDLE_KEY, String(Date.now()));
    trendLastActivityWrite = Date.now();
    trendLastActivityAt = trendLastActivityWrite;
  }
  stopIdleTimer();
  trendIdleTimer = setTimeout(() => {
    if (CURRENT_USER && trendIdleAge() >= TREND_IDLE_TIMEOUT_MS) logout(true);
    else markTrendActivity();
  }, Math.max(1000, TREND_IDLE_TIMEOUT_MS - trendIdleAge() + 250));
}
["pointerdown","keydown","touchstart","scroll","input","change","click","mousemove"].forEach(eventName => {
  document.addEventListener(eventName, () => {
    if (!CURRENT_USER) return;
    // Only count genuine foreground interaction; do not count timer/polling APIs.
    markTrendActivity();
  }, {passive:true});
});
let COMPANY_BRANDING = {name:"Delivery",logo_url:"/trend-logo.jpeg"};
let SYSTEM_TIME_ZONE = safeStorageGet(localStorage, 'trend_system_timezone', 'Africa/Cairo') || 'Africa/Cairo';
const SYSTEM_TIME_ZONE_OPTIONS = {'Africa/Cairo':'Egypt — Cairo','Asia/Dubai':'UAE — Dubai'};
function setSystemTimeZone(value){SYSTEM_TIME_ZONE=Object.prototype.hasOwnProperty.call(SYSTEM_TIME_ZONE_OPTIONS,value)?value:'Africa/Cairo';safeStorageSet(localStorage,'trend_system_timezone',SYSTEM_TIME_ZONE);}
const $ = id => document.getElementById(id);
function showInputModal(message,defaultValue=''){
  return new Promise(resolve=>{
    document.getElementById('trendInputDialog')?.remove();
    const msg=String(message??''),value=String(defaultValue??'');
    const lower=msg.toLowerCase();
    const type=/password|pin|كلمة المرور|كلمه المرور/.test(lower)?'password':(/date|تاريخ/.test(lower)?'date':(/amount|fee|cod|coupon|number|المبلغ|الرسوم|رسوم|كوبون|رقم/.test(lower)?'number':'text'));
    const multiline=/reason|details|note|سبب|تفاصيل|ملاحظة/.test(lower)||value.includes('\\n');
    const box=document.createElement('div');box.id='trendInputDialog';box.className='td-dialog-backdrop';box.setAttribute('role','presentation');
    box.innerHTML=`<form class="td-dialog-card" role="dialog" aria-modal="true"><h3></h3><label class="td-dialog-field"></label><div class="td-dialog-error" aria-live="polite"></div><div class="td-dialog-actions"><button type="button" class="ghost td-dialog-cancel">${LANG==='ar'?'إلغاء':'Cancel'}</button><button type="submit" class="primary">${LANG==='ar'?'تأكيد':'Continue'}</button></div></form>`;
    box.querySelector('h3').textContent=msg;
    const label=box.querySelector('.td-dialog-field');
    const field=multiline?document.createElement('textarea'):document.createElement('input');
    if(!multiline){field.type=type;field.autocomplete=type==='password'?'current-password':'off';}
    field.className='td-dialog-input';field.value=value;field.setAttribute('aria-label',msg);label.appendChild(field);document.body.appendChild(box);
    let settled=false;const finish=result=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKey);box.remove();resolve(result);};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(null);}};
    document.addEventListener('keydown',onKey);box.querySelector('.td-dialog-cancel').addEventListener('click',()=>finish(null));
    box.addEventListener('click',e=>{if(e.target===box)finish(null);});
    box.querySelector('form').addEventListener('submit',e=>{e.preventDefault();finish(field.value);});
    field.focus();if(!multiline&&field.select)field.select();
  });
}
function showConfirmModal(message){
  return new Promise(resolve=>{
    document.getElementById('trendConfirmDialog')?.remove();
    const box=document.createElement('div');box.id='trendConfirmDialog';box.className='td-dialog-backdrop';box.innerHTML=`<div class="td-dialog-card" role="dialog" aria-modal="true"><h3>${LANG==='ar'?'تأكيد الإجراء':'Confirm action'}</h3><p class="td-dialog-message"></p><div class="td-dialog-actions"><button type="button" class="ghost td-dialog-cancel">${LANG==='ar'?'إلغاء':'Cancel'}</button><button type="button" class="primary td-dialog-accept">${LANG==='ar'?'تأكيد':'Confirm'}</button></div></div>`;
    box.querySelector('.td-dialog-message').textContent=String(message??'');document.body.appendChild(box);
    let settled=false;const finish=result=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKey);box.remove();resolve(result);};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(false);}};document.addEventListener('keydown',onKey);
    box.querySelector('.td-dialog-cancel').addEventListener('click',()=>finish(false));box.querySelector('.td-dialog-accept').addEventListener('click',()=>finish(true));box.addEventListener('click',e=>{if(e.target===box)finish(false);});box.querySelector('.td-dialog-accept').focus();
  });
}
function showAppNotice(message){
  let host=document.getElementById('trendNoticeHost');if(!host){host=document.createElement('div');host.id='trendNoticeHost';host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','true');document.body.appendChild(host);}
  const item=document.createElement('div');item.className='td-notice-toast';item.textContent=String(message??'');host.appendChild(item);while(host.children.length>4)host.firstElementChild?.remove();
  requestAnimationFrame(()=>item.classList.add('visible'));setTimeout(()=>{item.classList.remove('visible');setTimeout(()=>item.remove(),250);},4500);
}
// Route browser alerts to a compact in-app notice so native blocking dialogs are not used.
try{window.alert=showAppNotice;}catch(_){}
// Lightweight warning tones and on-demand speech for the company/merchant names.
// Audio is created only after a user gesture so it works with browser autoplay policies.
let TREND_WARNING_AUDIO_CONTEXT = null;
// Prime Web Audio on the first real touch/click (important for iPhone Safari).
document.addEventListener('pointerdown',()=>{
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    const ctx=TREND_WARNING_AUDIO_CONTEXT||(TREND_WARNING_AUDIO_CONTEXT=new AudioContextClass());
    if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  }catch(_){}
},{once:true,passive:true});
function playTrendWarningTone(kind='warning'){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    const ctx=TREND_WARNING_AUDIO_CONTEXT||(TREND_WARNING_AUDIO_CONTEXT=new AudioContextClass());
    const play=()=>{
      const now=ctx.currentTime;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(kind==='delete'?880:740,now);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(.09,now+.003);
      gain.gain.exponentialRampToValueAtTime(.0001,now+.018);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+.02);
    };
    if(ctx.state==='suspended')void ctx.resume().then(play).catch(()=>{});else play();
  }catch(_){/* Audio is an enhancement; never interrupt the action. */}
}
function speakTrendName(value){
  const name=String(value??'').trim();if(!name||!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined')return;
  try{window.speechSynthesis.cancel();window.speechSynthesis.resume();const utterance=new SpeechSynthesisUtterance(name);utterance.lang=/[\u0600-\u06FF]/.test(name)?'ar-EG':'en-US';utterance.rate=.9;utterance.pitch=1;utterance.volume=1;window.speechSynthesis.speak(utterance);}catch(_){/* Speech support varies by device. */}
}
function applyCompanyBrandingToPage(data=COMPANY_BRANDING){
  const name=String(data?.name||'Delivery').trim()||'Delivery';
  const logo=String(data?.logo_url||'/trend-logo.jpeg').trim()||'/trend-logo.jpeg';
  document.title=name;
  document.querySelectorAll('.brand-logo-wrap img,.login-logo').forEach(img=>{
    img.onerror=()=>{img.onerror=null;img.src='/trend-logo.jpeg';};
    img.src=logo;
    img.alt=name;
  });
  const title=document.querySelector('.brand-user strong');if(title){title.textContent=name;title.setAttribute('role','button');title.setAttribute('tabindex','0');title.setAttribute('aria-label',LANG==='ar'?'اضغط لسماع اسم الشركة':'Tap to hear company name');title.classList.add('trend-speak-company');title.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();speakTrendName(COMPANY_BRANDING?.name||title.textContent);}};}
  const loginTitle=document.querySelector('#login h1');if(loginTitle)loginTitle.textContent=name;
  let icon=document.querySelector('link[rel="icon"]');
  if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon);}
  icon.href=logo;
  return {name,logo_url:logo};
}
async function loadPublicCompanyBranding(){
  try{
    const response=await fetch("/api/public/branding",{method:"GET",credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
    if(!response.ok)return COMPANY_BRANDING;
    const result=await response.json().catch(()=>null);
    if(result?.success && result?.data){
      COMPANY_BRANDING={...COMPANY_BRANDING,...result.data};
      applyCompanyBrandingToPage(COMPANY_BRANDING);
    }
  }catch(error){console.warn("[Trend Delivery] Public company branding unavailable:",error?.message||error);}
  return COMPANY_BRANDING;
}
async function loadCompanyBranding(){
  if(!CURRENT_USER) return COMPANY_BRANDING;
  try{
    const d=await api('/api/settings/branding');
    if(d?.success===false)throw new Error(d.error||'تعذر تحميل إعدادات هوية الشركة');
    COMPANY_BRANDING={...COMPANY_BRANDING,...(d.data||{})};
    if(d.data?.system_timezone)setSystemTimeZone(d.data.system_timezone);
    applyCompanyBrandingToPage(COMPANY_BRANDING);
  }catch(error){console.warn('[Trend Delivery] Could not load company branding:',error?.message||error);}
  return COMPANY_BRANDING;
}
function allSystemStatuses(extra=[]){
  const base=[...SYSTEM_STATUSES];
  const dynamic=(extra||[]).filter(Boolean).map(x=>String(x));
  return [...new Set([...base,...dynamic])];
}

const I18N = {
  ar: {
    "Delivery":"Delivery","System Login":"تسجيل الدخول للنظام","Login":"دخول","Logout":"خروج",
    "Dashboard":"لوحة التحكم","Orders Today":"الأوردرات اليوم","Shipments Today":"الشحنات اليوم","Execution Tasks":"مهام التنفيذ","Drivers Today":"السائقين اليوم","Cancelled Today":"الملغي اليوم","Assigned with Driver":"مسند لمندوب","New Order":"إدخال أوردر","Search":"بحث","Shipments":"الشحنات","Dashboard shipments":"Dashboard shipments","Delivery Jobs":"مهام التوصيل",
    "Update Delivery Job Code":"تحديث كود مهمة التوصيل","Shipper Returns":"المرتجعات للتاجر","Shippers":"التجار","Drivers":"السائقون",
    "Governorates & Areas":"الإمارات والمناطق","Accounting":"الحسابات","Orders Verification":"Driver Account","Driver Account":"حسابات المندوب","Verify":"اعتماد","Verify All":"اعتماد الكل","Verified":"تم الاعتماد","Unverified":"غير معتمد","Remove from Statement":"إخراج من كشف المندوب","Remove Order from Statement?":"إخراج الأوردر من كشف المندوب؟","This order will be moved to In Ops and removed from the courier statement.":"سيتم تحويل الأوردر إلى In Ops وإخراجه من كشف المندوب.","Confirm":"تأكيد","Cancel":"إلغاء","All Statuses":"كل الحالات","All Verification":"كل حالات الاعتماد","All Drivers":"كل المندوبين","Orders verified successfully.":"تم اعتماد الأوردرات بنجاح.","Driver Commission":"عمولة المناديب","Driver Expenses":"مصروفات السائق","Audit Log":"سجل العمليات", "Settings":"الإعدادات", "Currency":"العملة", "Currency changed successfully":"تم تغيير العملة بنجاح", "Exchange rates are based on AED":"أسعار التحويل محسوبة على أساس الدرهم الإماراتي", "Display currency":"عملة العرض",
    "Employees & Permissions":"الموظفون والصلاحيات","Employee Wages":"أجور الموظفين","Employee Chat":"شات الموظفين","Orders":"الأوردرات","Edit Order":"تعديل الأوردر",
    "Add Shipper":"إضافة تاجر","Add Employee":"إضافة موظف","Add Governorate":"إضافة إمارة","Add Area":"إضافة منطقة",
    "Export Excel":"تصدير Excel","Export PDF":"تصدير PDF","Import Excel":"رفع Excel","Save":"حفظ","Update":"تحديث",
    "No data":"لا توجد بيانات","Loading...":"جاري التحميل...","From":"من","To":"إلى","Open":"فتح","Edit":"تعديل",
    "Status":"الحالة","Shipper":"التاجر","Shippers":"التجار","Add Shipper":"إضافة تاجر","Shipper No.":"رقم التاجر","Shipper Net":"صافي التجار","Shipper Due":"مستحق التاجر","Shipper Financial Statements":"الكشوف المالية للتجار","Shipper Order No.":"رقم أوردر التاجر","Shipper Order Financial Details":"تفاصيل معاملات التاجر","Print Shipper Statement":"طباعة كشف التاجر","Customer":"العميل","Delivery Fee":"رسوم التوصيل","Order Value":"قيمة الأوردر",
    "Order Code":"كود النظام","Tracking Number":"رقم التتبع","Shipment No.":"رقم الشحنة","Shipper Order No.":"رقم أوردر التاجر","Created":"تاريخ الإنشاء","Phone":"الهاتف","Address":"العنوان",
    "Tax":"الضريبة","Tax Rate":"نسبة الضريبة","Default Delivery Fee":"رسوم التوصيل الافتراضية","Store":"المتجر",
    "Store Type":"نوع المتجر","Store Name":"اسم المتجر","Store URL":"رابط المتجر","Active":"نشط","Inactive":"غير نشط",
    "Username":"اسم المستخدم","Name":"الاسم","Email":"البريد الإلكتروني","Password":"كلمة المرور","Role":"الدور",
    "Message":"الرسالة","Send":"إرسال","Employee Chat":"شات الموظفين","All Employees":"كل الموظفين",
    "Shipment History":"سجل حالة الشحنة","Quick Search":"بحث سريع","Print / PDF":"طباعة / PDF","Select Shipper":"اختر التاجر",
    "Excel: اسم الإمارة في العمود D، المنطقة / Area، اسم المنطقة EN / Area EN — يقبل العربي أو الإنجليزي":"ملف Excel يحتوي أعمدة: الإمارة، المنطقة، اسم المنطقة EN (اختياري)",
    "Imported":"تم الرفع","Success":"تم بنجاح","Error":"خطأ","WooCommerce":"WooCommerce","Consumer Key":"مفتاح WooCommerce","Consumer Secret":"سر WooCommerce","Test Connection":"اختبار الاتصال","Import Orders":"سحب الأوردرات","Auto Import":"سحب تلقائي","Connection successful":"تم الاتصال بنجاح","Orders imported":"تم سحب الأوردرات"
  },
  en: {
    "Delivery":"Delivery","System Login":"System Login","Login":"Login","Logout":"Logout",
    "Dashboard":"Dashboard","Orders Today":"Orders Today","Shipments Today":"Shipments Today","Execution Tasks":"Execution Tasks","Drivers Today":"Drivers Today","Cancelled Today":"Cancelled Today","Assigned with Driver":"Assigned with Driver","New Order":"New Order","Search":"Search","Shipments":"Shipments","Dashboard shipments":"Dashboard shipments","Delivery Jobs":"Delivery Jobs",
    "Update Delivery Job Code":"Update Delivery Job Code","Shipper Returns":"Shipper Returns","Shippers":"Shippers","Drivers":"Drivers",
    "Governorates & Areas":"Governorates & Areas","Accounting":"Accounting","Orders Verification":"Driver Account","Driver Account":"Driver Account","Verify":"Verify","Verify All":"Verify All","Verified":"Verified","Unverified":"Unverified","Remove from Statement":"Remove from Statement","Remove Order from Statement?":"Remove Order from Statement?","This order will be moved to In Ops and removed from the courier statement.":"This order will be moved to In Ops and removed from the courier statement.","Confirm":"Confirm","Cancel":"Cancel","All Statuses":"All Statuses","All Verification":"All Verification","All Drivers":"All Drivers","Orders verified successfully.":"Orders verified successfully.","Driver Commission":"Driver Commission","Driver Expenses":"Driver Expenses","Audit Log":"Audit Log", "Settings":"Settings", "Currency":"Currency", "Currency changed successfully":"Currency changed successfully", "Exchange rates are based on AED":"Exchange rates are based on AED", "Display currency":"Display currency",
    "Employees & Permissions":"Employees & Permissions","Employee Wages":"Employee Wages","Employee Chat":"Employee Chat","Orders":"Orders","Edit Order":"Edit Order",
    "Add Shipper":"Add Shipper","Add Employee":"Add Employee","Add Governorate":"Add Governorate","Add Area":"Add Area",
    "Export Excel":"Export Excel","Export PDF":"Export PDF","Import Excel":"Import Excel","Save":"Save","Update":"Update",
    "No data":"No data","Loading...":"Loading...","From":"From","To":"To","Open":"Open","Edit":"Edit",
    "Status":"Status","Shipper":"Shipper","Shippers":"Shippers","Add Shipper":"Add Shipper","Shipper No.":"Shipper No.","Shipper Net":"Shipper Net","Shipper Due":"Shipper Due","Shipper Financial Statements":"Shipper Financial Statements","Shipper Order No.":"Shipper Order No.","Shipper Order Financial Details":"Shipper Order Financial Details","Print Shipper Statement":"Print Shipper Statement","Customer":"Customer","Delivery Fee":"Delivery Fee","Order Value":"Order Value",
    "Order Code":"System Order Code","Tracking Number":"Tracking Number","Shipment No.":"Shipment No.","Shipper Order No.":"Shipper Order No.","Created":"Created","Phone":"Phone","Address":"Address",
    "Tax":"Tax","Tax Rate":"Tax Rate","Default Delivery Fee":"Default Delivery Fee","Store":"Store",
    "Store Type":"Store Type","Store Name":"Store Name","Store URL":"Store URL","Active":"Active","Inactive":"Inactive",
    "Username":"Username","Name":"Name","Email":"Email","Password":"Password","Role":"Role",
    "Message":"Message","Send":"Send","Employee Chat":"Employee Chat","All Employees":"All Employees",
    "Shipment History":"Shipment History","Quick Search":"Quick Search","Print / PDF":"Print / PDF","Select Shipper":"Select Shipper",
    "Excel: اسم الإمارة في العمود D، المنطقة / Area، اسم المنطقة EN / Area EN — يقبل العربي أو الإنجليزي":"Excel columns: Governorate, Area, Area EN (optional)",
    "Imported":"Imported","Success":"Success","Error":"Error","WooCommerce":"WooCommerce","Consumer Key":"Consumer Key","Consumer Secret":"Consumer Secret","Test Connection":"Test Connection","Import Orders":"Import Orders","Auto Import":"Auto Import","Connection successful":"Connection successful","Orders imported":"Orders imported"
  }
};

const SIDEBAR = [
  ["dashboard","Dashboard","لوحة التحكم"],
  ["shipmentGroup","Shipment","الشحنات"],
  ["merchants","Shippers","التجار"],
  ["drivers","Drivers","السائقون"],
  ["accountingGroup","Accounting","الحسابات"],
  ["settingsGroup","Settings","الإعدادات"]
];

const NAV_ICONS = {
  dashboard:"home", shipment:"box", order:"plus", search:"search", jobs:"truck", orderImport:"excel",
  jobcode:"refresh", shipments:"chart", returns:"return", wantedCustomers:"alert", merchants:"users", drivers:"truck",
  accounting:"calculator", areas:"map", audit:"history", employees:"users", chat:"chat", settings:"gear"
};

function navIcon(name){
  const p={
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9 21v-6h6v6"/>',
    box:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12.1V21"/>',
    plus:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    edit:'<path d="M4 20h4L19 9a2 2 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    truck:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    excel:'<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 12h8M8 16h8"/><path d="m8 20 3-4-3-4"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14.5-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4L21 14"/><path d="M21 19v-5h-5"/>',
    chart:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    return:'<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>',
    users:'<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c.7-3 2.8-5 6-5s5.3 2 6 5M15 15c2.7.2 4.5 1.8 5 4"/>',
    calculator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h8"/>',
    map:'<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v14M15 6v14"/>',
    history:'<path d="M4 12a8 8 0 1 0 2-5.3"/><path d="M4 4v6h6"/><path d="M12 8v5l3 2"/>',
    chat:'<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    alert:'<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    archive:'<path d="M4 7h16v13H4z"/><path d="M3 7l2-4h14l2 4M9 12h6"/>',
    wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/><path d="M7 5V3h10v2"/>',
    'alert-triangle':'<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="m19 13 2-1-2-1-.4-2 1.4-1.5-2-2-1.5 1.4-2-.4-1-2-1 2-2 .4L7 5.5l-2 2L6.4 9l-.4 2-2 1 2 1 .4 2-1.4 1.5 2 2 1.5-1.4 2 .4 1 2 1-2 2-.4 1.5 1.4 2-2-1.4-1.5z"/>'
  };
  return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p[name]||p.box}</svg></span>`;
}

function navButton(page,en,ar,opts={}){
  const visible=canAccessPage(page);
  const disabled=opts.disabled||!visible;
  return `<a class="nav-item nav-page-${page} ${disabled?'nav-disabled':''}" href="?page=${encodeURIComponent(page)}" data-page="${page}" ${disabled?'aria-disabled="true" tabindex="-1"':''}>${navIcon(opts.icon||NAV_ICONS[page]||'box')}<span class="nav-label">${LANG==="ar"?ar:en}</span>${opts.arrow?'<span class="nav-caret">▾</span>':''}</a>`;
}

function openNavPageNewTab(page){
  const url=new URL(window.location.href); url.searchParams.set('page',page);
  window.open(url.toString(),'_blank','noopener');
}
const MENU_PAGE_DEFS = {
  dashboard:["Dashboard","لوحة التحكم","home"],
  operationsDashboard:["Operations Dashboard","لوحة عمليات الشحن","chart"],
  order:["New Order","إدخال أوردر","plus"], editOrder:["Edit Order","تعديل الأوردر","edit"], booking:["Booking","حجز كوبونات","archive"],
  search:["Search","بحث","search"], jobs:["Delivery Job","Delivery Job","truck"], scanDriver:["Scan Driver","Scan Driver","archive"], orderImport:["Order Excel Import","استيراد أوردر Excel","excel"], jobcode:["Update Delivery Job Code","تحديث كود مهمة التوصيل","refresh"],
  returns:["Return","مرتجعات التاجر","return"], returnArchive:["Returns Archive","أرشيف المرتجعات","archive"], wantedCustomers:["Wanted Customers","قائمة المطلوبين","alert-triangle"], driverReturns:["Driver Returns","الراجع مع السائق","truck"], merchants:["Shippers","التجار","users"], chat:["Employee Chat","شات الموظفين","chat"],
  accounting:["Accounting","الحسابات","calculator"], employeeWages:["Employee Wages","أجور الموظفين","calculator"], ordersVerification:["Driver Account","حسابات المندوب","chart"], driverExpenses:["Expenses","المصاريف","wallet"], adjustment:["Adjustment","التسويات المالية","wallet"], merchantFinancial:["Shipper Financial Statements","الكشوف المالية للتجار","chart"], companyFinancial:["Profit & Loss","الأرباح والخسائر","calculator"], companyExpenses:["Company Expenses","مصاريف الشركة","wallet"], dailyCompanyReport:["Daily Company Report","التقرير اليومي للشركة","chart"], receivable:["Receivable","المستحقات","wallet"], driverCommission:["Driver Commission","عمولة المناديب","calculator"], settlementArchive:["Invoice Report","Invoice Report","archive"],
  settings:["Settings","الإعدادات","gear"], backupRestore:["Backup & Restore","نسخ احتياطي واستعادة","archive"], liveMap:["Drivers Map","خريطة المندوبين","map"], areas:["Governorates & Areas","الإمارات والمناطق","map"], audit:["Audit Log","سجل العمليات","history"], employees:["Employees & Permissions","الموظفون والصلاحيات","users"], adminTools:["Admin Tools","أدوات المدير","gear"], deliveryIntelligence:["Delivery Intelligence","ذكاء التوصيل","chart"]
};
const DEFAULT_MENU_CONFIG = {
  version:1,
  items:[
    {type:"page",id:"dashboard"},
    {type:"folder",id:"shipment",labelEn:"Shipment",labelAr:"الشحنات",icon:"box",open:true,children:["operationsDashboard","order","editOrder","booking","search","jobs","scanDriver","orderImport","wantedCustomers"]},
    {type:"folder",id:"jobCodeGroup",labelEn:"Job Code",labelAr:"Job Code",icon:"truck",open:true,children:["driverReturns","jobcode"]},
    {type:"folder",id:"cancellation",labelEn:"Cancellation",labelAr:"الإلغاءات والمرتجعات",icon:"return",open:true,children:["returns","returnArchive"]},{type:"page",id:"merchants"},{type:"page",id:"chat"},
    {type:"folder",id:"accounting",labelEn:"Accounting",labelAr:"الحسابات",icon:"calculator",open:true,children:["accounting","dailyCompanyReport","employeeWages","adjustment","merchantFinancial","companyFinancial","settlementArchive"]},
    {type:"folder",id:"cashier",labelEn:"Cashier",labelAr:"الكاشير",icon:"wallet",open:true,children:["ordersVerification","driverExpenses","companyExpenses","receivable"]},
    {type:"folder",id:"settings",labelEn:"Settings",labelAr:"الإعدادات",icon:"gear",open:true,children:["settings","backupRestore","liveMap","areas","audit","employees"]},{type:"page",id:"adminTools"},{type:"page",id:"deliveryIntelligence"}
  ]
};
let MENU_CONFIG = null;
function cloneMenuConfig(v){return JSON.parse(JSON.stringify(v));}
function normalizeMenuConfig(raw){
  const base=cloneMenuConfig(DEFAULT_MENU_CONFIG);
  if(!raw || typeof raw!="object" || !Array.isArray(raw.items)) return base;
  const valid=new Set(Object.keys(MENU_PAGE_DEFS));
  const seen=new Set();
  const out=[];
  const addPage=id=>{id=String(id||"");if(!valid.has(id)||seen.has(id))return;seen.add(id);out.push({type:"page",id});};
  const addFolder=f=>{
    const id=String(f?.id||"").trim(); if(!id||seen.has(`folder:${id}`))return;
    const children=[]; for(const child of (Array.isArray(f.children)?f.children:[])){const pid=String(child||"");if(valid.has(pid)&&!seen.has(pid)){seen.add(pid);children.push(pid);}}
    seen.add(`folder:${id}`); out.push({type:"folder",id,labelEn:String(f.labelEn||f.id),labelAr:String(f.labelAr||f.labelEn||f.id),icon:String(f.icon||"box"),open:false,children});
  };
  for(const item of raw.items){if(item?.type==="folder")addFolder(item);else addPage(item?.id);}
  // New system pages are appended instead of disappearing from an older saved config.
  for(const item of base.items){
    if(item.type==="page") addPage(item.id);
    else if(item.type==="folder"){
      let folder=out.find(x=>x.type==="folder"&&x.id===item.id);
      if(!folder){addFolder(item);folder=out.find(x=>x.type==="folder"&&x.id===item.id);}
      if(folder) for(const pid of item.children||[]) if(valid.has(pid)&&!seen.has(pid)){seen.add(pid);folder.children.push(pid);}
    }
  }
  // Admin Tools must be standalone. Keep one cashier expense list: Company Expenses
  // already combines company and driver expense records, so hide only the duplicate navigation item.
  // Underlying expense records, endpoints, accounting, and counters remain intact.
  for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!=="adminTools"&&!(item.id==="cashier"&&child==="driverExpenses"));}
  const nestedAdminTools=out.findIndex(item=>item.type==="page"&&item.id==="adminTools");
  if(nestedAdminTools>=0)out.splice(nestedAdminTools,1);
  out.push({type:"page",id:"adminTools"});seen.add("adminTools");
  for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!=="deliveryIntelligence");}
  const nestedDeliveryIntelligence=out.findIndex(item=>item.type==="page"&&item.id==="deliveryIntelligence");
  if(nestedDeliveryIntelligence>=0)out.splice(nestedDeliveryIntelligence,1);
  out.push({type:"page",id:"deliveryIntelligence"});seen.add("deliveryIntelligence");
  // Keep Wanted Customers inside the Shipment menu, including older saved menu configurations.
  let shipmentFolder=out.find(x=>x.type==="folder"&&x.id==="shipment");
  if(!shipmentFolder){shipmentFolder={type:"folder",id:"shipment",labelEn:"Shipment",labelAr:"الشحنات",icon:"box",open:true,children:[]};out.unshift(shipmentFolder);}
  for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!=="wantedCustomers");}
  const standaloneWanted=out.findIndex(item=>item.type==="page"&&item.id==="wantedCustomers");if(standaloneWanted>=0)out.splice(standaloneWanted,1);
  shipmentFolder.children.push("wantedCustomers");
  // Keep Driver Returns and Update Delivery Job Code together under one Job Code menu.
  const legacyJobFolders=out.filter(x=>x.type==="folder"&&(x.id==="jobcom"||x.id==="jobCodeGroup"));
  let jobCodeFolder=legacyJobFolders.find(x=>x.id==="jobCodeGroup")||legacyJobFolders[0]||{type:"folder",id:"jobCodeGroup",labelEn:"Job Code",labelAr:"Job Code",icon:"truck",open:true,children:[]};
  for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!=="driverReturns"&&child!=="jobcode");}
  for(const id of ["driverReturns","jobcode"]){const standalone=out.findIndex(item=>item.type==="page"&&item.id===id);if(standalone>=0)out.splice(standalone,1);}
  for(const oldFolder of legacyJobFolders){const oldIndex=out.indexOf(oldFolder);if(oldIndex>=0)out.splice(oldIndex,1);}
  jobCodeFolder.id="jobCodeGroup";jobCodeFolder.labelEn="Job Code";jobCodeFolder.labelAr="Job Code";jobCodeFolder.icon="truck";jobCodeFolder.open=true;jobCodeFolder.children=["driverReturns","jobcode"];
  const shipmentIndex=out.indexOf(shipmentFolder);out.splice(shipmentIndex+1,0,jobCodeFolder);
  // Keep Delivery Job visible under Shipment even when an old saved menu config
  // lists it as a standalone page or omits it from the folder.
  for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!=="jobs");}
  const standaloneJobs=out.findIndex(item=>item.type==="page"&&item.id==="jobs");
  if(standaloneJobs>=0)out.splice(standaloneJobs,1);
  if(!shipmentFolder.children.includes("jobs"))shipmentFolder.children.push("jobs");
  // Keep merchant returns and their archive together under Cancellation, even when an older saved menu config lists them separately. Return by Driver stays separate.
  let cancellation=out.find(x=>x.type==="folder"&&x.id==="cancellation");
  const standaloneReturns=out.filter(x=>x.type==="page"&&(x.id==="returns"||x.id==="returnArchive"));
  if(!cancellation){cancellation={type:"folder",id:"cancellation",labelEn:"Cancellation",labelAr:"الإلغاءات والمرتجعات",icon:"return",open:true,children:[]};out.push(cancellation);}
  for(const id of ["returns","returnArchive"]){
    if(!cancellation.children.includes(id))cancellation.children.push(id);
    const idx=out.findIndex(x=>x.type==="page"&&x.id===id);if(idx>=0)out.splice(idx,1);
  }
  // Keep Driver Account, Expenses, and Receivable grouped under the dedicated Cashier menu, including older saved menu configurations.
  let cashierFolder=out.find(x=>x.type==="folder"&&x.id==="cashier");
  if(!cashierFolder){cashierFolder={type:"folder",id:"cashier",labelEn:"Cashier",labelAr:"الكاشير",icon:"wallet",open:true,children:[]};out.push(cashierFolder);}
  for(const id of ["ordersVerification","driverExpenses","companyExpenses","receivable"]){
    for(const item of out){if(item.type==="folder")item.children=(item.children||[]).filter(child=>child!==id);}
    const standalone=out.findIndex(item=>item.type==="page"&&item.id===id);if(standalone>=0)out.splice(standalone,1);
    if(!cashierFolder.children.includes(id))cashierFolder.children.push(id);
  }
  cashierFolder.labelEn="Cashier";cashierFolder.labelAr="الكاشير";cashierFolder.icon="wallet";
  const cashierIndex=out.indexOf(cashierFolder);if(cashierIndex>=0)out.splice(cashierIndex,1);const accountingIndex=out.findIndex(item=>item.type==="folder"&&item.id==="accounting");out.splice(accountingIndex>=0?accountingIndex+1:out.length,0,cashierFolder);
  // Keep Driver Commission accessible only as a popup launched from Employee Wages.
  for(const item of out){ if(item.type==="folder") item.children=(item.children||[]).filter(id=>id!=="driverCommission"); }
  const accountingFolder=out.find(x=>x.type==="folder"&&x.id==="accounting");
  if(accountingFolder&&!accountingFolder.children.includes("employeeWages"))accountingFolder.children.unshift("employeeWages");
  const wagesPage=out.findIndex(x=>x.type==="page"&&x.id==="driverCommission"); if(wagesPage>=0)out.splice(wagesPage,1);
  // Ensure these children are not marked as globally seen elsewhere.
  return {version:1,items:out,pageOverrides:raw.pageOverrides&&typeof raw.pageOverrides==="object"?raw.pageOverrides:{}};
}
function menuPageLabel(id){const d=MENU_PAGE_DEFS[id]||[id,id,"box"];return [normalizeShipperUi(d[0]),normalizeShipperUi(d[1])];}
function menuPageIcon(id){return MENU_PAGE_DEFS[id]?.[2]||"box";}
function menuVisiblePage(id){return canAccessPage(id);}
function folderHasVisibleChildren(folder){return (folder.children||[]).some(menuVisiblePage);}
function menuItemLabel(id,custom){const d=menuPageLabel(id);return LANG==="ar"?(custom?.labelAr||d[1]):(custom?.labelEn||d[0]);}
function renderMenuPage(id, custom){if(!menuVisiblePage(id))return ""; const d=MENU_PAGE_DEFS[id];return navButton(id,custom?.labelEn||d[0],custom?.labelAr||d[1],{icon:custom?.icon||d[2]});}
function renderSidebar(){
  const sidebar=$("sidebar"); if(!sidebar)return;
  document.querySelectorAll("body > .nav-dropdown.nav-dropdown-portal").forEach(m=>m.remove());
  MENU_CONFIG=normalizeMenuConfig(MENU_CONFIG||DEFAULT_MENU_CONFIG);
  const customPages=MENU_CONFIG.pageOverrides||{};
  let html="";
  for(const item of MENU_CONFIG.items){
    if(item.type==="page") html+=renderMenuPage(item.id,customPages[item.id]);
    else if(item.type==="folder" && folderHasVisibleChildren(item)){
      const folderLabel=LANG==="ar"?(item.labelAr||item.labelEn):item.labelEn;
      html+=`<div class="nav-group"><button type="button" class="nav-item nav-main" data-nav-toggle="${esc(item.id)}">${navIcon(item.icon||"box")}<span class="nav-label">${esc(folderLabel)}</span><span class="nav-caret">▾</span></button><div class="nav-dropdown" data-nav-menu="${esc(item.id)}">${(item.children||[]).map(pid=>renderMenuPage(pid,customPages[pid])).join("")}</div></div>`;
    }
  }
  sidebar.innerHTML=`<button type="button" id="sidebarToggle" class="sidebar-toggle" aria-label="${esc(L("Toggle sidebar","فتح/إغلاق القائمة"))}" title="${esc(L("Toggle sidebar","فتح/إغلاق القائمة"))}" onclick="toggleSidebar();return false;">${navIcon("menu")}</button>${html}`;
  const sidebarToggle=document.getElementById("sidebarToggle");
  if(sidebarToggle){
    // Storage access may be blocked by browser privacy settings. Do not let it
    // abort menu event wiring and leave the sidebar icons inert.
    const collapsed=safeStorageGet(localStorage,"trend_sidebar_collapsed","0")==="1";
    document.body.classList.toggle("sidebar-collapsed",collapsed);
  }
  // Dropdowns always start closed in both Arabic RTL and English LTR.
  // Folder-open state is transient UI state and is not persisted to server config.
  sidebar.querySelectorAll("[data-nav-toggle]").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();e.stopPropagation();
    const key=String(btn.dataset.navToggle||"");
    const menu=sidebar.querySelector(`[data-nav-menu="${CSS.escape(key)}"]`) || document.querySelector(`body > .nav-dropdown.nav-dropdown-portal[data-nav-menu="${CSS.escape(key)}"]`);
    if(!menu)return;
    const wasOpen=menu.classList.contains("open");
    playTrendWarningTone();
    const menuFolder=MENU_CONFIG.items.find(x=>x.type==="folder"&&x.id===key);
    if(menuFolder) menuFolder.open=false;
    // On phones keep the submenu inside the slide-out sidebar. Portaling it to
    // body made the tapped folder look inert on mobile after repeated opens.
    if(window.innerWidth<=800){
      document.querySelectorAll("#sidebar .nav-dropdown.open").forEach(other=>{if(other!==menu)other.classList.remove("open");});
      document.querySelectorAll("body > .nav-dropdown.nav-dropdown-portal").forEach(other=>other.remove());
      menu.classList.remove("nav-dropdown-portal");
      menu.removeAttribute("style");
      if(menu.parentElement!==btn.parentElement)btn.parentElement.appendChild(menu);
      menu.classList.toggle("open",!wasOpen);
      if(!wasOpen){
        // Keep expanded folders reachable on short phone screens: limit the
        // submenu height and scroll the sidebar just enough to reveal it.
        menu.style.maxHeight='min(42dvh, 320px)';
        menu.style.overflowY='auto';
        requestAnimationFrame(()=>{
          const sideRect=sidebar.getBoundingClientRect();
          const menuRect=menu.getBoundingClientRect();
          if(menuRect.bottom>sideRect.bottom-12) sidebar.scrollTop += menuRect.bottom-sideRect.bottom+16;
          else if(menuRect.top<sideRect.top+12) sidebar.scrollTop -= sideRect.top+12-menuRect.top;
        });
      }else{
        menu.removeAttribute('style');
      }
      return;
    }
    closeNavDropdowns();
    if(wasOpen)return;
    if(menu.parentElement!==document.body){menu.classList.add("nav-dropdown-portal");document.body.appendChild(menu);}
    const r=btn.getBoundingClientRect(),sidebarRect=sidebar.getBoundingClientRect(),width=Math.min(300,Math.max(250,window.innerWidth-24));
    const sidebarOnRight=(sidebarRect.left+sidebarRect.width/2)>window.innerWidth/2;
    let left=sidebarOnRight ? sidebarRect.left-width-8 : sidebarRect.right+8;
    left=Math.max(8,Math.min(left,window.innerWidth-width-8));
    const top=Math.max(8,Math.min(r.top,window.innerHeight-260));
    menu.style.width=width+"px";menu.style.maxWidth=(window.innerWidth-16)+"px";menu.style.left=left+"px";menu.style.right="auto";menu.style.top=top+"px";menu.style.maxHeight=Math.max(180,window.innerHeight-top-12)+"px";menu.style.overflowY="auto";menu.style.direction=document.documentElement.dir||"ltr";menu.classList.add("open");
  }));
  sidebar.querySelectorAll("[data-page]").forEach(btn=>{
    btn.addEventListener("click",e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();if(btn.classList.contains("nav-disabled"))return;closeNavDropdowns();const targetPage=btn.dataset.page;if(targetPage)void show(targetPage);});
  });
  renderSystemAIChatLauncher();
}

function hasSystemDeliveryAIAccess(){
  const user=CURRENT_USER||{};
  if(user.id==="env-admin"||user.is_system_admin===true)return true;
  const raw=user.permissions;
  if(!raw)return false;
  if(Array.isArray(raw)||raw instanceof Set)return [...raw].some(item=>String(typeof item==="object"?(item.code||item.key||item.permission):item).trim().toLowerCase()==="system_delivery_ai");
  if(typeof raw==="string")return raw.split(/[;,\\s]+/).some(x=>x.trim().toLowerCase()==="system_delivery_ai");
  return raw.system_delivery_ai===true||raw.system_delivery_ai===1||raw.system_delivery_ai==="true"||raw.system_delivery_ai==="1";
}
function renderSystemAIChatLauncher(){
  if(!hasSystemDeliveryAIAccess()||document.getElementById("systemAIChatLauncher"))return;
  const style=document.createElement("style");style.id="systemAIChatLauncherStyles";
  style.textContent=`#systemAIChatLauncher{position:fixed;z-index:1200;left:14px;bottom:14px;width:32px;height:32px;border:0;border-radius:50%;background:linear-gradient(145deg,#315ee8,#173aa9);color:#fff;box-shadow:0 3px 10px #173aa955;display:grid;place-items:center;cursor:pointer}#systemAIChatLauncher:focus-visible,#systemAIChatClose:focus-visible{outline:3px solid #d4a84f;outline-offset:3px}#systemAIChatOverlay{position:fixed;inset:0;z-index:1201;background:#101d3670;display:none;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}#systemAIChatOverlay.open{display:flex}#systemAIChatPanel{width:min(94vw,920px);max-width:920px;height:min(90dvh,860px);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px #07142b55;display:flex;flex-direction:column}#systemAIChatBar{height:48px;flex:0 0 48px;background:#101d36;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font:600 14px Tahoma,Arial,sans-serif}#systemAIChatClose{border:0;background:#ffffff1c;color:#fff;border-radius:9px;width:34px;height:34px;font-size:22px;cursor:pointer}#systemAIChatFrame{border:0;width:100%;flex:1;min-height:0;background:#fff}@media(max-width:600px){#systemAIChatLauncher{left:10px;bottom:10px;width:30px;height:30px}#systemAIChatOverlay{padding:0}#systemAIChatPanel{width:100%;height:100dvh;border-radius:0}#systemAIChatBar{padding:0 12px}}`;
  document.head.appendChild(style);
  const button=document.createElement("button");button.id="systemAIChatLauncher";button.type="button";button.setAttribute("aria-label","فتح مساعد الذكاء الاصطناعي");button.title="مساعد الذكاء الاصطناعي";button.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 13.5h5"/></svg>';
  const overlay=document.createElement("div");overlay.id="systemAIChatOverlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","System Delivery AI");
  overlay.innerHTML='<section id="systemAIChatPanel"><div id="systemAIChatBar"><span>✦ System Delivery AI</span><button id="systemAIChatClose" type="button" aria-label="إغلاق المحادثة">×</button></div><iframe id="systemAIChatFrame" title="System Delivery AI" src="/system-delivery-ai.html?embed=1&layout=square-chat-20261023-1"></iframe></section>';
  document.body.append(button,overlay);
  const close=()=>{overlay.classList.remove("open");button.focus();};
  button.addEventListener("click",()=>overlay.classList.add("open"));
  overlay.querySelector("#systemAIChatClose").addEventListener("click",close);
  overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay.classList.contains("open"))close();});
}
function toggleMobileSidebar(){
  if(window.innerWidth>800) return;
  document.body.classList.toggle('sidebar-mobile-open');
  const open=document.body.classList.contains('sidebar-mobile-open');
  const b=document.getElementById('mobileSidebarToggle');
  if(b){b.textContent=open?'×':'☰';b.setAttribute('aria-label',open?L('Close menu','إغلاق القائمة'):L('Open menu','فتح القائمة'));}
}
function closeMobileSidebar(){
  document.body.classList.remove('sidebar-mobile-open');
  const b=document.getElementById('mobileSidebarToggle');
  if(b){b.textContent='☰';b.setAttribute('aria-label',L('Open menu','فتح القائمة'));}
}
function toggleSidebar(){
  if(window.innerWidth<=800){toggleMobileSidebar();return;}
  const collapsed=!document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed",collapsed);
  try{localStorage.setItem("trend_sidebar_collapsed",collapsed?"1":"0");}catch(_){ }
  const btn=document.getElementById("sidebarToggle");
  if(btn){btn.innerHTML=navIcon(collapsed?"chevron-right":"chevron-left");btn.setAttribute("title",L(collapsed?"Expand sidebar":"Collapse sidebar",collapsed?"فتح القائمة":"إغلاق القائمة"));}
  closeNavDropdowns();
}
function closeNavDropdowns(){
  document.querySelectorAll("body > .nav-dropdown.nav-dropdown-portal").forEach(menu=>{
    const key=String(menu.dataset.navMenu||"");
    const sidebar=document.getElementById("sidebar");
    const btn=sidebar?.querySelector(`[data-nav-toggle="${CSS.escape(key)}"]`);
    const group=btn?.closest(".nav-group");
    // Return the same menu to its original group instead of deleting it.
    // Deleting the portaled menu was the reason the same filter could not
    // be opened again until another menu was rendered.
    if(group){
      menu.classList.remove("open","nav-dropdown-portal");
      menu.removeAttribute("style");
      group.appendChild(menu);
    }else{
      menu.remove();
    }
  });
  document.querySelectorAll("#sidebar .nav-dropdown.open").forEach(menu=>menu.classList.remove("open"));
}
document.addEventListener("click",e=>{
  const companyName=e.target?.closest?.('.trend-speak-company');
  if(companyName){e.preventDefault();speakTrendName(COMPANY_BRANDING?.name||companyName.textContent);return;}
  const action=e.target?.closest?.('button,a[href],[role="button"],input[type="button"],input[type="submit"],.icon-button,[data-icon-action]');
  if(action){
    const label=[action.textContent,action.getAttribute('aria-label'),action.getAttribute('title'),action.value].filter(Boolean).join(' ').trim();
    const isX=/^(?:×|✕|✖|x|X|✗|close|إغلاق)$/i.test(label)||/[×✕✖✗]/.test(label);
    const isDelete=/(?:\bdelete\b|\bremove\b|حذف|مسح)/i.test(label);
    const isCancel=/(?:\bcancel\b|إلغاء|الغاء)/i.test(label);
    if(isX||isDelete||isCancel)playTrendWarningTone(isDelete?'delete':'warning');
    else if(!action.matches('[data-nav-toggle]') && (action.querySelector('.nav-icon,svg') || action.matches('.icon-button,[data-icon-action]'))) playTrendWarningTone('warning');
  }

  if(!e.target.closest("#sidebar") && !e.target.closest(".nav-dropdown-portal")) closeNavDropdowns();
});
window.addEventListener("resize",()=>{
  // Re-rendering on breakpoint changes keeps Accounting/Settings icons aligned.
  if(window.innerWidth<=800) document.querySelectorAll("#sidebar .nav-dropdown").forEach(m=>m.classList.remove("open"));
});
async function loadMenuConfig(){
  try{const d=await api("/api/settings/menu-config",{skipAuth:true});MENU_CONFIG=normalizeMenuConfig(d.data);return MENU_CONFIG;}catch(e){MENU_CONFIG=cloneMenuConfig(DEFAULT_MENU_CONFIG);return MENU_CONFIG;}
}
async function saveMenuConfig(config){const d=await api("/api/settings/menu-config",{method:"PATCH",body:JSON.stringify({config})});MENU_CONFIG=normalizeMenuConfig(d.data);renderSidebar();return MENU_CONFIG;}
async function persistMenuOpenState(){try{await api("/api/settings/menu-config",{method:"PATCH",body:JSON.stringify({config:MENU_CONFIG})});}catch(e){console.warn("Menu open state could not be saved:",e);}}
async function resetMenuConfig(){const d=await api("/api/settings/menu-config",{method:"DELETE"});MENU_CONFIG=normalizeMenuConfig(d.data);renderSidebar();return MENU_CONFIG;}
function menuEditorPageRow(id,config){const [en,ar]=menuPageLabel(id), ov=config.pageOverrides?.[id]||{};return `<div class="menu-editor-page" draggable="true" data-page-id="${esc(id)}"><span class="drag-handle">☷</span><span class="menu-editor-icon">${navIcon(ov.icon||menuPageIcon(id))}</span><span class="menu-editor-label"><b>${esc(ov.labelEn||en)}</b><small>${esc(ov.labelAr||ar)}</small></span><button type="button" class="ghost menu-edit-page" data-edit-page="${esc(id)}">✎</button></div>`;}
function renderMenuEditor(config){
  const pages=new Set(Object.keys(MENU_PAGE_DEFS)); const used=new Set(); config.items.forEach(x=>x.type==="page"?used.add(x.id):x.children.forEach(id=>used.add(id)));
  const unplaced=[...pages].filter(id=>!used.has(id));
  return `<div class="menu-editor" id="menuEditor"><div class="menu-editor-toolbar"><button class="ghost" type="button" onclick="saveCustomizeMenu()">${L("Save Menu","حفظ القائمة")}</button><button class="ghost" type="button" onclick="resetCustomizeMenu()">${L("Reset Menu","إعادة ضبط القائمة")}</button><button class="ghost" type="button" onclick="addCustomizeFolder()">＋ ${L("New Folder","مجلد جديد")}</button><button class="ghost" type="button" onclick="show('adminTools')">${L("Back","رجوع")}</button></div><p class="muted">${L("Drag pages to reorder them, move them between folders, or drop them into the main list. Folder open/closed state is saved too.","اسحب الصفحات لترتيبها أو نقلها بين المجلدات أو إعادتها للقائمة الرئيسية. حالة فتح وقفل المجلد محفوظة أيضًا.")}</p><div class="menu-editor-main" data-drop-container="root">${config.items.map(item=>item.type==="folder"?renderMenuEditorFolder(item,config):menuEditorPageRow(item.id,config)).join("")}</div>${unplaced.length?`<div class="menu-editor-unplaced"><h4>${L("Unplaced Pages","صفحات غير موضوعة")}</h4><div>${unplaced.map(id=>menuEditorPageRow(id,config)).join("")}</div></div>`:""}</div>`;
}
function renderMenuEditorFolder(folder,config){return `<div class="menu-editor-folder" draggable="false" data-folder-id="${esc(folder.id)}"><div class="menu-folder-head"><span class="drag-handle folder-drag" draggable="true" data-folder-drag="${esc(folder.id)}">☷</span><span class="menu-editor-icon">${navIcon(folder.icon||"box")}</span><input class="menu-folder-name-en" value="${esc(folder.labelEn)}" aria-label="Folder English name"><input class="menu-folder-name-ar" value="${esc(folder.labelAr)}" aria-label="Folder Arabic name"><select class="menu-folder-icon">${Object.keys(NAV_ICONS).map(k=>`<option value="${esc(k)}" ${k===folder.icon?"selected":""}>${esc(k)}</option>`).join("")}</select><button type="button" class="ghost menu-folder-open" data-folder-open="${esc(folder.id)}">${folder.open?"▾":"▸"}</button><button type="button" class="danger menu-delete-folder" data-delete-folder="${esc(folder.id)}">×</button></div><div class="menu-folder-children" data-drop-folder="${esc(folder.id)}">${(folder.children||[]).map(id=>menuEditorPageRow(id,config)).join("")}</div></div>`;}
function wireMenuEditor(){const root=$("menuEditor");if(!root)return;let dragPage=null,dragFolder=null;
  root.querySelectorAll("[draggable=true][data-page-id]").forEach(el=>el.addEventListener("dragstart",e=>{dragPage=el.dataset.pageId;e.dataTransfer.effectAllowed="move";el.classList.add("dragging");}));
  root.querySelectorAll("[data-page-id]").forEach(el=>el.addEventListener("dragend",()=>el.classList.remove("dragging")));
  root.querySelectorAll("[data-drop-folder],[data-drop-container=\"root\"]").forEach(zone=>zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("drag-over");}));
  root.querySelectorAll("[data-drop-folder],[data-drop-container=\"root\"]").forEach(zone=>zone.addEventListener("dragleave",()=>zone.classList.remove("drag-over")));
  root.querySelectorAll("[data-drop-folder],[data-drop-container=\"root\"]").forEach(zone=>zone.addEventListener("drop",e=>{e.preventDefault();zone.classList.remove("drag-over");if(!dragPage)return;moveEditorPage(dragPage,zone.dataset.dropFolder||null,null);dragPage=null;}));
  root.querySelectorAll("[data-page-id]").forEach(target=>target.addEventListener("dragover",e=>e.preventDefault()));
  root.querySelectorAll("[data-page-id]").forEach(target=>target.addEventListener("drop",e=>{e.preventDefault();if(!dragPage||dragPage===target.dataset.pageId)return;const cfg=readMenuEditor();for(const item of cfg.items){if(item.type==="folder")item.children=(item.children||[]).filter(id=>id!==dragPage);}cfg.items=cfg.items.filter(x=>!(x.type==="page"&&x.id===dragPage));const parent=target.parentElement?.dataset.dropFolder||null;if(parent){const f=cfg.items.find(x=>x.type==="folder"&&x.id===parent);if(f){const idx=f.children.indexOf(target.dataset.pageId);f.children.splice(Math.max(0,idx),0,dragPage);}}else{const idx=cfg.items.findIndex(x=>x.type==="page"&&x.id===target.dataset.pageId);cfg.items.splice(Math.max(0,idx),0,{type:"page",id:dragPage});}renderCustomizeMenuEditor(cfg);dragPage=null;}));
  root.querySelectorAll("[data-folder-drag]").forEach(el=>el.addEventListener("dragstart",e=>{dragFolder=el.dataset.folderDrag;e.dataTransfer.effectAllowed="move";}));
  root.querySelectorAll(".menu-editor-main").forEach(zone=>zone.addEventListener("drop",e=>{if(!dragFolder)return;e.preventDefault();const cfg=readMenuEditor();const idx=cfg.items.findIndex(x=>x.type==="folder"&&x.id===dragFolder);if(idx<0)return;const f=cfg.items.splice(idx,1)[0];cfg.items.push(f);renderCustomizeMenuEditor(cfg);dragFolder=null;}));
  root.querySelectorAll("[data-delete-folder]").forEach(btn=>btn.addEventListener("click",async()=>{const id=btn.dataset.deleteFolder;if(!await showConfirmModal(L("Delete this folder? Its pages will return to the main list.","حذف هذا المجلد؟ سيتم إعادة صفحاته للقائمة الرئيسية.")))return;const cfg=readMenuEditor(),idx=cfg.items.findIndex(x=>x.type==="folder"&&x.id===id);if(idx<0)return;const f=cfg.items.splice(idx,1)[0],at=cfg.items.length;cfg.items.splice(at,0,...(f.children||[]).map(pid=>({type:"page",id:pid})));renderCustomizeMenuEditor(cfg);}));
  root.querySelectorAll("[data-folder-open]").forEach(btn=>btn.addEventListener("click",()=>{const cfg=readMenuEditor(),f=cfg.items.find(x=>x.type==="folder"&&x.id===btn.dataset.folderOpen);if(f){f.open=!f.open;renderCustomizeMenuEditor(cfg);}}));
  root.querySelectorAll("[data-edit-page]").forEach(btn=>btn.addEventListener("click",()=>editCustomizePage(btn.dataset.editPage)));
}
function moveEditorPage(pageId,targetFolder,zone){const cfg=readMenuEditor();for(const item of cfg.items){if(item.type==="folder")item.children=(item.children||[]).filter(id=>id!==pageId);}cfg.items=cfg.items.filter(x=>!(x.type==="page"&&x.id===pageId));if(targetFolder){const f=cfg.items.find(x=>x.type==="folder"&&x.id===targetFolder);if(f)f.children.push(pageId);else cfg.items.push({type:"page",id:pageId});}else{cfg.items.push({type:"page",id:pageId});}renderCustomizeMenuEditor(cfg);}
function readMenuEditor(){
  const cfg=cloneMenuConfig(MENU_CONFIG||DEFAULT_MENU_CONFIG),root=$("menuEditor");
  if(!root)return cfg;
  cfg.pageOverrides=cfg.pageOverrides||{};
  const byId=new Map((cfg.items||[]).filter(x=>x.type==="folder").map(x=>[x.id,{...x,children:[...(x.children||[])]}]));
  root.querySelectorAll(".menu-editor-folder").forEach(box=>{
    const f=byId.get(box.dataset.folderId); if(!f)return;
    f.labelEn=box.querySelector(".menu-folder-name-en")?.value.trim()||f.labelEn;
    f.labelAr=box.querySelector(".menu-folder-name-ar")?.value.trim()||f.labelAr;
    f.icon=box.querySelector(".menu-folder-icon")?.value||f.icon;
    f.open=f.open!==false;
    f.children=[...box.querySelectorAll(".menu-folder-children > .menu-editor-page")].map(x=>x.dataset.pageId);
  });
  const result=[];
  for(const node of root.querySelectorAll(":scope > .menu-editor-page, :scope > .menu-editor-folder")){
    if(node.classList.contains("menu-editor-page")) result.push({type:"page",id:node.dataset.pageId});
    else {const f=byId.get(node.dataset.folderId);if(f)result.push(f);}
  }
  cfg.items=result;
  return normalizeMenuConfig(cfg);
}
function renderCustomizeMenuEditor(cfg){MENU_CONFIG=normalizeMenuConfig(cfg);const box=$("menuCustomizeEditor");if(!box)return;box.innerHTML=renderMenuEditor(MENU_CONFIG);wireMenuEditor();}
async function editCustomizePage(id){const ov=(MENU_CONFIG.pageOverrides||{})[id]||{},[en,ar]=menuPageLabel(id),nameEn=await showInputModal(L("Page English name", "اسم الصفحة بالإنجليزية"),ov.labelEn||en);if(nameEn===null)return;const nameAr=await showInputModal(L("Page Arabic name","اسم الصفحة بالعربية"),ov.labelAr||ar);if(nameAr===null)return;const icon=await showInputModal(L("Icon key (home, box, truck, gear...)","اسم الأيقونة (home, box, truck, gear...)"),ov.icon||menuPageIcon(id));if(icon===null)return;MENU_CONFIG.pageOverrides=MENU_CONFIG.pageOverrides||{};MENU_CONFIG.pageOverrides[id]={labelEn:nameEn.trim()||en,labelAr:nameAr.trim()||ar,icon:icon.trim()||menuPageIcon(id)};renderCustomizeMenuEditor(MENU_CONFIG);}
async function addCustomizeFolder(){const en=await showInputModal(L("Folder English name","اسم المجلد بالإنجليزية"));if(en===null)return;const ar=await showInputModal(L("Folder Arabic name","اسم المجلد بالعربية"),en);if(ar===null)return;const id="custom_"+Date.now();const cfg=readMenuEditor();cfg.items.push({type:"folder",id,labelEn:en.trim()||"Folder",labelAr:ar.trim()||en.trim()||"مجلد",icon:"box",open:true,children:[]});renderCustomizeMenuEditor(cfg);}
async function saveCustomizeMenu(){try{const cfg=readMenuEditor();await saveMenuConfig(cfg);await show("adminTools");alert(L("Menu saved successfully.","تم حفظ القائمة بنجاح."));}catch(e){alert(e.message||L("Could not save menu","تعذر حفظ القائمة"));}}
async function resetCustomizeMenu(){if(!await showConfirmModal(L("Reset the menu to the system default?","إعادة القائمة للوضع الافتراضي؟")))return;try{await resetMenuConfig();await show("adminTools");alert(L("Menu reset successfully.","تمت إعادة ضبط القائمة بنجاح."));}catch(e){alert(e.message);}}
async function openCustomizeMenu(){await loadMenuConfig();const c=$("content");if(!c)return;c.innerHTML=`<h2>${L("Customize Menu","تخصيص القائمة")}</h2><div class="panel admin-tools-panel"><div id="menuCustomizeEditor"></div></div>`;renderCustomizeMenuEditor(MENU_CONFIG);}

window.addEventListener("resize",()=>{
  const menu=document.querySelector(".nav-dropdown.nav-dropdown-portal.open");
  if(!menu) return;
  const key=menu.dataset.navMenu;
  const btn=document.querySelector(`[data-nav-toggle="${key}"]`);
  if(!btn) return;
  const r=btn.getBoundingClientRect();
  const width=Math.min(300,Math.max(250,window.innerWidth-110));
  menu.style.width=width+"px";
  menu.style.left=Math.max(8,r.left-width-8)+"px";
  menu.style.top=Math.max(8,Math.min(r.top,window.innerHeight-260))+"px";
});


const SYSTEM_STATUSES = ["Receive at Hub","In Ops","Assigned with Driver","Delivered","Half Delivered","Replaced","Cancelled","Cancelled by Shipper","Cancelled by Receiver","Return by Driver","Return to Origin","Future Delivery","Location Change","Schedule for Tomorrow","Return Completed","To be pickedup"];
const ORDERS_VERIFICATION_ALLOWED_STATUSES = ["delivered","half delivered","cancelled by shipper","cancelled by receiver","replaced"];
function displayShipmentStatus(r){ const actual=String(r?.current_status||r?.status||r?.order?.status||"").trim(); if(actual){const key=actual.toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();const aliases={"canceled":"Cancelled","cancelled":"Cancelled","cancelled by shipper":"Cancelled by Shipper","canceled by shipper":"Cancelled by Shipper","cancelled by receiver":"Cancelled by Receiver","canceled by receiver":"Cancelled by Receiver","return by driver":"Return by Driver","return to origin":"Return to Origin","return completed":"Return Completed","to be picked up":"To be pickedup","to be pickedup":"To be pickedup"};return aliases[key]||actual;} const a=String(r?.order?.driver_statement_action||r?.driver_statement_action||"").toLowerCase(); const m={return_by_driver:"Return by Driver",location_change:"Location Change",future_delivery:"Future Delivery",schedule_for_tomorrow:"Schedule for Tomorrow",cancelled:"Cancelled"}; return m[a] || ""; }
function merchantLabel(m){if(!m)return '';const code=m.merchant_no||m.code||m.external_code||'';const name=m.name||'';return code&&name?`${code} — ${name}`:(code||name);}
function normalizeShipperUi(value) {
  return String(value ?? "")
    .replace(/\bmerchants\b/gi, "Shippers")
    .replace(/\bmerchant\b/gi, "Shipper")
    .replace(/الشاحنين/g, "التجار")
    .replace(/الشاحن/g, "التاجر")
    .replace(/شاحنين/g, "تجار")
    .replace(/شاحن/g, "تاجر");
}
function L(en, ar) { return normalizeShipperUi(LANG === "ar" ? (ar || en) : en); }
// Convert internal audit event keys into short, readable movement-history labels.
function movementHistoryLabel(value){
  const raw=String(value||"").trim();
  const key=raw.toLowerCase().replace(/[\s-]+/g,"_");
  const labels={
    driver_account_settlement_paid_order:["Driver settlement: Paid","تسوية المندوب: Paid"],
    cancel_driver_account_settlement_order:["Driver settlement cancelled for order","إلغاء تسوية المندوب للأوردر"],
    cancel_driver_account_settlement:["Driver settlement cancelled","إلغاء تسوية المندوب"],
    driver_account_settlement:["Driver account settlement","تسوية حساب المندوب"]
  };
  if(labels[key])return L(labels[key][0],labels[key][1]);
  return raw.replace(/_/g," ").replace(/\s+/g," ").trim();
}
function t(x){ return normalizeShipperUi(I18N[LANG]?.[x] || x); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
let SYSTEM_TOAST_TIMER = null;
function showToast(text, type="info", duration=3200){
  let host=$("systemToastHost");
  if(!host){
    host=document.createElement("div");
    host.id="systemToastHost";
    host.className="system-toast-host";
    document.body.appendChild(host);
  }
  const item=document.createElement("div");
  item.className=`system-toast system-toast-${type}`;
  item.textContent=String(text ?? "");
  item.setAttribute("role","status");
  host.appendChild(item);
  requestAnimationFrame(()=>item.classList.add("show"));
  const remove=()=>{item.classList.remove("show");setTimeout(()=>item.remove(),220);};
  const timer=setTimeout(remove,Math.max(1200,duration));
  item.addEventListener("click",()=>{clearTimeout(timer);remove();});
}
function msg(id,text,cls=""){
  // Suppress the expected unauthenticated response during the login-page bootstrap.
  // This is display-only; authentication and API responses remain unchanged.
  if(/غير مصرح\s*[—-]?\s*سجل الدخول أولاً|غير مصرح\s*[—-]?\s*تسجيل الدخول أولاً|unauthorized\s*[-:]?\s*login first/i.test(String(text||""))){
    const authNotice=$(id);
    if(authNotice) authNotice.innerHTML="";
    return;
  }
  const el=$(id);
  if(el) {
    el.innerHTML=`<span class="${cls||""}">${esc(text)}</span>`;
    if(cls) setTimeout(()=>{if(el)el.innerHTML="";},5000);
  }
  if(cls==="ok"||cls==="error"||cls==="warn") showToast(text,cls==="ok"?"success":cls,3200);
}
let NOTIFICATION_TIMER=null;
let NOTIFICATION_LAST_UNREAD=null;
let NOTIFICATION_SOUND_ENABLED=safeStorageGet(localStorage,'trend_notification_sound','on')!=='off';
function updateNotificationSoundButton(){
  const b=$('notificationSoundToggle'),i=$('notificationSoundIcon');
  if(i)i.textContent=NOTIFICATION_SOUND_ENABLED?'🔔':'🔕';
  if(b){b.title=NOTIFICATION_SOUND_ENABLED?L('Mute notification sound','كتم صوت الإشعارات'):L('Enable notification sound','تشغيل صوت الإشعارات');b.setAttribute('aria-label',b.title);b.classList.toggle('sound-muted',!NOTIFICATION_SOUND_ENABLED);}
}
function toggleNotificationSound(){
  NOTIFICATION_SOUND_ENABLED=!NOTIFICATION_SOUND_ENABLED;
  safeStorageSet(localStorage,'trend_notification_sound',NOTIFICATION_SOUND_ENABLED?'on':'off');
  updateNotificationSoundButton();
  if(NOTIFICATION_SOUND_ENABLED)playSystemNotificationSound();
  showToast(NOTIFICATION_SOUND_ENABLED?L('Notification sound enabled','تم تشغيل صوت الإشعارات'):L('Notification sound muted','تم كتم صوت الإشعارات'),'info');
}
function playSystemNotificationSound(){
  if(!NOTIFICATION_SOUND_ENABLED)return;
  try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;const ctx=new Ctx();
    const play=(freq,start,duration)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,ctx.currentTime+start);g.gain.setValueAtTime(.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(.09,ctx.currentTime+start+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+start+duration);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+duration+.02);};play(880,0,.16);play(1175,.17,.22);setTimeout(()=>ctx.close().catch(()=>{}),600);
  }catch(_){}
}
async function loadNotifications(){
  if(!CURRENT_USER)return;
  try{const d=await api('/api/notifications?limit=30');const rows=d.data||[],unread=Number(d.unread_count||0),badge=$('notificationBadge');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',!(unread>0));}
    if(NOTIFICATION_LAST_UNREAD!==null&&unread>NOTIFICATION_LAST_UNREAD){playSystemNotificationSound();if(document.hidden&&'Notification'in window&&Notification.permission==='granted')new Notification(L('New notification','إشعار جديد'),{body:L('You have a new system notification','لديك إشعار جديد في النظام'),icon:'/trend-logo.jpeg'});}
    NOTIFICATION_LAST_UNREAD=unread;window.__TREND_NOTIFICATIONS=rows;updateNotificationSoundButton();return rows;
  }catch(_){return []}
}
async function openNotifications(){
  const rows=await loadNotifications();
  const panel=document.createElement('div');panel.className='notification-popover';panel.innerHTML=`<div class="notification-head"><b>${L('Notifications','الإشعارات')}</b><button class="mini-btn ghost" onclick="markAllNotificationsRead();this.closest('.notification-popover')?.remove()">${L('Mark all read','تحديد الكل كمقروء')}</button></div>${Number(CHAT_LAST_UNREAD||0)>0?`<button type="button" class="notification-chat-shortcut" onclick="this.closest('.notification-popover')?.remove();show('chat')">💬 ${L('Employee Chat','شات الموظفين')} — ${Number(CHAT_LAST_UNREAD)} ${L('unread messages','رسائل غير مقروءة')} · ${L('Open chat','افتح الشات')}</button>`:''}<div class="notification-list">${rows.length?rows.map(n=>`<button class="notification-item ${n.unread?'unread':''}" onclick="markNotificationRead('${esc(n.id)}',this)"><span class="notification-dot"></span><span><b>${esc(n.title||'')}</b><small>${esc(n.message||'')}</small><time>${esc(String(n.created_at||'').replace('T',' ').slice(0,16))}</time></span></button>`).join(''):`<div class="muted notification-empty">${L('No notifications','لا توجد إشعارات')}</div>`}</div>`;document.body.appendChild(panel);requestAnimationFrame(()=>panel.classList.add('open'));setTimeout(()=>{const close=e=>{if(!panel.contains(e.target)&&e.target.id!=='notificationBell'){panel.remove();document.removeEventListener('click',close);}};document.addEventListener('click',close);},0);
}
async function markNotificationRead(id,el){try{await api(`/api/notifications/${encodeURIComponent(id)}/read`,{method:'POST'});el?.classList.remove('unread');await loadNotifications();}catch(_){} }
async function markAllNotificationsRead(){try{await api('/api/notifications/read-all',{method:'POST'});await loadNotifications();}catch(_){} }
function startNotificationPolling(){if(NOTIFICATION_TIMER)clearInterval(NOTIFICATION_TIMER);NOTIFICATION_LAST_UNREAD=null;updateNotificationSoundButton();loadNotifications();NOTIFICATION_TIMER=setInterval(loadNotifications,30000);}
function stopNotificationPolling(){if(NOTIFICATION_TIMER)clearInterval(NOTIFICATION_TIMER);NOTIFICATION_TIMER=null;}

function updateCurrentUserUI(){
  const el=$("currentUserName");
  const logoutBtn=$("logoutBtn");
  if(el){
    const u=CURRENT_USER||{};
    el.textContent = u.name || u.username || u.email || (LANG === "ar" ? "المستخدم الحالي" : "Current User");
  }
  if(logoutBtn) logoutBtn.style.display=CURRENT_USER?"inline-block":"none";
}
function calculateDaysOut(row){
  // Delivery Job and Operation Dashboard share the same assignment-date rule.
  // Never use an order-level delivery_date/created_at as a substitute for assignment.
  const job=row?.delivery_job||row?.deliveryJob||null;
  const raw=row?.delivery_job_date||row?.job_date||job?.job_date||job?.delivery_date||job?.date||job?.created_at||'';
  if(!raw) return 0;
  const day=String(raw).slice(0,10);
  const t=new Date(day+'T12:00:00').getTime();
  if(!Number.isFinite(t)) return 0;
  const today=localDateISO();
  const todayMs=new Date(today+'T12:00:00').getTime();
  return Math.max(0,Math.floor((todayMs-t)/86400000));
}
function localDateISO(d=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:SYSTEM_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const part=type=>parts.find(x=>x.type===type)?.value||"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function formatSystemDate(value){
  if(value===null||value===undefined||value==='') return '—';
  const raw=String(value).trim();
  const m=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m) return `${m[1]}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}`;
  const d=new Date(raw); if(!Number.isFinite(d.getTime())) return raw;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:SYSTEM_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const part=type=>parts.find(x=>x.type===type)?.value||'';
  return `${part('year')}/${part('month')}/${part('day')}`;
}
window.formatSystemDate=formatSystemDate;
function today(){ return localDateISO(); }
// Driver settlements use the selected calendar date in the configured company timezone.
// Date-only values are preserved; stored timestamps are converted to that timezone.
function driverSettlementCalendarDay(value){
  const text=String(value||'').trim();
  if(!text)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const d=new Date(text);
  return Number.isFinite(d.getTime())?localDateISO(d):text.slice(0,10);
}
// A saved settlement belongs to the statement being closed, not the wall-clock
// day on which the employee happens to press Save. For a date range, use its end day.
function driverStatementSelectedDate(){
  const from=String($("stmtFrom")?.value||'').trim();
  const to=String($("stmtTo")?.value||'').trim();
  return to||from||today();
}
function shiftSystemDate(days){
  const [year,month,day]=today().split("-").map(Number);
  const d=new Date(Date.UTC(year,month-1,day+Number(days||0),12,0,0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function daysAgo(n){ return shiftSystemDate(-Number(n||0)); }
function daysFromToday(n){ return shiftSystemDate(Number(n||0)); }
window.localDateISO=localDateISO;
window.today=today;
window.daysAgo=daysAgo;
window.daysFromToday=daysFromToday;

// All stored monetary values are kept in AED. The selected currency is a display/input currency.
const CURRENCIES = {
  AED:{code:"AED", symbol:"د.إ", nameAr:"الدرهم الإماراتي", nameEn:"UAE Dirham", rate:1},
  EGP:{code:"EGP", symbol:"ج.م", nameAr:"الجنيه المصري", nameEn:"Egyptian Pound", rate:13.60},
  SAR:{code:"SAR", symbol:"ر.س", nameAr:"الريال السعودي", nameEn:"Saudi Riyal", rate:1.02},
  USD:{code:"USD", symbol:"$", nameAr:"الدولار الأمريكي", nameEn:"US Dollar", rate:0.2723},
  EUR:{code:"EUR", symbol:"€", nameAr:"اليورو", nameEn:"Euro", rate:0.234},
  GBP:{code:"GBP", symbol:"£", nameAr:"الجنيه الإسترليني", nameEn:"British Pound", rate:0.201}
};
let CURRENCY = safeStorageGet(localStorage, "trend_currency", "AED") || "AED";
if(!CURRENCIES[CURRENCY]) CURRENCY="AED";
function currencyInfo(){ return CURRENCIES[CURRENCY] || CURRENCIES.AED; }
function money(value, opts={}){
  const n=Number(value||0)*currencyInfo().rate;
  const digits=opts.digits ?? 2;
  const formatted=new Intl.NumberFormat(LANG==="ar"?"ar-EG":"en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n);
  return opts.withCode===false ? formatted : `${formatted} ${currencyInfo().code} / ${currencyInfo().symbol}`;
}
function moneyInput(value){
  const n=Number(value||0)*currencyInfo().rate;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
function baseAmount(displayValue){
  const n=Number(displayValue||0);
  return Number.isFinite(n) ? n/currencyInfo().rate : 0;
}
function setCurrency(code){
  if(!CURRENCIES[code]) return;
  CURRENCY=code;
  localStorage.setItem("trend_currency",CURRENCY);
  if(CURRENT_USER) show(CURRENT_PAGE);
}
function currencyLabel(code=CURRENCY){
  const c=CURRENCIES[code]||CURRENCIES.AED;
  return LANG==="ar" ? c.nameAr : c.nameEn;
}


function pagePermission(page){
  // Every page is tied to the permission for its primary menu section.
  // Legacy sub-permission keys (for example "jobs") must not make a page
  // visible when its main section permission ("shipments") is disabled.
  const map={
    dashboard:null,
    order:"orders", editOrder:"orders", booking:"orders", search:"orders",
    orderImport:"orders", wantedCustomers:"orders", areas:"orders",
    shipments:"shipments", operationsDashboard:"shipments",
    // Delivery Job has its own legacy permission checkbox; support it directly
    // while also allowing the primary Shipment permission to grant access.
    jobs:"jobs", scanDriver:"shipments", jobcode:"jobs", returns:"shipments",
    returnArchive:"shipments", driverReturns:"shipments",
    merchants:"merchants", chat:"chat",
    drivers:"drivers", liveMap:"drivers",
    accounting:"accounting", dailyCompanyReport:"accounting", receivable:"accounting",
    merchantFinancial:"accounting", companyFinancial:"accounting", companyExpenses:"accounting",
    settlementArchive:"accounting", employeeWages:"accounting", adjustment:"accounting",
    ordersVerification:"accounting", driverCommission:"accounting",
    driverExpenses:"expenses", audit:"audit", employees:"users",
    settings:"admin_tools", backupRestore:"backup_restore", adminTools:"admin_tools"
  };
  return Object.prototype.hasOwnProperty.call(map,page) ? map[page] : null;
}
function permissionFlag(value){
  return value===true || value===1 || (typeof value==="string" && ["true","1","yes","on","granted"].includes(value.trim().toLowerCase()));
}
function userHasPermission(key){
  const raw=CURRENT_USER?.permissions;
  if(!raw || !key) return false;
  const aliases={
    users:["users","user","employees","employee","employee_permissions","staff","roles","permissions"],
    orders:["orders","order","new_order","edit_order","booking","order_import","wanted_customers"],
    shipments:["shipments","shipment","scan","scan_driver","tracking","return","returns","return_archive","driver_return","driver_returns","outscan","delivery_job","deliveryjob"],
    jobs:["jobs","job","job_code","jobcode","update_delivery_job_code"],
    drivers:["drivers","driver","driver_account","driver_accounts","driver_commission","driver_wages","payroll","salary"],
    merchants:["merchants","merchant","shippers","shipper","customers","customer"],
    accounting:["accounting","finance","merchant_financial","company_financial","invoice","invoice_report","settlement","receivable","adjustment"],
    expenses:["expenses","expense","company_expenses","driver_expenses"],
    audit:["audit","audit_log"], chat:["chat","employee_chat"],
    backup_restore:["backup_restore"], admin_tools:["admin_tools"],
    completed_without_proof:["completed_without_proof"]
  };
  // Normalize camelCase permission identifiers before lowercasing (for example operationsDashboard).
  const normalize=value=>String(value??"").trim().replace(/([a-z0-9])([A-Z])/g,"$1_$2").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  const names=(aliases[key]||[key]).map(normalize);
  const matches=name=>{
    const code=normalize(name);
    return names.some(alias=>code===alias || code.startsWith(alias+"_") || code.endsWith("_"+alias) || code.includes("_"+alias+"_"));
  };
  if(Array.isArray(raw) || raw instanceof Set){
    return [...raw].some(item=>matches(typeof item==="object"?(item.code||item.key||item.permission):item));
  }
  if(typeof raw==="string"){
    return raw.split(/[;,\s]+/).some(matches);
  }
  if(typeof raw!=="object") return false;
  // Accept canonical maps and legacy permission-key maps, including action-prefixed keys.
  return Object.entries(raw).some(([name,value])=>matches(name) && permissionFlag(value));
}
function canAccessPage(page){
  if(!CURRENT_USER) return false;
  // Only the real environment/system administrator bypasses permission groups.
  // A stale "admin" role label on an employee must not expose every menu item.
  if(CURRENT_USER.id==="env-admin" || CURRENT_USER.is_system_admin===true) return true;
  if(page==="dashboard") return true;
  // Admin Tools remains owner/admin-only. A delegated Admin Tools permission
  // grants Backup & Restore only; it must not expose the locked Admin Tools page.
  if(page==="adminTools") return false;
  if(page==="deliveryIntelligence") return ["order_monitor","order_distributor","accounts_monitor","system_delivery_ai"].some(key=>userHasPermission(key));
  if(page==="backupRestore") return userHasPermission("backup_restore") || userHasPermission("admin_tools");
  const key=pagePermission(page);
  // Delivery Job and job-code pages support both the primary Shipment
  // permission and the dedicated legacy Jobs checkbox.
  if(page==="jobs" || page==="jobcode") {
    return userHasPermission("jobs") || userHasPermission("shipments");
  }
  // Unknown/unmapped pages fail closed instead of becoming visible by default.
  if(!key) return false;
  return userHasPermission(key);
}
function applyLanguage(){
  document.documentElement.lang=LANG;
  document.documentElement.dir=LANG==="ar"?"rtl":"ltr";
  const lb=document.querySelector("header .ghost"); if(lb)lb.textContent=LANG==="ar"?"AR / EN":"EN / AR";
  const out=document.querySelector("header .danger"); if(out)out.textContent=L("Logout","خروج");
  renderSidebar();
  const login=$("login");
  if(login){
    const h=login.querySelector("h1"),p=login.querySelector("p"),b=$("loginBtn"),u=$("username"),pw=$("password");
    if(h)h.textContent=String(COMPANY_BRANDING?.name||"Delivery");
    const loginLogo=login.querySelector(".login-logo");if(loginLogo){loginLogo.src=String(COMPANY_BRANDING?.logo_url||"/trend-logo.jpeg");loginLogo.alt=String(COMPANY_BRANDING?.name||"Delivery");}
    if(p)p.textContent=t("System Login");
    if(u)u.placeholder=L("Username","اسم المستخدم");
    if(pw)pw.placeholder=L("Password","كلمة المرور");
    if(b)b.textContent=t("Login");
  }
}

async function api(path,opt={}){
  // Storage can be blocked by browser privacy settings. Never let a storage
  // exception masquerade as an expired login; the HttpOnly cookie is primary.
  let storedSession="";
  try{storedSession=sessionStorage.getItem("trend_session_v7")||"";}catch(_){ }
  const headers={"Content-Type":"application/json",...(opt.headers||{})};
  if(storedSession && !headers.Authorization) headers.Authorization=`Bearer ${storedSession}`;
  let r;
  try{
    r=await fetch(path,{...opt,headers,credentials:"include",cache:"no-store"});
  }catch(fetchError){
    const err=new Error(L("Connection temporarily unavailable. Your login has not been cleared.","الاتصال غير متاح مؤقتًا. لم يتم مسح تسجيل دخولك."));
    err.networkError=true;
    throw err;
  }
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const err=new Error(d.error||`HTTP ${r.status}`);err.status=r.status;throw err;}
  return d;
}

async function login(){
  const username=$("username"),password=$("password");
  if(!username||!password) return msg("loginMsg",L("Login fields are missing","حقول تسجيل الدخول غير موجودة"),"error");

  const identity=username.value.trim();
  if(!identity||!password.value) return msg("loginMsg",L("Enter username/email and password","أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور"),"error");

  const b=$("loginBtn");
  if(b){b.disabled=true;b.textContent=L("Signing in…","جارٍ تسجيل الدخول…");}

  try{
    // Authenticate first. Only a real login/API error should return the user
    // to the login screen. Loading the first page is a separate operation.
    const d=await api("/api/login",{
      method:"POST",
      body:JSON.stringify({
        username:identity,
        email:identity,
        password:password.value
      })
    });

    if(!d?.user || !d?.sessionToken) throw new Error(L("Login failed: no user session was returned","فشل تسجيل الدخول: لم يتم إنشاء جلسة"));
    CURRENT_USER=d.user||null;
    // The login response already contains permissions resolved during
    // authentication. Do not block the first screen on /api/me: that endpoint
    // also refreshes session state and may aggregate admin device-audit rows.
    // Refresh the profile in the background and redraw navigation if it changes.
    const profileRefresh = api("/api/me",{cache:"no-store"}).then(freshProfile=>{
      if(freshProfile?.user?.id){
        CURRENT_USER=freshProfile.user;
        try{sessionStorage.setItem("trend_cached_user_v7",JSON.stringify(CURRENT_USER));}catch(_){}
        updateCurrentUserUI();
        renderSidebar();
      }
    }).catch(profileError=>{
      console.warn("[Trend Delivery] Could not refresh permissions after login:",profileError?.message||profileError);
    });
    safeStorageSet(sessionStorage, TREND_IDLE_KEY, String(Date.now()));
    trendLastActivityWrite = Date.now();
    trendLastActivityAt = trendLastActivityWrite;
    startIdleTimer();
    // Open the authenticated workspace immediately; refresh branding without blocking login.
    loadCompanyBranding().catch(error=>console.warn("[Trend Delivery] Branding refresh failed:",error?.message||error));
    try{sessionStorage.setItem("trend_cached_user_v7",JSON.stringify(CURRENT_USER));}catch(_){}
    if(d.sessionToken) { try{sessionStorage.setItem("trend_session_v7", d.sessionToken);}catch(_){ /* HttpOnly cookie remains the primary session */ } }
    startNotificationPolling();
    updateCurrentUserUI();

    // Render the authenticated workspace using the login permission snapshot
    // immediately. Menu configuration and the forced profile refresh complete
    // independently and update navigation when available.
    applyLanguage();
    renderSidebar();
    void Promise.all([loadMenuConfig(), profileRefresh]).then(()=>renderSidebar()).catch(error=>{
      console.warn("[Trend Delivery] Background login refresh failed:",error?.message||error);
    });

    $("login")?.classList.add("hidden");
    $("login")?.setAttribute("style","display:none!important");
    $("app")?.classList.remove("hidden");
    $("app")?.setAttribute("style","display:block!important");
    msg("loginMsg","","");

    // A dashboard/API failure must not invalidate a successful login.
    // The V4 first-party session remains valid across refresh and redeploy.
    // Show the dashboard shell immediately; its counters load independently.
    // This keeps successful login from waiting on slower dashboard/database queries.
    void show("dashboard").then(()=>startChatNotifications()).catch(pageError=>{
      console.error("Initial page load failed after successful login:",pageError);
      const c=$("content");
      if(c)c.innerHTML=`<div class="panel"><div class="msg error">${esc(pageError?.message||L("The dashboard could not be loaded. Please refresh and try again.","تعذر تحميل لوحة التحكم. حدّث الصفحة وحاول مرة أخرى."))}</div></div>`;
    });
  }catch(e){
    CURRENT_USER=null;
    $("app")?.classList.add("hidden");
    $("app")?.setAttribute("style","display:none!important");
    $("login")?.classList.remove("hidden");
    $("login")?.setAttribute("style","display:flex!important");
    msg("loginMsg",e.message||L("Login failed","فشل تسجيل الدخول"),"error");
  }finally{
    if(b){b.disabled=false;b.textContent=t("Login");}
  }
}
async function logout(silentIdleLogout=false){
  stopIdleTimer();
  let response=null, data=null;
  try{
    response=await fetch("/api/logout",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},cache:"no-store"});
    data=await response.json().catch(()=>({}));
  }catch(_){ response=null; }
  if(!response?.ok || !data?.success){
    if (!silentIdleLogout) {
      alert(data?.error || L("Logout could not be completed. You are still signed in; please try again.","تعذر إتمام تسجيل الخروج. ما زلت مسجل الدخول؛ حاول مرة أخرى."));
      startIdleTimer();
      return false;
    }
    // The idle deadline has elapsed. Clear this tab's local authenticated UI
    // even if the server is temporarily unreachable; stale activity is checked
    // again on reload so the old cookie cannot silently restore this tab.
  }
  stopNotificationPolling();
  CURRENT_USER=null;
  safeStorageRemove(sessionStorage,"trend_session_v7");
  safeStorageRemove(sessionStorage,"trend_cached_user_v7");
  if (response?.ok && data?.success) safeStorageRemove(sessionStorage, TREND_IDLE_KEY);
  // If an idle logout could not reach the server, keep the expired timestamp so
  // a reload cannot restore the old cookie as an active session.
  history.replaceState({},"",location.pathname);
  updateCurrentUserUI();
  safeStorageRemove(sessionStorage,"trend_operations_dashboard_state");
  if(CHAT_TIMER)clearInterval(CHAT_TIMER);
  stopChatNotifications();
  $("content")?.replaceChildren();
  $("app")?.classList.add("hidden");$("app")?.setAttribute("style","display:none!important");
  $("login")?.classList.remove("hidden");$("login")?.setAttribute("style","display:flex!important");
  if($("password"))$("password").value="";
  if($("username"))$("username").focus();
  return true;
}


function toggleLang(){LANG=LANG==="ar"?"en":"ar";safeStorageSet(localStorage,"trend_lang",LANG);applyLanguage();updateCurrentUserUI();if(CURRENT_USER)show(CURRENT_PAGE);}

function captureOperationsDashboardState(){
  if(CURRENT_PAGE!=="operationsDashboard") return;
  const state={
    version:3,from:$('opsFrom')?.value||'',to:$('opsTo')?.value||'',driver:$('opsDriverFilter')?.value||'',shipper:$('opsShipperFilter')?.value||'',status:$('opsStatus')?.value||'',governorate:$('opsGovernorateFilter')?.value||'',area:$('opsAreaFilter')?.value||'',search:$('opsSearch')?.value||'',filtersOpen:!!($('opsFiltersPanel')&&!$('opsFiltersPanel').hidden),
    windowX:window.scrollX||0,windowY:window.scrollY||0,
    tableX:document.querySelector('.operations-table-wrap')?.scrollLeft||0,
    tableY:document.querySelector('.operations-table-wrap')?.scrollTop||0
  };
  try{sessionStorage.setItem('trend_operations_dashboard_state',JSON.stringify(state));}catch(_){ }
}
function getOperationsDashboardState(){try{return JSON.parse(sessionStorage.getItem('trend_operations_dashboard_state')||'null')||{};}catch(_){return {};}}
function restoreOperationsDashboardState(){
  const state=getOperationsDashboardState();
  if($('opsFrom')&&state.from)$('opsFrom').value=state.from;
  if($('opsTo')&&state.to)$('opsTo').value=state.to;
  if($('opsSearch'))$('opsSearch').value=state.search||'';
  if($('opsStatus'))$('opsStatus').value=state.status||''; if($('opsDriverFilter')&&state.driver)$('opsDriverFilter').value=state.driver; if($('opsShipperFilter')&&state.shipper)$('opsShipperFilter').value=state.shipper; if($('opsGovernorateFilter'))$('opsGovernorateFilter').value=state.governorate||''; if($('opsAreaFilter'))$('opsAreaFilter').value=state.area||'';
  const filtersPanel=$('opsFiltersPanel');if(filtersPanel&&typeof state.filtersOpen==='boolean')filtersPanel.hidden=!state.filtersOpen;
  const wrap=document.querySelector('.operations-table-wrap');
  if(wrap){wrap.scrollLeft=Number(state.tableX||0);wrap.scrollTop=Number(state.tableY||0);}
  requestAnimationFrame(()=>{window.scrollTo(Number(state.windowX||0),Number(state.windowY||0));});
}
function saveOperationsDashboardStateAfterRender(){
  // Persist the live filter values before restoring scroll; never replace them with stale state.
  captureOperationsDashboardState();
  const state=getOperationsDashboardState();
  const wrap=document.querySelector('.operations-table-wrap');
  if(wrap){wrap.scrollLeft=Number(state.tableX||0);wrap.scrollTop=Number(state.tableY||0);}
  restoreOperationsDashboardState();
}


function isSystemAdminFrontend(){
  return CURRENT_USER?.id==="env-admin" || CURRENT_USER?.is_system_admin===true;
}

function openSystemDeliveryAssistant(){
  const launcher=document.getElementById("systemAIChatLauncher");
  if(launcher){launcher.click();return;}
  const area=document.getElementById("deliveryIntelligenceWorkArea");
  if(area)area.innerHTML='<p class="error">المساعد الذكي غير جاهز في هذه الجلسة. افتح أدوات المدير لتشغيل System Delivery AI ثم أعد المحاولة.</p>';
}
async function deliveryIntelligencePage(c){
  const tools=[
    {code:"order_monitor",icon:"alert",title:"مراقب الأوردرات",desc:"تنبيهات التأخير حسب الحالة والتاريخ"},
    {code:"order_distributor",icon:"map",title:"موزّع الأوردرات",desc:"تجميع الأوردرات حسب الإمارة والمنطقة قبل اختيار المندوب"},
    {code:"accounts_monitor",icon:"calculator",title:"مراقب الحسابات",desc:"مراجعة الأوردرات المكتملة غير المدفوعة والمصروفات"},
    {code:"system_delivery_ai",icon:"chat",title:"المساعد الذكي",desc:"اسأل System Delivery AI عن بيانات النظام واطلب التقارير وملفات PDF"}
  ];
  const visible=tools.filter(x=>isSystemAdminFrontend()||userHasPermission(x.code));
  const operational=visible.filter(x=>x.code!=="system_delivery_ai");
  const active=operational.some(x=>x.code===window.__deliveryIntelligenceTool)?window.__deliveryIntelligenceTool:(operational[0]?.code||"");
  c.innerHTML='<div class="page-head"><div><h2>'+esc(L("Delivery Intelligence","ذكاء التوصيل"))+'</h2><p>مراقبة التشغيل والحسابات بأدوات منفصلة</p></div><button type="button" class="ghost" onclick="openDeliveryIntelligenceTool(window.__deliveryIntelligenceTool)">تحديث البيانات</button></div>'+
    '<div class="grid-cards delivery-intelligence-grid">'+visible.map(x=>'<article class="panel delivery-intelligence-card"><div class="delivery-intelligence-card-head">'+navIcon(x.icon)+'<div><h3>'+esc(x.title)+'</h3></div></div><p>'+esc(x.desc)+'</p><button type="button" class="'+(active===x.code?'primary':'ghost')+'" onclick="'+(x.code==="system_delivery_ai"?"openSystemDeliveryAssistant()":"openDeliveryIntelligenceTool(\\'"+x.code+"\\')")+'">'+(x.code==="system_delivery_ai"?"فتح المساعد":"فتح الأداة")+'</button></article>').join("")+'</div>'+
    '<div id="deliveryIntelligenceWorkArea" class="panel" style="margin-top:16px"><p class="muted">جارٍ تحميل البيانات…</p></div>';
  if(active)await openDeliveryIntelligenceTool(active);
  else {const area=document.getElementById("deliveryIntelligenceWorkArea");if(area)area.innerHTML='<p class="muted">اختر أداة مراقبة من البطاقات أعلاه، أو افتح المساعد الذكي.</p>';}
}

function intelligenceStatus(r){return String(r?.current_status||r?.order?.status||r?.status||"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");}
function intelligenceDate(v){const d=String(v||"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:"";}
function intelligenceToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dubai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function intelligenceDaysSince(v){const d=intelligenceDate(v);if(!d)return null;const start=new Date(d+"T12:00:00").getTime();const now=new Date(intelligenceToday()+"T12:00:00").getTime();return Number.isFinite(start)&&Number.isFinite(now)?Math.floor((now-start)/86400000):null;}
function intelligenceOrderLabel(r){const o=r?.order||r||{};return o.merchant_order_no||o.order_code||r?.tracking_number||r?.shipment_no||r?.id||"—";}
function intelligenceOrderIsPaid(r){
  const o=r?.order||r||{};
  const values=[o.status,r?.order_status,o.commission_paid_status,o.cash_collection_status,o.paid_status,o.payment_status,o.commission_payment_status,r?.commission_paid_status,r?.cash_collection_status,r?.paid_status,r?.payment_status];
  return values.some(value=>String(value||"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ")==="paid");
}
function intelligenceDeliveryFee(r){
  const o=r?.order||r||{};
  return Number(o.service_charges??o.delivery_fee??r?.service_charges??r?.delivery_fee??0)||0;
}
function intelligenceMerchantLabel(r){return merchantLabel(r?.merchant||r?.order?.merchant||{name:r?.merchant_name,code:r?.merchant_no});}
function intelligenceRegion(r){const g=r?.governorate?.name_ar||r?.governorate?.name_en||r?.governorate_name||"إمارة غير محددة";const a=r?.area?.name_ar||r?.area?.name_en||r?.area_name||"منطقة غير محددة";return {governorate:g,area:a,key:g+" / "+a};}
async function loadIntelligenceData(tool){const d=await api("/api/delivery-intelligence/data?tool="+encodeURIComponent(tool));return d.data||{};}
async function openDeliveryIntelligenceTool(code){
  window.__deliveryIntelligenceTool=code;
  const area=document.getElementById("deliveryIntelligenceWorkArea");if(!area)return;
  area.innerHTML='<p class="muted">جارٍ تحميل البيانات…</p>';
  try{
    const data=await loadIntelligenceData(code),rows=data.shipments||[];
    if(code==="order_monitor"){renderOrderMonitor(area,rows);return;}
    if(code==="order_distributor"){renderOrderDistributor(area,rows,data.drivers||[]);return;}
    if(code==="accounts_monitor"){renderAccountsMonitor(area,rows,data);return;}
    area.innerHTML="<p>الأداة غير معروفة.</p>";
  }catch(e){area.innerHTML='<h3>تعذر تحميل الأداة</h3><p class="error">'+esc(e.message||String(e))+'</p><button type="button" class="ghost" onclick="openDeliveryIntelligenceTool(\''+code+'\')">إعادة المحاولة</button>';}
}
function renderOrderMonitor(area,rows){
  const today=intelligenceToday(),overdue=[];
  const waitingStatuses=new Set(["receive at hubs","receive at hub","in ops"]);
  const scheduledStatuses=new Set(["future delivery","return by driver","location change"]);
  // Match the five configured completion statuses (including their stored spelling),
  // not generic cancellation or unrelated statuses.
  const completionStatuses=new Set(["replace","replaced","half deliverd","half delivered","cancelled by shipper","cancelled by reciver","cancelled by receiver","deliverd","delivered"]);
  rows.forEach(r=>{
    const s=intelligenceStatus(r),o=r.order||{};
    const action=String(o.driver_statement_action||r.driver_statement_action||"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
    const scheduledStatus=scheduledStatuses.has(s)?s:action;
    const last=r.last_status_at||o.status_changed_at||r.status_changed_at||o.updated_at||r.updated_at||"";
    const age=intelligenceDaysSince(last);
    const scheduled=intelligenceDate(o.driver_scheduled_date||r.driver_scheduled_date||o.scheduled_date||r.scheduled_date);
    const paid=intelligenceOrderIsPaid(r);
    let reason="",level="تنبيه",ruleDate=last,ruleAge=age;
    if(waitingStatuses.has(s)&&age!==null&&age>=2){
      reason="الحالة لم تتغير بعد مرور يومين من آخر تغيير";
      level=age>3?"تحذير ⚠️":"تنبيه";
    }else if(scheduledStatuses.has(scheduledStatus)&&scheduled&&scheduled<today){
      const scheduledAge=intelligenceDaysSince(scheduled);
      if(scheduledAge!==null&&scheduledAge>=1){
        reason="مرّ يوم على التاريخ الذي حدده المستخدم ولم تتغير الحالة";
        level=scheduledAge>3?"تحذير ⚠️":"تنبيه";
        ruleDate=scheduled;ruleAge=scheduledAge;
      }
    }else if(completionStatuses.has(s)&&!paid&&age!==null&&age>=1){
      reason="الحالة لم تدخل Paid في اليوم التالي";
      level=age>3?"تحذير ⚠️":"تنبيه";
    }
    if(reason)overdue.push({r,reason,level,age:ruleAge,date:ruleDate});
  });
  area.innerHTML='<h3>مراقب الأوردرات</h3><p class="muted">قراءة فقط: لا يتم تغيير حالة أو رصيد تلقائيًا. يعتمد التنبيه على تاريخ آخر تغيير حالة أو التاريخ المحدد للتوصيل.</p>'+
  '<div class="stats-grid"><div class="stat-card"><span>التنبيهات</span><strong>'+overdue.length+'</strong></div><div class="stat-card"><span>تحذيرات ⚠️</span><strong>'+overdue.filter(x=>x.level.includes("تحذير")).length+'</strong></div><div class="stat-card"><span>أوردرات تمت مراجعتها</span><strong>'+rows.length+'</strong></div></div>'+
  '<div class="table-wrap"><table><thead><tr><th>الأوردر / التتبع</th><th>التاجر</th><th>الحالة</th><th>تاريخ الحالة/الموعد</th><th>العمر بالأيام</th><th>التنبيه</th></tr></thead><tbody>'+
  (overdue.map(x=>'<tr><td>'+esc(intelligenceOrderLabel(x.r))+'<small>'+esc(x.r.tracking_number||x.r.shipment_no||"")+'</small></td><td>'+esc(intelligenceMerchantLabel(x.r))+'</td><td>'+esc(x.r.current_status||x.r.order?.status||"—")+'</td><td>'+esc(intelligenceDate(x.date)||"—")+'</td><td>'+esc(x.age??"—")+'</td><td>'+esc(x.level+" — "+x.reason)+'</td></tr>').join("")||'<tr><td colspan="6">لا توجد تنبيهات وفق القواعد والبيانات المتاحة.</td></tr>')+'</tbody></table></div>';
}
function renderOrderDistributor(area,rows,drivers){
  window.__deliveryDistributorAllRows=rows||[];
  window.__deliveryDistributorDrivers=drivers||[];
  const includeAssigned=window.__deliveryDistributorShowAssigned===true;
  const eligible=(rows||[]).filter(r=>{const status=intelligenceStatus(r);return ["receive at hubs","receive at hub","in ops"].includes(status)||(includeAssigned&&status==="assigned with driver"&&Boolean(r.driver_id||r.driver?.id));}),groups=new Map();
  eligible.forEach(r=>{const reg=intelligenceRegion(r);if(!groups.has(reg.key))groups.set(reg.key,{...reg,rows:[]});groups.get(reg.key).rows.push(r);});
  const list=[...groups.values()].sort((a,b)=>a.governorate.localeCompare(b.governorate)||a.area.localeCompare(b.area));window.__deliveryDistributorAreaGroups=list;window.__deliveryDistributorGroups=list;
  area.innerHTML='<h3>موزّع الأوردرات</h3><p class="muted">المصدر الافتراضي: Receive at Hubs وIn Ops فقط. يتم تجميعها حسب الإمارة والمنطقة دون إسناد مندوب أو تعديل بيانات الأوردر.</p>'+
  '<div class="stats-grid"><div class="stat-card"><span>الأوردرات المؤهلة</span><strong>'+eligible.length+'</strong></div><div class="stat-card"><span>كشوف المناطق</span><strong>'+list.length+'</strong></div></div>'+
  '<label class="inline-check"><input type="checkbox" id="diIncludeAssigned" '+(includeAssigned?'checked':'')+' onchange="toggleDistributorAssigned(this.checked)"> تضمين الأوردرات المسندة بالفعل لنقلها لمندوب آخر</label><div class="form-grid"><label>الإمارة<select id="diGovFilter" onchange="filterDistributorGroups()"><option value="">كل الإمارات</option>'+[...new Set(list.map(x=>x.governorate))].map(g=>'<option>'+esc(g)+'</option>').join("")+'</select></label><label>بحث المنطقة<input id="diAreaFilter" oninput="filterDistributorGroups()" placeholder="اكتب اسم المنطقة"></label></div>'+
  '<div class="panel"><h4>عدد المندوبين لكل إمارة</h4><p class="muted">حدد العدد المطلوب؛ سيتم تجهيز كشوف مقترحة بتوزيع المناطق على العدد المحدد، دون إسناد تلقائي لأي مندوب.</p><div class="form-grid">'+[...new Set(list.map(x=>x.governorate))].map((g,i)=>'<label>'+esc(g)+'<input type="number" min="1" max="20" class="diDriverCount" data-governorate="'+esc(g)+'" value="1"></label>').join("")+'</div><button type="button" class="primary" onclick="buildDistributorDraftSheets()">تجهيز كشوف مقترحة</button><span id="diDraftSheetSummary" class="muted"></span></div>'+
  '<div class="table-wrap"><table id="diDistributorTable"><thead><tr><th>اختيار</th><th>الإمارة</th><th>المنطقة</th><th>عدد الأوردرات</th><th>أمثلة للأوردرات</th><th>الإجراء</th></tr></thead><tbody>'+
  (list.map((g,i)=>'<tr data-index="'+i+'" data-gov="'+esc(g.governorate)+'" data-area="'+esc(g.area.toLowerCase())+'"><td><input type="checkbox" class="diGroupCheck" data-index="'+i+'"></td><td>'+esc(g.governorate)+'</td><td>'+esc(g.area)+'</td><td>'+g.rows.length+'</td><td>'+esc(g.rows.slice(0,5).map(intelligenceOrderLabel).join(", ")+(g.rows.length>5?" …":""))+'</td><td><button type="button" class="ghost" onclick="viewDistributorGroup('+i+')">عرض الكشف</button></td></tr>').join("")||'<tr><td colspan="6">لا توجد أوردرات في الحالتين المحددتين.</td></tr>')+'</tbody></table></div>'+
  '<div class="actions"><button type="button" class="primary" onclick="viewSelectedDistributorGroups()">عرض الكشوفات المحددة</button><button type="button" class="ghost" onclick="exportSelectedDistributorGroups()">تصدير CSV</button></div><div id="diDistributorDetail"></div>';
}
function toggleDistributorAssigned(checked){window.__deliveryDistributorShowAssigned=Boolean(checked);const area=document.getElementById("deliveryIntelligenceWorkArea");if(area)renderOrderDistributor(area,window.__deliveryDistributorAllRows||[],window.__deliveryDistributorDrivers||[]);}
function filterDistributorGroups(){const gov=document.getElementById("diGovFilter")?.value||"",q=(document.getElementById("diAreaFilter")?.value||"").toLowerCase();document.querySelectorAll("#diDistributorTable tbody tr[data-gov]").forEach(tr=>{const govMismatch=!!gov&&tr.dataset.gov!==gov;const areaMismatch=!!q&&!tr.dataset.area.includes(q);tr.hidden=govMismatch||areaMismatch;});}
function buildDistributorDraftSheets(){
  const areas=window.__deliveryDistributorAreaGroups||[];
  const controls=[...document.querySelectorAll(".diDriverCount")];
  if(!areas.length){alert("لا توجد أوردرات مؤهلة لتجهيز الكشوف.");return;}
  const counts=new Map(controls.map(x=>[x.dataset.governorate,Math.max(1,Math.min(20,Math.floor(Number(x.value)||1)))]));
  const drafts=[];
  const emirates=[...new Set(areas.map(x=>x.governorate))];
  for(const governorate of emirates){
    const regionGroups=areas.filter(x=>x.governorate===governorate).slice().sort((a,b)=>b.rows.length-a.rows.length||a.area.localeCompare(b.area));
    const count=counts.get(governorate)||1;
    const buckets=Array.from({length:count},(_,i)=>({governorate,area:"كشف "+(i+1),key:governorate+" / كشف "+(i+1),rows:[],areaNames:[]}));
    for(const group of regionGroups){
      const bucket=buckets.reduce((best,item)=>!best||item.rows.length<best.rows.length?item:best,null);
      bucket.areaNames.push(group.area);
      bucket.rows.push(...group.rows.map(r=>({...r,__diRegion:group.area})));
    }
    buckets.forEach(bucket=>{if(bucket.rows.length){bucket.area= "كشف "+(drafts.filter(x=>x.governorate===governorate).length+1);bucket.key=governorate+" / "+bucket.area;drafts.push(bucket);}});
  }
  window.__deliveryDistributorGroups=drafts;
  const table=document.getElementById("diDistributorTable");
  if(!table)return;
  table.innerHTML='<thead><tr><th>اختيار</th><th>الإمارة</th><th>الكشف المقترح</th><th>المناطق</th><th>عدد الأوردرات</th><th>أمثلة للأوردرات</th><th>الإجراء</th></tr></thead><tbody>'+
    (drafts.map((g,i)=>'<tr data-index="'+i+'" data-gov="'+esc(g.governorate)+'" data-area="'+esc((g.areaNames||[]).join(" ").toLowerCase())+'"><td><input type="checkbox" class="diGroupCheck" data-index="'+i+'"></td><td>'+esc(g.governorate)+'</td><td>'+esc(g.area)+'</td><td>'+esc((g.areaNames||[]).join("، "))+'</td><td>'+g.rows.length+'</td><td>'+esc(g.rows.slice(0,5).map(intelligenceOrderLabel).join(", ")+(g.rows.length>5?" …":""))+'</td><td><button type="button" class="ghost" onclick="viewDistributorGroup('+i+')">عرض الكشف</button></td></tr>').join("")||'<tr><td colspan="7">لم يتم إنشاء كشوف؛ راجع عدد المندوبين والمناطق.</td></tr>')+'</tbody>';
  const summary=document.getElementById("diDraftSheetSummary");
  if(summary)summary.textContent=" — تم تجهيز "+drafts.length+" كشفًا مبدئيًا؛ لم يتم إسناد أي أوردر.";
  filterDistributorGroups();
}
function selectedDistributorGroups(){return [...document.querySelectorAll(".diGroupCheck:checked")].map(x=>window.__deliveryDistributorGroups?.[Number(x.dataset.index)]).filter(Boolean);}
function viewDistributorGroup(i){const g=window.__deliveryDistributorGroups?.[i];if(g)renderDistributorGroupDetail([g]);}
function viewSelectedDistributorGroups(){const groups=selectedDistributorGroups();if(!groups.length){alert("حدد كشف منطقة واحدًا على الأقل.");return;}renderDistributorGroupDetail(groups);}

function renderDistributorGroupDetail(groups){
  const box=document.getElementById("diDistributorDetail");if(!box)return;
  const rows=groups.flatMap(g=>g.rows.map(r=>({r:r,region:r.__diRegion?g.governorate+" / "+r.__diRegion:g.key})));
  window.__deliveryDistributorSheetRows=rows;
  window.__deliveryDistributorSelectedShipmentIds=rows.map(x=>x.r.id||x.r.shipment_id).filter(Boolean);
  const driverOptions=(window.__deliveryDistributorDrivers||[]).filter(d=>d.active!==false).map(d=>'<option value="'+esc(d.id)+'">'+esc((d.driver_no?d.driver_no+" — ":"")+(d.name||""))+'</option>').join("");
  box.innerHTML='<h4>تفاصيل الكشوفات المحددة ('+groups.length+')</h4><p class="muted">راجع الكشف، ثم اختر المندوب واضغط إسناد لإنشاء كشف توصيل. لن يتم الإسناد إلا بعد تأكيدك.</p>'+
    '<div class="form-grid"><label>المندوب<select id="diAssignDriver"><option value="">اختر المندوب</option>'+driverOptions+'</select></label><label>تاريخ الكشف<input id="diAssignDate" type="date" value="'+intelligenceToday()+'"></label></div>'+
    '<button type="button" class="primary" onclick="assignSelectedDistributorOrders()">إسناد / نقل الكشف للمندوب المحدد</button>'+
    '<div class="table-wrap"><table><thead><tr><th>ضم للكشف</th><th>الإمارة / المنطقة</th><th>رقم الأوردر</th><th>التتبع</th><th>التاجر</th><th>العميل</th><th>الهاتف</th><th>الحالة</th></tr></thead><tbody>'+
    rows.map((x,i)=>'<tr><td><input type="checkbox" class="diOrderIncluded" data-index="'+i+'" checked onchange="toggleDistributorOrder('+i+',this.checked)"></td><td>'+esc(x.region)+'</td><td>'+esc(x.r.order?.merchant_order_no||x.r.order?.order_code||"—")+'</td><td>'+esc(x.r.tracking_number||x.r.shipment_no||"—")+'</td><td>'+esc(intelligenceMerchantLabel(x.r))+'</td><td>'+esc(x.r.order?.customer_name||x.r.customer?.name||"—")+'</td><td>'+esc(x.r.order?.customer_phone||x.r.customer?.phone||"—")+'</td><td>'+esc(x.r.current_status||x.r.order?.status||"—")+'</td></tr>').join("")+
    '</tbody></table></div>';
}
function toggleDistributorOrder(index,checked){const rows=window.__deliveryDistributorSheetRows||[];const item=rows[Number(index)];if(!item)return;const id=item.r.id||item.r.shipment_id;const set=new Set(window.__deliveryDistributorSelectedShipmentIds||[]);if(checked&&id)set.add(id);else set.delete(id);window.__deliveryDistributorSelectedShipmentIds=[...set];}
async function assignSelectedDistributorOrders(){
  const ids=window.__deliveryDistributorSelectedShipmentIds||[];
  const selectedRows=(window.__deliveryDistributorSheetRows||[]).filter(x=>ids.includes(String(x.r.id||x.r.shipment_id)));
  const assignedRows=selectedRows.filter(x=>intelligenceStatus(x.r)==="assigned with driver"||Boolean(x.r.driver_id||x.r.driver?.id));
  if(assignedRows.length&&assignedRows.length!==selectedRows.length){alert("افصل الأوردرات المسندة بالفعل عن الأوردرات غير المسندة، ثم نفذ كل مجموعة على حدة.");return;}
  const isTransfer=selectedRows.length>0&&assignedRows.length===selectedRows.length;
  const driverId=document.getElementById("diAssignDriver")?.value||"";
  const jobDate=document.getElementById("diAssignDate")?.value||intelligenceToday();
  if(!ids.length){alert("لا توجد أوردرات محددة في الكشف.");return;}
  if(!driverId){alert("اختر المندوب أولًا.");return;}
  if(isTransfer&&selectedRows.some(x=>String(x.r.driver_id||x.r.driver?.id||"")===String(driverId))){alert("اختر مندوبًا مختلفًا عن المندوب الحالي.");return;}
  const action=isTransfer?"نقل":"إسناد";
  const confirmed=typeof showConfirmModal==="function"?await showConfirmModal("سيتم "+action+" "+ids.length+" أوردرًا إلى المندوب المحدد وإنشاء كشف جديد. هل تريد المتابعة؟"):confirm("سيتم "+action+" "+ids.length+" أوردرًا إلى المندوب المحدد. هل تريد المتابعة؟");
  if(!confirmed)return;
  try{
    const result=await api(isTransfer?"/api/delivery-intelligence/transfer":"/api/delivery-intelligence/assign",{method:"POST",body:JSON.stringify({shipment_ids:ids,driver_id:driverId,job_date:jobDate})});
    await openDeliveryIntelligenceTool("order_distributor");
    const workArea=document.getElementById("deliveryIntelligenceWorkArea");
    if(workArea){const notice=document.createElement("p");notice.className="success";notice.textContent="تم "+action+" الأوردرات في كشف "+String(result.data?.job_code||"")+" بنجاح.";workArea.prepend(notice);}
  }catch(e){alert(e.message||"تعذر إسناد أو نقل الأوردرات. حدّث البيانات وحاول مرة أخرى.");}
}

function exportSelectedDistributorGroups(){const groups=selectedDistributorGroups();if(!groups.length){alert("حدد كشف منطقة واحدًا على الأقل.");return;}const lines=[["Emirate","Area","Order No","Tracking","Merchant","Customer","Phone","Status"],...groups.flatMap(g=>g.rows.map(r=>[r.governorate?.name_ar||r.governorate?.name_en||g.governorate,r.__diRegion||r.area?.name_ar||r.area?.name_en||g.area,r.order?.merchant_order_no||r.order?.order_code||"",r.tracking_number||r.shipment_no||"",intelligenceMerchantLabel(r),r.order?.customer_name||r.customer?.name||"",r.order?.customer_phone||r.customer?.phone||"",r.current_status||r.order?.status||""]))];const csv="\uFEFF"+lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="delivery-region-sheets.csv";link.click();URL.revokeObjectURL(url);}
function renderAccountsMonitor(area,rows,data){
  data=data||{};
  const expenses=data.expenses||[],driverExpenses=data.driverExpenses||[],driverSettlements=data.driverSettlements||[];
  const merchantSettlements=data.merchantSettlements||[],merchantStatements=data.merchantStatements||[],commissions=data.commissions||[];
  const merchantStatementItems=data.merchantStatementItems||[],merchantStatementItemsAvailable=data.merchantStatementItemsAvailable===true;
  const accountEntries=data.driverAccountEntries||[],commissionEntries=accountEntries.filter(x=>String(x.transaction_type||x.type||x.entry_type||"").trim().toLowerCase()==="commission"&&String(x.account_type||"driver").trim().toLowerCase()==="driver");
  const commissionPayments=data.commissionPayments||[],adjustments=data.financialAdjustments||[];
  const completed=new Set(["replace","replaced","half deliverd","half delivered","cancelled by shipper","cancelled by reciver","cancelled by receiver","deliverd","delivered"]);
  const unpaid=rows.filter(r=>completed.has(intelligenceStatus(r))&&!intelligenceOrderIsPaid(r)&&(intelligenceDaysSince(r.last_status_at||r.order?.updated_at||r.updated_at)||0)>=1);
  const unpaidMerchantStatements=merchantStatements.filter(x=>String(x.status||'').trim().toLowerCase()!=='paid shipper');
  const amount=x=>Number(x?.amount??x?.signed_amount??x?.commission_amount??x?.commission_value??x?.delivery_fee??0)||0;
  const sum=list=>(list||[]).reduce((n,x)=>n+amount(x),0);
  const totalExpenses=sum(expenses),totalDriverExpenses=sum(driverExpenses),totalDriverSettlements=sum(driverSettlements),totalMerchantSettlements=sum(merchantSettlements);
  const totalCommissions=sum(commissionEntries),totalLegacyCommissions=sum(commissions),totalCommissionPayments=sum(commissionPayments),totalAdjustments=adjustments.reduce((n,x)=>n+Number(x.signed_amount??x.amount??0),0);
  const fmtDate=x=>intelligenceDate(x?.settlement_date||x?.transaction_date||x?.expense_date||x?.payment_date||x?.paid_at||x?.created_at)||"—";
  const statementItemsBySettlement=new Map();
  for(const item of merchantStatementItems){const sid=String(item.settlement_id||"");if(sid){if(!statementItemsBySettlement.has(sid))statementItemsBySettlement.set(sid,[]);statementItemsBySettlement.get(sid).push(item);}}
  const statementAudit=merchantStatementItemsAvailable?merchantStatements.map(record=>{const linked=statementItemsBySettlement.get(String(record.id||""))||[];const expectedCount=Number(record.order_count||0),actualCount=linked.length;const expectedCollection=Number(record.collection_amount||0);const actualCollection=Number(linked.reduce((n,item)=>n+Number(item.cod||0),0).toFixed(2));const issues=[];if(expectedCount!==actualCount)issues.push("عدد الأوردرات المسجل لا يطابق التفاصيل");if(Math.abs(expectedCollection-actualCollection)>0.01)issues.push("إجمالي COD المسجل لا يطابق تفاصيل الكشف");return {...record,expectedCount,actualCount,expectedCollection,actualCollection,issues};}).filter(record=>record.issues.length):[];
  const genericTable=(title,items,columns,empty)=>'<h4>'+title+' ('+items.length+')</h4><div class="table-wrap"><table><thead><tr>'+columns.map(c=>'<th>'+c[0]+'</th>').join("")+'</tr></thead><tbody>'+
    (items.slice(0,30).map(x=>'<tr>'+columns.map(c=>'<td>'+esc(c[1](x)??"—")+'</td>').join("")+'</tr>').join("")||'<tr><td colspan="'+columns.length+'">'+empty+'</td></tr>')+
    '</tbody></table></div>';
  area.innerHTML='<h3>مراقب الحسابات</h3><p class="muted">مراجعة للقراءة فقط من سجلات النظام. لا يتم تعديل الأرصدة أو إغلاق التسويات تلقائيًا. يعرض كل مصدر منفصلًا لتجنب جمع سجلات قد تكون متداخلة.</p>'+
  '<div class="stats-grid">'+
  '<div class="stat-card"><span>أوردرات مكتملة غير Paid ومتأخرة</span><strong>'+unpaid.length+'</strong></div>'+
  '<div class="stat-card"><span>رسوم توصيل الأوردرات المتأخرة</span><strong>'+esc(money(unpaid.reduce((n,r)=>n+intelligenceDeliveryFee(r),0)))+'</strong></div>'+
  '<div class="stat-card"><span>المصروفات المسجلة</span><strong>'+esc(money(totalExpenses))+'</strong></div>'+
  '<div class="stat-card"><span>مصروفات المندوبين</span><strong>'+esc(money(totalDriverExpenses))+'</strong></div>'+
  '<div class="stat-card"><span>تسويات المندوبين</span><strong>'+esc(money(totalDriverSettlements))+'</strong></div>'+
  '<div class="stat-card"><span>تسويات التجار</span><strong>'+esc(money(totalMerchantSettlements))+'</strong></div>'+
  '<div class="stat-card"><span>كشوف Invoice Report غير المدفوعة</span><strong>'+unpaidMerchantStatements.length+'</strong></div>'+
  '<div class="stat-card"><span>كشوف بها فروق</span><strong>'+statementAudit.length+'</strong></div>'+
  '<div class="stat-card"><span>عمولات حساب المندوب (type=commission)</span><strong>'+esc(money(totalCommissions))+'</strong></div><div class="stat-card"><span>سجلات جدول العمولات القديم</span><strong>'+esc(money(totalLegacyCommissions))+'</strong></div>'+
  '<div class="stat-card"><span>العمولات المدفوعة</span><strong>'+esc(money(totalCommissionPayments))+'</strong></div>'+
  '<div class="stat-card"><span>صافي التعديلات المالية المسجلة</span><strong>'+esc(money(totalAdjustments))+'</strong></div></div>'+
  genericTable("الأوردرات التي تحتاج مراجعة",unpaid,[["الأوردر",r=>intelligenceOrderLabel(r)],["التاجر",r=>intelligenceMerchantLabel(r)],["الحالة",r=>r.current_status||r.order?.status],["رسوم التوصيل",r=>money(intelligenceDeliveryFee(r))],["آخر تحديث",r=>fmtDate({created_at:r.last_status_at||r.order?.updated_at||r.updated_at})]],"لا توجد أوردرات متأخرة وفق البيانات المتاحة.")+
  genericTable("المصروفات",expenses,[["التاريخ",fmtDate],["الفئة",x=>x.category||x.expense_type],["المبلغ",x=>money(amount(x))],["ملاحظات",x=>x.notes||x.details]],"لا توجد مصروفات مسجلة.")+
  genericTable("مصروفات المندوبين",driverExpenses,[["التاريخ",fmtDate],["المندوب",x=>x.driver_name||x.driver_id],["الفئة",x=>x.category||x.expense_type],["المبلغ",x=>money(amount(x))],["ملاحظات",x=>x.notes||x.details]],"لا توجد مصروفات مندوبين مسجلة.")+
  genericTable("تسويات المندوبين",driverSettlements,[["التاريخ",fmtDate],["المندوب",x=>x.driver_name||x.driver_id],["طريقة الدفع",x=>x.payment_method],["المبلغ",x=>money(amount(x))],["ملاحظات",x=>x.notes]],"لا توجد تسويات مندوبين مسجلة.")+
  genericTable("تسويات التجار",merchantSettlements,[["التاريخ",fmtDate],["التاجر",x=>x.merchant_name||x.merchant_id],["طريقة الدفع",x=>x.payment_method],["المبلغ",x=>money(amount(x))],["ملاحظات",x=>x.notes]],"لا توجد تسويات تجار مسجلة.")+
  genericTable("فروق كشوف Invoice Report",statementAudit,[["رقم الكشف",x=>x.transaction_number],["التاجر",x=>x.merchant_name||x.merchant_id],["التاريخ",fmtDate],["الأوردرات (مسجل / فعلي)",x=>x.expectedCount+" / "+x.actualCount],["COD (مسجل / فعلي)",x=>money(x.expectedCollection)+" / "+money(x.actualCollection)],["سبب المراجعة",x=>x.issues.join("؛ ")]],merchantStatementItemsAvailable?"لا توجد فروق بين بيانات الكشف وتفاصيله.":"تعذر قراءة تفاصيل الكشوف؛ لا يمكن حساب الفروق.")+
  genericTable("كشوف Invoice Report",merchantStatements,[["التاريخ",fmtDate],["رقم الكشف",x=>x.transaction_number],["التاجر",x=>x.merchant_name||x.merchant_id],["عدد الأوردرات",x=>x.order_count],["إجمالي COD",x=>money(x.collection_amount)],["الحالة",x=>x.status]],"لا توجد كشوف تجار مولدة في Invoice Report.")+
  genericTable("عمولات حساب المندوب (transaction_type=commission)",commissionEntries,[["التاريخ",fmtDate],["المندوب",x=>x.driver_name||x.driver_id],["الشحنة",x=>x.shipment_id||x.order_code||x.order_id],["المبلغ",x=>money(amount(x))],["الاتجاه",x=>x.direction],["الوصف",x=>x.description]],"لا توجد قيود عمولة في معاملات حساب المندوب.")+
  genericTable("سجلات جدول العمولات القديم",commissions,[["التاريخ",fmtDate],["المندوب",x=>x.driver_name||x.driver_id],["الأوردر",x=>x.order_code||x.order_id],["العمولة",x=>money(amount(x))],["الحالة",x=>x.status||x.type]],"لا توجد سجلات في مصدر driver_commissions.")+
  genericTable("دفعات العمولات",commissionPayments,[["التاريخ",fmtDate],["المندوب",x=>x.driver_name||x.driver_id],["طريقة الدفع",x=>x.payment_method],["المبلغ",x=>money(amount(x))],["ملاحظات",x=>x.notes]],"لا توجد دفعات عمولات مسجلة.")+
  genericTable("التعديلات المالية للشركة",adjustments,[["التاريخ",fmtDate],["النوع",x=>x.type],["المبلغ الموقع",x=>money(Number(x.signed_amount??x.amount??0))],["المرجع",x=>x.reference],["السبب",x=>x.reason||x.description]],"لا توجد تعديلات مالية مسجلة.");
}

async function show(page){
  if(String(CURRENT_PAGE||"")!==String(page||""))playTrendWarningTone();
  document.getElementById('returnActionDialog')?.remove();
  document.getElementById('returnArchiveActionDialog')?.remove();
  document.getElementById('returnsBulkActionsDialog')?.remove();
  document.querySelectorAll('.return-timeline-dialog,.return-details-dialog').forEach(x=>x.remove());
  closeMobileSidebar();
  closeNavDropdowns();
  captureOperationsDashboardState();
  if(!canAccessPage(page)){
    const c=$("content");
    if(c)c.innerHTML=`<div class="panel"><span class="error">${esc(L("You do not have permission to open this page","ليس لديك صلاحية لفتح هذه الصفحة"))}</span></div>`;
    return;
  }
  CURRENT_PAGE=page;
  const nextUrl = `?page=${encodeURIComponent(page)}`;
  if (location.search !== nextUrl) history.pushState({page}, "", nextUrl);
  const c=$("content"); if(!c)return;
  c.innerHTML=`<section class="trend-page-loading" role="status" aria-live="polite">
    <div class="trend-loading-heading"><span class="trend-loading-spinner" aria-hidden="true"></span><span>${esc(L("Loading page data…","جاري تحميل بيانات الصفحة…"))}</span></div>
    <div class="trend-loading-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="trend-loading-skeleton trend-loading-skeleton-table" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
  </section>`;
  if(CHAT_TIMER){clearInterval(CHAT_TIMER);CHAT_TIMER=null;}
  try{
    if(page==="dashboard")await dashboardPage(c); else if(page==="operationsDashboard")await operationsDashboardPage(c); else if(page==="order")await orderPage(c); else if(page==="editOrder")await editOrderPage(c); else if(page==="booking")await bookingPage(c); else if(page==="orderImport")await orderExcelPage(c); else if(page==="search")searchPage(c); else if(page==="shipments")await shipmentsPage(c);
    else if(page==="jobs")await jobsPage(c); else if(page==="wantedCustomers")await wantedCustomersPage(c); else if(page==="scanDriver")await scanDriverPage(c); else if(page==="jobcode")await jobCodePage(c); else if(page==="returns")await returnsPage(c); else if(page==="returnArchive")await returnArchivePage(c); else if(page==="driverReturns")await driverReturnsPage(c); else if(page==="merchants")await merchantsPage(c);
    else if(page==="drivers")await driversPage(c); else if(page==="areas")await areasPage(c); else if(page==="accounting")await accountingPage(c); else if(page==="merchantFinancial")await merchantFinancialPage(c); else if(page==="companyFinancial")await companyFinancialPage(c); else if(page==="companyExpenses")await companyExpensesPage(c); else if(page==="dailyCompanyReport")await dailyCompanyReportPage(c); else if(page==="receivable")await receivablePage(c); else if(page==="settlementArchive")await settlementArchivePage(c); else if(page==="ordersVerification")await ordersVerificationPage(c); else if(page==="driverExpenses")await driverExpensesPage(c); else if(page==="adjustment")await adjustmentPage(c); else if(page==="driverCommission")await driverCommissionPage(c); else if(page==="employeeWages")await employeeWagesPage(c);
    else if(page==="audit")await auditPage(c); else if(page==="settings")await settingsPage(c); else if(page==="backupRestore")await backupRestorePage(c); else if(page==="liveMap")await liveDriversMapPage(c); else if(page==="adminTools")await adminToolsPage(c); else if(page==="deliveryIntelligence")await deliveryIntelligencePage(c); else if(page==="employees")await employeesPage(c); else if(page==="chat")await chatPage(c); else c.innerHTML=`<div class="panel error">${esc(L("Page not found","الصفحة غير موجودة"))}</div>`;
    applyLanguage();
  }catch(e){console.error(e);c.innerHTML=`<div class="panel"><span class="error">${esc(e.message)}</span></div>`;}
}

// Expose the navigation API explicitly for legacy inline handlers elsewhere in the UI.
window.show = show;
// Backward compatibility for older cached UI handlers. Some previously deployed
// builds used a localized page-navigation identifier; keep it callable so an
// old cached button cannot break Orders Verification navigation.
window["page"] = show;
window["صفحة"] = show;



/* ===== FRONTEND MODULE BOUNDARY ===== */

function stat(label,n){return `<div class="stat"><span>${esc(label)}</span><b>${esc(n)}</b></div>`;}
function driversTodayStat(label, drivers){
  const rows=Array.isArray(drivers)?drivers:[];
  window.__dashboardDriversToday=rows;
  return `<div class="stat drivers-today-stat"><div class="drivers-today-stat-head"><span>${esc(label)}</span><button type="button" class="drivers-today-toggle" aria-label="${esc(L("Show today's drivers","عرض مندوبي اليوم"))}" aria-expanded="false" title="${esc(L("Show today's drivers","عرض مندوبي اليوم"))}" onclick="toggleDriversTodayMenu(event)"><span aria-hidden="true">☷</span></button></div><b>${rows.length}</b><div id="driversTodayDropdown" class="drivers-today-dropdown" hidden></div></div>`;
}
function toggleDriversTodayMenu(event){
  event?.stopPropagation?.();
  const statBox=document.querySelector('.drivers-today-stat');
  const menu=document.getElementById('driversTodayDropdown');
  const button=statBox?.querySelector('.drivers-today-toggle');
  if(!statBox||!menu||!button)return;
  const opening=menu.hidden;
  document.querySelectorAll('#driversTodayDropdown').forEach(el=>{el.hidden=true;});
  document.querySelectorAll('.drivers-today-toggle').forEach(el=>el.setAttribute('aria-expanded','false'));
  if(!opening)return;
  const rows=Array.isArray(window.__dashboardDriversToday)?window.__dashboardDriversToday:[];
  menu.innerHTML=rows.length?`<div class="drivers-today-dropdown-title">${esc(L("Today's drivers","مندوبي اليوم"))}</div>${rows.map(driver=>`<div class="drivers-today-row"><span>${esc(driver.name||L("Unnamed driver","مندوب بدون اسم"))}</span><b>${esc(driver.driver_no||driver.driver_code||driver.code||"—")}</b></div>`).join('')}`:`<div class="drivers-today-empty">${esc(L("No drivers working today","لا يوجد مندوبون لديهم شغل اليوم"))}</div>`;
  menu.hidden=false;button.setAttribute('aria-expanded','true');
  document.addEventListener('click',function closeDriversTodayMenu(){menu.hidden=true;button.setAttribute('aria-expanded','false');},{once:true});
}
function hideUnwantedDashboardShipperLogin(root){
  if(!root)return;
  const knownSelectors=['.merchant-portal-login','.shipper-portal-login','#merchantPortalLogin','#shipperPortalLogin','#merchantLoginPanel','#shipperLoginPanel','[data-section="merchant-login"]','[data-section="shipper-login"]'];
  root.querySelectorAll(knownSelectors.join(',')).forEach(el=>el.remove());
  // Older hosted builds may inject this panel with no stable class/id. Only remove a
  // dashboard panel whose own heading explicitly says trader/shipper login and has credential fields.
  root.querySelectorAll('.panel,section,form,article').forEach(el=>{
    if(!el.isConnected||el.closest('#sidebar'))return;
    const heading=el.querySelector('h1,h2,h3,h4,legend,.section-title,.panel-title');
    const title=String(heading?.textContent||'').trim().toLowerCase();
    if(!/(تسجيل الدخول للتاجر|دخول التاجر|shipper login|merchant login|trader login)/i.test(title))return;
    if(el.querySelector('input[type="password"],input[autocomplete="username"],input[name*="username" i]'))el.remove();
  });
}

async function dashboardPage(c){
  // Render the useful dashboard shell immediately; load counters in the background
  // so a slow database request does not leave the whole page blank/loading.
  c.innerHTML=`<div class="dashboard-heading-row"><h2>${L("Dashboard","لوحة التحكم")}</h2><label class="dashboard-date-filter"><span class="dashboard-date-icon" aria-hidden="true">📅</span><span>${L("Select date","اختيار التاريخ")}</span><input id="dashboardDate" type="date" value="${today()}" aria-label="${L("Select dashboard date","اختيار تاريخ لوحة التحكم")}"></label></div>
    <div class="dashboard-stats grid" id="dashboardStats">${stat(L("Orders Today","أوردرات اليوم"),"…")}${stat(L("Shipments with Drivers","الشحنات مع المناديب"),"…")}${driversTodayStat(L("Drivers Today","السائقون اليوم"),[])}${stat(L("Shippers","التجار"),"…")}${stat(L("Paid Orders","الأوردرات المدفوعة"),"…")}${stat(L("Cancelled Today","الملغي اليوم"),"…")}${stat(L("Assigned with Driver","قيد التنفيذ"),"…")}</div>
    <div class="panel dashboard-quick-search-card search-workspace-card">
      <div class="search-hero search-hero-quick"><div class="search-hero-icon">⌕</div><div><span class="search-eyebrow">TREND DELIVERY / LOOKUP</span><h3>${t("Quick Search")}</h3><p>${L("Find an order and open its full movement history.","ابحث عن أوردر وافتح سجل حركاته بالكامل.")}</p></div><span class="search-hero-pill">${L("Fast lookup","بحث سريع")}</span></div>
      <div class="search-input-shell quick-search-controls"><span class="search-input-icon">⌕</span><input id="quickSearch" aria-label="${esc(t("Quick Search"))}" placeholder="${esc(L("Shipment number, tracking, customer name or phone…","رقم الشحنة أو التتبع أو اسم العميل أو الهاتف…"))}"><button onclick="quickSearch()"><span>⌕</span> ${t("Search")}</button></div>
      <div id="quickLookupSummary" class="quick-lookup-summary" aria-live="polite"></div>
      <div class="search-recent-row"><div class="search-section-heading"><span class="search-section-icon navy">◷</span><b>${L("Recent Searches","عمليات البحث الأخيرة")}</b></div><div id="quickRecentSearches" class="search-recent-chips"></div><button type="button" class="search-clear-recent" onclick="clearRecentSearches('quickSearch')">${L("Clear All","مسح الكل")}</button></div>
      <div class="search-hint-row"><span class="search-hint-dot"></span>${L("Tip: enter an exact tracking or shipment number for the fastest result.","نصيحة: أدخل رقم التتبع أو الشحنة للحصول على أسرع نتيجة.")}</div>
      <div class="quick-search-layout">
        <div class="quick-search-result-column"><div class="search-section-heading"><span class="search-section-icon blue">▤</span><b>${L("Search Results","نتائج البحث")}</b><span class="search-section-note">${L("Matching orders","الأوردرات المطابقة")}</span></div><div id="quickResult"></div></div>
        <div class="search-timeline-column"><div class="search-section-heading"><span class="search-section-icon violet">◷</span><b>${L("Order Timeline","سجل حركة الأوردر")}</b></div><div id="quickTimeline" class="quick-search-timeline-empty"><span class="muted">${L("Search for an order to view its timeline here.","ابحث عن أوردر لعرض الـ Timeline هنا.")}</span></div></div>
      </div>
    </div>`;
  hideUnwantedDashboardShipperLogin(c);
  renderRecentSearches("quickSearch");
  $("quickSearch")?.addEventListener("keydown",e=>{if(e.key==='Enter'){e.preventDefault();quickSearch();}});
  const loadDashboardCounters=async()=>{
    const selectedDate=$("dashboardDate")?.value||today();
    try{
      const d=await api("/api/dashboard?date="+encodeURIComponent(selectedDate));
      const x=d.data?.counts||{};
      const stats=$("dashboardStats");
      if(stats)stats.innerHTML=`${stat(L("Orders on Selected Date","أوردرات التاريخ المحدد"),x.orders||0)}${stat(L("Shipments with Drivers","الشحنات مع المناديب"),x.shipments||0)}${driversTodayStat(L("Drivers with Shipments","المناديب اللي معاهم شحنات"),x.driversToday)}${stat(L("Shippers","التجار"),x.merchants||0)}${stat(L("Paid Orders","الأوردرات المدفوعة"),x.delivered||0)}${stat(L("Cancelled on Selected Date","الملغي في التاريخ المحدد"),x.cancelled||0)}${stat(L("Assigned with Driver","قيد التنفيذ"),x.pending||0)}`;
    }catch(e){
      const stats=$("dashboardStats");
      if(stats)stats.insertAdjacentHTML("beforeend",`<div class="dashboard-load-error muted">${esc(L("Dashboard counters could not be loaded. Refresh to try again.","تعذر تحميل أرقام لوحة التحكم. حدّث الصفحة للمحاولة مرة أخرى."))}</div>`);
      console.warn("Dashboard counters failed:",e.message);
    }
  };
  $("dashboardDate")?.addEventListener("change",()=>{void loadDashboardCounters();});
  await loadDashboardCounters();
}

function renderSearchMovementTimeline(x, containerId){
  const timeline=$(containerId); if(!timeline)return;
  const shipmentId=x?.shipment?.id||x?.shipment_id||((x?.tracking_number||x?.shipment_no||x?.job_code)?x?.id:null);
  const history=[...(x?.history||[]),...(x?.audit||[]).filter(r=>r.history_type!=="status")]
    .sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const rows=history.map((r,i)=>{
    const raw=String(r.status||r.action||r.event_type||L("Updated","تحديث"));
    const details=typeof r.details==="object"?JSON.stringify(r.details):String(r.details||"");
    const note=String(r.note||r.notes||r.comment||r.reason||details||"");
    const actor=r.user_name||r.employee_name||r.updated_by_name||r.employee_code||"System";
    const when=(r.created_at||"").replace("T"," ").slice(0,16);
    const all=(raw+" "+note+" "+details).toLowerCase();
    let action=movementHistoryLabel(raw).replace(/^status changed to\s*/i,"").replace(/^changed status to\s*/i,"").trim();
    if(/order placed|created order|order created/.test(all)) action=L("Order Placed","تم إنشاء الأوردر");
    else if(/deliver(ed|y)/.test(all)&&!/fee|price|charge/.test(all)) action=L("Delivered","تم التسليم");
    else if((()=>{
      // Only classify a timeline item as a price change when the event itself
      // explicitly names a price-related change, or the details contain paired
      // structured old/new price values. Words elsewhere in comments/notes must
      // not turn an unrelated event into a false price-change record.
      const explicitRaw=/\b(price|cod|service charge|delivery fee|amount)\b.{0,35}\b(change|changed|update|updated|edit|edited)\b|\b(change|changed|update|updated|edit|edited)\b.{0,35}\b(price|cod|service charge|delivery fee|amount)\b|تغيير.{0,25}(السعر|المبلغ)|تعديل.{0,25}(السعر|المبلغ)/i.test(raw);
      const structured=typeof r.details==='object'&&r.details!==null&&(
        (['old_price','new_price'], 'old_price' in r.details && 'new_price' in r.details) ||
        ('old_value' in r.details && 'new_value' in r.details && /price|cod|amount/i.test(String(r.details.field||r.details.column||r.details.attribute||'')))
      );
      return explicitRaw||structured;
    })()) {
      const structuredDetails=typeof r.details==='object'&&r.details!==null?r.details:{};
      const oldNew=structuredDetails.old_price!==undefined&&structuredDetails.new_price!==undefined?[structuredDetails.old_price,structuredDetails.new_price]:null;
      const nums=oldNew||((note+" "+details).match(/(?:AED\s*)?\d+(?:[.,]\d+)?/g)||[]);
      action=nums.length>=2?`${L("Price changed","تغيير السعر")} ${nums[0]} → ${nums[1]}`:L("Price updated","تم تعديل السعر");
    } else if(/cancel/.test(all)) action=L("Cancelled","تم الإلغاء");
    else if(/comment/.test(all)) action=L("Comment","تعليق");
    else if(/status changed to/.test(raw.toLowerCase())) action=raw.replace(/status changed to/i,L("Status:","الحالة:")).trim();
    return `<div class="shipment-timeline-item ${i===history.length-1?'current':''}"><span class="shipment-timeline-dot"></span><div class="shipment-timeline-content"><span class="shipment-timeline-action">${esc(action)} <span class="shipment-timeline-by">${L("by","بواسطة")} ${esc(actor)}</span></span><time>${esc(when)}</time></div></div>`;
  }).join("");
  timeline.className="quick-search-timeline shipment-timeline-panel compact-search-history";
  timeline.innerHTML=`<div class="shipment-timeline">${rows||`<p class="muted">${L("No timeline history found.","لا يوجد سجل حركات مسجل لهذا الأوردر.")}</p>`}</div>
    ${shipmentId?`<div class="search-history-comment"><label for="${containerId}Comment">${L("Comment","تعليق")}</label><textarea id="${containerId}Comment" placeholder="${L("Write a comment…","اكتب تعليقك هنا…")}"></textarea><div class="search-history-comment-actions"><button type="button" onclick="saveSearchHistoryComment('${esc(shipmentId)}','${containerId}')">${L("Save comment","حفظ التعليق")}</button><span class="muted" aria-live="polite"></span></div></div>`:""}`;
}
async function saveSearchHistoryComment(shipmentId, containerId){
  const box=$(containerId);const field=$(containerId+"Comment");const message=box?.querySelector(".search-history-comment-actions .muted");
  const comment=String(field?.value||"").trim();
  if(!comment){if(message)message.textContent=L("Write a comment first.","اكتب التعليق أولًا.");return;}
  const button=box?.querySelector("button");if(button)button.disabled=true;
  try{
    await api(`/api/shipments/${encodeURIComponent(shipmentId)}/comments`,{method:"POST",body:JSON.stringify({comment})});
    if(message)message.textContent=L("Comment saved.","تم حفظ التعليق.");
    const input=$(containerId==="quickTimeline"?"quickSearch":"searchQ");
    const q=input?.value.trim();
    if(q){const d=await api("/api/search?q="+encodeURIComponent(q));const rs=Array.isArray(d?.results)?d.results:(d?.data?[d.data]:[]);if(rs.length===1)renderSearchMovementTimeline(rs[0],containerId);}
  }catch(e){if(message)message.textContent=e.message||L("Could not save comment.","تعذر حفظ التعليق.");if(button)button.disabled=false;}
}

window.__searchPayloads = window.__searchPayloads || {};
function selectSearchOrder(scope,index){
  const payload=window.__searchPayloads[scope];
  const results=Array.isArray(payload?.results)?payload.results:(payload?.data?[payload.data]:[]);
  const chosen=results[Number(index)];
  if(!chosen)return;
  const resultId=scope==="quick"?"quickResult":"searchResult";
  const timelineId=scope==="quick"?"quickTimeline":"searchTimeline";
  const detailPayload={...payload,results:[chosen],data:chosen};
  const resultBox=$(resultId); if(resultBox)resultBox.innerHTML=renderSearch(detailPayload);
  renderLookupSummary(detailPayload,scope==="quick"?"quickLookupSummary":"searchLookupSummary");
  renderSearchMovementTimeline(chosen,timelineId);
}

function renderLookupSummary(data, containerId){
  const box=$(containerId); if(!box)return;
  const results=Array.isArray(data?.results)?data.results:(data?.data?[data.data]:[]);
  if(!results.length){box.innerHTML='';box.classList.remove('has-summary');return;}
  const x=results.length===1?results[0]:null;
  if(!x){box.innerHTML=`<div class="lookup-status-strip"><span>${L('Matching orders','أوردرات مطابقة')}: <b>${results.length}</b></span><span>${L('Choose an order to view its status and scan details','اختر أوردر لعرض حالته وبيانات المسح')}</span></div>`;box.classList.add('has-summary');return;}
  const o=x.order||x;
  const primaryStatus=x.primary_status||x.original_status||x.invoice_status||x.return_transaction?.original_status||o.original_status||o.invoice_status||o.status||x.status||x.current_status||x.shipment?.status||'—';
  const secondaryStatus=x.secondary_status||x.sub_status||x.substatus||x.return_status||o.secondary_status||o.sub_status||o.substatus||o.return_status||'';
  const currentStatus=x.status||x.current_status||x.shipment?.status||o.status||primaryStatus;
  const statusClass=searchStatusClass(currentStatus);
  const paid=String(o.commission_paid_status||o.paid_status||o.cash_collection_status||o.payment_status||'').toLowerCase()==='paid';
  box.innerHTML=`<section class="lookup-status-strip"><div class="lookup-status-stack"><div class="lookup-status-line"><span class="lookup-status-label">${L('Primary order status','الحالة الأساسية')}</span><span class="lookup-status-value ${searchStatusClass(primaryStatus)}">${esc(primaryStatus||'—')}</span></div><div class="lookup-status-line"><span class="lookup-status-label">${L('Secondary order status','الحالة الفرعية')}</span><span class="lookup-status-value ${searchStatusClass(secondaryStatus)}">${esc(secondaryStatus||'—')}</span></div></div>${paid?`<div class="lookup-payment-status"><div class="lookup-status-label">${L('Payment status','حالة الدفع')}</div><div class="lookup-status-value"><span class="verify-badge paid-pill">Paid</span></div></div>`:''}</section>`;
  box.classList.add('has-summary');
}

async function quickSearch(){
  const q=$("quickSearch")?.value.trim();
  if(!q)return msg("quickResult",L("Enter a search value","اكتب قيمة البحث"),"error");
  rememberSearchQuery("quickSearch",q); renderRecentSearches("quickSearch");
  try{
    const data=await api("/api/search?q="+encodeURIComponent(q));
    const results=Array.isArray(data?.results)?data.results:(data?.data?[data.data]:[]);
    window.__searchPayloads.quick=data; window.__activeSearchScope="quick";
    $("quickResult").innerHTML=renderSearch(data);
    renderLookupSummary(data,"quickLookupSummary");
    const timeline=$("quickTimeline");
    if(results.length===1)renderSearchMovementTimeline(results[0],"quickTimeline");
    else if(timeline){timeline.className="quick-search-timeline-empty";timeline.innerHTML=`<span class="muted">${results.length?L("Choose one exact order to view its timeline.","اختر الأوردر المطلوب لعرض سجل الحركات."):L("No order found.","لم يتم العثور على الأوردر.")}</span>`;}
  }catch(e){msg("quickResult",e.message,"error");}
}


async function mountNewOrderForm(c, merchants, govs, areas, serialNo, jobCode){
  c.innerHTML=orderFormHtml(serialNo,merchants,govs,areas,null,"shipments",jobCode);
  bindOrderSaveButton(false);
  $("merchant")?.addEventListener("change",()=>{syncSearchSelectLabel("merchant");loadMerchantFee();});
  await setupOrderForm(areas,govs);
  wireOrderDuplicateCheck();
  wireWantedCustomerWarning();
  setupSearchSelect("merchant",merchants,"merchantSearch", "merchantOptions", x=>merchantLabel(x));
  setupSearchSelect("gov",govs,"govSearch", "govOptions", x=>L(x.name_en,x.name_ar));
  updateShipperPhoneInline();
  $("merchant")?.addEventListener("change",updateShipperPhoneInline);
  loadMerchantFee();
}
async function orderPage(c){
  const [m,g,a,s,j]=await Promise.all([api("/api/merchants"),api("/api/governorates"),api("/api/areas"),api("/api/order/next-serial"),api("/api/order/next-job-code")]);
  const merchants=m.data||[],govs=g.data||[],areas=a.data||[];
  // Reuse lookup data when adding consecutive orders; do not fetch all lists after every save.
  window.__orderEntryCache={merchants,govs,areas};
  await mountNewOrderForm(c,merchants,govs,areas,s.next??s.serial??1,j.next??1);
}
async function editOrderPage(c){
  c.innerHTML=`<h2>${L("Edit Order","تعديل الأوردر")}</h2><div class="panel edit-order-picker-panel">
    <div class="row"><input id="editOrderSearch" inputmode="numeric" placeholder="${esc(L("Exact number or digits contained in it","نفس الرقم أو أرقام منه متصلة"))}"><button onclick="searchOrdersForEdit()">${L("Search","بحث")}</button></div>
    <div id="editOrderPickerResults" class="msg"></div>
  </div>`;
  $("editOrderSearch")?.addEventListener("keydown",e=>{if(e.key==='Enter'){e.preventDefault();searchOrdersForEdit();}});
}
async function searchOrdersForEdit(){
  const q=$("editOrderSearch")?.value.trim();
  if(!q)return msg("editOrderPickerResults",L("Enter a search value","اكتب قيمة البحث"),"error");
  try{
    const d=await api('/api/search?q='+encodeURIComponent(q)+'&mode=edit');
    const rows=Array.isArray(d.results)?d.results:(d.data?[d.data]:[]);
    const box=$("editOrderPickerResults"); if(!box)return;
    if(!rows.length){box.innerHTML=`<div class="msg error">${L("No order found","لم يتم العثور على الأوردر")}</div>`;return;}
    const x=rows[0],o=x.order||x,id=o.id||x.order_id||x.id;
    if(!id){msg("editOrderPickerResults",L("No editable order found","لا يوجد أوردر قابل للتعديل"),"error");return;}
    await openOrder(id,"editOrder");
  }catch(e){msg("editOrderPickerResults",e.message,"error");}
}

function normalizeCustomerPhone(value){
  return String(value||'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g,'');
}
let wantedCustomerCache=null;
async function getWantedCustomerCache(force=false){
  if(!force&&Array.isArray(wantedCustomerCache))return wantedCustomerCache;
  const d=await api('/api/wanted-customers');wantedCustomerCache=Array.isArray(d.data)?d.data:[];return wantedCustomerCache;
}
function wireWantedCustomerWarning(){
  const fields=[$('customer_phone'),$('customer_phone_2')].filter(Boolean),box=$('wantedCustomerOrderWarning');
  if(!fields.length||!box)return;
  let timer=null;
  const check=async()=>{
    const nums=[...new Set(fields.map(x=>normalizeCustomerPhone(x.value)).filter(Boolean))];
    if(!nums.length){box.hidden=true;box.innerHTML='';return;}
    try{
      const rows=await getWantedCustomerCache();
      const hits=rows.filter(r=>nums.includes(String(r.phone_normalized||normalizeCustomerPhone(r.phone))));
      if(!hits.length){box.hidden=true;box.innerHTML='';return;}
      box.hidden=false;box.innerHTML=`<strong>⚠️ ${L('Warning: customer is on the wanted list','تحذير: العميل موجود في قائمة المطلوبين')}</strong>${hits.map(r=>`<div>${esc(r.phone)} — ${esc(r.reason||'')}</div>`).join('')}<small>${L('This is a warning only. You can still save the order.','هذا تحذير فقط، ويمكنك حفظ الأوردر بشكل طبيعي.')}</small>`;
    }catch(_){box.hidden=true;box.innerHTML='';}
  };
  fields.forEach(el=>el.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(check,180);}));
  check();
}
async function wantedCustomersPage(c){
  c.innerHTML=`<h2>${L('Wanted Customers','قائمة المطلوبين')}</h2><div class="panel wanted-customer-panel"><p class="muted">${L('Add customer phone numbers and a reason. Matching numbers show a warning when entering an order; saving orders is never blocked.','أضف رقم العميل والسبب. عند إدخال الرقم في أوردر يظهر تحذير فقط ولا يتم منع الحفظ.')}</p>
  <form id="wantedCustomerForm" class="wanted-customer-form"><input id="wantedCustomerId" type="hidden"><label>${L('Customer phone number','رقم العميل')}<input id="wantedCustomerPhone" inputmode="tel" required placeholder="01xxxxxxxxx"></label><label>${L('Reason','السبب')}<input id="wantedCustomerReason" required maxlength="500" placeholder="${L('Reason for warning','سبب التحذير')}"></label><div class="actions"><button type="submit" id="wantedCustomerSave">${L('Add to list','إضافة للقائمة')}</button><button type="button" class="ghost" id="wantedCustomerCancel" hidden>${L('Cancel edit','إلغاء التعديل')}</button></div></form><div id="wantedCustomerMsg" class="msg" role="status"></div><div id="wantedCustomerRows" class="table-wrap"><p class="muted">${L('Loading…','جاري التحميل…')}</p></div></div>`;
  const form=$('wantedCustomerForm');
  const reset=()=>{$('wantedCustomerId').value='';$('wantedCustomerPhone').value='';$('wantedCustomerReason').value='';$('wantedCustomerSave').textContent=L('Add to list','إضافة للقائمة');$('wantedCustomerCancel').hidden=true;};
  $('wantedCustomerCancel').addEventListener('click',reset);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const id=$('wantedCustomerId').value,phone=$('wantedCustomerPhone').value.trim(),reason=$('wantedCustomerReason').value.trim();
    if(!normalizeCustomerPhone(phone))return msg('wantedCustomerMsg',L('Enter a valid customer phone number','أدخل رقم هاتف صحيحًا'),'error');
    if(!reason)return msg('wantedCustomerMsg',L('Enter the reason','اكتب السبب'),'error');
    try{await api(id?`/api/wanted-customers/${encodeURIComponent(id)}`:'/api/wanted-customers',{method:id?'PATCH':'POST',body:JSON.stringify({phone,reason})});wantedCustomerCache=null;reset();msg('wantedCustomerMsg',L('Saved successfully','تم الحفظ بنجاح'),'ok');await renderWantedCustomerRows();}
    catch(err){msg('wantedCustomerMsg',err.message,'error');}
  });
  await renderWantedCustomerRows();
}
async function renderWantedCustomerRows(){
  const box=$('wantedCustomerRows');if(!box)return;
  try{const rows=await getWantedCustomerCache(true);box.innerHTML=rows.length?`<table class="wanted-customer-table"><thead><tr><th>${L('Customer phone','رقم العميل')}</th><th>${L('Reason','السبب')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.phone)}</td><td>${esc(r.reason)}</td><td><div class="actions"><button type="button" class="ghost" data-wanted-edit="${esc(r.id)}">✎ ${L('Edit','تعديل')}</button><button type="button" class="danger" data-wanted-delete="${esc(r.id)}" aria-label="${L('Delete','حذف')}" title="${L('Delete','حذف')}">×</button></div></td></tr>`).join('')}</tbody></table>`:`<p class="muted">${L('No customers on the list yet.','لا يوجد عملاء في القائمة حتى الآن.')}</p>`;
    box.querySelectorAll('[data-wanted-edit]').forEach(btn=>btn.addEventListener('click',()=>{const r=rows.find(x=>String(x.id)===btn.dataset.wantedEdit);if(!r)return;$('wantedCustomerId').value=r.id;$('wantedCustomerPhone').value=r.phone;$('wantedCustomerReason').value=r.reason;$('wantedCustomerSave').textContent=L('Save changes','حفظ التعديلات');$('wantedCustomerCancel').hidden=false;$('wantedCustomerPhone').focus();}));
    box.querySelectorAll('[data-wanted-delete]').forEach(btn=>btn.addEventListener('click',async()=>{const r=rows.find(x=>String(x.id)===btn.dataset.wantedDelete);if(!r||!await showConfirmModal(L(`Delete ${r.phone} from wanted list?`,`هل تريد حذف الرقم ${r.phone} من قائمة المطلوبين؟`)))return;try{await api(`/api/wanted-customers/${encodeURIComponent(r.id)}`,{method:'DELETE'});wantedCustomerCache=null;await renderWantedCustomerRows();msg('wantedCustomerMsg',L('Deleted successfully','تم الحذف بنجاح'),'ok');}catch(err){msg('wantedCustomerMsg',err.message,'error');}}));
  }catch(err){box.innerHTML=`<p class="error">${esc(err.message)}</p>`;}
}

function orderFormHtml(next,merchants,govs,areas,order,returnPage="shipments",jobNext=1){
  const o=order||{};
  // Resolve legacy order location from order fields, shipment fields, or the saved area name.
  const savedAreaId=o.area_id||o.shipment?.area_id||o.area?.id||"";
  const savedAreaName=String(o.area_name||o.area?.name_en||o.area?.name_ar||o.shipment?.area_name||"").trim().toLowerCase();
  const areaForGov=areas.find(x=>savedAreaId&&String(x.id)===String(savedAreaId))
    ||(savedAreaName?areas.find(x=>[x.name_en,x.name_ar].some(n=>String(n||"").trim().toLowerCase()===savedAreaName)):null);
  const selectedGov=areaForGov?.governorate_id||o.governorate_id||o.shipment?.governorate_id||"";
  // Never hide the order's saved area merely because old emirate data is missing or inconsistent.
  const filteredAreas=areas.filter(x=>!selectedGov||String(x.governorate_id)===String(selectedGov)||String(x.id)===String(areaForGov?.id||savedAreaId));
  const tracking=o.shipment?.tracking_number||o.tracking_number||"";
  const selectedArea=filteredAreas.find(x=>String(x.id)===String(savedAreaId))||areaForGov;
  const selectedMerchant=merchants.find(x=>String(x.id)===String(o.merchant_id));
  const selectedGovObj=govs.find(x=>String(x.id)===String(selectedGov));
  const selectedGovName=selectedGovObj?L(selectedGovObj.name_en,selectedGovObj.name_ar):String(o.governorate_name_en||o.governorate_name||o.governorate?.name_en||o.governorate?.name_ar||"");
  const orderPaid=Boolean(order && (String(o.cash_collection_status||o.paid_status||"").toLowerCase()==="paid" || String(o.commission_paid_status||"").toLowerCase()==="paid"));
  return `<div class="order-entry-page"><h2>${esc(order?t("Edit Order"):L("New Order","إدخال أوردر"))}</h2>${orderPaid?`<div class="panel paid-lock-notice">🔒 ${esc(L("This order is Paid and cannot be edited.","هذا الأوردر تم تحصيله Paid ولا يمكن تعديله."))}</div>`:""}
  <div class="panel order-entry-panel"><div class="order-edit-grid">
    ${order?`<input id="edit_order_id" type="hidden" value="${esc(o.id)}"><input id="edit_return_page" type="hidden" value="${esc(returnPage)}">`:``}
    <div class="order-top-meta"><label class="job-field">${L("Job Code","Job Code")}<input id="job_code" tabindex="-1" type="text" inputmode="numeric" value="${esc(o.shipment?.job_code||o.job_code||(!order?jobNext:""))}"><small class="muted">${order?L("Editable","قابل للتعديل"):L("Generated automatically","يتم توليده تلقائيًا")}</small></label>
    <label class="order-no-field">${L("Order Number","رقم الأوردر")}<input id="merchant_order_no" tabindex="1" value="${esc(o.merchant_order_no||"")}" placeholder="${esc(L("Coupon / Order Number","رقم الكوبون / الأوردر"))}" required></label>
    <label class="reference-field">${L("Reference Number","رقم المرجع")}<input id="reference_number" tabindex="-1" value="${esc(o.reference_number||"")}" placeholder="${esc(L("Optional","اختياري"))}"></label>
    <label class="order-date-field">${L("Date","التاريخ")}<input id="order_entry_date" type="date" value="${esc(String(o.serial_date||o.created_at||today()).slice(0,10))}" ${order?'readonly title="'+L("Original order date","تاريخ الأوردر الأصلي")+'"':''}></label></div>
    <input id="shipment_no" type="hidden" value="${esc(o.shipment?.shipment_no||o.shipment_no||"")}">

    <label class="shipper-field"><span class="shipper-label-row"><span class="shipper-mini-icon" aria-hidden="true">▣</span><span>${t("Shipper")}</span><span id="shipperPhoneInline" class="shipper-phone-inline">${(selectedMerchant?.phone||selectedMerchant?.contact_phone||selectedMerchant?.mobile||selectedMerchant?.phone_number)?`☎ ${esc(selectedMerchant.phone||selectedMerchant.contact_phone||selectedMerchant.mobile||selectedMerchant.phone_number)}`:''}</span></span><div class="shipper-fields-row"><div class="search-select" id="merchantPickerWrap"><input id="merchantSearch" class="search-select-input" tabindex="2" autocomplete="off" placeholder="${esc(L("Search shipper...","ابحث عن الشاحن..."))}" value="${esc(selectedMerchant?merchantLabel(selectedMerchant):'')}"><select id="merchant" class="search-select-value" aria-hidden="true" tabindex="-1" required><option value="">${t("Select Shipper")}</option>${merchants.map(x=>`<option value="${esc(x.id)}" data-code="${esc(x.merchant_no||x.code||x.external_code||'')}" data-phone="${esc(x.phone||x.contact_phone||x.mobile||x.phone_number||'')}" ${String(x.id)===String(o.merchant_id)?"selected":""}>${esc(merchantLabel(x))}</option>`).join("")}</select><div id="merchantOptions" class="search-select-menu" hidden></div></div><label class="shipper-number-field">${L("Shipper Phone","رقم هاتف التاجر")}<input id="merchantNumber" readonly tabindex="-1" value="${esc(selectedMerchant?.phone||selectedMerchant?.contact_phone||selectedMerchant?.mobile||selectedMerchant?.phone_number||'')}" placeholder="${esc(L("Auto","تلقائي"))}"></label></div></label>

    <label class="customer-name-field">${L("Customer Name","اسم العميل")}<input id="customer_name" tabindex="3" value="${esc(o.customer_name||o.customer?.name||"")}"></label>
    <label class="phone1-field">${L("Customer Phone 1","رقم العميل 1")}<input id="customer_phone" tabindex="4" value="${esc(o.customer_phone||o.customer?.phone||"")}"></label>
    <label class="phone2-field">${L("Customer Phone 2","رقم العميل 2")}<input id="customer_phone_2" tabindex="5" value="${esc(o.customer_phone_2||"")}"></label>
    <div id="wantedCustomerOrderWarning" class="wanted-customer-order-warning" role="status" aria-live="polite" hidden></div>

    <div class="order-location-row">
      <label class="gov-field">${L("Emirates","الإمارة")}<div class="search-select" id="govPickerWrap"><input id="govSearch" class="search-select-input" tabindex="6" autocomplete="off" placeholder="${esc(L("Search emirate...","ابحث عن الإمارة..."))}" value="${esc(selectedGovName)}"><select id="gov" class="search-select-value" aria-hidden="true" tabindex="-1"><option value=""></option>${govs.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selectedGov)?"selected":""}>${esc(L(x.name_en,x.name_ar))}</option>`).join("")}${selectedGov&&!selectedGovObj?`<option value="${esc(selectedGov)}" selected>${esc(selectedGovName||L("Saved emirate","الإمارة المحفوظة"))}</option>`:""}</select><div id="govOptions" class="search-select-menu" hidden></div></div></label>
      <label class="area-field">${L("Area","المنطقة")}<div class="search-select" id="areaPickerWrap"><input id="areaSearch" class="search-select-input" tabindex="7" autocomplete="off" placeholder="${esc(L("Search area...","اكتب المنطقة ثم Enter..."))}" value="${esc(selectedArea?L(selectedArea.name_en,selectedArea.name_ar):'')}"><select id="area" class="search-select-value" aria-hidden="true" tabindex="-1"><option value=""></option>${filteredAreas.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selectedArea?.id||o.area_id)?"selected":""}>${esc(L(x.name_en,x.name_ar))}</option>`).join("")}</select><div id="areaOptions" class="search-select-menu" hidden></div></div></label>
      <label class="address-field">${L("Address","العنوان")}<input id="address" tabindex="-1" value="${esc(o.address||"")}"></label>
      <label class="street-field">${L("Street Name","اسم الشارع")}<div class="street-helper"><input id="streetSearch" tabindex="-1" class="street-helper-input" autocomplete="off" placeholder="${esc(L("Street name (optional)","اسم الشارع (اختياري)"))}"><div id="streetOptions" class="street-helper-menu" hidden></div></div></label>
    </div>

    <label class="cod-field">${L("COD / Price","السعر / COD")} <small class="muted">${currencyInfo().symbol}</small><input id="value" name="cod" tabindex="8" type="number" inputmode="decimal" min="0" step="0.01" autocomplete="off" value="${esc(o.value==null?"":moneyInput(o.value))}"></label>
    <label class="service-field">${L("Service Charges","Service Charges")} <small class="muted">${currencyInfo().symbol}</small><input id="delivery_fee" name="service_charges" tabindex="-1" type="number" inputmode="decimal" min="0" step="0.01" autocomplete="off" value="${esc((o.service_charges??o.delivery_fee)==null?"":moneyInput(o.service_charges??o.delivery_fee))}"><small id="merchantFeeHint" class="muted">${order?L("Saved inside this order — historical rate is preserved","السعر محفوظ داخل الأوردر — السعر التاريخي ثابت"):L("Calculated automatically from Shipper → Emirate → Area. You can edit it before saving.","يتم حسابه تلقائيًا من الشاحن ← الإمارة ← المنطقة. يمكنك تعديل السعر قبل الحفظ.")}</small></label>
    <label class="notes-field">${L("Notes","ملاحظات")}<textarea id="notes" tabindex="9">${esc(o.notes||"")}</textarea></label>

    ${order?`<div class="tracking-field"><label>${L("Tracking Number","رقم التتبع")}</label><div class="tracking-readonly-box">${esc(tracking||"—")}</div><small class="muted">${L("System generated — cannot be edited","مولد بواسطة النظام — غير قابل للتعديل")}</small></div>`:`<input id="tracking_number" type="hidden" value="">`}
    <input id="order_code" type="hidden" value="${esc(o.order_code||"")}">
  </div><div class="actions"><button id="orderSaveButton" type="button" tabindex="10" ${orderPaid?'disabled class="ghost" title="'+esc(L("Paid orders are locked","الأوردرات المدفوعة مقفولة"))+'"':''}>${t(order?"Update":"Save")}</button>${order&&returnPage==="accounting"?`<button type="button" class="ghost" onclick="show('accounting')">${L("Back to Accounting","العودة للحسابات")}</button>`:""}</div><div id="orderDuplicateMsg" class="msg" aria-live="polite"></div><div id="orderMsg" class="msg"></div></div></div>`;
}

async function setupOrderForm(areas=[],govs=[]){
  const gov=$("gov"), area=$("area");
  const allAreas=areas.length?areas:(await api('/api/areas')).data||[];
  function renderAreaOptions(list,selectedId=""){
    if(!area)return;
    area.innerHTML='<option value=""></option>'+list.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selectedId)?"selected":""}>${esc(L(x.name_en,x.name_ar))}</option>`).join('');
    setupSearchAreaPicker(list,selectedId,govs);
  }
  gov?.addEventListener('change',async()=>{
    const previousAreaId=area?.value||"";
    const opts=allAreas.filter(x=>!gov.value||String(x.governorate_id)===String(gov.value));
    const retained=opts.some(x=>String(x.id)===String(previousAreaId))?previousAreaId:"";
    renderAreaOptions(opts,retained);
    await loadMerchantFee();
  });
  const savedAreaId=area?.value||"";
  // On edit, keep the saved area visible even if legacy emirate/area IDs are inconsistent.
  renderAreaOptions(allAreas.filter(x=>!gov?.value||String(x.governorate_id)===String(gov.value)||String(x.id)===String(savedAreaId)),savedAreaId);
  area?.addEventListener('change',loadMerchantFee);
  const orderNo=$("merchant_order_no");
  orderNo?.addEventListener('input',()=>{clearTimeout(window.__bookingLookupTimer);window.__bookingLookupTimer=setTimeout(()=>lookupBookingForOrder(),250);});
  if(orderNo?.value) lookupBookingForOrder();
  setupStreetHelper(allAreas,govs);
}
function setupStreetHelper(areas=[],govs=[]){
  const input=$("streetSearch"),menu=$("streetOptions");
  if(!input||!menu)return;
  let activeIndex=-1;
  const norm=v=>String(v||"").normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const close=()=>{menu.hidden=true;activeIndex=-1;};
  const localRows=(q)=>areas.flatMap(a=>{
    const candidates=[a.street,a.street_name,a.street_name_ar,a.street_name_en,a.address_street].filter(Boolean);
    return candidates.map(v=>({name:String(v),area:a}));
  }).filter((x,i,arr)=>arr.findIndex(y=>norm(y.name)===norm(x.name))===i).filter(x=>!q||norm(x.name).includes(q)).slice(0,5);
  const renderLocal=(q)=>{
    const rows=localRows(q);
    menu.innerHTML=rows.length?rows.map(x=>`<button type="button" class="street-helper-option" data-street="${esc(x.name)}">${esc(x.name)}</button>`).join(''):`<div class="street-helper-empty">${L("Press Enter to search maps","اضغط Enter للبحث في الخريطة")}</div>`;
    menu.querySelectorAll('.street-helper-option').forEach(btn=>btn.addEventListener('mousedown',e=>{e.preventDefault();input.value=btn.dataset.street||'';close();}));
    activeIndex=-1;menu.hidden=false;
  };
  const searchMaps=async(q)=>{
    const area=$("area"),gov=$("gov");
    const areaObj=areas.find(x=>String(x.id)===String(area?.value));
    const govObj=govs.find(x=>String(x.id)===String(gov?.value));
    const context=[q,areaObj?L(areaObj.name_en,areaObj.name_ar):'',govObj?L(govObj.name_en,govObj.name_ar):''].filter(Boolean).join(', ');
    menu.innerHTML=`<div class="street-helper-empty">${L("Searching map...","جاري البحث في الخريطة...")}</div>`;menu.hidden=false;
    try{
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q='+encodeURIComponent(context);
      const r=await fetch(url,{headers:{'Accept':'application/json'}}); if(!r.ok)throw new Error('map search failed');
      const rows=await r.json();
      menu.innerHTML=rows.length?rows.slice(0,5).map((x,i)=>`<button type="button" class="street-helper-option" data-street="${esc(x.display_name||q)}">${esc(x.display_name||q)}</button>`).join(''):`<div class="street-helper-empty">${L("Street not found","لم يتم العثور على الشارع")}</div>`;
      menu.querySelectorAll('.street-helper-option').forEach(btn=>btn.addEventListener('mousedown',e=>{e.preventDefault();const value=btn.dataset.street||q;input.value=value;close();}));
    }catch(e){menu.innerHTML=`<div class="street-helper-empty">${L("Map search unavailable — type it manually","البحث بالخريطة غير متاح — اكتب الاسم يدويًا")}</div>`;}
  };
  input.onfocus=()=>{if(input.value.trim())renderLocal(norm(input.value));};
  input.oninput=()=>{const q=norm(input.value);if(q)renderLocal(q);else close();};
  input.onkeydown=e=>{
    if(e.key==='Escape'){close();return;}
    if(e.key==='Enter'){e.preventDefault();const q=input.value.trim();if(!q)return close();searchMaps(q);return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const buttons=[...menu.querySelectorAll('.street-helper-option')];if(!buttons.length)return;e.preventDefault();activeIndex=e.key==='ArrowDown'?Math.min(buttons.length-1,activeIndex+1):Math.max(0,activeIndex-1);buttons.forEach((b,i)=>b.classList.toggle('active',i===activeIndex));
    }
  };
} 

function setupSearchSelect(selectId,items,inputId,menuId,labelFor){
  const input=$(inputId),menu=$(menuId),select=$(selectId);if(!input||!menu||!select)return;
  const label=x=>labelFor(x); let activeIndex=-1;
  const setActive=idx=>{const buttons=[...menu.querySelectorAll('.search-select-option')];if(!buttons.length){activeIndex=-1;return;}activeIndex=Math.max(0,Math.min(idx,buttons.length-1));buttons.forEach((b,i)=>{b.classList.toggle('active',i===activeIndex);b.setAttribute('aria-selected',i===activeIndex?'true':'false');});buttons[activeIndex]?.scrollIntoView?.({block:'nearest'});};
  const chooseButton=btn=>{if(!btn)return;const x=items.find(a=>String(a.id)===String(btn.dataset.id));if(x){select.value=String(x.id);input.value=label(x);menu.hidden=true;activeIndex=-1;select.dispatchEvent(new Event('change',{bubbles:true}));}};
  const render=(q='')=>{const query=String(q||'').toLowerCase().trim();const score=x=>{if(!query)return 0;const name=label(x).toLowerCase(),code=String(x.code||x.merchant_no||x.external_code||'').toLowerCase();return name===query||code===query?0:(name.startsWith(query)||code.startsWith(query)?1:(name.includes(query)||code.includes(query)?2:3))};const rows=items.filter(x=>!query||label(x).toLowerCase().includes(query)||String(x.code||x.merchant_no||x.external_code||'').toLowerCase().includes(query)).sort((a,b)=>score(a)-score(b)||label(a).localeCompare(label(b)));menu.innerHTML=rows.length?rows.slice(0,100).map(x=>`<button type="button" class="search-select-option" data-id="${esc(x.id)}" aria-selected="false">${esc(label(x))}</button>`).join(''):`<div class="search-select-empty">${L('No matches','لا توجد نتائج مطابقة')}</div>`;menu.querySelectorAll('.search-select-option').forEach(btn=>{btn.addEventListener('pointerdown',e=>{e.preventDefault();chooseButton(btn);});btn.addEventListener('click',e=>{e.preventDefault();chooseButton(btn);});});activeIndex=-1;menu.hidden=false;};
  input.onfocus=()=>render(input.value);input.onclick=()=>render(input.value);input.oninput=()=>render(input.value);
  if(!menu.dataset.outsideCloseBound){menu.dataset.outsideCloseBound='1';document.addEventListener('pointerdown',e=>{if(!e.target.closest?.(`#${menuId}`)&&!e.target.closest?.(`#${inputId}`)){menu.hidden=true;}});}
  input.onkeydown=e=>{const buttons=[...menu.querySelectorAll('.search-select-option')];if(e.key==='Escape'){menu.hidden=true;activeIndex=-1;return;}if(e.key==='ArrowDown'){e.preventDefault();if(menu.hidden)render(input.value);setActive(activeIndex<0?0:activeIndex+1);return;}if(e.key==='ArrowUp'){e.preventDefault();if(menu.hidden)render(input.value);setActive(activeIndex<0?buttons.length-1:activeIndex-1);return;}if(e.key==='Home'&&buttons.length){e.preventDefault();setActive(0);return;}if(e.key==='End'&&buttons.length){e.preventDefault();setActive(buttons.length-1);return;}if(e.key==='Enter'){const b=buttons[activeIndex>=0?activeIndex:0];if(b){e.preventDefault();chooseButton(b);}}};
}

function updateShipperPhoneInline(){
  const select=$("merchant"),out=$("shipperPhoneInline"),number=$("merchantNumber");
  if(!select)return;
  const option=select.options[select.selectedIndex];
  const phone=String(option?.dataset?.phone||"").trim();
  const code=String(option?.dataset?.code||"").trim();
  if(out){out.textContent=phone?`☎ ${phone}`:"";out.title=phone;}
  if(number)number.value=phone;
}
function syncSearchSelectLabel(selectId){const sel=$(selectId),input=$(selectId==='merchant'?'merchantSearch':'govSearch');if(!sel||!input)return;const o=sel.options[sel.selectedIndex];if(o)input.value=o.textContent||'';}

function setupSearchAreaPicker(areas=[],selectedId="",govs=[]){
  const input=$("areaSearch"), menu=$("areaOptions"), select=$("area"), resolved=$("areaResolvedEmirate");
  if(!input||!menu||!select)return;
  const labelFor=x=>L(x.name_en,x.name_ar);
  const govLabel=x=>x?L(x.name_en,x.name_ar):"";
  const current=areas.find(x=>String(x.id)===String(selectedId));
  input.value=current?labelFor(current):"";
  let activeIndex=-1;
  const norm=v=>String(v||"").normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const scoreName=(name,q)=>{
    if(!q)return 3;
    if(name===q)return 0;
    if(name.startsWith(q))return 1;
    if(name.endsWith(q))return 2;
    if(name.includes(q))return 3;
    return 9;
  };
  const close=()=>{menu.hidden=true;activeIndex=-1;};
  const emirateFor=x=>govs.find(g=>String(g.id)===String(x?.governorate_id));
  const showResolved=x=>{
    if(!resolved)return;
    const g=emirateFor(x);
    resolved.textContent="";
    resolved.hidden=true;
  };
  const setActive=idx=>{const buttons=[...menu.querySelectorAll('.search-select-option')];if(!buttons.length){activeIndex=-1;return;}activeIndex=Math.max(0,Math.min(idx,buttons.length-1));buttons.forEach((b,i)=>{b.classList.toggle('active',i===activeIndex);b.setAttribute('aria-selected',i===activeIndex?'true':'false');});buttons[activeIndex]?.scrollIntoView?.({block:'nearest'});};
  const choose=x=>{select.value=String(x.id);input.value=labelFor(x);close();showResolved(x);select.dispatchEvent(new Event('change',{bubbles:true}));};
  const render=(query="")=>{
    const q=norm(query);
    const rows=areas.map(x=>{
      const ar=norm(x.name_ar),en=norm(x.name_en);
      const scores=[scoreName(ar,q),scoreName(en,q)].sort((a,b)=>a-b);
      return {...x,__score:scores[0]};
    }).filter(x=>!q||x.__score<9).sort((a,b)=>a.__score-b.__score||labelFor(a).localeCompare(labelFor(b)));
    menu.innerHTML=rows.length?rows.map(x=>`<button type="button" class="search-select-option" data-id="${esc(x.id)}" aria-selected="false"><span>${esc(labelFor(x))}</span></button>`).join(""):`<div class="search-select-empty">${q?L("Area not found in system","المنطقة غير موجودة في النظام"):L("Type an area name","اكتب اسم المنطقة")}</div>`;
    menu.querySelectorAll('.search-select-option').forEach(btn=>{const pick=e=>{e.preventDefault();const x=areas.find(a=>String(a.id)===String(btn.dataset.id));if(x)choose(x);};btn.addEventListener('pointerdown',pick);});
    activeIndex=-1;menu.hidden=false;
  };
  if(current)showResolved(current); else if(resolved)resolved.hidden=true;
  input.onfocus=()=>render(input.value);
  input.onclick=()=>render(input.value);
  input.oninput=()=>render(input.value);
  input.onkeydown=e=>{
    const buttons=[...menu.querySelectorAll('.search-select-option')];
    if(e.key==='Escape'){close();return;}
    if(e.key==='ArrowDown'){e.preventDefault();if(menu.hidden)render(input.value);setActive(activeIndex<0?0:activeIndex+1);return;}
    if(e.key==='ArrowUp'){e.preventDefault();if(menu.hidden)render(input.value);setActive(activeIndex<0?buttons.length-1:activeIndex-1);return;}
    if(e.key==='Enter'){
      e.preventDefault();
      if(menu.hidden)render(input.value);
      const buttonsNow=[...menu.querySelectorAll('.search-select-option')];
      const b=buttonsNow[activeIndex>=0?activeIndex:0];
      // Select directly: the options are wired to pointerdown/click, not mousedown.
      if(b){
        const picked=areas.find(a=>String(a.id)===String(b.dataset.id));
        if(picked)choose(picked);
      }
    }
  };
}

async function lookupBookingForOrder(){
  const input=$('merchant_order_no'), merchant=$('merchant'), hint=$('bookingHint');
  if(!input||!merchant)return;
  const value=input.value.trim();
  if(!value){merchant.disabled=false; const ms=$("merchantSearch"); if(ms)ms.disabled=false;if(hint)hint.textContent=L("If this coupon is booked, the merchant will be selected automatically.","لو الكوبون محجوز سيتم اختيار التاجر تلقائيًا.");return;}
  const n=Number(value);
  if(!Number.isInteger(n)||n<0)return;
  try{
    const d=await api('/api/bookings/coupon?coupon='+encodeURIComponent(n));
    if(d.data?.merchant){
      merchant.value=d.data.merchant.id;
      merchant.disabled=true; const ms=$("merchantSearch"); if(ms)ms.disabled=true; syncSearchSelectLabel("merchant");
      if(hint)hint.textContent=L(`Booked to: ${d.data.merchant.name}` ,`محجوز للتاجر: ${d.data.merchant.name}`);
      await loadMerchantFee();
    }else{ merchant.disabled=false; const ms=$("merchantSearch"); if(ms)ms.disabled=false; if(hint)hint.textContent=L("Coupon is not booked. Select the merchant from the list.","الكوبون غير محجوز. اختر التاجر من القائمة."); }
  }catch(e){ if(hint)hint.textContent=e.message; }
}

function bookingRowHtml(b){return `<tr class="booking-row" data-id="${esc(b.id)}" data-search="${esc([b.merchant?.name,b.merchant?.code,b.merchant?.merchant_no,b.merchant?.external_code,b.booked_by_name,b.first_coupon,b.last_coupon].filter(Boolean).join(' '))}"><td>${esc(merchantLabel(b.merchant))}</td><td>${esc(b.first_coupon)}</td><td>${esc(b.last_coupon)}</td><td>${Math.max(0,Number(b.last_coupon)-Number(b.first_coupon)+1)}</td><td>${esc(b.booked_by_name||'')}</td><td><button class="mini-btn" onclick="editBooking('${esc(b.id)}')">${L('Edit','تعديل')}</button> <button class="mini-btn danger" onclick="deleteBooking('${esc(b.id)}')">${L('Delete','حذف')}</button></td></tr>`;}

async function bookingPage(c){
  const [m,b]=await Promise.all([api('/api/merchants'),api('/api/bookings')]);
  const merchants=m.data||[], bookings=b.data||[];
  window.__bookingMerchants=merchants; window.__bookingItems=bookings;
  c.innerHTML=`<h2>${L('Booking','حجز كوبونات')}</h2>
  <div class="panel booking-panel">
    <div class="section-title-row"><div><h3>${L('Reserve Coupons','حجز كوبونات')}</h3><p class="muted">${L('Choose a shipper, enter the first and last coupon, and the count is calculated automatically.','اختر التاجر وحدد أول وآخر كوبون والعداد يتحسب تلقائيًا.')}</p></div></div>
    <div class="form-grid">
      <label class="full">${L('Shipper','التاجر')}<div class="smart-merchant-picker" id="bookingShipperPicker"><input id="bookingShipperSearch" class="search-select-input" autocomplete="off" placeholder="${esc(L('Search shipper by name, code or old code...','ابحث باسم التاجر أو الكود أو الكود القديم...'))}"><div id="bookingMerchantOptions" class="smart-merchant-options"></div><select id="bookingMerchant" class="hidden-field" aria-hidden="true"><option value="">${esc(L('Select Shipper','اختر التاجر'))}</option>${merchants.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.code||x.merchant_no||'')} ${x.external_code&&x.external_code!==x.merchant_no?`— ${esc(x.external_code)}`:''}</option>`).join('')}</select></div><small class="muted">${L('Type any part of the shipper name or code; matching results appear instantly.','اكتب أي جزء من اسم التاجر أو الكود وستظهر النتائج فورًا.')}</small></label>
      <label>${L('First Coupon','أول كوبون')}<input id="firstCoupon" type="number" min="0"></label>
      <label>${L('Last Coupon','آخر كوبون')}<input id="lastCoupon" type="number" min="0"></label>
      <label>${L('Coupons Count','عدد الكوبونات')}<input id="bookingCount" readonly></label>
    </div>
    <div class="actions"><button onclick="saveBooking()">🔒 ${L('Book Coupons','حجز الكوبونات')}</button></div><div id="bookingMsg" class="msg"></div>
  </div>
  <div class="panel"><div class="section-title-row"><div><h3>${L('Current Bookings','الحجوزات الحالية')}</h3><input id="bookingListSearch" class="table-smart-search" placeholder="${esc(L('Smart search by shipper name or code...','بحث ذكي باسم التاجر أو الكود أو رقم الكوبون...'))}" autocomplete="off"></div><span class="history-count">${bookings.length}</span></div><div class="table-wrap"><table><thead><tr><th>${L('Shipper','التاجر')}</th><th>${L('First Coupon','أول كوبون')}</th><th>${L('Last Coupon','آخر كوبون')}</th><th>${L('Count','العدد')}</th><th>${L('Booked By','حجز بواسطة')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody id="bookingRows">${bookings.length?bookings.map(bookingRowHtml).join(''):`<tr><td colspan="6" class="muted">${L('No bookings yet','لا توجد حجوزات')}</td></tr>`}</tbody></table></div></div>
  <div class="panel booking-edit-inline" id="bookingEditPanel" hidden><div class="section-title-row"><div><h3>${L('Edit Booking','تعديل الحجز')}</h3><p id="bookingEditShipper" class="muted"></p></div><button type="button" class="ghost" onclick="cancelBookingEdit()">${L('Cancel','إلغاء')}</button></div><input id="bookingEditId" type="hidden"><div class="form-grid"><label>${L('First Coupon','أول كوبون')}<input id="bookingEditFirst" type="number" min="0" step="1" required></label><label>${L('Last Coupon','آخر كوبون')}<input id="bookingEditLast" type="number" min="0" step="1" required></label><label>${L('Coupons Count','عدد الكوبونات')}<input id="bookingEditCount" readonly></label></div><div id="bookingEditMsg" class="msg" aria-live="polite"></div><div class="actions"><button type="button" class="primary" onclick="saveBookingEdit()">${L('Save Changes','حفظ التعديلات')}</button></div></div>`;
  // Keep the saved-bookings table near the top and avoid duplicate page headings.
  c.querySelector('h2')?.remove();
  const savedTitle=c.querySelectorAll('.panel .section-title-row h3')[0];if(savedTitle)savedTitle.style.cssText='font-size:15px;line-height:1.2;margin:0;font-weight:850';
  const bookingForm=c.querySelector('.booking-panel'), bookingTable=c.querySelectorAll('.panel')[1], bookingEdit=c.querySelector('#bookingEditPanel');
  bookingForm?.querySelector('.section-title-row')?.remove();
  if(bookingTable&&bookingForm){c.insertBefore(bookingTable,bookingForm); if(bookingEdit)bookingTable.after(bookingEdit);}
  const merchantOptions=[...merchants];
  const drawBookingMerchantOptions=()=>{const q=($('bookingShipperSearch')?.value||'').trim().toLowerCase(),box=$('bookingMerchantOptions'),sel=$('bookingMerchant');if(!box||!sel)return;const rows=merchantOptions.filter(x=>[x.name,x.code,x.merchant_no,x.external_code].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,12);box.innerHTML=rows.length?rows.map(x=>`<button type="button" class="smart-merchant-option" data-id="${esc(x.id)}"><b>${esc(x.name||'')}</b><small>${esc([x.code||x.merchant_no,x.external_code&&x.external_code!==x.merchant_no?x.external_code:''].filter(Boolean).join(' — '))}</small></button>`).join(''):`<div class="smart-no-result">${esc(L('No matching shipper','لا يوجد تاجر مطابق'))}</div>`;box.classList.add('open');box.querySelectorAll('.smart-merchant-option').forEach(btn=>btn.addEventListener('click',()=>{const x=merchantOptions.find(m=>String(m.id)===String(btn.dataset.id));if(!x)return;sel.value=x.id;$('bookingShipperSearch').value=[x.name,x.code||x.merchant_no].filter(Boolean).join(' — ');box.classList.remove('open');}));};
  $('bookingShipperSearch')?.addEventListener('focus',drawBookingMerchantOptions);
  $('bookingShipperSearch')?.addEventListener('input',drawBookingMerchantOptions);
  $('bookingListSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.booking-row').forEach(row=>row.style.display=(!q||row.dataset.search.toLowerCase().includes(q))?'':'none');});
  ['firstCoupon','lastCoupon'].forEach(id=>$(id)?.addEventListener('input',()=>{const a=Number($('firstCoupon').value),b=Number($('lastCoupon').value);$('bookingCount').value=Number.isInteger(a)&&Number.isInteger(b)&&b>=a?b-a+1:'';}));
}
async function saveBooking(){
  const first=Number($('firstCoupon')?.value),last=Number($('lastCoupon')?.value),merchant_id=$('bookingMerchant')?.value;
  if(!merchant_id||!Number.isInteger(first)||!Number.isInteger(last)||last<first)return msg('bookingMsg',L('Select a shipper and valid coupon range.','اختر التاجر وأدخل نطاق كوبونات صحيح.'),'error');
  const saveButton=$('bookingMsg')?.parentElement?.querySelector('button');if(saveButton){saveButton.disabled=true;saveButton.dataset.oldText=saveButton.textContent;saveButton.textContent=L('Saving…','جارٍ الحفظ…');}
  try{const result=await api('/api/bookings',{method:'POST',body:JSON.stringify({merchant_id,first_coupon:first,last_coupon:last,booked_by_name:CURRENT_USER?.name||CURRENT_USER?.username||"System"})});const saved=result.data||{},merchant=(window.__bookingMerchants||[]).find(x=>String(x.id)===String(merchant_id))||saved.merchant||null;const item={...saved,merchant: saved.merchant||merchant,first_coupon:first,last_coupon:last,booked_by_name:saved.booked_by_name||CURRENT_USER?.name||CURRENT_USER?.username||'System'};window.__bookingItems=[item,...(window.__bookingItems||[])];const rows=$('bookingRows');if(rows){if(rows.querySelector('td[colspan]'))rows.innerHTML='';rows.insertAdjacentHTML('afterbegin',bookingRowHtml(item));}const count=$('bookingRows')?.closest('.panel')?.querySelector('.history-count');if(count)count.textContent=String(window.__bookingItems.length);$('firstCoupon').value='';$('lastCoupon').value='';$('bookingCount').value='';$('bookingShipperSearch').value='';$('bookingMerchant').value='';msg('bookingMsg',L('Coupons booked successfully.','تم حجز الكوبونات بنجاح.'),'ok');}catch(e){msg('bookingMsg',e.message,'error');}finally{if(saveButton){saveButton.disabled=false;saveButton.textContent=saveButton.dataset.oldText||L('Book Coupons','حجز الكوبونات');}}
}
async function editBooking(id){
  try{
    const b=(window.__bookingItems||[]).find(x=>String(x.id)===String(id));
    if(!b)return;
    const panel=$('bookingEditPanel');if(!panel)return;
    $('bookingEditId').value=String(b.id);
    $('bookingEditShipper').textContent=merchantLabel(b.merchant);
    $('bookingEditFirst').value=String(b.first_coupon??'');
    $('bookingEditLast').value=String(b.last_coupon??'');
    $('bookingEditCount').value=Math.max(0,Number(b.last_coupon)-Number(b.first_coupon)+1);
    const updateEditCount=()=>{const firstText=String($('bookingEditFirst')?.value??'').trim(),lastText=String($('bookingEditLast')?.value??'').trim(),first=Number(firstText),last=Number(lastText);$('bookingEditCount').value=/^\d+$/.test(firstText)&&/^\d+$/.test(lastText)&&Number.isSafeInteger(first)&&Number.isSafeInteger(last)&&last>=first?last-first+1:'';};
    $('bookingEditFirst').oninput=updateEditCount;$('bookingEditLast').oninput=updateEditCount;
    $('bookingEditMsg').textContent='';$('bookingEditMsg').className='msg';
    panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'center'});$('bookingEditFirst')?.focus();
  }catch(e){dashboardActionNotice?.(e.message||String(e),'error');}
}
function cancelBookingEdit(){const panel=$('bookingEditPanel');if(panel)panel.hidden=true;}
async function saveBookingEdit(){
  const id=$('bookingEditId')?.value;
  const firstText=String($('bookingEditFirst')?.value??'').trim(),lastText=String($('bookingEditLast')?.value??'').trim();
  if(!id)return msg('bookingEditMsg',L('Choose a booking to edit.','اختر حجزًا لتعديله.'),'error');
  if(!/^\d+$/.test(firstText)||!/^\d+$/.test(lastText))return msg('bookingEditMsg',L('Enter valid whole coupon numbers.','أدخل أرقام كوبونات صحيحة بدون كسور.'),'error');
  const first=Number(firstText),last=Number(lastText);
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<0||last<first)return msg('bookingEditMsg',L('The last coupon must be greater than or equal to the first coupon.','يجب أن يكون آخر كوبون أكبر من أو يساوي أول كوبون.'),'error');
  const save=$('bookingEditPanel')?.querySelector('button.primary');if(save){save.disabled=true;save.textContent=L('Saving…','جارٍ الحفظ…');}
  try{const result=await api('/api/bookings',{method:'PATCH',body:JSON.stringify({id,first_coupon:first,last_coupon:last})});const updated=result.data||{},items=window.__bookingItems||[],idx=items.findIndex(x=>String(x.id)===String(id));if(idx>=0)items[idx]={...items[idx],...updated,first_coupon:first,last_coupon:last};window.__bookingItems=items;const oldRow=document.querySelector(`.booking-row[data-id="${CSS.escape(String(id))}"]`);if(oldRow)oldRow.outerHTML=bookingRowHtml(items[idx]||{...updated,id,first_coupon:first,last_coupon:last});cancelBookingEdit();msg('bookingEditMsg',L('Booking updated.','تم تعديل الحجز.'),'ok');}
  catch(e){msg('bookingEditMsg',e.message||String(e),'error');}
  finally{if(save){save.disabled=false;save.textContent=L('Save Changes','حفظ التعديلات');}}
}

async function deleteBooking(id){if(!await showConfirmModal(L('Delete this coupon booking?','حذف حجز الكوبونات؟')))return;try{await api('/api/bookings',{method:'DELETE',body:JSON.stringify({id})});window.__bookingItems=(window.__bookingItems||[]).filter(x=>String(x.id)!==String(id));document.querySelector(`.booking-row[data-id="${CSS.escape(String(id))}"]`)?.remove();const count=$('bookingRows')?.closest('.panel')?.querySelector('.history-count');if(count)count.textContent=String(window.__bookingItems.length);}catch(e){alert(e.message);}}

async function loadMerchantFee(){
  const merchant=$('merchant')?.value, gov=$('gov')?.value, area=$('area')?.value;
  if(!merchant)return;
  try{
    const m=await api('/api/merchants'); const row=(m.data||[]).find(x=>String(x.id)===String(merchant));
    const fee=Number(row?.base_delivery_fee||0); const input=$('delivery_fee'); const hint=$('merchantFeeHint');
    if(input && input.dataset.userEdited !== '1') input.dataset.userEdited = '0';
    if(input && !input.dataset.editHandlerAttached){
      input.dataset.editHandlerAttached='1';
      input.addEventListener('input',()=>{ input.dataset.userEdited='1'; });
      input.addEventListener('focus',()=>{ input.select?.(); });
    }
    if($('value') && !$('value').dataset.editHandlerAttached){
      const cod=$('value'); cod.dataset.editHandlerAttached='1';
      cod.removeAttribute('readonly'); cod.removeAttribute('disabled'); cod.readOnly=false; cod.disabled=false;
      cod.addEventListener('input',()=>{ cod.dataset.userEdited='1'; });
    }
    if($('area')) $('area').onchange=loadMerchantFee;
    if($('gov')) $('gov').onchange=async()=>{const all=await api('/api/areas');const opts=(all.data||[]).filter(x=>!$('gov').value||String(x.governorate_id)===String($('gov').value));$('area').innerHTML='<option value=""></option>'+opts.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('');await loadMerchantFee();};
    if($('edit_order_id')){if(input&&input.dataset.userEdited!=='1'&&!input.value)input.value=moneyInput(fee);if(hint)hint.textContent=L(`Saved shipper fee: ${money(fee)}`,`رسوم التوصيل المحفوظة للتاجر: ${money(fee)}`);return;}
    if(!gov&&!area){if(hint)hint.textContent=L(`Select Emirate and Area to calculate the Shipper Rate. Default fallback: ${money(fee)}`,`اختر الإمارة والمنطقة لحساب سعر الشاحن. البديل الافتراضي: ${money(fee)}`);return;}
    const rates=await api(`/api/shipper-rates?merchant_id=${encodeURIComponent(merchant)}`); const rows=rates.data||[]; const gid=String(gov||''),aid=String(area||'');
    const score=r=>r.area_id&&String(r.area_id)===aid&&String(r.governorate_id)===gid?3:(r.governorate_id&&String(r.governorate_id)===gid&&!r.area_id?2:(!r.governorate_id&&!r.area_id?1:0));
    const candidates=rows.filter(r=>r.status==='Active'&&new Date(r.effective_date||0)<=new Date()).sort((a,b)=>score(b)-score(a)||new Date(b.effective_date||0)-new Date(a.effective_date||0));
    const rate=candidates.find(r=>score(r)>0); if(rate){if(input&&input.dataset.userEdited!=='1')input.value=moneyInput(rate.delivery_rate);if(hint)hint.textContent=L(`Shipper Rate: ${money(rate.delivery_rate)} (${rate.area_id?'Area Override':rate.governorate_id?'Emirate Rate':'Default Rate'})`,`سعر الشاحن: ${money(rate.delivery_rate)} (${rate.area_id?'سعر خاص بالمنطقة':rate.governorate_id?'سعر الإمارة':'السعر الافتراضي'})`);}else{if(input&&input.dataset.userEdited!=='1')input.value=moneyInput(fee);if(hint)hint.textContent=L(`No Shipper Rate found. Fallback: ${money(fee)}`,`لا يوجد سعر شاحن. سيتم استخدام البديل: ${money(fee)}`);}
  }catch(e){console.warn(e);}
}

async function importOrdersExcel(){
  let labelWindow=null;
  const file=$("orderFile")?.files?.[0];
  if(!file)return msg("orderImportMsg",L("Choose an Excel file","اختر ملف Excel"),"error");
  if(typeof XLSX==="undefined")return msg("orderImportMsg",L("Excel library did not load","مكتبة Excel لم تعمل"),"error");
  const selectedMerchantId=$("orderImportShipper")?.value||"";
  if(!selectedMerchantId)return msg("orderImportMsg",L("Choose the shipper first","اختار اسم التاجر وكوده الأول"),"error");
  labelWindow=window.open("about:blank","_blank");
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const sourceRows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
    if(!sourceRows.length)throw new Error(L("The Excel file is empty","ملف Excel فارغ"));
    const norm=v=>String(v??"").toLowerCase().replace(/[\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/[\s_\-./()]+/g,"").trim();
    const aliases={
      "رقم التتبع":["رقم التتبع","رقم التتبع الخاص بالشحنة","tracking number","tracking no","tracking","awb","waybill","رقم الشحن"],
      "رقم الاوردر":["رقم الاوردر","رقم الأوردر","رقم الطلب","رقم طلب التاجر","رقم اوردر التاجر","order number","order no","order id","merchant order no","merchant order number","reference"],
      "رقم الشحنه":["رقم الشحنه","رقم الشحنة","shipment number","shipment no","shipment id","رقم البوليصة"],
      "اسم العميل":["اسم العميل","اسم المستلم","العميل","customer name","customer","consignee","receiver name","recipient name","الاسم"],
      "رقم العميل 1":["رقم العميل 1","رقم العميل","هاتف العميل","موبايل العميل","رقم الهاتف","رقم التليفون","phone","phone 1","mobile","mobile number","customer phone","customer mobile","telephone"],
      "رقم العميل 2":["رقم العميل 2","هاتف 2","موبايل 2","رقم بديل","رقم هاتف بديل","phone 2","mobile 2","alternate phone","second phone"],
      "سعر الاوردر cod":["سعر الاوردر cod","سعر الاوردر","قيمة الاوردر","قيمة الأوردر","قيمة الطلب","cod","cod amount","order value","price","amount","total"],
      "ملاحظات":["ملاحظات","ملاحظات الاوردر","ملاحظات الطلب","notes","note","description","تعليمات"],
      "اسم التاجر وكوده":["اسم التاجر وكوده","اسم التاجر","التاجر","اسم الشاحن","الشاحن","shipper","merchant","shipper name","seller","seller name","vendor"],
      "الإمارة":["الإمارة","اسم الإمارة","emirate","governorate","governorate name","emirate name","الإماره","الامارة"],
      "المنطقة":["المنطقة","اسم المنطقة","المنطقة / area","region","region name","area","area name","district","zone","المنطقه"]
    };
    const aliasMap={};for(const [canonical,list] of Object.entries(aliases))for(const a of list)aliasMap[norm(a)]=canonical;
    const merchantOptions=Array.from($("orderImportShipper").options||[]);const chosen=merchantOptions.find(o=>o.value===selectedMerchantId);const merchantLabel=chosen?.dataset?.label||chosen?.textContent?.trim()||"";
    const rows=sourceRows.map(src=>{const out={"رقم التتبع":"","رقم الاوردر":"","رقم الشحنه":"","اسم التاجر وكوده":merchantLabel,"اسم العميل":"","رقم العميل 1":"","رقم العميل 2":"","سعر الاوردر cod":"","الإمارة":"","المنطقة":"","ملاحظات":""};for(const [k,v] of Object.entries(src)){const canonical=aliasMap[norm(k)];if(canonical&&String(v??"").trim()!=="")out[canonical]=String(v).trim();}out["اسم التاجر وكوده"]=merchantLabel;out["رقم التتبع"]="";out["رقم الشحنه"]="";return out;});
    const missing=rows.reduce((a,r,i)=>{if(!r["اسم العميل"]||!r["رقم العميل 1"]||r["سعر الاوردر cod"]===""||!r["الإمارة"]||!r["المنطقة"])a.push(i+2);return a;},[]);
    if(missing.length)throw new Error(L(`Required values missing (customer, phone, COD, Emirate or Region) in Excel rows: ${missing.slice(0,12).join(", ")}${missing.length>12?"…":""}`,`بيانات أساسية ناقصة (العميل أو الهاتف أو قيمة COD أو الإمارة أو المنطقة) في صفوف Excel: ${missing.slice(0,12).join("، ")}${missing.length>12?"…":""}`));
    const d=await api("/api/orders/import",{method:"POST",body:JSON.stringify({rows,default_merchant_id:selectedMerchantId})});
    const summary=`${L("Imported","تم الرفع")}: ${d.imported||0} — ${L("Skipped","تم التخطي")}: ${d.skipped||0}`;
    msg("orderImportMsg",summary,"ok");
    if(d.errors?.length){console.warn(d.errors);const details=d.errors.slice(0,8).map(x=>`${L("Row","صف")} ${x.row}: ${x.error}`).join("\n");const box=$("orderImportErrors");if(box)box.textContent=details;}
    if(Array.isArray(d.labels)&&d.labels.length){printShippingLabels(d.labels,labelWindow);msg("orderImportMsg",`${summary} — ${L("Shipping labels opened for printing","تم فتح ملصقات الشحن للطباعة")}`,"ok");}
    else {if(labelWindow&&!labelWindow.closed)labelWindow.close();msg("orderImportMsg",`${summary} — ${L("No labels returned for imported orders","لم تُرجع بيانات ملصقات للأوردرات المستوردة")}`,"ok");}
    setTimeout(()=>show("orderImport"),900);
  }catch(e){if(labelWindow&&!labelWindow.closed)labelWindow.close();msg("orderImportMsg",e.message,"error");}
}

function orderExcelRows(rows,governorates=[],areas=[]){
  const govById=new Map((governorates||[]).map(g=>[String(g.id),g]));
  const areaById=new Map((areas||[]).map(a=>[String(a.id),a]));
  return (rows||[]).map(r=>{
    const gov=govById.get(String(r.governorate_id||''))||{};
    const area=areaById.get(String(r.area_id||''))||{};
    return {
      "رقم التتبع":r.tracking_number||"",
      "رقم الاوردر":r.merchant_order_no||"",
      "رقم الشحنه":r.shipment_no||"",
      "اسم التاجر وكوده":r.merchant_display||((r.merchant_name||"")+(r.merchant_no?` — ${r.merchant_no}`:"")),
      "اسم العميل":r.customer_name||"",
      "رقم العميل 1":r.customer_phone||"",
      "رقم العميل 2":r.customer_phone_2||"",
      "سعر الاوردر cod":r.value??"",
      "الإمارة":gov.name_en||gov.name_ar||r.governorate_name||r.emirate_name||"",
      "المنطقة":area.name_en||area.name_ar||r.area_name||r.region_name||"",
      "ملاحظات":r.notes||""
    };
  });
}
async function downloadOrderExcelTemplate(){
  // Use live company locations so the template dropdowns match configured data.
  if(typeof ExcelJS==='undefined')return msg("orderImportMsg",L("Excel library did not load","مكتبة Excel لم تعمل"),"error");
  try{
    const [govData,areaData]=await Promise.all([api('/api/governorates'),api('/api/areas')]);
    const govs=(govData.data||[]).map(g=>({id:g.id,label:g.name_en||g.name_ar||''})).filter(g=>g.label);
    const areas=(areaData.data||[]).map(a=>({id:a.id,governorate_id:a.governorate_id,label:a.name_en||a.name_ar||''})).filter(a=>a.label);
    const wb=await trendExcelWorkbook();
    const ws=wb.addWorksheet('Orders');
    const headers=["رقم الاوردر","اسم العميل","رقم العميل 1","رقم العميل 2","سعر الاوردر cod","الإمارة","المنطقة","ملاحظات"];
    ws.addRow(headers);ws.addRow(headers.map(()=>''));
    ws.views=[{state:'frozen',ySplit:1}];
    ws.columns=[{width:20},{width:26},{width:20},{width:20},{width:18},{width:24},{width:28},{width:34}];
    ws.autoFilter={from:{row:1,column:1},to:{row:1+1000,column:headers.length}};
    const lists=wb.addWorksheet('Lists');
    lists.state='veryHidden';
    lists.getCell('A1').value='Emirates';
    govs.forEach((g,i)=>lists.getCell(i+2,1).value=g.label);
    if(govs.length)wb.definedNames.add(`'Lists'!$A$2:$A$${govs.length+1}`,'EmirateList');
    govs.forEach((g,govIndex)=>{
      const column=govIndex+2;
      const letter=ExcelJS.Workbook?(()=>{let n=column,out='';while(n){const rem=(n-1)%26;out=String.fromCharCode(65+rem)+out;n=Math.floor((n-1)/26);}return out;})():String.fromCharCode(64+column);
      lists.getCell(1,column).value=`Regions ${govIndex+1}`;
      const govAreas=areas.filter(a=>String(a.governorate_id||'')===String(g.id));
      if(govAreas.length)govAreas.forEach((a,i)=>lists.getCell(i+2,column).value=a.label);
      else lists.getCell(2,column).value='';
      wb.definedNames.add(`'Lists'!$${letter}$2:$${letter}$${Math.max(2,govAreas.length+1)}`,`RegionList_${govIndex+1}`);
    });
    for(let row=2;row<=1001;row++){
      if(govs.length)ws.getCell(row,6).dataValidation={type:'list',allowBlank:true,formulae:['EmirateList'],showErrorMessage:true,errorTitle:'Invalid Emirate',error:'Choose an Emirate from the dropdown list.'};
      if(govs.length)ws.getCell(row,7).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("RegionList_"&MATCH($F${row},EmirateList,0))`],showErrorMessage:true,errorTitle:'Invalid Region',error:'Choose a Region that belongs to the selected Emirate.'};
    }
    ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};ws.getRow(1).alignment={vertical:'middle',wrapText:true};
    const guide=wb.addWorksheet('Instructions');
    guide.addRow(['ORDER IMPORT TEMPLATE']);guide.addRow(['Choose Emirate first, then choose a Region from its dependent dropdown list.']);guide.addRow(['The system validates the Emirate/Region link again during import.']);guide.addRow(['Search/autocomplete inside dropdowns depends on your Excel version (supported in some Microsoft 365 versions).']);guide.getColumn(1).width=110;guide.getColumn(1).alignment={wrapText:true,vertical:'middle'};guide.getRow(1).font={bold:true,size:14};
    trendExcelDownload(await wb.xlsx.writeBuffer(),`orders-template-${today()}.xlsx`);
  }catch(e){msg("orderImportMsg",e.message||L("Could not create Excel template","تعذر إنشاء قالب Excel"),"error");}
}
function exportOrderRowsExcel(rows,name="orders"){
  if(typeof XLSX==="undefined")return alert(L("Excel library did not load","مكتبة Excel لم تعمل"));
  const headers=["رقم التتبع","رقم الاوردر","رقم الشحنه","اسم التاجر وكوده","اسم العميل","رقم العميل 1","رقم العميل 2","سعر الاوردر cod","الإمارة","المنطقة","ملاحظات"];
  const normalized=(rows||[]).map(r=>Object.fromEntries(headers.map(h=>[h,r?.[h]??""])));
  const ws=XLSX.utils.json_to_sheet(normalized,{header:headers});
  ws['!cols']=[{wch:20},{wch:18},{wch:18},{wch:30},{wch:25},{wch:18},{wch:18},{wch:18},{wch:24},{wch:28},{wch:34}];
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,normalized.length),c:headers.length-1}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Orders");XLSX.writeFile(wb,`${name}-${today()}.xlsx`);
}
async function orderExcelPage(c){
  let rows=[],merchants=[];
  try{const [ordersData,merchantData,govData,areaData]=await Promise.all([api("/api/orders/export"),api("/api/merchants"),api("/api/governorates"),api("/api/areas")]);rows=orderExcelRows(ordersData.data||[],govData.data||[],areaData.data||[]);merchants=merchantData.data||[];}catch(e){console.warn(e);}
  const headers=["رقم التتبع","رقم الاوردر","رقم الشحنه","اسم التاجر وكوده","اسم العميل","رقم العميل 1","رقم العميل 2","سعر الاوردر cod","الإمارة","المنطقة","ملاحظات"];
  const headerCells=headers.map(h=>`<th>${esc(h)}</th>`).join("");
  const merchantOptions=merchants.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),LANG==='ar'?'ar':'en')).map(m=>{const code=m.merchant_no||m.code||"";const label=`${m.name||""}${code?` — ${code}`:""}`;return `<option value="${esc(m.id)}" data-label="${esc(label)}">${esc(label)}</option>`;}).join("");
  c.innerHTML=`<h2>${L("Order Excel Import / Export","استيراد وتصدير الأوردرات Excel")}</h2>
  <div class="panel"><h3>${L("Import orders for a shipper","استيراد أوردرات لتاجر محدد")}</h3>
    <p class="muted">${L("1. Select the shipper and upload the Excel file. Include Emirate and Region using the template dropdown lists. The system validates that each Region belongs to the selected Emirate.","١. اختار التاجر وارفع ملف Excel. لازم تضيف الإمارة والمنطقة باستخدام القوائم المنسدلة في القالب؛ والسيستم هيتأكد إن المنطقة تابعة للإمارة المختارة.")}</p>
    <div class="form-grid"><label>${L("Shipper name and code","اسم التاجر وكوده")}<select id="orderImportShipper"><option value="">${L("Choose shipper","اختار التاجر")}</option>${merchantOptions}</select></label><label>${L("Excel file","ملف Excel")}<input id="orderFile" type="file" accept=".xlsx,.xls,.csv"></label></div>
    <div class="actions"><button class="ghost" onclick="importOrdersExcel()">${L("Import Excel","استيراد Excel")}</button><button onclick="downloadOrderExcelTemplate()">${L("Download organized template","تحميل قالب Excel مرتب")}</button></div><div id="orderImportMsg" class="msg"></div><pre id="orderImportErrors" class="muted" style="white-space:pre-wrap"></pre>
  </div>
  <div class="panel"><div class="row"><h3 style="margin-inline-end:auto">${L("Export Orders","تصدير الأوردرات")}</h3><button onclick='exportOrderRowsExcel(${JSON.stringify(rows)} ,"orders")'>${L("Export organized Excel","تصدير Excel مرتب")}</button></div><p class="muted">${L("Columns are kept in a consistent order with readable column widths.","الأعمدة مرتبة بترتيب ثابت وعرض مناسب للقراءة.")}</p><div class="table-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${rows.slice(0,200).map(r=>`<tr>${headers.map(h=>`<td>${esc(r[h]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}

function wireOrderDuplicateCheck(){
  const input=$("merchant_order_no"),merchant=$("merchant");
  if(input){clearTimeout(window.__dupTimer);input.oninput=()=>{clearTimeout(window.__dupTimer);window.__dupTimer=setTimeout(checkOrderNumberDuplicate,260);};}
  if(merchant)merchant.onchange=checkOrderNumberDuplicate;
}
function bindOrderSaveButton(isEdit=false){
  const button=$("orderSaveButton");
  if(!button)return;
  button.addEventListener("click",async event=>{
    event.preventDefault();
    event.stopPropagation();
    // Close any still-open searchable dropdown before starting the save request.
    ["merchantOptions","govOptions","areaOptions","streetOptions"].forEach(id=>{const menu=$(id);if(menu){menu.hidden=true;menu.classList.remove("open");}});
    button.disabled=true;
    const original=button.textContent;
    button.textContent=L("Saving…","جارٍ الحفظ…");
    try{
      if(isEdit) await updateOrderFromForm();
      else await saveOrder();
    }catch(error){
      console.error("Order save button failed",error);
      msg("orderMsg",error?.message||L("Could not save order","تعذر حفظ الأوردر"),"error");
    }finally{
      if(button.isConnected){button.disabled=false;button.textContent=original;}
    }
  });
}

function readOrderForm(){
  const codRaw=$("value")?.value;
  const feeRaw=$("delivery_fee")?.value;
  return {serial_no:Number($("serial")?.value),serial_date:$("order_entry_date")?.value||today(),order_code:$("order_code")?.value.trim(),tracking_number:$("tracking_number")?.value.trim(),shipment_no:$("shipment_no")?.value.trim(),job_code:$("job_code")?.value.trim(),merchant_id:$("merchant")?.value,merchant_order_no:$("merchant_order_no")?.value.trim(),reference_number:$("reference_number")?.value.trim(),customer_name:$("customer_name")?.value.trim(),customer_phone:$("customer_phone")?.value.trim(),customer_phone_2:$("customer_phone_2")?.value.trim(),governorate_id:$("gov")?.value||null,area_id:$("area")?.value||null,address:[$("address")?.value.trim(),$("streetSearch")?.value.trim()].filter(Boolean).join(", "),value:baseAmount(codRaw||0),delivery_fee:baseAmount(feeRaw||0),service_charges:baseAmount(feeRaw||0),notes:$("notes")?.value.trim()};
}
async function openOrder(id,returnPage="shipments"){try{const d=await api("/api/orders/"+encodeURIComponent(id));const detail=d.data;const [m,g,a]=await Promise.all([api("/api/merchants"),api("/api/governorates"),api("/api/areas")]);const order={...(detail.order||{}),area_id:detail.area?.id||detail.order?.area_id||detail.shipment?.area_id||detail.order?.area?.id||"",governorate_id:detail.area?.governorate_id||detail.governorate?.id||detail.order?.governorate_id||detail.shipment?.governorate_id||"",area_name:detail.area?.name_en||detail.area?.name_ar||detail.order?.area_name||detail.shipment?.area_name||detail.order?.area?.name_en||detail.order?.area?.name_ar||"",area:detail.area||detail.order?.area||null,shipment:detail.shipment||null};$("content").innerHTML=orderFormHtml(order.serial_no||1,m.data||[],g.data||[],a.data||[],order,returnPage,order.shipment?.job_code||"");bindOrderSaveButton(true);$("merchant")?.addEventListener("change",loadMerchantFee);$("merchant")?.addEventListener("change",updateShipperPhoneInline);setupOrderForm(a.data||[],g.data||[]);setupSearchSelect("merchant",m.data||[],"merchantSearch","merchantOptions",x=>merchantLabel(x));setupSearchSelect("gov",g.data||[],"govSearch","govOptions",x=>L(x.name_en,x.name_ar));wireOrderDuplicateCheck();wireWantedCustomerWarning();updateShipperPhoneInline();loadMerchantFee();}catch(e){alert(e.message);}}
async function checkOrderNumberDuplicate(){
  const merchantId=$("merchant")?.value||"", orderNo=$("merchant_order_no")?.value?.trim()||"", box=$("orderDuplicateMsg");
  if(!box)return false;
  if(!merchantId||!orderNo){box.innerHTML="";return false;}
  try{
    const d=await api(`/api/orders/check-duplicate?merchant_id=${encodeURIComponent(merchantId)}&merchant_order_no=${encodeURIComponent(orderNo)}`);
    if(d.duplicate){box.innerHTML=`<span class="error">Dublicate — ${L("Order number already exists","رقم الأوردر موجود بالفعل على السيستم")}</span>`;return true;}
    box.innerHTML=`<span class="ok">${L("Available","الرقم متاح")}</span>`;return false;
  }catch(_){box.innerHTML="";return false;}
}
function syncVisibleOrderAreaSelection(){
  const select=$("area"),input=$("areaSearch");
  if(!select||select.value||!input||!input.value.trim())return;
  const norm=v=>String(v||"").normalize("NFKC").toLowerCase().replace(/[\\u064B-\\u065F\\u0670]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^\\p{L}\\p{N}]+/gu," ").trim().replace(/\\s+/g," ");
  const q=norm(input.value);
  const matches=[...select.options].filter(o=>o.value&&norm(o.textContent)===q);
  if(matches.length===1)select.value=matches[0].value;
}
let __savingOrder = false;
async function saveOrder(){
  if(__savingOrder)return;
  syncVisibleOrderAreaSelection();
  msg("orderMsg",L("Starting save…","جاري بدء حفظ الأوردر…"));
  const saveButton=[...document.querySelectorAll('#content button')].find(b=>/Save|حفظ/.test(b.textContent||''));
  __savingOrder=true;
  if(saveButton){saveButton.disabled=true;saveButton.dataset.originalText=saveButton.textContent;saveButton.textContent=L('Saving…','جارٍ الحفظ…');}
  const b=readOrderForm();
  try{
    if(!b.merchant_order_no)throw new Error(L('Enter the shipper order number','أدخل رقم أوردر التاجر'));
    if(!b.merchant_id)throw new Error(L('Select a shipper','اختر التاجر'));
    if(!b.governorate_id)throw new Error(L('Select an emirate','اختر الإمارة'));
    if(!b.area_id)throw new Error(L('Select an area','اختر المنطقة'));
    // The server performs the authoritative duplicate check during creation.
    // Avoid a second network round-trip here; the live field warning remains available while typing.
    const d=await api("/api/orders",{method:"POST",body:JSON.stringify(b)});
    if(d?.success===false)throw new Error(d.message||d.error||L('Order was not saved','لم يتم حفظ الأوردر'));
    const warning=d.jobCodeDuplicate?` — ${L("Warning: Job Code is already used","تحذير: الـ Job Code مستخدم بالفعل")}`:"";
    const saveDuration=Number(d.duration_ms||0);
    const saveTiming=saveDuration>0?` — ${L('Save time','زمن الحفظ')}: ${(saveDuration/1000).toFixed(1)}s`:'';
    const successMessage=`${L("Saved successfully","تم حفظ الأوردر بنجاح")} — ${L("Order No.","رقم الأوردر")}: ${esc(b.merchant_order_no||"")} — ${L("Tracking Number","رقم الشحنة")}: ${esc(d.trackingNumber||"")} — Job Code: ${esc(d.jobCode||b.job_code||"")}${warning}${saveTiming}`;
    const cache=window.__orderEntryCache;
    if(cache&&$("content")){
      // Reset locally after confirmed save instead of reloading five endpoints and all dropdown data.
      const nextSerial=Number(d.order?.serial_no||b.serial_no||0)+1;
      const savedJob=String(d.jobCode||b.job_code||'');
      const nextJob=/^\d+$/.test(savedJob)?Number(savedJob)+1:savedJob;
      await mountNewOrderForm($("content"),cache.merchants,cache.govs,cache.areas,nextSerial,nextJob);
      msg("orderMsg",successMessage,d.jobCodeDuplicate?"duplicate":"ok");
      const el=$("merchant_order_no"); if(el){el.focus();el.select?.();}
    }else{
      msg("orderMsg",successMessage,d.jobCodeDuplicate?"duplicate":"ok");
      setTimeout(async()=>{await show("order");setTimeout(()=>{$("merchant_order_no")?.focus();},120);},250);
    }
  }catch(e){msg("orderMsg",e.message,"error");}
  finally{__savingOrder=false;if(saveButton){saveButton.disabled=false;saveButton.textContent=saveButton.dataset.originalText||L('Save','حفظ');delete saveButton.dataset.originalText;}}
}
async function updateOrderFromForm(){const b=readOrderForm();b.id=$("edit_order_id").value;const returnPage=$("edit_return_page")?.value||"shipments";try{await api("/api/orders",{method:"PATCH",body:JSON.stringify(b)});msg("orderMsg",L("Updated successfully","تم تعديل الأوردر بنجاح"),"ok");setTimeout(()=>show(returnPage),600);}catch(e){msg("orderMsg",e.message,"error");}}

function searchShortcutMarkup(inputId){return `<div class="search-shortcut-grid" aria-label="${L("Search shortcuts","اختصارات البحث")}">
  <button type="button" class="search-shortcut-card shortcut-order" data-search-hint="order" data-search-input="${inputId}"><span class="search-shortcut-icon">▣</span><span><b>${L("Order","الأوردر")}</b><small>${L("Order or tracking number","رقم الأوردر أو التتبع")}</small></span><span class="search-shortcut-arrow">›</span></button>
  <button type="button" class="search-shortcut-card shortcut-driver" data-search-hint="driver" data-search-input="${inputId}"><span class="search-shortcut-icon">♙</span><span><b>${L("Driver","المندوب")}</b><small>${L("Driver name or phone","اسم المندوب أو هاتفه")}</small></span><span class="search-shortcut-arrow">›</span></button>
  <button type="button" class="search-shortcut-card shortcut-merchant" data-search-hint="merchant" data-search-input="${inputId}"><span class="search-shortcut-icon">▤</span><span><b>${L("Shipper","التاجر")}</b><small>${L("Shipper name","اسم التاجر")}</small></span><span class="search-shortcut-arrow">›</span></button>
  <button type="button" class="search-shortcut-card shortcut-phone" data-search-hint="phone" data-search-input="${inputId}"><span class="search-shortcut-icon">☎</span><span><b>${L("Phone","الهاتف")}</b><small>${L("Customer phone number","رقم هاتف العميل")}</small></span><span class="search-shortcut-arrow">›</span></button>
</div>`;}
function wireSearchShortcuts(inputId){document.querySelectorAll(`.search-shortcut-card[data-search-input="${inputId}"]`).forEach(btn=>btn.addEventListener("click",()=>{const input=$(inputId);if(!input)return;const hints={order:L("Enter order or tracking number…","أدخل رقم الأوردر أو التتبع…"),driver:L("Enter driver name or phone…","أدخل اسم المندوب أو هاتفه…"),merchant:L("Enter shipper name…","أدخل اسم التاجر…"),phone:L("Enter customer phone number…","أدخل رقم هاتف العميل…")};input.placeholder=hints[btn.dataset.searchHint]||input.placeholder;input.focus();document.querySelectorAll(`.search-shortcut-card[data-search-input="${inputId}"]`).forEach(x=>x.classList.toggle("active",x===btn));}));}
function recentSearchKey(inputId){return `trend-delivery-recent-searches:${inputId}`;}
function getRecentSearches(inputId){try{const a=JSON.parse(localStorage.getItem(recentSearchKey(inputId))||"[]");return Array.isArray(a)?a.filter(x=>typeof x==="string").slice(0,6):[];}catch(_){return [];}}
function rememberSearchQuery(inputId,q){const value=String(q||"").trim();if(!value)return;const list=[value,...getRecentSearches(inputId).filter(x=>x.toLowerCase()!==value.toLowerCase())].slice(0,6);try{localStorage.setItem(recentSearchKey(inputId),JSON.stringify(list));}catch(_){}}
function renderRecentSearches(inputId){const target=$(inputId==="quickSearch"?"quickRecentSearches":"searchRecentSearches");if(!target)return;const list=getRecentSearches(inputId);target.innerHTML=list.map(q=>`<button type="button" class="search-recent-chip" data-recent-query="${esc(q)}" title="${esc(q)}">${esc(q)}<span aria-hidden="true">×</span></button>`).join("")||`<span class="search-recent-empty">${L("Your recent searches will appear here","عمليات البحث الأخيرة هتظهر هنا")}</span>`;target.querySelectorAll(".search-recent-chip").forEach(btn=>btn.addEventListener("click",()=>{const input=$(inputId);if(input){input.value=btn.dataset.recentQuery||"";input.focus();}}));}
function clearRecentSearches(inputId){try{localStorage.removeItem(recentSearchKey(inputId));}catch(_){}renderRecentSearches(inputId);}

function searchPage(c){c.innerHTML=`<div class="panel search-page-panel search-workspace-card search-workspace-compact"><div class="search-input-shell search-page-controls"><span class="search-input-icon">⌕</span><input id="searchQ" aria-label="${esc(t("Search"))}" placeholder="${esc(L("Shipment number, tracking, customer name or phone…","رقم الشحنة أو التتبع أو اسم العميل أو الهاتف…"))}"><button onclick="doSearch()"><span>⌕</span> ${t("Search")}</button></div><div id="searchLookupSummary" class="quick-lookup-summary" aria-live="polite"></div><div class="search-page-layout"><div class="search-page-result-column"><div class="search-section-heading"><span class="search-section-icon blue">▤</span><b>${L("Order Results","نتائج الأوردرات")}</b></div><div id="searchResult" class="search-page-result"></div></div><div class="search-timeline-column"><div class="search-section-heading"><span class="search-section-icon violet">◷</span><b>${L("Movement Timeline","الخط الزمني للحركات")}</b></div><div id="searchTimeline" class="quick-search-timeline-empty"><span class="muted">${L("Search for an order to view its timeline here.","ابحث عن أوردر لعرض سجل حركاته هنا.")}</span></div></div></div><div class="search-recent-row search-recent-row-compact"><div class="search-section-heading"><span class="search-section-icon navy">◷</span><b>${L("Recent Searches","عمليات البحث الأخيرة")}</b></div><div id="searchRecentSearches" class="search-recent-chips"></div><button type="button" class="search-clear-recent" onclick="clearRecentSearches('searchQ')">${L("Clear All","مسح الكل")}</button></div></div>`;$ ("searchQ")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doSearch();}});renderRecentSearches("searchQ");}
async function doSearch(){
  const q=$("searchQ")?.value.trim();
  if(!q)return msg("searchResult",L("Enter a search value","اكتب قيمة البحث"),"error");
  rememberSearchQuery("searchQ",q); renderRecentSearches("searchQ");
  try{
    const data=await api("/api/search?q="+encodeURIComponent(q));
    window.__searchPayloads.search=data; window.__activeSearchScope="search";
    $("searchResult").innerHTML=renderSearch(data);
    renderLookupSummary(data,"searchLookupSummary");
    const results=Array.isArray(data?.results)?data.results:(data?.data?[data.data]:[]);
    const timeline=$("searchTimeline");
    if(results.length===1)renderSearchMovementTimeline(results[0],"searchTimeline");
    else if(timeline){timeline.className="quick-search-timeline-empty";timeline.innerHTML=`<span class="muted">${results.length?L("Choose one exact order to view its timeline.","اختر الأوردر المطلوب لعرض سجل حركاته."):L("No order found.","لم يتم العثور على الأوردر.")}</span>`;}
  }catch(e){msg("searchResult",e.message,"error");}
}


function searchStatusClass(value){
  const s=String(value||"").toLowerCase();
  if(/deliver|completed/.test(s)) return "search-status-delivered";
  if(/pending|cancel/.test(s)) return "search-status-pending";
  if(/return|replaced/.test(s)) return "search-status-returned";
  if(/ops|hub|received/.test(s)) return "search-status-ops";
  if(/assign|driver|scheduled/.test(s)) return "search-status-assigned";
  return "search-status-neutral";
}

async function copySearchPhone(phone){
  const value=String(phone||"").trim(); if(!value)return;
  try{await navigator.clipboard.writeText(value);msg("quickResult",L("Phone number copied.","تم نسخ رقم الهاتف."),"ok");}
  catch(_){const field=document.createElement("textarea");field.value=value;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();try{document.execCommand("copy");msg("quickResult",L("Phone number copied.","تم نسخ رقم الهاتف."),"ok");}catch(__){msg("quickResult",L("Could not copy the number.","تعذر نسخ الرقم."),"error");}field.remove();}
}
window.copySearchPhone=copySearchPhone;

function renderSearchProofButtons(x){
  const proofs=x?.search_proofs||{}; const accounting=Array.isArray(proofs.accounting)?proofs.accounting:[]; const ret=proofs.return;
  const one=(kind,p,label)=>`<button type="button" class="mini-btn search-proof-chip" title="${esc(label)}${p.file_name?`: ${esc(p.file_name)}`:''}" onclick="event.stopPropagation();openSearchProof('${kind}','${esc(p.id)}')">${kind==='accounting'?'🧾':'↩'} ${esc(label)}</button>`;
  const bits=[...accounting.map(p=>one('accounting',p,L('Accounting receipt','إثبات الحسابات'))),...(ret?[one('return',ret,L('Return receipt','إثبات المرتجعات'))]:[])];
  return bits.length?`<div class="search-proof-list">${bits.join('')}</div>`:'';
}
function previewSystemAttachment(url,title){
  if(!url)return;
  document.getElementById('trendAttachmentPreviewModal')?.remove();
  const host=document.createElement('div');host.id='trendAttachmentPreviewModal';host.className='trend-attachment-preview-backdrop';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');
  const safeTitle=String(title||L('Attachment preview','معاينة المرفق'));
  host.innerHTML=`<div class="trend-attachment-preview-card"><div class="trend-attachment-preview-head"><strong>${esc(safeTitle)}</strong><button type="button" class="ghost" aria-label="Close" data-attachment-close>✕</button></div><div class="trend-attachment-preview-body"><div class="trend-attachment-preview-loading">${L('Loading attachment…','جارٍ تحميل المرفق…')}</div><img class="trend-attachment-preview-image" alt="${esc(safeTitle)}" hidden><iframe class="trend-attachment-preview-frame" title="${esc(safeTitle)}" hidden></iframe><div class="trend-attachment-preview-error" hidden>${L('Could not display this attachment. Check your access and try again.','تعذر عرض المرفق. تحقق من الصلاحية وحاول مرة أخرى.')}</div></div></div>`;
  document.body.appendChild(host);
  const img=host.querySelector('img'),frame=host.querySelector('iframe'),loading=host.querySelector('.trend-attachment-preview-loading'),error=host.querySelector('.trend-attachment-preview-error');
  const close=()=>host.remove();host.querySelector('[data-attachment-close]').addEventListener('click',close);host.addEventListener('click',e=>{if(e.target===host)close();});
  const onKey=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',onKey);}};document.addEventListener('keydown',onKey);
  img.onload=()=>{loading.hidden=true;img.hidden=false;};
  img.onerror=()=>{img.hidden=true;frame.hidden=false;frame.src=url;loading.hidden=true;frame.onload=()=>{};window.setTimeout(()=>{if(frame.hidden===false){error.hidden=true;}},400);};
  frame.addEventListener('error',()=>{frame.hidden=true;error.hidden=false;});
  img.src=url;
}
window.previewSystemAttachment=previewSystemAttachment;
function openSearchProof(kind,id){
  if(!id||!['accounting','return'].includes(kind))return;
  previewSystemAttachment(`/api/search/proof/${kind}/${encodeURIComponent(id)}`,kind==='accounting'?L('Accounting receipt','إثبات الحسابات'):L('Return receipt','إثبات المرتجعات'));
}
window.openSearchProof=openSearchProof;
// Open stored proofs/attachments inside the application; images render as images, PDFs in the document viewer.
if(!window.__trendAttachmentPreviewClickBound){window.__trendAttachmentPreviewClickBound=true;document.addEventListener('click',function(e){const a=e.target?.closest?.('a[href]');if(!a)return;const href=a.getAttribute('href')||'';if(!/(?:\/proof(?:\/|\?|$)|\/file(?:\/|\?|$))/.test(href)||href.startsWith('javascript:'))return;e.preventDefault();e.stopPropagation();previewSystemAttachment(a.href,a.getAttribute('aria-label')||a.title||a.textContent.trim()||L('Attachment preview','معاينة المرفق'));},true);}

function searchDeliveryDate(x){
  const o=x?.order||x||{}; const sh=x?.shipment||{};
  const raw=o.delivery_date||o.delivered_at||o.actual_delivery_date||o.delivery_completed_at||sh.delivery_date||sh.delivered_at||sh.actual_delivery_date||o.driver_scheduled_date||x?.delivery_date||x?.delivered_at||x?.actual_delivery_date||x?.delivery_completed_at||x?.driver_scheduled_date||'';
  if(!raw)return '—';
  const value=String(raw).trim();
  const match=value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?match[0]:value.replace('T',' ').slice(0,10);
}
function renderSearch(d){
  const results=Array.isArray(d?.results)?d.results:(d?.data?[d.data]:[]);
  if(!results.length)return `<p class="muted">${t("No data")}</p>`;
  if(results.length>1){
    return `<div class="panel search-multiple-results search-match-cards search-match-compact-table"><div class="section-title-row"><div><h3>${L("Closest matches","أقرب النتائج")}</h3><p class="muted">${L("Choose the matching order to open its full details.","اضغط على صف الأوردر المطلوب لفتح كل بياناته.")}</p></div><span class="history-count">${results.length}</span></div><div class="search-match-table-wrap"><table class="search-match-table"><thead><tr><th>${L("Coupon / Order No.","رقم الكوبون")}</th><th>${L("Customer phone","رقم التليفون")}</th><th>${L("Shipper","التاجر")}</th><th>${L("Status","الحالة")}</th></tr></thead><tbody>${results.map((x,i)=>{const o=x.order||x;const phone=o.customer_phone||o.customer?.phone||o.customer_phone_1||x.phone||"—";const coupon=o.merchant_order_no||o.order_code||o.coupon_number||o.id||"—";const status=o.status||x.status||x.current_status||"—";return `<tr role="button" tabindex="0" aria-label="${L("Open matching order","فتح الأوردر المطابق")}" onclick="selectSearchOrder('${window.__activeSearchScope||'search'}',${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectSearchOrder('${window.__activeSearchScope||'search'}',${i})}"><td><b>${esc(coupon)}</b><small>${esc(x.tracking_number||x.shipment?.tracking_number||x.shipment_no||x.shipment?.shipment_no||'—')}</small></td><td>${esc(phone)}</td><td>${esc(merchantLabel(x.merchant)||'—')}</td><td><span class="badge ${searchStatusClass(status)}">${esc(status)}</span></td></tr>`}).join('')}</tbody></table></div></div>`;
  }
  const d1={...d,data:results[0]};
  const x=d1.data; const o=x.order||x; const id=o.id||x.order_id;
  const tracking=x.tracking_number||x.shipment?.tracking_number||x.shipment_no||x.shipment?.shipment_no||"";
  const logs=(x.audit||[]).slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const history=[...(x.history||[]),...(x.audit||[]).filter(r=>r.history_type!=="status")].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const specialScheduledDate=r=>{
    const d=r?.details;
    if(d&&typeof d==="object"){
      const candidates=[d.scheduled_date,d.driver_scheduled_date,d.date,d.after?.driver_scheduled_date,d.after?.scheduled_date,d.after?.date];
      const hit=candidates.find(v=>v); if(hit)return String(hit).slice(0,10);
    }
    return "";
  };
  const historyRows=history.map(r=>{const details=typeof r.details==="object"?JSON.stringify(r.details):String(r.details||r.note||r.notes||r.comment||"");const action=movementHistoryLabel(r.status||r.action||"");const sd=specialScheduledDate(r);return `<tr><td>${esc((r.created_at||"").replace("T"," ").slice(0,19))}</td><td>${esc(merchantLabel(x.merchant))}</td><td>${esc(action)}</td><td>${sd?`<b>${L("Scheduled date","تاريخ التنفيذ")}: ${esc(sd)}</b>`:"—"}</td><td>${esc(r.user_name||"System")}</td><td>${esc(r.employee_code||"")}</td><td>${esc(details)}</td></tr>`}).join("");
  const timelineRows=history.map((r,i)=>{const status=r.status||r.action||"";const when=(r.created_at||"").replace("T"," ").slice(0,19);const sd=specialScheduledDate(r);const note=r.note||r.notes||r.comment||r.reason||"";const actor=r.user_name||r.employee_name||r.updated_by_name||r.employee_code||"System";return `<div class="shipment-timeline-item ${i===history.length-1?'current':''}"><div class="shipment-timeline-dot"></div><div class="shipment-timeline-content"><div class="shipment-timeline-top"><b>${esc(movementHistoryLabel(status))}</b><span>${esc(when)}</span></div>${sd?`<div><b>${L("Scheduled date","تاريخ التنفيذ")}: ${esc(sd)}</b></div>`:""}<div class="muted">${esc(actor)}${note?` — ${esc(note)}`:""}</div></div></div>`}).join("");
  const currentStatus=x.status||x.current_status||x.shipment?.status||o.status||history.at(-1)?.status||"";
  const invoiceStatus=x.invoice_status||x.return_transaction?.original_status||o.invoice_status||o.original_status||o.status||currentStatus;
  const orderNo=o.merchant_order_no||o.order_code||o.id||"—";
  const shipmentNo=tracking||x.shipment_no||x.shipment?.shipment_no||"—";
  const driver=x.driver||x.assigned_driver||null;
  const driverName=driver?.name||x.driver_name||"—";
  const driverCode=driver?.driver_no||"—";
  const merchant=x.merchant||{};
  const merchantName=merchant.name||"—";
  const merchantCode=merchant.merchant_no||merchant.code||merchant.external_code||"—";
  const merchantPhone=merchant.phone||merchant.contact_phone||merchant.mobile||merchant.phone_number||"";
  const merchantEmail=merchant.email||"";
  const phone=String(o.customer_phone||o.customer?.phone||x.phone||"");
  const phone2=String(o.customer_phone_2||"");
  const orderValue=o.value??o.order_value??o.amount??0;
  const statusHtml=`<span class="badge ${searchStatusClass(currentStatus)}">${esc(currentStatus||"—")}</span>`;
  const isOrderPaid=String(o.commission_paid_status||o.paid_status||o.cash_collection_status||o.payment_status||'').toLowerCase()==='paid';
  const paymentStatusHtml=isOrderPaid?`<span class="verify-badge paid-pill">Paid</span>`:`<span class="muted">${L('Unpaid','غير مدفوع')}</span>`;
  const detailItems=[
    [L("Customer name","اسم العميل"),o.customer_name||x.name],
    [L("Address","العنوان"),o.address||o.customer_address||o.delivery_address],
    [L("Governorate","المحافظة"),x.governorate?.name_ar||x.governorate?.name_en||o.governorate_name||o.governorate],
    [L("Area","المنطقة"),x.area?.name_ar||x.area?.name_en||o.area_name||o.area],
    [L("Delivery Date","تاريخ التوصيل"),searchDeliveryDate(x)==="—"?"":searchDeliveryDate(x)],
    [L("Created at","تاريخ الإنشاء"),o.created_at?String(o.created_at).replace("T"," ").slice(0,19):""],
    [L("Scheduled date","تاريخ التنفيذ"),o.driver_scheduled_date||x.driver_scheduled_date],
    [L("Invoice status","حالة الفاتورة"),invoiceStatus],
    [L("Scan driver","مندوب المسح"),x.scan?.driver_name],
    [L("Scan employee","موظف المسح"),x.scan?.employee_name],
    [L("Scan date","تاريخ المسح"),x.scan?.scan_date],
    [L("Customer phone 2","هاتف العميل البديل"),phone2],
    [L("Notes","ملاحظات"),o.notes||o.note||o.customer_notes||o.delivery_notes],
    [L("Items / contents","محتويات الأوردر"),o.items_summary||o.products_summary||o.description]
  ].filter(v=>v[1]!==null&&v[1]!==undefined&&String(v[1]).trim()!=="");
  return `<div class="panel order-search-card search-order-detail-card">
    <div class="search-order-cards-grid">
      <section class="search-info-card search-info-order"><div class="search-info-card-head"><span class="search-info-icon">▣</span><b>Order <small>الأوردر</small></b></div><div class="search-info-primary">${esc(orderNo)}</div><div class="search-info-row"><span>${L("Shipment code","كود الشحنة")}</span><b>${esc(shipmentNo)}</b></div><div class="search-info-row"><span>${L("Generation operation no.","رقم عملية التوليد")}</span><b>${esc((x.account_transaction_numbers||[x.account_transaction_number]).filter(Boolean).join(" / ")||"—")}</b></div><div class="search-info-row"><span>${L("Return operation no.","رقم عملية المرتجعات")}</span><b>${esc((x.return_operation_numbers||[x.return_operation_number]).filter(Boolean).join(" / ")||"—")}</b></div><div class="search-info-row search-proof-row"><span>${L("Proofs","الإثباتات")}</span><div>${renderSearchProofButtons(x)||"—"}</div></div><div class="search-info-row"><span>${L("Delivery Date","تاريخ التوصيل")}</span><b>${esc(searchDeliveryDate(x))}</b></div><div class="search-info-row"><span>${L("Status","الحالة")}</span>${statusHtml}</div><div class="search-info-row"><span>${L("Payment status","حالة الدفع")}</span>${paymentStatusHtml}</div><div class="search-info-row"><span>${L("Customer phone","رقم العميل")}</span><b>${esc(phone||"—")}</b></div><div class="search-info-row"><span>${L("Driver","اسم المندوب")}</span><b>${esc(driverName||"—")}</b></div><div class="search-info-row"><span>${L("Job code","كود المهمة")}</span><b>${esc(x.job_code||x.shipment?.job_code||"—")}</b></div><div class="search-info-row"><span>${L("Order value","قيمة الأوردر")}</span><b>${esc(money(orderValue))}</b></div><div class="search-info-row"><span>${L("Delivery fee","رسوم التوصيل")}</span><b>${esc(money(o.delivery_fee??o.service_charges??0))}</b></div></section>
      <section class="search-info-card search-info-merchant"><div class="search-info-card-head"><span class="search-info-icon">▦</span><b>Shipper <small>التاجر</small></b></div><div class="search-info-primary">${esc(merchantName)}</div><div class="search-info-row"><span>${L("Shipper code","كود التاجر")}</span><b>${esc(merchantCode)}</b></div><div class="search-info-row"><span>${L("Phone","الهاتف")}</span><b>${merchantPhone?esc(merchantPhone):"—"}</b></div><div class="search-info-row"><span>${L("Email","البريد الإلكتروني")}</span><b class="search-info-wrap">${merchantEmail?esc(merchantEmail):"—"}</b></div></section>

    </div>
    <section class="search-extra-details"><div class="search-extra-heading"><span>☷</span><div><h4>${L("Additional order details","باقي تفاصيل الأوردر")}</h4><p>${L("Only details not shown in the cards above","بيانات إضافية غير مكررة في الكروت بالأعلى")}</p></div></div><div class="search-extra-grid">${detailItems.length?detailItems.map(([label,value])=>`<div class="search-extra-item"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join(""):`<p class="muted">${L("No additional details available.","لا توجد تفاصيل إضافية مسجلة.")}</p>`}</div></section>
    <div class="actions search-order-actions"><button onclick="openOrder('${esc(id)}')">${t("Edit")}</button><button class="ghost" onclick='exportRowsExcel([${JSON.stringify({...o,tracking_number:tracking})}],"search-result")'>${t("Export Excel")}</button><button class="ghost" onclick='printRowsPDF([${JSON.stringify({...o,tracking_number:tracking})}],"${esc(o.merchant_order_no||o.order_code||"order")}")'>${t("Print / PDF")}</button><button class="ghost" onclick='printShippingLabels([${JSON.stringify({...o,tracking_number:tracking,job_code:x.job_code||x.shipment?.job_code||"",merchant_label:merchantLabel(x.merchant),region:x.area?.name_ar||x.area?.name_en||""})}])'>${L("Shipping Label","ملصق الشحن")}</button></div>
  </div>`;
}



/* ===== FRONTEND MODULE BOUNDARY ===== */

function operationsPriceValue(r){return Number(r?.order?.cod??r?.order?.value??r?.order?.order_value??r?.order?.price??r?.cod??r?.value??r?.order_value??r?.price??0)||0;}
function operationsMoney(value){return new Intl.NumberFormat(LANG==="ar"?"ar-EG":"en-US",{maximumFractionDigits:2}).format(Number(value)||0);}
function refreshOperationsPriceSummary(){
  const totalEl=$("opsPriceTotal");if(!totalEl)return;
  const selectedIds=window.__operationsSelectedShipments||new Set();
  const all=Array.isArray(window.__operationsRows)?window.__operationsRows:[];
  const byId=new Map(all.map(r=>[String(r.id||r.shipment_id||""),r]));
  let total=0;
  if(selectedIds.size){for(const id of selectedIds){const r=byId.get(String(id));if(r)total+=operationsPriceValue(r);}}
  else total=(Array.isArray(window.__opsFilteredRows)?window.__opsFilteredRows:[]).reduce((sum,r)=>sum+operationsPriceValue(r),0);
  totalEl.textContent=operationsMoney(total);
  const label=totalEl.closest(".operations-count-total");if(label)label.title=selectedIds.size?L("Total price of selected shipments","إجمالي أسعار الشحنات المحددة"):L("Total price of filtered shipments","إجمالي أسعار الشحنات المعروضة");
}
function shipmentDefaultTo(){return localDateISO();}
function shipmentDefaultFrom(){const d=new Date(); d.setDate(d.getDate()-7); return localDateISO(d);}
function toggleShipmentFilters(){const boxes=document.querySelectorAll(".shipment-filters-panel"); if(!boxes.length)return; const open=!Array.from(boxes).some(x=>x.classList.contains("open")); boxes.forEach(x=>x.classList.toggle("open",open)); document.querySelectorAll("#shipmentFilterBtn").forEach(btn=>btn.setAttribute("aria-expanded",open?"true":"false"));}
function operationsDashboardPage(c){
  c.innerHTML=`<div class="operations-dashboard-heading-row"><h2 class="operations-dashboard-title">${L("Operations Dashboard","لوحة عمليات الشحن")}</h2><label class="operations-heading-search" aria-label="${esc(L("Search orders","البحث عن الأوردرات"))}"><span aria-hidden="true">⌕</span><input id="opsSearch" type="search" placeholder="${esc(L("Tracking / Order / Customer / Shipper","التتبع / الأوردر / العميل / الشاحن"))}"><button type="button" onclick="document.getElementById('opsSearch')?.focus()" aria-label="${esc(L("Focus search","التركيز على البحث"))}">⌕</button></label></div>
  <div class="operations-dashboard-toolbar-wrap">
    <div class="operations-dashboard-toolbar">
      <label>${t("From")}<input id="opsFrom" type="date" value=""></label>
      <label>${t("To")}<input id="opsTo" type="date" value=""></label>
      <button type="button" class="ghost ops-filter-toggle" onclick="toggleOperationsFilters()">☰ ${L("Filters","الفلاتر")}</button>
      <div class="operations-toolbar-actions">
        <button type="button" onclick="openOperationsBulkActions()"><span class="ops-bulk-trigger-icon" aria-hidden="true">⚙</span><span>${L("Bulk Actions","إجراءات المحدد")}</span></button>
        <span id="opsSelectedCount" class="muted"></span>
        <span class="operations-count-label operations-count-3d" title="${L("Shipments","الشحنات")}"><span class="operations-count-3d-icon" aria-hidden="true">▦</span><span class="operations-count-copy"><span class="operations-count-shipment-line">${L("Shipments","الشحنات")}: <b id="opsCount">0</b></span><small class="operations-count-total">${L("Total price","إجمالي السعر")}: <b id="opsPriceTotal">0</b></small></span></span>
        <button type="button" class="ghost operations-label-pdf-btn" onclick="printSelectedOperationsLabels()">▤ ${L("Label PDF","ملصقات PDF")}</button>
      </div>
    </div>
    <div id="opsFiltersPanel" class="operations-filters-panel" hidden>
      <label>${L("Driver","المندوب")}<select id="opsDriverFilter"><option value="">${L("All drivers","كل المندوبين")}</option></select></label>
      <label>${L("Shipper","الشاحن")}<select id="opsShipperFilter"><option value="">${L("All shippers","كل الشاحنين")}</option></select></label>
      <label>${L("Emirate","الإمارة")}<select id="opsGovernorateFilter"><option value="">${L("All emirates","كل الإمارات")}</option></select></label>
      <label>${L("Area","المنطقة")}<select id="opsAreaFilter" disabled><option value="">${L("All areas","كل المناطق")}</option></select></label>
      <label>${t("Status")}<select id="opsStatus"><option value="">${L("All statuses","كل الحالات")}</option>${SYSTEM_STATUSES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
    </div>
  </div>
  <div class="panel operations-top-table-panel"><div id="opsList"></div></div>`;
  ["opsFrom","opsTo","opsStatus","opsDriverFilter","opsShipperFilter","opsGovernorateFilter","opsAreaFilter"].forEach(id=>$(id)?.addEventListener("change",()=>{captureOperationsDashboardState();loadOperationsDashboard();}));
  let opsSearchTimer;
  $("opsSearch")?.addEventListener("input",()=>{clearTimeout(opsSearchTimer);captureOperationsDashboardState();opsSearchTimer=setTimeout(()=>loadOperationsDashboard(),180);});
  $("opsSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();clearTimeout(opsSearchTimer);loadOperationsDashboard();}});
  let saved=getOperationsDashboardState();
  if(saved.version!==3){saved={...saved,version:3};try{sessionStorage.setItem('trend_operations_dashboard_state',JSON.stringify(saved));}catch(_){} }
  // Default to the most recent seven days (including today), while retaining any user-selected dates.
  $('opsFrom').value=saved.from||shipmentDefaultFrom(); $('opsTo').value=saved.to||shipmentDefaultTo(); if(saved.search)$('opsSearch').value=saved.search; if(saved.status)$('opsStatus').value=saved.status;
  const filtersPanel=$('opsFiltersPanel');if(filtersPanel)filtersPanel.hidden=saved.filtersOpen!==true;
  loadOperationsDashboard().then(()=>restoreOperationsDashboardState());
}
function toggleOperationsFilters(){const p=$("opsFiltersPanel");if(!p)return;p.hidden=!p.hidden;captureOperationsDashboardState();}
function setOperationsPageSize(value){const n=Number(value);window.__opsPageSize=[20,50,100,500,1000].includes(n)?n:20;loadOperationsDashboard({page:1});}
function toggleOperationsSidePanel(){/* kept for compatibility with older links */}
async function loadOperationsDashboard(options={}){
  const box=$("opsList"); if(!box)return;
  // Keep the existing table visible while refreshing; never blank the whole panel.
  const hadContent=!!box.querySelector("table");
  if(!window.__operationsSelectedShipments)window.__operationsSelectedShipments=new Set();
  try{
    const from=String($("opsFrom")?.value||""), to=String($("opsTo")?.value||"");
    const cacheKey=`${from}|${to}`;
    let cached=window.__opsDashboardDataCache;
    // Reuse the last company-scoped payload while changing search/filter/page or
    // reopening this icon. Only date changes or an explicit force refresh hit the API.
    if(!cached||cached.key!==cacheKey||options.force===true||Date.now()-cached.at>60000){
      const [d,g,a]=await Promise.all([api(`/api/shipments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),api("/api/governorates"),api("/api/areas")]);
      cached={key:cacheKey,at:Date.now(),shipments:d.data||[],governorates:g.data||[],areas:a.data||[]};
      window.__opsDashboardDataCache=cached;
    }
    const all=cached.shipments, governorates=cached.governorates, areas=cached.areas;
    window.__operationsRows=all;
    const driverSel=$("opsDriverFilter"), shipperSel=$("opsShipperFilter");
    const savedState=getOperationsDashboardState();
    const prevDriver=driverSel?.value||savedState.driver||"", prevShipper=shipperSel?.value||savedState.shipper||"";
    if(driverSel){const drivers=[...new Map(all.filter(r=>r.driver?.id).map(r=>[String(r.driver.id),r.driver])).values()].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));driverSel.innerHTML=`<option value="">${L("All drivers","كل المندوبين")}</option>`+drivers.map(x=>`<option value="${esc(x.id)}">${esc(x.name||"")} — ${esc(x.driver_no||"")}</option>`).join("");if(drivers.some(x=>String(x.id)===prevDriver))driverSel.value=prevDriver;}
    if(shipperSel){const shippers=[...new Map(all.filter(r=>r.merchant?.id).map(r=>[String(r.merchant.id),r.merchant])).values()].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));shipperSel.innerHTML=`<option value="">${L("All shippers","كل الشاحنين")}</option>`+shippers.map(x=>`<option value="${esc(x.id)}">${esc(x.name||"")} — ${esc(x.merchant_no||x.code||"")}</option>`).join("");if(shippers.some(x=>String(x.id)===prevShipper))shipperSel.value=prevShipper;}
    const govSel=$("opsGovernorateFilter"), areaSel=$("opsAreaFilter");
    const prevGov=govSel?.value||getOperationsDashboardState().governorate||"", prevArea=areaSel?.value||getOperationsDashboardState().area||"";
    if(govSel){govSel.innerHTML=`<option value="">${L("All emirates","كل الإمارات")}</option>`+governorates.slice().sort((a,b)=>String(L(a.name_en,a.name_ar)).localeCompare(String(L(b.name_en,b.name_ar)))).map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join("");if(governorates.some(x=>String(x.id)===String(prevGov)))govSel.value=prevGov;}
    const renderOpsAreas=()=>{const gid=govSel?.value||"";const list=areas.filter(x=>!gid||String(x.governorate_id)===String(gid)).sort((a,b)=>String(L(a.name_en,a.name_ar)).localeCompare(String(L(b.name_en,b.name_ar))));if(areaSel){areaSel.disabled=!gid;areaSel.innerHTML=`<option value="">${L("All areas","كل المناطق")}</option>`+list.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join("");if(list.some(x=>String(x.id)===String(prevArea)))areaSel.value=prevArea;}};
    renderOpsAreas();
    const sf=String($("opsStatus")?.value||"").toLowerCase(), gf=String($("opsGovernorateFilter")?.value||""), af=String($("opsAreaFilter")?.value||""), q=String($("opsSearch")?.value||"").trim(), df=String(driverSel?.value||""), mf=String(shipperSel?.value||"");
    const normSearch=v=>String(v??"").normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
    const compactSearch=v=>normSearch(v).replace(/\s+/g,"");
    const levenshteinSearch=(a,b)=>{a=String(a);b=String(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;if(a.length>b.length){const t=a;a=b;b=t;}let prev=Array.from({length:a.length+1},(_,i)=>i);for(let j=1;j<=b.length;j++){const cur=[j];for(let i=1;i<=a.length;i++)cur[i]=Math.min(cur[i-1]+1,prev[i]+1,prev[i-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}return prev[a.length];};
    const searchScore=r=>{
      if(!q)return 0;
      const needle=normSearch(q), compactQ=compactSearch(q);
      const fields=[r.tracking_number,r.shipment_no,r.job_code,r.order?.merchant_order_no,r.order?.order_code,r.order?.customer_name,r.order?.customer_phone,r.order?.customer_phone_2,r.merchant?.name,r.merchant?.merchant_no,r.merchant?.code,r.driver?.name,r.driver?.driver_no].filter(v=>v!==null&&v!==undefined).map(normSearch);
      let best=Infinity;
      for(const field of fields){if(!field)continue;const compact=field.replace(/\s+/g,"");if(field===needle||compact===compactQ)best=Math.min(best,0);else if(field.startsWith(needle)||compact.startsWith(compactQ))best=Math.min(best,10+Math.max(0,field.length-needle.length));else {const pos=field.indexOf(needle);const cpos=compact.indexOf(compactQ);if(pos>=0||cpos>=0)best=Math.min(best,25+Math.max(0,pos>=0?pos:cpos)*0.1);else if(needle.length>=3){const d=levenshteinSearch(compact,compactQ);const maxLen=Math.max(compact.length,compactQ.length);if(d/maxLen<=0.34)best=Math.min(best,60+(d/maxLen)*20);}}}
      return best;
    };
    let rows=all.filter(r=>{const st=String(displayShipmentStatus(r)||r.current_status||r.status||"");if(sf&&st.toLowerCase()!==sf)return false;if(df&&String(r.driver?.id||"")!==df)return false;if(mf&&String(r.merchant?.id||"")!==mf)return false;const rg=String(r.governorate?.id||r.governorate_id||r.order?.governorate_id||"");const ra=String(r.area?.id||r.area_id||r.order?.area_id||"");if(gf&&rg!==gf)return false;if(af&&ra!==af)return false;return !q||searchScore(r)<Infinity;});
    if(q) rows.sort((a,b)=>searchScore(a)-searchScore(b)||String(b.last_status_at||b.order?.updated_at||b.order?.created_at||"").localeCompare(String(a.last_status_at||a.order?.updated_at||a.order?.created_at||"")));
    const filteredCount=rows.length;
    window.__opsFilteredRows=rows;
    // Replaces the former fixed `const pageSize=20` with a selectable page size.
    const pageSize=[20,50,100,500,1000].includes(Number(window.__opsPageSize))?Number(window.__opsPageSize):20;
    window.__opsPageSize=pageSize;
    const totalPages=Math.max(1,Math.ceil(filteredCount/pageSize));
    const currentPage=Math.min(totalPages,Math.max(1,Number(options.page||1)));
    window.__opsCurrentPage=currentPage;
    const pageRows=rows.slice((currentPage-1)*pageSize,currentPage*pageSize);
    const priceOf=operationsPriceValue;
    const pageTotal=pageRows.reduce((sum,r)=>sum+priceOf(r),0);
    $("opsCount").textContent=filteredCount;
    refreshOperationsPriceSummary();
    if(!pageRows.length){box.innerHTML=`<p class="muted">${esc(L("No shipments found for the selected filters.","لا توجد شحنات مطابقة للفلاتر المحددة."))}</p>`;updateOperationsSelection();return;}
    const areaById=new Map(areas.map(a=>[String(a.id),a]));
    const governorateById=new Map(governorates.map(g=>[String(g.id),g]));
    const statusTone=st=>{const v=String(st||"").toLowerCase();if(/deliver|completed/.test(v))return "ops-status-delivered";if(/cancel|lost|damage/.test(v))return "ops-status-cancelled";if(/return|replace|refund/.test(v))return "ops-status-return";if(/future|tomorrow|location|schedule/.test(v))return "ops-status-scheduled";if(/ops|hub|picked|assign|driver|pickup/.test(v))return "ops-status-active";return "ops-status-default";};
    const head=`<thead><tr><th class="ops-select-col"><input id="opsSelectAll" type="checkbox" aria-label="${esc(L("Select all","تحديد الكل"))}" onchange="toggleOperationsSelection(this)"></th><th class="ops-order-col">${L("Order / Shipment","رقم الأوردر / الشحنة")}</th><th>${L("Shipper","الشاحن")}</th><th>${L("Customer","العميل")}</th><th>${L("Driver","المندوب")}</th><th><span class="ops-stacked-head"><span>Job</span><span>Code</span></span></th><th>${L("Status","الحالة")}</th><th class="ops-price-col">${L("Price","السعر")}</th><th class="ops-date-col">${L("Date","التاريخ")}</th><th class="ops-days-col-head"><span class="ops-stacked-head"><span>Days</span><span>Out</span></span></th><th class="ops-area-head">${L("Area","المنطقة")}</th><th class="ops-actions-head">${L("Actions","اكشن")}</th></tr></thead>`;
    const body=pageRows.map(r=>{const st=displayShipmentStatus(r)||r.current_status||r.status||"";const driverName=r.driver?.name||"NA";const driverNo=r.driver?.driver_no||"";const orderNo=r.order?.merchant_order_no||r.order?.order_code||"—";const tracking=r.tracking_number||r.shipment_no||"—";const areaRecord=(r.area&&(r.area.name_en||r.area.name_ar)?r.area:null)||areaById.get(String(r.area_id||r.order?.area_id||r.shipment?.area_id||r.area?.id||""));const area=L(areaRecord?.name_en,areaRecord?.name_ar)||r.order?.area_name||r.order?.area||r.area_name||r.shipment?.area_name||r.customer?.area_name||"—";const governorateRecord=(r.governorate&&(r.governorate.name_en||r.governorate.name_ar)?r.governorate:null)||governorateById.get(String(r.governorate_id||r.order?.governorate_id||r.area?.governorate_id||""));const emirate=L(governorateRecord?.name_en,governorateRecord?.name_ar)||r.order?.governorate_name||r.governorate_name||"—";const statusKey=String(st||"").toLowerCase().replace(/[ _-]+/g,"_");const specialDate=["return_by_driver","future_delivery","location_change","schedule_for_tomorrow"].includes(statusKey)?(r.order?.driver_scheduled_date||r.driver_scheduled_date||r.special_scheduled_date||""):"";const rawDate=String(r.display_date||specialDate||r.last_status_at||r.order?.updated_at||r.order?.created_at||"");const date=rawDate?rawDate.slice(0,10):"—";const shipmentId=String(r.id||r.shipment_id||"");const selected=window.__operationsSelectedShipments?.has(shipmentId);return `<tr><td class="ops-select-col" onclick="event.stopPropagation()"><input class="ops-row-check shipment-row-check" type="checkbox" value="${esc(shipmentId)}" ${selected?'checked':''} onchange="updateOperationsSelection()"></td><td class="ops-order-col" onclick="event.stopPropagation()"><div class="ops-order-box"><b onclick="openOrder('${esc(r.order_id||r.order?.id||"")}');event.stopPropagation()">${esc(orderNo)}</b><button type="button" class="ops-shipment-number" onclick="openShipmentNumberMenu(event,'${esc(r.id||r.shipment_id||"")}','${esc(tracking)}')">${esc(tracking)}</button></div></td><td class="ops-shipper-cell"><div class="ops-main-text">${esc(merchantLabel(r.merchant)||"—")}</div></td><td class="ops-customer-cell"><div class="ops-main-text">${esc(r.order?.customer_name||"—")}</div><small>${esc(r.order?.customer_phone||"")}</small></td><td class="ops-driver-cell"><div class="ops-main-text">${esc(driverName)}</div><small>${esc(driverNo)}</small></td><td class="ops-job-cell">${esc(r.job_code||r.delivery_job_code||"—")}</td><td><span class="badge ${statusTone(st)}">${esc(st)}</span></td><td class="ops-price-cell">${esc(new Intl.NumberFormat(LANG==="ar"?"ar-EG":"en-US",{maximumFractionDigits:2}).format(priceOf(r)))}</td><td class="ops-date-col">${esc(date)}</td><td class="ops-days-col">${esc(String(calculateDaysOut(r)))}</td><td class="ops-area-cell" title="${esc(emirate)} / ${esc(area)}"><span class="ops-emirate">${esc(emirate)}</span><span class="ops-region">${esc(area)}</span></td><td class="ops-actions-cell"><div class="actions"><button type="button" class="ghost ops-action-icon" title="${esc(L("Actions","اكشن"))}" aria-label="${esc(L("Actions","اكشن"))}" onclick="openOperationsActionMenu(event,'${esc(r.id||r.shipment_id||"")}')">⋮</button></div></td></tr>`}).join("");
    box.innerHTML=`<div class="table-wrap operations-table-wrap"><table class="shipments-dashboard-table operations-dashboard-table">${head}<tbody>${body}</tbody></table></div>
      <div class="operations-pagination" aria-label="${esc(L("Pagination","ترقيم الصفحات"))}">
        <button type="button" class="ghost" ${currentPage<=1?'disabled':''} onclick="loadOperationsDashboard({page:${currentPage-1}})">${L("Previous","السابق")}</button>
        <span>${currentPage} / ${totalPages}</span>
        <button type="button" class="ghost" ${currentPage>=totalPages?'disabled':''} onclick="loadOperationsDashboard({page:${currentPage+1}})">${L("Next","التالي")}</button>
        <label class="ops-page-size-control"><span>${L("Rows","عدد")}</span><select aria-label="${esc(L("Rows per page","عدد الأوردرات في الصفحة"))}" onchange="setOperationsPageSize(this.value)">${[20,50,100,500,1000].map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join("")}</select></label>
      </div>`;
    updateOperationsSelection();
    saveOperationsDashboardStateAfterRender();
  }catch(e){
    if(!hadContent)box.innerHTML=`<div class="error">${esc(e.message)}</div>`;
    else dashboardActionNotice(L("Could not refresh the operations list. Your current view was kept.","تعذر تحديث قائمة العمليات؛ تم الاحتفاظ بالبيانات الظاهرة."),"error");
  }
}
async function openOperationsActionMenu(event,shipmentId){
  if(event){event.preventDefault();event.stopPropagation();}
  document.getElementById('opsActionMenu')?.remove();
  const menu=document.createElement('div'); menu.id='opsActionMenu'; menu.className='shipment-row-menu portal-menu';
  menu.style.cssText='position:fixed;z-index:2147483647;display:grid;min-width:260px;max-width:340px;max-height:70vh;overflow-y:auto;';
  const editableStatuses=SYSTEM_STATUSES.filter(s=>s!=='Return Completed');
  const accountStatuses=['Delivered','Half Delivered','Cancelled by Receiver','Cancelled by Shipper','Replaced'];
  const returnStatuses=['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Half Delivered','Replaced'];
  const driverReturnStatuses=['Return by Driver','Future Delivery','Location Change','Schedule for Tomorrow'];
  const statusButton=st=>`<button type="button" class="shipment-action-item" onclick="operationsChangeStatus('${encodeURIComponent(st)}','${esc(shipmentId)}')"><span class="shipment-action-icon">●</span><span>${esc(st)}</span></button>`;
  menu.innerHTML=`<button type="button" class="shipment-action-item" onclick="patchOutscanShipment('${esc(shipmentId)}')">${navIcon("truck")}<span>${L("Patch Outscan","Patch Outscan")}</span></button>
    <button type="button" class="shipment-action-item" onclick="openOrderByShipment('${esc(shipmentId)}')"><span class="shipment-action-icon">↗</span><span>${L("Open","فتح")}</span></button>
    <div class="shipment-row-menu-divider"></div>
    <div class="shipment-row-menu-label">${L("Change Status","تغيير الحالة")}</div>${editableStatuses.map(statusButton).join('')}
    <div class="shipment-row-menu-divider"></div>
    <div class="shipment-row-menu-label">${L("Returns","المرتجعات")}</div>${returnStatuses.map(statusButton).join('')}`;
  document.body.appendChild(menu);
  const r=event.currentTarget.getBoundingClientRect(), w=270; let left=r.right-w; if(left<12)left=12; let top=r.bottom+6; const h=Math.min(menu.scrollHeight||240,innerHeight*.7); if(top+h>innerHeight-12)top=Math.max(12,r.top-h-6); menu.style.width=w+'px';menu.style.left=Math.round(left)+'px';menu.style.top=Math.round(top)+'px';
  const closer=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',closer,true);}};setTimeout(()=>document.addEventListener('click',closer,true),0);
}
async function openShipmentQuickPopup(shipmentId, shipmentNo=''){
  if(!shipmentId)return;
  document.getElementById('shipmentQuickPopup')?.remove();
  const modal=document.createElement('div');modal.id='shipmentQuickPopup';modal.className='dashboard-action-modal shipment-quick-overlay';
  modal.innerHTML=`<div class="dashboard-action-modal-card shipment-quick-card"><div class="shipment-quick-head"><div><h3>${L('Shipment details & movement history','تفاصيل الشحنة وسجل الحركات')}</h3><small>${esc(shipmentNo||'')}</small></div><button type="button" class="ghost" onclick="document.getElementById('shipmentQuickPopup')?.remove()">✕</button></div><div class="shipment-quick-loading">${L('Loading shipment data…','جارٍ تحميل بيانات الشحنة…')}</div></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  try{
    const d=await api(`/api/shipments/${encodeURIComponent(shipmentId)}`);const x=d.data||{},o=x.order||{},sh=x.shipment||{};
    const hist=Array.isArray(x.history)?x.history:[];
    const sorted=[...hist].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    const current=sh.status||o.status||'—';
    const driver=sh.driver_name||sh.driver?.name||o.inscan_driver_name||o.scan_driver_name||'—';
    const fmt=v=>v?new Date(v).toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
    const events=sorted.map(h=>{const employee=h.user_name||h.employee_name||h.updated_by_name||h.employee?.name||h.user?.name||h.employee_code||'System';const note=h.note||h.notes||h.comment||h.reason||'';return `<div class="shipment-quick-event"><span class="shipment-quick-dot"></span><div class="shipment-quick-event-body"><b>${esc(movementHistoryLabel(h.status||h.action||'—'))}</b><small>${esc(fmt(h.created_at))}</small><small class="shipment-quick-employee">${L('Employee','الموظف')}: ${esc(employee)}</small>${note?`<small class="shipment-quick-note">${esc(note)}</small>`:''}</div></div>`}).join('')||`<p class="muted">${L('No recorded movements yet.','لا توجد حركات مسجلة حتى الآن.')}</p>`;
    modal.querySelector('.shipment-quick-card').innerHTML=`<div class="shipment-quick-head"><div><h3>${L('Shipment details & movement history','تفاصيل الشحنة وسجل الحركات')}</h3><small>${L('Tracking Number','رقم التتبع')}: ${esc(sh.tracking_number||shipmentNo||'—')}</small></div><button type="button" class="ghost" onclick="document.getElementById('shipmentQuickPopup')?.remove()">✕</button></div><div class="shipment-quick-columns"><section class="shipment-quick-details"><h4>${L('Order details','تفاصيل الأوردر')}</h4><div><span>${L('Current status','الحالة الحالية')}</span><b>${esc(current)}</b></div><div><span>${L('Order number','رقم الأوردر')}</span><b>${esc(o.merchant_order_no||o.order_code||'—')}</b></div><div><span>Job Code</span><b>${esc(sh.job_code||'—')}</b></div><div><span>${L("Shipper","التاجر")}</span><b>${esc(merchantLabel(x.merchant)||"—")}</b></div><div><span>${L('Customer','العميل')}</span><b>${esc(o.customer_name||'—')}</b></div><div><span>${L('Phone','الهاتف')}</span><b>${esc(o.customer_phone||'—')}</b></div><div><span>${L('Inscan Driver','مندوب الإحضار')}</span><b>${esc(driver)}</b></div></section><section class="shipment-quick-history"><h4>${L('Movement history','سجل الحركات')}</h4><div class="shipment-quick-timeline">${events}</div><label class="shipment-quick-comment-label" for="shipmentQuickComment">${L('Comment','تعليق')}</label><textarea id="shipmentQuickComment" class="shipment-quick-comment" placeholder="${L('Write a comment…','اكتب تعليقك هنا…')}"></textarea><button type="button" class="shipment-quick-save-comment" onclick="saveShipmentQuickComment('${esc(sh.id||shipmentId)}')">${L('Save comment','حفظ التعليق')}</button><p class="shipment-quick-comment-message" aria-live="polite"></p></section></div><div class="shipment-quick-foot"><button type="button" class="ghost" onclick="document.getElementById('shipmentQuickPopup')?.remove()">${L('Close','إغلاق')}</button><button type="button" onclick="document.getElementById('shipmentQuickPopup')?.remove();openOrder('${esc(o.id||sh.order_id||'')}')">${L('Open order','فتح الأوردر')}</button></div>`;
  }catch(e){const card=modal.querySelector('.shipment-quick-card');if(card)card.innerHTML=`<div class="shipment-quick-head"><h3>${L('Shipment details','تفاصيل الشحنة')}</h3><button type="button" class="ghost" onclick="document.getElementById('shipmentQuickPopup')?.remove()">✕</button></div><p class="error">${esc(e.message||'Could not load shipment')}</p>`;}
}
async function saveShipmentQuickComment(shipmentId){
  const popup=document.getElementById('shipmentQuickPopup');
  const field=popup?.querySelector('#shipmentQuickComment');
  const message=popup?.querySelector('.shipment-quick-comment-message');
  const note=String(field?.value||'').trim();
  if(!note){if(message)message.textContent=L('Write a comment first.','اكتب التعليق أولًا.');return;}
  const button=popup?.querySelector('.shipment-quick-save-comment');if(button)button.disabled=true;
  try{
    await api(`/api/shipments/${encodeURIComponent(shipmentId)}/comments`,{method:'POST',body:JSON.stringify({comment:note})});
    if(message)message.textContent=L('Comment saved and added to movement history.','تم حفظ التعليق وإضافته إلى سجل الحركات.');
    field.value='';
    await openShipmentQuickPopup(shipmentId);
  }catch(e){if(message)message.textContent=e.message||L('Could not save comment.','تعذر حفظ التعليق.');if(button)button.disabled=false;}
}
async function operationsChangeStatus(encodedStatus,shipmentId){
  document.getElementById('opsActionMenu')?.remove();
  const status=decodeURIComponent(encodedStatus);
  try{
    if(status==='Location Change'){const values=await openLocationChangeDialog();if(!values)return;await setStatus(shipmentId,status,values);}else await setStatus(shipmentId,status);
    dashboardActionNotice(L('Status updated successfully','تم تغيير الحالة بنجاح'),'success');
    window.__opsDashboardDataCache=null; await loadOperationsDashboard({silent:true,force:true});
  }catch(e){alert(e.message);}
}
async function openShipmentNumberMenu(event,shipmentId,shipmentNo){
  if(event){event.preventDefault();event.stopPropagation();}
  document.getElementById('shipmentNumberMenu')?.remove();
  await openShipmentQuickPopup(shipmentId, shipmentNo);
  return;
  document.getElementById('shipmentNumberMenu')?.remove();
  const menu=document.createElement('div'); menu.id='shipmentNumberMenu'; menu.className='shipment-row-menu portal-menu';
  menu.style.cssText='position:fixed;z-index:2147483647;display:grid;min-width:190px;';
  menu.innerHTML=`<button type="button" class="shipment-action-item" onclick="copyShipmentNumber('${esc(shipmentNo)}')"><span class="shipment-action-icon">📋</span><span>${L('Copy Shipment Number','نسخ رقم الشحنة')}</span></button><button type="button" class="shipment-action-item" onclick="openOrderByShipment('${esc(shipmentId)}');document.getElementById('shipmentNumberMenu')?.remove()"><span class="shipment-action-icon">✎</span><span>${L('Edit','تعديل')}</span></button>`;
  document.body.appendChild(menu);
  const r=event.currentTarget.getBoundingClientRect(),w=205;let left=r.left; if(left+w>innerWidth-12)left=innerWidth-w-12;let top=r.bottom+5;if(top+menu.offsetHeight>innerHeight-12)top=Math.max(12,r.top-menu.offsetHeight-5);menu.style.width=w+'px';menu.style.left=Math.round(left)+'px';menu.style.top=Math.round(top)+'px';
  const closer=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',closer,true);}};setTimeout(()=>document.addEventListener('click',closer,true),0);
}
async function copyShipmentNumber(value){try{await navigator.clipboard.writeText(String(value||''));dashboardActionNotice(L('Shipment Number copied','تم نسخ رقم الشحنة'),'success');}catch(_){const ta=document.createElement('textarea');ta.value=String(value||'');document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();dashboardActionNotice(L('Shipment Number copied','تم نسخ رقم الشحنة'),'success');}document.getElementById('shipmentNumberMenu')?.remove();}
async function openOrderByShipment(shipmentId){try{const d=await api(`/api/shipments/${encodeURIComponent(shipmentId)}`);const id=d.data?.order?.id||d.data?.order_id;if(id)openOrder(id,'operationsDashboard');}catch(e){alert(e.message);}}
async function chooseOperationsDriverAndAssign(shipmentIds){
  const ids=[...new Set((shipmentIds||[]).filter(Boolean).map(String))];
  if(!ids.length){alert(L('Select at least one shipment first.','حدد شحنة واحدة على الأقل أولًا.'));return;}
  document.getElementById('operationsDriverModal')?.remove();
  try{
    const d=await api('/api/drivers');const drivers=(d.data||[]).filter(x=>x.active!==false);
    if(!drivers.length){alert(L('No active drivers found.','لا يوجد سائقون نشطون.'));return;}
    const modal=document.createElement('div');modal.id='operationsDriverModal';modal.className='dashboard-action-modal';
    modal.innerHTML=`<div class="dashboard-action-modal-card"><h3>🚚 ${L('Patch Outscan','Patch Outscan')}</h3><p class="muted">${ids.length} ${L('selected shipment(s)','شحنة محددة')}</p><label>${L('Delivery Job date','تاريخ مهمة المندوب')}<input id="operationsBatchJobDate" type="date" value="${today()}" required></label><label>${L('Driver','المندوب')}<select id="operationsBatchDriver"><option value="">${L('Select driver','اختر المندوب')}</option>${drivers.map(x=>`<option value="${esc(x.id)}">${esc(x.name||'')} — ${esc(x.driver_no||'')}</option>`).join('')}</select></label><p class="muted" style="margin-top:8px">${L('Selecting the driver will assign the shipment immediately. No confirmation is required.','بمجرد اختيار المندوب سيتم نقل الشحنة مباشرة بدون رسالة تأكيد.')}</p><div class="actions"><button type="button" class="ghost" onclick="document.getElementById('operationsDriverModal')?.remove()">${L('Cancel','إلغاء')}</button></div></div>`;
    document.body.appendChild(modal);window.__operationsBatchShipmentIds=ids;
    document.getElementById('operationsBatchDriver')?.addEventListener('change',()=>confirmOperationsBatchOutscan());
  }catch(e){alert(e.message);}
}
async function confirmOperationsBatchOutscan(){
  const ids=window.__operationsBatchShipmentIds||[], driverId=$("operationsBatchDriver")?.value;
  if(!driverId)return;
  const d=await api('/api/drivers');const driver=(d.data||[]).find(x=>String(x.id)===String(driverId));if(!driver)return;
  try{
    // Save the user's current date/filter choices before the assignment refreshes the table.
    captureOperationsDashboardState();
    const result=await api('/api/operations/patch-outscan',{method:'POST',body:JSON.stringify({shipment_ids:ids,driver_id:driverId,job_date:$('operationsBatchJobDate')?.value||today()})});
    const jobDate=result?.data?.job_date||'';
    document.getElementById('operationsDriverModal')?.remove();window.__operationsBatchShipmentIds=[];window.__opsDashboardDataCache=null;await loadOperationsDashboard({force:true});
    const assignDuration=Number(result?.data?.duration_ms||0);
    const assignMode=result?.data?.assignment_mode==='database-batch'?'DB batch':'compatibility fallback';
    const assignTiming=assignDuration>0?` — ${(assignDuration/1000).toFixed(1)}s (${assignMode})`:'';
    dashboardActionNotice(`${L('Assigned with Driver','Assigned with Driver')} + ${driver.name||''} — ${driver.driver_no||''}${jobDate?' — '+jobDate:''}${assignTiming}`,'success');
  }catch(e){alert(e.message);}
}

function openOperationsBulkActions(){
  const domIds=[...document.querySelectorAll('#opsList .ops-row-check:checked')].map(x=>String(x.value||'')).filter(Boolean);
  const ids=[...new Set([...(window.__operationsSelectedShipments||new Set()),...domIds].map(String).filter(Boolean))];
  const old=document.getElementById('opsBulkActionMenu');if(old)old.remove();
  if(!ids.length){alert(L('Select at least one shipment first.','حدد شحنة واحدة على الأقل أولًا.'));return;}

  const menu=document.createElement('div');
  menu.id='opsBulkActionMenu';
  menu.className='dashboard-action-modal ops-bulk-action-menu';
  menu.innerHTML=`<div class="dashboard-action-modal-card">
    <div class="ops-bulk-action-head"><div><h3>⚙ ${L('Bulk Actions','إجراءات المحدد')}</h3><p class="muted">${ids.length} ${L('selected shipment(s)','شحنة محددة')}</p></div><button type="button" class="ghost ops-bulk-close" aria-label="${L('Close','إغلاق')}">×</button></div>
    <div class="ops-bulk-action-list">
      <button type="button" id="opsBulkPatchOutscan" class="ops-bulk-action-item"><span class="ops-bulk-action-icon">${navIcon('truck')}</span><span>${L('Patch Outscan','Patch Outscan')}</span></button>
      <div class="ops-bulk-action-divider"></div>
      <div class="ops-bulk-action-label">${L('Change Status','تغيير الحالة')}</div>
      <div id="opsBulkStatusItems"></div>
    </div>
    <button type="button" class="ghost ops-bulk-cancel">${L('Cancel','إلغاء')}</button>
  </div>`;
  document.body.appendChild(menu);

  menu.querySelector('.ops-bulk-close').onclick=()=>menu.remove();
  menu.querySelector('.ops-bulk-cancel').onclick=()=>menu.remove();
  menu.querySelector('#opsBulkPatchOutscan').onclick=async()=>{ menu.remove(); await chooseOperationsDriverAndAssign(ids); };

  const statusBox=menu.querySelector('#opsBulkStatusItems');
  SYSTEM_STATUSES.forEach(status=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='ops-bulk-action-item';
    btn.innerHTML=`<span class="ops-bulk-action-icon">●</span><span>${esc(status)}</span>`;
    btn.onclick=async()=>{ menu.remove(); await operationsBulkChangeStatus(encodeURIComponent(status),ids); };
    statusBox.appendChild(btn);
  });
}
async function operationsBulkChangeStatus(encodedStatus, ids){
  document.getElementById('opsBulkActionMenu')?.remove();
  const status=decodeURIComponent(encodedStatus||'');
  const list=[...new Set((ids||[]).map(String).filter(Boolean))];
  if(!list.length)return;
  try{
    let metaByStatus=null;
    if(status==='Location Change'){
      const values=await openLocationChangeDialog();
      if(!values)return;
      metaByStatus=values;
    }else if(status==='Future Delivery'){
      const date=await openFutureDeliveryDialog();
      if(!date)return;
      metaByStatus={date};
    }
    const results=[];
    for(const id of list){
      try{
        const response=await setStatus(id,status,metaByStatus);
        results.push({id,ok:true,response});
      }catch(error){
        results.push({id,ok:false,error:error?.message||String(error)});
      }
    }
    const failed=results.filter(r=>!r.ok);
    if(failed.length){
      const firstError=failed[0]?.error||'';
      dashboardActionNotice(L(`${results.length-failed.length} succeeded, ${failed.length} failed.${firstError?' '+firstError:''}`,`تم تنفيذ ${results.length-failed.length} وفشل ${failed.length}.${firstError?' '+firstError:''}`),'error');
    }else{dashboardActionNotice(L(`Status changed to ${status} for ${results.length} shipment(s).`,`تم تغيير الحالة إلى ${status} لعدد ${results.length} شحنة.`),'success');}
    clearOperationsSelection();
    window.__opsDashboardDataCache=null; await loadOperationsDashboard({force:true});
  }catch(e){dashboardActionNotice(e.message||L('Could not update shipments.','تعذر تحديث الشحنات.'),'error');}
}
async function patchOutscanShipment(shipmentId){await chooseOperationsDriverAndAssign([shipmentId]);}
window.__operationsSelectedShipments=window.__operationsSelectedShipments||new Set();
function updateOperationsSelection(){const checks=[...document.querySelectorAll("#opsList .ops-row-check")];const selected=checks.filter(x=>x.checked);window.__operationsSelectedShipments=new Set([...window.__operationsSelectedShipments,...selected.map(x=>String(x.value||""))].filter(Boolean));const visibleIds=new Set(checks.map(x=>String(x.value||"")).filter(Boolean));for(const id of [...window.__operationsSelectedShipments])if(visibleIds.has(id)&&!selected.some(x=>String(x.value)===id))window.__operationsSelectedShipments.delete(id);const top=$("opsSelectAll");if(top){top.checked=checks.length>0&&selected.length===checks.length;top.indeterminate=selected.length>0&&selected.length<checks.length;}const n=$("opsSelectedCount");if(n)n.textContent=window.__operationsSelectedShipments.size?`${window.__operationsSelectedShipments.size} ${L("selected","محدد")}`:"";refreshOperationsPriceSummary();}
function toggleOperationsSelection(el){const checked=!!el.checked;document.querySelectorAll("#opsList .ops-row-check").forEach(x=>x.checked=checked);if(checked){for(const x of document.querySelectorAll("#opsList .ops-row-check"))if(x.value)window.__operationsSelectedShipments.add(String(x.value));}else{window.__operationsSelectedShipments.clear();}updateOperationsSelection();}
function selectAllOperations(){const top=$("opsSelectAll");if(top)top.checked=true;toggleOperationsSelection(top||{checked:true});}
function clearOperationsSelection(){window.__operationsSelectedShipments.clear();document.querySelectorAll("#opsList .ops-row-check").forEach(x=>x.checked=false);const top=$("opsSelectAll");if(top){top.checked=false;top.indeterminate=false;}updateOperationsSelection();}
function printSelectedOperationsLabels(){
  const ids=[...(window.__operationsSelectedShipments||new Set())].map(String).filter(Boolean);
  if(!ids.length)return alert(L("Select one or more shipments first","حدد شحنة واحدة أو أكثر أولاً"));
  const all=Array.isArray(window.__operationsRows)?window.__operationsRows:[];
  const byId=new Map(all.map(r=>[String(r.id||r.shipment_id||""),r]));
  const rows=ids.map(id=>byId.get(id)).filter(Boolean).map(r=>{
    const order=r.order||{}, shipment=r.shipment||r, merchant=r.merchant||{};
    const area=r.area||order.area||shipment.area||null, governorate=r.governorate||order.governorate||shipment.governorate||null;
    return {...order,...r,order,shipment,merchant,merchant_label:merchantLabel(merchant)||r.merchant_name||"",tracking_number:r.tracking_number||shipment.tracking_number||order.tracking_number||"",shipment_no:r.shipment_no||shipment.shipment_no||shipment.shipment_number||"",job_code:r.job_code||r.delivery_job_code||shipment.job_code||order.job_code||"",customer_name:order.customer_name||r.customer_name||"",customer_phone:order.customer_phone||r.customer_phone||"",customer_phone_2:order.customer_phone_2||r.customer_phone_2||"",area,governorate,area_name:area?.name_ar||area?.name_en||order.area_name||r.area_name||"",governorate_name:governorate?.name_ar||governorate?.name_en||order.governorate_name||r.governorate_name||"",address:order.address||r.address||"",value:order.value??r.value??r.cod??"",notes:order.notes||r.notes||""};
  });
  if(!rows.length)return alert(L("Could not find the selected shipments. Refresh the dashboard and try again.","تعذر العثور على الشحنات المحددة. حدّث لوحة العمليات وحاول مرة أخرى."));
  printShippingLabels(rows);
}

async function shipmentsPage(c){
  c.innerHTML=`<h2>${t("Dashboard shipments")}</h2><div class="panel"><div class="shipment-toolbar"><div><p class="panel-note">${L("Showing orders from the last 7 days through today by default.","يتم عرض الأوردرات تلقائيًا من تاريخ أسبوع حتى تاريخ اليوم.")}</p></div><div class="actions"><div class="shipment-actions-wrap"><button id="shipmentBulkActionsBtnPage" class="ghost" type="button" onclick="toggleShipmentBulkActions()">${L("Actions","الإجراءات")} ▾</button>
    <div id="shipmentBulkActionsMenuPage" class="shipment-bulk-menu shipment-bulk-menu-page">
      <button class="shipment-bulk-item" type="button" onclick="shipmentBulkAction('open')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">↗</span>${L("Open selected","فتح المحدد")}</button>
      <button class="shipment-bulk-item" type="button" onclick="shipmentBulkAction('patch-outscan')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">🚚</span>${L("Patch Outscan","Patch Outscan")}</button>
      <button class="shipment-bulk-item" type="button" onclick="shipmentBulkAction('print')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">⎙</span>${L("Print / PDF selected","طباعة / PDF للمحدد")}</button>
      <div class="shipment-bulk-label shipment-change-status-label"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">●</span><span class="shipment-change-status-text">${L("Change status","تغيير الحالة")}</span></div>
      <div class="shipment-status-options">${SYSTEM_STATUSES.map(st=>`<div class="shipment-status-option" role="button" tabindex="0" onclick="shipmentBulkAction('status:${encodeURIComponent(st)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();shipmentBulkAction('status:${encodeURIComponent(st)}')}" style="display:flex!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:40px!important;padding:9px 12px!important;box-sizing:border-box!important;background:#fff!important;color:#24314a!important;-webkit-text-fill-color:#24314a!important;font:700 14px/20px Arial,Tahoma,sans-serif!important;white-space:nowrap!important;visibility:visible!important;opacity:1!important;overflow:visible!important;"> <span style="display:inline-flex!important;width:22px!important;min-width:22px!important;align-items:center!important;justify-content:center!important;color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important;visibility:visible!important;opacity:1!important;">●</span><span style="display:inline!important;visibility:visible!important;opacity:1!important;color:#24314a!important;-webkit-text-fill-color:#24314a!important;font:700 14px/20px Arial,Tahoma,sans-serif!important;white-space:nowrap!important;">${esc(st)}</span></div>`).join("")}</div>
      <button class="shipment-bulk-item" type="button" onclick="shipmentBulkAction('clear')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">×</span>${L("Clear selection","إلغاء التحديد")}</button>
    </div></div><button id="shipmentFilterBtn" class="ghost" aria-expanded="false" onclick="toggleShipmentFilters()">${L("Filter","فلتر")}</button><button class="ghost" onclick="exportShipmentsExcel()">${t("Export Excel")}</button><button class="ghost" onclick="exportShipmentsPDF()">${t("Print / PDF")}</button></div></div>
    <div id="shipmentDateFiltersPanel" class="shipment-filters-panel">
      <div class="row shipment-dashboard-filters">
        <label>${t("From")}<input id="shipFrom" type="date" value="${shipmentDefaultFrom()}"></label>
        <label>${t("To")}<input id="shipTo" type="date" value="${shipmentDefaultTo()}"></label>
        <button onclick="loadShipments()">${t("Search")}</button>
      </div>
    </div>
    <div id="opsCumulativeSearchMount"></div>
    <div id="shipmentsList"></div>

  </div>`;
  mountCumulativeShipmentSearch("opsCumulativeSearchMount","ops-cumulative-search");
  await loadShipments();
}
let SHIP_ROWS=[];
async function loadShipments(){
  try{
    const from=$("shipFrom")?.value||shipmentDefaultFrom(),to=$("shipTo")?.value||today();
    const d=await api(`/api/shipments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    SHIP_ROWS=d.data||[];
    $("shipmentsList").innerHTML=shipmentsTable(SHIP_ROWS);
  }catch(e){msg("shipmentsList",e.message,"error");}
}
function shipmentsTable(rows){
  const head=`<thead>
    <tr>
      <th>${L("Select","تحديد")}</th>
      <th>${L("Tracking Number","رقم التتبع")}</th>
      <th>${L("Order / Shipment","رقم الاوردر / رقم الشحنه")}</th>
      <th>${L("Shipper","اسم التاجر وكوده")}</th>
      <th>${L("Price","السعر")}</th>
      <th>${L("Driver","السائق")}</th>
      <th>${L("Job Code","Job Code")}</th>
      
      <th>${t("Status")}</th>
      <th>${L("Last Status Date","التاريخ لآخر حالة")}</th>
      <th>${L("Days Out","عدد أيام خروج الأوردر")}</th>
      <th>${L("Actions","الإجراءات")}</th>
    </tr>
    <tr class="column-filter-toggle-row"><th colspan="11">
      <div class="shipment-table-top-actions">
        <label class="shipment-select-all"><input id="shipmentSelectAllTop" type="checkbox" title="${L("Select all","تحديد الكل")}" onclick="toggleAllShipmentRows(this)"> ${L("Select all","تحديد الكل")}</label>
        <span id="shipmentSelectedCount" class="muted"></span>
        <button class="ghost filter-inside-table-btn" onclick="toggleShipmentFilters()" type="button">${L("Filter","فلتر")}</button>
      </div>
    </th></tr>
  </thead>`;
  if(!rows.length)return `<div class="table-wrap"><table class="shipments-dashboard-table">${head}<tbody><tr><td colspan="11" class="muted">${t("No data")}</td></tr></tbody></table></div>`;
  const statuses=[...new Set(rows.map(r=>r.current_status||r.status||r.order?.status).filter(Boolean))].sort();
  const drivers=[...new Map(rows.map(r=>[String(r.driver?.id||"na"),r.driver?.name||"NA"]).filter(x=>x[1])).entries()];
  const filterSelect=(id,items)=>document.getElementById(id);
  const body=rows.map((r,i)=>{
    const orderNo=r.order?.merchant_order_no||r.order?.order_code||"";
    const shipmentNo=r.shipment_no||"";
    const merchantName=r.merchant?.name||"";
    const merchantCode=r.merchant?.merchant_no||r.merchant?.code||"";
    const price=Number(r.order?.value||0);
    const status=displayShipmentStatus(r);
    const normalizedStatus=String(status).toLowerCase().replace(/\s+/g,"_");
    const driverName=(normalizedStatus.includes("receive_at_hub")||normalizedStatus.includes("recive_at_hup")||!r.driver?.id)?"NA":(r.driver?.name||"NA");
    const specialStatusKey=String(status||"").toLowerCase().replace(/\s+/g,"_");
    const specialDate=(specialStatusKey==="future_delivery"||specialStatusKey==="return_by_driver"||specialStatusKey==="location_change"||specialStatusKey==="schedule_for_tomorrow") ? (r.order?.driver_scheduled_date||r.special_scheduled_date||"") : "";
    const lastDate=r.display_date||specialDate||r.last_status_at||r.order?.updated_at||r.order?.created_at||"";
    const exitDate=String(r.delivery_job_date||specialDate||"").slice(0,10);
    const todayISO=localDateISO();
    const daysOut=exitDate ? Math.max(0, Math.floor((new Date(todayISO+"T12:00:00").getTime()-new Date(exitDate+"T12:00:00").getTime())/86400000)) : 0;
    const jobCode=String(r.job_code||r.delivery_job_code||"");
    const oid=String(r.order_id||r.order?.id||"");
    return `<tr class="clickable shipment-dashboard-row" data-tracking="${esc(r.tracking_number||"")}" data-order="${esc(orderNo)}" data-shipment="${esc(shipmentNo)}" data-merchant="${esc(`${merchantName} ${merchantCode}`)}" data-price="${price}" data-driver="${esc(driverName)}" data-jobcode="${esc(jobCode)}" data-status="${esc(status)}" data-date="${esc(lastDate.slice(0,10))}" data-daysout="${daysOut}">
      <td onclick="event.stopPropagation()"><input class="shipment-row-check" type="checkbox" value="${esc(oid)}" onchange="updateShipmentSelection()"></td>
      <td onclick="openOrder('${esc(oid)}');event.stopPropagation()"><div class="shipment-cell-box">${esc(r.tracking_number||"")}</div></td>
      <td onclick="openOrder('${esc(oid)}');event.stopPropagation()"><div class="shipment-cell-box">${esc(orderNo)}</div><div class="shipment-cell-box">${esc(shipmentNo)}</div></td>
      <td onclick="openOrder('${esc(oid)}');event.stopPropagation()"><div class="shipment-cell-box">${esc(merchantName)}</div><div class="shipment-cell-box">${esc(merchantCode)}</div></td>
      <td>${esc(money(price))}</td>
      <td>${esc(driverName)}</td>
      <td class="shipment-job-code-cell" onclick="event.stopPropagation()"><div class="job-code-inline"><span>${esc(r.job_code||"—")}</span></div></td>
      
      <td><span class="badge">${esc(status)}</span></td>
      <td>${esc(lastDate.slice(0,16).replace("T"," "))}</td>
      <td>${daysOut}</td>
      <td class="shipment-actions-cell" onclick="event.stopPropagation()">
        <div class="shipment-actions-wrap">
          <button type="button" class="shipment-actions-trigger" title="${L("Actions","الإجراءات")}" aria-label="${L("Actions","الإجراءات")}" onclick="toggleShipmentRowActions(event,'${esc(oid)}')">⋮</button>
          <div class="shipment-row-menu" data-order-id="${esc(oid)}">
            <button type="button" class="shipment-action-item" onclick="shipmentRowAction('open','${esc(oid)}')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">↗</span><span>${L("Open","فتح")}</span></button>
            <button type="button" class="shipment-action-item" onclick="shipmentRowAction('edit','${esc(oid)}')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">✎</span><span>${t("Edit")}</span></button>
            <button type="button" class="shipment-action-item" onclick="shipmentRowAction('pdf','${esc(oid)}')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">⎙</span><span>${t("Print / PDF")}</span></button>
            <button type="button" class="shipment-action-item" onclick="shipmentRowAction('excel','${esc(oid)}')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">▦</span><span>${t("Export Excel")}</span></button>
            <div class="shipment-row-menu-divider"></div>
            <div class="shipment-row-menu-label">${L("Change Status","تغيير الحالة")}</div>
            ${SYSTEM_STATUSES.map(st=>`<button type="button" class="shipment-action-item" onclick="shipmentRowAction('status:${encodeURIComponent(st)}','${esc(oid)}')"><span class="shipment-action-icon" style="color:#1f5eff!important;-webkit-text-fill-color:#1f5eff!important">●</span>${esc(st)}</button>`).join("")}
          </div>
        </div>
      </td>
    </tr>`;
  }).join("");
  const filterPanel=`<div id="shipmentFiltersPanel" class="shipment-filters-panel table-filter-panel">
    <div class="filter-grid shipment-column-filters">
      <label>${L("Tracking Number","رقم التتبع")}<input id="shipFilterTracking" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Order / Shipment","رقم الاوردر / رقم الشحنه")}<input id="shipFilterOrderShipment" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Shipper","اسم التاجر وكوده")}<input id="shipFilterShipper" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Price from","السعر من")}<input id="shipFilterPriceMin" type="number" step="0.01" placeholder="Min" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Price to","السعر إلى")}<input id="shipFilterPriceMax" type="number" step="0.01" placeholder="Max" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Driver","السائق")}<input id="shipFilterDriver" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Job Code","Job Code")}<input id="shipFilterJobCode" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Status","الحالة")}<input id="shipFilterStatus" placeholder="${L("Filter","فلتر")}" oninput="filterShipmentsDashboard()"></label>
      <label>${L("Date","التاريخ")}<input id="shipFilterDate" type="date" onchange="filterShipmentsDashboard()"></label>
      <label>${L("Days Out","عدد أيام الخروج")}<input id="shipFilterDaysOut" type="number" min="0" placeholder="0" oninput="filterShipmentsDashboard()"></label>
      <button class="ghost" type="button" onclick="clearShipmentFilters()">${L("Clear","مسح")}</button>
    </div>
  </div>`;
  const html=`${filterPanel}<div class="table-wrap"><table id="shipmentsTable" class="shipments-dashboard-table">${head}<tbody>${body}</tbody></table></div>`;
  return html;
}
function toggleShipmentRowActions(event,orderId){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const trigger=event && event.currentTarget;
  if(!trigger)return;
  const wrap=trigger.closest('.shipment-actions-wrap');
  if(!wrap)return;
  const wasOpen=wrap.classList.contains('open');
  closeShipmentRowActions();
  if(wasOpen)return;
  const menu=wrap.querySelector('.shipment-row-menu');
  if(!menu)return;

  // Keep the menu in a dedicated fixed layer. Do not move the menu node out of
  // the row: moving it breaks the relationship with the action wrapper on some
  // browsers and can make only the first item appear/click.
  let layer=document.getElementById('shipmentActionsOverlay');
  if(!layer){
    layer=document.createElement('div');
    layer.id='shipmentActionsOverlay';
    layer.className='shipment-actions-overlay';
    document.body.appendChild(layer);
  }
  layer.innerHTML='';
  const clone=menu.cloneNode(true);
  clone.classList.add('portal-menu');
  clone.style.display='grid';
  clone.style.position='fixed';
  clone.style.zIndex='2147483647';
  clone.style.visibility='hidden';
  clone.dataset.orderId=String(orderId);
  layer.appendChild(clone);

  wrap.classList.add('open');
  const r=trigger.getBoundingClientRect();
  const menuWidth=Math.max(230,Math.min(320,window.innerWidth-24));
  clone.style.width=menuWidth+'px';
  clone.style.minWidth=menuWidth+'px';
  const menuHeight=Math.min(clone.scrollHeight||420,Math.floor(window.innerHeight*0.65));
  let left=r.right-menuWidth;
  if(left<12)left=12;
  if(left+menuWidth>window.innerWidth-12)left=window.innerWidth-12-menuWidth;
  let top=r.bottom+6;
  if(top+menuHeight>window.innerHeight-12)top=Math.max(12,r.top-menuHeight-6);
  clone.style.left=Math.round(left)+'px';
  clone.style.top=Math.round(top)+'px';
  clone.style.right='auto';
  clone.style.bottom='auto';
  clone.style.maxHeight=Math.max(160,Math.floor(window.innerHeight*0.65))+'px';
  clone.style.overflowY='auto';
  clone.style.visibility='visible';
}

function closeShipmentRowActions(){
  document.querySelectorAll('.shipment-actions-wrap.open').forEach(w=>w.classList.remove('open'));
  const layer=document.getElementById('shipmentActionsOverlay');
  if(layer) layer.innerHTML='';
  document.querySelectorAll('.shipment-row-menu.portal-menu').forEach(menu=>{
    if(menu.parentElement!==layer){
      menu.classList.remove('portal-menu');
      menu.style.display='';
    }
  });
}

async function openFutureDeliveryDialog(){
  return new Promise(resolve=>{
    document.getElementById('futureDeliveryDialog')?.remove();
    const minDate=daysFromToday(2);
    const modal=document.createElement('div');
    modal.id='futureDeliveryDialog'; modal.className='dashboard-action-modal';
    modal.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Future Delivery','تسليم مستقبلي')}</h3><p class="muted">${L('Choose a date after tomorrow.','اختر تاريخًا بعد غد.')}</p><label>${L('Delivery date','تاريخ التسليم')}<input id="futureDeliveryDate" type="date" min="${minDate}" value="${minDate}"></label><div class="actions"><button type="button" class="ghost" id="futureDeliveryCancel">${L('Cancel','إلغاء')}</button><button type="button" id="futureDeliverySave">${L('Save','حفظ')}</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#futureDeliveryCancel').onclick=()=>{modal.remove();resolve(null);};
    modal.querySelector('#futureDeliverySave').onclick=()=>{const v=modal.querySelector('#futureDeliveryDate')?.value||'';if(!v)return alert(L('Select a future date','اختر تاريخًا مستقبليًا'));if(v<minDate)return alert(L('Future Delivery must be after tomorrow','يجب أن يكون Future Delivery بعد غد أو أبعد'));modal.remove();resolve(v);};
  });
}
async function shipmentRowAction(action,orderId){
  const row=shipmentRowData(orderId);
  if(!row)return;
  closeShipmentRowActions();
  if(action==="open"){openOrder(orderId,"shipments");return;}
  if(action==="edit"){openOrder(orderId,"shipments");return;}
  if(action==="pdf"){printRowsPDF([dashboardShipmentExportRow(row)],"dashboard-shipments");return;}
  if(action==="excel"){exportRowsExcel([dashboardShipmentExportRow(row)],"dashboard-shipment");return;}
  if(action.startsWith("status:")){
    const status=decodeURIComponent(action.slice(7));
    const shipmentId=row.id||row.shipment_id;
    if(status==="Location Change"){
      const values=await openLocationChangeDialog();
      if(!values)return;
      await setStatus(shipmentId,status,values);
    }else if(status==="Future Delivery"){
      const date=await openFutureDeliveryDialog();
      if(!date)return;
      await setStatus(shipmentId,status,{date});
    }else{
      await setStatus(shipmentId,status);
    }
    await loadShipments();
  }
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".shipment-actions-wrap"))closeShipmentRowActions();
  if(!e.target.closest("[data-nav-toggle]") && !e.target.closest(".nav-dropdown")){
    document.querySelectorAll(".nav-dropdown.open").forEach(m=>m.classList.remove("open"));
  }
});
function selectedShipmentIds(){return [...document.querySelectorAll("#shipmentsTable .shipment-row-check:checked")].map(x=>String(x.value)).filter(Boolean);}
function toggleAllShipmentRows(el){document.querySelectorAll("#shipmentsTable .shipment-row-check").forEach(x=>x.checked=el.checked);const top=$("shipmentSelectAllTop");if(top&&top!==el)top.checked=el.checked;updateShipmentSelection();}
function updateShipmentSelection(){const checks=[...document.querySelectorAll("#shipmentsTable .shipment-row-check")];const selected=checks.filter(x=>x.checked);const n=selected.length;const b=$("shipmentSelectedCount");if(b)b.textContent=n?`${n} ${L("selected","محدد")}`:"";const top=$("shipmentSelectAllTop");if(top){top.checked=checks.length>0&&selected.length===checks.length;top.indeterminate=n>0&&n<checks.length;} }
function repairShipmentMenuLabels(){
  document.querySelectorAll(".shipment-bulk-menu .shipment-bulk-item, .shipment-bulk-menu .shipment-bulk-label, .shipment-action-item").forEach(el=>{
    const text=Array.from(el.querySelectorAll(".shipment-menu-text")).map(x=>x.textContent||"").join(" ").trim();
    if(text) el.setAttribute("data-menu-label",text);
  });
}

let shipmentMenuLabelObserver=null;
function startShipmentMenuLabelObserver(){
 if(shipmentMenuLabelObserver) return;
 shipmentMenuLabelObserver=new MutationObserver(()=>repairShipmentMenuLabels());
 shipmentMenuLabelObserver.observe(document.body,{subtree:true,childList:true});
}
startShipmentMenuLabelObserver();
function toggleDashboardShipmentActions(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const menu=document.getElementById("dashboardShipmentActionsMenu");
  const btn=document.getElementById("dashboardShipmentActionsBtn");
  if(!menu||!btn)return;
  document.querySelectorAll(".shipment-bulk-menu.open").forEach(m=>{if(m!==menu)m.classList.remove("open")});
  if(menu.parentElement!==document.body) document.body.appendChild(menu);
  const r=btn.getBoundingClientRect();
  menu.style.position="fixed";
  menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-288))+"px";
  menu.style.top=Math.min(window.innerHeight-20,r.bottom+8)+"px";
  menu.style.right="auto";
  menu.style.zIndex="2147483647";
  menu.classList.toggle("open");
  repairShipmentMenuLabels();
  setTimeout(repairShipmentMenuLabels,0);
}
function toggleShipmentBulkActions(){const menu=document.getElementById("shipmentBulkActionsMenuPage");if(!menu)return;menu.classList.toggle("open");}
function closeShipmentBulkActions(){document.querySelectorAll(".shipment-bulk-menu").forEach(m=>m.classList.remove("open"));}
function dashboardActionNotice(message,type="info"){
  let box=document.getElementById("dashboardActionNotice");
  if(!box){box=document.createElement("div");box.id="dashboardActionNotice";box.className="dashboard-action-notice";document.body.appendChild(box);}
  box.textContent=message; box.className="dashboard-action-notice "+(type||"info"); box.style.display="block";
  clearTimeout(window.__dashboardActionNoticeTimer);
  window.__dashboardActionNoticeTimer=setTimeout(()=>{box.style.display="none";},2600);
}
async function openLocationChangeDialog(){
  const [g,a] = await Promise.all([api('/api/governorates'),api('/api/areas')]);
  const govs=g.data||[], areas=a.data||[];
  return new Promise(resolve=>{
    let old=document.getElementById('locationChangeDialog'); if(old) old.remove();
    const d=document.createElement('div'); d.id='locationChangeDialog'; d.className='dashboard-action-modal';
    d.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Location Change','تغيير الموقع')}</h3>
      <label>${L('Emirate','الإمارة')}<select id="lcEmirate"><option value="">${L('Select Emirate','اختر الإمارة')}</option>${govs.map(g=>`<option value="${esc(g.id)}">${esc(L(g.name_en,g.name_ar))}</option>`).join('')}</select></label>
      <label>${L('Area','المنطقة')}<select id="lcArea" disabled><option value="">${L('Select Area','اختر المنطقة')}</option></select></label>
      <label>${L('Date','التاريخ')}<input id="lcDate" type="date" value="${today()}"></label>
      <div class="actions"><button id="lcCancel" class="ghost" type="button">${L('Cancel','إلغاء')}</button><button id="lcSave" type="button">${L('Save','حفظ')}</button></div></div>`;
    document.body.appendChild(d);
    const gov=d.querySelector('#lcEmirate'), area=d.querySelector('#lcArea');
    gov.onchange=()=>{ const gid=gov.value; const opts=areas.filter(x=>String(x.governorate_id)===String(gid)); area.disabled=!gid; area.innerHTML=`<option value="">${L('Select Area','اختر المنطقة')}</option>`+opts.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join(''); };
    const finish=v=>{d.remove();resolve(v)};
    d.querySelector('#lcCancel').onclick=()=>finish(null);
    d.querySelector('#lcSave').onclick=()=>{
      if(!gov.value) return alert(L('Select Emirate first','اختر الإمارة أولاً'));
      if(!area.value) return alert(L('Select Area first','اختر المنطقة أولاً'));
      finish({emirate_id:gov.value,area_id:area.value,date:d.querySelector('#lcDate').value});
    };
  });
}

async function shipmentBulkAction(action){
  const ids=selectedShipmentIds();
  const selectedShipmentRows=SHIP_ROWS.filter(r=>ids.includes(String(r.order_id||r.order?.id||"")));
  const selectedShipmentIdsForApi=[...new Set(selectedShipmentRows.map(r=>String(r.id||r.shipment_id||"")).filter(Boolean))];
  if(action!=="clear"&&!ids.length){
    dashboardActionNotice(L("Select at least one shipment first.","حدد شحنة واحدة على الأقل أولاً."),"warning");
    return;
  }
  if(action==="clear"){document.querySelectorAll("#shipmentsTable .shipment-row-check").forEach(x=>x.checked=false);const top=$("shipmentSelectAllTop");if(top){top.checked=false;top.indeterminate=false;}updateShipmentSelection();closeShipmentBulkActions();return;}
  if(action==="open"){openOrder(ids[0]);closeShipmentBulkActions();return;}
  if(action==="patch-outscan"){
    closeShipmentBulkActions();
    if(!selectedShipmentIdsForApi.length){dashboardActionNotice(L("No valid shipment rows are selected.","لا توجد شحنات صالحة محددة."),"error");return;}
    await chooseOperationsDriverAndAssign(selectedShipmentIdsForApi);
    return;
  }
  const selectedRows=SHIP_ROWS.filter(r=>ids.includes(String(r.order_id||r.order?.id)));
  if(action==="print"){printRowsPDF(selectedRows.map(dashboardShipmentExportRow),"dashboard-shipments-selected");closeShipmentBulkActions();return;}
  if(action.startsWith("status:")){
    if(!selectedShipmentIdsForApi.length){dashboardActionNotice(L("No valid shipment rows are selected.","لا توجد شحنات صالحة محددة."),"error");return;}
    const status=decodeURIComponent(action.slice(7));
    closeShipmentBulkActions();
    try{
      let meta=null;
      if(status==="Location Change"){
        meta=await openLocationChangeDialog();
        if(!meta) return;
      }else if(status==="Future Delivery"){
        const date=await openFutureDeliveryDialog();
        if(!date) return;
        meta={date};
      }
      const results=[];
      for(const id of selectedShipmentIdsForApi){
        try{await setStatus(id,status,meta);results.push({ok:true,id});}
        catch(error){results.push({ok:false,id,error:error?.message||String(error)});}
      }
      const failed=results.filter(r=>!r.ok);
      if(failed.length){
        const firstError=failed[0]?.error||'';
        dashboardActionNotice(L(`${results.length-failed.length} succeeded, ${failed.length} failed.${firstError?' '+firstError:''}`,`تم تنفيذ ${results.length-failed.length} وفشل ${failed.length}.${firstError?' '+firstError:''}`),"error");
      }else{dashboardActionNotice(L(`Status changed to ${status} for ${results.length} shipment(s).`,`تم تغيير الحالة إلى ${status} لعدد ${results.length} شحنة.`),"success");}
      await loadShipments();
    }catch(e){dashboardActionNotice(e.message||L("Could not update shipments.","تعذر تحديث الشحنات."),"error");}
  }
}
document.addEventListener("click",e=>{if(!e.target.closest(".shipment-actions-wrap")&&!e.target.closest(".dashboard-bulk-menu")){closeShipmentBulkActions();document.querySelectorAll(".dashboard-bulk-menu.open").forEach(m=>m.classList.remove("open"));}});

function clearShipmentFilters(){
  ["shipFilterTracking","shipFilterOrderShipment","shipFilterShipper","shipFilterPriceMin","shipFilterPriceMax","shipFilterDriver","shipFilterJobCode","shipFilterStatus","shipFilterDate","shipFilterDaysOut"].forEach(id=>{const el=$(id);if(el)el.value="";});
  ["shipFilterDriver","shipFilterStatus"].forEach(id=>{const el=$(id);if(el)el.value="";});
  filterShipmentsDashboard();
}
function filterShipmentsDashboard(){
  const q=(id)=>($(id)?.value||"").trim().toLowerCase();
  const tracking=q("shipFilterTracking"), orderShipment=q("shipFilterOrderShipment"), merchant=q("shipFilterShipper");
  const driver=q("shipFilterDriver"), jobCode=q("shipFilterJobCode"), status=q("shipFilterStatus"), date=q("shipFilterDate"), daysOut=q("shipFilterDaysOut");
  const min=parseFloat($("shipFilterPriceMin")?.value), max=parseFloat($("shipFilterPriceMax")?.value);
  document.querySelectorAll("#shipmentsTable tbody .shipment-dashboard-row").forEach(row=>{
    const matchText=(value,needle)=>!needle||String(value||"").toLowerCase().includes(needle);
    const price=Number(row.dataset.price||0);
    const ok=matchText(row.dataset.tracking,tracking)&&matchText(`${row.dataset.order} ${row.dataset.shipment}`,orderShipment)&&matchText(row.dataset.merchant,merchant)
      &&matchText(row.dataset.driver,driver)&&matchText(row.dataset.jobcode,jobCode)&&matchText(row.dataset.status,status)
      &&(!date||row.dataset.date===date)&&(!daysOut||row.dataset.daysout===daysOut)&&(!Number.isFinite(min)||price>=min)&&(!Number.isFinite(max)||price<=max);
    row.style.display=ok?"":"none";
  });
}
function exportShipmentsExcel(){exportRowsExcel(SHIP_ROWS.map(dashboardShipmentExportRow),"dashboard-shipments");}
function exportShipmentsPDF(){printRowsPDF(SHIP_ROWS.map(dashboardShipmentExportRow),"dashboard-shipments");}

async function setStatus(id,status,meta=null){const d=await api("/api/shipments/status",{method:"POST",body:JSON.stringify({shipment_id:id,status,...(meta||{})})});if(!d?.success)throw new Error(d?.error||L("Status update failed","فشل تحديث الحالة"));const canonical=String(d.data?.status||status);const matches=x=>String(x?.id||x?.shipment_id||"")===String(id)||String(x?.shipment_id||"")===String(id);for(const key of ["SHIP_ROWS","DELIVERY_JOB_ROWS","OPERATIONS_ROWS","__operationsRows","__shipmentSearchRows"]){const arr=window[key];if(Array.isArray(arr))for(const row of arr){if(matches(row)){row.status=canonical;row.current_status=canonical;if(row.order)row.order.status=canonical;if(row.shipment)row.shipment.status=canonical;}}}window.dispatchEvent(new CustomEvent("trend:order-status-changed",{detail:{shipmentId:String(id),status:canonical,data:d.data||null}}));return d;}

let jobCodeScanTimer=null;
let jobCodeScanBusy=false;
let jobCodeScanQueue=[];
let jobCodeScanLastQueued='';
async function jobCodePage(c){
  c.innerHTML=`<div class="panel job-code-search-page"><div class="section-title-row"><div><h2>${t("Update Delivery Job Code")}</h2><p class="muted">${L("Set the starting Jopcod once, then scan each coupon. It saves automatically and changes status to In Ops.","حدد رقم بداية Jopcod مرة واحدة، وبعدها اسكن كل كوبون؛ الحفظ تلقائي والحالة تتحول إلى In Ops.")}</p></div></div><div class="job-code-search-bar"><label>${L("Starting Jopcod","رقم بداية Jopcod")}<input id="jobCodeStartNumber" type="number" step="1" inputmode="numeric" value="10" placeholder="10"></label><label>${L("Scan Coupon / Shipment Number","اسكن رقم الكوبون / الشحنة")}<input id="jobCodeSearchInput" type="search" autocomplete="off" autofocus placeholder="${L("Scan barcode here","اسكن الباركود هنا")}"></label><button type="button" onclick="loadJobCodeOrders()">${L("Search","بحث")}</button></div><div id="jobCodeScanMessage" class="muted" role="status">${L("Ready to scan","جاهز للسكان")}</div><div id="jobCodeOrdersTable" class="table-wrap"><p class="muted">${L("Scanned orders and save results will appear here","ستظهر هنا الأوردرات التي تم سكانها ونتيجة الحفظ")}</p></div></div>`;
  jobCodeScanQueue=[];jobCodeScanLastQueued='';
  const input=$('jobCodeSearchInput');
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(jobCodeScanTimer);enqueueJobCodeScan(input.value);}});
  input?.addEventListener('input',()=>{clearTimeout(jobCodeScanTimer);const value=input.value.trim();if(value)jobCodeScanTimer=setTimeout(()=>enqueueJobCodeScan(input.value),90);});
}
function setJobCodeScanMessage(message,kind='muted'){
  const el=$('jobCodeScanMessage');if(el){el.className=kind;el.textContent=message;}
}
function enqueueJobCodeScan(value){
  const input=$('jobCodeSearchInput'),q=String(value||'').trim();
  if(!q)return;
  if(q===jobCodeScanLastQueued && (jobCodeScanBusy||jobCodeScanQueue.length))return;
  jobCodeScanLastQueued=q;
  jobCodeScanQueue.push(q);
  if(input && input.value.trim()===q)input.value='';
  if(!jobCodeScanBusy)void drainJobCodeScanQueue();
}
async function drainJobCodeScanQueue(){
  if(jobCodeScanBusy)return;
  jobCodeScanBusy=true;
  try{
    while(jobCodeScanQueue.length){
      const q=jobCodeScanQueue.shift();
      jobCodeScanLastQueued='';
      await processJobCodeScan(q);
    }
  }finally{
    jobCodeScanBusy=false;
    const input=$('jobCodeSearchInput');
    if(input)input.focus();
    if(jobCodeScanQueue.length)void drainJobCodeScanQueue();
  }
}
async function processJobCodeScan(q){
  const input=$('jobCodeSearchInput');const startInput=$('jobCodeStartNumber');
  const startText=String(startInput?.value||'').trim();
  if(!q)return;
  if(!startText||!Number.isSafeInteger(Number(startText))||Number(startText)<0){setJobCodeScanMessage(L('Enter a valid starting Jopcod first','اكتب رقم بداية Jopcod صحيح الأول'),'error');startInput?.focus();return;}
  clearTimeout(jobCodeScanTimer);setJobCodeScanMessage(L('Processing scan ','جارٍ معالجة السكان ')+q+'…');
  try{
    const d=await api('/api/update-job-code-orders?q='+encodeURIComponent(q));
    const rows=d.data||[];
    const needle=q.toLowerCase();
    const exact=rows.filter(r=>[r.tracking_number,r.shipment_no,r.job_code,r.order?.merchant_order_no,r.order?.order_code,r.order?.coupon_number,r.order?.coupon_no,r.order?.shipment_no,r.order_id].some(v=>String(v??'').trim().toLowerCase()===needle));
    const matches=exact.length?exact:rows;
    if(matches.length!==1){
      const el=$('jobCodeOrdersTable');if(el)el.innerHTML=matches.length?`<p class="error">${L('More than one order matched. Please search using the exact coupon or shipment number; no Jopcod was saved.','تم العثور على أكثر من أوردر. اسكن رقم الكوبون أو الشحنة بالكامل؛ لم يتم حفظ أي Jopcod.')}</p>`:`<p class="error">${L('No eligible order found for this scan. Jopcod was not changed.','لم يتم العثور على أوردر مطابق ومسموح بتحديثه؛ لم يتغير Jopcod.')}</p>`;
      setJobCodeScanMessage(L('No changes saved — check the scanned number','لم يتم الحفظ — راجع الرقم الممسوح'),'error');return;
    }
    const r=matches[0];const jobCode=String(Number(startText));
    setJobCodeScanMessage(L('Saving Jopcod ','جارٍ حفظ Jopcod ')+jobCode+'…');
    await api('/api/shipments/job-code',{method:'POST',body:JSON.stringify({shipment_id:r.id,new_job_code:jobCode})});
    const next=Number(startText)+1;startInput.value=String(next);
    const el=$('jobCodeOrdersTable');if(el){const card=document.createElement('article');card.className='job-code-result-card';card.innerHTML=`<div class="job-code-result-heading"><div><span class="job-code-result-label">${L('Order Number','رقم الأوردر')}</span><strong>${esc(r.order?.merchant_order_no||r.order?.order_code||r.order_id||'—')}</strong></div><span class="badge">In Ops</span></div><div class="job-code-result-grid"><div><span>${L('Coupon / Shipment','الكوبون / الشحنة')}</span><strong>${esc(q)}</strong></div><div><span>Jopcod</span><strong>${esc(jobCode)}</strong></div><div><span>${L('Tracking Number','رقم التتبع')}</span><strong>${esc(r.tracking_number||'—')}</strong></div><div><span>${L('Shipper','التاجر')}</span><strong>${esc(r.merchant?.name||'—')}</strong></div></div><p class="success">${L('Saved successfully — status changed to In Ops','تم الحفظ بنجاح — حالة الأوردر أصبحت In Ops')}</p>`;el.prepend(card);}
    setJobCodeScanMessage(L('Saved Jopcod ','تم حفظ Jopcod ')+jobCode+L(' — next number: ',' — الرقم التالي: ')+next,'success');
  }catch(e){setJobCodeScanMessage(L('Save failed; starting number was not advanced: ','فشل الحفظ؛ لم يتم تقديم التسلسل: ')+e.message,'error');}
}
async function loadJobCodeOrders(){const input=$('jobCodeSearchInput');return enqueueJobCodeScan(input?.value||'');}
async function saveUpdateJobCode(shipmentId){
  // Retained for compatibility with any already-rendered page; new workflow saves directly after scan.
  const input=document.querySelector(`.update-job-code-input[data-shipment-id="${CSS.escape(String(shipmentId))}"]`);
  const jobCode=(input?.value||'').trim();
  if(!jobCode)return alert(L('Job Code is required','Job Code مطلوب'));
  try{await api('/api/shipments/job-code',{method:'POST',body:JSON.stringify({shipment_id:shipmentId,new_job_code:jobCode})});await loadShipments();}
  catch(e){alert(e.message);}
}

async function scanDriverPage(c){
  const [d,rows]=await Promise.all([api("/api/drivers"),api(`/api/scan-driver?date=${encodeURIComponent(today())}`)]);
  const drivers=d.data||[]; const scans=rows.data||[]; const scanSummary=rows.summary||{};
  const driverOptions=drivers.map(x=>`<option value="${esc(x.id)}">${esc(x.name||"")} — ${esc(x.driver_no||"")}</option>`).join("");
  const renderRows=list=>list.map(r=>`<div class="scan-coupon-box scan-driver-compact-row ${r.booking_status==='booked'?'scan-booked':r.booking_status==='not_booked'?'scan-not-booked':''}" data-scan-id="${esc(r.id)}" data-booking-status="${esc(r.booking_status||'not_booked')}"><input type="checkbox" class="scan-driver-select" value="${esc(r.id)}" aria-label="${L("Select order","تحديد الأوردر")}"><b class="scan-driver-order-number">${esc(r.order_number)}</b><small class="scan-driver-employee">${L("Employee","الموظف")}: ${esc(r.employee_name||"—")}</small><small class="scan-booking-label">${r.booking_status==='booked'?`${L('Booked','محجوز')}${r.booking_merchant_name?' · '+esc(r.booking_merchant_name):''}`:L('Not booked','غير محجوز')}</small><button type="button" class="ghost scan-driver-delete" title="${L("Delete order","حذف الأوردر")}" aria-label="${L("Delete order","حذف الأوردر")}" onclick="deleteScanDriverOrder('${esc(r.id)}')">×</button></div>`).join("")||`<p class="muted">${L("No scanned orders yet","لا توجد أرقام تم Scan لها بعد")}</p>`;
  c.innerHTML=`<h2 class="scan-driver-page-title">${L("Scan Driver","Scan Driver")}</h2>
  <div class="panel scan-driver-panel"><div class="scan-driver-toolbar">
    <label>${L("Date","التاريخ")}<input id="scanDriverDate" type="date" value="${today()}"></label>
    <label>${L("Driver","المندوب")}<select id="scanDriverSelect"><option value="">${L("Select driver","اختر المندوب")}</option>${driverOptions}</select></label>
    <label class="scan-driver-search-field">${L("Search all records","بحث في كل السجلات")}<input id="scanDriverGlobalSearch" type="search" placeholder="${L("Order / driver / employee","رقم الأوردر / المندوب / الموظف")}"></label>
    <label>${L("Transfer to","نقل إلى")}<select id="scanTransferDriver"><option value="">${L("Choose driver","اختر المندوب")}</option>${driverOptions}</select></label>
    <button type="button" class="scan-driver-transfer-button" onclick="transferSelectedScanDriver()">${L("Transfer selected","نقل المحدد")}</button>
  </div>
  <div class="scan-driver-entry"><label>${L("Scan / Coupon Number","رقم الأوردر / الكوبون")}<input id="scanCouponInput" inputmode="numeric" autocomplete="off" placeholder="${L("Scan or type order number, then press Enter to save","امسح أو اكتب رقم الأوردر واضغط Enter للحفظ")}"></label><button type="button" onclick="saveScanDriver()">${L("Save Scan","حفظ")}</button><button type="button" class="ghost" onclick="loadScanDriverRows()">${L("Refresh","تحديث")}</button></div>
  <div id="scanDriverMsg" class="msg"></div></div>
  <div class="panel scan-driver-results-panel"><div class="scan-driver-booking-stats"><div class="scan-stat scan-stat-booked"><small>${L('Booked','محجوز')}</small><b id="scanBookedCount">${Number(scanSummary.booked_count??scans.filter(r=>r.booking_status==='booked').length)}</b></div><div class="scan-stat scan-stat-unbooked"><small>${L('Not booked','غير محجوز')}</small><b id="scanUnbookedCount">${Number(scanSummary.not_booked_count??scans.filter(r=>r.booking_status!=='booked').length)}</b></div><div class="scan-stat"><small>${L('Total','الإجمالي')}</small><b id="scanDriverCount">${Number(scanSummary.total_count??scans.length)}</b></div></div><div id="scanDriverGlobalResults" class="scan-coupon-list scan-driver-compact-list"></div><div id="scanDriverRows" class="scan-coupon-list scan-driver-compact-list">${renderRows(scans)}</div></div>`;
  $("scanDriverSelect")?.addEventListener("change",loadScanDriverRows); $("scanDriverDate")?.addEventListener("change",loadScanDriverRows);
  const globalSearch=$("scanDriverGlobalSearch"); globalSearch?.addEventListener("input",()=>searchAllScanDriverRecords(globalSearch.value));
let scanDriverSaveTimer=null,scanDriverSaving=false,scanDriverRefreshQueued=false;
  const input=$("scanCouponInput"); input?.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();const v=input.value.trim();if(!v)return;const driver=$("scanDriverSelect")?.value;if(!driver){msg("scanDriverMsg",L("Select driver first","اختر المندوب أولاً قبل إدخال رقم الأوردر"),"error");$("scanDriverSelect")?.focus();return;}addPendingScanDriverNumber(v);input.value="";clearTimeout(scanDriverSaveTimer);scanDriverSaveTimer=setTimeout(()=>saveScanDriver(),180);input.focus();});
}
function addPendingScanDriverNumber(v){const box=document.createElement("div");box.className="scan-coupon-box pending scan-driver-compact-row";box.dataset.order=v;box.innerHTML=`<b class="scan-driver-order-number">${esc(v)}</b><small class="scan-driver-employee">${L("Employee","الموظف")}: ${esc(CURRENT_USER?.name||CURRENT_USER?.username||"—")}</small><small class="scan-booking-label">${L("Saving…","جارٍ الحفظ…")}</small>`;$("scanDriverRows")?.prepend(box);}
async function searchAllScanDriverRecords(query=""){const box=$("scanDriverGlobalResults");if(!box)return;const q=String(query||"").trim();if(!q){box.innerHTML="";return;}try{const d=await api(`/api/scan-driver?search_all=1&q=${encodeURIComponent(q)}`);const rows=d.data||[];box.innerHTML=rows.map(r=>`<div class="scan-coupon-box scan-driver-compact-row"><b class="scan-driver-order-number">${esc(r.driver_name||"—")}</b><small class="scan-driver-employee">${L("Employee","الموظف")}: ${esc(r.employee_name||"—")} · ${L("Date","التاريخ")}: ${esc(r.scan_date||"—")}</small></div>`).join("")||`<p class="muted">${L("No matching scan records","لا توجد سجلات مطابقة")}</p>`;}catch(e){box.innerHTML=`<p class="msg error">${esc(e.message||String(e))}</p>`;}}
async function saveScanDriver(){
  clearTimeout(scanDriverSaveTimer);
  if(scanDriverSaving){scanDriverRefreshQueued=true;return;}
  const driver=$("scanDriverSelect")?.value,date=$("scanDriverDate")?.value||today();
  if(!driver)return msg("scanDriverMsg",L("Select driver first","اختر المندوب أولاً"),"error");
  const nodes=[...document.querySelectorAll("#scanDriverRows .scan-coupon-box.pending")];
  const batch=nodes.map(x=>({node:x,order:x.dataset.order})).filter(x=>x.order);
  if(!batch.length)return msg("scanDriverMsg",L("Scan at least one order number","امسح رقم أوردر واحد على الأقل"),"error");
  scanDriverSaving=true;scanDriverRefreshQueued=false;
  try{
    const d=await api("/api/scan-driver",{method:"POST",body:JSON.stringify({driver_id:driver,scan_date:date,order_numbers:batch.map(x=>x.order)})});
    batch.forEach(x=>{x.node.classList.remove("pending");x.node.dataset.saved="1";const label=x.node.querySelector(".scan-booking-label");if(label)label.textContent=L("Saved — checking booking…","تم الحفظ — جارٍ فحص الحجز…");});
    msg("scanDriverMsg",`${L("Saved batch","تم حفظ الدفعة")}: ${d.saved||0}`,"ok");
  }catch(e){msg("scanDriverMsg",e.message,"error");}
  finally{
    scanDriverSaving=false;
    const batchNodes=new Set(batch.map(x=>x.node));
    const remainingNodes=[...document.querySelectorAll("#scanDriverRows .scan-coupon-box.pending")];
    const newlyQueued=remainingNodes.some(node=>!batchNodes.has(node));
    if(newlyQueued){scanDriverSaveTimer=setTimeout(()=>saveScanDriver(),0);}
    else if(!remainingNodes.length&&(scanDriverRefreshQueued||batch.length)){await loadScanDriverRows();}
  }
}
async function loadScanDriverRows(){const driver=$("scanDriverSelect")?.value||"",date=$("scanDriverDate")?.value||today();if(!driver){const box=$("scanDriverRows");if(box)box.innerHTML=`<p class="muted">${L("Select a driver","اختر المندوب")}</p>`;return;}try{const d=await api(`/api/scan-driver?driver_id=${encodeURIComponent(driver)}&date=${encodeURIComponent(date)}`);const box=$("scanDriverRows"),rows=d.data||[];if(box)box.innerHTML=rows.map(r=>`<div class="scan-coupon-box scan-driver-compact-row ${r.booking_status==='booked'?'scan-booked':'scan-not-booked'}" data-scan-id="${esc(r.id)}" data-booking-status="${esc(r.booking_status||'not_booked')}"><input type="checkbox" class="scan-driver-select" value="${esc(r.id)}" aria-label="${L("Select order","تحديد الأوردر")}"><b class="scan-driver-order-number">${esc(r.order_number)}</b><small class="scan-driver-employee">${L("Employee","الموظف")}: ${esc(r.employee_name||"—")}</small><small class="scan-booking-label">${r.booking_status==='booked'?`${L('Booked','محجوز')}${r.booking_merchant_name?' · '+esc(r.booking_merchant_name):''}`:L('Not booked','غير محجوز')}</small><button type="button" class="ghost scan-driver-delete" title="${L("Delete order","حذف الأوردر")}" aria-label="${L("Delete order","حذف الأوردر")}" onclick="deleteScanDriverOrder('${esc(r.id)}')">×</button></div>`).join("")||`<p class="muted">${L("No scanned orders yet","لا توجد أرقام تم Scan لها بعد")}</p>`;const summary=d.summary||{};if($("scanDriverCount"))$("scanDriverCount").textContent=String(summary.total_count??rows.length);if($("scanBookedCount"))$("scanBookedCount").textContent=String(summary.booked_count??rows.filter(r=>r.booking_status==='booked').length);if($("scanUnbookedCount"))$("scanUnbookedCount").textContent=String(summary.not_booked_count??rows.filter(r=>r.booking_status!=='booked').length);}catch(e){msg("scanDriverMsg",e.message,"error");}}
async function deleteScanDriverOrder(id){if(!id)return;try{await api(`/api/scan-driver/${encodeURIComponent(id)}`,{method:"DELETE"});msg("scanDriverMsg",L("Order removed","تم حذف الأوردر من القائمة"),"ok");await loadScanDriverRows();}catch(e){msg("scanDriverMsg",e.message,"error");}}
async function transferSelectedScanDriver(){const ids=[...document.querySelectorAll("#scanDriverRows .scan-driver-select:checked")].map(x=>x.value),driverId=$("scanTransferDriver")?.value;if(!ids.length)return msg("scanDriverMsg",L("Select at least one order","حدد أوردر واحدًا على الأقل"),"error");if(!driverId)return msg("scanDriverMsg",L("Choose the new driver","اختر المندوب الجديد"),"error");if(driverId===$("scanDriverSelect")?.value)return msg("scanDriverMsg",L("Choose a different driver","اختر مندوبًا مختلفًا"),"error");try{const d=await api("/api/scan-driver/transfer",{method:"POST",body:JSON.stringify({record_ids:ids,new_driver_id:driverId})});msg("scanDriverMsg",`${L("Transferred successfully","تم نقل الأوردرات بنجاح")}: ${d.transferred||0}`,"ok");await loadScanDriverRows();}catch(e){msg("scanDriverMsg",e.message,"error");}}

let DELIVERY_JOB_ROWS=[];
let DELIVERY_JOB_AVAILABLE=[];
let DELIVERY_JOB_DRIVERS=[];
let DELIVERY_JOB_APPLIED_FROM=today();
let DELIVERY_JOB_APPLIED_TO=today();

const CUMULATIVE_LOOKUPS = {};
function mountCumulativeShipmentSearch(mountId,key){
  const mount=$(mountId); if(!mount)return;
  CUMULATIVE_LOOKUPS[key]=CUMULATIVE_LOOKUPS[key]||[];
  mount.innerHTML='<section class="cumulative-shipment-search" data-search-key="'+esc(key)+'">'+
    '<button type="button" class="cumulative-search-toggle" aria-label="'+esc(L("Open quick shipment search","فتح البحث السريع عن الشحنات"))+'" title="'+esc(L("Quick shipment search","البحث السريع عن الشحنات"))+'"><span aria-hidden="true">⌕</span></button>'+
    '<div class="cumulative-search-body" id="'+esc(key)+'Body" hidden>'+
      '<div class="cumulative-search-entry"><input id="'+esc(key)+'Input" type="search" autocomplete="off" placeholder="'+esc(L("Enter tracking or order number…","اكتب رقم التتبع أو الأوردر…"))+'" aria-label="'+esc(L("Shipment search","البحث عن شحنة"))+'"><button type="button" class="cumulative-search-add">'+esc(L("Add result","إضافة نتيجة"))+'</button><button type="button" class="cumulative-search-clear">'+esc(L("Clear","مسح"))+'</button></div>'+
      '<div class="cumulative-search-results" id="'+esc(key)+'Results" aria-live="polite"></div>'+
    '</div></section>';
  mount.querySelector('.cumulative-search-toggle')?.addEventListener('click',()=>toggleCumulativeShipmentSearch(key));
  mount.querySelector('.cumulative-search-add')?.addEventListener('click',()=>runCumulativeShipmentSearch(key));
  mount.querySelector('.cumulative-search-clear')?.addEventListener('click',()=>clearCumulativeShipmentSearch(key));
  const input=$(key+'Input');
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runCumulativeShipmentSearch(key);}});
  renderCumulativeShipmentResults(key);
}
function toggleCumulativeShipmentSearch(key){
  const body=$(key+'Body'); if(!body)return;
  body.hidden=!body.hidden;
  if(!body.hidden)$(key+'Input')?.focus();
}
function clearCumulativeShipmentSearch(key){
  CUMULATIVE_LOOKUPS[key]=[];
  renderCumulativeShipmentResults(key);
  const input=$(key+'Input'); if(input){input.value='';input.focus();}
}
async function runCumulativeShipmentSearch(key){
  const input=$(key+'Input'),query=String(input?.value||'').trim();
  if(!query)return;
  const body=$(key+'Body'),button=body?.querySelector('.cumulative-search-add');
  if(button)button.disabled=true;
  try{
    const payload=await api('/api/search?q='+encodeURIComponent(query));
    const candidates=Array.isArray(payload?.results)?payload.results:(payload?.data?[payload.data]:[]);
    const matches=candidates.filter(x=>x&&(x.shipment?.id||x.shipment_id||x.order_id||x.order?.id||((x.tracking_number||x.shipment_no)&&x.id)));
    if(!matches.length)CUMULATIVE_LOOKUPS[key].push({query,empty:true});
    else matches.forEach(match=>CUMULATIVE_LOOKUPS[key].push({query,match}));
    renderCumulativeShipmentResults(key);
    if(input)input.value='';
  }catch(error){
    CUMULATIVE_LOOKUPS[key].push({query,error:String(error?.message||error)});
    renderCumulativeShipmentResults(key);
  }finally{if(button)button.disabled=false;}
}
function renderCumulativeShipmentResults(key){
  const box=$(key+'Results'); if(!box)return;
  const entries=CUMULATIVE_LOOKUPS[key]||[];
  if(!entries.length){
    box.innerHTML='<div class="cumulative-search-empty">'+esc(L("Search a number to add its result here.","ابحث برقم لإضافة النتيجة هنا."))+'</div>';
    return;
  }
  box.innerHTML=entries.map((entry,index)=>{
    if(entry.empty)return '<div class="cumulative-search-item cumulative-search-no-match"><span class="cumulative-search-index">'+(index+1)+'</span><div><b>'+esc(entry.query)+'</b><small>'+esc(L("No matching shipment found","لم يتم العثور على شحنة مطابقة"))+'</small></div><button type="button" class="cumulative-search-remove" data-index="'+index+'" aria-label="'+esc(L("Remove result","حذف النتيجة"))+'">×</button></div>';
    if(entry.error)return '<div class="cumulative-search-item cumulative-search-no-match"><span class="cumulative-search-index">'+(index+1)+'</span><div><b>'+esc(entry.query)+'</b><small>'+esc(entry.error)+'</small></div><button type="button" class="cumulative-search-remove" data-index="'+index+'" aria-label="'+esc(L("Remove result","حذف النتيجة"))+'">×</button></div>';
    const x=entry.match||{},o=x.order||x,shipment=x.shipment||{};
    const tracking=x.tracking_number||shipment.tracking_number||x.shipment_no||shipment.shipment_no||'';
    const orderNo=o.merchant_order_no||o.order_code||o.order_number||'—';
    const phone=o.customer_phone||o.customer?.phone||o.customer_phone_1||'—';
    const shipper=merchantLabel(x.merchant)||'—';
    const status=x.status||x.current_status||shipment.status||o.status||'—';
    const id=shipment.id||x.shipment_id||((x.order_id||x.order?.id)&&x.id?x.id:'')||((x.tracking_number||x.shipment_no)&&x.id?x.id:'');
    return '<div class="cumulative-search-item"><span class="cumulative-search-index">'+(index+1)+'</span><button type="button" class="cumulative-search-order" data-shipment-id="'+esc(id)+'" data-tracking="'+esc(tracking)+'"><b>'+esc(tracking||entry.query)+'</b><small>'+esc(L("Order","الأوردر"))+': '+esc(orderNo)+' · '+esc(L("Phone","الهاتف"))+': '+esc(phone)+'</small><small>'+esc(L("Merchant","التاجر"))+': '+esc(shipper)+' · '+esc(L("Status","الحالة"))+': '+esc(status)+'</small></button><button type="button" class="cumulative-search-remove" data-index="'+index+'" aria-label="'+esc(L("Remove result","حذف النتيجة"))+'">×</button></div>';
  }).join('');
  box.querySelectorAll('.cumulative-search-order').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.shipmentId||'',tracking=button.dataset.tracking||'';
    if(id)openShipmentQuickPopup(id,tracking);
  }));
  box.querySelectorAll('.cumulative-search-remove').forEach(button=>button.addEventListener('click',()=>removeCumulativeShipmentResult(key,Number(button.dataset.index))));
}
function removeCumulativeShipmentResult(key,index){
  if(!CUMULATIVE_LOOKUPS[key])return;
  CUMULATIVE_LOOKUPS[key].splice(index,1);
  renderCumulativeShipmentResults(key);
}

async function jobsPage(c){
  const [d,g,a]=await Promise.all([api('/api/drivers'),api('/api/governorates'),api('/api/areas')]);
  const drivers=d.data||[], govs=g.data||[], areas=a.data||[];
  DELIVERY_JOB_DRIVERS=drivers;
  DELIVERY_JOB_APPLIED_FROM=today(); DELIVERY_JOB_APPLIED_TO=today();
  c.innerHTML=`<div class="delivery-job-topbar">
    <h2 class="delivery-job-page-title">${L('Delivery Job','مهام التوصيل')}</h2>
    <button id="deliveryJobDateToggle" class="delivery-job-date-toggle" type="button" onclick="toggleDeliveryJobDatePanel()" aria-label="${L('Choose date range','اختيار الفترة الزمنية')}"><span class="delivery-job-calendar-icon">▦</span><span>${L('Date','التاريخ')}</span><small id="deliveryJobDateSummary">${today()}</small></button>
    <div class="delivery-job-actions delivery-job-top-actions">
      <button class="ghost" type="button" onclick="exportDeliveryJobStatementPDF()">▤ ${L('PDF','PDF')}</button>
      <button class="ghost" type="button" onclick="exportDeliveryJobStatementExcel()">▦ ${L('Excel','Excel')}</button>
      <button class="ghost" type="button" onclick="openDeliveryJobActions()">⚙ ${L('Actions','الإجراءات')}</button>
    </div>
  <div id="deliveryJobDatePanel" class="delivery-job-date-panel" hidden>
    <div class="delivery-job-date-panel-title"><span>▦</span><strong>${L('Choose date range','تحديد الفترة الزمنية')}</strong></div>
    <div class="delivery-job-date-fields">
      <label>${L('Date From','من تاريخ')}<input id="jobDateFrom" type="date" value="${today()}"></label>
      <label>${L('Date To','إلى تاريخ')}<input id="jobDate" type="date" value="${today()}"></label>
    </div>
    <div class="delivery-job-date-buttons">
      <button class="ghost" type="button" onclick="cancelDeliveryJobDateFilter()">${L('Cancel','إلغاء')}</button>
      <button class="primary" type="button" onclick="applyDeliveryJobDateFilter()">${L('Apply','تطبيق')}</button>
    </div>
  </div>
  </div>
  <div class="panel delivery-job-board-panel">
    <div class="delivery-job-filters">
      <label>${L('Driver','المندوب')}<select id="jobDriver"><option value="">${L('Select driver','اختر المندوب')}</option>${drivers.map(x=>`<option value="${esc(x.id)}">${esc(x.name||'')} — ${esc(x.driver_no||'')}</option>`).join('')}</select></label>
      <label>${L('Emirate','الإمارة')}<select id="jobGov"><option value="">${L('All','كل الإمارات')}</option>${govs.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('')}</select></label>
      <label>${L('Area','المنطقة')}<select id="jobArea"><option value="">${L('All','كل المناطق')}</option></select></label>
      <label class="delivery-job-search-field">${L('Search','بحث')}<input id="jobSearch" type="search" placeholder="${L('Tracking / Order / Customer / Shipper','رقم التتبع / الأوردر / العميل / التاجر')}"></label>
      <button class="delivery-job-search-btn" type="button" onclick="loadDeliveryJobBoard()">${L('Search','بحث')}</button>
    </div>
  </div>
  <div id="jobCumulativeSearchMount"></div>
  <div class="panel delivery-job-results-panel">
    <div class="delivery-job-toolbar"><h3>${L('Order data','بيانات الأوردرات')}</h3></div>
    <div id="deliveryJobAssigned"></div>
    <div class="delivery-job-count" id="deliveryJobAssignedCount">${L('Orders','عدد الأوردرات')}: 0</div>
  </div>
  <div id="jobMsg" class="msg"></div>`;
  mountCumulativeShipmentSearch("jobCumulativeSearchMount","job-cumulative-search");
  const area=$('jobArea'), gov=$('jobGov');
  gov.onchange=()=>{const opts=areas.filter(x=>String(x.governorate_id)===String(gov.value));area.innerHTML=`<option value="">${L('All','كل المناطق')}</option>`+opts.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('');};
  ['jobDriver','jobGov','jobArea'].forEach(id=>$(id)?.addEventListener('change',loadDeliveryJobBoard));
  $('jobSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadDeliveryJobBoard();});
  await loadDeliveryJobBoard();
}
function toggleDeliveryJobDatePanel(){
  const panel=$('deliveryJobDatePanel'); if(!panel)return;
  panel.hidden=!panel.hidden;
  if(!panel.hidden){$('jobDateFrom').value=DELIVERY_JOB_APPLIED_FROM||today();$('jobDate').value=DELIVERY_JOB_APPLIED_TO||today();}
}
function cancelDeliveryJobDateFilter(){
  if($('jobDateFrom'))$('jobDateFrom').value=DELIVERY_JOB_APPLIED_FROM||today();
  if($('jobDate'))$('jobDate').value=DELIVERY_JOB_APPLIED_TO||today();
  const panel=$('deliveryJobDatePanel');if(panel)panel.hidden=true;
}
function applyDeliveryJobDateFilter(){
  const from=$('jobDateFrom')?.value||today(),to=$('jobDate')?.value||today();
  if(from>to){msg('jobMsg',L('The start date must be on or before the end date','تاريخ البداية لازم يكون قبل أو نفس تاريخ النهاية'),'error');return;}
  DELIVERY_JOB_APPLIED_FROM=from;DELIVERY_JOB_APPLIED_TO=to;
  const summary=$('deliveryJobDateSummary');if(summary)summary.textContent=from===to?from:`${from} – ${to}`;
  const panel=$('deliveryJobDatePanel');if(panel)panel.hidden=true;
  loadDeliveryJobBoard();
}
function deliveryJobQuery(){const from=DELIVERY_JOB_APPLIED_FROM||today(),to=DELIVERY_JOB_APPLIED_TO||today();return new URLSearchParams({driver_id:$('jobDriver')?.value||'',from_date:from,to_date:to,date:to,governorate_id:$('jobGov')?.value||'',area_id:$('jobArea')?.value||'',q:$('jobSearch')?.value?.trim()||''}).toString();}
async function loadDeliveryJobBoard(){
  try{
    const d=await api('/api/delivery-jobs/board?'+deliveryJobQuery());
    DELIVERY_JOB_ROWS=d.data||[]; DELIVERY_JOB_AVAILABLE=d.available||[];
    renderDeliveryJobAssigned(); renderDeliveryJobAvailable();
  }catch(e){const a=$('deliveryJobAssigned');if(a)a.innerHTML=`<div class="error">${esc(e.message)}</div>`;}
}
function deliveryJobOrderCell(r){const sid=r.shipment_id||r.id||'';return `<button type="button" class="delivery-job-primary shipment-quick-trigger" onclick="openShipmentQuickPopup('${esc(sid)}','${esc(r.tracking_number||'')}')">${esc(r.tracking_number||'')}</button><div class="delivery-job-secondary">${esc(r.merchant_order_no||'')}</div>`;}
function deliveryJobAreaName(r){
  const candidates=[r?.area?.name_en,r?.area?.name_ar,r?.area?.name,r?.area_name_en,r?.area_name_ar,r?.area_name,r?.region?.name_en,r?.region?.name_ar,r?.region?.name,r?.region_name_en,r?.region_name_ar,r?.region_name,r?.zone?.name_en,r?.zone?.name_ar,r?.zone?.name,r?.zone_name,r?.district?.name_en,r?.district?.name_ar,r?.district?.name,r?.district_name,r?.route_area];
  const value=candidates.find(v=>typeof v==='string'&&v.trim()&&!/^\d+$/.test(v.trim()));
  return String(value||'').trim();
}
function deliveryJobGovernorateName(r){const candidates=[r?.governorate?.name_en,r?.governorate?.name_ar,r?.governorate?.name,r?.governorate_name_en,r?.governorate_name_ar,r?.emirate_name_en,r?.emirate_name_ar,r?.emirate];const value=candidates.find(v=>typeof v==='string'&&v.trim()&&!/^\d+$/.test(v.trim()));return String(value||'').trim();}
function deliveryJobLocationCell(r){return `<div>${esc(deliveryJobGovernorateName(r)||'—')}</div><small class="delivery-job-area-name">${esc(deliveryJobAreaName(r)||'—')}</small>`;}
function renderDeliveryJobAssigned(){
  const box=$('deliveryJobAssigned'); if(!box)return;
  if(!DELIVERY_JOB_ROWS.length){
    box.innerHTML=`<div class="delivery-job-empty">${L('No orders assigned for this driver/date/filter.','لا توجد أوردرات لهذا المندوب في التاريخ/الفلتر المحدد.')}</div>`;
  } else {
    box.innerHTML=`<div class="table-wrap"><table class="delivery-job-board-table delivery-job-orders-table"><thead><tr>
      <th><input type="checkbox" id="deliveryJobAssignedAll" onchange="toggleDeliveryJobSelectAll('assigned',this)"></th>
      <th>${L('Tracking / Order Number','رقم التتبع / رقم الأوردر')}</th>
      <th class="delivery-job-code-head"><span>Job</span><span>Code</span></th>
      <th>${L('Shipper','التاجر')}</th>
      <th>${L('Customer','اسم العميل')}</th>
      <th>${L('Phone 1 / Phone 2','رقم العميل 1 / 2')}</th>
      <th>${L('Emirate / Area','الإمارة / المنطقة')}</th>
      <th>${L('Price','السعر')}</th>
      <th>${L('Status','الحالة')}</th>
      <th>${L('Date','التاريخ')}</th>
      <th class="delivery-job-days-head"><span>Days</span><span>Out</span></th>
      <th class="delivery-job-remove-head">${L('Remove','إزالة')}</th>
    </tr></thead><tbody>${DELIVERY_JOB_ROWS.map(r=>`<tr>
      <td><input class="delivery-job-check-assigned" type="checkbox" value="${esc(r.shipment_id||r.id)}"></td>
      <td>${deliveryJobOrderCell(r)}</td>
      <td class="delivery-job-code-cell"><span class="badge">${esc(r.job_code||'—')}</span></td>
      <td>${esc(merchantLabel(r.merchant)||"—")}</td>
      <td>${esc(r.customer_name||'—')}</td>
      <td>${esc(r.customer_phone||'—')}<br><small>${esc(r.customer_phone_2||'')}</small></td>
      <td>${deliveryJobLocationCell(r)}</td>
      <td class="delivery-job-price-cell">${esc(money(r.cod??r.price??0,{withCode:false,digits:0}))}</td>
      <td><span class="badge">${esc(r.status||'')}</span></td>
      <td>${esc(String(r.last_status_at||r.status_changed_at||r.delivery_job_date||'').slice(0,10)||'—')}</td>
      <td class="delivery-job-days-cell">${esc(String(calculateDaysOut(r)))}</td>
      <td class="delivery-job-remove-cell">${(String(r.status||r.current_status||'').trim().toLowerCase()==='paid'||String(r.cash_collection_status||'').toLowerCase()==='paid'||String(r.paid_status||'').toLowerCase()==='paid'||String(r.commission_paid_status||'').toLowerCase()==='paid')?'':`<button type="button" class="mini-btn danger" title="${esc(L('Remove from driver sheet','إزالة من كشف المندوب'))}" aria-label="${esc(L('Remove from driver sheet','إزالة من كشف المندوب'))}" onclick="removeDeliveryJobOrder('${esc(r.shipment_id||r.id)}')">×</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }
  const count=$('deliveryJobAssignedCount'); if(count)count.textContent=`${L('Orders','عدد الأوردرات')}: ${DELIVERY_JOB_ROWS.length}`;
}
function deliveryJobStatementRows(sourceRows=null){
  // When the user selected rows in the Delivery Job table, export only those rows.
  // With no selection, preserve the existing behavior and export the full filtered list.
  const checkedIds=new Set([...document.querySelectorAll('.delivery-job-check-assigned:checked')].map(x=>String(x.value)));
  const baseRows=Array.isArray(sourceRows)?sourceRows:(checkedIds.size
    ? (DELIVERY_JOB_ROWS||[]).filter(r=>checkedIds.has(String(r.shipment_id||r.id)))
    : (DELIVERY_JOB_ROWS||[]));
  const rows=baseRows.map(r=>({
    raw:r,
    job_code:String(r.job_code||r.jop_cod||r.jopcod||'').trim(),
    tracking_number:String(r.tracking_number||'').trim(),
    order_number:String(r.merchant_order_no||r.order_code||'').trim(),
    shipper:String(r.shipper_name||r.merchant_name||r.shipper?.name||r.merchant?.name||'').trim(),
    customer:String(r.customer_name||'').trim(),
    phone1:String(r.customer_phone||'').trim(),
    phone2:String(r.customer_phone_2||'').trim(),
    emirate:String(L(r.governorate?.name_en||r.governorate_name_en||r.emirate_name_en||r.emirate||'',r.governorate?.name_ar||r.governorate_name_ar||r.emirate_name_ar||r.emirate||'')||'').trim(),
    area:deliveryJobAreaName(r),
    cod:Number(r.cod??r.price??0),
    notes:String(r.notes||r.customer_notes||r.order_notes||'').trim(),
    created_by_name:String(r.created_by_name||r.order_created_by_name||'').trim(),
    days_out:Number(calculateDaysOut(r)),
    barcode_value:String(r.tracking_number||r.merchant_order_no||r.order_code||'').trim()
  }));
  return rows.sort((a,b)=>{
    const g=a.emirate.localeCompare(b.emirate,'ar',{numeric:true,sensitivity:'base'});
    if(g)return g;
    const ar=a.area.localeCompare(b.area,'ar',{numeric:true,sensitivity:'base'});
    if(ar)return ar;
    return a.order_number.localeCompare(b.order_number,'ar',{numeric:true,sensitivity:'base'});
  });
}
async function exportDeliveryJobStatementExcel(){
  const rows=deliveryJobStatementRows();
  if(!rows.length)return alert(L('No assigned orders to export','لا توجد أوردرات للمندوب لتصدير الكشف'));
  const driver=$('jobDriver')?.selectedOptions?.[0]?.textContent?.trim()||L('Driver','المندوب');
  const date=$('jobDate')?.value||today();
  const employee=String(CURRENT_USER?.name||CURRENT_USER?.username||CURRENT_USER?.employee_code||'—');
  const totalCod=rows.reduce((sum,r)=>sum+(Number(r.cod)||0),0);
  const headers=['Job Code','Days Out','Tracking Number / Order Number','Shipper','Customer Name','Customer Phone 1 / 2','Area','Price','Remarks','Barcode'];
  if(typeof ExcelJS!=='undefined'){
    const wb=new ExcelJS.Workbook(); wb.creator='Trend Delivery'; wb.created=new Date();
    const ws=wb.addWorksheet('Driver Statement',{pageSetup:{paperSize:wsPaperA4(),orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0},views:[{state:'frozen',ySplit:6}]});
    ws.columns=[{width:8},{width:9},{width:22},{width:18},{width:20},{width:18},{width:15},{width:10},{width:26},{width:22}];
    ws.mergeCells(1,1,1,10); ws.getCell('A1').value=String(COMPANY_BRANDING?.name||'Delivery');
    ws.getCell('A1').font={name:'Arial',size:16,bold:true}; ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'}; ws.getRow(1).height=28;
    ws.mergeCells(2,1,2,10); ws.getCell('A2').value='Driver Delivery Sheet'; ws.getCell('A2').font={name:'Arial',size:13,bold:true}; ws.getCell('A2').alignment={horizontal:'center'};
    ws.mergeCells(3,1,3,5); ws.getCell('A3').value=`Driver / Run Sheet: ${driver}`;
    ws.mergeCells(3,6,3,10); ws.getCell('F3').value=`Order Created By: ${employee}`;
    ws.mergeCells(4,1,4,3); ws.getCell('A4').value=`Dated: ${date}`;
    ws.mergeCells(4,4,4,6); ws.getCell('D4').value=`Total Shipments: ${rows.length}`;
    ws.mergeCells(4,7,4,10); ws.getCell('G4').value=`Total COD: ${totalCod.toFixed(2)}`;
    for(let r=3;r<=4;r++){ws.getRow(r).font={name:'Arial',size:11,bold:true};ws.getRow(r).alignment={vertical:'middle'};ws.getRow(r).height=21;}
    ws.addRow([]); const head=ws.addRow(headers); head.height=30;
    head.eachCell(c=>{c.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'medium'},right:{style:'thin'}};});
    let lastZone='';
    for(const r of rows){
      if(r.emirate&&r.emirate!==lastZone){
        lastZone=r.emirate; const zoneRow=ws.addRow([`Emirate: ${r.emirate}`,'','','','','','','','','']);
        ws.mergeCells(zoneRow.number,1,zoneRow.number,10); zoneRow.height=20;
        zoneRow.getCell(1).font={name:'Arial',size:11,bold:true}; zoneRow.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDDE3EA'}}; zoneRow.getCell(1).alignment={horizontal:'center',vertical:'middle'};
        zoneRow.getCell(1).border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
      }
      const row=ws.addRow([r.job_code,r.days_out,`${r.tracking_number||'—'}\n${r.order_number||'—'}`,r.shipper||'—',r.customer||'—',[r.phone1,r.phone2].filter(Boolean).join('\n')||'—',r.area||r.emirate||'—',Number(r.cod)||0,r.notes||'',r.barcode_value||'']);
      row.height=34; row.eachCell(c=>{c.font={name:'Arial',size:11,bold:true};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:{style:'thin',color:{argb:'FF777777'}},left:{style:'thin',color:{argb:'FF777777'}},bottom:{style:'thin',color:{argb:'FF777777'}},right:{style:'thin',color:{argb:'FF777777'}}};});
      row.getCell(8).numFmt='#,##0.00';
    }
    const totalRow=ws.addRow(['','','','','','','Total Orders',rows.length,'Total COD',totalCod]); totalRow.height=25;
    totalRow.eachCell(c=>{c.font={name:'Arial',size:12,bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8EDF3'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:{style:'medium'},left:{style:'thin'},bottom:{style:'double'},right:{style:'thin'}};}); totalRow.getCell(10).numFmt='#,##0.00';
    ws.autoFilter={from:{row:6,column:1},to:{row:6,column:10}};
    ws.pageSetup.margins={left:0.2,right:0.2,top:0.35,bottom:0.35,header:0.15,footer:0.15};
    const safeDriver=driver.replace(/[^\w\u0600-\u06FF-]+/g,'-');
    const buf=await wb.xlsx.writeBuffer(); trendExcelDownload(buf,`delivery-job-driver-statement-${safeDriver}-${date}.xlsx`);
    return;
  }
  if(typeof XLSX==='undefined')return alert(L('Excel library did not load','مكتبة Excel لم تعمل'));
  const data=[[String(COMPANY_BRANDING?.name||'Delivery')],[L('Driver Delivery Sheet','كشف المندوب')],[`Driver / Run Sheet: ${driver}`,`Order Created By: ${employee}`],[`Dated: ${date}`,`Total Shipments: ${rows.length}`,`Total COD: ${totalCod.toFixed(2)}`],[],headers];
  let lastExcelZone='';
  for(const r of rows){if(r.emirate&&r.emirate!==lastExcelZone){lastExcelZone=r.emirate;data.push([`Emirate: ${r.emirate}`,'','','','','','','','','']);}data.push([r.job_code,r.days_out,`${r.tracking_number||'—'}\n${r.order_number||'—'}`,r.shipper,r.customer,[r.phone1,r.phone2].filter(Boolean).join('\n'),r.area||r.emirate,r.cod,r.notes,r.barcode_value]);}
  data.push(['','','','','','','Total Orders',rows.length,'Total COD',totalCod]);
  const ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=[{wch:8},{wch:9},{wch:22},{wch:18},{wch:20},{wch:18},{wch:15},{wch:10},{wch:26},{wch:22}];ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:4}},{s:{r:2,c:5},e:{r:2,c:9}}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Driver Statement');XLSX.writeFile(wb,`delivery-job-driver-statement-${driver.replace(/[^\w\u0600-\u06FF-]+/g,'-')}-${date}.xlsx`);
}
function wsPaperA4(){return 9;}

function exportDeliveryJobStatementPDF(){
  const selectedCount=document.querySelectorAll('.delivery-job-check-assigned:checked').length;
  const rows=deliveryJobStatementRows();
  if(!rows.length)return alert(L('No assigned orders to export','لا توجد أوردرات للمندوب لتصدير الكشف'));
  const driver=$('jobDriver')?.selectedOptions?.[0]?.textContent?.trim()||L('Driver','المندوب');
  const date=$('jobDate')?.value||today();
  printDeliveryJobDriverStatementPDF(rows,driver,date);
}
function openPdfPreviewModal(html,title='PDF Preview'){
  let modal=document.getElementById('systemPdfPreviewModal');
  if(modal)modal.remove();
  modal=document.createElement('div');modal.id='systemPdfPreviewModal';modal.className='system-pdf-preview-backdrop';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',title);
  modal.innerHTML=`<section class="system-pdf-preview-dialog"><header class="system-pdf-preview-toolbar"><strong>${esc(title)}</strong><div><button type="button" class="ghost" data-pdf-print>طباعة / حفظ PDF</button><button type="button" class="danger" data-pdf-close aria-label="إغلاق">إغلاق ×</button></div></header><iframe title="${esc(title)}" class="system-pdf-preview-frame"></iframe></section>`;
  const frame=modal.querySelector('iframe');frame.srcdoc=html;
  const close=()=>{modal.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();};
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  modal.querySelector('[data-pdf-close]').addEventListener('click',close);
  modal.querySelector('[data-pdf-print]').addEventListener('click',()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){alert('تعذرت الطباعة من المعاينة. حاول مرة أخرى.');}});
  document.addEventListener('keydown',onKey);document.body.appendChild(modal);
  return modal;
}
function printDeliveryJobDriverStatementPDF(rows,driver,date){
  
  const dir=LANG==='ar'?'rtl':'ltr';
  const totalCod=rows.reduce((s,r)=>s+(Number(r.cod)||0),0);
  const mobile=(()=>{const d=DELIVERY_JOB_DRIVERS.find(x=>String(x.id)===String($('jobDriver')?.value||''));return d?.mobile||d?.phone||d?.phone_number||''})();
  const printedBy=String(CURRENT_USER?.name||CURRENT_USER?.username||CURRENT_USER?.employee_code||'—');
  const zones=[...new Set(rows.map(r=>r.emirate).filter(Boolean))];
  const blocks=[]; let currentZone=null;
  for(const r of rows){
    const zone=r.emirate||'—';
    if(zone!==currentZone){currentZone=zone;blocks.push(`<tr class="zone-row"><td colspan="10">Emirate: ${esc(zone)}</td></tr>`);}
    const barcodeSvg=code39BarcodeSVG(r.barcode_value||r.order_number||r.tracking_number||'');
    blocks.push(`<tr class="order-row">
      <td class="job-code">${esc(r.job_code||'—')}</td>
      <td class="days-out">${esc(Number.isFinite(Number(r.days_out))?Number(r.days_out):'—')}</td>
      <td class="track-cell"><div>${esc(r.tracking_number||'—')}</div><div>${esc(r.order_number||'—')}</div></td>
      <td class="shipper">${esc(r.shipper||'—')}</td>
      <td class="customer">${esc(r.customer||'—')}</td>
      <td class="phone">${esc(r.phone1||'—')}${r.phone2?`<br>${esc(r.phone2)}`:''}</td>
      <td class="area">${esc(r.area||r.emirate||'—')}</td>
      <td class="cod">${(Number(r.cod)||0).toFixed(2)}</td>
      <td class="notes">${esc(r.notes||'')}</td>
      <td class="barcode-cell"><div class="barcode-box">${barcodeSvg}</div></td>
    </tr>`);
  }
  const html=`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(L('Driver Delivery Sheet','كشف المندوب'))}</title><style>
  *{box-sizing:border-box} @page{size:A4 landscape;margin:5mm} body{width:287mm;min-height:200mm;margin:16px auto;padding:4mm;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:Arial,Tahoma,sans-serif;color:#000;direction:${dir};font-size:9px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:geometricPrecision}
  .head{padding:4px 5px 6px;margin-bottom:5px;border-bottom:1.5px solid #111}.brand{font-size:15px;font-weight:900;text-align:center}.sub{font-size:11px;font-weight:800;text-align:center;margin:2px 0 5px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:10px;font-weight:700}.meta div{padding:2px 3px}.meta b{font-weight:900}.meta .driver-name{font-size:12px;font-weight:900}.meta .driver-name strong{font-size:13px;font-weight:900;text-decoration:underline;text-underline-offset:2px}.meta .wide{grid-column:1/-1}.zone-row td{border:1.2px solid #222;background:#dedede;font-weight:900;text-align:center;font-size:11px;padding:3px}
  /* Delivery Job print layout: compact columns; Days Out remains explicit. */
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #222;text-align:center;vertical-align:middle;overflow:hidden;overflow-wrap:anywhere}th{background:#e8e8e8;font-size:8px;line-height:1.12;font-weight:900;padding:3px 2px}.order-row td{padding:2px;line-height:1.15;height:10mm;font-size:9.5px;font-weight:900}.job-code{width:3%;font-weight:900;font-size:7px!important;white-space:nowrap;overflow:hidden;overflow-wrap:normal}.days-out{width:4%;font-weight:900;font-size:8px!important;white-space:nowrap}.track-cell{width:14%;font-weight:900}.shipper{width:10%;font-weight:900}.customer{width:11%;font-weight:900}.phone{width:11%;font-weight:900;font-variant-numeric:tabular-nums}.area{width:10%;font-weight:900}.cod{width:4.5%;white-space:nowrap;font-weight:900;font-size:8px!important;font-variant-numeric:tabular-nums}.notes{width:16%;font-weight:800}.barcode-cell{width:15%;padding:1px!important}.barcode-box{width:100%;height:7mm;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}.barcode-box svg{display:block;width:100%;height:6mm;max-height:6mm;overflow:hidden}.totals{border:1.5px solid #222;margin-top:5px;padding:4px;display:flex;justify-content:space-between;font-weight:900;font-size:10px}.footer-note{font-size:7px;font-weight:700;margin-top:3px}
  @media screen{body{overflow-x:auto}} @media print{body{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;background:#fff}button{display:none!important}}
  </style></head><body><div class="head"><div class="brand" style="display:flex;align-items:center;justify-content:center;gap:8px"><img src="${esc(COMPANY_BRANDING.logo_url||'/trend-logo.jpeg')}" alt="" style="width:48px;height:28px;object-fit:contain"><span>${esc(COMPANY_BRANDING.name||'Delivery')}</span></div><div class="sub">${esc(L('Driver Delivery Sheet','كشف المندوب'))}</div><div class="meta"><div class="driver-name"><b>Driver / Run Sheet:</b> <strong>${esc(driver)}</strong></div><div><b>Driver Mobile:</b> ${esc(mobile||'—')}</div><div class="driver-name"><b>Order Created By:</b> <strong>${esc(printedBy)}</strong></div><div><b>Total Shipments:</b> ${rows.length}</div><div><b>Dated:</b> ${esc(date)}</div><div class="wide"><b>Emirates:</b> ${esc(zones.join(', ')||'—')}</div></div></div>
  <table><thead><tr><th>Job<br>Code</th><th>Days<br>Out</th><th>Tracking Number<br>&amp; Order Number</th><th>Shipper</th><th>Customer Name</th><th>Customer Phone<br>1 / 2</th><th>Area</th><th>Price</th><th>Remarks</th><th>Barcode</th></tr></thead><tbody>${blocks.join('')}</tbody></table>
  <div class="totals"><span>${esc(L('Total Orders','إجمالي الأوردرات'))}: ${rows.length}</span><span>Total COD: ${totalCod.toFixed(2)}</span></div><div class="footer-note">Barcode value: Tracking Number; if unavailable, Order Number.</div></body></html>`;
  openPdfPreviewModal(html,L('Driver Delivery Sheet','كشف المندوب'));
}
function renderDeliveryJobAvailable(){ return; }
function toggleDeliveryJobSelectAll(type,el=null){const cls=type==='assigned'?'.delivery-job-check-assigned':'.delivery-job-check-available';const all=el?el.checked:true;document.querySelectorAll(cls).forEach(x=>x.checked=all);const master=document.getElementById(type==='assigned'?'deliveryJobAssignedAll':'deliveryJobAvailableAll');if(master&&el!==master)master.checked=all;}
function selectedDeliveryJobIds(type='assigned'){return [...document.querySelectorAll(type==='assigned'?'.delivery-job-check-assigned':'.delivery-job-check-available:checked')].map(x=>x.value).filter(Boolean);}
function selectedDeliveryJobAssigned(){return [...document.querySelectorAll('.delivery-job-check-assigned:checked')].map(x=>x.value).filter(Boolean);}
function selectedDeliveryJobAvailable(){return [...document.querySelectorAll('.delivery-job-check-available:checked')].map(x=>x.value).filter(Boolean);}
async function createDeliveryJobFromSelection(){
  const ids=selectedDeliveryJobAvailable(); if(!ids.length)return alert(L('Select at least one order first','حدد أوردر واحد على الأقل أولاً')); if(!$('jobDriver')?.value)return alert(L('Select driver first','اختر المندوب أولاً'));
  try{const d=await api('/api/delivery-jobs',{method:'POST',body:JSON.stringify({driver_id:$('jobDriver').value,job_date:$('jobDate').value,shipment_ids:ids})});msg('jobMsg',`${L('Delivery Job created','تم إنشاء مهمة التوصيل')} — ${esc(d.data?.job_code||'')}`,'ok');await loadDeliveryJobBoard();}catch(e){msg('jobMsg',e.message,'error');}
}
async function removeDeliveryJobOrder(shipmentId){
  const row=(DELIVERY_JOB_ROWS||[]).find(x=>String(x.shipment_id||x.id)===String(shipmentId));
  const st=String(row?.status||row?.current_status||'').trim().toLowerCase();
  const paid=st==='paid'||String(row?.cash_collection_status||row?.paid_status||'').toLowerCase()==='paid'||String(row?.commission_paid_status||'').toLowerCase()==='paid';
  if(paid){dashboardActionNotice(L('Order status is Paid. It cannot be removed from the driver statement.','حالة الأوردر Paid، لا يمكن إزالته من كشف المندوب.'),'error');return;}
  if(!await showConfirmModal(L('Remove this order from the driver? It will return to In Ops.','إزالة الأوردر من المندوب وإرجاعه إلى In Ops؟')))return;
  try{await api('/api/delivery-jobs/remove-order',{method:'POST',body:JSON.stringify({shipment_id:shipmentId})});await loadDeliveryJobBoard();}
  catch(e){dashboardActionNotice(e.message||L('Could not remove the order.','تعذر إزالة الأوردر.'),'error');}
}
function openDeliveryJobActions(){
  const ids=selectedDeliveryJobAssigned(); if(!ids.length)return alert(L('Select at least one assigned order first','حدد أوردر واحد على الأقل من أوردرات المندوب'));
  let old=document.getElementById('deliveryJobActionsDialog'); if(old)old.remove();
  const d=document.createElement('div');d.id='deliveryJobActionsDialog';d.className='dashboard-action-modal';
  d.innerHTML=`<div class="dashboard-action-modal-card delivery-job-actions-card"><h3>${L('Actions','الإجراءات')}</h3><button type="button" class="ghost" onclick="openDeliveryJobTransfer()">↔ ${L('Transfer to another driver','نقل لمندوب آخر Transfer')}</button><button type="button" class="ghost" onclick="openDeliveryJobStatusPicker()">● ${L('Change status','تغيير الحالة')}</button><button type="button" class="ghost" onclick="document.getElementById('deliveryJobActionsDialog').remove()">${L('Cancel','إلغاء')}</button></div>`;
  document.body.appendChild(d);
}
async function openDeliveryJobTransfer(){
  document.getElementById('deliveryJobActionsDialog')?.remove(); const ids=selectedDeliveryJobAssigned();
  const d=await api('/api/drivers'); const drivers=d.data||[]; const current=$('jobDriver')?.value||'';
  const m=document.createElement('div');m.id='deliveryJobTransferDialog';m.className='dashboard-action-modal';m.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Transfer orders','نقل الأوردرات')}</h3><p class="muted">${L('Move the selected orders from the current driver to another driver.','نقل الأوردرات المحددة من المندوب الحالي إلى مندوب آخر.')}</p><label>${L('New driver','المندوب الجديد')}<select id="deliveryTransferDriver"><option value="">${L('Select driver','اختر المندوب')}</option>${drivers.filter(x=>String(x.id)!==String(current)).map(x=>`<option value="${esc(x.id)}">${esc(x.name||'')} — ${esc(x.driver_no||'')}</option>`).join('')}</select></label><div class="actions"><button class="ghost" onclick="document.getElementById('deliveryJobTransferDialog').remove()">${L('Cancel','إلغاء')}</button><button onclick="confirmDeliveryJobTransfer()">${L('Transfer','نقل')}</button></div></div>`;document.body.appendChild(m);
}
async function confirmDeliveryJobTransfer(){const ids=selectedDeliveryJobAssigned(),to=$('deliveryTransferDriver')?.value;if(!to)return alert(L('Select the new driver','اختر المندوب الجديد'));try{await api('/api/delivery-jobs/transfer-orders',{method:'POST',body:JSON.stringify({shipment_ids:ids,to_driver_id:to,date:$('jobDate').value||today()})});document.getElementById('deliveryJobTransferDialog')?.remove();await loadDeliveryJobBoard();}catch(e){alert(e.message);}}
async function openSingleDeliveryJobStatus(shipmentId){
  const row=DELIVERY_JOB_ROWS.find(x=>String(x.shipment_id||x.id)===String(shipmentId));
  if(!row)return alert(L('Order not found. Refresh the page.','الأوردر غير موجود. حدّث الصفحة.'));
  const statuses=allSystemStatuses();
  const m=document.createElement('div');m.id='deliveryJobSingleStatusDialog';m.className='dashboard-action-modal';
  m.innerHTML=`<div class="dashboard-action-modal-card delivery-job-status-card"><h3>${L('Correct order status','تصحيح حالة الأوردر')}</h3><p>${L('Current status','الحالة الحالية')}: <b>${esc(row.status||'—')}</b></p><p class="muted">${L('You can correct a mistaken status until the order is Paid.','يمكن تصحيح الحالة الخاطئة قبل اعتماد الأوردر Paid.')}</p><div class="delivery-job-status-grid">${statuses.map(st=>`<button type="button" class="ghost" onclick="applySingleDeliveryJobStatus('${esc(shipmentId)}','${encodeURIComponent(st)}')">${esc(st)}</button>`).join('')}</div><button class="ghost" onclick="document.getElementById('deliveryJobSingleStatusDialog').remove()">${L('Cancel','إلغاء')}</button></div>`;
  document.body.appendChild(m);
}
function openDeliveryJobReturnDateDialog(ids,singleShipmentId=null){
  if(!ids?.length)return dashboardActionNotice(L('Select at least one assigned order first','حدد أوردر واحد على الأقل من أوردرات المندوب'),'error');
  document.getElementById('deliveryJobReturnDateDialog')?.remove();
  window.__deliveryJobReturnDatePending={ids:[...ids],singleShipmentId};
  const m=document.createElement('div');m.id='deliveryJobReturnDateDialog';m.className='dashboard-action-modal';
  m.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Return by Driver','إرجاع بواسطة السائق')}</h3><p class="muted">${L('Choose the date for this return. The default is today.','حدد تاريخ الإرجاع. التاريخ الافتراضي هو اليوم.')}</p><label>${L('Return Date','تاريخ الإرجاع')}<input id="deliveryJobReturnDate" type="date" value="${today()}" required></label><div class="actions"><button type="button" class="ghost" onclick="document.getElementById('deliveryJobReturnDateDialog')?.remove();window.__deliveryJobReturnDatePending=null">${L('Cancel','إلغاء')}</button><button type="button" onclick="confirmDeliveryJobReturnByDriverDate()">${L('Save','حفظ')}</button></div></div>`;
  document.body.appendChild(m);
}
async function confirmDeliveryJobReturnByDriverDate(){
  const pending=window.__deliveryJobReturnDatePending,date=$('deliveryJobReturnDate')?.value;
  if(!pending?.ids?.length)return;
  if(!date)return dashboardActionNotice(L('Select a return date','حدد تاريخ الإرجاع'),'error');
  try{
    const results=await Promise.all(pending.ids.map(id=>setStatus(id,'Return by Driver',{date,preserve_delivery_job_date:true})));
    if(results.some(r=>!r?.success))throw new Error(L('One or more statuses were not saved.','لم يتم حفظ حالة أوردر واحد أو أكثر.'));
    document.getElementById('deliveryJobReturnDateDialog')?.remove();
    document.getElementById('deliveryJobSingleStatusDialog')?.remove();
    window.__deliveryJobReturnDatePending=null;
    await loadDeliveryJobBoard();
    dashboardActionNotice(L(`Return by Driver saved for ${date}.`,`تم حفظ حالة Return by Driver بتاريخ ${date}.`),'success');
  }catch(e){dashboardActionNotice(e.message||L('Status update failed','فشل تحديث الحالة'),'error');await loadDeliveryJobBoard().catch(()=>{});}
}
async function applySingleDeliveryJobStatus(shipmentId,encodedStatus){
  const status=decodeURIComponent(encodedStatus);
  if(status==='Return by Driver'){openDeliveryJobReturnDateDialog([shipmentId],shipmentId);return;}
  if(!await showConfirmModal(L(`Change status to ${status}?`,`تأكيد تغيير الحالة إلى ${status}؟`)))return;
  try{
    const statusMeta={};
    const result=await setStatus(shipmentId,status,statusMeta);
    if(!result?.success)throw new Error(result?.error||L('Status update failed','فشل تحديث الحالة'));
    document.getElementById('deliveryJobSingleStatusDialog')?.remove();
    await loadDeliveryJobBoard();
    dashboardActionNotice(L(`Status changed to ${status}.`,`تم تغيير الحالة إلى ${status} بنجاح.`),'success');
  }catch(e){dashboardActionNotice(e.message||L('Status correction failed','فشل تصحيح الحالة'),'error');}
}
async function openDeliveryJobStatusPicker(){
  document.getElementById('deliveryJobActionsDialog')?.remove(); const ids=selectedDeliveryJobAssigned();
  const driverNames=[...new Set((await api('/api/drivers').catch(()=>({data:[]}))).data?.map(x=>x.name||x.driver_no).filter(Boolean)||[])];
  const statuses=allSystemStatuses(driverNames.map(n=>`Scan by ${n}`));
  const m=document.createElement('div');m.id='deliveryJobStatusDialog';m.className='dashboard-action-modal';m.innerHTML=`<div class="dashboard-action-modal-card delivery-job-status-card"><h3>${L('Change status','تغيير الحالة')}</h3><div class="delivery-job-status-grid">${statuses.map(st=>`<button type="button" class="ghost" onclick="chooseDeliveryJobStatus('${encodeURIComponent(st)}')">${esc(st)}</button>`).join('')}</div><button class="ghost" onclick="document.getElementById('deliveryJobStatusDialog').remove()">${L('Cancel','إلغاء')}</button></div>`;document.body.appendChild(m);
}
async function chooseDeliveryJobStatus(encoded){
  const status=decodeURIComponent(encoded),ids=selectedDeliveryJobAssigned(); document.getElementById('deliveryJobStatusDialog')?.remove();
  let meta={};
  if(status==='Return by Driver'){openDeliveryJobReturnDateDialog(ids);return;}
  if(status==='Future Delivery'){ 
    const minDate=daysFromToday(2);
    const old=document.createElement('div');old.id='futureDeliveryDialog';old.className='dashboard-action-modal';
    old.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Future Delivery','تسليم مستقبلي')}</h3><p class="muted">${L('Choose a date after tomorrow.','اختر تاريخًا بعد غد.')}</p><label>${L('Delivery Date','تاريخ التسليم')}<input id="futureDeliveryDate" type="date" min="${minDate}" value="${minDate}"></label><div class="actions"><button class="ghost" onclick="document.getElementById('futureDeliveryDialog').remove()">${L('Cancel','إلغاء')}</button><button onclick="confirmFutureDelivery()">${L('Save','حفظ')}</button></div></div>`;
    document.body.appendChild(old);window.__futureDeliveryPending={ids};return;
  }
  if(status==='Location Change'){
    const g=await api('/api/governorates'),a=await api('/api/areas');const govs=g.data||[],areas=a.data||[];
    const old=document.createElement('div');old.id='deliveryLocationDialog';old.className='dashboard-action-modal';old.innerHTML=`<div class="dashboard-action-modal-card"><h3>${L('Location Change','تغيير الموقع')}</h3><label>${L('Emirate','الإمارة')}<select id="djLocGov"><option value="">${L('Select Emirate','اختر الإمارة')}</option>${govs.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('')}</select></label><label>${L('Area','المنطقة')}<select id="djLocArea" disabled><option value="">${L('Select Area','اختر المنطقة')}</option></select></label><label>${L('Delivery Date','تاريخ التسليم')}<input id="djLocDate" type="date" value="${$('jobDate')?.value||today()}"></label><div class="actions"><button class="ghost" onclick="document.getElementById('deliveryLocationDialog').remove()">${L('Cancel','إلغاء')}</button><button onclick="confirmDeliveryJobLocationChange()">${L('Save','حفظ')}</button></div></div>`;document.body.appendChild(old);const gv=$('djLocGov'),ar=$('djLocArea');gv.onchange=()=>{const opts=areas.filter(x=>String(x.governorate_id)===String(gv.value));ar.disabled=!gv.value;ar.innerHTML=`<option value="">${L('Select Area','اختر المنطقة')}</option>`+opts.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('');};window.__deliveryJobPendingLocation={ids};return;
  }
  try{
    const results=await Promise.all(ids.map(id=>setStatus(id,status,meta)));
    if(results.some(r=>!r?.success))throw new Error(L('One or more statuses were not saved.','لم يتم حفظ حالة أوردر واحد أو أكثر.'));
    await loadDeliveryJobBoard();
    dashboardActionNotice(L(`Status changed to ${status} for ${ids.length} order(s).`,`تم تغيير الحالة إلى ${status} لعدد ${ids.length} أوردر.`),'success');
  }catch(e){dashboardActionNotice(e.message||L('Status update failed','فشل تحديث الحالة'),'error');await loadDeliveryJobBoard().catch(()=>{});}
}
async function confirmFutureDelivery(){const ids=window.__futureDeliveryPending?.ids||[],date=$('futureDeliveryDate')?.value;if(!date)return alert(L('Select a future date','اختر تاريخًا مستقبليًا'));const minDate=daysFromToday(2);if(date<minDate)return alert(L('Future Delivery must be after tomorrow','يجب أن يكون Future Delivery بعد غد أو أبعد'));try{await Promise.all(ids.map(id=>setStatus(id,'Future Delivery',{date})));document.getElementById('futureDeliveryDialog')?.remove();window.__futureDeliveryPending=null;await loadDeliveryJobBoard();}catch(e){alert(e.message);}}
async function confirmDeliveryJobLocationChange(){const ids=window.__deliveryJobPendingLocation?.ids||[],gov=$('djLocGov')?.value,area=$('djLocArea')?.value,date=$('djLocDate')?.value;if(!gov||!area)return alert(L('Select Emirate and Area','اختر الإمارة والمنطقة'));try{await Promise.all(ids.map(id=>setStatus(id,'Location Change',{emirate_id:gov,area_id:area,date})));document.getElementById('deliveryLocationDialog')?.remove();window.__deliveryJobPendingLocation=null;await loadDeliveryJobBoard();}catch(e){alert(e.message);}}

async function saveJobCode(){try{const d=await api("/api/delivery-job-code",{method:"POST",body:JSON.stringify({shipment_no:$("jcShipment").value.trim(),serial_no:Number($("jcSerial").value),delivery_job_code:$("jcJob").value.trim()})});msg("jcMsg",d.duplicate?L("Duplicate","⚠ مكرر"):L("Saved","تم الحفظ"),d.duplicate?"duplicate":"ok");}catch(e){msg("jcMsg",e.message,"error");}}
async function returnsPage(c){
  c.innerHTML=`<div class="panel returns-page-panel">
    <div class="section-title-row">
      <div><h2>${L("Returns","المرتجعات")}</h2></div>
      <div class="actions returns-filter-bar">
        <label>${L("From Date","من تاريخ")}<input id="retFrom" type="date" value="${daysAgo(7)}" onchange="loadReturnsPage()"></label>
        <label>${L("To Date","إلى تاريخ")}<input id="retTo" type="date" value="${today()}" onchange="loadReturnsPage()"></label>
        <label>${L("Status","الحالة")}<select id="retStatus"><option value="all">${L("All","الكل")}</option><option>Cancelled</option><option>Cancelled by Receiver</option><option>Cancelled by Shipper</option><option>Half Delivered</option><option>Replaced</option><option>Return to Origin</option><option>Return Completed</option></select></label>
        <input id="retSearch" placeholder="${L("Search tracking / order / customer / Return to Origin operation no.","بحث بالتتبع / الأوردر / العميل / رقم عملية إرجاع التاجر")}" oninput="filterReturnsTable()">
        <button onclick="loadReturnsPage()">${L("Filter","بحث")}</button>
      </div>
    </div>
    <div class="returns-summary" id="returnsSummary"></div>
    <div id="returnsTable" class="table-wrap">${L("Loading...","جارٍ التحميل...")}</div>
  </div>`;
  await loadReturnsPage();
}
async function loadReturnsPage(){try{const d=await api(`/api/returns?from=${encodeURIComponent($("retFrom")?.value||"")}&to=${encodeURIComponent($("retTo")?.value||"")}`);window.__returnsRows=d.data||[];renderReturnsTable(window.__returnsRows);}catch(e){$("returnsTable").innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}}
function filterReturnsTable(){renderReturnsTable(window.__returnsRows||[]);}
function normalizeReturnsStatus(value){const raw=String(value||"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");const aliases={"canceled":"Cancelled","cancelled":"Cancelled","canceled by shipper":"Cancelled by Shipper","cancelled by shipper":"Cancelled by Shipper","canceled by receiver":"Cancelled by Receiver","cancelled by receiver":"Cancelled by Receiver","half delivered":"Half Delivered","replaced":"Replaced","return to origin":"Return to Origin","return completed":"Return Completed"};return aliases[raw]||String(value||"").trim();}
function renderReturnsTable(rows){
  const box=$("returnsTable");if(!box)return;
  const q=String($("retSearch")?.value||"").trim().toLowerCase(); const st=$("retStatus")?.value||"all";
  // Defensive client-side filtering keeps Return to Origin out of active returns even if a stale API row slips through.
  const filtered=rows.filter(r=>{const status=normalizeReturnsStatus(r.return_status||r.status||"");const linked=[r.return_status,r.status,r.order_status,r.shipment_status].map(normalizeReturnsStatus);if(linked.includes('Return to Origin'))return false;const text=[r.tracking_number,r.order_number,r.customer_name,r.shipper_name,r.driver_name,r.return_operation_no,r.return_transaction_no,r.return_operation_number].join(" ").toLowerCase();return (st==='all'||status===normalizeReturnsStatus(st))&&(!q||text.includes(q));});
  const eligible=new Set(['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Half Delivered']);
  const counts={total:rows.length,pending:rows.filter(r=>r.return_status!=="Return Completed").length,completed:rows.filter(r=>r.return_status==="Return Completed").length};
  const sum=$("returnsSummary"); if(sum)sum.innerHTML=`<div class="returns-summary-card"><b>${counts.total}</b><span>${L("Total Returns","إجمالي المرتجعات")}</span><small>${L("Completed","تم الإرجاع")}: ${counts.completed}</small></div><div class="returns-summary-card"><b>${counts.pending}</b><span>${L("Pending","قيد التنفيذ")}</span><small>${L("Needs action","تحتاج إجراء")}</small></div>`;
  const selectedCount=(window.__selectedReturnIds||new Set()).size;
  const toolbar=`<div class="returns-bulk-toolbar">
    <label class="select-all-returns"><input type="checkbox" id="returnsSelectAll" onchange="toggleAllReturns(this.checked)"> ${L("Select All","تحديد الكل")}</label>
    <button type="button" class="mini-btn" onclick="toggleAllReturns(true)">${L("Select","تحديد")}</button>
    <button type="button" class="mini-btn" onclick="clearReturnSelection()">${L("Clear","إلغاء التحديد")}</button>
    <button type="button" class="primary" onclick="openReturnsBulkActions()">⋮ ${L("Actions","إجراءات")} ${selectedCount?`(${selectedCount})`:''}</button>
  </div>`;
  box.innerHTML=toolbar+(filtered.length?`<div class="table-wrap operations-table-wrap returns-operations-wrap"><table class="compact-table returns-main-table operations-dashboard-table returns-operations-table"><thead><tr>
    <th class="ops-select-col"></th><th>Tracking No.</th><th>${L("Order / Shipment","الأوردر / الشحنة")}</th><th>${L("Shipper","الشاحن")}</th><th>${L("Customer","العميل")}</th><th>${L("Phone","الهاتف")}</th><th>COD</th><th>${L("Original Status","الحالة الأصلية")}</th><th>${L("Return Status","حالة المرتجع")}</th><th>${L("Driver","السائق")}</th><th>${L("Return Date","تاريخ المرتجع")}</th><th>${L("Proof","الإثبات")}</th><th>${L("Actions","الإجراءات")}</th>
  </tr></thead><tbody>${filtered.map(r=>{const checked=window.__selectedReturnIds?.has(String(r.id)); const can=eligible.has(normalizeReturnsStatus(r.return_status||r.status||'')); return `<tr>
    <td class="ops-select-col"><input type="checkbox" class="ops-row-check return-row-check" data-return-id="${esc(r.id)}" ${checked?'checked':''} onchange="toggleReturnSelection('${esc(r.id)}',this.checked)" ${can?'':'disabled'}></td>
    <td><b>${esc(r.tracking_number||"")}</b></td><td><div class="return-order-ref-box"><b>${esc(r.order_number||"—")}</b><small>${esc(r.shipment_no||r.tracking_number||"—")}</small></div></td><td>${esc(r.shipper_name||"")}</td><td>${esc(r.customer_name||"")}</td><td>${esc(r.customer_phone||"—")}</td><td>${money(r.cod||0)}</td><td>${esc(r.original_status||"—")}</td><td><span class="badge">${esc(r.return_status||r.status||"")}</span></td><td>${esc(r.driver_name||"—")}</td><td>${esc(String(r.return_date||r.created_at||"").slice(0,10))}</td><td>${r.proof_id?('<a class="proof-link" target="_blank" rel="noopener" href="/api/returns/'+encodeURIComponent(r.id)+'/proof">✓ '+L("View","عرض")+'</a>'):'<span class="muted">—</span>'}</td>
    <td><div class="actions return-row-actions"><button class="mini-btn" type="button" onclick="printReturnOrderPDF(\'${esc(r.id)}\')">PDF</button><button class="mini-btn" onclick="showReturnTimeline(\'${esc(r.id)}\')">${L("Timeline","الخط الزمني")}</button><button class="mini-btn" onclick="openReturnActions(\'${esc(r.id)}\')">⋮ ${L("Actions","إجراءات")}</button></div></td>
  </tr>`}).join("")}</tbody></table></div>`:`<p class="muted">${L("No return orders found","لا توجد مرتجعات مطابقة للبحث")}</p>`);
  const allVisible=filtered.filter(r=>eligible.has(String(r.return_status||r.status||'')));
  const allSelected=allVisible.length>0 && allVisible.every(r=>window.__selectedReturnIds?.has(String(r.id)));
  if($("returnsSelectAll"))$("returnsSelectAll").checked=allSelected;
}
function ensureReturnSelection(){if(!(window.__selectedReturnIds instanceof Set))window.__selectedReturnIds=new Set();return window.__selectedReturnIds;}
function toggleReturnSelection(id,checked){const s=ensureReturnSelection();checked?s.add(String(id)):s.delete(String(id));renderReturnsTable(window.__returnsRows||[]);}
function toggleAllReturns(checked){const s=ensureReturnSelection();const q=String($("retSearch")?.value||"").trim().toLowerCase();const st=$("retStatus")?.value||"all";const eligible=new Set(['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Half Delivered']);const visible=(window.__returnsRows||[]).filter(r=>{const status=normalizeReturnsStatus(r.return_status||r.status||"");const linked=[r.return_status,r.status,r.order_status,r.shipment_status].map(normalizeReturnsStatus);const text=[r.tracking_number,r.order_number,r.customer_name,r.shipper_name,r.driver_name,r.return_operation_no,r.return_transaction_no,r.return_operation_number].join(" ").toLowerCase();return !linked.includes('Return to Origin')&&(st==='all'||status===normalizeReturnsStatus(st))&&(!q||text.includes(q))&&eligible.has(status);});visible.forEach(r=>checked?s.add(String(r.id)):s.delete(String(r.id)));renderReturnsTable(window.__returnsRows||[]);}
function clearReturnSelection(){ensureReturnSelection().clear();renderReturnsTable(window.__returnsRows||[]);}
async function openReturnsBulkActions(){const ids=[...ensureReturnSelection()];if(!ids.length)return alert(L('Select at least one eligible return order','حدد أوردر مرتجع واحد على الأقل من الحالات المسموح بها'));const dr=await api('/api/drivers').catch(()=>({data:[]}));const drivers=dr.data||[];const box=document.createElement('div');box.id='returnsBulkActionsDialog';box.className='modal-backdrop';box.innerHTML=`<div class="modal"><div class="section-title-row"><h3>${L('Returns Actions','إجراءات المرتجعات')}</h3><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><p>${L('Return the selected orders to origin. Their status will update immediately, they will leave Returns, and a combined PDF will open automatically.','إرجاع الأوردرات المحددة إلى المصدر. ستتغير حالتها فورًا وتختفي من صفحة المرتجعات، وسيُفتح PDF مجمع تلقائيًا.')}</p><label>${L('Driver','المندوب')}<select id="bulkRtoDriver"><option value="">${L('Select Driver','اختر المندوب')}</option>${drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name||'')} — ${esc(d.driver_no||'')}</option>`).join('')}</select></label><button class="primary" id="returnsConfirmArchive" onclick="confirmReturnsReturnToOrigin()">↩ 🖨 ${L('Return to Origin & Print PDF','Return to Origin وطباعة PDF')}</button></div>`;document.body.appendChild(box);}
async function printSelectedReturnsBeforeArchive(){return confirmReturnsReturnToOrigin();}
async function confirmReturnsReturnToOrigin(){const ids=[...ensureReturnSelection()];const driver=$("bulkRtoDriver")?.value;if(!ids.length)return;if(!driver)return alert(L('Select Driver first','اختر المندوب أولاً'));const rows=(window.__returnsRows||[]).filter(r=>ids.includes(String(r.id)));if(!rows.length)return alert(L('Selected return orders could not be loaded','تعذر تحميل الأوردرات المحددة'));return processReturnsToOrigin(ids,driver,rows);}
async function processReturnsToOrigin(ids,driver,rows,dialogId='returnsBulkActionsDialog'){
  // Open the print window synchronously from the user click to avoid popup blockers.
  const printWindow=window.open('','_blank');
  try{
    if(printWindow){printWindow.document.open();printWindow.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px">Preparing Return to Origin PDF…</body></html>');printWindow.document.close();}
    const result=await api('/api/returns/bulk-return-to-origin',{method:'POST',body:JSON.stringify({return_ids:ids,driver_id:driver})});
    const selectedDriver=((document.getElementById('bulkRtoDriver')?.selectedOptions||[])[0]?.textContent||'').trim();
    if(printWindow)printReturnMerchantPDF(rows,{...(result.data?.operation||{}),operations:result.data?.operations||[],driver_name:selectedDriver||result.data?.operation?.driver_name||''},printWindow);
    ensureReturnSelection().clear();window.__returnsPdfPrepared=false;document.getElementById(dialogId)?.remove();await loadReturnsPage();
    if(!printWindow)alert(L('The status was updated and the order moved to the archive, but the browser blocked the PDF window. Allow popups and print the PDF from Returns Archive.','تم تحديث الحالة ونقل الأوردر للأرشيف، لكن المتصفح منع نافذة PDF. اسمح بالنوافذ المنبثقة واطبع PDF من الأرشيف.'));
  }catch(e){try{printWindow?.close();}catch(_){}alert(e.message);}
}
function returnPrintWindow(title,body,targetWindow){const w=targetWindow||window.open('','_blank');if(!w)return alert(L('Allow popups to print/save PDF','اسمح بالنوافذ المنبثقة للطباعة وحفظ PDF'));w.document.open();w.document.write(`<!doctype html><html dir="${LANG==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html{background:#e9edf3}body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:18px auto;font-size:9px;width:210mm;min-height:297mm;padding:10mm;background:#fff;box-shadow:0 3px 18px #0002}.merchant-page{page-break-after:always}.merchant-page:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:6px;margin-bottom:7px}.brand{display:flex;gap:7px;align-items:center}.brand img{width:58px;height:30px;object-fit:contain}.title{font-size:16px;font-weight:700}.meta{font-size:9px;color:#555}.op{font-size:11px;font-weight:700;text-align:left;direction:ltr}.barcode{margin-top:3px;width:42mm;height:9mm}.barcode svg{width:42mm;height:9mm}.orders{width:100%;border-collapse:collapse;table-layout:fixed}.orders th,.orders td{border:1px solid #555;padding:3px 3px;vertical-align:middle;text-align:${LANG==='ar'?'right':'left'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.orders th{background:#eee;font-size:8px}.orders td{font-size:8px}.footer{margin-top:8px;display:flex;justify-content:space-between;font-size:8px}.sign{margin-top:12px;display:flex;justify-content:space-between;font-size:9px}@media screen{body{width:min(210mm,calc(100vw - 24px));min-height:297mm;padding:clamp(10px,3vw,10mm)}}@media print{html{background:#fff}body{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.merchant-page{break-after:page}}</style></head><body>${body}</body></html>`);w.document.close();setTimeout(()=>w.print(),250);}
function makeBarcodeSvg(value){const v=String(value||'').replace(/[^A-Za-z0-9-]/g,'');let bars='';for(let i=0;i<v.length;i++){const n=v.charCodeAt(i)%4+1;bars+=`<rect x="${i*5}" y="0" width="${n}" height="36"/>`;if(i%2===0)bars+=`<rect x="${i*5+n+1}" y="0" width="1" height="36"/>`;}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(80,v.length*5+10)} 48" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#fff"/>${bars}<text x="50%" y="46" text-anchor="middle" font-size="7" font-family="Arial">${esc(value)}</text></svg>`;}
function printReturnMerchantPDF(rows,operation,targetWindow){
  const data=(rows||[]).filter(Boolean);if(!data.length)return;
  // Build one independent statement per shipper. Prefer stable IDs; older rows may only have a name.
  const groups=new Map();
  data.forEach(r=>{
    const id=String(r.merchant_id||r.shipper_id||r.operation?.merchant_id||'').trim();
    const name=String(r.shipper_name||r.merchant_name||r.operation?.merchant_name||'').trim();
    const key=id||name.toLocaleLowerCase()||'unknown';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(r);
  });
  const root=operation||data[0]?.operation||{};
  const ops=Array.isArray(root.operations)?root.operations:[];
  const body=[...groups.entries()].map(([groupKey,group],groupIndex)=>{
    const first=group[0]||{};
    const merchantId=String(first.merchant_id||first.shipper_id||first.operation?.merchant_id||'');
    const merchantName=String(first.shipper_name||first.merchant_name||first.operation?.merchant_name||'');
    const groupOp=ops.find(x=>(merchantId&&String(x.merchant_id||x.shipper_id||'')===merchantId)||(!merchantId&&merchantName&&String(x.merchant_name||'').trim().toLocaleLowerCase()===merchantName.trim().toLocaleLowerCase()))||first.operation||root;
    const operationNo=groupOp.operation_no||first.return_operation_no||'—';
    return `<section class="merchant-page" data-shipper-statement="${esc(groupKey)}" style="${groupIndex?'break-before:page;page-break-before:always;':''}"><div class="head"><div class="brand"><img src="${esc(COMPANY_BRANDING.logo_url||'/trend-logo.jpeg')}"><div><div class="title">${L('Return to Origin','Return to Origin')}</div><div class="meta">${L('Shipper','التاجر')}: ${esc(merchantName||'—')}<br>${L('Driver','المندوب')}: ${esc(groupOp.driver_name||first.driver_name||'—')}<br>${L('Order Created By','موظف منشئ الأوردر')}: ${esc([...new Set(group.map(r=>r.created_by_name||r.order_created_by_name).filter(Boolean))].join(', ')||'—')}</div></div></div><div class="op">${L('Return Operation No.','رقم عملية المرتجع')}<br>${esc(operationNo)}<div class="barcode">${makeBarcodeSvg(operationNo==='—'?'':operationNo)}</div></div></div><table class="orders"><thead><tr><th>Tracking</th><th>Order No.</th><th>${L('Customer','العميل')}</th><th>${L('Phone','الهاتف')}</th><th>COD</th><th>${L('Original Status','الحالة الأصلية')}</th><th>${L('Return Status','حالة المرتجع')}</th><th>${L('Return Date','التاريخ')}</th></tr></thead><tbody>${group.map(r=>`<tr><td>${esc(r.tracking_number||'—')}</td><td>${esc(r.order_number||'—')}</td><td>${esc(r.customer_name||'—')}</td><td>${esc(r.customer_phone||'—')}</td><td>${esc(new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(r.cod||0)))}</td><td>${esc(r.original_status||'—')}</td><td>${esc(returnIsCompletedWithoutProof(r)?L('Completed Without Proof','مكتمل بدون إثبات'):(r.return_status||'Return to Origin'))}${returnIsCompletedWithoutProof(r)&&r.completed_by_name?`<br><small>${L('Completed By','أُكمل بواسطة')}: ${esc(r.completed_by_name)}</small>`:''}</td><td>${esc(String(r.return_date||today()).slice(0,10))}</td></tr>`).join('')}</tbody></table><div class="sign"><span>${L('Shipper Signature','توقيع التاجر')}: __________________</span><span>${L('Company Signature','توقيع الشركة')}: __________________</span></div><div class="footer"><span>${esc(COMPANY_BRANDING.name||'Delivery')}</span><span>Designed &amp; Developed by Mohamed Hoseany</span></div></section>`;
  }).join('');
  returnPrintWindow('Return to Origin - Shipper Statements',body,targetWindow);
}
function printReturnOrderPDF(id){const r=(window.__returnsRows||[]).find(x=>String(x.id)===String(id));if(!r)return;printReturnMerchantPDF([r],r.operation||{operation_no:r.return_operation_no,driver_name:r.driver_name});}
async function printReturnOperationPDF(operationId){try{const d=await api(`/api/returns/operation/${encodeURIComponent(operationId)}`);const rows=d.data?.rows||[];printReturnMerchantPDF(rows,d.data?.operation||{});}catch(e){alert(e.message);}}
async function openReturnActions(id){
  const r=await api(`/api/returns/${encodeURIComponent(id)}`),x=r.data||{};
  const dr=await api('/api/drivers').catch(()=>({data:[]})); const drivers=dr.data||[];
  document.getElementById('returnActionDialog')?.remove();
  const box=document.createElement('div');box.id='returnActionDialog';box.className='modal-backdrop';
  box.innerHTML=`<div class="modal return-action-modal"><div class="section-title-row"><div><h3>${L('Return Actions','إجراءات المرتجع')}</h3><p class="muted">${esc(x.tracking_number||x.return_transaction_no||'')}</p></div><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
    <div class="return-action-grid">
      <button class="return-action-btn" onclick="showReturnDetails('${esc(id)}')">🔎 ${L('View Details','عرض التفاصيل')}</button>
      <button class="return-action-btn" onclick="showReturnTimeline('${esc(id)}');this.closest('.modal-backdrop').remove()">🕘 ${L('Timeline','الخط الزمني')}</button>
      <button class="return-action-btn" onclick="editReturnNote('${esc(id)}')">✎ ${L('Edit Note','تعديل الملاحظة')}</button>
      <button class="return-action-btn" onclick="uploadReturnProof('${esc(id)}')">📷 ${L('Add Return Proof','إضافة إثبات الإرجاع')}</button>
    </div>
    <div class="return-origin-box"><h4>${L('Return to Origin','إرجاع إلى المصدر')}</h4><div class="form-grid"><label>${L('Driver','السائق')}<select id="rtoDriver"><option value="">${L('Select Driver','اختر السائق')}</option>${drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name||'')} — ${esc(d.driver_no||'')}</option>`).join('')}</select></label></div><button id="confirmSingleReturnToOrigin" class="primary" type="button" onclick="returnToOrigin('${esc(id)}')">↩ 🖨 ${L('Return to Origin & Print PDF','إرجاع إلى المصدر وطباعة PDF')}</button><p class="muted">${L('The status updates immediately, the order moves to Returns Archive, and its PDF opens automatically.','تتغير الحالة فورًا وينتقل الأوردر للأرشيف ويفتح PDF تلقائيًا.')}</p></div>
    <div class="return-complete-box"><h4>${L('Return Completed','إتمام المرتجع')}</h4><p class="muted">${L('Upload the return receipt/proof to complete the return.','ارفع إثبات استلام المرتجع لإتمام العملية.')}</p><button onclick="uploadReturnProof('${esc(id)}')">📎 ${L('Upload Proof & Complete','رفع الإثبات وإتمام المرتجع')}</button></div>
  </div>`;document.body.appendChild(box);
}
async function showReturnDetails(id){const d=await api(`/api/returns/${encodeURIComponent(id)}`),x=d.data||{};alert(`${L('Return Transaction','عملية المرتجع')}: ${x.return_transaction_no||''}\n${L('Tracking','التتبع')}: ${x.tracking_number||''}\n${L('Order','الأوردر')}: ${x.order_number||''}\n${L('Status','الحالة')}: ${x.return_status||x.status||''}\n${L('Driver','السائق')}: ${x.driver_name||'—'}\n${L('Note','الملاحظة')}: ${x.note||'—'}`);}
async function editReturnNote(id){const d=await api(`/api/returns/${encodeURIComponent(id)}`),x=d.data||{};const note=await showInputModal(L('Return note','ملاحظة المرتجع'),x.note||'');if(note===null)return;await api(`/api/returns/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({note})});document.getElementById('returnActionDialog')?.remove();await loadReturnsPage();}
async function uploadReturnProof(id){const input=document.createElement('input');input.type='file';input.accept='image/*,.pdf,.heic,.heif';input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('حجم ملف الإثبات أكبر من 8MB. اختر صورة أصغر أو PDF مضغوط.');const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result||''));fr.onerror=()=>rej(new Error('تعذر قراءة الملف من الصور/Drive. جرّب حفظه على الجهاز ثم اختياره مرة أخرى.'));fr.readAsDataURL(f);});const result=await api(`/api/returns/${encodeURIComponent(id)}/proof`,{method:'POST',body:JSON.stringify({file_name:f.name,content_type:f.type||'application/octet-stream',data})});if(!result?.success)throw new Error(result?.error||'تعذر حفظ إثبات المرتجع.');document.getElementById('returnActionDialog')?.remove();await loadReturnsPage();if(typeof loadReturnArchivePage==='function'&&document.getElementById('returnArchiveTable'))await loadReturnArchivePage();}catch(e){alert(e.message||String(e));}};input.click();}
async function printSingleReturnBeforeArchive(id){return returnToOrigin(id);}
async function returnToOrigin(id){const driver=$("rtoDriver")?.value;if(!driver)return alert(L('Select Driver first','اختر السائق أولاً'));const row=(window.__returnsRows||[]).find(x=>String(x.id)===String(id));if(!row)return alert(L('Return order could not be loaded','تعذر تحميل الأوردر المرتجع'));return processReturnsToOrigin([String(id)],driver,[row],'returnActionDialog');}
async function returnActions(id){return openReturnActions(id);}

function returnIsCompletedWithoutProof(r){return Boolean(r?.completed_without_proof)&&[r?.return_status,r?.order_status,r?.shipment_status].some(v=>String(v||'').trim().toLowerCase()==='return completed');}
function previewReturnProof(id, contentType='', fileName=''){
  const url=`/api/returns/${encodeURIComponent(id)}/proof`;
  document.getElementById('returnProofPreviewDialog')?.remove();
  const isImage=/image\/(png|jpe?g|webp|gif)/i.test(String(contentType||''))||/\.(png|jpe?g|webp|gif)$/i.test(String(fileName||''));
  const media=isImage?`<div class="return-proof-image-wrap" style="text-align:center"><img src="${url}" alt="${L('Receipt proof','إثبات الاستلام')}" style="max-width:100%;max-height:72vh;object-fit:contain"></div>`:`<iframe title="${L('Receipt proof preview','معاينة إثبات الاستلام')}" src="${url}" style="width:100%;height:72vh;border:0;border-radius:8px;background:#fff"></iframe>`;
  const box=document.createElement('div');box.id='returnProofPreviewDialog';box.className='modal-backdrop';
  box.innerHTML=`<div class="modal-card" style="width:min(96vw,1000px);max-width:1000px"><div class="section-title-row"><div><h3>${L('Receipt Proof Preview','معاينة إثبات الاستلام')}</h3><p class="muted">${esc(fileName||L('Attached receipt proof','ملف إثبات الاستلام المرفق'))}</p></div><button type="button" class="ghost" onclick="this.closest('.modal-backdrop')?.remove()">✕</button></div><div class="return-proof-preview-content">${media}</div><div class="actions" style="justify-content:flex-end"><a class="mini-btn" href="${url}" target="_blank" rel="noopener">${L('Open in new tab','فتح في نافذة جديدة')}</a><button type="button" class="mini-btn" onclick="this.closest('.modal-backdrop')?.remove()">${L('Close','إغلاق')}</button></div></div>`;
  document.body.appendChild(box);
}
async function returnArchivePage(c){
  c.innerHTML=`<div class="panel"><div class="section-title-row"><div><h2>${L("Returns Archive","أرشيف المرتجعات")}</h2><p class="muted">${L("Shipper receipt proof and return completion archive","أرشيف إثبات استلام التاجر وإكمال عمليات المرتجع")}</p></div><div class="actions"><label>${L("From Date","من تاريخ")}<input id="raFrom" type="date" value="${daysAgo(7)}"></label><label>${L("To Date","إلى تاريخ")}<input id="raTo" type="date" value="${today()}"></label><button onclick="loadReturnArchivePage()">${L("Filter","بحث")}</button></div></div><div id="returnArchiveTable" class="table-wrap">${L("Loading...","جارٍ التحميل...")}</div></div>`;await loadReturnArchivePage();
}
async function loadReturnArchivePage(){try{const d=await api(`/api/returns/archive?from=${encodeURIComponent($("raFrom")?.value||"")}&to=${encodeURIComponent($("raTo")?.value||"")}`);const rows=d.data||[];window.__returnArchiveRows=rows;const selected=window.__returnArchiveSelected||(window.__returnArchiveSelected=new Set());$("returnArchiveTable").innerHTML=rows.length?`<div class="return-archive-toolbar"><label><input type="checkbox" id="returnArchiveSelectAll" onchange="toggleReturnArchiveAll(this.checked)"> ${L("Select All","تحديد الكل")}</label><span>${L("Selected","المحدد")}: <b id="returnArchiveSelectedCount">${selected.size}</b></span>${CURRENT_USER?.permissions?.completed_without_proof?`<button type="button" class="danger mini-btn" onclick="completeSelectedReturnsWithoutProof()">${L("Completed Without Proof","إكمال المرتجع بدون إثبات")}</button>`:""}</div><table class="compact-table return-archive-compact"><thead><tr><th></th><th>Return Transaction No.</th><th>${L("Tracking / Order No.","التتبع / رقم الأوردر")}</th><th>Shipper</th><th>Return Status</th><th>Receipt Proof</th><th>Attachments</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr><td><input type="checkbox" data-return-archive-id="${esc(r.id)}" ${selected.has(String(r.id))?"checked":""} onchange="toggleReturnArchiveRow('${esc(r.id)}',this.checked)"></td><td><b>${esc(r.return_operation_no||r.return_transaction_no||"")}</b></td><td><div>${esc(r.tracking_number||"")}</div><small>${esc(r.order_number||"")}</small></td><td><div>${esc(r.shipper_name||"")}</div><small class="return-archive-merchant-code">${esc(r.shipper_code||r.merchant_code||"")}</small></td><td><span class="badge">${esc(r.return_status||"")}</span></td><td class="return-archive-proof-cell">${r.proof_id?`<div class="return-archive-proof-actions"><button type="button" class="mini-btn return-archive-icon-btn" title="${L("Preview Proof","معاينة الإثبات")}" aria-label="${L("Preview Proof","معاينة الإثبات")}" onclick="previewReturnProof('${esc(r.id)}','${esc(r.attachments?.[0]?.content_type||'')}','${esc(r.attachments?.[0]?.file_name||'')}')">👁</button><button type="button" class="mini-btn return-archive-icon-btn" title="${L("Add Return Proof","إضافة إثبات الإرجاع")}" aria-label="${L("Add Return Proof","إضافة إثبات الإرجاع")}" onclick="uploadReturnProof('${esc(r.id)}')">＋</button></div>`:(returnIsCompletedWithoutProof(r)?`<div class="return-archive-proof-actions"><strong>${L("No Proof","بدون إثبات")}</strong><button type="button" class="mini-btn return-archive-icon-btn" title="${L("Add Return Proof","إضافة إثبات الإرجاع")}" aria-label="${L("Add Return Proof","إضافة إثبات الإرجاع")}" onclick="uploadReturnProof('${esc(r.id)}')">＋</button></div>`:`<button type="button" class="mini-btn return-archive-add-proof" title="${L("Add Return Proof","إضافة إثبات الإرجاع")}" onclick="uploadReturnProof('${esc(r.id)}')">＋ ${L("Add Proof","إضافة إثبات")}</button>`)}</td><td>${Number(r.attachment_count||0)}</td><td><span class="badge">${esc(returnIsCompletedWithoutProof(r)?L("Completed Without Proof","مكتمل بدون إثبات"):(r.return_status==="Return Completed"?"Completed":(r.return_status==="Return to Origin"?"Return to Origin":"Pending")))}</span>${returnIsCompletedWithoutProof(r)&&r.completed_by_name?`<small class="muted">${L("By","بواسطة")}: ${esc(r.completed_by_name)}</small>`:""}</td><td><div class="actions"><button class="mini-btn" onclick="printReturnArchivePDF('${esc(r.id)}')">PDF</button><button class="mini-btn" onclick="exportReturnOrderExcel('${esc(r.id)}')">Excel</button><button class="mini-btn" onclick="showReturnTimeline('${esc(r.id)}')">${L("Timeline","Timeline")}</button><button class="mini-btn" onclick="returnArchiveActions('${esc(r.id)}')">${L("Actions","الإجراءات")}</button></div></td></tr>`).join("")}</tbody></table>`:`<p class="muted">${L("No completed/pending return archive records","لا توجد سجلات في أرشيف المرتجعات")}</p>`;}catch(e){$("returnArchiveTable").innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}}
async function completeSelectedReturnsWithoutProof(){
  const ids=[...(window.__returnArchiveSelected instanceof Set?window.__returnArchiveSelected:new Set())];
  if(!ids.length)return alert(L('Select at least one return record','حدد سجل مرتجع واحدًا على الأقل'));
  if(!await showConfirmModal(L(`Mark ${ids.length} selected return(s) as Return Completed without proof? This updates the order, shipment and return archive.`,`تأكيد إكمال ${ids.length} مرتجعًا بدون إثبات؟ سيتم تحديث الأوردر والشحنة وأرشيف المرتجعات.`)))return;
  try{const d=await api('/api/returns/archive/bulk-complete-without-proof',{method:'POST',body:JSON.stringify({return_ids:ids})});window.__returnArchiveSelected=new Set();await loadReturnArchivePage();alert(L(`Updated ${d.updated_count||0} return record(s).`,`تم تحديث ${d.updated_count||0} سجل مرتجع.`));}
  catch(e){alert(e.message||String(e));}
}
function toggleReturnArchiveRow(id,checked){if(!(window.__returnArchiveSelected instanceof Set))window.__returnArchiveSelected=new Set();checked?window.__returnArchiveSelected.add(String(id)):window.__returnArchiveSelected.delete(String(id));const n=document.getElementById("returnArchiveSelectedCount");if(n)n.textContent=String(window.__returnArchiveSelected.size);}
function toggleReturnArchiveAll(checked){if(!(window.__returnArchiveSelected instanceof Set))window.__returnArchiveSelected=new Set();(window.__returnArchiveRows||[]).forEach(r=>checked?window.__returnArchiveSelected.add(String(r.id)):window.__returnArchiveSelected.delete(String(r.id)));loadReturnArchivePage();}
async function printReturnArchivePDF(id){try{const d=await api(`/api/returns/${encodeURIComponent(id)}`);const r=d.data||{};if(r.return_operation_id){await printReturnOperationPDF(r.return_operation_id);return;}printReturnMerchantPDF([r],r.operation||{operation_no:r.return_operation_no,driver_name:r.driver_name});}catch(e){alert(e.message);}}
async function exportReturnOrderExcel(id){try{const d=await api(`/api/returns/${encodeURIComponent(id)}`);const r=d.data||{};if(typeof XLSX==='undefined')return alert(L('Excel library did not load','مكتبة Excel لم تعمل'));const data=[[L('Return Operation No.','رقم عملية المرتجع'),r.return_operation_no||''],[L('Tracking','التتبع'),r.tracking_number||''],[L('Order No.','رقم الأوردر'),r.order_number||''],[L('Shipper','التاجر'),r.shipper_name||''],[L('Customer','العميل'),r.customer_name||''],[L('Phone','الهاتف'),r.customer_phone||''],[L('COD','القيمة'),r.cod||0],[L('Original Status','الحالة الأصلية'),r.original_status||''],[L('Return Status','حالة المرتجع'),r.return_status||''],[L('Completion Method','طريقة الإتمام'),returnIsCompletedWithoutProof(r)?L('Completed Without Proof','مكتمل بدون إثبات'):(r.proof_id?L('With Proof','بإثبات'):'—')],[L('Completed By','أُكمل بواسطة'),r.completed_by_name||''],[L('Completed At','وقت الإتمام'),r.completed_at||''],[L('Driver','المندوب'),r.driver_name||''],[L('Return Date','تاريخ المرتجع'),String(r.return_date||'').slice(0,10)]];const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(data);XLSX.utils.book_append_sheet(wb,ws,'Return');XLSX.writeFile(wb,`return-${String(r.return_operation_no||r.id).replace(/[^\w\u0600-\u06FF-]+/g,'-')}.xlsx`);}catch(e){alert(e.message);}}
async function returnArchiveActions(id){
  const r=await api(`/api/returns/${encodeURIComponent(id)}`),x=r.data||{};
  document.getElementById('returnArchiveActionDialog')?.remove();
  const box=document.createElement('div');box.id='returnArchiveActionDialog';box.className='modal-backdrop';
  box.innerHTML=`<div class="modal return-action-modal"><div class="section-title-row"><div><h3>${L('Archive Actions','إجراءات الأرشيف')}</h3><p class="muted">${esc(x.return_operation_no||x.return_transaction_no||x.tracking_number||'')}</p></div><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
    <div class="return-action-grid">
      <button class="return-action-btn" onclick="showReturnDetails('${esc(id)}');this.closest('.modal-backdrop').remove()">🔎 ${L('View Details','عرض التفاصيل')}</button>
      <button class="return-action-btn" onclick="showReturnTimeline('${esc(id)}');this.closest('.modal-backdrop').remove()">🕘 ${L('Timeline','الخط الزمني')}</button>
      <button class="return-action-btn" onclick="editReturnNote('${esc(id)}')">✎ ${L('Edit Note','تعديل الملاحظة')}</button>
      <button class="return-action-btn" onclick="uploadReturnProof('${esc(id)}')">📷 ${L('Add Return Proof','إضافة إثبات الإرجاع')}</button>
      <button class="return-action-btn" onclick="printReturnArchivePDF('${esc(id)}');this.closest('.modal-backdrop').remove()">🖨 ${L('Print PDF','طباعة PDF')}</button>
      <button class="return-action-btn" onclick="exportReturnOrderExcel('${esc(id)}');this.closest('.modal-backdrop').remove()">📊 Excel</button>
    </div>
    ${x.return_status==='Return to Origin'||x.return_operation_no?`<div class="return-operation-card"><b>${L('Return to Origin Operation','رقم عملية Return to Origin')}</b><strong>${esc(x.return_operation_no||'—')}</strong><div class="return-operation-barcode">${makeBarcodeSvg(x.return_operation_no||'')}</div></div>`:''}
  </div>`;
  document.body.appendChild(box);
}

async function merchantsPage(c){
  window.__merchantTab="list";
  const d=await api("/api/merchants"); const rows=d.data||[];
  c.innerHTML=`<h2 class="merchant-page-title">${t("Shippers")}</h2>
  <div id="merchantAddSection" class="panel merchant-profile-panel"><div class="section-title-row"><div><h3>${t("Add Shipper")}</h3><p class="muted">${L("Complete shipper profile, billing and payout information from one place.","ملف التاجر الكامل: بيانات الاتصال والتعامل المالي والمتجر من مكان واحد.")}</p></div><span class="profile-completeness" id="merchantCompleteness">0%</span></div><div class="form-grid">
  <label class="full">${L("Shipper Name","اسم التاجر")}<input id="mname" required></label><label>${L("Shipper Code","كود التاجر")}<input id="mc" value="${L("Auto generated","يُولد تلقائياً")}" readonly></label><label>${L("Old System Code","كود التاجر في السيستم القديم")}<input id="mn" placeholder="${L("Optional","اختياري")}"></label><label>${L("Contact Person","مسؤول الحساب")}<input id="mcontact"></label><label>${L("Phone 1","رقم الهاتف 1")}<input id="mphone"></label><label>${L("Phone 2","رقم الهاتف 2")}<input id="mphone2"></label><label>${L("WhatsApp","واتساب")}<input id="mwhatsapp"></label><label>${L("Email","البريد الإلكتروني")}<input id="memail" type="email"></label><label class="full">${t("Address")}<input id="maddress"></label><label>${L("City","المدينة")}<input id="mcity"></label><label>${L("Tax Number","الرقم الضريبي")}<input id="mtaxno"></label><label>${L("Commercial Registration","السجل التجاري")}<input id="mcr"></label><label>${t("Default Delivery Fee")} <small class="muted">${currencyInfo().symbol}</small><input id="mfee" type="number" min="0" step="0.01"></label><label>${L("Pickup Fee","رسوم الاستلام")}<input id="mpickup" type="number" min="0" step="0.01"></label><label>${L("Return Fee","رسوم المرتجع")}<input id="mreturnfee" type="number" min="0" step="0.01"></label><label>${L("COD Fee","رسوم التحصيل")}<input id="mcodfee" type="number" min="0" step="0.01"></label><label><span>${t("Tax")} <input id="mtax" type="checkbox"></span></label><label>${t("Tax Rate")}<input id="mrate" type="number" min="0" max="100" step="0.01"></label><label>${L("Payout Method","طريقة تحويل مستحقات التاجر")}<select id="mpayout"><option value="">--</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="wallet">Wallet</option></select></label><label>${L("Payout Account","حساب التحويل")}<input id="mpayoutaccount"></label><label>${t("Store Type")}<select id="mstoretype"><option value="">--</option><option>ecommerce</option><option>website</option><option>app</option><option>other</option></select></label><label>${t("Store Name")}<input id="mstorename"></label><label class="full">${t("Store URL")}<input id="mstoreurl"></label><label><span>${t("Active")} <input id="mstoreactive" type="checkbox" checked></span></label><label class="full">${L("Notes","ملاحظات")}<textarea id="mnotes" rows="3"></textarea></label></div><button type="button" onclick="addMerchant()">${t("Save")}</button><div id="merchantMsg"></div></div>
  <div id="merchantListSection" class="panel merchant-list-panel"><div class="merchant-list-toolbar"><input id="merchantListSearch" type="search" aria-label="${L("Search by name, code or phone","ابحث باسم التاجر أو الكود أو رقم الهاتف")}" placeholder="🔎 ${L("Search shipper by name, code or phone","بحث عن تاجر بالاسم أو الكود أو الهاتف")}"><button type="button" onclick="selectMerchantTab('add')">＋ ${L("Add Shipper","إضافة تاجر")}</button><button type="button" class="ghost" onclick="showShipperRatesTool('merchantRatesToolsBox')">💰 ${L("Shipper Rates","أسعار الشحن")}</button></div><div id="merchantRatesToolsBox"></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>${L("No.","رقم")}</th><th>${t("Name")}</th><th>${t("Phone")}</th><th>${t("Default Delivery Fee")}</th><th>${t("Tax")}</th><th>${t("Store")}</th><th>${t("Edit")}</th><th>${L("Login Account","حساب الدخول")}</th></tr></thead><tbody>${rows.map(r=>`<tr data-merchant-search="${esc([r.name,r.code,r.merchant_no,r.external_code,r.phone,r.phone_2].filter(Boolean).join(" ").toLowerCase())}"><td>${esc(r.merchant_no||r.code||"")}</td><td><button type="button" class="trend-speak-merchant" data-speak-name="${esc(r.name||"")}" aria-label="${esc(L("Speak shipper name","انطق اسم التاجر"))}: ${esc(r.name||"")}">${esc(r.name)}</button></td><td>${esc(r.phone)}</td><td>${esc(money(r.base_delivery_fee||0))}</td><td>${r.tax_enabled?esc(r.tax_rate)+"%":"—"}</td><td>${esc(r.store_name||"")}</td><td><button onclick="editMerchant('${esc(r.id)}')">${t("Edit")}</button></td><td><button class="mini-btn" onclick="editMerchantAccount('${esc(r.id)}')">${r.portal_active&&r.portal_username?L("Edit Account","تعديل الحساب"):L("Create Account","إنشاء حساب")}</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">${t("No data")}</p>`}</div>
  <div id="merchantWooSection" class="panel"><h3>${L("WooCommerce Store Integration","ربط متجر WooCommerce")}</h3><div class="form-grid">
  <label>${t("Shipper")}<select id="imShipper">${rows.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select></label>
  <label>${t("Store Name")}<input id="imName" placeholder="WooCommerce Store"></label>
  <label class="full">${t("Store URL")}<input id="imUrl" placeholder="https://example.com"></label>
  <label>${t("Consumer Key")}<input id="imKey" type="password" autocomplete="off"></label>
  <label>${t("Consumer Secret")}<input id="imSecret" type="password" autocomplete="off"></label>
  <label><span>${t("Auto Import")} <input id="imAuto" type="checkbox" checked></span></label>
  </div><div class="actions"><button onclick="addWooIntegration()">${t("Save")}</button><button class="ghost" onclick="loadWooIntegrations()">${t("Refresh")||"تحديث"}</button></div><div id="imMsg"></div><div id="wooIntegrations"></div></div>`;
  const completenessFields=['mname','mcontact','mphone','mwhatsapp','memail','maddress','mcity','mpayout','mpayoutaccount'];
  const updateCompleteness=()=>{const filled=completenessFields.filter(id=>String($(id)?.value||'').trim()).length;const pct=Math.round(filled/completenessFields.length*100);if($('merchantCompleteness'))$('merchantCompleteness').textContent=pct+'%';};
  completenessFields.forEach(id=>$(id)?.addEventListener('input',updateCompleteness)); updateCompleteness();
  $('merchantListSearch')?.addEventListener('input',e=>{const q=String(e.target.value||'').trim().toLowerCase();document.querySelectorAll('#merchantListSection tbody tr').forEach(tr=>{tr.hidden=q&&!String(tr.dataset.merchantSearch||'').includes(q);});});
  c.querySelectorAll('[data-speak-name]').forEach(btn=>btn.addEventListener('click',()=>speakTrendName(btn.dataset.speakName)));
  selectMerchantTab(window.__merchantTab||'list');
  await loadWooIntegrations();
}
function selectMerchantTab(tab){
  window.__merchantTab=tab==='add'?'add':'list';
  const add=$('merchantAddSection'),list=$('merchantListSection'),woo=$('merchantWooSection'),addBtn=$('merchantAddTab'),listBtn=$('merchantListTab');
  if(woo)woo.hidden=window.__merchantTab!=='add';
  if(add)add.hidden=window.__merchantTab!=='add';
  if(list)list.hidden=window.__merchantTab!=='list';
  if(addBtn)addBtn.classList.toggle('active',window.__merchantTab==='add');
  if(listBtn)listBtn.classList.toggle('active',window.__merchantTab==='list');
}
async function addMerchant(){
  try{
    const d=await api("/api/merchants",{method:"POST",body:JSON.stringify({
      external_code:$("mn").value,name:$("mname").value,phone:$("mphone").value,
      phone_2:$("mphone2").value,address:$("maddress").value,
      base_delivery_fee:baseAmount($("mfee").value||0),tax_enabled:$("mtax").checked,
      tax_rate:Number($("mrate").value||0),store_type:$("mstoretype").value,
      store_name:$("mstorename").value,store_url:$("mstoreurl").value,
      store_active:$("mstoreactive").checked,contact_person:$("mcontact").value,
      email:$("memail").value,whatsapp:$("mwhatsapp").value,city:$("mcity").value,
      tax_number:$("mtaxno").value,commercial_registration:$("mcr").value,
      payout_method:$("mpayout").value,payout_account:$("mpayoutaccount").value,
      pickup_fee:baseAmount($("mpickup").value||0),return_fee:baseAmount($("mreturnfee").value||0),
      cod_fee:baseAmount($("mcodfee").value||0),notes:$("mnotes").value
    })});
    msg("merchantMsg",`${L("Saved successfully","تم حفظ الشاحن بنجاح")} — ${esc(d.data?.code||"")}`,"ok");
    window.__merchantTab="list";
    setTimeout(()=>show("merchants"),700);
  }catch(e){msg("merchantMsg",e.message,"error");}
}
async function editMerchant(id){
  const d=await api("/api/merchants"),m=(d.data||[]).find(x=>String(x.id)===String(id));if(!m)return;
  document.getElementById('merchantEditDialog')?.remove();
  const box=document.createElement('div');box.id='merchantEditDialog';box.className='modal-backdrop';
  box.innerHTML=`<div class="modal merchant-edit-modal">
    <div class="section-title-row"><div><h3>${L('Edit Shipper','تعديل بيانات التاجر')}</h3><p class="muted">${esc(m.name||'')} — ${esc(m.code||m.merchant_no||'')}</p></div><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
    <div class="form-grid merchant-edit-grid">
      <label class="full">${L('Shipper Name','اسم التاجر')}<input id="em_name" value="${esc(m.name||'')}"></label>
      <label>${L('Internal Shipper Code','كود التاجر')}<input value="${esc(m.code||m.merchant_no||'')}" readonly></label>
      <label>${L('Old System Code','كود التاجر القديم')}<input id="em_external" value="${esc(m.external_code||'')}"></label>
      <label>${L('Contact Person','مسؤول الحساب')}<input id="em_contact" value="${esc(m.contact_person||'')}"></label>
      <label>${L('Phone 1','رقم الهاتف 1')}<input id="em_phone" value="${esc(m.phone||'')}"></label>
      <label>${L('Phone 2','رقم الهاتف 2')}<input id="em_phone2" value="${esc(m.phone_2||'')}"></label>
      <label>${L('WhatsApp','واتساب')}<input id="em_whatsapp" value="${esc(m.whatsapp||'')}"></label>
      <label>${L('Email','البريد الإلكتروني')}<input id="em_email" type="email" value="${esc(m.email||'')}"></label>
      <label class="full">${L('Address','العنوان')}<input id="em_address" value="${esc(m.address||'')}"></label>
      <label>${L('City','المدينة')}<input id="em_city" value="${esc(m.city||'')}"></label>
      <label>${L('Tax Number','الرقم الضريبي')}<input id="em_taxno" value="${esc(m.tax_number||'')}"></label>
      <label>${L('Commercial Registration','السجل التجاري')}<input id="em_cr" value="${esc(m.commercial_registration||'')}"></label>
      <label>${L('Default Delivery Fee','رسوم التوصيل الافتراضية')}<input id="em_fee" type="number" min="0" step="0.01" value="${esc(moneyInput(m.base_delivery_fee||0))}"></label>
      <label>${L('Pickup Fee','رسوم الاستلام')}<input id="em_pickup" type="number" min="0" step="0.01" value="${esc(moneyInput(m.pickup_fee||0))}"></label>
      <label>${L('Return Fee','رسوم المرتجع')}<input id="em_returnfee" type="number" min="0" step="0.01" value="${esc(moneyInput(m.return_fee||0))}"></label>
      <label>${L('COD Fee','رسوم التحصيل')}<input id="em_codfee" type="number" min="0" step="0.01" value="${esc(moneyInput(m.cod_fee||0))}"></label>
      <label><span>${L('Tax Enabled','تفعيل الضريبة')} <input id="em_tax" type="checkbox" ${m.tax_enabled?'checked':''}></span></label>
      <label>${L('Tax Rate %','نسبة الضريبة %')}<input id="em_rate" type="number" min="0" max="100" step="0.01" value="${esc(m.tax_rate||0)}"></label>
      <label>${L('Payout Method','طريقة تحويل المستحقات')}<select id="em_payout"><option value="">--</option><option value="cash" ${m.payout_method==='cash'?'selected':''}>Cash</option><option value="bank" ${m.payout_method==='bank'?'selected':''}>Bank</option><option value="wallet" ${m.payout_method==='wallet'?'selected':''}>Wallet</option></select></label>
      <label>${L('Payout Account','حساب التحويل')}<input id="em_payoutaccount" value="${esc(m.payout_account||'')}"></label>
      <label>${t('Store Type')}<select id="em_storetype"><option value="">--</option><option value="ecommerce" ${m.store_type==='ecommerce'?'selected':''}>ecommerce</option><option value="website" ${m.store_type==='website'?'selected':''}>website</option><option value="app" ${m.store_type==='app'?'selected':''}>app</option><option value="other" ${m.store_type==='other'?'selected':''}>other</option></select></label>
      <label>${t('Store Name')}<input id="em_storename" value="${esc(m.store_name||'')}"></label>
      <label class="full">${t('Store URL')}<input id="em_storeurl" value="${esc(m.store_url||'')}"></label>
      <label><span>${t('Active')} <input id="em_active" type="checkbox" ${m.active!==false?'checked':''}></span></label>
      <label><span>${L('Store Integration Active','تفعيل المتجر')} <input id="em_storeactive" type="checkbox" ${m.store_active?'checked':''}></span></label>
      <label class="full">${L('Notes','ملاحظات')}<textarea id="em_notes" rows="3">${esc(m.notes||'')}</textarea></label>
    </div>
    <div id="merchantEditMsg" class="msg"></div><div class="actions"><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">${L('Cancel','إلغاء')}</button><button class="primary" onclick="saveMerchantEdit('${esc(m.id)}')">${L('Save Changes','حفظ التعديلات')}</button></div>
  </div>`;
  document.body.appendChild(box);
}
async function saveMerchantEdit(id){
  try{
    const body={id,name:$('em_name').value.trim(),external_code:$('em_external').value.trim(),contact_person:$('em_contact').value.trim(),phone:$('em_phone').value.trim(),phone_2:$('em_phone2').value.trim(),whatsapp:$('em_whatsapp').value.trim(),email:$('em_email').value.trim(),address:$('em_address').value.trim(),city:$('em_city').value.trim(),tax_number:$('em_taxno').value.trim(),commercial_registration:$('em_cr').value.trim(),base_delivery_fee:baseAmount($('em_fee').value),pickup_fee:baseAmount($('em_pickup').value),return_fee:baseAmount($('em_returnfee').value),cod_fee:baseAmount($('em_codfee').value),tax_enabled:$('em_tax').checked,tax_rate:Number($('em_rate').value||0),payout_method:$('em_payout').value,payout_account:$('em_payoutaccount').value.trim(),store_type:$('em_storetype').value,store_name:$('em_storename').value.trim(),store_url:$('em_storeurl').value.trim(),active:$('em_active').checked,store_active:$('em_storeactive').checked,notes:$('em_notes').value};
    await api('/api/merchants',{method:'PATCH',body:JSON.stringify(body)});document.getElementById('merchantEditDialog')?.remove();await show('merchants');
  }catch(e){msg('merchantEditMsg',e.message,'error');}
}

async function editMerchantAccount(id){
  const d=await api('/api/merchants'),m=(d.data||[]).find(x=>String(x.id)===String(id));if(!m)return;
  document.getElementById('merchantAccountDialog')?.remove();const enabled=Boolean(m.portal_active&&m.portal_username);
  const box=document.createElement('div');box.id='merchantAccountDialog';box.className='modal-backdrop';
  box.innerHTML=`<div class="modal" style="max-width:520px;width:min(520px,94vw)"><div class="section-title-row"><div><h3>${enabled?L('Edit Shipper Login','تعديل حساب دخول التاجر'):L('Create Shipper Login','إنشاء حساب دخول للتاجر')}</h3><p class="muted">${esc(m.name||'')} — ${esc(m.code||m.merchant_no||'')}</p></div><button class="ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><div class="form-grid"><label class="full">${L('Username','اسم المستخدم')}<input id="ma_username" autocomplete="username" value="${esc(m.portal_username||'')}" required></label><label class="full">${L('Password','كلمة المرور')}<input id="ma_password" type="password" autocomplete="new-password" placeholder="${enabled?L('Leave blank to keep current password','اتركها فارغة للاحتفاظ بكلمة المرور'):L('At least 8 characters','8 أحرف على الأقل')}" ${enabled?'':'required'}></label></div><p class="muted">${L('The password is stored as a secure hash and cannot be viewed later.','تُحفظ كلمة المرور بصورة مشفّرة ولا يمكن عرضها لاحقًا.')}</p><div id="ma_msg" class="msg"></div><div class="actions">${enabled?`<button class="danger" onclick="setMerchantAccountEnabled('${esc(m.id)}',false)">${L('Disable Account','تعطيل الحساب')}</button>`:''}<button class="primary" onclick="saveMerchantAccount('${esc(m.id)}',${enabled})">${L('Save','حفظ')}</button></div></div>`;document.body.appendChild(box);
}
async function saveMerchantAccount(id,enabled){try{const username=$('ma_username').value.trim(),password=$('ma_password').value;await api('/api/merchant-accounts',{method:enabled?'PATCH':'POST',body:JSON.stringify({merchant_id:id,username,password})});msg('ma_msg',L('Account saved successfully','تم حفظ حساب الدخول بنجاح'),'ok');setTimeout(()=>{document.getElementById('merchantAccountDialog')?.remove();show('merchants');},500);}catch(e){msg('ma_msg',e.message,'error');}}
async function setMerchantAccountEnabled(id,enabled){try{await api('/api/merchant-accounts',{method:'PATCH',body:JSON.stringify({merchant_id:id,enabled})});document.getElementById('merchantAccountDialog')?.remove();await show('merchants');}catch(e){msg('ma_msg',e.message,'error');}}

async function addWooIntegration(){try{const merchantId=$("imShipper").value;const name=$("imName").value.trim()||"WooCommerce Store";const url=$("imUrl").value.trim();const key=$("imKey").value.trim();const secret=$("imSecret").value.trim();if(!url||!key||!secret)return msg("imMsg",L("Enter store URL, Consumer Key and Consumer Secret","أدخل رابط المتجر ومفتاح WooCommerce والسر"),"error");const d=await api("/api/merchant-integrations",{method:"POST",body:JSON.stringify({merchant_id:merchantId,type:"woocommerce",name,config:{url,consumer_key:key,consumer_secret:secret,auto_import:$("imAuto").checked}})});msg("imMsg",L("Saved successfully","تم حفظ الربط"),"ok");await loadWooIntegrations();}catch(e){msg("imMsg",e.message,"error");}}
async function loadWooIntegrations(){const box=$("wooIntegrations");if(!box||!$("imShipper"))return;try{const d=await api("/api/merchant-integrations?merchant_id="+encodeURIComponent($("imShipper").value));const rows=(d.data||[]).filter(x=>String(x.type).toLowerCase()==="woocommerce");box.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>${t("Store")}</th><th>${t("Store URL")}</th><th>${t("Status")}</th><th>${t("Test Connection")}</th><th>${t("Import Orders")}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.config?.url||"")}</td><td>${r.active?"":""}${r.config?.last_error?`<br><span class="error">${esc(r.config.last_error)}</span>`:""}</td><td><button onclick="testWoo('${esc(r.id)}')">${t("Test Connection")}</button></td><td><button onclick="importWoo('${esc(r.id)}')">${t("Import Orders")}</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">${t("No data")}</p>`;}catch(e){box.innerHTML=`<span class="error">${esc(e.message)}</span>`;}}
async function testWoo(id){try{const d=await api(`/api/merchant-integrations/${encodeURIComponent(id)}/test`,{method:"POST"});alert(`${L("Connection successful","تم الاتصال بنجاح")} — ${d.sample_count||0}`);await loadWooIntegrations();}catch(e){alert(e.message);await loadWooIntegrations();}}
async function importWoo(id){try{const d=await api(`/api/merchant-integrations/${encodeURIComponent(id)}/import`,{method:"POST",body:JSON.stringify({per_page:50})});alert(`${L("Orders imported","تم سحب الأوردرات")}: ${d.imported} — ${L("Skipped","تم التخطي")}: ${d.skipped}`);await show("shipments");}catch(e){alert(e.message);}}



/* ===== FRONTEND MODULE BOUNDARY ===== */

async function driversPage(c){
  const d=await api('/api/drivers'); const rows=d.data||[];
  c.innerHTML=`<h2>${t("Drivers")}</h2>
  <div class="panel driver-account-panel">
    <div class="section-title-row"><div><h3>${L("Driver Financial Statement","كشف المندوب المالي")}</h3><p class="muted">${L("Orders, Verify, expenses, totals and payment in one statement","الأوردرات و Verify والمصروفات والإجمالي والدفع في كشف واحد")}</p></div></div>
    <div class="form-grid driver-filters">
      <label>${L("Driver","المندوب")}<select id="stmtDriver"><option value="">${L("Select driver","اختر المندوب")}</option>${rows.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.driver_no||"")}</option>`).join("")}</select></label>
      <label>${t("From")}<input id="stmtFrom" type="date" value=""></label>
      <label>${t("To")}<input id="stmtTo" type="date" value=""></label>
      <label>${L("Verify","حالة Verify")}<select id="stmtVerify"><option value="all">All</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></label>
      <label>${L("Search","بحث")}<input id="stmtSearch" placeholder="Tracking / Shipment / Order / Shipper"></label>
    </div>
    <div class="actions no-print">
      <button onclick="loadDriverStatement()">${L("Show Statement","عرض كشف الحساب")}</button>
      <button class="ghost driver-refresh-btn" type="button" onclick="loadDriverStatement()">↻ ${L("Refresh","تحديث")}</button>
      <button class="ghost" onclick="selectDriverOrders()">${L("Select Orders","Select Orders")}</button><button class="ghost" onclick="driverOptions()">${L("Options","Options")}</button>
      <button class="ghost" onclick="showDriverReturn()">${L("Return","Return")}</button>
      <button class="ghost" onclick="exportDriverStatementExcel()">${L("Excel","Excel")}</button>
      <button class="ghost" onclick="printArea('printDriverStatement',${JSON.stringify(L('Driver Financial Statement','كشف المندوب المالي'))})">${t("Print / PDF")}</button>
    </div>
    <div id="driverStatement"></div>
    <div id="driverReturnPanel" class="driver-return-panel hidden"></div>
  </div>
  <div class="panel">${table(rows,["driver_no","name","phone","vehicle_no","active","created_at"])}</div>`;
  $("stmtSearch")?.addEventListener('input',()=>renderDriverStatementRows());
  $("stmtVerify")?.addEventListener('change',()=>renderDriverStatementRows());
}

let DRIVER_STATEMENT_CACHE=null;
function driverStatusOptions(){
  return [
    ["Delivered","Delivered"],["Cancelled","Cancelled"],["Cancelled by Shipper","Cancelled by Shipper"],["Cancelled by Receiver","Cancelled by Receiver"],["Replaced","Replaced"],["Half Delivered","Half Delivered"],
    ["Return by Driver","Return by Driver"],["Location Change","Location Change"],["In Ops","In Ops"],["Future Delivery","Future Delivery"],["Schedule for Tomorrow","Schedule for Tomorrow"]
  ];
}
function isDriverSettlementOrderPaid(o){
  // Use the driver-commission settlement fields, not generic cash-collection/payment flags.
  // Generic Paid flags can describe customer collection and must not keep the driver's
  // Cash/Credit controls visible after this order's driver settlement was saved.
  return o?.driver_settlement_paid===true || String(o?.commission_paid_status||'').trim().toLowerCase()==='paid' || Boolean(o?.commission_paid_at);
}
function driverSettlementEligibleOrderIds(){
  return (DRIVER_STATEMENT_CACHE?.orders||[]).filter(o=>{
    const flags=[o.commission_verify_status,o.verify_status,o.verification_status,o.accounting_status,o.approval_status].map(v=>String(v||'').trim().toLowerCase().replace(/[_-]+/g,' '));
    const approved=o.verify_status==='verified'||flags.some(v=>['verified','approved','تم الاعتماد','معتمد'].includes(v));
    const paid=isDriverSettlementOrderPaid(o);
    return approved&&!paid&&o.eligible!==false&&!o.statement_removed_at&&String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ')!=='in ops';
  }).map(o=>String(o.id)).filter(Boolean);
}
function renderDriverStatementRows(){
  const box=$("driverStatement"); if(!box||!DRIVER_STATEMENT_CACHE)return;
  const x=DRIVER_STATEMENT_CACHE, all=x.orders||[], filter=$("stmtVerify")?.value||'all', q=($("stmtSearch")?.value||'').trim().toLowerCase();
  const orders=all.filter(o=>{
    const text=[o.tracking_number,o.shipment_no,o.merchant_order_no,o.shipper_name,o.merchant_name,o.customer_name].join(' ').toLowerCase();
    if(q&&!text.includes(q))return false;
    if(filter==='verified'&&o.verify_status!=='verified')return false;
    if(filter==='unverified'&&(o.verify_status==='verified'||o.paid_status==='paid'))return false;
    if(filter==='paid'&&o.paid_status!=='paid')return false;
    if(filter==='unpaid'&&o.paid_status==='paid')return false;
    return true;
  });
  const tt=x.totals||{}, driver=x.driver||{}, expenses=x.expenses||[], settlements=x.settlements||[];
  const settlementDay=driverStatementSelectedDate();
  const settlementOrderIds=driverSettlementEligibleOrderIds();
  const showCashCredit=settlementOrderIds.length>0;
  // Play once when Cash/Credit controls transition from unavailable to available;
  // the render function runs often, so remember the previous state to avoid repeated tones.
  const cashCreditNowAvailable=Boolean(showCashCredit);
  if(cashCreditNowAvailable && window.__trendCashCreditWasAvailable!==true) playTrendWarningTone('warning');
  // Once the server marks every order Paid, the controls are removed on this render;
  // reset the edge detector so a later newly eligible order can announce availability.
  window.__trendCashCreditWasAvailable=cashCreditNowAvailable;
  // Lock only when a same-day settlement actually paid its referenced orders.
  // A partial/failed legacy save must not leave the button permanently disabled.
  const dailySettlementLocked=settlements.some(e=>{
    const note=String(e.notes||'');
    if(!note.startsWith('TDS_DRIVER_SETTLEMENT|')||driverSettlementCalendarDay(e.paid_at||e.created_at)!==settlementDay)return false;
    const ids=String(note.split('|')[2]||'').split(',').filter(Boolean);
    if(!ids.length)return true; // protect legacy rows without order references
    const orderById=new Map(all.map(o=>[String(o.id),o]));
    const referenced=ids.map(id=>orderById.get(String(id)));
    if(referenced.some(o=>!o))return true; // unknown/out-of-range order: do not risk duplicate settlement
    return referenced.some(o=>o.paid_status==='paid'||String(o.commission_paid_status||'').toLowerCase()==='paid');
  });
  const orderRows=orders.map(o=>{
    const state=o.paid_status==='paid'?'paid':(o.verify_status==='verified'?'verified':'unverified');
    const rowClass=state==='verified'||state==='paid'?'driver-row-green':'driver-row-red';
    const verifyCell=o.paid_status==='paid'?'<span class="verify-pill paid-pill">Paid</span>':o.verify_status==='verified'?`<button class="mini-btn danger verify-cancel-btn" onclick="unverifyOneDriverOrder('${esc(o.id)}')">${L("Cancel Approval","إلغاء الاعتماد")}</button>`:`<button class="mini-btn verify-btn" onclick="verifyOneDriverOrder('${esc(o.id)}','${esc(o.delivery_date||'')}')">${L("Approve","اعتماد")}</button>`;
    const opts=driverStatusOptions().map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("");
    return `<tr class="${rowClass}">
      <td><input class="driver-order-check" type="checkbox" value="${esc(o.id)}"></td>
      <td><b>${esc(o.tracking_number||'')}</b></td><td><div class="driver-order-ids-box"><b>${esc(o.shipment_no||'—')}</b><small>Order: ${esc(o.merchant_order_no||o.order_number||'—')}</small></div></td><td class="driver-job-code-cell" title="${esc(o.job_code||'')}">${esc(o.job_code||'—')}</td>
      <td>${esc(o.shipper_name||o.merchant_name||'')}</td><td>${money(o.delivery_fee||0,{withCode:false})}</td><td>${money(o.driver_amount??o.cod??o.value??o.order_value??o.price??0,{withCode:false})}</td><td><span class="driver-primary-status">${esc(o.original_status||o.invoice_status||(String(o.status||'').toLowerCase().replace(/[_-]+/g,' ')!=='return to origin'?o.status:'—'))}</span></td><td><span class="driver-sub-status">${esc(o.sub_status||o.secondary_status||o.substatus||o.return_status||'—')}</span></td><td><span class="driver-current-status">${esc(o.status||'')}</span></td>
      <td>${verifyCell}</td>
      <td><select class="mini-status-select" ${o.paid_status==='paid'?'disabled title="Paid orders are locked"':''} onchange="changeDriverOrderStatus('${esc(o.id)}',this.value);this.value=''"><option value="">Change Status</option>${opts}</select></td>
      <td><button class="mini-btn ghost" title="${esc(o.paid_status==='paid'?L('Paid: delivery fee only','بعد Paid: رسوم التوصيل فقط'):L('Edit order','تعديل الأوردر'))}" onclick="editDriverOrder('${esc(o.id)}',${Number(o.cod??o.value??o.order_value??o.price??0)},${Number(o.delivery_fee||0)},${o.paid_status==='paid'})">${t("Edit")}</button>
      <button class="mini-btn ghost" ${o.paid_status==='paid'?'disabled title="Paid orders are locked"':''} onclick="transferDriverOrder('${esc(o.id)}','${esc(driver.id)}')">${L("Transfer","Transfer")}</button><button class="mini-btn ghost" ${o.paid_status==='paid'?'disabled title="Paid orders are locked"':''} onclick="driverOrderOptions('${esc(o.id)}')">${L("Options","Options")}</button>
      ${o.paid_status==='paid'?'':`<button class="mini-btn danger" title="In Ops" onclick="removeDriverOrderToOps('${esc(o.id)}')">×</button>`}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div id="printDriverStatement" class="print-sheet">
    <div class="statement-head"><div><h3>${L("Driver Financial Statement","كشف المندوب المالي")}</h3><div>${L("Driver","المندوب")}: <b>${esc(driver.name||'')}</b> — ${L("Code","الكود")}: <b>${esc(driver.driver_no||'')}</b></div></div></div>
    <div class="driver-summary"><div class="stat"><span>${L("Order Count","عدد الأوردرات")}</span><b>${orders.length}</b></div><div class="stat"><span>${L("Approved Order Value","قيمة الأوردرات المعتمدة")}</span><b>${money(tt.orderTotal||0)}</b></div><div class="stat"><span>${L("Total Expenses","إجمالي المصروفات")}</span><b>${money(tt.expenseTotal||0)}</b></div><div class="stat"><span>${L("Amount Due","المطلوب دفعه")}</span><b>${money(tt.required||0)}</b></div></div>
    <div class="table-wrap driver-table-wrap"><table class="driver-statement-table"><thead><tr><th>Select</th><th>Tracking</th><th>Shipment / Order</th><th>Jop Cod</th><th>Shipper</th><th>Delivery Fee</th><th>Amount / COD</th><th>${L("Original Status","الحالة الأصلية")}</th><th>${L("Sub-status","الحالة الفرعية")}</th><th>${L("Current Status","الحالة الحالية")}</th><th>Verify</th><th>Change Status</th><th>Options</th></tr></thead><tbody>${orderRows||`<tr><td colspan="13" class="muted">${L("No orders","لا توجد أوردرات")}</td></tr>`}</tbody></table></div>
    <div class="driver-order-count">${L("Order Count","عدد الأوردرات")}: <b>${orders.length}</b></div>
    <h3>${L("Driver Expenses","مصروفات المندوب")}</h3>
    <div class="form-grid no-print" style="display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:8px;align-items:end"><label>${L("Type","النوع")}<select id="newExType"><option value="petrol">بنزين</option><option value="loading">تحميل</option><option value="parking">موقف</option><option value="other">مصروف آخر</option></select></label><label>${L("Category","التصنيف")}<select id="newExCategory"><option value="expense">Expense — مصروف</option><option value="shortage">Shortage — عجز</option></select></label><label>${L("Amount","المبلغ")} <small class="muted">${currencyInfo().symbol}</small><input id="newExAmount" type="number" step="0.01"></label><label>${L("Date","التاريخ")}<input id="newExDate" type="date" value=""></label><label>${L("Details","التفاصيل")}<input id="newExDetails"></label></div>
    <button class="no-print" onclick="addStatementExpense('${esc(driver.id)}')">${t("Save")}</button>
    ${expenses.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Details</th><th>Amount</th><th class="no-print">Edit/Delete</th></tr></thead><tbody>${expenses.map(e=>`<tr><td>${esc(e.expense_date||'')}</td><td>${esc(e.expense_type||'')}</td><td>${e.category==='shortage'?'Shortage':'Expense'}</td><td>${esc(e.details||e.notes||'')}</td><td>${money(e.amount||0)}</td><td class="no-print">${e.can_edit===false?`<span class="muted" title="${L('Locked after settlement','مقفل بعد التسوية')}">🔒</span>`:`<button class="mini-btn ghost" onclick='editStatementExpense(${JSON.stringify(e)})'>${t("Edit")}</button> <button class="mini-btn danger" onclick="deleteStatementExpense('${esc(e.id)}')">${L("Delete","حذف")}</button>`}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L("No expenses","لا توجد مصروفات")}</p>`}
    <div class="driver-totals"><div>${L("Expenses","المصروفات")}: <b>${money(tt.expenseTotal||0)}</b></div><div>${L("Shortage","العجز")}: <b>${money(tt.shortageTotal||0)}</b></div><div>${L("Amount Due","المطلوب دفعه")}: <b>${money(tt.required||0)}</b></div></div>
    <h3>${L("Driver Settlement","تسوية حساب المندوب")}</h3>
    <div class="muted" style="margin-bottom:8px">${L("Selected driver","المندوب المحدد")}: <b>${esc(driver.name||"—")}</b> ${driver.driver_no?`(${esc(driver.driver_no)})`:""}</div>
    <div class="driver-settlement-box">
      <div class="driver-settlement-total"><span>${L("Amount Due","المطلوب تسويته")}</span><b id="driverDueAmount" data-due-base="${Number(tt.required||0)}">${money(tt.required||0)}</b></div>
      <div class="form-grid no-print">
        ${showCashCredit?`<label>${L("Cash","كاش")}<input id="payCash" type="number" min="0" step="0.01" value="${moneyInput(tt.required||0)}" readonly aria-readonly="true" title="${L("Automatically calculated: Amount Due − Credit","يُحسب تلقائيًا: المستحق − الكريدت")}"></label>
        <label>${L("Credit","كريدت")}<input id="payCredit" type="number" min="0" step="0.01" value="" placeholder="0.00" inputmode="decimal" oninput="updateDriverSettlementBalance('payCredit')" onchange="updateDriverSettlementBalance('payCredit')"></label>`:''}
        <label>${L("Statement Date","تاريخ الكشف")}<input id="payDate" type="date" value="${esc(settlementDay)}" readonly aria-readonly="true" title="${L("Taken from the selected statement filter","يُحدد من تاريخ الفلتر الحالي للكشف")}" aria-label="${L("Selected statement date","تاريخ الكشف المحدد")}"></label>
      </div>
      <div class="driver-settlement-hint muted">${!showCashCredit?L("Cash / Credit controls appear when an approved, unpaid order is available for settlement.","أزرار الكاش والكريدت هتظهر لما يكون فيه أوردر معتمد وغير مدفوع متاح للتسوية."):dailySettlementLocked?L("This driver already has a Cash / Credit settlement for this day. A second settlement is locked.","تم عمل تسوية كاش / كريدت للمندوب في اليوم ده بالفعل، وتم قفل التسوية الثانية."):L("Amount stays fixed. Enter Credit and Cash is calculated automatically as Amount − Credit.","المبلغ ثابت. أدخل الكريدت وسيتم حساب الكاش تلقائيًا = المبلغ − الكريدت.")}</div>
      ${showCashCredit?`<div class="driver-settlement-actions"><button id="saveDriverSettlementBtn" class="no-print driver-settlement-save" data-settlement-locked="${dailySettlementLocked?'1':'0'}" ${dailySettlementLocked?'disabled':''} onclick="saveDriverSettlement('${esc(driver.id)}')">${L("Save Settlement","حفظ التسوية")}</button></div>`:''}
    </div>
    ${settlements.length?`<div class="driver-settlement-records"><div class="section-title-row"><h3>${L('Saved Settlements','التسويات المحفوظة')}</h3><span class="badge">${settlements.length}</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Bank</th><th>Reference</th><th>Employee</th><th>Action</th></tr></thead><tbody>${settlements.map((e,i)=>{const m=String(e.notes||'').match(/TDS_DRIVER_SETTLEMENT\|([^|]+)/);const gid=m?.[1]||'';const prior=gid&&settlements.slice(0,i).some(z=>String(z.notes||'').startsWith(`TDS_DRIVER_SETTLEMENT|${gid}|`));return `<tr><td>${esc(formatSystemDate(driverSettlementCalendarDay(e.paid_at||e.created_at)))}</td><td>${esc(String(e.notes||'').toLowerCase().includes('credit portion')?'credit':(e.payment_method||''))}</td><td>${money(e.amount||0)}</td><td>${esc(e.bank_name||'')}</td><td>${esc(e.transfer_reference||'')}</td><td>${esc(e.employee_name||e.employee_code||'')}</td><td>${gid&&!prior?`<button class="mini-btn driver-settlement-pdf-btn" onclick="printDriverSettlementPdf('${esc(gid)}')">PDF التسوية</button> <button class="mini-btn danger" onclick="cancelDriverSettlement('${esc(gid)}')">${L('Cancel settlement','إلغاء التسوية')}</button>`:'—'}</td></tr>`}).join('')}</tbody></table></div></div>`:''}
    <div class="print-signatures"><span>${L("Driver Signature","توقيع المندوب")}: __________________</span><span>${L("Employee Signature","توقيع الموظف")}: __________________</span></div>
    <div class="site-credit">Designed &amp; Developed by Mohamed Hoseany</div>
  </div>`;
  updateDriverSettlementBalance();
}
async function loadDriverStatement(){
  const id=$("stmtDriver")?.value;if(!id)return msg("driverStatement",L("Select driver first","اختر السائق أولاً"),"error");
  try{const d=await api(`/api/drivers/statement?driver_id=${encodeURIComponent(id)}&from=${encodeURIComponent($("stmtFrom").value)}&to=${encodeURIComponent($("stmtTo").value)}`);DRIVER_STATEMENT_CACHE=d.data;renderDriverStatementRows();}
  catch(e){msg("driverStatement",e.message,"error");}
}
async function driverOptions(){
  const ids=[...document.querySelectorAll(".driver-order-check:checked")].map(x=>x.value);
  if(!ids.length)return alert(L("Select orders first","اختر الأوردرات أولاً"));
  const action=await showInputModal(L("Options: 1 Transfer, 2 Change Status, 3 Edit","Options: 1 تحويل، 2 تغيير الحالة، 3 تعديل"));
  if(action==="1") return transferDriverOrder(ids[0],$("stmtDriver")?.value||"");
  if(action==="2") return changeDriverOrderStatus(ids[0],await showInputModal(L("Enter status","أدخل الحالة"),"In Ops"));
  if(action==="3"){
    const o=DRIVER_STATEMENT_CACHE?.orders?.find(x=>String(x.id)===String(ids[0]));
    if(o)return editDriverOrder(o.id,Number(o.value??o.cod??0),Number(o.delivery_fee||0));
  }
}
async function driverOrderOptions(orderId){
  const action=await showInputModal(L("Options: 1 Transfer, 2 Change Status, 3 Edit, 4 Return","Options: 1 تحويل، 2 تغيير الحالة، 3 تعديل، 4 Return"));
  if(action==="1") return transferDriverOrder(orderId,$("stmtDriver")?.value||"");
  if(action==="2") return changeDriverOrderStatus(orderId,await showInputModal(L("Enter status","أدخل الحالة"),"In Ops"));
  if(action==="4") return changeDriverOrderStatus(orderId,"Return by Driver");
  if(action==="3"){
    const o=DRIVER_STATEMENT_CACHE?.orders?.find(x=>String(x.id)===String(orderId));
    if(o)return editDriverOrder(o.id,Number(o.value??o.cod??0),Number(o.delivery_fee||0));
  }
}
function selectDriverOrders(){
  document.querySelectorAll(".driver-order-check").forEach(x=>x.checked=true);
}
async function changeDriverOrderStatus(orderId,action){
  if(!action)return;
  const extra={order_id:orderId,action,driver_id:$("stmtDriver")?.value||""};
  if(action==="Return by Driver"){
    const reason=await showInputModal(L("Return Reason","سبب رجوع الأوردر"),""); if(reason===null)return;
    if(!reason.trim())return alert(L("Return reason is required","سبب الرجوع مطلوب"));
    extra.return_reason=reason.trim();
    const date=await showInputModal(L("Next Delivery Date","تاريخ التسليم القادم"),daysFromToday(1)); if(!date)return;
    extra.scheduled_date=date;
  } else if(action==="Future Delivery"||action==="Location Change"){
    const date=await showInputModal(L("Scheduled Date","تاريخ التنفيذ"),$("stmtFrom")?.value||today()); if(!date)return;
    extra.scheduled_date=date;
    if(action==="Location Change"){
      const emirate=await showInputModal(L("Emirate","الإمارة"),""); if(emirate===null)return;
      const area=await showInputModal(L("Area","المنطقة"),""); if(area===null)return;
      extra.emirate_id=emirate; extra.area_id=area;
    }
  }
  try{await api("/api/driver/order-action",{method:"POST",body:JSON.stringify(extra)});await loadDriverStatement();if($("driverReturnPanel")&&!$("driverReturnPanel").classList.contains("hidden"))await showDriverReturn();}
  catch(e){alert(e.message);}
}
async function removeDriverOrderToOps(orderId){
  if(!await showConfirmModal(L("Move order to In Ops?","تحويل الأوردر إلى In Ops؟")))return;
  try{await api("/api/orders-verification/remove",{method:"POST",body:JSON.stringify({id:orderId})});await loadDriverStatement();}catch(e){alert(e.message);}
}
async function transferDriverOrder(orderId,fromDriverId){
  const opts=[...document.querySelectorAll("#stmtDriver option")].filter(o=>o.value&&o.value!==fromDriverId);
  const names=opts.map(o=>o.textContent.trim()).join("\n");
  const to=await showInputModal(L("Transfer to driver ID/name","اختر المندوب الجديد (الاسم أو ID)")+`\n${names}`);
  if(!to)return;
  const target=opts.find(o=>o.value===to||o.textContent.trim()===to||o.textContent.includes(to));
  if(!target)return alert(L("Driver not found","المندوب غير موجود"));
  try{await api("/api/driver/transfer-order",{method:"POST",body:JSON.stringify({order_id:orderId,from_driver_id:fromDriverId,to_driver_id:target.value})});await loadDriverStatement();}
  catch(e){alert(e.message);}
}
async function driverReturnsPage(c){
  const from=daysAgo(30), to=today();
  c.innerHTML=`<div class="panel driver-returns-page-panel">
    <div class="section-title-row driver-returns-page-heading"><h2>${L("Return by Driver","إرجاع بواسطة السائق")}</h2></div>
    <div class="driver-returns-filter-row">
      <label>${L("From Date","من تاريخ")}<input id="rbdFrom" dir="ltr" lang="en" type="date" value="${from}"></label>
      <label>${L("To Date","إلى تاريخ")}<input id="rbdTo" dir="ltr" lang="en" type="date" value="${to}"></label>
      <label>${L("Emirate","الإمارة")}<select id="rbdEmirate" onchange="filterDriverReturnsTable()"><option value="">${L("All emirates","كل الإمارات")}</option></select></label>
      <label>${L("Region","المنطقة")}<select id="rbdArea" onchange="filterDriverReturnsTable()"><option value="">${L("All regions","كل المناطق")}</option></select></label>
      <label>${L("Driver","المندوب")}<select id="rbdDriver" onchange="filterDriverReturnsTable()"><option value="">${L("All drivers","كل المندوبين")}</option></select></label>
      <button class="driver-returns-show-button" type="button" onclick="loadDriverReturnsPage()">${L("Show","عرض")}</button>
    </div>
    <div id="driverReturnsTable" class="table-wrap">${L("Loading...","جارٍ التحميل...")}</div>
  </div>`;
  await loadDriverReturnsPage();
}
async function showDriverReturnTimeline(orderId, tracking){
  try{
    const d=await api(`/api/orders/${encodeURIComponent(orderId)}`);
    const x=d.data||{};
    const history=[...(x.history||[]),...(x.audit||[])].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    document.getElementById('driverReturnTimelineDialog')?.remove();
    const rows=history.map((r,i)=>`<div class="shipment-timeline-item ${i===history.length-1?'current':''}"><div class="shipment-timeline-dot"></div><div class="shipment-timeline-content"><div class="shipment-timeline-top"><b>${esc(movementHistoryLabel(r.status||r.action||L('Update','تحديث')))}</b><span>${esc(String(r.created_at||'').replace('T',' ').slice(0,19))}</span></div><div class="muted">${esc(r.user_name||r.employee_name||r.employee_code||'System')}${r.note||r.notes||r.comment?` — ${esc(r.note||r.notes||r.comment)}`:''}</div></div></div>`).join('');
    const box=document.createElement('div');
    box.id='driverReturnTimelineDialog'; box.className='modal-backdrop';
    box.innerHTML=`<div class="modal"><div class="section-title-row"><div><h3>${L('Return by Driver Timeline','الخط الزمني لإرجاع المندوب')}</h3><p class="muted">${esc(tracking||x.order?.tracking_number||'')}</p></div><button class="ghost" onclick="document.getElementById('driverReturnTimelineDialog')?.remove()">✕</button></div><div class="shipment-timeline">${rows||`<p class="muted">${L('No timeline history found.','لا يوجد سجل زمني لهذا الأوردر.')}</p>`}</div></div>`;
    document.body.appendChild(box);
  }catch(e){alert(e.message);}
}

async function loadDriverReturnsPage(){
  const box=$('driverReturnsTable'); if(!box)return;
  try{
    const from=$('rbdFrom')?.value||'', to=$('rbdTo')?.value||'';
    const d=await api(`/api/return-by-driver?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const rows=d.data||[];window.__driverReturnRows=rows;
    window.__driverReturnFilterData=d.filters||{};
    const localName=x=>LANG==='ar'?(x.name_ar||x.name_en||x.name||''):(x.name_en||x.name_ar||x.name||'');
    const fill=(id,values,label,keep=true)=>{const el=$(id);if(!el)return;const old=keep?el.value:'';const uniq=[...new Map((values||[]).filter(v=>v&&v.id!=null).map(v=>[String(v.id),{id:String(v.id),name:String(v.name||v.id)}])).values()];el.innerHTML=`<option value="">${label}</option>`+uniq.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old;};
    const meta=window.__driverReturnFilterData;
    fill('rbdEmirate',(meta.governorates||[]).map(x=>({id:x.id,name:localName(x)})),L('All emirates','كل الإمارات'));
    const areas=(meta.areas||[]).filter(x=>!$('rbdEmirate')?.value||String(x.governorate_id||'')===String($('rbdEmirate').value));
    fill('rbdArea',areas.map(x=>({id:x.id,name:localName(x)})),L('All regions','كل المناطق'));
    fill('rbdDriver',(meta.drivers||[]).map(x=>({id:x.id,name:(x.name||'')+(x.driver_no?' — '+x.driver_no:'')})),L('All drivers','كل المندوبين'));
    filterDriverReturnsTable();
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function filterDriverReturnsTable(){
  const box=$('driverReturnsTable');if(!box)return;
  const em=$('rbdEmirate')?.value||'',area=$('rbdArea')?.value||'',driver=$('rbdDriver')?.value||'';
  const meta=window.__driverReturnFilterData||{};
  const areas=(meta.areas||[]).filter(x=>!em||String(x.governorate_id||'')===em);
  const areaEl=$('rbdArea');
  if(areaEl){const old=areaEl.value;const valid=new Set(areas.map(x=>String(x.id)));const label=LANG==='ar'?'كل المناطق':'All regions';areaEl.innerHTML=`<option value="">${label}</option>`+areas.map(x=>`<option value="${esc(x.id)}">${esc(LANG==='ar'?(x.name_ar||x.name_en||''):(x.name_en||x.name_ar||''))}</option>`).join('');if(valid.has(old))areaEl.value=old;}
  const rows=(window.__driverReturnRows||[]).filter(r=>(!em||String(r.governorate_id||r.emirate_id||'')===em)&&(!area||String(r.area_id||'')===area)&&(!driver||String(r.driver_id||'')===driver));
  if(!rows.length){box.innerHTML=`<p class="muted">${L('No Return by Driver orders match these filters.','لا توجد شحنات مطابقة للفلاتر المحددة.')}</p>`;return;}
  box.innerHTML=`<table class="compact-table driver-returns-table"><thead><tr><th>${L('Order / Shipment','رقم الأوردر / الشحنة')}</th><th>${L('Shipper','الشاحن')}</th><th>${L('Customer Name','اسم العميل')}</th><th>${L('Customer Phone','هاتف العميل')}</th><th>${L('COD','COD')}</th><th>${L('Driver','المندوب')}</th><th>${L('Return Type','نوع الإرجاع')}</th><th>${L('In Ops Date','تاريخ In Ops')}</th><th>${L('Area','المنطقة')}</th><th>${L('Jop Cod','Jop Cod')}</th><th>${L('New Job Code','كود المهمة الجديد')}</th></tr></thead><tbody>${rows.map(r=>{const sid=String(r.shipment_id||'');const codeInput=`<input class="mini-input rbd-job-code" data-shipment-id="${esc(sid)}" value="" placeholder="New Job Code" inputmode="text" aria-label="New Job Code">`;return `<tr><td><div class="rbd-order-box"><b>${esc(r.order_number||'')}</b><small>${esc(r.tracking_number||'')}</small></div></td><td>${esc(r.shipper_name||'')}</td><td class="rbd-customer-name">${esc(r.customer_name||'')}</td><td>${esc(r.customer_phone||'')}</td><td>${esc(money(r.cod||0,{withCode:false,digits:0}))}</td><td>${esc(r.driver_name||'')}${r.driver_no?`<br><small class="muted">${esc(r.driver_no)}</small>`:''}</td><td><span class="badge">${esc(r.return_type||r.status||'Return by Driver')}</span>${r.return_reason?`<br><small class="muted">${esc(r.return_reason)}</small>`:''}</td><td><input class="mini-input rbd-return-date" data-shipment-id="${esc(sid)}" type="date" value="${today()}" aria-label="${L('In Ops Date','تاريخ In Ops')}"></td><td>${esc(r.area_name||'N/A')}</td><td>${esc(r.jop_cod||r.existing_job_code||r.job_code||'N/A')}</td><td>${codeInput}</td></tr>`;}).join('')}</tbody></table><div class="rbd-save-all-wrap"><button type="button" class="primary rbd-save-all" onclick="saveAllReturnByDriverJobCodes()">${L('Save all changes','حفظ كل التعديلات')}</button></div>`;
}
function toggleReturnDriverActions(orderId){
  const el=document.getElementById(`rbd-actions-${CSS.escape(String(orderId))}`);
  if(el) el.classList.toggle('hidden');
}

async function saveAllReturnByDriverJobCodes(){
  const inputs=[...document.querySelectorAll('#driverReturnsTable .rbd-job-code')];
  const pending=inputs.map(input=>({shipmentId:input.dataset.shipmentId,jobCode:(input.value||'').trim(),dateInput:document.querySelector(`.rbd-return-date[data-shipment-id="${CSS.escape(String(input.dataset.shipmentId))}"]`),input})).filter(x=>x.jobCode);
  if(!pending.length)return alert(L('Enter a New Job Code first. The In Ops Date is applied when the order moves to In Ops.','اكتب كود المهمة الجديد أولاً؛ تاريخ In Ops يُطبّق عند تحويل الأوردر إلى In Ops.'));
  const seen=new Set();
  for(const item of pending){
    const key=item.jobCode.toLowerCase();
    if(seen.has(key))return alert(L('Duplicate New Job Code in this table','يوجد كود مهمة مكرر داخل الجدول'));
    seen.add(key);
  }
  const button=document.querySelector('#driverReturnsTable .rbd-save-all');
  if(button){button.disabled=true;button.textContent=L('Saving...','جارٍ الحفظ...');}
  const failures=[];let saved=0;
  for(const item of pending){
    try{await api('/api/shipments/job-code',{method:'POST',body:JSON.stringify({shipment_id:item.shipmentId,new_job_code:item.jobCode,date:item.dateInput?.value||today()})});saved++;}
    catch(e){failures.push(`${item.jobCode}: ${e.message}`);}
  }
  if(typeof loadShipments==='function'&&saved)await loadShipments();
  await loadDriverReturnsPage();
  const notice=document.createElement('div');notice.className=failures.length?'msg error':'msg ok';notice.style.cssText='margin:6px 2px;padding:8px 10px;border-radius:6px;font-weight:700';notice.textContent=failures.length?`${L('Saved','تم الحفظ')}: ${saved} — ${L('Failed','فشل')}: ${failures.length} (${failures.map(x=>x.split(':')[0]).join('، ')})`:L('Saved','تم الحفظ');const target=document.querySelector('#driverReturnsTable');if(target)target.prepend(notice);
}
async function saveReturnByDriverJobCode(shipmentId){
  const input=document.querySelector(`.rbd-job-code[data-shipment-id="${CSS.escape(String(shipmentId))}"]`);
  if(input)input.focus();
  return saveAllReturnByDriverJobCodes();
}

async function showDriverReturn(){
  const driver=$("stmtDriver")?.value;if(!driver)return alert(L("Select driver first","اختر السائق أولاً"));
  const date=$("stmtFrom")?.value||today(), panel=$("driverReturnPanel"); if(!panel)return;
  panel.classList.remove("hidden"); panel.innerHTML=`<div class="panel"><h3>${L("Return","Return")}</h3><p class="muted">${L("Orders due for action today","الأوردرات التي حان موعدها اليوم")}</p><div class="table-wrap"><table><thead><tr><th>Tracking</th><th>Order</th><th>Status</th><th>Action</th></tr></thead><tbody><tr><td colspan="4" class="muted">${L("Loading...","جارٍ التحميل...")}</td></tr></tbody></table></div></div>`;
  try{
    const d=await api(`/api/driver/return-orders?driver_id=${encodeURIComponent(driver)}&date=${encodeURIComponent(date)}`);
    const rows=d.data||[];
    panel.querySelector("tbody").innerHTML=rows.length?rows.map(o=>`<tr><td>${esc(o.tracking_number||"")}</td><td>${esc(o.merchant_order_no||o.order_code||o.id)}</td><td>${esc(o.status||"")}</td><td>${esc(o.return_reason||"")}</td></tr>`).join(""):`<tr><td colspan="4" class="muted">${L("No return orders","لا توجد أوردرات Return اليوم")}</td></tr>`;
  }catch(e){panel.innerHTML=`<div class="panel error">${esc(e.message)}</div>`;}
}
function exportDriverStatementExcel(){
  const rows=DRIVER_STATEMENT_CACHE?.orders||[];
  exportRowsExcel(rows.map(o=>({tracking_number:o.tracking_number||"",shipment_no:o.shipment_no||"",merchant_order_no:o.merchant_order_no||"",shipper:o.shipper_name||"",delivery_fee:Number(o.delivery_fee||0),cod:Number(o.value??o.cod??0),status:o.status||"",verify:o.verify_status||""})),"driver-statement");
}

async function verifyOneDriverOrder(id,deliveryDate){
  try{const verifyDate=deliveryDate||$("stmtFrom")?.value||today();await api('/api/driver-commission/verify',{method:'POST',body:JSON.stringify({order_ids:[id],verify_date:verifyDate})});await loadDriverStatement();}
  catch(e){alert(e.message);}
}
async function unverifyOneDriverOrder(id){
  if(!await showConfirmModal(L("Cancel approval for this order?","هل تريد إلغاء اعتماد هذا الأوردر؟")))return;
  try{await api('/api/driver-commission/unverify',{method:'POST',body:JSON.stringify({order_id:id})});await loadDriverStatement();}
  catch(e){alert(e.message);}
}
async function editDriverOrder(id,cod,fee,isPaid=false){
  let newCod=null;
  if(!isPaid){newCod=await showInputModal(L('Amount / COD','المبلغ / COD'),moneyInput(cod));if(newCod===null)return;}
  const newFee=await showInputModal(isPaid?L('Paid order — Delivery Fee only','أوردر Paid — رسوم التوصيل فقط'):L('Delivery Fee','رسوم التوصيل'),moneyInput(fee));if(newFee===null)return;
  const payload={id,delivery_fee:baseAmount(newFee)};
  if(!isPaid)payload.cod=baseAmount(newCod);
  try{await api('/api/driver-statement/order',{method:'PATCH',body:JSON.stringify(payload)});await loadDriverStatement();}
  catch(e){alert(e.message);}
}
async function verifySelectedDriverOrders(driverId){const ids=[...document.querySelectorAll('.commission-check:checked')].map(x=>x.value);if(!ids.length)return alert(L('Select orders first','اختر الأوردرات أولاً'));try{await api('/api/driver-commission/verify',{method:'POST',body:JSON.stringify({driver_id:driverId,statement_date:$('ovStatementDate')?.value||today(),order_ids:ids})});await loadDriverStatement();}catch(e){alert(e.message);}}
async function payVerifiedDriverOrders(driverId,method){const ids=[...document.querySelectorAll('.commission-check:checked')].map(x=>x.value);if(!ids.length)return alert(L('Select verified orders first','اختر الأوردرات التي تم Verify لها أولاً'));try{const d=await api('/api/driver-commission/pay',{method:'POST',body:JSON.stringify({driver_id:driverId,order_ids:ids,payment_method:method,payment_date:today()})});alert(`${L("Paid","تمت التسوية")}: ${money(d.data?.amount||0)}`);await loadDriverStatement();}catch(e){alert(e.message);}}
function toggleAllCommission(el){document.querySelectorAll('.commission-check:not(:disabled)').forEach(x=>x.checked=el.checked);}
async function addStatementExpense(driverId){try{const selectedDriver=$('stmtDriver')?.value||driverId||'';if(!selectedDriver)return alert(L('Select driver first','اختر المندوب من أعلى الصفحة أولاً'));const amount=baseAmount($('newExAmount')?.value||0);if(amount<=0)return alert(L('Enter a valid expense amount','أدخل مبلغ مصروف صحيح'));await api('/api/expenses',{method:'POST',body:JSON.stringify({driver_id:selectedDriver,expense_type:$('newExType').value,category:$('newExCategory').value,amount,expense_date:$('newExDate').value||today(),details:$('newExDetails').value})});await loadDriverStatement();}catch(e){alert(e.message);}}
async function editStatementExpense(e){if(e?.can_edit===false)return alert(L('This expense is locked after settlement','المصروف مقفول بعد التسوية'));const category=await showInputModal(L('Category: expense or shortage','التصنيف: مصروف أو عجز'),e.category==='shortage'?'shortage':'expense');if(category===null)return;const details=await showInputModal(L('Details','التفاصيل'),e.details||e.notes||'');if(details===null)return;try{await api('/api/accounting/driver-expenses',{method:'PATCH',body:JSON.stringify({id:e.id,category:String(category).toLowerCase()==='shortage'?'shortage':'expense',details})});await loadDriverStatement();}catch(err){alert(err.message);}}
async function deleteStatementExpense(id){if(!await showConfirmModal(L('Delete expense?','حذف المصروف؟')))return;try{await api('/api/accounting/driver-expenses',{method:'DELETE',body:JSON.stringify({id})});await loadDriverStatement();}catch(e){alert(e.message);}}
async function openOrderEdit(id){show('search');setTimeout(()=>{const el=$('searchQ');if(el){el.value=id;doSearch();}},100);}
function updateDriverSettlementBalance(changedField){
  // Cash is automatically calculated as Amount Due minus Credit; Credit is the only editable settlement amount.
  const dueNode=$("driverDueAmount");
  const rate=Number(currencyInfo()?.rate||1)||1;
  const dueBase=Number(dueNode?.dataset?.dueBase);
  const amount=Math.max(0,Number((((Number.isFinite(dueBase)?dueBase:0)*rate)).toFixed(2)));
  const cashEl=$("payCash"),creditEl=$("payCredit");
  if(!cashEl||!creditEl)return;
  let credit=Math.max(0,settlementDisplayNumber(creditEl.value));
  credit=Math.min(amount,Number(credit.toFixed(2)));
  if(changedField==='payCredit' && settlementDisplayNumber(creditEl.value)>amount) creditEl.value=amount.toFixed(2);
  const cash=Math.max(0,Number((amount-credit).toFixed(2)));
  cashEl.value=cash.toFixed(2);
  const save=$("saveDriverSettlementBtn");
  if(save&&save.dataset.settlementLocked!=='1')save.disabled=amount<=0||credit<0||credit>amount;
}

// Delegated listeners survive statement re-renders and do not rewrite either input.
if(!window.__driverSettlementBalanceListener){window.__driverSettlementBalanceListener=true;document.addEventListener('input',e=>{if(['payCash','payCredit'].includes(e.target?.id))updateDriverSettlementBalance(e.target.id);});}
// The settlement date stays selectable even when one date is locked. Re-render the lock state for the newly selected calendar day.
if(!window.__driverSettlementDateListener){window.__driverSettlementDateListener=true;document.addEventListener('change',e=>{if(e.target?.id==='payDate'&&DRIVER_STATEMENT_CACHE)renderDriverStatementRows();});}
if(!window.__driverSettlementBlurListener){window.__driverSettlementBlurListener=true;document.addEventListener('focusout',e=>{if(['payCash','payCredit','ovSettlementCash','ovSettlementCredit'].includes(e.target?.id)&&e.target.value.trim()!==''){const n=e.target.id==='payCredit'?settlementDisplayNumber(e.target.value):Number(e.target.value);if(Number.isFinite(n))e.target.value=Math.max(0,n).toFixed(2);if(e.target.id.startsWith('ovSettlement'))updateOrdersVerificationSettlementBalance();else updateDriverSettlementBalance();}});}
async function saveDriverSettlement(driverId){try{
  updateDriverSettlementBalance();
  if($('saveDriverSettlementBtn')?.disabled){const locked=$('saveDriverSettlementBtn')?.dataset?.settlementLocked==='1';return alert(locked?L('A Cash / Credit settlement already exists for this driver on the selected date.','تم عمل تسوية كاش / كريدت للمندوب في التاريخ المحدد بالفعل.'):L('There is no amount to settle.','لا يوجد مبلغ للتسوية'));}
  driverId=$('stmtDriver')?.value||driverId||'';if(!driverId)return alert(L('Select driver first','اختر المندوب من أعلى الصفحة أولاً'));
  const dueNode=$("driverDueAmount");
  const rate=Number(currencyInfo()?.rate||1)||1;
  // Keep preview and save validation on the exact same visible Amount Due.
  // Convert to base currency only for the API payload.
  const dueBase=Number(dueNode?.dataset?.dueBase);
  const displayedDue=Math.max(0,Number((((Number.isFinite(dueBase)?dueBase:0)*rate)).toFixed(2)));
  const due=Number((Number.isFinite(dueBase)?dueBase:baseAmount(displayedDue)).toFixed(2));
  const displayDue=Number(displayedDue.toFixed(2));
  const creditDisplay=Math.max(0,settlementDisplayNumber($('payCredit')?.value||0));
  if(displayDue<=0)return alert(L('There is no amount to settle','لا يوجد مبلغ للتسوية'));
  if(creditDisplay>displayDue+0.01)return alert(`${L('Credit cannot exceed Amount Due','الكريدت لا يمكن أن يتجاوز المبلغ المستحق')}: ${money(displayDue)}`);
  const cashDisplay=Math.max(0,Number((displayDue-creditDisplay).toFixed(2)));
  if($('payCash'))$('payCash').value=cashDisplay.toFixed(2);
  const cash=baseAmount(cashDisplay),credit=baseAmount(creditDisplay),total=Number((cash+credit).toFixed(2));
  // Submit only the approved, unpaid, eligible orders actually shown for this statement.
  // Previously cancelled/return/in-ops rows could be included in order_ids and make the API reject the whole save.
  const orderIds=driverSettlementEligibleOrderIds();
  if(!orderIds.length)return alert(L('No approved, unpaid, eligible orders are available for this statement.','لا توجد أوردرات معتمدة وغير مدفوعة ومؤهلة للتسوية في الكشف الحالي.'));
  const body={driver_id:driverId,order_ids:orderIds,statement_from:$('stmtFrom')?.value||today(),statement_to:$('stmtTo')?.value||today(),cash_amount:cash,credit_amount:credit,amount:total,expected_due:due,paid_at:driverStatementSelectedDate()};
  await api('/api/driver-settlements',{method:'POST',body:JSON.stringify(body)});alert(L('Settlement saved successfully','تم حفظ التسوية بنجاح'));await loadDriverStatement();
}catch(e){alert(e.message);}}

function printDriverSettlementPdf(groupId){
  const cache=DRIVER_STATEMENT_CACHE;if(!cache)return alert('بيانات كشف المندوب غير متاحة');
  const rows=cache.settlements||[];const groupRows=rows.filter(r=>{const m=String(r.notes||'').match(/^TDS_DRIVER_SETTLEMENT\|([^|]+)/);return m&&m[1]===String(groupId)});
  if(!groupRows.length)return alert('لم يتم العثور على تفاصيل التسوية');
  const first=groupRows[0],match=String(first.notes||'').match(/^TDS_DRIVER_SETTLEMENT\|[^|]+\|([^|]*)\|/),ids=(match?.[1]||'').split(',').map(x=>x.trim()).filter(Boolean);
  const eligible=(cache.orders||[]).filter(o=>ids.includes(String(o.id))&&String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ')==='delivered');
  const cash=groupRows.filter(r=>String(r.notes||'').toLowerCase().includes('cash portion')).reduce((a,r)=>a+Number(r.amount||0),0);
  const credit=groupRows.filter(r=>String(r.notes||'').toLowerCase().includes('credit portion')).reduce((a,r)=>a+Number(r.amount||0),0);
  const total=Number((cash+credit).toFixed(2));
  const paidDate=String(first.paid_at||first.created_at||'').slice(0,10);
  const employee=first.employee_name||first.employee_code||'—';
  const expenses=(cache.expenses||[]).filter(e=>String(e.expense_date||e.created_at||'').slice(0,10)===paidDate);
  const expenseTotal=expenses.filter(e=>String(e.category||'').toLowerCase()!=='shortage').reduce((a,e)=>a+Number(e.amount||0),0);
  const shortageTotal=expenses.filter(e=>String(e.category||'').toLowerCase()==='shortage').reduce((a,e)=>a+Number(e.amount||0),0);
  const orderHtml=eligible.map(o=>`<tr><td>${esc(o.tracking_number||'')}</td><td>${esc(o.shipment_no||o.merchant_order_no||'')}</td><td>${esc(o.customer_name||'')}</td><td>${esc(o.shipper_name||o.merchant_name||'')}</td><td>${esc(o.status||'')}</td><td>${money(o.delivery_fee||0)}</td></tr>`).join('')||`<tr><td colspan="6" style="text-align:center">لا توجد أوردرات مسلّمة مؤهلة ضمن هذه التسوية</td></tr>`;
  const expenseHtml=expenses.map(e=>`<tr><td>${esc(e.expense_date||'')}</td><td>${esc(e.expense_type||'')}</td><td>${esc(e.details||e.notes||'')}</td><td>${money(e.amount||0)}</td></tr>`).join('')||`<tr><td colspan="4" style="text-align:center">لا توجد مصروفات مسجلة في هذا التاريخ</td></tr>`;
  const w=window.open('','_blank','width=1000,height=800');if(!w)return alert('اسمح بفتح النوافذ المنبثقة لطباعة PDF');
  const brand=COMPANY_BRANDING.name||'Delivery';const logo=COMPANY_BRANDING.logo_url||'/trend-logo.jpeg';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مختصر تسوية المندوب - ${esc(cache.driver?.name||'')}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#182033;font-size:11px;margin:0}.head{display:flex;align-items:center;gap:12px;border-bottom:3px solid #bd9a52;padding-bottom:10px;margin-bottom:14px}.head img{width:76px;height:45px;object-fit:contain}.brand{font-size:17px;font-weight:900}.title{font-size:18px;font-weight:900;margin:8px 0}.sub{font-size:11px;color:#475569;line-height:1.9}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0}.kpi{border:1px solid #d6dbe4;border-radius:8px;padding:9px;background:#f8fafc}.kpi span{display:block;color:#5b6473;font-size:10px;margin-bottom:5px}.kpi b{font-size:14px}h3{font-size:13px;margin:14px 0 6px;border-right:3px solid #bd9a52;padding-right:7px}table{width:100%;border-collapse:collapse;margin:6px 0 12px}th,td{border:1px solid #cbd1da;padding:6px;text-align:right}th{background:#17263c;color:#fff}tfoot td{font-weight:900;background:#f1f5f9}.sign{display:flex;justify-content:space-between;gap:20px;margin-top:30px}.sign div{width:48%;border-top:1px solid #777;padding-top:8px;text-align:center;font-weight:800}.note{font-size:9px;color:#64748b;margin-top:12px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="head"><img src="${esc(logo)}"><div><div class="brand">${esc(brand)}</div><div class="title">مختصر تسوية المندوب</div><div class="sub">المندوب: <b>${esc(cache.driver?.name||'—')}</b> ${cache.driver?.driver_no?`— الكود: ${esc(cache.driver.driver_no)}`:''}<br>موظف التسوية: <b>${esc(employee)}</b><br>تاريخ التسوية: <b>${esc(paidDate||'—')}</b></div></div></div><div class="kpis"><div class="kpi"><span>إجمالي التسوية</span><b>${money(total)}</b></div><div class="kpi"><span>Cash</span><b>${money(cash)}</b></div><div class="kpi"><span>Credit</span><b>${money(credit)}</b></div><div class="kpi"><span>الأوردرات المسلّمة المؤهلة</span><b>${eligible.length}</b></div></div><h3>الأوردرات المسلّمة المؤهلة للتسوية</h3><table><thead><tr><th>Tracking</th><th>Shipment / Order</th><th>العميل</th><th>التاجر</th><th>الحالة</th><th>رسوم التوصيل</th></tr></thead><tbody>${orderHtml}</tbody></table><h3>المصروفات والعجز بتاريخ التسوية</h3><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>${expenseHtml}</tbody><tfoot><tr><td colspan="3">إجمالي المصروفات</td><td>${money(expenseTotal)}</td></tr><tr><td colspan="3">إجمالي العجز</td><td>${money(shortageTotal)}</td></tr></tfoot></table><div class="sign"><div>توقيع المندوب<br><br>________________________</div><div>توقيع موظف التسوية<br><br>________________________</div></div><div class="note">تم إنشاء هذا الملخص من بيانات التسوية المحفوظة في النظام.</div><script>window.onload=()=>setTimeout(()=>window.print(),250);</script></body></html>`);w.document.close();
}
async function cancelDriverSettlement(groupId){if(!await showConfirmModal(L('Do you want to cancel?','هل تريد الإلغاء؟')))return;try{await api('/api/driver-settlements/cancel',{method:'POST',body:JSON.stringify({group_id:groupId,driver_id:$('stmtDriver')?.value||''})});alert(L('Settlement cancelled','تم إلغاء التسوية'));await loadDriverStatement();}catch(e){alert(e.message);}}

let ovSavedSettlementsCache=[];
async function loadOrdersVerificationSavedSettlementsAll(){
  try{
    const d=await api('/api/accounting/driver-expenses-summary');
    const drivers=Array.isArray(d.data)?d.data:[];
    ovSavedSettlementsCache=drivers.flatMap(row=>(Array.isArray(row.settlements)?row.settlements:[]).map(st=>({...st,driver_id:row.driver_id,driver_name:row.driver_name,driver_no:row.driver_no})));
    renderOrdersVerificationSavedSettlementsAll(ovSavedSettlementsCache);
    return drivers;
  }catch(e){console.warn('Could not refresh saved driver settlements',e);return null;}
}
function renderOrdersVerificationSavedSettlementsAll(rows){
  const box=$("ovSavedSettlements");if(!box)return;
  // Saved settlements shown here must follow the exact statement date selected in the page filters.
  const selectedDate=$('ovStatementDate')?.value||today();
  const list=(rows||[]).filter(st=>driverSettlementCalendarDay(st.paid_at||st.created_at)===selectedDate).slice().sort((a,b)=>String(b.paid_at||b.created_at||'').localeCompare(String(a.paid_at||a.created_at||'')));
  if(!list.length){box.innerHTML=`<h4 style="margin:8px 0">${L('Saved Settlements','التسويات المحفوظة')}</h4><p class="muted">${L('No saved settlements yet','لا توجد تسويات محفوظة حتى الآن')}</p>`;return;}
  const byDay=new Map();for(const st of list){const day=String(st.paid_at||st.created_at||'').slice(0,10)||'—';if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(st);}
  box.innerHTML=`<h4 style="margin:8px 0">${L('Saved Settlements','التسويات المحفوظة')} <span class="badge">${list.length}</span></h4>${[...byDay.entries()].map(([day,items])=>`<section class="ov-settlement-date-group"><h4 class="ov-settlement-date-heading">${L('Statement date','تاريخ الكشف')}: ${esc(day)}</h4><div class="ov-saved-settlement-list">${items.map(st=>`<div class="panel ov-saved-settlement-row"><span>${L('Date','التاريخ')}: <b>${esc(String(st.paid_at||st.created_at||'').replace('T',' ').slice(0,10)||'—')}</b></span><span>${L('Driver','المندوب')}: <b>${esc(st.driver_name||'—')}</b></span><span>${L('Driver code','كود المندوب')}: <b>${esc(st.driver_no||'—')}</b></span><span>${L('Cash','الكاش')}: <b>${money(st.cash_amount||0)}</b></span><span>${L('Credit','الكريديت')}: <b>${money(st.credit_amount||0)}</b></span><span>${L('Total settlement','إجمالي التسوية')}: <b>${money(st.total??(Number(st.cash_amount||0)+Number(st.credit_amount||0)))}</b></span><span>${L('Delivery orders','أوردرات التسليم')}: <b>${Number(st.order_count||0)}</b></span><span>${L('Approved / Paid','الأوردرات المعتمدة Paid')}: <b>${Number(st.paid_order_count||0)}</b></span><button type="button" class="mini-btn danger ov-cancel-saved-settlement" title="${L('Cancel settlement','إلغاء التسوية')}" aria-label="${L('Cancel settlement','إلغاء التسوية')}" onclick="cancelOrdersVerificationSettlement('${esc(st.group_id)}','${esc(st.driver_id)}')">×</button></div>`).join('')}</div></section>`).join('')}`;
}
function syncOrdersVerificationSettlementLock(){
  const driver=$("ovDriver")?.value||'';
  const statementDate=$('ovStatementDate')?.value||today();
  // Only a settlement whose linked orders are actually marked Paid should lock this date.
  // An incomplete/partial saved record must not show the "already settled" message.
  const locked=Boolean(driver&&ovSavedSettlementsCache.some(st=>{
    if(String(st.driver_id)!==String(driver)||driverSettlementCalendarDay(st.paid_at||st.created_at)!==statementDate)return false;
    const orderCount=Number(st.order_count||0),paidCount=Number(st.paid_order_count||0);
    return paidCount>0&&(!orderCount||paidCount>=orderCount);
  }));
  const open=$("openSettlementModalBtn");if(open){open.disabled=!driver||locked;open.title=locked?L('Cancel the saved settlement before creating another','ألغِ التسوية المحفوظة قبل إجراء تسوية جديدة'):'';}
  const save=$("ovSettlementSave");if(save){save.dataset.settlementLocked=locked?'1':'0';if(locked)save.disabled=true;else updateOrdersVerificationSettlementBalance();}
  for(const id of ['ovSettlementCash','ovSettlementCredit']){const el=$(id);if(el)el.disabled=locked;}
  if($('ovSettlementMsg')){
    if(locked)msg('ovSettlementMsg',L('This driver already has a saved settlement. Cancel it below before settling again.','لدى هذا المندوب تسوية محفوظة بالفعل. ألغِها من السجل بالأسفل قبل إجراء تسوية جديدة.'),'ok');
    else msg('ovSettlementMsg','','');
  }
}
async function loadOrdersVerificationSettlement(){
  const allDriversPromise=loadOrdersVerificationSavedSettlementsAll();
  const driver=$("ovDriver")?.value||"";
  if(!driver){
    await allDriversPromise;
    syncOrdersVerificationSettlementLock();
    for(const id of ["ovCashCollectedTotal","ovCashExpenseTotal","ovNetCashTotal","ovPreviousSettlements","ovSettlementDue","ovSettlementCash","ovSettlementCredit","ovSettlementBalance"]){const el=$(id);if(el){el.value=id==="ovSettlementCredit"?"":money(0);if(id==="ovSettlementDue")el.dataset.baseAmount="0";}}
    if($("ovSettlementDriverName"))$("ovSettlementDriverName").textContent="—";
    return;
  }
  try{
    const statementDate=$("ovStatementDate")?.value||today();
    if($("ovSettlementDate"))$("ovSettlementDate").value=statementDate;
    const d=await api(`/api/accounting/driver-expenses-summary?driver_id=${encodeURIComponent(driver)}&expense_from=${encodeURIComponent(statementDate)}&expense_to=${encodeURIComponent(statementDate)}`);
    const row=(d.data||[])[0]||null;
    await allDriversPromise;
    syncOrdersVerificationSettlementLock();
    // Amount Due is the unpaid balance: approved value minus expenses and already-recorded settlements.
    // Previous Settlements remains a separate historical total and must not be paid twice.
    const due=Number(row?.remaining_amount||0);
    if($("ovCashCollectedTotal"))$("ovCashCollectedTotal").value=money(row?.cash_collected_total||0);
    if($("ovCashExpenseTotal"))$("ovCashExpenseTotal").value=money(row?.total_expenses||0);
    if($("ovNetCashTotal"))$("ovNetCashTotal").value=money(row?.net_cash||0);
    if($("ovPreviousSettlements"))$("ovPreviousSettlements").value=money(row?.paid_amount||0);
    if($("ovSettlementDue")){ $("ovSettlementDue").value=money(due); $("ovSettlementDue").dataset.baseAmount=String(Number.isFinite(due)?due:0); }
    if($("ovSettlementDriverName"))$("ovSettlementDriverName").textContent=row?.driver_name||$("ovDriver")?.selectedOptions?.[0]?.textContent||"—";
    if($("ovSettlementCash")&&$("ovSettlementCredit")){ $("ovSettlementCash").value=moneyInput(due); $("ovSettlementCredit").value=""; }
    updateOrdersVerificationSettlementBalance();
  }catch(e){msg("ovSettlementMsg",e.message,"error");}
}
function renderOrdersVerificationSavedSettlements(settlements, driverId, driverRow={}){
  const box=$("ovSavedSettlements"); if(!box)return;
  const rows=Array.isArray(settlements)?settlements:[];
  if(!rows.length){box.innerHTML='';return;}
  const driverName=driverRow.driver_name||$("ovDriver")?.selectedOptions?.[0]?.textContent?.split(' — ')[0]||'—';
  const driverCode=driverRow.driver_no||$("ovDriver")?.selectedOptions?.[0]?.textContent?.split(' — ').slice(1).join(' — ')||'—';
  box.innerHTML=`<h4 style="margin:8px 0">${L("Saved Settlements","التسويات المحفوظة")}</h4><div class="ov-saved-settlement-list">${rows.map(st=>`<div class="panel ov-saved-settlement-row"><span class="ov-settlement-date">${L("Date","التاريخ")}: <b>${esc(String(st.paid_at||'').replace('T',' ').slice(0,10)||'—')}</b></span><span>${L("Driver","المندوب")}: <b>${esc(driverName)}</b></span><span>${L("Driver code","كود المندوب")}: <b>${esc(driverCode)}</b></span><span>${L("Cash","الكاش")}: <b>${money(st.cash_amount||0)}</b></span><span>${L("Delivery orders","أوردرات التسليم")}: <b>${Number(st.order_count||0)}</b></span><span>${L("Approved / Paid","الأوردرات المعتمدة Paid")}: <b>${Number(st.paid_order_count||0)}</b></span><button type="button" class="mini-btn danger ov-cancel-saved-settlement" title="${L("Cancel settlement","إلغاء التسوية")}" aria-label="${L("Cancel settlement","إلغاء التسوية")}" onclick="cancelOrdersVerificationSettlement('${esc(st.group_id)}','${esc(driverId)}')">×</button></div>`).join('')}</div>`;
}
async function cancelOrdersVerificationSettlement(groupId, driverId){
  if(!await showConfirmModal(L("Do you want to cancel?","هل تريد الإلغاء؟")))return;
  try{
    await api('/api/driver-settlements/cancel',{method:'POST',body:JSON.stringify({group_id:groupId,driver_id:driverId||$("ovDriver")?.value||""})});
    msg('ovSettlementMsg',L('Settlement cancelled.','تم إلغاء التسوية.'),'ok');
    await Promise.all([loadOrdersVerificationSavedSettlementsAll(),loadOrdersVerificationSettlement(),loadOrdersVerification()]);syncOrdersVerificationSettlementLock();
  }catch(e){msg('ovSettlementMsg',e.message,'error');}
}

function driverSettlementSplit(amount, credit){
  const due=Math.max(0,Number(amount)||0);
  const appliedCredit=Math.max(0,Math.min(due,Number(credit)||0));
  return {cash:Number((due-appliedCredit).toFixed(2)),credit:Number(appliedCredit.toFixed(2))};
}
function settlementDisplayNumber(value){
  const raw=String(value??'').trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g,'.').replace(/٬/g,'').replace(/,/g,'').replace(/[^0-9.\-]/g,'');
  const n=Number(raw);return Number.isFinite(n)?n:0;
}
function updateOrdersVerificationSettlementBalance(changedField){
  const dueEl=$("ovSettlementDue");
  // Use the numeric amount returned by the accounting API, not the localized
  // currency-formatted text shown in the read-only field (e.g. "150 AED").
  const storedDue=Number(dueEl?.dataset?.baseAmount);
  const parsedDue=settlementDisplayNumber(dueEl?.value);
  const rate=Number(currencyInfo()?.rate||1)||1;
  const dueDisplay=Math.max(0,Number.isFinite(storedDue)&&dueEl?.dataset?.baseAmount!==undefined?storedDue*rate:parsedDue);
  const cashEl=$("ovSettlementCash"),creditEl=$("ovSettlementCredit");
  if(!cashEl||!creditEl)return;
  let creditDisplay=Math.max(0,settlementDisplayNumber(creditEl.value));
  if(creditDisplay>dueDisplay){creditDisplay=dueDisplay;creditEl.value=dueDisplay.toFixed(2);}
  const cashDisplay=Math.max(0,Number((dueDisplay-creditDisplay).toFixed(2)));
  cashEl.value=cashDisplay.toFixed(2);
  const balanced=Math.abs(Number((cashDisplay+creditDisplay-dueDisplay).toFixed(2)))<=0.01;
  const saveEl=$("ovSettlementSave");
  if(saveEl)saveEl.disabled=saveEl.dataset.settlementLocked==='1'||dueDisplay<=0||!balanced;
}
async function saveOrdersVerificationSettlement(){
  const driver=$("ovDriver")?.value||""; if(!driver)return msg("ovSettlementMsg",L("Select a driver first.","اختر المندوب أولاً."),"error");
  const dueEl=$("ovSettlementDue");
  const dueDisplay=settlementDisplayNumber(dueEl?.value);
  const cashDisplay=settlementDisplayNumber($("ovSettlementCash")?.value);
  const creditDisplay=settlementDisplayNumber($("ovSettlementCredit")?.value);
  // Keep the server's canonical AED amount separately from the localized/formatted
  // read-only field. Parsing a formatted currency label must never turn a valid due
  // amount into zero and block the POST before it is sent.
  const storedDue=Number(dueEl?.dataset?.baseAmount);
  const due=Number.isFinite(storedDue)&&storedDue>=0?storedDue:baseAmount(dueDisplay);
  const cash=baseAmount(cashDisplay),credit=baseAmount(creditDisplay),total=Number((cash+credit).toFixed(2));
  if(due<=0)return msg("ovSettlementMsg",L("There is no remaining amount for this driver.","لا يوجد مبلغ مستحق للتسوية لهذا المندوب."),"error");
  if(cash<0||credit<0||Math.abs(total-due)>0.01)return msg("ovSettlementMsg",`${L("Cash + Credit must equal Amount","الكاش + الكريدت يجب أن يساوي المبلغ")}: ${money(due)}`,"error");
  try{await api('/api/driver-settlements',{method:'POST',body:JSON.stringify({driver_id:driver,amount:total,cash_amount:cash,credit_amount:credit,expected_due:due,paid_at:$("ovSettlementDate")?.value||today()})});msg("ovSettlementMsg",L("Settlement saved successfully.","تم الحفظ"),"ok");await Promise.all([loadOrdersVerificationSavedSettlementsAll(),loadOrdersVerificationSettlement(),loadOrdersVerification()]);syncOrdersVerificationSettlementLock();const modal=$("ovSettlementModal");if(modal)modal.hidden=true;}catch(e){msg("ovSettlementMsg",e.message,"error");}
}

async function areasPage(c){
  const [g,a]=await Promise.all([api("/api/governorates"),api("/api/areas")]);
  c.innerHTML=`<h2>${t("Governorates & Areas")}</h2><div class="panel"><h3>${t("Import Excel")}</h3><p class="muted">${t("Excel: اسم الإمارة في العمود D، المنطقة / Area، اسم المنطقة EN / Area EN — يقبل العربي أو الإنجليزي")}</p><div class="actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="areaFile" type="file" accept=".xlsx,.xls,.csv"><button onclick="importAreasExcel()">${t("Import Excel")}</button><button class="ghost" type="button" onclick="clearAreaFile()">🗑 ${L("Remove File","حذف الملف")}</button><button class="ghost" onclick='exportRowsExcel(${JSON.stringify((a.data||[]).map(x=>({governorate_id:x.governorate_id,area_ar:x.name_ar,area_en:x.name_en||""})))} ,"areas")'>${t("Export Excel")}</button></div><div id="areaFileName" class="muted" style="margin-top:6px"></div><div id="areaMsg"></div></div>
  <div class="panel"><h3>${t("Add Governorate")}</h3><div class="row"><input id="govAr" placeholder="${L("Arabic name","اسم الإمارة بالعربي")}"><input id="govEn" placeholder="English"><button onclick="addGovernorate()">${t("Save")}</button></div></div>
  <div class="panel"><h3>${t("Add Area")}</h3><div class="row"><select id="areaGov">${(g.data||[]).map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join("")}</select><input id="areaAr" placeholder="${L("Area name","اسم المنطقة")}"><input id="areaEn" placeholder="English"><button onclick="addArea()">${t("Save")}</button></div></div>
  <div class="panel"><div class="section-title-row"><h3>${t("Governorates & Areas")}</h3><div class="actions"><button class="danger" type="button" onclick="deleteAllAreas()">🗑 ${L("Delete All Areas","حذف كل المناطق")}</button><button class="danger" type="button" onclick="deleteAllGovernorates()">🗑 ${L("Delete All Areas & Emirates","حذف كل المناطق والإمارات")}</button></div></div>${table(g.data||[],["name_ar","name_en"])}<div class="table-wrap"><table><thead><tr><th>${L("Area","المنطقة")}</th><th>${L("English","الإنجليزي")}</th><th>${L("Governorate","الإمارة")}</th><th>${L("Action","الإجراء")}</th></tr></thead><tbody>${(a.data||[]).map(x=>{const gov=(g.data||[]).find(v=>String(v.id)===String(x.governorate_id));return `<tr><td>${esc(x.name_ar||"")}</td><td>${esc(x.name_en||"")}</td><td>${esc(gov?L(gov.name_en,gov.name_ar):x.governorate_id||"")}</td><td><button class="mini-btn" type="button" onclick="editArea('${esc(x.id)}')">✏️ ${L("Edit / Move","تعديل / نقل الإمارة")}</button> <button class="mini-btn danger" type="button" onclick="deleteArea('${esc(x.id)}','${esc(x.name_ar||x.name_en||"")}')">🗑 ${L("Delete","حذف")}</button></td></tr>`}).join("")||`<tr><td colspan="4" class="muted">${L("No areas","لا توجد مناطق")}</td></tr>`}</tbody></table></div></div>`;
}
async function deleteArea(id,name){if(!await showConfirmModal(`${L("Delete area","حذف المنطقة")} "${name}"؟\n${L("This will remove it from the database.","سيتم حذفها من قاعدة البيانات.")}`))return;try{await api("/api/areas",{method:"DELETE",body:JSON.stringify({id})});await show("areas");}catch(e){alert(e.message);}}
async function deleteAllAreas(){if(!await showConfirmModal(L("Delete ALL areas from the database? This cannot be undone.","هل تريد حذف كل المناطق من قاعدة البيانات؟ لا يمكن التراجع عن الحذف.")))return;try{const d=await api("/api/areas",{method:"DELETE",body:JSON.stringify({all:true})});await show("areas");msg("areaMsg",Number(d.deleted||0)>0?`${L("Deleted","تم حذف")}: ${d.deleted}`:L("No areas were deleted.","لم يتم حذف أي مناطق."),Number(d.deleted||0)>0?"ok":"warn");}catch(e){await show("areas");msg("areaMsg",e.message,"error");}}
async function deleteAllGovernorates(){if(!await showConfirmModal(L("Delete ALL areas AND Emirates from the database? Existing orders will keep their history but their area/emirate links will be cleared.","هل تريد حذف كل المناطق والإمارات من قاعدة البيانات؟ سيتم الحفاظ على الأوردرات القديمة مع إزالة ارتباط المنطقة والإمارة منها.")))return;try{const d=await api("/api/governorates",{method:"DELETE",body:JSON.stringify({all:true})});await show("areas");msg("areaMsg",`${L("Deleted Emirates","تم حذف الإمارات")}: ${d.deleted||0}`,Number(d.deleted||0)>0?"ok":"warn");}catch(e){await show("areas");msg("areaMsg",e.message,"error");}}
async function editArea(id){try{const [g,a]=await Promise.all([api("/api/governorates"),api("/api/areas")]);const x=(a.data||[]).find(v=>String(v.id)===String(id));if(!x)return;const ar=await showInputModal(L("Area Arabic name","اسم المنطقة بالعربي"),x.name_ar||"");if(ar===null)return;const en=await showInputModal(L("Area English name","اسم المنطقة بالإنجليزي"),x.name_en||"");if(en===null)return;const options=(g.data||[]).map((v,i)=>`${i+1}. ${L(v.name_en,v.name_ar)}`).join('\n');const current=(g.data||[]).findIndex(v=>String(v.id)===String(x.governorate_id));const pick=await showInputModal(`${L("Choose new Emirates number (Cancel keeps current)","اختر رقم الإمارة الجديدة (إلغاء للإبقاء على الحالية)")}\n\n${options}`,current>=0?String(current+1):"");if(pick===null)return;const idx=Number(pick)-1;if(!Number.isInteger(idx)||idx<0||idx>=(g.data||[]).length)return alert(L("Invalid Emirates number","رقم الإمارة غير صحيح"));await api("/api/areas",{method:"PATCH",body:JSON.stringify({id,name_ar:ar,name_en:en,governorate_id:g.data[idx].id})});await show("areas");}catch(e){alert(e.message);}}
async function addGovernorate(){try{await api("/api/governorates",{method:"POST",body:JSON.stringify({name_ar:$("govAr").value,name_en:$("govEn").value})});show("areas");}catch(e){alert(e.message);}}
async function addArea(){try{await api("/api/areas",{method:"POST",body:JSON.stringify({governorate_id:$("areaGov").value,name_ar:$("areaAr").value,name_en:$("areaEn").value})});show("areas");}catch(e){alert(e.message);}}
function clearAreaFile(){const input=$("areaFile");if(input){input.value="";}if($("areaFileName"))$("areaFileName").textContent="";if($("areaMsg"))$("areaMsg").innerHTML="";}

async function importAreasExcel(){const file=$("areaFile")?.files?.[0];if(!file)return msg("areaMsg",L("Choose an Excel file","اختر ملف Excel"),"error");if(typeof XLSX==="undefined")return msg("areaMsg",L("Excel library did not load. Use CSV or refresh.","مكتبة Excel لم تعمل. جرّب تحديث الصفحة أو CSV."),"error");try{if($("areaFileName"))$("areaFileName").textContent=`${L("Selected file","الملف المحدد")}: ${esc(file.name)}`;const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});if(!matrix.length)throw new Error(L("The Excel file is empty","ملف Excel فارغ"));const headers=(matrix[0]||[]).map(v=>String(v??"").trim());const rows=matrix.slice(1).map(row=>{const obj={};headers.forEach((h,i)=>{if(h)obj[h]=row[i]??"";});obj.__emirate_column_d=row[3]??"";return obj;}).filter(row=>Object.values(row).some(v=>String(v??"").trim()!==""));if(!rows.length)throw new Error(L("The Excel file has no data rows","ملف Excel لا يحتوي على صفوف بيانات"));const d=await api("/api/areas/import",{method:"POST",body:JSON.stringify({rows})});const issueCount=Number(d.error_count??d.errors?.length??0);const extra=issueCount?` — ${L("Rows with issues","صفوف بها مشاكل")}: ${issueCount}${d.errors?.length?` (${L("examples","أمثلة")}: ${d.errors.slice(0,3).map(x=>`${x.row}: ${x.error}`).join("؛ ")})`:""}`:"";msg("areaMsg",`${L("Imported","تم الاستيراد")}: ${d.imported} — ${L("Skipped","تم التخطي")}: ${d.skipped}${extra}`,d.imported>0?"ok":"error");if(d.imported>0)setTimeout(()=>show("areas"),1200);}catch(e){msg("areaMsg",e.message,"error");}}


async function employeeWagesPage(c){
  const month=today().slice(0,7); let employees=[], payroll=[];
  try{const [e,p]=await Promise.all([api('/api/payroll/employees'),api(`/api/payroll/period?month=${encodeURIComponent(month)}`)]);employees=e.data||[];payroll=p.data?.items||[];window.__payrollEmployees=employees;}
  catch(e){c.innerHTML=`<div class="panel"><h2>${L('Employee Wages','أجور الموظفين')}</h2><p class="error">${esc(e.message)}</p><p class="muted">${L('Run employee-wages-migration.sql in Supabase first.','شغّل ملف employee-wages-migration.sql في Supabase أولاً.')}</p></div>`;return;}
  c.innerHTML=`<div class="section-title-row payroll-page-title"><h2>${L('Employee Wages','أجور الموظفين')}</h2><div class="actions"><button class="ghost" type="button" onclick="openDriverCommissionModal()">${L('Driver Commission','عمولة المناديب')}</button></div></div>
  <div class="panel payroll-period-panel"><div class="payroll-period-toolbar"><h3>${L('Monthly payroll','كشف الأجور الشهري')}</h3><label class="payroll-month-field">${L('Month','الشهر')}<input id="payMonth" type="month" value="${month}" onchange="loadPayrollPeriod()"></label><button type="button" onclick="generatePayrollPeriod()">${L('Prepare payroll','إعداد كشف الرواتب')}</button><div id="payrollSummary" class="payroll-summary"></div></div><div id="payrollTable"></div></div>
  <div class="panel payroll-employee-panel"><div class="payroll-employee-heading"><h3>${L('Add Employee','إضافة موظف')}</h3><button type="button" onclick="savePayrollEmployee()">${L('Save Employee','حفظ الموظف')}</button></div>
  <div class="payroll-employee-grid"><label>${L('Employee name','اسم الموظف')}<input id="payEmpName" required></label><label>${L('Job title','المهنة داخل الشركة')}<input id="payEmpJob" required placeholder="${L('e.g. Accountant, Driver','مثال: محاسب، سائق')}"></label><label>${L('Monthly base salary','الراتب الشهري الثابت')}<input id="payEmpSalary" type="number" min="0" step="0.01" value="0"></label><label>${L('Employee type','نوع الموظف')}<select id="payEmpDriver" onchange="togglePayrollDriverFields()"><option value="false">${L('Other employee','موظف آخر')}</option><option value="true">${L('Driver','سائق')}</option></select></label><label id="payEmpDriverLinkWrap" hidden>${L('Link to driver account','ربط بحساب المندوب')}<select id="payEmpDriverLink"><option value="">${L('Not linked','بدون ربط')}</option></select></label><label id="payEmpDeliveryWrap" hidden>${L('Delivery commission per order','عمولة التسليم للأوردر')}<input id="payEmpDelivery" type="number" min="0" step="0.01" value="0"></label><label id="payEmpPickupWrap" hidden>${L('Pickup commission per order','عمولة الإحضارات للأوردر')}<input id="payEmpPickup" type="number" min="0" step="0.01" value="0"></label></div><p class="muted payroll-help">${L('Driver commissions remain separate from payroll and are not added to salary automatically. Attendance is optional and does not change salary automatically.','عمولات السائق مستقلة عن الأجور ولا تضاف للراتب تلقائيًا. الحضور اختياري ولا يغيّر الراتب تلقائيًا.')}</p><span id="payEmpMsg" class="muted"></span></div>
  <div class="panel payroll-employees-list"><h3>${L('Employees','الموظفون')}</h3><div class="table-wrap"><table><thead><tr><th>${L('Name','الاسم')}</th><th>${L('Job title','المهنة')}</th><th>${L('Base salary','الراتب')}</th><th>${L('Driver commissions','عمولات السائق')}</th><th>${L('Status','الحالة')}</th></tr></thead><tbody>${employees.filter(e=>e.active===true||e.active==='true').map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.job_title)}</td><td>${money(e.base_salary)}</td><td>${e.is_driver?`${L('Delivery','تسليم')}: ${money(e.delivery_commission)} / ${L('Pickup','إحضار')}: ${money(e.pickup_commission)}`:'—'}</td><td>${e.active?L('Active','نشط'):L('Inactive','متوقف')} <button class="mini-btn ghost" title="${L('Edit employee','تعديل بيانات الموظف')}" onclick="openPayrollEmployeeEdit('${esc(e.id)}')">✏️</button> <button class="mini-btn ghost" title="${L('Attach payment proof','إرفاق إثبات الصرف')}" onclick="openEmployeeProofPicker('${esc(e.id)}')">📎</button> <button class="mini-btn danger" title="${L('Delete employee','حذف الموظف')}" onclick="deactivatePayrollEmployee('${esc(e.id)}','${esc(e.name)}')">🗑</button></td></tr>`).join('')||`<tr><td colspan="5">${L('No employees yet','لا يوجد موظفون حتى الآن')}</td></tr>`}</tbody></table></div></div><div id="payrollModalHost"></div>`;
  try{const d=await api('/api/drivers');const sel=$('payEmpDriverLink');(d.data||[]).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=`${x.name||''}${x.driver_no?' — '+x.driver_no:''}`;sel.appendChild(o);});}catch(_){} renderPayrollTable(payroll);
}
function togglePayrollDriverFields(){const on=$('payEmpDriver')?.value==='true';['payEmpDeliveryWrap','payEmpPickupWrap','payEmpDriverLinkWrap'].forEach(id=>{const x=$(id);if(x)x.hidden=!on;});}
function openPayrollEmployeeEdit(id){const e=(window.__payrollEmployees||[]).find(x=>String(x.id)===String(id));if(!e)return alert(L('Employee not found','الموظف غير موجود'));const host=$('payrollModalHost');if(!host)return;host.innerHTML=`<div class="payroll-modal-backdrop" role="dialog" aria-modal="true"><form class="payroll-modal" onsubmit="event.preventDefault();savePayrollEmployeeEdit()"><div class="section-title-row"><h3>${L('Edit employee','تعديل بيانات الموظف')}</h3><button type="button" class="ghost" onclick="closePayrollModal()">×</button></div><input id="payEditEmpId" type="hidden" value="${esc(e.id)}"><label>${L('Employee name','اسم الموظف')}<input id="payEditEmpName" required value="${esc(e.name||'')}"></label><label>${L('Job title','المهنة داخل الشركة')}<input id="payEditEmpJob" required value="${esc(e.job_title||'')}"></label><label>${L('Monthly base salary','الراتب الشهري الثابت')}<input id="payEditEmpSalary" type="number" min="0" step="0.01" required value="${Number(e.base_salary||0)}"></label><label>${L('Employee type','نوع الموظف')}<select id="payEditEmpDriver" onchange="togglePayrollEditDriverFields()"><option value="false" ${!e.is_driver?'selected':''}>${L('Other employee','موظف آخر')}</option><option value="true" ${e.is_driver?'selected':''}>${L('Driver','سائق')}</option></select></label><label id="payEditEmpDriverLinkWrap" ${!e.is_driver?'hidden':''}>${L('Link to driver account','ربط بحساب المندوب')}<select id="payEditEmpDriverLink"><option value="">${L('Not linked','بدون ربط')}</option></select></label><label id="payEditEmpDeliveryWrap" ${!e.is_driver?'hidden':''}>${L('Delivery commission per order','عمولة التسليم للأوردر')}<input id="payEditEmpDelivery" type="number" min="0" step="0.01" value="${Number(e.delivery_commission||0)}"></label><label id="payEditEmpPickupWrap" ${!e.is_driver?'hidden':''}>${L('Pickup commission per order','عمولة الإحضارات للأوردر')}<input id="payEditEmpPickup" type="number" min="0" step="0.01" value="${Number(e.pickup_commission||0)}"></label><div id="payEditEmpMsg" class="msg"></div><div class="actions"><button type="submit">${L('Save changes','حفظ التعديلات')}</button><button type="button" class="ghost" onclick="closePayrollModal()">${L('Cancel','إلغاء')}</button></div></form></div>`;api('/api/drivers').then(d=>{const sel=$('payEditEmpDriverLink');(d.data||[]).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=`${x.name||''}${x.driver_no?' — '+x.driver_no:''}`;if(String(x.id)===String(e.linked_driver_id||''))o.selected=true;sel.appendChild(o);});}).catch(()=>{});}
function togglePayrollEditDriverFields(){const on=$('payEditEmpDriver')?.value==='true';['payEditEmpDriverLinkWrap','payEditEmpDeliveryWrap','payEditEmpPickupWrap'].forEach(id=>{const x=$(id);if(x)x.hidden=!on;});}
async function savePayrollEmployeeEdit(){const id=$('payEditEmpId')?.value,body={name:$('payEditEmpName').value.trim(),job_title:$('payEditEmpJob').value.trim(),base_salary:Number($('payEditEmpSalary').value||0),is_driver:$('payEditEmpDriver').value==='true',linked_driver_id:$('payEditEmpDriverLink').value||null,delivery_commission:Number($('payEditEmpDelivery').value||0),pickup_commission:Number($('payEditEmpPickup').value||0)};if(!body.name||!body.job_title||body.base_salary<0||body.delivery_commission<0||body.pickup_commission<0)return msg('payEditEmpMsg',L('Enter valid employee data','أدخل بيانات موظف صحيحة'),'error');try{await api(`/api/payroll/employees/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});closePayrollModal();await show('employeeWages');}catch(e){msg('payEditEmpMsg',e.message,'error');}}
async function savePayrollEmployee(){try{const body={name:$('payEmpName').value.trim(),job_title:$('payEmpJob').value.trim(),base_salary:Number($('payEmpSalary').value||0),is_driver:$('payEmpDriver').value==='true',delivery_commission:Number($('payEmpDelivery').value||0),pickup_commission:Number($('payEmpPickup').value||0),linked_driver_id:$('payEmpDriverLink').value||null};if(!body.name||!body.job_title)return alert(L('Name and job title are required','الاسم والمهنة مطلوبان'));await api('/api/payroll/employees',{method:'POST',body:JSON.stringify(body)});await show('employeeWages');}catch(e){alert(e.message);}}
async function loadPayrollPeriod(){try{const month=$('payMonth').value;const d=await api(`/api/payroll/period?month=${encodeURIComponent(month)}`);renderPayrollTable(d.data?.items||[]);}catch(e){$('payrollTable').innerHTML=`<p class="error">${esc(e.message)}</p>`;}}
async function generatePayrollPeriod(){try{const month=$('payMonth').value;if(!/^\d{4}-\d{2}$/.test(month))return alert(L('Choose a month','اختر الشهر'));const d=await api('/api/payroll/generate',{method:'POST',body:JSON.stringify({month})});renderPayrollTable(d.data?.items||[]);}catch(e){alert(e.message);}}
function renderPayrollTable(rows){const host=$('payrollTable');if(!host)return;const total=rows.reduce((s,r)=>s+Number(r.base_salary||0)+Number(r.additions||0)-Number(r.deductions||0),0),paid=rows.reduce((s,r)=>s+Number(r.paid_amount||0),0);const summary=$('payrollSummary');if(summary)summary.innerHTML=`<span class="payroll-month-summary">${L('Month','الشهر')}: <b>${esc($('payMonth')?.value||'—')}</b></span><span>${L('Net payroll','صافي الأجور')}: <b>${money(total)}</b></span><span>${L('Paid','المدفوع')}: <b>${money(paid)}</b></span><span>${L('Remaining','المتبقي')}: <b>${money(Math.max(0,total-paid))}</b></span>`;host.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>${L('Employee','الموظف')}</th><th>${L('Base','الأساسي')}</th><th>${L('Additions','إضافات')}</th><th>${L('Deductions','خصومات')}</th><th>${L('Net','الصافي')}</th><th>${L('Paid','المدفوع')}</th><th>${L('Status','الحالة')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(r=>{const net=Number(r.base_salary||0)+Number(r.additions||0)-Number(r.deductions||0),remain=Math.max(0,net-Number(r.paid_amount||0));return `<tr><td><b>${esc(r.employee_name)}</b><small>${esc(r.job_title||'')}</small><button class="mini-btn ghost" title="${L('Attach payment proof','إرفاق إثبات الصرف')}" onclick="openPayrollItemProofPicker('${esc(r.id)}')">📎</button></td><td>${money(r.base_salary)}</td><td>${money(r.additions)}</td><td>${money(r.deductions)}</td><td><b>${money(net)}</b></td><td>${money(r.paid_amount)}</td><td>${esc(r.status||'unpaid')}</td><td><div class="actions"><button class="mini-btn" onclick="openPayrollAdjustmentModal('${esc(r.id)}','addition')">+ ${L('Addition','إضافة')}</button><button class="mini-btn ghost" onclick="openPayrollAdjustmentModal('${esc(r.id)}','deduction')">− ${L('Deduction','خصم')}</button><button class="mini-btn" onclick="openPayrollPaymentModal('${esc(r.id)}',${remain})" ${remain<=0?'disabled':''}>${L('Pay / receipt','صرف / إيصال')}</button><button class="mini-btn ghost" onclick="printPayrollReceipt('${esc(r.id)}')">${L('Receipts','الإيصالات')}</button><button class="mini-btn danger" title="${L('Delete employee','حذف الموظف')}" onclick="deactivatePayrollEmployee('${esc(r.employee_id||'')}','${esc(r.employee_name||'').replace(/'/g,"&#39;")}')" ${!r.employee_id?'disabled':''}>${L('Delete','حذف')}</button></div></td></tr>`}).join('')}</tbody></table></div>`:`<p class="muted">${L('Choose a month and prepare payroll to create a fixed salary snapshot.','اختر الشهر واضغط إعداد كشف الرواتب لإنشاء نسخة ثابتة من الرواتب.')}</p>`;window.__payrollRows=rows;}
function openPayrollItemProofPicker(id){const host=$('payrollModalHost');if(!host)return;host.innerHTML=`<div class="payroll-modal-backdrop" role="dialog" aria-modal="true"><form class="payroll-modal" onsubmit="event.preventDefault();uploadPayrollItemProof()"><div class="section-title-row"><h3>${L('Attach payment proof','إرفاق إثبات الصرف')}</h3><button type="button" class="ghost" onclick="closePayrollModal()">×</button></div><input id="payItemProofId" type="hidden" value="${esc(id)}"><label>${L('Choose proof image','اختيار صورة الإثبات')}<input id="payItemProofFile" type="file" accept="image/jpeg,image/png,image/webp" required></label><small>${L('JPG, PNG or WEBP, maximum 7 MB','JPG أو PNG أو WEBP بحد أقصى 7 ميجابايت')}</small><div id="payItemProofMsg" class="msg"></div><div class="actions"><button type="submit">${L('Save attachment','حفظ المرفق')}</button><button type="button" class="ghost" onclick="closePayrollModal()">${L('Cancel','إلغاء')}</button></div></form></div>`;}
function openEmployeeProofPicker(id){const rows=window.__payrollRows||[];const row=rows.find(x=>String(x.employee_id)===String(id));if(row)return openPayrollItemProofPicker(row.id);alert(L('Prepare the monthly payroll first, then attach proof from the employee row in the payroll list.','جهّز كشف الشهر أولًا، ثم أرفق الإثبات من صف الموظف في كشف الأجور.'));}
async function uploadPayrollItemProof(){const id=$('payItemProofId')?.value,file=$('payItemProofFile')?.files?.[0];if(!file)return msg('payItemProofMsg',L('Choose an image','اختر صورة'),'error');if(file.size>7*1024*1024)return msg('payItemProofMsg',L('File is larger than 7MB','حجم الصورة أكبر من 7 ميجابايت'),'error');if(!['image/jpeg','image/png','image/webp'].includes(file.type))return msg('payItemProofMsg',L('Choose JPG, PNG or WEBP image','اختر صورة JPG أو PNG أو WEBP'),'error');try{const data_url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error(L('Could not read image','تعذرت قراءة الصورة')));r.readAsDataURL(file);});await api(`/api/payroll/items/${encodeURIComponent(id)}/proof`,{method:'POST',body:JSON.stringify({proof:{file_name:file.name,content_type:file.type,data_url}})});closePayrollModal();await loadPayrollPeriod();if(typeof toast==='function')toast(L('Payment proof attached','تم إرفاق إثبات الصرف'));else alert(L('Payment proof attached','تم إرفاق إثبات الصرف'));}catch(e){msg('payItemProofMsg',e.message,'error');}}
async function deactivatePayrollEmployee(id,name){if(!id){if(typeof toast==='function')toast(L('Employee ID is missing','معرّف الموظف غير موجود'));return;}if(!await showConfirmModal(L('Permanently delete this employee and all unpaid payroll rows? Paid payroll records and receipts cannot be deleted.','حذف الموظف نهائيًا وكل كشوف الرواتب غير المصروفة؟ لا يمكن حذف سجلات الرواتب المصروفة أو إيصالاتها المالية.')+'\n'+name))return;const month=$('payMonth')?.value||today().slice(0,7);const button=[...document.querySelectorAll('button[onclick]')].find(b=>b.getAttribute('onclick')?.includes(`deactivatePayrollEmployee('${id}'`));if(button){button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='…';}try{const result=await api(`/api/payroll/employees/${encodeURIComponent(id)}?month=${encodeURIComponent(month)}`,{method:'DELETE'});if(result?.success!==true)throw new Error(result?.error||L('Delete failed','فشل الحذف'));await show('employeeWages');if($('payMonth')&&$('payMonth').value!==month){$('payMonth').value=month;await loadPayrollPeriod();}if(typeof toast==='function')toast(result?.message||L('Employee removed from payroll','تم حذف الموظف من كشف الأجور'));else if(result?.message)console.info(result.message);}catch(e){if(button){button.disabled=false;button.textContent=button.dataset.oldText||'🗑';}if(typeof toast==='function')toast(e.message||L('Could not delete employee','تعذر حذف الموظف'));else alert(e.message||L('Could not delete employee','تعذر حذف الموظف'));}}
function openPayrollAdjustmentModal(id,kind){const host=$('payrollModalHost');if(!host)return;const isAdd=kind==='addition';host.innerHTML=`<div class="payroll-modal-backdrop" role="dialog" aria-modal="true"><form class="payroll-modal" onsubmit="event.preventDefault();savePayrollAdjustmentModal()"><div class="section-title-row"><h3>${isAdd?L('Add salary addition','إضافة مبلغ للراتب'):L('Deduct from salary','خصم من الراتب')}</h3><button type="button" class="ghost" onclick="closePayrollModal()">×</button></div><input id="payAdjItemId" type="hidden" value="${esc(id)}"><input id="payAdjKind" type="hidden" value="${kind}"><label>${L('Amount','المبلغ')}<input id="payAdjAmount" type="number" min="0.01" step="0.01" required></label><label>${L('Reason','السبب')}<textarea id="payAdjReason" rows="3" required placeholder="${L('Write the reason','اكتب سبب الإضافة أو الخصم')}"></textarea></label><div id="payAdjMsg" class="msg"></div><div class="actions"><button type="submit">${L('Save','حفظ')}</button><button type="button" class="ghost" onclick="closePayrollModal()">${L('Cancel','إلغاء')}</button></div></form></div>`;}
function closePayrollModal(){$('payrollModalHost')?.replaceChildren();}
async function savePayrollAdjustmentModal(){const form=$('payAdjAmount')?.closest('form');if(form?.dataset.submitting==='1')return;const id=$('payAdjItemId')?.value,kind=$('payAdjKind')?.value,amount=Number($('payAdjAmount')?.value||0),reason=$('payAdjReason')?.value.trim();if(!amount||amount<=0||!reason)return msg('payAdjMsg',L('Amount and reason are required','المبلغ والسبب مطلوبان'),'error');try{if(form)form.dataset.submitting='1';const btn=form?.querySelector('button[type=submit]');if(btn)btn.disabled=true;await api('/api/payroll/adjustments',{method:'POST',body:JSON.stringify({item_id:id,kind,amount,reason})});closePayrollModal();await loadPayrollPeriod();}catch(e){if(form){delete form.dataset.submitting;const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=false;}msg('payAdjMsg',e.message,'error');}}
function openPayrollPaymentModal(id,remaining){const host=$('payrollModalHost');if(!host)return;if(remaining<=0)return;host.innerHTML=`<div class="payroll-modal-backdrop" role="dialog" aria-modal="true"><form class="payroll-modal" onsubmit="event.preventDefault();savePayrollPaymentModal()"><div class="section-title-row"><h3>${L('Salary payment and proof','صرف الراتب وإثبات الصرف')}</h3><button type="button" class="ghost" onclick="closePayrollModal()">×</button></div><input id="payPayItemId" type="hidden" value="${esc(id)}"><label>${L('Amount to pay','المبلغ المصروف')}<input id="payPayAmount" type="number" min="0.01" max="${remaining.toFixed(2)}" step="0.01" value="${remaining.toFixed(2)}" required></label><label>${L('Payment date','تاريخ الصرف')}<input id="payPayDate" type="date" value="${today()}" required></label><label class="payroll-proof-label">${L('Payment proof (optional image)','إثبات الصرف (صورة اختيارية)')}<input id="payPayProof" type="file" accept="image/jpeg,image/png,image/webp"><small>${L('JPG, PNG or WEBP, maximum 7 MB','JPG أو PNG أو WEBP بحد أقصى 7 ميجابايت')}</small></label><div id="payPayMsg" class="msg"></div><div class="actions"><button type="submit">${L('Record payment and print receipt','تسجيل الصرف وطباعة الإيصال')}</button><button type="button" class="ghost" onclick="closePayrollModal()">${L('Cancel','إلغاء')}</button></div></form></div>`;}
async function savePayrollPaymentModal(){const id=$('payPayItemId')?.value,amount=Number($('payPayAmount')?.value||0),paid_at=$('payPayDate')?.value||today(),file=$('payPayProof')?.files?.[0];if(!amount||amount<=0)return msg('payPayMsg',L('Enter a valid amount','أدخل مبلغًا صحيحًا'),'error');let proof=null;if(file){if(file.size>7*1024*1024)return msg('payPayMsg',L('File is larger than 7MB','حجم الصورة أكبر من 7 ميجابايت'),'error');if(!['image/jpeg','image/png','image/webp'].includes(file.type))return msg('payPayMsg',L('Choose JPG, PNG or WEBP image','اختر صورة JPG أو PNG أو WEBP'),'error');try{const data_url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error(L('Could not read image','تعذرت قراءة الصورة')));r.readAsDataURL(file);});proof={file_name:file.name,content_type:file.type,data_url};}catch(e){return msg('payPayMsg',e.message,'error');}}try{const d=await api('/api/payroll/receipts',{method:'POST',body:JSON.stringify({item_id:id,amount,paid_at,proof})});closePayrollModal();await loadPayrollPeriod();printPayrollReceiptData(d.data.receipt,d.data.item,d.data.adjustments||[]);}catch(e){msg('payPayMsg',e.message,'error');}}
async function printPayrollReceipt(id){try{const d=await api(`/api/payroll/receipts?item_id=${encodeURIComponent(id)}`);const rows=d.data?.receipts||[];if(!rows.length)return alert(L('No receipts','لا توجد إيصالات'));rows.forEach(r=>printPayrollReceiptData(r,d.data.item,d.data.adjustments||[]));}catch(e){alert(e.message);}}
function printPayrollReceiptData(r,item,adjustments=[]){const w=window.open('','_blank');if(!w)return alert(L('Allow pop-ups to print the receipt','اسمح بالنوافذ المنبثقة لطباعة الإيصال'));const brand=COMPANY_BRANDING||{},adds=adjustments.filter(x=>x.kind==='addition').reduce((s,x)=>s+Number(x.amount||0),0),deds=adjustments.filter(x=>x.kind==='deduction').reduce((s,x)=>s+Number(x.amount||0),0);w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${L('Salary receipt','إيصال راتب')}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html{background:#e9edf3}body{font:14px Arial;padding:12mm;direction:${LANG==='ar'?'rtl':'ltr'};color:#111;width:210mm;min-height:297mm;margin:18px auto;background:#fff;box-shadow:0 3px 18px #0002}.brand{display:flex;align-items:center;justify-content:center;gap:14px;border-bottom:2px solid #333;padding-bottom:12px}.brand img{max-width:76px;max-height:65px;object-fit:contain}.brand h2{margin:0;text-align:center}h3{text-align:center;margin:18px 0}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{border:1px solid #bbb;padding:9px;text-align:start}.sign{margin-top:65px;display:flex;justify-content:space-between;gap:25px}.proof{margin-top:14px}small{color:#555}@media screen{body{width:min(210mm,calc(100vw - 24px));min-height:297mm;padding:clamp(10px,3vw,12mm)}}@media print{body{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}a{color:#111;text-decoration:none}}</style></head><body><header class="brand">${brand.logo_url?`<img src="${esc(brand.logo_url)}" alt="Logo">`:''}<h2>${esc(brand.name||'Delivery')}</h2></header><h3>${L('Employee salary receipt','إيصال صرف راتب موظف')}</h3><p>${L('Receipt no.','رقم الإيصال')}: <b>${esc(r.receipt_no)}</b></p><p>${L('Date','التاريخ')}: ${esc(r.paid_at)}</p><table><tr><th>${L('Employee','الموظف')}</th><td>${esc(item?.employee_name||'')}</td></tr><tr><th>${L('Job title','المهنة')}</th><td>${esc(item?.job_title||'')}</td></tr><tr><th>${L('Base salary','الراتب الأساسي')}</th><td>${money(item?.base_salary||0)}</td></tr><tr><th>${L('Additions','الإضافات')}</th><td>${money(adds)}</td></tr>${adjustments.filter(x=>x.kind==='addition').map(x=>`<tr><th>${L('Addition reason','سبب الإضافة')}: ${esc(x.reason||'')}</th><td>${money(x.amount)}</td></tr>`).join('')}<tr><th>${L('Deductions','الخصومات')}</th><td>${money(deds)}</td></tr>${adjustments.filter(x=>x.kind==='deduction').map(x=>`<tr><th>${L('Deduction reason','سبب الخصم')}: ${esc(x.reason||'')}</th><td>− ${money(x.amount)}</td></tr>`).join('')}<tr><th>${L('Net salary','صافي الراتب')}</th><td><b>${money(Number(item?.base_salary||0)+adds-deds)}</b></td></tr><tr><th>${L('Amount paid in this receipt','المبلغ المصروف بهذا الإيصال')}</th><td><b>${money(r.amount)}</b></td></tr></table><div class="sign"><span>${L('Employee signature','توقيع الموظف')}: __________________</span><span>${L('Authorized signature','توقيع المسؤول')}: __________________</span></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}

function openDriverCommissionModal(){const host=$('payrollModalHost');if(!host)return;host.innerHTML=`<div class="driver-settlement-modal-backdrop" role="dialog" aria-modal="true"><div class="panel driver-settlement-panel driver-settlement-modal"><div class="section-title-row"><h3>${L('Driver Commission','عمولة المناديب')}</h3><button class="ghost" onclick="closeDriverCommissionModal()">×</button></div><div id="driverCommissionModalBody">${L('Loading...','جارٍ التحميل...')}</div></div></div>`;loadDriverCommissionModal();}
function closeDriverCommissionModal(){$('payrollModalHost')?.replaceChildren();}
async function loadDriverCommissionModal(){try{const [d,dr]=await Promise.all([api('/api/drivers'),Promise.resolve(null)]);const drivers=d.data||[];const body=$('driverCommissionModalBody');if(!body)return;const from=daysAgo(0),to=today();body.innerHTML=`<div class="driver-commission-toolbar" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><label>${L('From','من')}<input id="dcFrom" type="date" value="${from}"></label><label>${L('To','إلى')}<input id="dcTo" type="date" value="${to}"></label><label>${L('Driver','المندوب')}<select id="dcDriver"><option value="">${L('Select driver','اختر المندوب')}</option>${drivers.map(r=>`<option value="${esc(r.id)}">${esc(r.name||'')} — ${esc(r.driver_no||'')}</option>`).join('')}</select></label><button onclick="loadDriverCommission()">${L('Show commission','عرض العمولة')}</button><button class="ghost" onclick="printDriverCommission()">PDF</button></div><div id="driverCommissionResult"></div>`;}catch(e){const b=$('driverCommissionModalBody');if(b)b.innerHTML=`<p class="error">${esc(e.message)}</p>`;}}

async function driverCommissionPage(c){
  const from=daysAgo(0), to=today();
  const [dr]=await Promise.all([api('/api/drivers')]);
  const drivers=dr.data||[];
  c.innerHTML=`<h2>${t("Driver Commission")}</h2>
  <div class="panel"><div class="driver-commission-toolbar" style="display:flex;gap:8px;align-items:end;flex-wrap:nowrap;overflow-x:auto">
    <label style="flex:1;min-width:105px">${t("From")}<input id="dcFrom" type="date" value="${from}"></label>
    <label style="flex:1;min-width:105px">${t("To")}<input id="dcTo" type="date" value="${to}"></label>
    <label style="flex:1.4;min-width:125px">${L("Driver","المندوب")}<select id="dcDriver"><option value="">${L("Select driver","اختر المندوب")}</option>${drivers.map(r=>`<option value="${esc(r.id)}">${esc(r.name||"")} — ${esc(r.driver_no||"")}</option>`).join("")}</select></label>
    <button style="flex:0 0 auto;white-space:nowrap" onclick="loadDriverCommission()">${t("Actions")}</button><button class="ghost" style="flex:0 0 auto;white-space:nowrap" onclick="printDriverCommission()">PDF</button>
  </div></div>
  <div id="driverCommissionResult"></div>`;
}
function driverCommissionTable(rows, driverName="", rates={}){
  if(!rows.length)return `<div class="panel"><p class="muted">${L("No commission records found","لا توجد بيانات في الفترة المحددة")}</p></div>`;
  const r=rows[0], pickup=Number(r.pickup_orders||0), delivery=Number(r.delivery_orders||0), pickupRate=Number(rates.pickup_commission||0), deliveryRate=Number(rates.delivery_commission||0), totalValue=pickup*pickupRate+delivery*deliveryRate;
  return `<div class="panel commission-sheet"><div class="driver-commission-print-name" style="font-size:17px;font-weight:800;margin-bottom:10px">${L("Driver","المندوب")}: ${esc(driverName||"—")}</div><div class="table-wrap"><table><thead><tr><th>${L("Collections","الإحضارات")}</th><th>${L("Pickup rate","عمولة الإحضار")}</th><th>${L("Delivery","التسليم")}</th><th>${L("Delivery rate","عمولة التسليم")}</th><th>${L("Total orders","إجمالي الأوردرات")}</th><th>${L("Commission value","قيمة العمولة المحسوبة")}</th></tr></thead><tbody><tr><td><b>${pickup}</b></td><td>${money(pickupRate)}</td><td><b>${delivery}</b></td><td>${money(deliveryRate)}</td><td><b>${Number(r.total_orders||0)}</b></td><td><b>${money(totalValue)}</b></td></tr></tbody></table></div>${rates.employee_name?`<p class="muted">${L("Rates configured for","الأسعار المحددة للموظف")}: ${esc(rates.employee_name)}. ${L("This calculation is a reference only; it does not post payroll or pay the driver automatically.","الحساب للعرض فقط ولا ينشئ صرفًا في الرواتب ولا يسدد عمولة المندوب تلقائيًا.")}</p>`:`<p class="muted">${L("No linked employee commission rates found; counts are shown without a monetary total.","لا توجد أسعار عمولة لموظف مربوط بهذا المندوب؛ تم عرض الأعداد فقط دون إجمالي مالي.")}</p>`}</div>`;
}
function printDriverCommission(){printArea("driverCommissionResult",L("Driver Commission","عمولة المندوب"));}
async function loadDriverCommission(){try{const driver=$('dcDriver').value;if(!driver)return msg('driverCommissionResult',L('Select a driver first','اختر المندوب أولاً'),'error');const from=$('dcFrom').value,to=$('dcTo').value;const q=`/api/driver-commissions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&driver_id=${encodeURIComponent(driver)}`;const [d,e]=await Promise.all([api(q),api('/api/payroll/employees').catch(()=>({data:[]}))]);const driverName=$('dcDriver').selectedOptions?.[0]?.textContent?.trim()||'';const rates=(e.data||[]).find(x=>x.is_driver&&String(x.linked_driver_id||'')===String(driver))||{};$('driverCommissionResult').innerHTML=driverCommissionTable(d.data||[],driverName,rates);}catch(e){msg('driverCommissionResult',e.message,'error');}}

async function ordersVerificationPage(c){
  const drivers=(await api("/api/drivers").catch(()=>({data:[]}))).data||[];
  c.innerHTML=`<div class="verification-page">
    <div class="verification-header"><div><h2>${L("Driver Account","حسابات المندوب")}</h2></div></div>
    <div class="panel verification-toolbar"><div class="verification-filters">
      <label>${L("Date","التاريخ")}<input id="ovStatementDate" type="date" value="${today()}"></label>
      <label>${L("Search orders...","بحث في الأوردرات...")}<input id="ovSearch" placeholder="Order / Tracking / Shipment / Phone / Shipper Code"></label>
      <label>${L("Driver","المندوب")}<select id="ovDriver"><option value="">${t("All Drivers")}</option>${drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name||"")} ${d.driver_no?`— ${esc(d.driver_no)}`:""}</option>`).join("")}</select></label>
      <label>${L("Status","الحالة")}<select id="ovStatus"><option value="all">${t("All Statuses")}</option>${SYSTEM_STATUSES.map(st=>`<option value="${esc(st)}">${esc(st)}</option>`).join("")}</select></label>
      <label>${L("Verification","الاعتماد")}<select id="ovVerification"><option value="all">${t("All Verification")}</option><option value="verified">${t("Verified")}</option><option value="unverified">${t("Unverified")}</option></select></label>
    </div><div class="verification-bulk-row"><button id="verifyAllBtn" type="button" disabled title="${L("Select a driver before verifying orders","اختر اسم المندوب قبل اعتماد الأوردرات")}">✓ ${t("Verify All")}</button><button id="refreshDriverAccountBtn" class="ghost driver-account-refresh-btn" type="button" title="${L("Refresh driver account data","تحديث بيانات حسابات المندوب")}" aria-label="${L("Refresh driver account data","تحديث بيانات حسابات المندوب")}">↻</button><div id="verificationTopStats" class="verification-top-stats"></div></div></div>
    <div id="ordersVerificationMsg" class="msg"></div><div id="ordersVerificationTable"></div>
    <div class="panel driver-account-finance-panel" id="ovDriverExpensesSection" style="margin-top:14px">
      <div class="section-title-row"><div><h3 style="margin:0">${L("Driver Expenses","مصاريف المندوب")}</h3></div><div class="driver-expense-heading-actions"><span id="ovExpenseTotalBadge" class="badge">${money(0)}</span><button id="ovExpenseSaveTop" type="button">+ ${L("Add Expense","إضافة مصروف")}</button></div></div>
      <div class="driver-finance-grid compact-expense-entry">
        
        <label>${L("Type","النوع")}<select id="ovExpenseType"><option value="petrol">${L("Fuel / Petrol","بنزين")}</option><option value="maintenance">${L("Maintenance","صيانة")}</option><option value="commission">${L("Commission","عمولة")}</option><option value="loading">${L("Loading","تحميل")}</option><option value="parking">${L("Parking","موقف")}</option><option value="other">${L("Other","مصروف آخر")}</option></select></label>
        <label>${L("Category","التصنيف")}<select id="ovExpenseCategory"><option value="expense">${L("Expense","مصروف")}</option><option value="shortage">${L("Shortage","عجز")}</option></select></label>
        <label>${L("Amount","المبلغ")} <small class="muted">${currencyInfo().symbol}</small><input id="ovExpenseAmountEdit" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <label>${L("Date","التاريخ")}<input id="ovExpenseDate" type="date" value="${today()}"></label>
        <label class="finance-wide expense-details-compact">${L("Details","التفاصيل")}<input id="ovExpenseDetails" placeholder="${esc(L("Fuel, maintenance, commission...","بنزين، صيانة، عمولة..."))}"></label>
      </div>
      <div class="driver-finance-grid driver-finance-grid-second" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="ovExpenseNotes" type="hidden" value="">
        <input id="ovExpenseId" type="hidden" value="">
        <div class="actions finance-actions"><button id="ovExpenseCancel" class="ghost" type="button" style="display:none">${L("Cancel","إلغاء")}</button></div>
      </div>
      <div id="ovExpenseMsg" class="msg"></div>
      <div id="ovExpensesTable" style="margin-top:8px"></div>
    </div>
    <div class="ov-settlement-footer-row no-print"><div class="ov-settlement-footer-action"><button id="openSettlementModalBtn" class="cash-credit-settlement-btn" type="button" disabled><span class="settlement-3d-icon" aria-hidden="true">💸</span><span>${L("Cash / Credit Settlement","تسوية الكاش / الكريدت")}</span></button></div><div class="panel driver-account-finance-panel ov-saved-settlements-page-end"><div id="ovSavedSettlements"></div></div></div>
    <div id="ovSettlementModal" class="driver-settlement-modal-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="ovSettlementModalTitle">
      <div class="panel driver-settlement-panel driver-settlement-modal">
      <div class="section-title-row"><div><h3 id="ovSettlementModalTitle" style="margin:0">${L("Cash / Credit Settlement","تسوية الكاش / الكريدت")}</h3></div><div class="driver-settlement-modal-actions"><span id="ovSettlementDriverName" class="badge">—</span><button id="closeSettlementModalBtn" class="ghost" type="button" aria-label="Close">×</button></div></div>
      <div class="driver-finance-grid settlement-grid settlement-grid-compact">
        <label>${L("Expenses","المصاريف")}<input id="ovCashExpenseTotal" type="text" readonly value="${money(0)}"></label>
        <label>${L("Amount","المبلغ")}<input id="ovSettlementDue" type="text" readonly value="${money(0)}" title="${L("Same value shown in Previous Settlements","نفس القيمة الموجودة في التسويات السابقة")}"></label>
        <label>${L("Cash","كاش")}<input id="ovSettlementCash" type="number" min="0" step="0.01" value="0" readonly aria-readonly="true" title="${L("Automatically calculated: Amount − Credit","يُحسب تلقائيًا: المبلغ − الكريدت")}"></label>
        <label>${L("Credit","كريدت")}<input id="ovSettlementCredit" type="number" min="0" step="0.01" value="" placeholder="0.00" title="${L("Enter Credit; Cash is calculated automatically as Amount minus Credit","أدخل الكريدت؛ الكاش يُحسب تلقائيًا = المبلغ ناقص الكريدت")}"></label>
        <input id="ovSettlementDate" type="hidden" value="${today()}">
        <input id="ovPreviousSettlements" type="hidden" value="${money(0)}">
        <input id="ovCashCollectedTotal" type="hidden" value="${money(0)}">
        <input id="ovNetCashTotal" type="hidden" value="${money(0)}">

        <div class="actions finance-actions"><button id="ovSettlementSave" type="button">✓ ${L("Save Settlement","حفظ التسوية")}</button></div>
      </div>
      <div id="ovSettlementMsg" class="msg"></div>
      </div>
    </div>
  </div>`;

  const driverSelect=$("ovDriver");
  const settlementOpenButton=$("openSettlementModalBtn");
  const syncDriverSelection=()=>{
    const selected=Boolean(driverSelect?.value);
    const selectedDate=$('ovStatementDate')?.value||today();
    const settlementAlreadySaved=ovSavedSettlementsCache.some(st=>String(st.driver_id)===String(driverSelect?.value||'')&&driverSettlementCalendarDay(st.paid_at||st.created_at)===selectedDate);
    if(settlementOpenButton)settlementOpenButton.disabled=!selected||settlementAlreadySaved;
    const verifyButton=$("verifyAllBtn"); if(verifyButton){verifyButton.disabled=!selected;verifyButton.title=selected?L("Verify selected orders","اعتماد الأوردرات المحددة"):L("Select a driver before verifying orders","اختر اسم المندوب قبل اعتماد الأوردرات");}
  };
  const syncExpenseDriver=()=>{void loadOrdersVerificationExpenses(); void loadOrdersVerificationSettlement();};
  syncDriverSelection();
  driverSelect?.addEventListener("change",()=>{syncDriverSelection();const m=$("ovSettlementModal");if(m)m.hidden=true;syncExpenseDriver();void loadOrdersVerification();});
  $("ovSettlementCredit")?.addEventListener("input",()=>updateOrdersVerificationSettlementBalance("ovSettlementCredit"));
  $("ovSettlementCash")?.addEventListener("input",()=>updateOrdersVerificationSettlementBalance("ovSettlementCash"));
  $("ovSettlementSave")?.addEventListener("click",()=>void saveOrdersVerificationSettlement());
  $("openSettlementModalBtn")?.addEventListener("click",()=>{const m=$("ovSettlementModal");if(m)m.hidden=false;void loadOrdersVerificationSettlement();});
  $("closeSettlementModalBtn")?.addEventListener("click",()=>{const m=$("ovSettlementModal");if(m)m.hidden=true;});
  $("ovSettlementModal")?.addEventListener("click",e=>{if(e.target===$("ovSettlementModal"))$("ovSettlementModal").hidden=true;});
  $("ovExpenseSaveTop")?.addEventListener("click",()=>void saveOrdersVerificationExpense());
  $("verifyAllBtn")?.addEventListener("click",()=>void verifyAllOrdersVerification());
  $("refreshDriverAccountBtn")?.addEventListener("click",()=>void refreshDriverAccountData());
  let searchTimer;
  $("ovSearch")?.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void loadOrdersVerification(),250);});
  ["ovStatus","ovVerification"].forEach(id=>$(id)?.addEventListener("change",()=>void loadOrdersVerification()));
  $("ovStatementDate")?.addEventListener("change",()=>{renderOrdersVerificationSavedSettlementsAll(ovSavedSettlementsCache);syncDriverSelection();void loadOrdersVerification();void loadOrdersVerificationExpenses();void loadOrdersVerificationSettlement();});
  $("ovExpenseCancel")?.addEventListener("click",resetOrdersVerificationExpenseForm);
  await loadOrdersVerification();
  await loadOrdersVerificationExpenses();
  await loadOrdersVerificationSettlement();
}

async function driverExpensesPage(c){
  const drivers=(await api('/api/drivers').catch(()=>({data:[]}))).data||[];
  c.innerHTML=`<h2 style="margin:0 0 10px">${L('Expenses','المصاريف')}</h2><div class="panel" style="padding:12px 14px"><div style="margin-bottom:9px"><label style="display:block;font-weight:700">${L('Search','بحث')}<input id="expPageSearch" type="search" placeholder="${esc(L('Details / notes / driver','التفاصيل / الملاحظات / المندوب'))}" style="display:block;width:100%;min-height:40px;margin-top:4px"></label></div><div class="driver-expense-filter-row" style="display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:9px;align-items:end">
  <label>${L('Driver','المندوب')}<select id="expPageDriver" style="width:100%"><option value="">${L('All Drivers','كل المندوبين')}</option>${drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name||'')} ${d.driver_no?`— ${esc(d.driver_no)}`:''}</option>`).join('')}</select></label>
  <label>${L('From','من')}<input id="expPageFrom" type="date" value="" style="width:100%"></label><label>${L('To','إلى')}<input id="expPageTo" type="date" value="" style="width:100%"></label>
  <label>${L('Filter Type','فلترة النوع')}<select id="expPageType" style="width:100%"><option value="all">${L('All','الكل')}</option><option value="petrol">${L('Fuel / Petrol','بنزين')}</option><option value="maintenance">${L('Maintenance','صيانة')}</option><option value="commission">${L('Commission','عمولة')}</option><option value="loading">${L('Loading','تحميل')}</option><option value="parking">${L('Parking','موقف')}</option><option value="other">${L('Other','أخرى')}</option></select></label></div><div id="expPageSummary" class="muted" style="margin:9px 0"></div><div id="expPageTable"></div></div><style>@media(max-width:760px){.driver-expense-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:440px){.driver-expense-filter-row{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  ['expPageDriver','expPageFrom','expPageTo','expPageType'].forEach(id=>$(id)?.addEventListener('change',()=>void loadDriverExpensesPage()));
  $('expPageSearch')?.addEventListener('input',()=>void loadDriverExpensesPage()); await loadDriverExpensesPage();
}
let DRIVER_EXPENSES_PAGE_ROWS=[];
async function loadDriverExpensesPage(){const box=$('expPageTable');if(!box)return;try{const driver=$('expPageDriver')?.value||'',from=$('expPageFrom')?.value||'',to=$('expPageTo')?.value||'';let url='/api/accounting/driver-expenses?'+new URLSearchParams({driver_id:driver,from,to});const d=await api(url);let rows=d.data||[];const type=$('expPageType')?.value||'all',q=($('expPageSearch')?.value||'').trim().toLowerCase();if(type!=='all')rows=rows.filter(e=>String(e.expense_type||'').toLowerCase()===type);if(q)rows=rows.filter(e=>[e.driver_name,e.driver_no,e.details,e.notes,e.expense_type,e.category].some(v=>String(v||'').toLowerCase().includes(q)));DRIVER_EXPENSES_PAGE_ROWS=rows;const total=rows.reduce((n,e)=>n+Number(e.amount||0),0);$('expPageSummary').textContent=`${L('Records','عدد السجلات')}: ${rows.length} — ${L('Total expenses','إجمالي المصروفات')}: ${money(total)}`;box.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>${L('Date','التاريخ')}</th><th>${L('Driver','المندوب')}</th><th>${L('Type','النوع')}</th><th>${L('Category','التصنيف')}</th><th>${L('Details','التفاصيل')}</th><th>${L('Amount','المبلغ')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(String(e.expense_date||'').slice(0,10))}</td><td>${esc(e.driver_name||'—')}${e.driver_no?`<small class="muted"><br>${esc(e.driver_no)}</small>`:''}</td><td>${esc(e.expense_type||'')}</td><td>${esc(e.category||'expense')}</td><td>${esc(e.details||e.notes||'')}</td><td><b>${money(e.amount||0)}</b></td><td>${e.can_edit===false?`<span class="muted" title="${esc(e.edit_locked_reason||L('Locked after settlement','مقفل بعد التسوية'))}">🔒</span>`:`<button class="mini-btn ghost" type="button" onclick="editDriverExpensesPage('${esc(e.id)}')">✎</button>`}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L('No expenses found.','لا توجد مصروفات.')}</p>`;}catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}}
async function editDriverExpensesPage(id){
  const e=DRIVER_EXPENSES_PAGE_ROWS.find(x=>String(x.id)===String(id));if(!e)return;
  if(e.can_edit===false){if(typeof toast==='function')toast(e.edit_locked_reason||L('This expense is locked after settlement','المصروف مقفول بعد التسوية'));return;}
  document.getElementById('editDriverExpenseModal')?.remove();
  const modal=document.createElement('div');modal.id='editDriverExpenseModal';modal.className='dashboard-action-modal';
  modal.innerHTML=`<div class="dashboard-action-modal-card" style="width:min(480px,calc(100vw - 24px));max-height:90vh;overflow:auto"><h3>${L('Edit driver expense','تعديل مصروف المندوب')}</h3><form id="editDriverExpenseForm"><label>${L('Category','التصنيف')}<select id="editExpCategory"><option value="expense">${L('Expense','مصروف')}</option><option value="shortage">${L('Shortage','عجز')}</option></select></label><label style="display:block;margin-top:10px">${L('Details','التفاصيل')}<textarea id="editExpDetails" rows="3">${esc(e.details||'')}</textarea></label><div id="editExpMsg" class="msg"></div><div class="actions"><button type="button" class="ghost" onclick="document.getElementById('editDriverExpenseModal')?.remove()">${L('Cancel','إلغاء')}</button><button type="submit">${L('Save changes','حفظ التعديلات')}</button></div></form></div>`;
  document.body.appendChild(modal);$('editExpCategory').value=e.category||'expense';
  $('editDriverExpenseForm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=ev.submitter;if(btn)btn.disabled=true;try{await api('/api/accounting/driver-expenses',{method:'PATCH',body:JSON.stringify({id:e.id,category:$('editExpCategory').value,details:$('editExpDetails').value})});modal.remove();await loadDriverExpensesPage();}catch(err){$('editExpMsg').textContent=err.message||L('Could not update expense','تعذر تعديل المصروف');$('editExpMsg').className='msg error';if(btn)btn.disabled=false;}});
}
async function deleteDriverExpensesPage(id){if(!await showConfirmModal(L('Delete expense?','حذف المصروف؟')))return;try{await api('/api/accounting/driver-expenses',{method:'DELETE',body:JSON.stringify({id})});await loadDriverExpensesPage();}catch(e){alert(e.message);}}

let ORDERS_VERIFICATION_CACHE=[];
async function loadOrdersVerification(){
  const box=$('ordersVerificationTable');
  if(!box)return;
  try{
    const qs=new URLSearchParams({
      q:$('ovSearch')?.value||'',
      driver_id:$('ovDriver')?.value||'',
      status:$('ovStatus')?.value||'all',
      verification:$('ovVerification')?.value||'all',
      statement_date:$('ovStatementDate')?.value||today()
    });
    const d=await api('/api/orders-verification?'+qs.toString());
    const rows=d.data||[];
    const selectedDriver=Boolean($('ovDriver')?.value);
    ORDERS_VERIFICATION_CACHE=rows;
    const verifiedCount=rows.filter(r=>r.verification_status==='verified').length, unverifiedCount=rows.length-verifiedCount;
    const topStats=$('verificationTopStats'); if(topStats)topStats.innerHTML=`<span>${L('Orders','الأوردرات')} <b>${rows.length}</b></span><span class="green">${L('Verified','تم الاعتماد')} <b>${verifiedCount}</b></span><span class="red">${L('Unverified','غير معتمد')} <b>${unverifiedCount}</b></span>`;
    if(!rows.length){box.innerHTML=`<div class="panel"><p class="muted">${L('No orders found.','لا توجد أوردرات.')}</p></div>`;return;}
    box.innerHTML=`<div class="panel accounting-verify-table-wrap"><div class="table-wrap"><table class="accounting-verify-table"><thead><tr><th><input type="checkbox" id="ovSelectAll"></th><th>Job Code</th><th>Tracking</th><th>${L('Driver','المندوب')}</th><th>${L('Shipper / Code','التاجر / الكود')}</th><th>${L('Customer','العميل')}</th><th>${L('Order Value','قيمة الأوردر')}</th><th>${L('Delivery Fee','رسوم التوصيل')}</th><th>${L('Status 1','الحالة 1')}</th><th>${L('Status 2','الحالة 2')}</th><th>${L('Verification','الاعتماد')}</th><th>${L('Action','الإجراء')}</th></tr></thead><tbody>${rows.map(r=>`<tr class="verify-row-${r.verification_status==='verified'?'verified':'unverified'}"><td><input class="ov-order-check" type="checkbox" value="${esc(r.id)}" ${(r.verification_status==='verified'||r.paid_status==='paid'||!r.verify_eligible||!selectedDriver)?'disabled':''}></td><td><b>${esc(r.job_code||'—')}</b></td><td><b>${esc(r.tracking_number||r.order_code||'')}</b><small class="muted"><br>${esc(r.shipment_no||'')}</small></td><td>${esc(r.driver_name||'—')}<small class="muted"><br>${esc(r.driver_no||'')}</small></td><td><div class="ops-main-text">${esc(r.merchant_name||'—')}</div><small class="muted">${esc(r.merchant_code||'')}</small></td><td>${esc(r.customer_name||'')}<small class="muted"><br>${esc(r.customer_phone||'')}</small></td><td class="driver-account-value-cell">${money(r.order_amount??r.cod??0,{withCode:false})}</td><td class="driver-account-value-cell">${money(r.delivery_fee||0,{withCode:false})}</td><td class="driver-account-status-cell">${esc(r.status||'')}</td><td class="driver-account-status-cell">${esc(r.secondary_status||'—')}</td><td>${r.paid_status==='paid'?'<span class="verify-badge paid-pill">Paid</span>':`<span class="verify-badge ${r.verification_status==='verified'?'verified-badge':'unverified-badge'}">${r.verification_status==='verified'?L('Verified','تم الاعتماد'):L('Unverified','غير معتمد')}</span>`}</td><td><button class="mini-btn ghost" title="${L('Edit delivery fee; paid orders allow fee only','تعديل رسوم التوصيل؛ الأوردر المدفوع يسمح بالرسوم فقط')}" type="button" onclick="editOrdersVerificationOrder('${esc(r.id)}')">✎</button> ${selectedDriver&&r.verify_eligible&&r.verification_status!=='verified'?`<button class="mini-btn" title="${L('Verify','اعتماد')}" type="button" onclick="verifyOneOrdersVerification('${esc(r.id)}')">✓</button> `:''}${r.verification_status==='verified'&&r.paid_status!=='paid'?`<button class="mini-btn ghost" title="${L('Cancel verification','إلغاء الاعتماد')}" type="button" onclick="unverifyOneOrdersVerification('${esc(r.id)}')">↶</button> `:''}${r.paid_status==='paid'?`<span class="muted" title="${L('Paid orders cannot be removed','لا يمكن إخراج الأوردر المدفوع من الكشف')}">—</span>`:`<button class="mini-btn danger" title="${L('Remove','إخراج')}" type="button" onclick="removeVerificationOrder('${esc(r.id)}')">×</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    $('ovSelectAll')?.addEventListener('change',e=>document.querySelectorAll('.ov-order-check:not(:disabled)').forEach(x=>x.checked=!!e.target.checked));
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message||'Failed to load Orders Verification')}</div>`;}
}
async function editOrdersVerificationOrder(id){
  const r=ORDERS_VERIFICATION_CACHE.find(x=>String(x.id)===String(id)); if(!r)return;
  document.getElementById('editOrdersVerificationOrderDialog')?.remove();
  const choices=[['Delivered','Delivered'],['Half Delivered','Half Delivered'],['Replaced','Replace'],['Cancelled by Shipper','Cancelled by Shipper'],['Cancelled by Receiver','Cancelled by Receiver']];
  const current=String(r.status||'').toLowerCase();
  const selected=choices.find(x=>x[0].toLowerCase()===current || (x[0]==='Replaced'&&current==='replace'))||choices[0];
  const isPaid=String(r.paid_status||'').toLowerCase()==='paid'||String(r.commission_paid_status||'').toLowerCase()==='paid'||String(r.cash_collection_status||'').toLowerCase()==='paid'||String(r.payment_status||'').toLowerCase()==='paid';
  const modal=document.createElement('div'); modal.id='editOrdersVerificationOrderDialog'; modal.className='dashboard-action-modal';
  modal.innerHTML=`<div class="dashboard-action-modal-card" style="width:min(340px,calc(100vw - 28px));padding:14px;box-sizing:border-box" dir="${LANG==='ar'?'rtl':'ltr'}">
    <h3 style="font-size:16px;margin:0 0 10px">${L('Edit driver statement order','تعديل أوردر كشف المندوب')}</h3>
    ${isPaid?`<p class="muted" style="font-size:12px;margin:0 0 8px">${L('Paid order: only delivery fee can be changed.','أوردر Paid: المسموح تعديله هو رسوم التوصيل فقط.')}</p>`:`<label style="margin:7px 0;font-size:12px">${L('Status','الحالة')}<select id="ovEditOrderStatus" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px;border:1px solid #d7dce5;border-radius:8px;background:#fff">${choices.map(x=>`<option value="${esc(x[0])}" ${x[0]===selected[0]?'selected':''}>${esc(L(x[0],x[1]))}</option>`).join('')}</select></label>`}
    <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px">
      <label style="font-size:11px;margin:0">${L('Delivery Fee','رسوم التوصيل')}<input id="ovEditDeliveryFee" type="number" min="0" step="0.01" value="${esc(String(r.delivery_fee??0))}" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px;border:1px solid #d7dce5;border-radius:8px"></label>
      ${isPaid?'':`<label style="font-size:11px;margin:0">${L('Order Price','السعر')}<input id="ovEditOrderValue" type="number" min="0" step="0.01" value="${esc(String(r.order_amount??r.cod??0))}" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px;border:1px solid #d7dce5;border-radius:8px"></label>`}
    </div>
    <div class="actions" style="margin-top:12px;gap:7px"><button type="button" class="ghost" id="ovEditOrderCancel">${L('Cancel','إلغاء')}</button><button type="button" id="ovEditOrderSave">${L('Save','حفظ')}</button></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#ovEditOrderCancel').onclick=()=>modal.remove();
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('#ovEditOrderSave').onclick=async()=>{
    const fee=modal.querySelector('#ovEditDeliveryFee').value;
    if(fee.trim()===''||!Number.isFinite(Number(fee))||Number(fee)<0)return alert(L('Enter a valid non-negative delivery fee.','أدخل رسوم توصيل صحيحة غير سالبة.'));
    const payload={id,delivery_fee:Number(fee)};
    if(!isPaid){const value=modal.querySelector('#ovEditOrderValue').value,status=modal.querySelector('#ovEditOrderStatus').value;if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0)return alert(L('Enter a valid non-negative order value.','أدخل قيمة أوردر صحيحة غير سالبة.'));payload.cod=Number(value);payload.status=status;}
    const save=modal.querySelector('#ovEditOrderSave'); save.disabled=true; save.textContent=L('Saving...','جارٍ الحفظ...');
    try{await api('/api/orders-verification/edit',{method:'POST',body:JSON.stringify(payload)});modal.remove();msg('ordersVerificationMsg',L('Order updated successfully.','تم تعديل الأوردر بنجاح.'),'ok');await loadOrdersVerification();await loadOrdersVerificationSettlement();}
    catch(e){save.disabled=false;save.textContent=L('Save','حفظ');msg('ordersVerificationMsg',e.message,'error');}
  };
}

async function verifyOneOrdersVerification(id){const driverId=$("ovDriver")?.value||"";if(!driverId)return msg('ordersVerificationMsg',L('Select a driver before verifying orders.','اختر اسم المندوب قبل اعتماد الأوردرات.'),'error');try{await api('/api/orders-verification/verify',{method:'POST',body:JSON.stringify({driver_id:driverId,statement_date:$('ovStatementDate')?.value||today(),order_ids:[id]})});msg('ordersVerificationMsg',L('Order verified successfully.','تم اعتماد الأوردر بنجاح.'),'ok');await loadOrdersVerification();await loadOrdersVerificationSettlement();}catch(e){msg('ordersVerificationMsg',e.message,'error');}}
async function unverifyOneOrdersVerification(id){
  if(!await showConfirmModal(L('Cancel verification for this order?','إلغاء اعتماد هذا الأوردر؟')))return;
  try{await api('/api/orders-verification/unverify',{method:'POST',body:JSON.stringify({id})});msg('ordersVerificationMsg',L('Verification cancelled.','تم إلغاء اعتماد الأوردر.'),'ok');await loadOrdersVerification();await loadOrdersVerificationSettlement();}catch(e){msg('ordersVerificationMsg',e.message,'error');}
}
async function refreshDriverAccountData(){
  const button=$("refreshDriverAccountBtn");
  if(button?.disabled)return;
  if(button){button.disabled=true;button.classList.add("is-refreshing");button.textContent="⟳";}
  try{
    await Promise.all([loadOrdersVerification(),loadOrdersVerificationExpenses(),loadOrdersVerificationSettlement()]);
  }finally{
    if(button){button.disabled=false;button.classList.remove("is-refreshing");button.textContent="↻";}
  }
}

async function verifyAllOrdersVerification(){
  const driverId=$("ovDriver")?.value||"";
  if(!driverId)return msg('ordersVerificationMsg',L('Select a driver before verifying orders.','اختر اسم المندوب قبل اعتماد الأوردرات.'),'error');
  let ids=[...document.querySelectorAll('.ov-order-check:checked')].map(x=>x.value).filter(Boolean);
  if(!ids.length)ids=[...document.querySelectorAll('.ov-order-check:not(:disabled)')].map(x=>x.value).filter(Boolean);
  if(!ids.length)return msg('ordersVerificationMsg',L('No eligible orders to verify.','لا توجد أوردرات متاحة للاعتماد.'),'error');
  try{const d=await api('/api/orders-verification/verify',{method:'POST',body:JSON.stringify({driver_id:driverId,statement_date:$('ovStatementDate')?.value||today(),order_ids:ids})});msg('ordersVerificationMsg',d.message||L('Orders verified successfully.','تم اعتماد الأوردرات بنجاح.'),'ok');await loadOrdersVerification();}catch(e){msg('ordersVerificationMsg',e.message,'error');}
}
async function removeVerificationOrder(id){
  if(!await showConfirmModal(L('Remove this order from the driver statement?','هل تريد إخراج هذا الأوردر من كشف المندوب؟')))return;
  try{await api('/api/orders-verification/remove',{method:'POST',body:JSON.stringify({id})});msg('ordersVerificationMsg',L('Order removed from statement.','تم إخراج الأوردر من كشف المندوب.'),'ok');await loadOrdersVerification();}catch(e){msg('ordersVerificationMsg',e.message,'error');}
}
function resetOrdersVerificationExpenseForm(){
  ["ovExpenseId","ovExpenseAmountEdit","ovExpenseDetails","ovExpenseNotes"].forEach(id=>{const el=$(id);if(el)el.value="";});
  if($("ovExpenseDate"))$("ovExpenseDate").value=today();
  if($("ovExpenseType"))$("ovExpenseType").value="petrol";
  if($("ovExpenseCategory"))$("ovExpenseCategory").value="expense";
  const btn=$("ovExpenseSaveTop"); if(btn)btn.textContent=`+ ${L("Add Expense","إضافة مصروف")}`;
  const cancel=$("ovExpenseCancel"); if(cancel)cancel.style.display="none";
}
let ORDERS_VERIFICATION_EXPENSES=[];
async function loadOrdersVerificationExpenses(){
  const box=$("ovExpensesTable"), driver=$("ovDriver")?.value||""; if(!box)return;
  try{
    if(!driver){box.innerHTML=`<p class="muted">${L("Select a driver to manage expenses.","اختر مندوبًا لإدارة مصروفاته.")}</p>`;if($("ovExpenseTotalBadge"))$("ovExpenseTotalBadge").textContent=money(0);return;}
    const statementDate=$("ovStatementDate")?.value||today();
    const d=await api(`/api/accounting/driver-expenses?driver_id=${encodeURIComponent(driver)}&from=${encodeURIComponent(statementDate)}&to=${encodeURIComponent(statementDate)}`);
    let rows=(d.data||[]).filter(e=>String(e.expense_date||e.created_at||"").slice(0,10)===statementDate);
    ORDERS_VERIFICATION_EXPENSES=rows;
    const total=rows.reduce((sum,e)=>sum+Number(e.amount||0),0);
    if($("ovExpenseTotalBadge"))$("ovExpenseTotalBadge").textContent=money(total);
    if(!rows.length){box.innerHTML=`<p class="muted">${L("No expenses found for the selected date.","لا توجد مصروفات في التاريخ المحدد.")}</p>`;return;}
    box.innerHTML=`<div class="table-wrap compact-finance-table"><table><thead><tr><th>${L("Date","التاريخ")}</th><th>${L("Type","النوع")}</th><th>${L("Details","التفاصيل")}</th><th>${L("Amount","المبلغ")}</th><th>${L("Actions","الإجراءات")}</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(e.expense_date||"")}</td><td>${esc(e.expense_type||"")} ${e.category==='shortage'?`<span class="badge">${L("Shortage","عجز")}</span>`:""}</td><td>${esc(e.details||e.notes||"")}</td><td><b>${money(e.amount||0)}</b></td><td>${e.can_edit===false?`<span class="muted" title="${esc(e.edit_locked_reason||L('Locked after settlement','مقفل بعد التسوية'))}">🔒</span>`:`<button class="mini-btn ghost" title="${L('Edit expense','تعديل المصروف')}" type="button" onclick="editOrdersVerificationExpense('${esc(e.id)}')">✎</button> <button class="mini-btn danger" title="${L('Delete expense','حذف المصروف')}" type="button" onclick="deleteOrdersVerificationExpense('${esc(e.id)}')">×</button>`}</td></tr>`).join("")}</tbody></table></div>`;
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
async function saveOrdersVerificationExpense(){
  const id=$("ovExpenseId")?.value||"", driver=$("ovDriver")?.value||"", amount=baseAmount($("ovExpenseAmountEdit")?.value||0);
  if(!driver)return msg("ovExpenseMsg",L("Select a driver first.","اختر المندوب أولاً."),"error");
  if(amount<=0)return msg("ovExpenseMsg",L("Enter a valid expense amount.","أدخل مبلغ مصروف صحيح."),"error");
  const body={id,driver_id:driver,expense_type:$("ovExpenseType")?.value||"other",category:$("ovExpenseCategory")?.value||"expense",amount,expense_date:$("ovExpenseDate")?.value||today(),details:$("ovExpenseDetails")?.value||"",notes:$("ovExpenseNotes")?.value||""};
  try{
    const d=await api('/api/accounting/driver-expenses',{method:id?'PATCH':'POST',body:JSON.stringify(body)});
    msg("ovExpenseMsg",id?L("Expense updated successfully.","تم تعديل المصروف بنجاح."):L("Expense added successfully.","تم إضافة المصروف بنجاح."),"ok");
    resetOrdersVerificationExpenseForm();
    await loadOrdersVerificationExpenses();
    await loadOrdersVerificationSettlement();
  }catch(e){msg("ovExpenseMsg",e.message,"error");}
}
function editOrdersVerificationExpense(id){
  const e=ORDERS_VERIFICATION_EXPENSES.find(x=>String(x.id)===String(id));if(!e)return;
  if(e.can_edit===false){msg('ovExpenseMsg',e.edit_locked_reason||L('This expense is locked after settlement','المصروف مقفول بعد التسوية'),'error');return;}
  document.getElementById('editOrdersVerificationExpenseModal')?.remove();
  const modal=document.createElement('div');modal.id='editOrdersVerificationExpenseModal';modal.className='dashboard-action-modal';
  modal.innerHTML=`<div class="dashboard-action-modal-card" style="width:min(460px,calc(100vw - 24px));max-height:90vh;overflow:auto"><h3>${L('Edit driver expense','تعديل مصروف المندوب')}</h3><form id="editOrdersVerificationExpenseForm"><label>${L('Category','التصنيف')}<select id="ovEditExpenseCategory"><option value="expense">${L('Expense','مصروف')}</option><option value="shortage">${L('Shortage','عجز')}</option></select></label><label style="display:block;margin-top:10px">${L('Amount','المبلغ')}<input id="ovEditExpenseAmount" type="number" min="0.01" step="0.01" required value="${esc(String(e.amount??0))}"></label><label style="display:block;margin-top:10px">${L('Details','التفاصيل')}<textarea id="ovEditExpenseDetails" rows="3">${esc(e.details||'')}</textarea></label><div id="ovEditExpenseMsg" class="msg"></div><div class="actions"><button type="button" class="ghost" onclick="document.getElementById('editOrdersVerificationExpenseModal')?.remove()">${L('Cancel','إلغاء')}</button><button type="submit">${L('Save changes','حفظ التعديلات')}</button></div></form></div>`;
  document.body.appendChild(modal);$('ovEditExpenseCategory').value=e.category||'expense';
  $('editOrdersVerificationExpenseForm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=ev.submitter,amount=Number($('ovEditExpenseAmount')?.value);if(!Number.isFinite(amount)||amount<=0){$('ovEditExpenseMsg').textContent=L('Enter a valid expense amount.','أدخل مبلغ مصروف صحيح.');$('ovEditExpenseMsg').className='msg error';return;}if(btn)btn.disabled=true;try{await api('/api/accounting/driver-expenses',{method:'PATCH',body:JSON.stringify({id:e.id,category:$('ovEditExpenseCategory').value,amount,details:$('ovEditExpenseDetails').value})});modal.remove();await loadOrdersVerificationExpenses();await loadOrdersVerificationSettlement();}catch(err){$('ovEditExpenseMsg').textContent=err.message||L('Could not update expense','تعذر تعديل المصروف');$('ovEditExpenseMsg').className='msg error';if(btn)btn.disabled=false;}});
}
async function deleteOrdersVerificationExpense(id){
  if(!await showConfirmModal(L("Delete expense?","حذف المصروف؟")))return;
  try{await api('/api/accounting/driver-expenses',{method:'DELETE',body:JSON.stringify({id})});msg("ovExpenseMsg",L("Expense deleted successfully.","تم حذف المصروف بنجاح."),"ok");await loadOrdersVerificationExpenses();await loadOrdersVerificationSettlement();}catch(e){msg("ovExpenseMsg",e.message,"error");}
}

async function loadOrdersVerificationDriverExpenses(){
  const summaryBox=$("ovDriverSummary"), tableBox=$("ovDriverExpenses");
  if(!summaryBox||!tableBox)return;
  try{
    const d=await api(`/api/accounting/driver-expenses-summary?from=${encodeURIComponent(today())}&to=${encodeURIComponent(today())}&driver_id=`);
    const rows=d.data||[];
    const totalFuel=rows.reduce((sum,r)=>sum+Number(r.fuel_expense||0),0), totalOther=rows.reduce((sum,r)=>sum+Number(r.other_expenses||0),0), totalNet=rows.reduce((sum,r)=>sum+Number(r.net_commission||0),0);
    const totalCash=rows.reduce((sum,r)=>sum+Number(r.shipper_cod||0),0);
    summaryBox.innerHTML=`<div class="grid verify-stats"><div class="stat"><span>${L("Drivers with activity","مندوبون لديهم حركة")}</span><b>${rows.length}</b></div><div class="stat"><span>${L("Cash from Drivers","الكاش من المندوب")}</span><b>${money(totalCash)}</b></div><div class="stat"><span>${L("Total Expenses","إجمالي المصروفات")}</span><b>${money(totalFuel+totalOther)}</b></div><div class="stat verify-stat-green"><span>${L("Net from Drivers","الصافي من المندوب")}</span><b>${money(totalNet)}</b></div></div>
    <div class="actions" style="margin:12px 0"><button class="ghost" type="button" onclick="printArea('ovDriverStatementPrint',${JSON.stringify(L('Driver Verification Statement','كشف مراجعة واعتماد المندوبين'))})">⎙ ${L('Print Statement','طباعة الكشف')}</button></div>`;
    tableBox.innerHTML=rows.length?`<div class="table-wrap"><table class="driver-expenses-linked-table"><thead><tr><th>${L("Driver","المندوب")}</th><th>${L("Verified Orders","الأوردرات المعتمدة")}</th><th>${L("Cash from Driver","الكاش من المندوب")}</th><th>${L("Service Charges","رسوم الخدمة")}</th><th>${L("Fuel Expense","بنزين")}</th><th>${L("Other Expenses","مصروفات أخرى")}</th><th>${L("Net from Driver","الصافي من المندوب")}</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.driver_name||"—")}</b>${r.driver_no?`<small class="muted"><br>${esc(r.driver_no)}</small>`:""}</td><td>${Number(r.verified_orders||0)}</td><td>${money(r.shipper_cod||0)}</td><td>${money(r.service_charges||0)}</td><td>− ${money(r.fuel_expense||0)}</td><td>− ${money(r.other_expenses||0)}</td><td><b>${money(r.net_commission||0)}</b></td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L("No verified orders or expenses found for today.","لا توجد أوردرات معتمدة أو مصروفات للمندوبين اليوم.")}</p>`;
  }catch(e){summaryBox.innerHTML=`<div class="error">${esc(e.message)}</div>`;}
}



/* ===== FRONTEND MODULE BOUNDARY ===== */

async function dailyCompanyReportPage(c){
  const d=today();
  c.innerHTML=`<h2>${L('Daily Company Report','التقرير اليومي للشركة')}</h2><div class="panel daily-company-report-panel"><div class="row daily-report-filters"><label>${L('From date','من تاريخ')}<input type="date" id="dailyReportFrom" value="${d}"></label><label>${L('To date','إلى تاريخ')}<input type="date" id="dailyReportTo" value="${d}"></label><button type="button" onclick="loadDailyCompanyReport()">${L('Show report','عرض التقرير')}</button><button type="button" class="ghost" onclick="setDailyReportToday()">${L('Today','اليوم')}</button></div><div id="dailyCompanyReportBody"><p class="muted">${L('Loading report…','جارٍ تحميل التقرير…')}</p></div></div>`;
  await loadDailyCompanyReport();
}
function setDailyReportToday(){const d=today();if($('dailyReportFrom'))$('dailyReportFrom').value=d;if($('dailyReportTo'))$('dailyReportTo').value=d;loadDailyCompanyReport();}

async function receivablePage(c){
 const d=today();
 c.innerHTML=`<h2>${L('Receivable','المستحقات')}</h2><div class="panel receivable-panel"><div class="row" style="gap:10px;align-items:end;flex-wrap:wrap"><label>${L('From date','من تاريخ')}<input type="date" id="receivableFrom" value="${d}"></label><label>${L('To date','إلى تاريخ')}<input type="date" id="receivableTo" value="${d}"></label><button type="button" onclick="loadReceivable()">${L('Show','عرض')}</button><button type="button" class="ghost" onclick="exportReceivable('pdf')">PDF</button><button type="button" class="ghost" onclick="exportReceivable('excel')">Excel</button></div><div id="receivableSummary" class="kpi-grid" style="margin:14px 0"></div><div id="receivableTable"><p class="muted">${L('Loading…','جارٍ التحميل…')}</p></div></div>`;
 await loadReceivable();
}
window.__receivableRows=[];
async function loadReceivable(){
 const box=$('receivableTable');if(!box)return;
 try{
  const from=$('receivableFrom')?.value||today(),to=$('receivableTo')?.value||today();
  const d=await api(`/api/accounting/receivable?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),rows=d.data||[];window.__receivableRows=rows;
  const sum=rows.reduce((a,r)=>({cash:a.cash+Number(r.cash_collected||0),credit:a.credit+Number(r.credit_collected||0),expenses:a.expenses+Number(r.total_expenses||0),fees:a.fees+Number(r.delivery_fees||0),pending:a.pending+Number(r.pending_orders||0)}),{cash:0,credit:0,expenses:0,fees:0,pending:0});
  $('receivableSummary').innerHTML=`<div class="shipper-fin-kpi blue"><span>${L('Drivers','المندوبون')}</span><b>${rows.length}</b></div><div class="shipper-fin-kpi green"><span>${L('Cash collected','الكاش المحصّل')}</span><b>${money(sum.cash)}</b></div><div class="shipper-fin-kpi blue"><span>${L('Credit collected','الكريدت المحصّل')}</span><b>${money(sum.credit)}</b></div><div class="shipper-fin-kpi orange"><span>${L('Total expenses','إجمالي المصاريف')}</span><b>${money(sum.expenses)}</b></div><div class="shipper-fin-kpi purple"><span>${L('Delivery fees','رسوم التوصيل')}</span><b>${money(sum.fees)}</b></div>`;
  box.innerHTML=rows.length?`<div class="table-wrap"><table class="driver-expenses-linked-table"><thead><tr><th><input type="checkbox" id="receivableSelectAll" onchange="toggleReceivableAll(this.checked)" aria-label="select all"></th><th>${L('Driver','المندوب')}</th><th>${L('Driver code','كود المندوب')}</th><th>${L('Cash collected','الكاش المحصّل')}</th><th>${L('Credit collected','الكريدت المحصّل')}</th><th>${L('Expenses','المصاريف')}</th><th>${L('Delivery fees','رسوم التوصيل')}</th><th>${L('Settlement status','حالة التسوية')}</th><th>${L('Orders','الأوردرات')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td><input type="checkbox" class="receivable-check" value="${esc(r.driver_id)}" checked></td><td><b>${esc(r.driver_name||'—')}</b></td><td>${esc(r.driver_no||'—')}</td><td>${money(r.cash_collected||0)}</td><td>${money(r.credit_collected||0)}</td><td>${money(r.total_expenses||0)}</td><td>${money(r.delivery_fees||0)}</td><td>${Number(r.pending_orders||0)>0?`<span class="badge" style="background:#fff1f0;color:#b42318">${L('Not settled','لم تتم التسوية')} (${Number(r.pending_orders)})</span>`:`<span class="badge">${L('Settled / no pending orders','تمت التسوية / لا توجد مستحقات معلقة')}</span>`}</td><td><button class="mini-btn ghost" onclick="showReceivableOrders('${esc(r.driver_id)}')">${Number(r.pending_orders||0)} ${L('pending','معلق')}</button></td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">${L('Total','الإجمالي')}</th><th>${money(sum.cash)}</th><th>${money(sum.credit)}</th><th>${money(sum.expenses)}</th><th>${money(sum.fees)}</th><th colspan="2">${sum.pending} ${L('unsettled orders','أوردر غير مسوّى')}</th></tr></tfoot></table></div><div id="receivableDetails" class="panel" hidden></div>`:`<p class="muted">${L('No driver receivable records for this period.','لا توجد مستحقات للمندوبين في الفترة المحددة.')}</p>`;
 }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function toggleReceivableAll(v){document.querySelectorAll('.receivable-check').forEach(x=>x.checked=!!v)}
function showReceivableOrders(driverId){const r=(window.__receivableRows||[]).find(x=>String(x.driver_id)===String(driverId));const box=$('receivableDetails');if(!r||!box)return;box.hidden=false;box.innerHTML=`<h3>${L('Unsettled orders','الأوردرات التي لم تتم تسويتها')} — ${esc(r.driver_name||'')}</h3><div class="table-wrap"><table><thead><tr><th>${L('Tracking','التتبع')}</th><th>${L('Order no.','رقم الأوردر')}</th><th>${L('Status','الحالة')}</th><th>${L('Date','التاريخ')}</th><th>${L('Delivery fee','رسوم التوصيل')}</th></tr></thead><tbody>${(r.pending_order_details||[]).map(o=>`<tr><td>${esc(o.tracking_number||'—')}</td><td>${esc(o.order_no||'—')}</td><td>${esc(o.status||'')}</td><td>${esc(o.date||'')}</td><td>${money(o.delivery_fee||0)}</td></tr>`).join('')}</tbody></table></div>`;box.scrollIntoView({behavior:'smooth',block:'nearest'});}
function exportReceivable(kind){const ids=new Set([...document.querySelectorAll('.receivable-check:checked')].map(x=>String(x.value)));const rows=(window.__receivableRows||[]).filter(r=>ids.has(String(r.driver_id)));if(!rows.length)return alert(L('Select at least one driver.','حدد مندوبًا واحدًا على الأقل.'));const from=$('receivableFrom')?.value||today(),to=$('receivableTo')?.value||today();const totals={cash:rows.reduce((n,r)=>n+Number(r.cash_collected||0),0),credit:rows.reduce((n,r)=>n+Number(r.credit_collected||0),0),expenses:rows.reduce((n,r)=>n+Number(r.total_expenses||0),0),fees:rows.reduce((n,r)=>n+Number(r.delivery_fees||0),0)};const summary=[['Receivable',from+' — '+to],['Driver','Code','Cash collected','Credit collected','Expenses','Delivery fees','Pending orders'],...rows.map(r=>[r.driver_name,r.driver_no,r.cash_collected,r.credit_collected,r.total_expenses,r.delivery_fees,r.pending_orders]),['TOTAL','',totals.cash,totals.credit,totals.expenses,totals.fees,rows.reduce((n,r)=>n+Number(r.pending_orders||0),0)],['Expense details'],['Driver','Date','Type','Details','Amount'],...rows.flatMap(r=>(r.expense_details||[]).map(e=>[r.driver_name,e.date,e.type,e.details,e.amount]))];if(kind==='excel'){const csv='\ufeff'+summary.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`receivable-${from}-${to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);return;}const w=window.open('','_blank','width=1100,height=800');if(!w)return;const escCell=v=>esc(String(v??''));const table=(title,head,body)=>`<h3>${title}</h3><table><thead><tr>${head.map(x=>`<th>${escCell(x)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map(x=>`<td>${escCell(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>Receivable</title><style>body{font-family:Arial,Tahoma;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{border:1px solid #bbb;padding:7px;text-align:center;font-size:12px}th{background:#eef2f7}h2,h3{margin:12px 0}</style></head><body>${companyPrintBrandHeader()}<h2>Receivable — ${esc(from)} — ${esc(to)}</h2>${table('Driver summary',summary[1],rows.map(r=>[r.driver_name,r.driver_no,r.cash_collected,r.credit_collected,r.total_expenses,r.delivery_fees,r.pending_orders]).concat([['TOTAL','',totals.cash,totals.credit,totals.expenses,totals.fees,rows.reduce((n,r)=>n+Number(r.pending_orders||0),0)]]))}${table('Expense details',['Driver','Date','Type','Details','Amount'],rows.flatMap(r=>(r.expense_details||[]).map(e=>[r.driver_name,e.date,e.type,e.details,e.amount])))}<script>window.onload=()=>window.print()</script></body></html>`);w.document.close();}

function dailyReportOrdersTable(rows){
  window.__dailyCompanyReportOrderRows=Array.isArray(rows)?rows:[];
  const all=window.__dailyCompanyReportOrderRows;
  if(!all.length)return `<p class="muted">${L('No orders included in this period.','لا توجد أوردرات محتسبة في الفترة المحددة.')}</p>`;
  const pageSize=25;
  const page=Math.max(1,Math.min(Number(window.__dailyCompanyReportOrdersPage||1),Math.ceil(all.length/pageSize)));
  window.__dailyCompanyReportOrdersPage=page;
  const start=(page-1)*pageSize, visible=all.slice(start,start+pageSize), pages=Math.ceil(all.length/pageSize);
  return `<div id="dailyReportOrdersTableHost"><div class="table-wrap"><table><thead><tr><th>${L('Tracking','رقم التتبع')}</th><th>Job Cod</th><th>${L('Original status','الحالة الأصلية')}</th><th>${L('Order No.','رقم الأوردر')}</th><th>${L('Shipper','التاجر')}</th><th>${L('COD','قيمة الأوردر')}</th><th>${L('Delivery fee','رسوم التوصيل')}</th><th>${L('Tax','الضريبة')}</th><th>${L('Shipper due (est.)','مستحق التاجر (تقديري)')}</th></tr></thead><tbody>${visible.map(o=>`<tr><td><b>${esc(o.tracking_number||'—')}</b></td><td><span class="daily-report-job-code">${esc(o.job_code||'—')}</span></td><td>${esc(o.original_status||o.status||'—')}</td><td>${esc(o.order_no||'—')}</td><td>${esc(o.shipper_name||'—')}</td><td>${money(o.cod)}</td><td>${money(o.service_charges)}</td><td>${money(o.tax)}</td><td><b>${money(o.shipper_due_estimate)}</b></td></tr>`).join('')}</tbody></table></div><div class="daily-report-pagination"><span>${L('Rows','الصفوف')} ${start+1}–${Math.min(start+pageSize,all.length)} ${L('of','من')} ${all.length}</span><div class="daily-report-pagination-actions"><button type="button" class="ghost" ${page<=1?'disabled':''} onclick="setDailyCompanyReportOrdersPage(${page-1})">${L('Previous','السابق')}</button><b>${page} / ${pages}</b><button type="button" class="ghost" ${page>=pages?'disabled':''} onclick="setDailyCompanyReportOrdersPage(${page+1})">${L('Next','التالي')}</button></div></div></div>`;
}
function setDailyCompanyReportOrdersPage(page){
  const rows=window.__dailyCompanyReportOrderRows||[];
  const pages=Math.max(1,Math.ceil(rows.length/25));
  window.__dailyCompanyReportOrdersPage=Math.max(1,Math.min(Number(page)||1,pages));
  const host=document.getElementById('dailyReportOrdersTableHost');
  if(!host)return;
  const holder=document.createElement('div');
  holder.innerHTML=dailyReportOrdersTable(rows);
  const next=holder.firstElementChild;
  if(next)host.replaceWith(next);
}

async function loadDailyCompanyReport(){
  const box=$('dailyCompanyReportBody');if(!box)return;
  const from=$('dailyReportFrom')?.value||today(),to=$('dailyReportTo')?.value||from;
  if(from>to){box.innerHTML=`<div class="msg error">${L('From date must be before To date.','تاريخ البداية يجب أن يكون قبل تاريخ النهاية.')}</div>`;return;}
  box.innerHTML=`<p class="muted">${L('Loading report…','جارٍ تحميل التقرير…')}</p>`;
  try{
    const d=await api(`/api/accounting/daily-company-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),r=d.data||{};
    const cards=[
      [L('Orders included','الأوردرات المحتسبة'),Number(r.paid_count??r.delivered_count??0),'package-check'],
      [L('Estimated shipper dues','مستحقات التجار التقديرية'),money(r.shipper_due_estimate||0),'wallet'],
      [L('Gross delivery fees','إجمالي رسوم التوصيل'),money(r.delivery_fees_gross||0),'truck'],
      [L('Net delivery revenue','صافي إيراد التوصيل'),money(r.net_delivery_revenue||0),'chart'],
      [L('Maintenance & operating costs','الصيانة وتكاليف التشغيل'),money(r.maintenance_operating_costs||0),'wrench'],
      [L('Other expenses','المصروفات الأخرى'),money(r.other_expenses||0),'receipt'],
      [L('Total expenses','إجمالي المصروفات'),money(r.total_expenses||0),'calculator'],
      [L('Net result (estimated)','صافي نتيجة اليوم (تقديري)'),money(r.net_result||0),'chart']
    ];
    box.innerHTML=`<div class="daily-report-note">${L('Paid orders are included by the Paid date. Cancelled by Shipper contributes delivery-fee revenue only and is excluded from shipper dues; Cancelled by Receiver is included only when paid, and its customer-paid delivery fee is company revenue. Shipper dues are estimated from COD less tax and applicable delivery fees. Net delivery revenue is delivery-fee revenue minus recorded driver commission payouts; company expenses are shown separately.','يتم احتساب الأوردرات Paid حسب تاريخ التحصيل. أوردر Cancelled by Shipper يُحتسب منه إيراد رسوم التوصيل فقط ولا يُضاف لمستحق التاجر، حتى لو لم يُسجل Paid. أوردر Cancelled by Receiver يُحتسب عند الدفع، ورسوم التوصيل التي دفعها العميل تُحسب إيرادًا للشركة ولا تُخصم من مستحق التاجر. صافي مستحق التاجر = قيمة الأوردر ناقص الضريبة ورسوم التوصيل المستحقة عليه. صافي إيراد التوصيل = إيراد رسوم التوصيل ناقص عمولات المندوبين المسجلة، والمصروفات تظهر منفصلة.')}</div><div class="grid daily-report-cards">${cards.map(([label,value,icon])=>`<div class="stat daily-report-card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>
      <div class="panel daily-report-details"><div class="section-title-row"><h3>${L('Orders included','الأوردرات المحتسبة')}</h3><b>${Number(r.delivered_count||0)}</b></div>${dailyReportOrdersTable(r.orders||[])}</div>
      <div class="grid daily-report-lower"><div class="panel daily-report-details"><h3>${L('Maintenance & operating expenses','مصروفات الصيانة والتشغيل')}</h3>${dailyReportExpenseTable(r.maintenance_expenses||[])}</div><div class="panel daily-report-details"><h3>${L('Other expenses','المصروفات الأخرى')}</h3>${dailyReportExpenseTable(r.other_expense_rows||[])}</div></div>
      <div class="panel daily-report-details"><h3>${L('Driver payouts recorded','مدفوعات المندوبين المسجلة')}</h3>${(r.driver_payouts||[]).length?`<div class="table-wrap"><table><thead><tr><th>${L('Date','التاريخ')}</th><th>${L('Driver','المندوب')}</th><th>${L('Amount','المبلغ')}</th></tr></thead><tbody>${r.driver_payouts.map(x=>`<tr><td>${esc(String(x.paid_at||x.created_at||'').slice(0,10))}</td><td>${esc(x.driver_name||'—')}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L('No driver payouts recorded in this period.','لا توجد مدفوعات مندوبين مسجلة في الفترة.')}</p>`}</div>`;
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function dailyCompanyOrdersTable(rows,page=1){
  const pageSize=25,totalPages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(totalPages,Math.max(1,Number(page)||1));
  window.__dailyCompanyReportOrders=rows;window.__dailyCompanyReportOrdersPage=current;
  const visible=rows.slice((current-1)*pageSize,current*pageSize);
  return `<div class="table-wrap"><table><thead><tr><th>${L('Tracking','رقم التتبع')}</th><th>${L('Job Code','كود الـ Job')}</th><th>${L('Original status','الحالة الأصلية')}</th><th>${L('Order No.','رقم الأوردر')}</th><th>${L('Shipper','التاجر')}</th><th>${L('COD','قيمة الأوردر')}</th><th>${L('Delivery fee','رسوم التوصيل')}</th><th>${L('Tax','الضريبة')}</th><th>${L('Shipper due (est.)','مستحق التاجر (تقديري)')}</th></tr></thead><tbody>${visible.map(o=>`<tr><td>${esc(o.tracking_number||'—')}</td><td><b>${esc(o.job_code||'—')}</b></td><td>${esc(o.original_status||o.status||'—')}</td><td>${esc(o.order_no||'—')}</td><td>${esc(o.shipper_name||'—')}</td><td>${money(o.cod)}</td><td>${money(o.service_charges)}</td><td>${money(o.tax)}</td><td><b>${money(o.shipper_due_estimate)}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="daily-report-pagination"><span>${L('Showing','عرض')} ${rows.length?((current-1)*pageSize+1):0}–${Math.min(current*pageSize,rows.length)} ${L('of','من')} ${rows.length}</span><div class="daily-report-pagination-actions"><button type="button" class="ghost" onclick="setDailyCompanyReportOrdersPage(${current-1})" ${current<=1?'disabled':''}>${L('Previous','السابق')}</button><b>${current} / ${totalPages}</b><button type="button" class="ghost" onclick="setDailyCompanyReportOrdersPage(${current+1})" ${current>=totalPages?'disabled':''}>${L('Next','التالي')}</button></div></div>`;
}
function setDailyCompanyReportOrdersPage(page){
  const rows=window.__dailyCompanyReportOrderRows||[];
  const pages=Math.max(1,Math.ceil(rows.length/25));
  window.__dailyCompanyReportOrdersPage=Math.max(1,Math.min(Number(page)||1,pages));
  const host=document.getElementById('dailyReportOrdersTableHost');
  if(!host)return;
  const holder=document.createElement('div');
  holder.innerHTML=dailyReportOrdersTable(rows);
  const next=holder.firstElementChild;
  if(next)host.replaceWith(next);
}
function dailyReportExpenseTable(rows){return rows.length?`<div class="table-wrap"><table><thead><tr><th>${L('Date','التاريخ')}</th><th>${L('Type','النوع')}</th><th>${L('Details','التفاصيل')}</th><th>${L('Amount','المبلغ')}</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(String(x.expense_date||x.created_at||'').slice(0,10))}</td><td>${esc(x.expense_type||x.category||'—')}</td><td>${esc(x.details||x.notes||'—')}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L('No expenses recorded.','لا توجد مصروفات مسجلة.')}</p>`;}

async function accountingPage(c){
  try{
    const accountingDate=today();
    const timezoneOffset=new Date().getTimezoneOffset();
    const monthKey=accountingDate.slice(0,7);
    const [summary,dr,payroll,expenses,companyFinancial]=await Promise.all([api(`/api/accounting/summary?date=${encodeURIComponent(accountingDate)}&tz=${encodeURIComponent(timezoneOffset)}`),api("/api/drivers"),api(`/api/payroll/period?month=${encodeURIComponent(monthKey)}`).catch(()=>({data:{items:[]}})),api(`/api/accounting/driver-expenses?from=${encodeURIComponent(accountingDate)}&to=${encodeURIComponent(accountingDate)}`).catch(()=>({data:[]})),api(`/api/accounting/company-financial?from=${encodeURIComponent(accountingDate)}&to=${encodeURIComponent(accountingDate)}`).catch(()=>({data:{data:{driver_expenses:0}}}))]);
    const x=summary.data||{}, drivers=dr.data||[], payrollRows=payroll.data?.items||[], expenseRows=expenses.data||[], companyExpenseTotal=Number(companyFinancial.data?.driver_expenses||0);
    const payrollTotal=payrollRows.reduce((sum,row)=>sum+Number(row.base_salary||0)+Number(row.additions||0)-Number(row.deductions||0),0);
    const shortageRowsForTotal=expenseRows.filter(row=>String(row.category||'').toLowerCase()==='shortage');
    const shortageTotal=shortageRowsForTotal.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const expenseTotal=Math.max(0,companyExpenseTotal-shortageTotal);
    
    window.__accountingExpenseTotals={expenseTotal,shortageTotal,expenseCount:expenseRows.filter(row=>String(row.category||'expense').toLowerCase()!=='shortage').length,shortageCount:expenseRows.filter(row=>String(row.category||'').toLowerCase()==='shortage').length};
    c.innerHTML=`<h2>${t("Accounting")}</h2>
      <div class="panel accounting-date-filter-panel"><div class="accounting-date-filter-inner"><label>${L('Accounts date','تاريخ الحسابات')}<input id="accountingAccountsDate" type="date" value="${accountingDate}" onchange="reloadAccountingDate()"></label><button type="button" class="ghost accounting-date-today" onclick="resetAccountingAccountsDate()">${L('Today','اليوم')}</button></div><small class="muted">${L('Counters and summaries below reflect the selected date. Financial order totals include Paid orders only.','العدادات والملخصات بالأسفل تعرض بيانات التاريخ المحدد، والإجماليات المالية تشمل الأوردرات Paid فقط.')}</small></div>
      <div class="grid accounting-top-counters">${stat(L("Orders Today","أوردرات اليوم"),x.totalOrders||0)}${stat(L("Paid Order Value","قيمة الأوردرات المدفوعة"),money(x.orderValue||0))}${stat(L("Paid Delivery Fees","رسوم التوصيل المدفوعة"),money(x.deliveryFees||0))}${stat(L("Paid Taxes","الضرائب المدفوعة"),money(x.taxes||0))}<div class="stat accounting-company-due-counter"><span>${L("Company Due","مستحق الشركة (رسوم التوصيل + الضرائب)")}</span><b>${money(x.companyDue??(Number(x.deliveryFees||0)+Number(x.taxes||0)))}</b><small>${L('Includes paid delivery fees and taxes','يشمل رسوم التوصيل والضرائب المدفوعة')}</small></div><button type="button" class="stat accounting-payroll-counter" onclick="showAccountingPayrollOnly()" title="${L('Show payroll only','عرض الرواتب فقط')}"><span>${L("Payroll","الرواتب")}</span><b>${money(payrollTotal)}</b><small>${payrollRows.length} ${L('salary records','سجل راتب')} · ${L('Open payroll only','عرض الرواتب فقط')} ↗</small></button><div class="stat accounting-expense-counter"><span>${L('Expenses & Shortage','المصاريف والعجز')}</span><b id="accountingExpenseCounterValue">${money(expenseTotal)}</b><small id="accountingExpenseCounterCount">${window.__accountingExpenseTotals.expenseCount} ${L('expense records','سجل مصروف')}</small><div class="accounting-expense-toggle" role="group" aria-label="فلتر المصاريف"><button type="button" class="active" data-expense-mode="expense" onclick="setAccountingExpenseMode('expense')">${L('Expenses','المصاريف')}</button><button type="button" data-expense-mode="shortage" onclick="setAccountingExpenseMode('shortage')">${L('Shortage','العجز')}</button></div></div></div>
      <div class="grid" style="margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr));max-width:420px">${stat(L("Cash","كاش"),x.cashOrders||0)}${stat(L("Credit","Credit"),x.creditOrders||0)}</div>
      <div class="panel compact-accounts-overview"><div class="section-title-row"><div><h3>📊 ${L('Shipper Balance Overview','نظرة عامة على أرصدة التجار')}</h3></div><button class="ghost" onclick="show('merchantFinancial')">${L('Open Financial Statements','فتح الكشوف المالية')}</button></div><div id="accountingShipperBalanceOverview"></div></div>
      <div class="panel accounting-linked-panel">
        <div class="section-title-row"><div><h3>${L("Shipper Accounts Summary","ملخص حسابات التجار")}</h3><small class="muted" id="merchantAccountsDateLabel">${esc(accountingDate)}</small></div><button class="ghost" onclick="loadShipperAccounts()">↻ ${L("Refresh","تحديث")}</button></div>
        <div id="merchantAccountsBox"></div>
      </div>`;
    await loadMerchantAccounts();
    loadAccountingShipperBalanceOverview();
  }catch(e){c.innerHTML=`<div class="panel"><span class="error">${esc(e.message)}</span></div>`;}
}
function setAccountingExpenseMode(mode){
  const totals=window.__accountingExpenseTotals||{expenseTotal:0,shortageTotal:0,expenseCount:0,shortageCount:0};
  const shortage=mode==='shortage';
  const value=$('accountingExpenseCounterValue'),count=$('accountingExpenseCounterCount');
  if(value)value.textContent=money(shortage?totals.shortageTotal:totals.expenseTotal);
  if(count)count.textContent=`${shortage?totals.shortageCount:totals.expenseCount} ${shortage?L('shortage records','سجل عجز'):L('expense records','سجل مصروف')}`;
  document.querySelectorAll('.accounting-expense-toggle button').forEach(btn=>{const active=btn.dataset.expenseMode===(shortage?'shortage':'expense');btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
}

async function showAccountingPayrollOnly(){
  const month=today().slice(0,7);
  let rows=[];
  try{const d=await api(`/api/payroll/period?month=${encodeURIComponent(month)}`);rows=d.data?.items||[];}catch(e){return alert(e.message||L('Could not load payroll','تعذر تحميل الرواتب'));}
  const total=rows.reduce((sum,r)=>sum+Number(r.base_salary||0)+Number(r.additions||0)-Number(r.deductions||0),0);
  const paid=rows.reduce((sum,r)=>sum+Number(r.paid_amount||0),0);
  document.getElementById('accountingPayrollOnlyModal')?.remove();
  const modal=document.createElement('div');modal.id='accountingPayrollOnlyModal';modal.className='accounting-payroll-modal-backdrop';
  modal.innerHTML=`<section class="accounting-payroll-modal" role="dialog" aria-modal="true" aria-labelledby="accountingPayrollOnlyTitle"><div class="section-title-row"><div><h2 id="accountingPayrollOnlyTitle">${L('Payroll only','الرواتب فقط')}</h2><p class="muted">${L('Month','الشهر')}: ${esc(month)}</p></div><button type="button" class="ghost" onclick="document.getElementById('accountingPayrollOnlyModal')?.remove()">✕ ${L('Close','إغلاق')}</button></div><div class="grid verify-stats"><div class="stat"><span>${L('Salary records','سجلات الرواتب')}</span><b>${rows.length}</b></div><div class="stat verify-stat-green"><span>${L('Net payroll','صافي الرواتب')}</span><b>${money(total)}</b></div><div class="stat"><span>${L('Paid','المدفوع')}</span><b>${money(paid)}</b></div><div class="stat verify-stat-red"><span>${L('Remaining','المتبقي')}</span><b>${money(Math.max(0,total-paid))}</b></div></div><div class="table-wrap"><table><thead><tr><th>${L('Employee','الموظف')}</th><th>${L('Job title','المهنة')}</th><th>${L('Base salary','الراتب الأساسي')}</th><th>${L('Additions','إضافات')}</th><th>${L('Deductions','خصومات')}</th><th>${L('Net salary','صافي الراتب')}</th><th>${L('Paid','المدفوع')}</th><th>${L('Status','الحالة')}</th></tr></thead><tbody>${rows.length?rows.map(r=>{const net=Number(r.base_salary||0)+Number(r.additions||0)-Number(r.deductions||0);return `<tr><td><b>${esc(r.employee_name||'—')}</b></td><td>${esc(r.job_title||'—')}</td><td>${money(r.base_salary||0)}</td><td>${money(r.additions||0)}</td><td>${money(r.deductions||0)}</td><td><b>${money(net)}</b></td><td>${money(r.paid_amount||0)}</td><td>${esc(r.status||'unpaid')}</td></tr>`;}).join(''):`<tr><td colspan="8" class="muted">${L('No payroll records for this month.','لا توجد سجلات رواتب لهذا الشهر.')}</td></tr>`}</tbody></table></div></section>`;
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});document.addEventListener('keydown',function escClose(e){if(e.key==='Escape'&&document.getElementById('accountingPayrollOnlyModal')){document.getElementById('accountingPayrollOnlyModal')?.remove();document.removeEventListener('keydown',escClose);}});
  document.body.appendChild(modal);
}

async function loadAccountingShipperBalanceOverview(){
  const box=$("accountingShipperBalanceOverview");if(!box)return;
  try{const date=accountingAccountsSelectedDate();const d=await api(`/api/accounting/merchant-accounts?date=${encodeURIComponent(date)}`);const rows=d.data||[];const positive=rows.reduce((s,r)=>s+Math.max(0,Number(r.merchant_net||0)),0);const negative=rows.reduce((s,r)=>s+Math.max(0,-Number(r.merchant_net||0)),0);const net=positive-negative;box.innerHTML=`<div class="grid verify-stats"><div class="stat"><span>${L('Shippers with Paid orders','تجار لديهم أوردرات Paid')}</span><b>${rows.filter(r=>Number(r.orders||0)>0).length}</b><small>${esc(date)}</small></div><div class="stat verify-stat-green"><span>${L('Paid shipper net positive','صافي مستحق التجار')}</span><b>${money(positive)}</b></div><div class="stat verify-stat-red"><span>${L('Paid net deductions','صافي الخصومات')}</span><b>${money(negative)}</b></div><div class="stat"><span>${L('Paid net total','صافي الإجمالي')}</span><b>${money(net)}</b></div></div>`;}catch(e){box.innerHTML=`<span class="muted">${esc(e.message)}</span>`;}
}

async function merchantFinancialPage(c){
  const ms=await api('/api/merchants').catch(()=>({data:[]})); const merchants=ms.data||[];
  c.innerHTML=`<div class="shipper-fin-page">
    <div class="shipper-fin-heading"><div><h2>${L("Shipper Financial Statements","الكشوف المالية للتجار")}</h2></div><div class="shipper-fin-head-actions"><button class="ghost" onclick="printShipperStatement()">⎙ ${L("Print Statement","طباعة الكشف")}</button><button onclick="generateMerchantFinancial()">＋ ${L("Generate Settlement","توليد تسوية")}</button></div></div>
    <div id="merchantGenerateMsg" class="msg" role="status" aria-live="polite"></div><div id="merchantGeneratedBox" class="merchant-generated-results" aria-live="polite"></div>
    <div class="panel shipper-fin-table-panel daily-shipper-summary-panel"><div class="section-title-row"><div><h3>ملخص التجار للتسوية اليومية</h3><p class="muted">اضغط على اسم التاجر لعرض أوردراته وإجراءات الكشف والتسوية.</p></div><div class="shipper-fin-table-tools"><input id="dailyShipperSearch" placeholder="بحث باسم التاجر أو الكود" oninput="filterDailyShipperSummary()"><button class="ghost" type="button" onclick="printSelectedDailyShippers()">PDF للمحدد</button><button class="ghost" type="button" onclick="exportSelectedDailyShippersExcel()">Excel للمحدد</button><button type="button" onclick="generateMerchantFinancial()">توليد المحدد</button></div></div><div id="dailyShipperSummaryTable"><p class="muted">جارٍ تحميل بيانات التجار...</p></div><div id="dailyShipperDetailsActions" class="daily-shipper-actions" hidden></div><div id="dailyShipperOrders" class="daily-shipper-orders" hidden></div></div>
    <div class="panel shipper-fin-filter-panel"><div class="form-grid shipper-fin-filter-grid">
      <label>${L("Shipper","التاجر")}<select id="merchantFinancialSelect"><option value="">${L("All Shippers","كل التجار")}</option>${merchants.map(m=>`<option value="${esc(m.id)}">${esc(m.name||'')} — ${esc(m.merchant_no||m.code||'')}</option>`).join('')}</select></label>
      <label>${L("From","من")}<input id="merchantFinFrom" type="date" value="${daysAgo(7)}"></label>
      <label>${L("To","إلى")}<input id="merchantFinTo" type="date" value="${today()}"></label>
      <label>${L("Balance","الرصيد")}<select id="merchantBalanceFilter"><option value="all">${L("All balances","كل الأرصدة")}</option><option value="positive">${L("Company owes shipper","الشركة عليها للتاجر")}</option><option value="negative">${L("Shipper owes company","التاجر عليه للشركة")}</option><option value="zero">${L("Zero balance","الرصيد صفر")}</option></select></label>
      <div class="shipper-fin-filter-actions"><button onclick="loadShipperFinancial()">${L("Apply Filters","تطبيق الفلاتر")}</button><button class="ghost" onclick="resetShipperFinancialFilters()">${L("Reset","إعادة ضبط")}</button></div>
    </div></div>
    <div class="shipper-fin-kpis" id="merchantFinancialKpis"><div class="shipper-fin-kpi"><span>${L("Shippers","التجار")}</span><b>—</b></div><div class="shipper-fin-kpi"><span>${L("Company owes shippers","مستحق للتجار")}</span><b>—</b></div><div class="shipper-fin-kpi"><span>${L("Shippers owe company","مستحق للشركة")}</span><b>—</b></div><div class="shipper-fin-kpi"><span>${L("Net balance","صافي الرصيد")}</span><b>—</b></div></div>

    <div class="merchant-financial-data-holder" hidden><div id="merchantFinancialMsg" class="msg"></div><div id="merchantFinancialBox"></div><input id="merchantFinancialSearch" oninput="filterShipperFinancialRows()"></div>
    <div id="merchantAdjustmentModal" class="modal-backdrop" hidden><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="merchantAdjustmentTitle"><div class="section-title-row"><h3 id="merchantAdjustmentTitle">${L("Shipper Adjustment / Advance Payment","تسوية التاجر / دفعة مقدمة")}</h3><button class="ghost" type="button" onclick="closeShipperAdjustmentModal()">✕</button></div><input id="merchantAdjShipperId" type="hidden"><div class="form-grid"><label>${L("Type","النوع")}<select id="merchantAdjType"><option value="advance">Advance Payment — دفعة مقدمة</option><option value="deduction">Deduction — خصم</option><option value="credit">Credit — مبلغ مستحق للتاجر</option><option value="other">Other Adjustment — تسوية أخرى</option></select></label><label>${L("Amount","المبلغ")}<input id="merchantAdjAmount" type="number" min="0" step="0.01"></label><label>${L("Date","التاريخ")}<input id="merchantAdjDate" type="date" value="${today()}"></label><label>${L("Reference","المرجع")}<input id="merchantAdjRef"></label><label style="grid-column:1/-1">${L("Reason","السبب")}<input id="merchantAdjReason"></label><label style="grid-column:1/-1">${L("Adjustment Proof","إثبات التسوية")}<input id="merchantAdjProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><div class="actions"><button type="button" onclick="saveShipperAdjustmentFromModal()">${L("Save Adjustment","حفظ التسوية")}</button><button type="button" class="ghost" onclick="closeShipperAdjustmentModal()">${L("Cancel","إلغاء")}</button></div><div id="merchantAdjMsg" class="msg"></div></div></div>
  </div>`;
  await loadMerchantFinancial();
  // Settlement history is intentionally kept only in Invoice Report.
}
async function loadMerchantSettlementHistory(){
  const box=$('merchantSettlementHistoryBox');if(!box)return;
  try{
    const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today(),merchantId=$('merchantFinancialSelect')?.value||'';
    const qs=new URLSearchParams({from,to});if(merchantId)qs.set('merchant_id',merchantId);
    const d=await api('/api/accounting/shipper-settlements?'+qs.toString());const rows=d.data||[];window.__merchantSettlementHistory=rows;
    const totalOrders=rows.reduce((n,r)=>n+Number(r.order_count||0),0),totalCollection=rows.reduce((n,r)=>n+Number(r.collection_amount||0),0),unpaid=rows.filter(r=>r.status!=='Paid Shipper').length;
    const msg=$('merchantSettlementHistoryMsg');if(msg)msg.innerHTML=`<span class="muted">${L('Records','السجلات')}: <b>${rows.length}</b> · ${L('Orders','الطلبات')}: <b>${totalOrders}</b> · ${L('Collection','التحصيل')}: <b>${money(totalCollection)}</b> · ${L('Unpaid vouchers','تسويات غير مدفوعة')}: <b>${unpaid}</b></span>`;
    if(!rows.length){box.innerHTML=`<div class="shipper-fin-empty"><span>▤</span><b>${L('No settlement vouchers in this period','لا توجد تسويات في هذه الفترة')}</b><p>${L('Generate a settlement after confirming the delivery and payment records.','أنشئ التسوية بعد التأكد من سجلات التسليم والدفع.')}</p></div>`;return;}
    box.innerHTML=`<div class="table-wrap"><table class="shipper-financial-table shipper-settlement-register"><thead><tr><th>${L('Transaction No.','رقم التسوية')}</th><th>${L('Date','التاريخ')}</th><th>${L('Shipper / Code','التاجر / الكود')}</th><th>${L('Orders','الطلبات')}</th><th>${L('Collection','التحصيل')}</th><th>${L('Delivery Fees','رسوم التوصيل')}</th><th>${L('Shipper Net','صافي التاجر')}</th><th>${L('Status','الحالة')}</th><th>${L('Created','تاريخ الإنشاء')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map((r,i)=>{const items=r.items||[],fees=items.reduce((n,x)=>n+Number(x.service_charges||0),0),net=items.reduce((n,x)=>n+Number(x.merchant_net||0),0),search=[r.transaction_number,r.merchant?.name,r.merchant?.merchant_no,r.merchant?.code,r.merchant?.external_code,...items.flatMap(x=>[x.tracking_number,x.shipment_no,x.merchant_order_no,x.customer_name,x.customer_phone,x.customer_phone_2])].join(' ').toLowerCase();return `<tr data-settlement-search="${esc(search)}"><td><b>${esc(r.transaction_number||'—')}</b><small class="muted"><br>${esc(r.id||'')}</small></td><td>${esc(r.settlement_date||'')}</td><td><b>${esc(r.merchant?.name||'')}</b><small class="muted"><br>${esc(r.merchant?.merchant_no||r.merchant?.code||'')}</small></td><td>${Number(r.order_count||items.length)}</td><td>${money(r.collection_amount||0)}</td><td>${money(fees)}</td><td>${money(net)}</td><td><select aria-label="${L('Settlement status','حالة التسوية')}" onchange="changeShipperSettlementState('${esc(r.id)}',this.value)"><option value="Unpaid Shipper" ${r.status!=='Paid Shipper'?'selected':''}>${L('Pending','معلقة')}</option><option value="Paid Shipper" ${r.status==='Paid Shipper'?'selected':''}>${L('Paid','مدفوعة')}</option></select></td><td>${esc(String(r.generated_at||r.created_at||'').replace('T',' ').slice(0,16))}<small class="muted"><br>${esc(r.generated_by_name||r.created_by_name||'')}</small></td><td class="shipper-settlement-actions"><button class="mini-btn ghost" title="${L('Order details','تفاصيل الطلبات')}" onclick="toggleMerchantSettlementDetails(${i})">${L('Details','التفاصيل')}</button><button class="mini-btn ghost" title="${L('Print / PDF','طباعة / PDF')}" onclick="printShipperSettlementByIndex(${i})">⎙</button><button class="mini-btn ghost" title="${L('Excel','إكسل')}" onclick="exportShipperSettlementByIndex(${i})">⇩</button></td></tr><tr id="merchantSettlementDetails_${i}" class="shipper-settlement-detail-row" hidden><td colspan="10"><div class="table-wrap"><table><thead><tr><th>${L('Tracking','التتبع')}</th><th>${L('Shipment No.','رقم الشحنة')}</th><th>${L('Order No.','رقم الطلب')}</th><th>${L('COD / Value','قيمة الطلب')}</th><th>${L('Delivery Fee','رسوم التوصيل')}</th><th>${L('Discount','الخصم')}</th><th>${L('Adjustment','التعديل')}</th><th>${L('Net','الصافي')}</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.tracking_number||'—')}</td><td>${esc(x.shipment_no||'—')}</td><td>${esc(x.merchant_order_no||'—')}</td><td>${money(x.cod||0)}</td><td>${money(x.service_charges||0)}</td><td>${x.discount==null?'—':money(x.discount)}</td><td>${x.adjustment==null?'—':money(x.adjustment)}</td><td>${money(x.merchant_net||0)}</td></tr>`).join('')||`<tr><td colspan="8">${L('No item-level records stored for this voucher.','لا توجد تفاصيل طلبات محفوظة لهذه التسوية.')}</td></tr>`}</tbody></table><small class="muted">${L('Generated by','أنشأها')}: ${esc(r.generated_by_name||r.created_by_name||'—')} · ${L('Created at','تاريخ الإنشاء')}: ${esc(r.generated_at||r.created_at||'—')}</small></div></td></tr>`}).join('')}</tbody></table></div>`;
    filterMerchantSettlementHistory();
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function filterMerchantSettlementHistory(){const q=String($('merchantSettlementSearch')?.value||'').toLowerCase().trim();document.querySelectorAll('#merchantSettlementHistoryBox tr[data-settlement-search]').forEach(tr=>{tr.style.display=!q||tr.dataset.settlementSearch.includes(q)?'':'none';const detail=tr.nextElementSibling;if(detail?.classList.contains('shipper-settlement-detail-row')&&q&&tr.dataset.settlementSearch.includes(q))detail.hidden=false;});}
function toggleMerchantSettlementDetails(i){const el=$('merchantSettlementDetails_'+i);if(el)el.hidden=!el.hidden;}
function printShipperSettlementByIndex(i){const r=(window.__merchantSettlementHistory||[])[i];if(r)printShipperSettlement(r);}
function exportShipperSettlementByIndex(i){const r=(window.__merchantSettlementHistory||[])[i];if(r)exportShipperSettlementExcel(r);}
function exportMerchantSettlementHistory(){const rows=window.__merchantSettlementHistory||[];if(!rows.length)return msg('merchantSettlementHistoryMsg',L('No settlements to export.','لا توجد تسويات لتصديرها.'),'error');const data=[["Transaction No.","Date","Shipper","Shipper Code","Orders","Collection","Delivery Fees","Shipper Net","Status","Created At"]];for(const r of rows){const items=r.items||[];data.push([r.transaction_number||'',r.settlement_date||'',r.merchant?.name||'',r.merchant?.merchant_no||r.merchant?.code||'',Number(r.order_count||items.length),Number(r.collection_amount||0),items.reduce((n,x)=>n+Number(x.service_charges||0),0),items.reduce((n,x)=>n+Number(x.merchant_net||0),0),r.status||'',r.generated_at||r.created_at||'']);}if(window.XLSX?.utils){const ws=XLSX.utils.aoa_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Settlements');XLSX.writeFile(wb,`shipper-settlements-${today()}.xlsx`);}else{const csv='\ufeff'+data.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`shipper-settlements-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}}

function merchantPlainAmount(value){return Number(value||0).toLocaleString(LANG==='ar'?'ar-EG':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
async function openMerchantStatementModal(id){
 const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();
 const old=$('merchantStatementModalV2');if(old)old.remove();
 const modal=document.createElement('div');modal.id='merchantStatementModalV2';modal.className='merchant-statement-modal-backdrop';modal.innerHTML=`<section class="merchant-statement-modal" role="dialog" aria-modal="true" aria-labelledby="merchantStatementModalTitle"><header class="merchant-statement-modal-head"><div><span class="merchant-statement-eyebrow">TREND DELIVERY · FINANCIAL REPORT</span><h2 id="merchantStatementModalTitle">كشف حساب التاجر</h2><p>عرض تفصيلي للأوردرات والرسوم والدفعات والتسويات</p></div><button type="button" class="merchant-statement-close" aria-label="إغلاق" onclick="document.getElementById('merchantStatementModalV2')?.remove()">×</button></header><div class="merchant-statement-modal-body"><div class="merchant-statement-loading">جارٍ تحميل كشف الحساب...</div></div><footer class="merchant-statement-modal-foot"><button type="button" class="merchant-statement-pdf-btn" onclick="printMerchantStatementModal()">PDF · طباعة الكشف</button><button type="button" class="merchant-statement-secondary-btn" onclick="document.getElementById('merchantStatementModalV2')?.remove()">إغلاق</button></footer></section>`;
 modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});document.body.appendChild(modal);document.addEventListener('keydown',function closeMerchantModal(e){if(e.key==='Escape'){modal.remove();document.removeEventListener('keydown',closeMerchantModal);}});
 try{const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(id)}&balance=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);const r=(d.data||[])[0];if(!r)throw new Error('لا توجد بيانات مالية للتاجر في الفترة المحددة');
 const orders=d.orders||[],adjustments=d.adjustments||[],settlements=d.settlements||[];let eligibleOrders=[];try{const ed=await api(`/api/accounting/shipper-settlements/eligible-orders?merchant_id=${encodeURIComponent(id)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);eligibleOrders=ed.data||[];}catch(_){}window.__merchantStatementModalData={summary:r,orders,adjustments,settlements,eligibleOrders,merchant_id:String(id),from,to};
 const totalAdvance=adjustments.filter(a=>/(advance|pre.?payment|دفعة مقدمة)/i.test(String(a.type||''))).reduce((n,a)=>n+Number(a.amount||0),0),fees=Number(r.service_charges||0),cod=Number(r.cod||0),net=Number(r.merchant_due||0),paid=Number(r.settled||0),adj=Number(r.adjustments||0),balance=Number(r.balance||0);
 const body=modal.querySelector('.merchant-statement-modal-body');body.innerHTML=`<div class="merchant-statement-identity"><div class="merchant-statement-avatar">${esc(String(r.name||'ت').trim().charAt(0))}</div><div><h3>${esc(r.name||'التاجر')}</h3><p>كود التاجر: <b>${esc(r.merchant_no||r.code||'—')}</b></p><p>الفترة: ${esc(from)} — ${esc(to)}</p></div><span class="merchant-statement-period-badge">${orders.length} أوردر</span></div><div class="merchant-statement-kpis"><article><span>إجمالي المبالغ (COD)</span><b>${merchantPlainAmount(cod)}</b></article><article><span>رسوم التوصيل</span><b>${merchantPlainAmount(fees)}</b></article><article><span>صافي مستحق التاجر</span><b>${merchantPlainAmount(net)}</b></article><article><span>الرصيد النهائي</span><b class="${balance<0?'negative':'positive'}">${merchantPlainAmount(balance)}</b></article></div><div class="merchant-statement-section merchant-statement-eligible-section"><div class="merchant-statement-section-title"><h3>الأوردرات</h3><span>${eligibleOrders.length} أوردر</span></div><div class="merchant-statement-selection-actions"><label><input type="checkbox" id="merchantStatementSelectAllOrders" onchange="toggleMerchantStatementOrderSelection(this.checked)"> تحديد كل الأوردرات</label><label>Actions <select id="merchantStatementOrderAction"><option value="">اختر إجراءً</option><option value="generate">توليد كشف للأوردرات المحددة فقط</option></select></label><button type="button" onclick="runMerchantStatementOrderAction()">تنفيذ</button><span id="merchantStatementSelectedCount">المحدد: 0</span></div><div class="merchant-statement-table-wrap"><table><thead><tr><th>تحديد</th><th>رقم الأوردر</th><th>Tracking</th><th>الحالة</th><th>التاريخ</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th></tr></thead><tbody>${eligibleOrders.length?eligibleOrders.map(o=>`<tr class="${o.eligible?'':'merchant-statement-reference-only'}"><td>${o.eligible?`<input type="checkbox" class="merchant-statement-order-check" value="${esc(o.id)}" onchange="updateMerchantStatementOrderSelection()">`:`<span class="merchant-statement-not-eligible" title="${esc(o.ineligible_reason||'لا يدخل في التسوية')}">عرض فقط</span>`}</td><td>${esc(o.merchant_order_no||'—')}</td><td>${esc(o.tracking_number||'—')}</td><td>${esc(o.status||'—')}${!o.eligible?`<small class="merchant-statement-ineligible-note">${esc(o.ineligible_reason||'لا يدخل في التسوية')}</small>`:''}</td><td>${esc(String(o.delivery_date||o.created_at||'').slice(0,10))}</td><td>${merchantPlainAmount(o.cod||0)}</td><td>${merchantPlainAmount(o.service_charges||o.delivery_fee||0)}</td><td>${merchantPlainAmount(o.merchant_due||0)}</td></tr>`).join(''):`<tr><td colspan="8">لا توجد أوردرات في الفترة المحددة</td></tr>`}</tbody></table></div></div><div class="merchant-statement-lower-grid"><section class="merchant-statement-section"><div class="merchant-statement-section-title"><h3>الدفعات المسبقة والتسويات (Adjustments)</h3><span>${adjustments.length} سجل</span></div><div class="merchant-statement-table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان / المرجع</th><th>المبلغ</th><th>التأثير</th></tr></thead><tbody>${adjustments.length?adjustments.map(a=>`<tr><td>${esc(String(a.adjustment_date||a.created_at||'').slice(0,10))}</td><td>${esc(a.type||'تسوية')}</td><td>${esc(a.reason||a.reference||'—')}${a.reference?`<small>مرجع: ${esc(a.reference)}</small>`:''}</td><td>${merchantPlainAmount(a.amount)}</td><td class="${Number(a.signed_amount||0)<0?'negative':'positive'}">${Number(a.signed_amount||0)<0?'−':'+'}${merchantPlainAmount(Math.abs(Number(a.signed_amount||0)))}</td></tr>`).join(''):`<tr><td colspan="5">لا توجد تسويات أو دفعات مسبقة مسجلة في الفترة</td></tr>`}</tbody></table></div><div class="merchant-statement-mini-total"><span>إجمالي الدفعات المسبقة من Adjustments</span><b>${merchantPlainAmount(totalAdvance)}</b></div></section><section class="merchant-statement-section"><div class="merchant-statement-section-title"><h3>الدفعات المستلمة</h3><span>${settlements.length} سجل</span></div><div class="merchant-statement-table-wrap"><table><thead><tr><th>التاريخ</th><th>طريقة الدفع</th><th>المرجع</th><th>المبلغ</th></tr></thead><tbody>${settlements.length?settlements.map(x=>`<tr><td>${esc(String(x.paid_at||x.created_at||'').slice(0,10))}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(x.transfer_reference||'—')}</td><td>${merchantPlainAmount(x.amount)}</td></tr>`).join(''):`<tr><td colspan="4">لا توجد دفعات مسجلة في الفترة</td></tr>`}</tbody></table></div><div class="merchant-statement-mini-total"><span>إجمالي الدفعات المسجلة</span><b>${merchantPlainAmount(paid)}</b></div></section></div><div class="merchant-statement-final-balance"><div><span>إجمالي مستحق التاجر بعد رسوم التوصيل والضرائب</span><b>${merchantPlainAmount(net)}</b></div><div><span>التسويات والدفعات المقدمة (صافي التأثير)</span><b>${merchantPlainAmount(adj)}</b></div><div><span>الدفعات المستلمة</span><b>− ${merchantPlainAmount(paid)}</b></div><div class="grand"><span>الرصيد النهائي</span><b>${merchantPlainAmount(balance)}</b></div></div>`;
 }catch(e){modal.querySelector('.merchant-statement-modal-body').innerHTML=`<div class="merchant-statement-error">${esc(e.message||'تعذر تحميل الكشف')}</div>`;}
}
function toggleMerchantStatementOrderSelection(checked){document.querySelectorAll('#merchantStatementModalV2 .merchant-statement-order-check').forEach(x=>x.checked=!!checked);updateMerchantStatementOrderSelection();}
function updateMerchantStatementOrderSelection(){const checks=[...document.querySelectorAll('#merchantStatementModalV2 .merchant-statement-order-check')],selected=checks.filter(x=>x.checked),all=document.getElementById('merchantStatementSelectAllOrders');if(all){all.checked=checks.length>0&&selected.length===checks.length;all.indeterminate=selected.length>0&&selected.length<checks.length;}const count=document.getElementById('merchantStatementSelectedCount');if(count)count.textContent=`المحدد: ${selected.length}`;}
async function runMerchantStatementOrderAction(){
 const d=window.__merchantStatementModalData;if(!d)return alert('انتظر تحميل بيانات الكشف');
 const action=document.getElementById('merchantStatementOrderAction')?.value||'';if(action!=='generate')return alert('اختر إجراءً من Actions أولاً');
 const order_ids=[...new Set([...document.querySelectorAll('#merchantStatementModalV2 .merchant-statement-order-check:checked')].map(x=>String(x.value||'').trim()).filter(Boolean))];if(!order_ids.length)return alert('حدد أوردرًا واحدًا على الأقل للتوليد');
 const btn=[...document.querySelectorAll('#merchantStatementModalV2 button')].find(x=>x.getAttribute('onclick')==='runMerchantStatementOrderAction()');
 let printWindow=null;try{printWindow=window.open('','_blank','width=1100,height=850');if(printWindow)printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>كشف التاجر</title></head><body style="font-family:Arial;text-align:center;padding:40px">جارٍ توليد الكشف وتجهيز الطباعة…</body></html>');}catch(_){printWindow=null;}
 if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='جارٍ التوليد…';}
 try{
  const result=await api('/api/accounting/shipper-settlements/generate',{method:'POST',body:JSON.stringify({merchant_ids:[String(d.merchant_id)],order_ids,from:d.from,to:d.to})});
  if(result?.success===false)throw new Error(result.error||'فشل التوليد');
  const created=result.data||[],generatedIds=new Set(created.flatMap(r=>(r.items||[]).map(i=>String(i.order_id||i.id||''))));
  const generatedCount=created.reduce((n,r)=>n+Number((r.items||[]).length||r.order_count||0),0);
  if(!created.length||generatedCount<order_ids.length)throw new Error('لم يتم تأكيد توليد كل الأوردرات المحددة؛ راجع Invoice Report قبل إعادة المحاولة.');
  if(order_ids.some(id=>!generatedIds.has(String(id))))throw new Error('لم يتم تأكيد ظهور كل الأوردرات المحددة داخل Invoice Report؛ لم يتم اعتماد التوليد. راجع تقرير الفواتير قبل إعادة المحاولة.');
  if(typeof loadSettlementArchive==='function')await loadSettlementArchive();
  window.__merchantStatementGeneratedPrintRecords=created.map(r=>({...r,merchant_id:r.merchant_id||d.merchant_id,merchant:r.merchant||d.summary}));
  await openMerchantStatementModal(d.merchant_id);
  if(printWindow&&!printWindow.closed){window.__merchantStatementPrintTarget=printWindow;printMerchantStatementModal();}
  else if(typeof toast==='function')toast('تم التوليد بنجاح. استخدم زر PDF داخل كشف التاجر للطباعة.');
 }catch(e){try{if(printWindow&&!printWindow.closed)printWindow.close();}catch(_){}alert(e.message||'تعذر توليد الأوردرات المحددة');}
 finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'تنفيذ';}}
}

function printMerchantStatementModal(){
 const d=window.__merchantStatementModalData;if(!d)return alert('انتظر تحميل بيانات الكشف');
 const target=window.__merchantStatementPrintTarget||null;window.__merchantStatementPrintTarget=null;
 const generated=window.__merchantStatementGeneratedPrintRecords;
 if(Array.isArray(generated)&&generated.length&&String(generated[0]?.merchant_id||generated[0]?.merchant?.id||d.merchant_id)===String(d.merchant_id)){
   window.__merchantStatementGeneratedPrintRecords=null;
   if(generated.length===1){window.__merchantStatementPrintTarget=target;printShipperSettlement(generated[0]);}else printShipperSettlementBulk(generated,target);
   return;
 }
 const r=d.summary||{},orders=Array.isArray(d.eligibleOrders)&&d.eligibleOrders.length?d.eligibleOrders:(d.orders||[]);
 const items=orders.map(o=>({...o,tracking_number:o.tracking_number||o.shipment_no||'',merchant_order_no:o.merchant_order_no||o.order_no||o.order_id||'',receiver_name:o.receiver_name||o.customer_name||'',receiver_phone:o.receiver_phone||o.customer_phone||o.customer_phone_1||o.phone||'',area:o.area||o.region||o.area_name||'',delivery_date:o.delivery_date||o.delivered_at||o.created_at||'',service_charges:Number(o.service_charges??o.delivery_fee??0),merchant_net:Number(o.merchant_net??o.merchant_due??0),cod:Number(o.cod??o.value??0),status:o.status||'Delivered',remarks:o.remarks||o.notes||''}));
 const statementRef=String((d.settlements||[]).find(x=>x.transaction_number||x.settlement_number||x.reference_no)?.transaction_number||(d.settlements||[]).find(x=>x.settlement_number)?.settlement_number||(d.settlements||[]).find(x=>x.reference_no)?.reference_no||r.transaction_number||r.settlement_number||'').trim();
 const voucher={transaction_number:statementRef||r.transaction_number||`PREVIEW-${String(r.merchant_no||r.code||d.merchant_id||'SHIPPER')}-${d.from||today()}`,settlement_date:`${d.from||''}${d.to&&d.to!==d.from?' — '+d.to:''}`,merchant:{id:d.merchant_id,name:r.name||'التاجر',merchant_no:r.merchant_no||'',code:r.code||'',address:r.address||'',tax_rate:Number(r.tax_rate||0)},items,order_count:items.length,collection_amount:items.reduce((n,o)=>n+Number(o.cod||0),0),status:'Preview'};
 window.__merchantStatementPrintTarget=target;printShipperSettlement(voucher);
}

function renderDailyShipperSummary(rows){
 const box=$('dailyShipperSummaryTable');if(!box)return;window.__dailyShipperRows=rows||[];
 if(!rows?.length){box.innerHTML='<div class="shipper-fin-empty"><b>لا توجد بيانات مالية للتجار في الفترة المحددة</b><p>غيّر الفترة ثم اضغط تطبيق الفلاتر.</p></div>';return;}
 box.innerHTML=`<div class="table-wrap"><table class="shipper-financial-table daily-shipper-summary-table"><thead><tr><th><input type="checkbox" aria-label="تحديد كل التجار" onchange="toggleDailyShipperChecks(this)"></th><th>التاجر</th><th>المبالغ</th><th>رسوم التوصيل</th><th>المستحق</th></tr></thead><tbody>${rows.map(r=>`<tr data-daily-shipper-search="${esc(`${r.name||''} ${r.merchant_no||r.code||''}`.toLowerCase())}"><td><input type="checkbox" class="merchantSettlementShipperCheck daily-summary-shipper-check" value="${esc(r.merchant_id)}" aria-label="تحديد التاجر" onchange="syncMerchantSettlementCheck(this)"></td><td><div class="daily-shipper-name-cell"><button class="daily-shipper-name" onclick="openMerchantStatementModal('${esc(r.merchant_id)}')"><span class="shipper-fin-avatar">${esc(String(r.name||'?').trim().charAt(0))}</span><span><b>${esc(r.name||'تاجر بدون اسم')}</b><small>${esc(r.merchant_no||r.code||'')}</small></span><span class="daily-open-hint">عرض الأوردرات ›</span></button><button type="button" class="mini-btn ghost daily-shipper-print-orders" title="طباعة أوردرات التاجر قبل التسوية بنفس قالب Invoice Report" onclick="printPreSettlementShipperOrders('${esc(r.merchant_id)}')">⎙ PDF الأوردرات</button></div></td><td>${money(r.cod||0)}</td><td>${money(r.service_charges||0)}</td><td><b class="${Number(r.balance||0)<0?'verify-negative':'verify-positive'}">${money(r.merchant_due||r.balance||0)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function filterDailyShipperSummary(){const q=String($('dailyShipperSearch')?.value||'').trim().toLowerCase();document.querySelectorAll('#dailyShipperSummaryTable tr[data-daily-shipper-search]').forEach(tr=>tr.hidden=!!q&&!tr.dataset.dailyShipperSearch.includes(q));}
async function openDailyShipper(id,button){
 const detail=$('dailyShipperOrders'),actions=$('dailyShipperDetailsActions'),oldRow=$('dailyShipperInlineDetailsRow');
 if(String(window.__dailyShipperOpenId||'')===String(id)&&detail&&!detail.hidden){detail.hidden=true;if(actions)actions.hidden=true;if(oldRow)oldRow.remove();document.querySelectorAll('.daily-shipper-summary-table .daily-shipper-name').forEach(b=>b.classList.remove('is-open'));const panel=$('dailyShipperSummaryTable')?.closest('.daily-shipper-summary-panel');if(panel){if(actions)panel.appendChild(actions);if(detail)panel.appendChild(detail);}window.__dailyShipperOpenId='';return;}
 if(oldRow)oldRow.remove();document.querySelectorAll('.daily-shipper-summary-table .daily-shipper-name').forEach(b=>b.classList.remove('is-open'));window.__dailyShipperOpenId=String(id);
 if(button){button.classList.add('is-open');const parentRow=button.closest('tr');const inlineRow=document.createElement('tr');inlineRow.id='dailyShipperInlineDetailsRow';inlineRow.className='daily-shipper-inline-details-row';inlineRow.innerHTML='<td colspan="5"><div class="daily-shipper-bank-details"></div></td>';parentRow?.insertAdjacentElement('afterend',inlineRow);const holder=inlineRow.querySelector('.daily-shipper-bank-details');if(holder){if(actions)holder.appendChild(actions);if(detail)holder.appendChild(detail);}}
 if(detail)detail.hidden=false;const s=$('merchantFinancialSelect');if(s)s.value=id;await loadMerchantFinancial();const row=(window.__dailyShipperRows||[]).find(r=>String(r.merchant_id)===String(id));
 if(actions){actions.hidden=false;actions.innerHTML=`<div class="daily-shipper-action-title"><b>${esc(row?.name||'التاجر المحدد')}</b><span>إجراءات الكشف</span></div><div class="actions"><button onclick="printDailyShipperVoucher()">PDF كشف التاجر</button><button class="ghost" onclick="printSelectedDailyShipperOrders()">PDF للأوردرات المحددة</button><button class="ghost" onclick="exportSelectedDailyShipperOrdersExcel()">Excel للأوردرات المحددة</button><button class="ghost" onclick="editSelectedEligibleOrderFees()">تعديل توصيل الأوردرات المحددة</button><button class="ghost" onclick="editAllEligibleOrderFees()">تعديل توصيل كل الأوردرات المؤهلة</button><button onclick="generateDailyShipperSettlement('${esc(id)}')">عمل تسوية</button><button class="ghost" onclick="editDailyShipperFee('${esc(id)}')">تعديل الرسوم الأساسية للتاجر</button></div>`;}
 if(!detail)return;detail.hidden=false;detail.innerHTML='<p class="muted">جارٍ تحميل الأوردرات...</p>';
 try{const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();const d=await api(`/api/accounting/shipper-settlements/eligible-orders?merchant_id=${encodeURIComponent(id)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);const orders=(d.data||[]).filter(o=>o.eligible!==false&&String(o.payment_status||'').trim().toLowerCase()==='paid');window.__dailyShipperOrderRows=orders;
 const eligibleOrders=orders.filter(o=>o.eligible!==false),cod=eligibleOrders.reduce((n,o)=>n+Number(o.cod||0),0),fees=eligibleOrders.reduce((n,o)=>n+Number(o.service_charges||0),0),due=eligibleOrders.reduce((n,o)=>n+Number(o.merchant_due||0),0);const statuses=[...new Set(orders.map(o=>String(o.status||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 detail.innerHTML=`<div class="daily-shipper-orders-heading"><div><h3>أوردرات ${esc(row?.name||'التاجر')}</h3><p>الفترة: ${esc(from)} — ${esc(to)}</p></div><span class="daily-shipper-order-count">${orders.length} أوردر مدفوع ومؤهل</span></div><div class="daily-shipper-order-kpis"><div><small>إجمالي المبالغ</small><b>${money(cod)}</b></div><div><small>رسوم التوصيل</small><b>${money(fees)}</b></div><div><small>صافي التاجر</small><b>${money(due)}</b></div></div><div class="daily-shipper-order-filters"><input id="dailyShipperOrderSearch" type="search" placeholder="ابحث برقم الأوردر أو التتبع أو العميل" oninput="filterDailyShipperOrders()"><select id="dailyShipperOrderStatus" onchange="filterDailyShipperOrders()"><option value="">كل الحالات</option>${statuses.map(st=>`<option value="${esc(st)}">${esc(st)}</option>`).join('')}</select><span id="dailyShipperOrderVisibleCount">${orders.length} أوردر</span></div><div class="table-wrap"><table class="daily-shipper-orders-table"><thead><tr><th><label class="daily-shipper-select-all"><input type="checkbox" aria-label="تحديد كل الأوردرات الظاهرة" title="تحديد كل الأوردرات الظاهرة" onchange="toggleDailyShipperOrderChecks(this)"><small>تحديد</small></label></th><th>رقم الأوردر / التتبع</th><th>العميل</th><th>الحالة</th><th>المبلغ</th><th>رسوم التوصيل</th><th>صافي التاجر</th><th>التاريخ</th><th>حالة الدفع</th><th>طباعة</th><th>تعديل</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr class="${o.eligible===false?'daily-order-ineligible':''}" data-daily-order-search="${esc(`${o.merchant_order_no||''} ${o.tracking_number||''} ${o.customer_name||''} ${o.customer_phone||''}`.toLowerCase())}" data-daily-order-status="${esc(String(o.status||''))}"><td><input type="checkbox" class="daily-shipper-order-check" value="${esc(o.id)}" ${o.eligible===false?'disabled title="غير مؤهل للتوليد"':''}></td><td><b>${esc(o.merchant_order_no||o.tracking_number||o.id||'—')}</b>${o.tracking_number&&o.merchant_order_no?`<small>${esc(o.tracking_number)}</small>`:''}</td><td>${esc(o.customer_name||'—')}${o.customer_phone?`<small>${esc(o.customer_phone)}</small>`:''}</td><td><span class="daily-order-status">${esc(o.status||'—')}</span></td><td>${money(o.cod||0)}</td><td>${money(o.service_charges||0)}</td><td><b>${money(o.merchant_due||0)}</b></td><td>${esc(String(o.delivery_date||o.delivered_at||o.created_at||'').slice(0,10))}</td><td><span class="verify-positive">Paid</span></td><td><button type="button" class="mini-btn ghost" title="طباعة الأوردر بقالب Invoice Report قبل التسوية" aria-label="طباعة الأوردر" onclick="printPreSettlementOrder('${esc(o.id)}')">⎙ PDF</button></td><td>${o.eligible===false?'—':`<button type="button" class="mini-btn ghost" title="تعديل رسوم التوصيل فقط قبل التوليد" aria-label="تعديل رسوم التوصيل" onclick="editEligibleOrderFee('${esc(o.id)}')">✎</button>`}</td></tr>`).join(''):`<tr><td colspan="11" class="muted">لا توجد أوردرات في الفترة المحددة.</td></tr>`}</tbody></table></div>`;filterDailyShipperOrders();
 }catch(e){detail.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
async function editEligibleOrderFeesForIds(ids,scopeLabel){
 const unique=[...new Set((ids||[]).map(String))].filter(id=>(window.__dailyShipperOrderRows||[]).some(o=>String(o.id)===id&&o.eligible!==false));
 if(!unique.length)return alert('حدد أوردرًا واحدًا على الأقل، أو تأكد من وجود أوردرات مؤهلة.');
 const rows=unique.map(id=>(window.__dailyShipperOrderRows||[]).find(o=>String(o.id)===id));
 const currentFees=[...new Set(rows.map(o=>Number(o.service_charges??o.delivery_fee??0)))];
 const initial=currentFees.length===1?String(currentFees[0]):'';
 const answer=await showInputModal(`تعديل رسوم التوصيل لـ ${unique.length} أوردر (${scopeLabel})\nسيتم وضع نفس الرسوم لكل الأوردرات المحددة. أدخل الرسوم الجديدة:`,initial);
 if(answer===null)return;const fee=Number(answer);if(!Number.isFinite(fee)||fee<0)return alert('أدخل رسوم توصيل صحيحة لا تقل عن صفر');
 if(!await showConfirmModal(`تأكيد تعديل رسوم التوصيل إلى ${fee} لكل عدد ${unique.length} أوردر؟`))return;
 let updated=0;const errors=[];
 for(const orderId of unique){try{await api('/api/accounting/merchant-financial/update-fee',{method:'POST',body:JSON.stringify({order_id:orderId,service_charges:fee})});updated++;}catch(e){const o=rows.find(x=>String(x.id)===orderId);errors.push(`${o?.merchant_order_no||o?.tracking_number||orderId}: ${e.message||'فشل التعديل'}`);}}
 const id=String($('merchantFinancialSelect')?.value||'');if($('dailyShipperOrders'))$('dailyShipperOrders').hidden=true;await openDailyShipper(id);
 if(errors.length)alert(`تم تعديل ${updated} أوردر من ${unique.length}. تعذر تعديل ${errors.length}:\n${errors.slice(0,8).join('\n')}`);else alert(`تم تعديل رسوم التوصيل بنجاح لـ ${updated} أوردر.`);
}
function editSelectedEligibleOrderFees(){const ids=[...document.querySelectorAll('#dailyShipperOrders .daily-shipper-order-check:checked')].map(x=>x.value);return editEligibleOrderFeesForIds(ids,'الأوردرات المحددة');}
function editAllEligibleOrderFees(){const ids=(window.__dailyShipperOrderRows||[]).filter(o=>o.eligible!==false).map(o=>o.id);return editEligibleOrderFeesForIds(ids,'كل الأوردرات المؤهلة للتاجر في الفترة الحالية');}
async function editEligibleOrderFee(orderId){const o=(window.__dailyShipperOrderRows||[]).find(x=>String(x.id)===String(orderId));if(!o)return alert('الأوردر غير موجود في الكشف الحالي');if(o.eligible===false)return alert(o.ineligible_reason||'الأوردر غير مؤهل للتوليد');const current=Number(o.service_charges??o.delivery_fee??0);const answer=await showInputModal(`تعديل رسوم التوصيل للأوردر ${o.merchant_order_no||o.tracking_number||orderId} فقط\nالرسوم الحالية: ${current}`,String(current));if(answer===null)return;const fee=Number(answer);if(!Number.isFinite(fee)||fee<0)return alert('أدخل رسوم توصيل صحيحة لا تقل عن صفر');try{await api('/api/accounting/merchant-financial/update-fee',{method:'POST',body:JSON.stringify({order_id:orderId,service_charges:fee})});const id=String($('merchantFinancialSelect')?.value||'');if($('dailyShipperOrders'))$('dailyShipperOrders').hidden=true;await openDailyShipper(id);msg('merchantGenerateMsg','تم تحديث رسوم التوصيل لهذا الأوردر فقط.','ok');}catch(e){alert(e.message||'تعذر تعديل رسوم التوصيل');}}
function filterDailyShipperOrders(){const q=String($('dailyShipperOrderSearch')?.value||'').trim().toLowerCase(),status=String($('dailyShipperOrderStatus')?.value||'');let visible=0;document.querySelectorAll('#dailyShipperOrders tr[data-daily-order-search]').forEach(tr=>{const show=(!q||tr.dataset.dailyOrderSearch.includes(q))&&(!status||tr.dataset.dailyOrderStatus===status);tr.hidden=!show;if(show)visible++;});const count=$('dailyShipperOrderVisibleCount');if(count)count.textContent=`${visible} من ${(window.__dailyShipperOrderRows||[]).length} أوردر`;const all=$('#dailyShipperOrders thead input[type="checkbox"]');if(all)all.checked=false;}


async function printPreSettlementShipperOrders(merchantId){
 const summary=(window.__dailyShipperRows||[]).find(x=>String(x.merchant_id)===String(merchantId));
 if(!summary)return alert('التاجر غير موجود في القائمة الحالية');
 const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();
 try{
  const d=await api(`/api/accounting/shipper-settlements/eligible-orders?merchant_id=${encodeURIComponent(merchantId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const orders=(d.data||[]).filter(o=>o.eligible!==false&&String(o.payment_status||'').trim().toLowerCase()==='paid');
  if(!orders.length)return alert(`لا توجد أوردرات مدفوعة ومؤهلة قبل التسوية للتاجر ${summary.name||''} في الفترة المحددة`);
  const merchant={id:merchantId,name:summary.name||orders[0].merchant_name||orders[0].shipper_name||'التاجر',merchant_no:summary.merchant_no||summary.code||orders[0].merchant_no||orders[0].merchant_code||'',code:summary.code||orders[0].merchant_code||'',address:summary.address||orders[0].merchant_address||'',tax_enabled:summary.tax_enabled===true||orders[0].tax_enabled===true,tax_rate:Number(summary.tax_rate??orders[0].tax_rate??0)};
  const items=orders.map(o=>({...o,tracking_number:o.tracking_number||o.shipment_no||'',merchant_order_no:o.merchant_order_no||o.order_no||o.order_code||'',receiver_name:o.receiver_name||o.customer_name||o.recipient_name||'',receiver_phone:o.receiver_phone||o.customer_phone||o.customer_phone_1||o.phone||'',customer_phone_2:o.customer_phone_2||o.phone_2||o.phone2||o.alternate_phone||'',area:o.area||o.region||o.area_name||o.region_name||'',delivery_date:String(o.delivery_date||o.delivered_at||o.actual_delivery_date||o.created_at||today()).slice(0,10),service_charges:Number(o.service_charges??o.delivery_fee??0),merchant_net:Number(o.merchant_due??o.merchant_net??0),cod:Number(o.cod||0),status:o.status||'Delivered',remarks:o.remarks||o.notes||''}));
  const ref=String(merchant.merchant_no||merchant.id||merchantId).replace(/[^A-Za-z0-9-]/g,'').slice(0,18)||'SHIPPER';
  printShipperSettlement({transaction_number:`PRE-${ref}-${from}-${to}`.replace(/[^A-Za-z0-9-]/g,'-').slice(0,40),settlement_date:`${from} — ${to}`,merchant,items,order_count:items.length,collection_amount:items.reduce((n,o)=>n+Number(o.cod||0),0),generated_by_name:window.__currentUser?.full_name||window.__user?.full_name||''});
 }catch(e){alert(e.message||'تعذر تحميل أوردرات التاجر للطباعة');}
}

function printPreSettlementOrder(orderId){
 const o=(window.__dailyShipperOrderRows||[]).find(x=>String(x.id)===String(orderId));if(!o)return alert('الأوردر غير موجود في الكشف الحالي');
 const merchantId=String($('merchantFinancialSelect')?.value||'');const summary=(window.__dailyShipperRows||[]).find(x=>String(x.merchant_id)===merchantId)||{};
 const merchant={id:merchantId,name:summary.name||o.merchant_name||o.shipper_name||'التاجر',merchant_no:summary.merchant_no||summary.code||o.merchant_no||o.merchant_code||'',code:summary.code||o.merchant_code||'',address:summary.address||o.merchant_address||'',tax_enabled:summary.tax_enabled===true||o.tax_enabled===true,tax_rate:Number(summary.tax_rate??o.tax_rate??0)};
 const orderRef=String(o.tracking_number||o.merchant_order_no||o.id||'ORDER').replace(/[^A-Za-z0-9-]/g,'').slice(0,24)||'ORDER';
 const item={...o,tracking_number:o.tracking_number||o.shipment_no||'',merchant_order_no:o.merchant_order_no||o.order_no||o.order_code||'',receiver_name:o.receiver_name||o.customer_name||o.recipient_name||'',receiver_phone:o.receiver_phone||o.customer_phone||o.customer_phone_1||o.phone||'',customer_phone_2:o.customer_phone_2||o.phone_2||o.phone2||o.alternate_phone||'',area:o.area||o.region||o.area_name||o.region_name||'',delivery_date:String(o.delivery_date||o.delivered_at||o.actual_delivery_date||o.created_at||today()).slice(0,10),service_charges:Number(o.service_charges??o.delivery_fee??0),merchant_net:Number(o.merchant_due??o.merchant_net??0),cod:Number(o.cod||0),status:o.status||'Delivered',remarks:o.remarks||o.notes||''};
 printShipperSettlement({transaction_number:`PRE-${orderRef}`,settlement_date:item.delivery_date,merchant,items:[item],order_count:1,collection_amount:Number(item.cod||0),generated_by_name:window.__currentUser?.full_name||window.__user?.full_name||''});
}

function printDailyShipperVoucher(){const orders=window.__dailyShipperOrderRows||[];if(!orders.length)return alert('لا توجد أوردرات لعرضها في الكشف');const id=String($('merchantFinancialSelect')?.value||'');const r=(window.__dailyShipperRows||[]).find(x=>String(x.merchant_id)===id)||{};const merchant={id:r.merchant_id,name:r.name||'التاجر',merchant_no:r.merchant_no||r.code||'',code:r.code||'',address:r.address||'',tax_rate:r.tax_rate||0};const items=orders.map(o=>({...o,merchant_order_no:o.merchant_order_no||o.order_no||'',service_charges:Number(o.service_charges||o.delivery_fee||0),merchant_net:Number(o.merchant_due??o.merchant_net??(Number(o.cod||0)-Number(o.service_charges||o.delivery_fee||0)),)}));printShipperSettlement({transaction_number:`DAILY-${today()}-${merchant.merchant_no||merchant.id||'SHIPPER'}`,settlement_date:$('merchantFinTo')?.value||today(),merchant,items,order_count:items.length,collection_amount:items.reduce((n,o)=>n+(String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='cancelled by shipper'?0:Number(o.cod||0)),0),generated_by_name:window.__currentUser?.full_name||window.__user?.full_name||''});}
async function generateDailyShipperSettlement(id){const checks=[...document.querySelectorAll('.merchantSettlementShipperCheck')];checks.forEach(ch=>ch.checked=String(ch.value)===String(id));const sel=$('merchantFinancialSelect');if(sel)sel.value=id;await generateMerchantFinancial();}
async function editDailyShipperFee(id){try{const m=(await api('/api/merchants')).data?.find(x=>String(x.id)===String(id));if(!m)throw new Error('لم يتم العثور على التاجر');const current=Number(m.base_delivery_fee||0);const answer=await showInputModal(`رسوم التوصيل الأساسية للتاجر: ${m.name||''}\nأدخل القيمة الجديدة:`,String(current));if(answer===null)return;const fee=Number(answer);if(!Number.isFinite(fee)||fee<0)throw new Error('أدخل قيمة صحيحة لا تقل عن صفر');await api('/api/accounting/merchant-delivery-fee',{method:'PATCH',body:JSON.stringify({id,base_delivery_fee:fee})});alert('تم حفظ رسوم التوصيل الأساسية للتاجر. هذا التعديل لا يغيّر رسوم الأوردرات السابقة.');await loadMerchantFinancial();await openDailyShipper(id);}catch(e){alert(e.message);}}

function resetMerchantFinancialFilters(){if($('merchantFinancialSelect'))$('merchantFinancialSelect').value='';if($('merchantFinFrom'))$('merchantFinFrom').value=daysAgo(7);if($('merchantFinTo'))$('merchantFinTo').value=today();if($('merchantBalanceFilter'))$('merchantBalanceFilter').value='all';loadMerchantFinancial();}
function filterMerchantFinancialRows(){const q=String($('merchantFinancialSearch')?.value||'').toLowerCase().trim();document.querySelectorAll('#merchantFinancialBox tr[data-shipper-search]').forEach(tr=>{tr.style.display=!q||tr.dataset.shipperSearch.includes(q)?'':'none';});}
// Backward-compatible aliases used by the Shipper Financial Statements page markup.
function loadShipperFinancial(){return loadMerchantFinancial();}
function resetShipperFinancialFilters(){return resetMerchantFinancialFilters();}
function filterShipperFinancialRows(){return filterMerchantFinancialRows();}
function exportMerchantFinancialRows(){const table=$('merchantFinancialBox')?.querySelector('table');if(!table)return msg('merchantFinancialMsg',L('Load financial records first.','حمّل السجلات المالية أولاً.'),'error');const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>td.innerText.trim()));const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`shipper-financial-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function toggleAllSettlementShippers(el){document.querySelectorAll('.merchantSettlementShipperCheck').forEach(x=>x.checked=!!el.checked);}
function syncMerchantSettlementCheck(el){document.querySelectorAll('.merchantSettlementShipperCheck').forEach(x=>{if(String(x.value)===String(el.value))x.checked=!!el.checked;});}
function toggleDailyShipperChecks(el){document.querySelectorAll('.daily-summary-shipper-check').forEach(x=>{x.checked=!!el.checked;syncMerchantSettlementCheck(x);});}
function selectedSettlementShippers(){return [...new Set([...document.querySelectorAll('.merchantSettlementShipperCheck:checked')].map(x=>x.value).filter(Boolean))];}
function toggleDailyShipperOrderChecks(el){document.querySelectorAll('#dailyShipperOrders .daily-shipper-order-check').forEach(x=>{const row=x.closest('tr');if(!row||!row.hidden)x.checked=!!el.checked;});}
function printSelectedDailyShipperOrders(){const ids=new Set([...document.querySelectorAll('.daily-shipper-order-check:checked')].map(x=>String(x.value)));const rows=(window.__dailyShipperOrderRows||[]).filter(o=>ids.has(String(o.id)));if(!rows.length)return alert('حدد أوردرًا واحدًا على الأقل لعرض PDF');const w=window.open('','_blank','width=1000,height=800');if(!w)return;const name=(window.__dailyShipperRows||[]).find(r=>String(r.merchant_id)===String($('merchantFinancialSelect')?.value))?.name||'التاجر';w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>كشف الأوردرات المحددة</title><style>body{font-family:Arial,Tahoma;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:center}th{background:#eef2f7}</style></head><body>${companyPrintBrandHeader()}<h2>الأوردرات المحددة — ${esc(name)}</h2><table><thead><tr><th>رقم الأوردر</th><th>الحالة</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th><th>التاريخ</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.merchant_order_no||o.tracking_number||o.id||'—')}</td><td>${esc(o.status||'')}</td><td>${money(o.cod||0)}</td><td>${money(o.service_charges||0)}</td><td>${money(o.merchant_due||0)}</td><td>${esc(String(o.delivery_date||o.delivered_at||o.created_at||'').slice(0,10))}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);w.document.close();}
async function exportSelectedDailyShippersExcel(){
 const ids=selectedSettlementShippers();if(!ids.length)return alert('حدد تاجرًا واحدًا على الأقل لتصدير Excel');const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();
 try{const reports=await Promise.all(ids.map(async id=>{const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(id)}&balance=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);return {summary:(d.data||[])[0],orders:d.orders||[]};}));const wb=await trendExcelWorkbook();let count=0;
 for(const {summary:r,orders} of reports){if(!r)continue;count++;const ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,r.name||`Shipper ${count}`));ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.2,right:.2,top:.3,bottom:.3}};ws.columns=[{width:22},{width:20},{width:14},{width:16},{width:17},{width:18}];ws.mergeCells('C1:F1');ws.getCell('C1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('C1').font={name:'Arial',size:16,bold:true,color:{argb:'FF17365D'}};ws.getCell('C1').alignment={horizontal:'center'};ws.mergeCells('C2:F2');ws.getCell('C2').value='SHIPPER ACCOUNT STATEMENT';ws.getCell('C2').font={name:'Arial',size:13,bold:true};ws.getCell('C2').alignment={horizontal:'center'};ws.mergeCells('A3:C3');ws.getCell('A3').value=`Shipper: ${r.name||''} (${r.merchant_no||r.code||''})`;ws.mergeCells('D3:F3');ws.getCell('D3').value=`Period: ${from} — ${to}`;ws.mergeCells('A4:B4');ws.getCell('A4').value=`COD: ${Number(r.cod||0)}`;ws.mergeCells('C4:D4');ws.getCell('C4').value=`Delivery Fees: ${Number(r.service_charges||0)}`;ws.mergeCells('E4:F4');ws.getCell('E4').value=`Shipper Net: ${Number(r.merchant_due||r.balance||0)}`;for(const a of ['A3','D3','A4','C4','E4']){ws.getCell(a).font={name:'Arial',size:10,bold:true};ws.getCell(a).alignment={horizontal:'center',vertical:'middle'};}ws.addRow(['Tracking','Order No.','COD','Delivery Fees','Shipper Net','Status']);trendExcelStyleHeader(ws,5,1,6);orders.forEach(o=>ws.addRow([o.tracking_number||'',o.merchant_order_no||'',Number(o.cod||0),Number(o.service_charges||0),Number(o.merchant_due||0),o.status||'']));if(orders.length)trendExcelStyleBody(ws,6,5+orders.length,1,6);await trendExcelAddLogo(wb,ws);}
 if(!count)return alert('لا توجد بيانات قابلة للتصدير للتجار المحددين');trendExcelDownload(await wb.xlsx.writeBuffer(),`daily-shipper-statements-${today()}.xlsx`);
 }catch(e){alert(e.message||'تعذر إنشاء ملف Excel');}
}
async function exportSelectedDailyShipperOrdersExcel(){
 const ids=new Set([...document.querySelectorAll('.daily-shipper-order-check:checked')].map(x=>String(x.value))),rows=(window.__dailyShipperOrderRows||[]).filter(o=>ids.has(String(o.id)));if(!rows.length)return alert('حدد أوردرًا واحدًا على الأقل لتصدير Excel');const name=(window.__dailyShipperRows||[]).find(r=>String(r.merchant_id)===String($('merchantFinancialSelect')?.value))?.name||'التاجر';
 try{const wb=await trendExcelWorkbook(),ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,'Selected Orders'));ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.2,right:.2,top:.3,bottom:.3}};ws.columns=[{width:22},{width:20},{width:14},{width:16},{width:17},{width:18}];ws.mergeCells('C1:F1');ws.getCell('C1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('C1').font={name:'Arial',size:16,bold:true,color:{argb:'FF17365D'}};ws.getCell('C1').alignment={horizontal:'center'};ws.mergeCells('C2:F2');ws.getCell('C2').value=`SELECTED ORDERS — ${name}`;ws.getCell('C2').font={name:'Arial',size:13,bold:true};ws.getCell('C2').alignment={horizontal:'center'};ws.addRow(['Order No.','Status','COD','Delivery Fees','Shipper Net','Date']);trendExcelStyleHeader(ws,3,1,6);rows.forEach(o=>ws.addRow([o.merchant_order_no||o.tracking_number||o.id||'',o.status||'',Number(o.cod||0),Number(o.service_charges||0),Number(o.merchant_due||0),String(o.delivery_date||o.delivered_at||o.created_at||'').slice(0,10)]));trendExcelStyleBody(ws,4,3+rows.length,1,6);await trendExcelAddLogo(wb,ws);trendExcelDownload(await wb.xlsx.writeBuffer(),`daily-shipper-selected-orders-${today()}.xlsx`);}catch(e){alert(e.message||'تعذر إنشاء ملف Excel');}
}
async function printSelectedDailyShippers(){const ids=selectedSettlementShippers();if(!ids.length)return alert('حدد تاجرًا واحدًا على الأقل لعرض PDF');const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();const w=window.open('','_blank','width=1000,height=800');if(!w)return;try{const reports=await Promise.all(ids.map(async id=>{const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(id)}&balance=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);return {summary:(d.data||[])[0],orders:d.orders||[]};}));const pages=reports.filter(x=>x.summary).map(({summary:r,orders})=>`<section style="page-break-after:always"><h2>كشف حساب التاجر: ${esc(r.name||'')}</h2><p>الكود: ${esc(r.merchant_no||r.code||'')} | الفترة: ${esc(from)} — ${esc(to)}</p><p>COD: <b>${money(r.cod||0)}</b> | رسوم التوصيل: <b>${money(r.service_charges||0)}</b> | الرصيد: <b>${money(r.balance||0)}</b></p><table><thead><tr><th>Tracking</th><th>رقم الأوردر</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th><th>الحالة</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.tracking_number||'')}</td><td>${esc(o.merchant_order_no||'')}</td><td>${money(o.cod||0)}</td><td>${money(o.service_charges||0)}</td><td>${money(o.merchant_due||0)}</td><td>${esc(o.status||'')}</td></tr>`).join('')}</tbody></table></section>`).join('');w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>كشوف التجار المحددين</title><style>body{font-family:Arial,Tahoma;padding:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #bbb;padding:6px;text-align:center}th{background:#eef2f7}</style></head><body>${companyPrintBrandHeader()}${pages}<script>window.onload=()=>window.print()</script></body></html>`);w.document.close();}catch(e){w.close();alert(e.message);}}
async function printShipperStatement(){
  const selected=String($('merchantFinancialSelect')?.value||'').trim();
  const ids=selected?[selected]:selectedSettlementShippers();
  if(!ids.length){msg('merchantGenerateMsg','اختر تاجرًا أو حدّد التجار المطلوب طباعة كشوفهم أولاً.','error');return;}
  const from=$('merchantFinFrom')?.value||daysAgo(7),to=$('merchantFinTo')?.value||today();
  if(from>to){msg('merchantGenerateMsg','تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.','error');return;}
  const w=window.open('','_blank','width=1100,height=850');
  if(!w){msg('merchantGenerateMsg','اسمح بفتح النوافذ المنبثقة لطباعة الكشف.','error');return;}
  w.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>كشوف التجار</title></head><body style="font-family:Arial,Tahoma;padding:20px">جارٍ تجهيز الكشف...</body></html>');
  try{
    const reports=await Promise.all(ids.map(async id=>{
      const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(id)}&balance=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const r=(d.data||[]).find(x=>String(x.id||x.merchant_id)===String(id))||(d.data||[])[0];
      if(!r) return null;
      return {r,orders:d.orders||[]};
    }));
    const pages=reports.filter(Boolean).map(({r,orders})=>`<section style="page-break-after:always"><h2>كشف حساب التاجر: ${esc(r.name||'')}</h2><p>كود التاجر: <b>${esc(r.merchant_no||r.code||'—')}</b> | الفترة: ${esc(from)} — ${esc(to)}</p><p>إجمالي COD: <b>${money(r.cod||0)}</b> | رسوم التوصيل: <b>${money(r.service_charges||0)}</b> | صافي مستحق التاجر: <b>${money(r.merchant_due||0)}</b> | الرصيد: <b>${money(r.balance||0)}</b></p><table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr><th>رقم الأوردر</th><th>Tracking</th><th>الحالة</th><th>التاريخ</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr><td>${esc(o.merchant_order_no||o.order_no||'—')}</td><td>${esc(o.tracking_number||'—')}</td><td>${esc(o.status||'—')}</td><td>${esc(String(o.delivery_date||o.delivered_at||o.created_at||'').slice(0,10))}</td><td>${money(o.cod||0)}</td><td>${money(o.service_charges||o.delivery_fee||0)}</td><td>${money(o.merchant_due||0)}</td></tr>`).join(''):'<tr><td colspan="7">لا توجد أوردرات في الفترة المحددة</td></tr>'}</tbody></table></section>`).join('');
    if(!pages){w.close();msg('merchantGenerateMsg','لا توجد بيانات مالية قابلة للطباعة للتاجر والفترة المحددين.','error');return;}
    w.document.open();w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>كشوف التجار</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}html{background:#e9edf3}body{font-family:Arial,Tahoma;padding:10mm;color:#222;width:297mm;min-height:210mm;margin:18px auto;background:#fff;box-shadow:0 3px 18px #0002}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #aaa;padding:7px;text-align:center;font-size:12px}th{background:#edf1f5}h2{margin-bottom:8px}@media screen{body{width:min(297mm,calc(100vw - 24px));min-height:210mm;padding:clamp(10px,3vw,10mm)}}@media print{html{background:#fff}body{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}</style></head><body>${companyPrintBrandHeader()}${pages}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }catch(e){w.close();msg('merchantGenerateMsg',e.message||'تعذر تجهيز كشف التاجر للطباعة.','error');}
}

function ensureMerchantGenerationFeedback(){
  let page=document.querySelector('.shipper-fin-page');
  const host=page||document.getElementById('app');
  if(!host)return {box:null,status:null};
  let status=host.querySelector('#merchantGenerateMsg')||document.getElementById('merchantGenerateMsg');
  let box=host.querySelector('#merchantGeneratedBox')||document.getElementById('merchantGeneratedBox');
  if(!status){status=document.createElement('div');status.id='merchantGenerateMsg';status.className='msg';status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
  if(!box){box=document.createElement('div');box.id='merchantGeneratedBox';box.className='merchant-generated-results';box.setAttribute('aria-live','polite');}
  if(!status.isConnected||!box.isConnected){
    const heading=host.querySelector('.shipper-fin-heading');
    const anchor=heading?.nextSibling||host.firstChild;
    if(!status.isConnected)host.insertBefore(status,anchor||null);
    if(!box.isConnected)status.insertAdjacentElement('afterend',box);
  }
  return {box,status};
}
function renderMerchantGenerationResults(rows){
  const feedback=ensureMerchantGenerationFeedback();
  if(!feedback.box)return false;
  const records=(rows||[]).filter(Boolean);
  if(!records.length){feedback.box.innerHTML=`<div class="msg error">${L('No eligible paid orders or Cancelled by Shipper orders were found for the selected shippers and dates.','لم يتم إنشاء تسوية: لا توجد أوردرات مؤهلة للتجار والفترة المحددة. تحقق من التاريخ وحالة الدفع وحالة الأوردر.')}</div>`;return true;}
  feedback.box.innerHTML=`<section class="merchant-generation-result-panel"><div class="section-title-row"><h3>${L('Generation result','نتيجة التوليد')}</h3><b>${records.length} ${L('settlement records','كشف تسوية')}</b></div><div class="table-wrap"><table class="merchant-generation-result-table"><thead><tr><th>${L('Transaction No.','رقم العملية')}</th><th>${L('Shipper','التاجر')}</th><th>${L('Date','التاريخ')}</th><th>${L('Orders','الأوردرات')}</th><th>${L('COD Total','إجمالي COD')}</th><th>${L('Status','الحالة')}</th></tr></thead><tbody>${records.map(r=>{const items=Array.isArray(r.items)?r.items:[];const cod=items.reduce((sum,item)=>sum+Number(item.cod||0),0);return `<tr><td><b>${esc(r.transaction_number||'—')}</b></td><td>${esc(r.merchant?.name||r.merchant_name||'—')}</td><td>${esc(String(r.settlement_date||'').slice(0,10)||'—')}</td><td>${Number(r.order_count??items.length??0)}</td><td>${money(cod)}</td><td>${esc(r.status||'Unpaid Shipper')}</td></tr>`;}).join('')}</tbody></table></div><p class="muted">${L('The generated records are saved and available in Invoice Report.','تم حفظ سجلات التوليد وهي متاحة في صفحة Invoice Report.')}</p></section>`;
  return true;
}

// Main-list generation buttons should sound at the actual user click (not only
// after asynchronous rendering), which also satisfies mobile browser audio policies.
if(!window.__trendMerchantGenerationClickSound){
  window.__trendMerchantGenerationClickSound=true;
  document.addEventListener('click',function(event){
    const button=event.target?.closest?.('button');
    if(!button)return;
    const action=String(button.getAttribute('onclick')||'');
    const text=String(button.innerText||button.textContent||'').trim().toLowerCase();
    if(action.includes('generateMerchantFinancial(')||action.includes('generateDailyShipperSettlement(')||/توليد|generate settlement|generate statements/.test(text)){
      playTrendWarningTone('warning');
    }
  },true);
}
async function generateMerchantFinancial(){
  const selectedOrderChecks=[...document.querySelectorAll('#dailyShipperOrders .daily-shipper-order-check:checked')];
  const selectedOrderIds=[...new Set(selectedOrderChecks.map(x=>String(x.value||'').trim()).filter(Boolean))];
  const current=String($("merchantFinancialSelect")?.value||'').trim();
  // Selecting a shipper alone generates all eligible orders for that shipper/date range.
  // If order checkboxes are used inside the expanded order list, generate ONLY those orders.
  // When no dropdown shipper is selected, allow the summary-table shipper checkboxes.
  if(selectedOrderIds.length&&!current)return msg('merchantGenerateMsg','افتح كشف التاجر وحدد الأوردرات من داخل نافذة أوردراته أولاً.','error');
  const selectedMerchantIds=selectedSettlementShippers();
  // If the user checked merchants in the summary table, honor those checks even if the
  // dropdown still contains a previously opened merchant. Otherwise use the dropdown.
  const ids=selectedOrderIds.length?(current?[current]:[]):(selectedMerchantIds.length?selectedMerchantIds:(current?[current]:[]));
  if(!ids.length)return msg('merchantGenerateMsg','حدد تاجرًا واحدًا على الأقل من القائمة أو من مربعات تحديد التجار.','error');
  const from=$("merchantFinFrom")?.value||today(),to=$("merchantFinTo")?.value||from;
  if(from>to)return msg('merchantGenerateMsg',L('From date cannot be after To date','تاريخ من لا يمكن أن يكون بعد تاريخ إلى'),'error');
  const buttons=[...document.querySelectorAll('button[onclick="generateMerchantFinancial()"]')];
  ensureMerchantGenerationFeedback();
  buttons.forEach(b=>{b.disabled=true;b.dataset.oldText=b.textContent;b.textContent='جارٍ التوليد…';});
  msg('merchantGenerateMsg','جارٍ إنشاء التسوية والتحقق من النتيجة…','');
  let settlementPrintWindow=null;
  try{
    settlementPrintWindow=window.open('','_blank','width=1100,height=850');
    if(settlementPrintWindow)settlementPrintWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>كشوفات التجار</title></head><body style="font-family:Arial;text-align:center;padding:40px">جارٍ توليد الكشوف وتجهيز الطباعة…</body></html>');
    const d=await api('/api/accounting/shipper-settlements/generate',{method:'POST',body:JSON.stringify({merchant_ids:ids,from,to,...(selectedOrderIds.length?{order_ids:selectedOrderIds}:{})})});
    if(d?.success===false)throw new Error(d.error||'فشل توليد التسوية');
    const rows=d.data||[];
    if(!rows.length){renderMerchantGenerationResults([]);msg('merchantGenerateMsg','لم يتم إنشاء تسوية. راجع رسالة التوضيح أسفل زر التوليد.','error');return;}
    // Reacquire/create the result area after the request: the app uses dynamic page rendering,
    // so a previously captured DOM node can be detached while the request is in flight.
    const displayed=renderMerchantGenerationResults(rows);
    if(!displayed){if(typeof toast==='function')toast(L('Settlement generated successfully. Open Invoice Report to view it.','تم توليد التسوية بنجاح. افتح Invoice Report لعرضها.'));}
    msg('merchantGenerateMsg',L('Settlement generated successfully. The result is shown below and is available in Invoice Report.','تم توليد الكشف بنجاح. نتيجة التوليد ظاهرة بالأسفل والكشف موجود في صفحة Invoice Report.'),'ok');
    // Clear selected order checkboxes only after the server confirms success, then refresh both views.
    selectedOrderChecks.forEach(ch=>{ch.checked=false;});
    if(typeof loadMerchantFinancial==='function')await loadMerchantFinancial();
    if(selectedOrderIds.length&&current&&typeof openDailyShipper==='function'){if($('dailyShipperOrders'))$('dailyShipperOrders').hidden=true;if(selectedOrderIds.length&&current&&typeof openDailyShipper==='function')await openDailyShipper(current);}
    if(typeof loadSettlementArchive==='function')await loadSettlementArchive();
    // After successful bulk generation, print the confirmed generated vouchers from the same
    // Invoice Report settlement template. Open the print window during the click when possible.
    const printRecords=rows.filter(r=>Array.isArray(r.items)&&r.items.length);
    if(printRecords.length){try{printShipperSettlementBulk(printRecords,settlementPrintWindow);settlementPrintWindow=null;}catch(_){}}
    else if(settlementPrintWindow&&!settlementPrintWindow.closed)settlementPrintWindow.close();
  }catch(e){try{if(settlementPrintWindow&&!settlementPrintWindow.closed)settlementPrintWindow.close();}catch(_){}msg('merchantGenerateMsg',e.message||'تعذر توليد التسوية','error');}
  finally{buttons.forEach(b=>{b.disabled=false;if(b.dataset.oldText)b.textContent=b.dataset.oldText;});}
}
function printShipperSettlementBulk(records,targetWindow){
 const list=(records||[]).filter(r=>Array.isArray(r.items)&&r.items.length);if(!list.length)return;
 const w=targetWindow||window.open('','_blank','width=1100,height=850');if(!w)return alert('اسمح بفتح النوافذ المنبثقة لطباعة كشوف التسوية');
 const pages=list.map(r=>{
  const items=r.items||[],barcode=code39BarcodeSVG(String(r.transaction_number||'').replace(/[^A-Za-z0-9-]/g,''));
  const vatRate=r.merchant?.tax_enabled===true?Math.max(0,Math.min(100,Number(r.merchant?.tax_rate||0)))/100:0;
  const itemVat=i=>{if(String(i.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='cancelled by shipper')return 0;const saved=Number(i.tax_amount);return i.tax_amount!==undefined&&i.tax_amount!==null&&Number.isFinite(saved)&&saved>=0?Number(saved.toFixed(2)):Number((Number(i.service_charges||0)*vatRate).toFixed(2));};
  const cod=items.reduce((n,i)=>n+Number(i.cod||0),0),fees=items.reduce((n,i)=>n+Number(i.service_charges||0),0),vat=Number(items.reduce((n,i)=>n+itemVat(i),0).toFixed(2)),net=Number(items.reduce((n,i)=>n+Number(i.merchant_net||0),0).toFixed(2));
  const creators=[...new Set(items.map(i=>String(i.created_by_name||'').trim()).filter(Boolean))],currentEmployeeName=String(CURRENT_USER?.name||CURRENT_USER?.username||CURRENT_USER?.email||'').trim(),printedBy=creators.length===1?creators[0]:creators.length?creators.join(', '):(String(r.generated_by_name||r.created_by_name||'').trim()||currentEmployeeName||'—');
  return `<main class="voucher"><header class="top"><div class="brand"><strong>${esc(window.__companyName||'DELIVERY SERVICES')}</strong></div><div class="title"><h1>Shipper Payment Voucher</h1><div class="merchant">${esc(r.merchant?.name||r.merchant_name||'')}</div><div class="voucher-no">${esc(r.transaction_number||'')}</div></div><div class="barcode">${barcode}<small>${esc(r.transaction_number||'')}</small></div></header><section class="meta"><div><b>Shipper Account:</b> ${esc(r.merchant?.merchant_no||r.merchant?.code||r.merchant?.id||'—')}</div><div><b>Dated:</b> ${esc(r.settlement_date||'')}</div><div><b>Shipper Address:</b> ${esc(r.merchant?.address||'—')}</div><div><b>Printed By:</b> ${esc(printedBy)}</div></section><section class="details"><table><thead><tr><th style="width:3.5%">Sr</th><th style="width:13%">Tracking / Shipment / Order No</th><th>Receiver / Mobile No</th><th>Area</th><th>Delivery Date</th><th>COD</th><th>Service Charges</th><th>Tax</th><th>Amount Remaining</th><th>Status</th><th>Order Created By</th><th>Remarks</th></tr></thead><tbody>${items.map((i,index)=>`<tr><td style="width:3.5%">${index+1}</td><td style="width:13%;font-size:7px"><small>Track:</small> ${esc(i.tracking_number||i.tracking_no||'—')}<br><small>Ship:</small> ${esc(i.shipment_no||i.shipment_number||(i.shipment&&i.shipment.shipment_no)||(i.shipment&&i.shipment.shipment_number)||'—')}<br><small>Order:</small> ${esc(i.merchant_order_no||i.order_no||i.order_id||(i.order&&i.order.merchant_order_no)||(i.order&&i.order.order_code)||'—')}</td><td>${esc(i.receiver_name||i.customer_name||'—')}<br>${esc([i.receiver_phone||i.customer_phone||'',i.customer_phone_2||''].filter(Boolean).join(' / '))}</td><td>${esc(i.area||i.region||i.area_name||'—')}</td><td>${esc(i.delivery_date||r.settlement_date||'—')}</td><td>${Number(i.cod||0).toFixed(2)}</td><td>${Number(i.service_charges||0).toFixed(2)}</td><td>${itemVat(i).toFixed(2)}</td><td>${Number(i.merchant_net||0).toFixed(2)}</td><td>${esc(i.status||'Delivered')}</td><td>${esc(i.created_by_name||'—')}</td><td>${esc(i.remarks||i.notes||'')}</td></tr>`).join('')}</tbody></table></section><section class="totals"><div class="line"><span>COD Total:</span><b>${cod.toFixed(2)} AED</b></div><div class="line"><span>Total Shipments:</span><b>${items.length}</b></div><div class="line"><span>Service Charges:</span><b>${fees.toFixed(2)} AED</b></div><div class="line"><span>VAT on Service Charges:</span><b>${vat.toFixed(2)} AED</b></div><div class="line grand"><span>Grand Total:</span><span>${net.toFixed(2)} AED</span></div></section><div class="notice">The company is not responsible for amounts not settled after 7 days from the delivery date.</div><div class="sign"><span>Client Sig&nbsp;&nbsp; ........................</span></div><footer class="footer"><span>Address</span><span class="site">Website: ${esc(window.__companyWebsite||'')}</span><span>Printed: ${new Date().toLocaleDateString('en-GB')}<br>Page 1 / ${list.length}</span></footer></main>`;
 }).join('<div class="page-break"></div>');
 w.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Shipper Payment Vouchers</title><style>@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}html{background:#e9edf3}body{font-family:Arial,Helvetica,sans-serif;padding:9mm;color:#111;font-size:10px;margin:18px auto;background:#fff}.voucher{min-height:275mm;display:flex;flex-direction:column;page-break-after:always}.voucher:last-child{page-break-after:auto}.top{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:10px;align-items:center;border-bottom:2px solid #333;padding:5px 0 9px}.brand{max-width:135px;font-weight:700}.title{text-align:center}.title h1{font-size:18px;margin:2px 0 7px;font-weight:800}.title .merchant{font-size:14px;text-decoration:underline;margin-bottom:4px;font-weight:700}.title .voucher-no{font-size:15px;font-weight:800}.barcode{text-align:center;font-family:monospace;font-weight:bold}.barcode svg{max-width:100%;height:34px}.barcode small{display:block;font-size:9px;margin-top:2px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;padding:9px 0;border-bottom:1.5px solid #555;font-size:10px}.meta div:last-child{text-align:right}.details{margin-top:10px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}th,td{border:1px solid #666;padding:5px 3px;text-align:center;vertical-align:middle;line-height:1.25;overflow-wrap:anywhere}th{font-weight:800;background:#f1f1f1;font-size:8px}.totals{width:52%;margin:12px 0 0 auto;font-size:11px}.totals .line{display:flex;justify-content:space-between;padding:5px 3px}.totals .grand{border-top:1.5px solid #333;border-bottom:1.5px solid #333;margin-top:5px;padding:9px 3px;font-size:15px;font-weight:800}.notice{margin-top:12px;padding:8px 0;border-top:1.5px solid #555;text-align:right;font-size:9px;font-weight:800}.sign{margin:12px 0 0 auto;width:52%;display:flex;justify-content:space-between;gap:8px;font-size:10px}.footer{margin-top:auto;border-top:1.5px solid #555;padding-top:6px;display:flex;justify-content:space-between;font-size:8px}.footer .site{text-align:center;flex:1}.page-break{page-break-after:always}@media print{html{background:#fff}body{margin:0;padding:0}.voucher{min-height:275mm}}</style></head><body>${companyPrintBrandHeader()}${pages}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();
}

function code39BarcodeSVG(value){
  const map={
    '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
    'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
    'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
    'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw'
  };
  const text=String(value||'').toUpperCase().replace(/[^0-9A-Z-]/g,''); const chars=`*${text}*`; let x=4; const h=52,wide=3,narrow=1,gap=1; let bars='';
  for(const ch of chars){const pat=map[ch]||map['-'];for(let i=0;i<pat.length;i++){const w=pat[i]==='w'?wide:narrow;if(i%2===0)bars+=`<rect x="${x}" y="4" width="${w}" height="${h}"/>`;x+=w+gap;}x+=gap;}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(180,x+4)}" height="72" viewBox="0 0 ${Math.max(180,x+4)} 72" aria-label="${esc(text)}"><rect width="100%" height="100%" fill="white"/>${bars}<text x="50%" y="68" text-anchor="middle" font-family="Arial" font-size="9">${esc(text)}</text></svg>`;
}
function printShipperSettlement(r){
  const items=r.items||[]; const creatorNames=[...new Set(items.map(i=>String(i.created_by_name||'').trim()).filter(Boolean))]; const currentEmployeeName=String(CURRENT_USER?.name||CURRENT_USER?.username||CURRENT_USER?.email||'').trim(); const printedBy=creatorNames.length===1?creatorNames[0]:(creatorNames.length>1?creatorNames.join(', '):(String(r.generated_by_name||r.created_by_name||'').trim()||currentEmployeeName||'—')); const barcode=String(r.transaction_number||'').replace(/[^A-Za-z0-9-]/g,''); const barcodeSvg=code39BarcodeSVG(barcode);
  const w=window.__merchantStatementPrintTarget||window.open('','_blank','width=1000,height=850');window.__merchantStatementPrintTarget=null;if(!w)return;
  const vatRate=r.merchant?.tax_enabled===true?Math.max(0,Math.min(100,Number(r.merchant?.tax_rate||0)))/100:0;
  const itemVat=i=>{if(String(i.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='cancelled by shipper')return 0;const saved=Number(i.tax_amount);return i.tax_amount!==undefined&&i.tax_amount!==null&&Number.isFinite(saved)&&saved>=0?Number(saved.toFixed(2)):Number((Number(i.service_charges||0)*vatRate).toFixed(2));};
  const totalCod=items.reduce((n,i)=>n+Number(i.cod||0),0);
  const totalFees=items.reduce((n,i)=>n+Number(i.service_charges||0),0);
  const totalVat=Number(items.reduce((n,i)=>n+itemVat(i),0).toFixed(2));
  const totalNet=Number(items.reduce((n,i)=>n+Number(i.merchant_net||0),0).toFixed(2));
  const printedAt=new Date().toLocaleDateString('en-GB');
  w.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${esc(r.transaction_number||'Shipper Payment Voucher')}</title><style>
  @page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}html{background:#e9edf3}body{font-family:Arial,Helvetica,sans-serif;padding:9mm;color:#111;font-size:10px;width:210mm;min-height:297mm;margin:18px auto;background:#fff;box-shadow:0 3px 18px #0002}.voucher{min-height:275mm;display:flex;flex-direction:column}.top{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:10px;align-items:center;border-bottom:2px solid #333;padding:5px 0 9px}.brand{max-width:135px;font-weight:700}.brand img{max-width:110px;max-height:48px;object-fit:contain}.title{text-align:center}.title h1{font-size:18px;margin:2px 0 7px;font-weight:800}.title .merchant{font-size:14px;text-decoration:underline;margin-bottom:4px;font-weight:700}.title .voucher-no{font-size:15px;font-weight:800}.barcode{text-align:center;font-family:monospace;font-weight:bold}.barcode svg{max-width:100%;height:34px}.barcode small{display:block;font-size:9px;margin-top:2px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;padding:9px 0;border-bottom:1.5px solid #555;font-size:10px}.meta div:last-child{text-align:right}.meta b{font-weight:800}.details{margin-top:10px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}th,td{border:1px solid #666;padding:5px 3px;text-align:center;vertical-align:middle;line-height:1.25;overflow-wrap:anywhere}th{font-weight:800;background:#f1f1f1;font-size:8px}.totals{width:52%;margin:12px 0 0 auto;font-size:11px}.totals .line{display:flex;justify-content:space-between;padding:5px 3px}.totals .grand{border-top:1.5px solid #333;border-bottom:1.5px solid #333;margin-top:5px;padding:9px 3px;font-size:15px;font-weight:800}.notice{margin-top:12px;padding:8px 0;border-top:1.5px solid #555;text-align:right;font-size:9px;font-weight:800}.sign{margin:12px 0 0 auto;width:52%;display:flex;justify-content:space-between;gap:8px;font-size:10px}.footer{margin-top:auto;border-top:1.5px solid #555;padding-top:6px;display:flex;justify-content:space-between;font-size:8px}.footer .site{text-align:center;flex:1}@media screen{body{width:min(210mm,calc(100vw - 24px));min-height:297mm;padding:clamp(10px,3vw,9mm)}}@media print{html{background:#fff}body{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.voucher{min-height:275mm}button{display:none}}
  </style></head><body><main class="voucher">${companyPrintBrandHeader()}<header class="top"><div class="brand"><strong>${esc(window.__companyName||'DELIVERY SERVICES')}</strong></div><div class="title"><h1>Shipper Payment Voucher</h1><div class="merchant">${esc(r.merchant?.name||'')}</div><div class="voucher-no">${esc(r.transaction_number||'')}</div></div><div class="barcode">${barcodeSvg}<small>${esc(barcode)}</small></div></header>
  <section class="meta"><div><b>Shipper Account:</b> ${esc(r.merchant?.merchant_no||r.merchant?.code||r.merchant?.id||'—')}</div><div><b>Dated:</b> ${esc(r.settlement_date||'')}</div><div><b>Shipper Address:</b> ${esc(r.merchant?.address||'—')}</div><div><b>Printed By:</b> ${esc(printedBy)}</div></section>
  <section class="details"><table><thead><tr><th style="width:3.5%">Sr</th><th style="width:13%">Tracking / Shipment / Order No</th><th>Receiver / Mobile No</th><th>Area</th><th>Delivery Date</th><th>COD</th><th>Service Charges</th><th>Tax</th><th>Amount Remaining</th><th>Status</th><th>Order Created By</th><th>Remarks</th></tr></thead><tbody>${items.map((i,index)=>{const fee=Number(i.service_charges||0),vat=itemVat(i);return `<tr><td style="width:3.5%">${index+1}</td><td style="width:13%;font-size:7px"><small>Track:</small> ${esc(i.tracking_number||i.tracking_no||'—')}<br><small>Ship:</small> ${esc(i.shipment_no||i.shipment_number||(i.shipment&&i.shipment.shipment_no)||(i.shipment&&i.shipment.shipment_number)||'—')}<br><small>Order:</small> ${esc(i.merchant_order_no||i.order_no||i.order_id||(i.order&&i.order.merchant_order_no)||(i.order&&i.order.order_code)||'—')}</td><td>${esc(i.receiver_name||i.customer_name||'—')}<br>${esc([i.receiver_phone||i.customer_phone||'',i.customer_phone_2||''].filter(Boolean).join(' / '))}</td><td>${esc(i.area||i.region||i.area_name||'—')}</td><td>${esc(i.delivery_date||r.settlement_date||'—')}</td><td>${Number(i.cod||0).toFixed(2)}</td><td>${fee.toFixed(2)}</td><td>${vat.toFixed(2)}</td><td>${Number(i.merchant_net||0).toFixed(2)}</td><td>${esc(i.status||'Delivered')}</td><td>${esc(i.created_by_name||'—')}</td><td>${esc(i.remarks||i.notes||'')}</td></tr>`}).join('')}</tbody></table></section>
  <section class="totals"><div class="line"><span>COD Total:</span><b>${totalCod.toFixed(2)} AED</b></div><div class="line"><span>Total Shipments:</span><b>${items.length}</b></div><div class="line"><span>Service Charges:</span><b>${totalFees.toFixed(2)} AED</b></div><div class="line"><span>VAT on Service Charges:</span><b>${totalVat.toFixed(2)} AED</b></div><div class="line grand"><span>Grand Total:</span><span>${totalNet.toFixed(2)} AED</span></div></section>
  <div class="notice">The company is not responsible for amounts not settled after 7 days from the delivery date.</div><div class="sign"><span>Client Sig&nbsp;&nbsp; ........................</span></div><footer class="footer"><span>Address</span><span class="site">Website: ${esc(window.__companyWebsite||'')}</span><span>Printed: ${printedAt}<br>Page 1 / 1</span></footer></main><script>window.print();</script></body></html>`);w.document.close();}

async function trendExcelWorkbook(){
  if(!window.ExcelJS)throw new Error('مكتبة Excel الاحترافية لم تعمل. حدّث الصفحة وحاول مرة أخرى.');
  const wb=new ExcelJS.Workbook();wb.creator=COMPANY_BRANDING.name||'Delivery';wb.created=new Date();wb.modified=new Date();wb.properties.date1904=false;return wb;
}
function trendExcelDownload(buffer,filename){const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function trendExcelAddLogo(wb,ws){
  try{let url=String(COMPANY_BRANDING.logo_url||'/trend-logo.jpeg');let res=await fetch(url);if(!res.ok)throw new Error('logo');let type=(res.headers.get('content-type')||'').toLowerCase();let ext=type.includes('png')?'png':type.includes('jpeg')||type.includes('jpg')?'jpeg':'';if(!ext){res=await fetch('/trend-logo.jpeg');if(!res.ok)return;ext='jpeg';}
    const buffer=await res.arrayBuffer();const imageId=wb.addImage({buffer:new Uint8Array(buffer),extension:ext});ws.addImage(imageId,{tl:{col:0,row:0},br:{col:1.15,row:1.9}});
  }catch(_){/* workbook remains usable if a custom logo cannot be fetched */}
}
async function trendExcelAddBarcode(wb,ws,value,range){
  try{const svg=code39BarcodeSVG(String(value||'').replace(/[^A-Za-z0-9-]/g,''));if(!svg)return;const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.max(240,img.naturalWidth||240);canvas.height=Math.max(70,img.naturalHeight||70);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const base64=canvas.toDataURL('image/png').split(',')[1];const imageId=wb.addImage({base64,extension:'png'});ws.addImage(imageId,range);}finally{URL.revokeObjectURL(url);}}catch(_){/* barcode text remains visible if image rendering is unavailable */}
}
function trendExcelUniqueSheetName(wb,desired){let base=String(desired||'Sheet').replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31)||'Sheet',name=base,n=2;while(wb.getWorksheet(name)){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}return name;}
function trendExcelStyleHeader(ws,row,startCol,endCol){for(let c=startCol;c<=endCol;c++){const cell=ws.getRow(row).getCell(c);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};cell.font={name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={top:{style:'thin',color:{argb:'FF9EADBD'}},left:{style:'thin',color:{argb:'FF9EADBD'}},bottom:{style:'thin',color:{argb:'FF9EADBD'}},right:{style:'thin',color:{argb:'FF9EADBD'}}};}ws.getRow(row).height=30;}
function trendExcelStyleBody(ws,startRow,endRow,startCol,endCol){for(let r=startRow;r<=endRow;r++){ws.getRow(r).height=22;for(let c=startCol;c<=endCol;c++){const cell=ws.getRow(r).getCell(c);cell.font={name:'Arial',size:10,color:{argb:'FF172033'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={top:{style:'thin',color:{argb:'FFD5DCE5'}},left:{style:'thin',color:{argb:'FFD5DCE5'}},bottom:{style:'thin',color:{argb:'FFD5DCE5'}},right:{style:'thin',color:{argb:'FFD5DCE5'}}};if((r-startRow)%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6FA'}};if(typeof cell.value==='number')cell.numFmt='#,##0.00;[Red]-#,##0.00;–';}}
}
async function trendExcelAddVoucherSheet(wb,r,sheetName){
  const ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,sheetName||r.transaction_number||'Settlement'));
  ws.views=[{state:'frozen',ySplit:6}];ws.pageSetup={paperSize:ws.PaperSize?ws.PaperSize.A4:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:0.2,right:0.2,top:0.3,bottom:0.3,header:0.1,footer:0.1}};
  ws.columns=[{width:6},{width:22},{width:25},{width:19},{width:15},{width:12},{width:15},{width:17},{width:20},{width:24}];
  ws.mergeCells('C1:H1');ws.getCell('C1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('C1').font={name:'Arial',size:16,bold:true,color:{argb:'FF17365D'}};ws.getCell('C1').alignment={horizontal:'center',vertical:'middle'};
  ws.mergeCells('C2:H2');ws.getCell('C2').value='SHIPPER PAYMENT VOUCHER';ws.getCell('C2').font={name:'Arial',size:13,bold:true,color:{argb:'FF17365D'}};ws.getCell('C2').alignment={horizontal:'center',vertical:'middle'};
  ws.mergeCells('C3:H3');ws.getCell('C3').value=`Shipper: ${r.merchant?.name||''}   |   Transaction No.: ${r.transaction_number||''}`;
  for(const a of ['C3']){ws.getCell(a).font={name:'Arial',size:11,bold:true};ws.getCell(a).alignment={vertical:'middle',horizontal:'center',wrapText:true};}
  ws.mergeCells('A4:E4');ws.getCell('A4').value=`Shipper Account: ${r.merchant?.merchant_no||r.merchant?.code||r.merchant?.id||'—'}   |   Address: ${r.merchant?.address||'—'}`;
  ws.mergeCells('F4:J4');ws.getCell('F4').value=`Dated: ${r.settlement_date||''}   |   Printed: ${new Date().toLocaleDateString('en-GB')}`;
  for(const a of ['A4','F4']){ws.getCell(a).font={name:'Arial',size:9};ws.getCell(a).alignment={vertical:'middle',horizontal:'center',wrapText:true};}
  ws.getRow(1).height=25;ws.getRow(2).height=23;ws.getRow(3).height=24;ws.getRow(4).height=28;ws.getRow(5).height=6;
  const headers=['Sr','Track No / Order No','Receiver / Mobile No','Area','Delivery Date','COD','Service Charges','Amount Remaining','Status','Remarks'];ws.addRow(headers);trendExcelStyleHeader(ws,6,1,10);
  const items=r.items||[],vatRate=Math.max(0,Math.min(100,Number(r.merchant?.tax_rate||0)))/100;
  const itemVat=i=>{if(String(i.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='cancelled by shipper')return 0;const saved=Number(i.tax_amount);return i.tax_amount!==undefined&&i.tax_amount!==null&&Number.isFinite(saved)&&saved>=0?Number(saved.toFixed(2)):Number((Number(i.service_charges||0)*vatRate).toFixed(2));};
  items.forEach((i,index)=>ws.addRow([index+1,[i.tracking_number||'—',i.merchant_order_no||i.shipment_no||'—'].join('\n'),[i.receiver_name||i.customer_name||'—',[i.receiver_phone||i.customer_phone||'',i.customer_phone_2||''].filter(Boolean).join(' / ')].join('\n'),i.area||i.region||i.area_name||'—',i.delivery_date||r.settlement_date||'—',Number(i.cod||0),Number(i.service_charges||0),Number((Number(i.merchant_net||0)-itemVat(i)).toFixed(2)),i.status||'Delivered',i.remarks||i.notes||'']));
  if(items.length)trendExcelStyleBody(ws,7,6+items.length,1,10);let row=7+items.length;const totalCod=items.reduce((n,i)=>n+Number(i.cod||0),0),totalFees=items.reduce((n,i)=>n+Number(i.service_charges||0),0),totalVat=Number(items.reduce((n,i)=>n+itemVat(i),0).toFixed(2)),totalNet=Number(items.reduce((n,i)=>n+Number(i.merchant_net||0),0).toFixed(2));
  const totals=[['COD Total',totalCod],['Total Shipments',items.length],['Service Charges',totalFees],['VAT on Service Charges',totalVat],['GRAND TOTAL',totalNet]];
  for(const [label,value] of totals){ws.mergeCells(row,7,row,9);ws.getCell(row,7).value=label;ws.getCell(row,10).value=value;for(let c=7;c<=10;c++){const cell=ws.getRow(row).getCell(c);cell.font={name:'Arial',size:10,bold:true,color:{argb:label==='GRAND TOTAL'?'FFFFFFFF':'FF172033'}};cell.alignment={horizontal:'center',vertical:'middle'};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:label==='GRAND TOTAL'?'FF17365D':'FFE8EEF5'}};cell.border={top:{style:'thin',color:{argb:'FF9EADBD'}},bottom:{style:'thin',color:{argb:'FF9EADBD'}},left:{style:'thin',color:{argb:'FF9EADBD'}},right:{style:'thin',color:{argb:'FF9EADBD'}}};}ws.getRow(row).height=22;if(typeof value==='number')ws.getCell(row,10).numFmt='#,##0.00;[Red]-#,##0.00;–';row++;}
  ws.mergeCells(row+1,1,row+1,5);ws.getCell(row+1,1).value='Client Signature: __________________________';ws.mergeCells(row+1,6,row+1,10);ws.getCell(row+1,6).value='Company / Employee Signature: __________________________';for(let c=1;c<=10;c++){ws.getRow(row+1).getCell(c).font={name:'Arial',size:10,bold:true};ws.getRow(row+1).getCell(c).alignment={vertical:'middle',horizontal:'center'};}ws.getRow(row+1).height=30;
  await trendExcelAddLogo(wb,ws);await trendExcelAddBarcode(wb,ws,r.transaction_number,'I1:J3');return ws;
}
async function exportShipperSettlementExcel(r){try{const wb=await trendExcelWorkbook();await trendExcelAddVoucherSheet(wb,r,r.transaction_number||'Settlement');const buffer=await wb.xlsx.writeBuffer();trendExcelDownload(buffer,`shipper-settlement-${String(r.transaction_number||Date.now()).replace(/[^\w-]/g,'-')}.xlsx`);}catch(e){alert(e.message||'تعذر إنشاء ملف Excel');}}
async function exportSelectedSettlementArchive(){
  const checks=[...document.querySelectorAll('.settlement-archive-check:checked')],rows=(window.__settlementArchiveRows||[]).filter(r=>checks.some(c=>String(c.dataset.recordId||c.value)===String(r.id)));if(!rows.length)return alert(L('Select settlement records first','اختر سجلات التسوية أولاً'));
  try{const wb=await trendExcelWorkbook();for(let n=0;n<rows.length;n++){const r=rows[n];const ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,`${r.merchant?.name||'Shipper'} ${r.settlement_date||''} ${r.transaction_number||n+1}`));ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.2,right:.2,top:.3,bottom:.3,header:.1,footer:.1}};ws.columns=[{width:16},{width:22},{width:20},{width:22},{width:20},{width:16},{width:10},{width:10}];ws.mergeCells('C1:F1');ws.getCell('C1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('C1').font={name:'Arial',size:16,bold:true,color:{argb:'FF17365D'}};ws.getCell('C1').alignment={horizontal:'center',vertical:'middle'};ws.mergeCells('C2:F2');ws.getCell('C2').value='INVOICE REPORT / SHIPPER SETTLEMENT';ws.getCell('C2').font={name:'Arial',size:13,bold:true};ws.getCell('C2').alignment={horizontal:'center'};ws.mergeCells('A3:C3');ws.getCell('A3').value=`Shipper: ${r.merchant?.name||''}`;ws.mergeCells('D3:F3');ws.getCell('D3').value=`Transaction No.: ${r.transaction_number||''}`;ws.mergeCells('A4:C4');ws.getCell('A4').value=`Date: ${r.settlement_date||''}`;ws.mergeCells('D4:F4');ws.getCell('D4').value=`Status: ${r.status||''}`;for(const a of ['A3','D3','A4','D4']){ws.getCell(a).font={name:'Arial',size:11,bold:true};ws.getCell(a).alignment={horizontal:'center',vertical:'middle'};}ws.getRow(1).height=26;ws.getRow(2).height=24;ws.getRow(3).height=22;ws.getRow(4).height=22;ws.addRow(['Tracking','Shipment','Order','COD','Service Charges','Shipper Net']);trendExcelStyleHeader(ws,5,1,6);(r.items||[]).forEach(i=>ws.addRow([i.tracking_number||'',i.shipment_no||'',i.merchant_order_no||i.order_id||'',Number(i.cod||0),Number(i.service_charges||0),Number(i.merchant_net||0)]));if(r.items?.length)trendExcelStyleBody(ws,6,5+r.items.length,1,6);const end=6+(r.items||[]).length;ws.addRow([]);const tr=ws.lastRow.number;ws.mergeCells(tr,1,tr,2);ws.getCell(tr,1).value='Total Orders';ws.getCell(tr,3).value=Number(r.order_count||r.items?.length||0);ws.mergeCells(tr,4,tr,5);ws.getCell(tr,4).value='Collection Total';ws.getCell(tr,6).value=Number(r.collection_amount||0);for(let c=1;c<=6;c++){const cell=ws.getRow(tr).getCell(c);cell.font={name:'Arial',size:10,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8EEF5'}};cell.alignment={horizontal:'center',vertical:'middle'};cell.border={top:{style:'thin',color:{argb:'FF9EADBD'}},bottom:{style:'thin',color:{argb:'FF9EADBD'}},left:{style:'thin',color:{argb:'FF9EADBD'}},right:{style:'thin',color:{argb:'FF9EADBD'}}};}ws.getCell(tr,6).numFmt='#,##0.00';await trendExcelAddLogo(wb,ws);await trendExcelAddBarcode(wb,ws,r.transaction_number,'G1:H3');}
    const buffer=await wb.xlsx.writeBuffer();trendExcelDownload(buffer,`invoice-report-settlements-${today()}.xlsx`);
  }catch(e){alert(e.message||'تعذر إنشاء ملف Excel');}
}
async function exportSelectedSettlementOrders(){
  const checks=[...document.querySelectorAll('.settlement-archive-order-check:checked')];if(!checks.length)return alert('حدد أوردرًا واحدًا على الأقل لتصدير Excel');const chosen=new Set(checks.map(x=>String(x.value))),items=[];for(const r of(window.__settlementArchiveRows||[]))for(const i of(r.items||[]))if(chosen.has(String(i.id)))items.push({r,i});if(!items.length)return alert('لم يتم العثور على تفاصيل الأوردرات المحددة');
  try{const wb=await trendExcelWorkbook(),ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,'Selected Orders'));ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.2,right:.2,top:.3,bottom:.3}};ws.columns=[{width:15},{width:23},{width:20},{width:20},{width:22},{width:15},{width:18},{width:18}];ws.mergeCells('C1:H1');ws.getCell('C1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('C1').font={name:'Arial',size:16,bold:true,color:{argb:'FF17365D'}};ws.getCell('C1').alignment={horizontal:'center'};ws.mergeCells('C2:H2');ws.getCell('C2').value='SELECTED ORDERS — INVOICE REPORT';ws.getCell('C2').font={name:'Arial',size:13,bold:true};ws.getCell('C2').alignment={horizontal:'center'};ws.addRow(['Date','Shipper','Transaction No.','Tracking','Order No.','COD','Service Charges','Shipper Net']);trendExcelStyleHeader(ws,3,1,8);items.forEach(({r,i})=>ws.addRow([r.settlement_date||'',r.merchant?.name||'',r.transaction_number||'',i.tracking_number||i.shipment_no||'',i.merchant_order_no||i.order_id||'',Number(i.cod||0),Number(i.service_charges||0),Number(i.merchant_net||0)]));trendExcelStyleBody(ws,4,3+items.length,1,8);await trendExcelAddLogo(wb,ws);trendExcelDownload(await wb.xlsx.writeBuffer(),`invoice-report-selected-orders-${today()}.xlsx`);}catch(e){alert(e.message||'تعذر إنشاء ملف Excel');}
}

async function companyExpensesPage(c){
  c.innerHTML=`<section class="pnl-page company-expenses-page"><div class="pnl-heading"><div><h2>${L("Company Expenses","مصاريف الشركة")}</h2></div><div class="pnl-actions"><button class="ghost" type="button" onclick="printCompanyExpenses()">⎙ ${L("Print / PDF","طباعة / PDF")}</button></div></div>
  <div class="panel" style="padding:14px 16px;margin-bottom:12px"><div style="margin-bottom:10px"><label style="display:block;font-weight:700;margin-bottom:5px">${L("Search expenses","البحث في المصروفات")}<input id="coExpSearch" type="search" placeholder="${esc(L("Search by category, details or amount","ابحث بالتصنيف أو التفاصيل أو المبلغ"))}" style="width:100%;min-height:42px"></label></div>
  <div style="display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;align-items:end" class="company-expense-filters"><label>${L("From","من")}<input id="coExpFrom" type="date" value="${today()}" style="width:100%"></label><label>${L("To","إلى")}<input id="coExpTo" type="date" value="${today()}" style="width:100%"></label><label>${L("Category","التصنيف")}<select id="coExpCategory" style="width:100%"><option value="all">${L("Company and driver expenses","مصاريف الشركة والمناديب")}</option><option value="expense">${L("Company expense","مصروف شركة")}</option><option value="driver_expense">${L("Driver expenses","مصروفات المناديب")}</option></select></label><button type="button" onclick="loadCompanyExpenses()">${L("Apply filters","تطبيق الفلاتر")}</button></div></div>
  <div class="panel" style="padding:14px 16px;margin-bottom:12px"><div class="section-title-row"><h3 style="margin:0">${L("Add Company Expense","إضافة مصروف شركة")}</h3></div><div style="display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;align-items:end" class="company-expense-entry"><label>${L("Category","التصنيف")}<select id="coExpNewCategory" style="width:100%"><option value="expense">${L("Company expense","مصروف شركة")}</option></select></label><label>${L("Amount","المبلغ")}<input id="coExpAmount" type="number" min="0.01" step="0.01" style="width:100%"></label><label>${L("Date","التاريخ")}<input id="coExpDate" type="date" value="${today()}" style="width:100%"></label><label>${L("Details","التفاصيل")}<input id="coExpDetails" style="width:100%" placeholder="${esc(L("Expense details","تفاصيل المصروف"))}"></label></div><div style="margin-top:10px;display:flex;justify-content:flex-end"><button type="button" onclick="saveCompanyExpense()">${L("Save Expense","حفظ المصروف")}</button></div><div id="coExpMsg" class="msg"></div></div>
  <div class="pnl-kpis" id="coExpKpis"></div><div class="panel pnl-transactions" id="coExpTable"></div></section>
  <style>@media(max-width:760px){.company-expense-filters,.company-expense-entry{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:440px){.company-expense-filters,.company-expense-entry{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  $('coExpSearch')?.addEventListener('input',()=>loadCompanyExpenses());['coExpFrom','coExpTo','coExpCategory'].forEach(id=>$(id)?.addEventListener('change',()=>loadCompanyExpenses()));await loadCompanyExpenses();
}
let COMPANY_EXPENSE_ROWS=[];
async function loadCompanyExpenses(){const box=$('coExpTable');if(!box)return;try{const from=$('coExpFrom')?.value||'',to=$('coExpTo')?.value||'';const qs=new URLSearchParams({from,to});const [companyData,driverData]=await Promise.all([api(`/api/accounting/company-financial?${qs.toString()}&type=adjustment`),api(`/api/accounting/driver-expenses?${new URLSearchParams({from,to}).toString()}`)]);const companyRows=(companyData.adjustments||[]).filter(x=>String(x.type||'').toLowerCase()==='expense').map(x=>({...x,source_kind:'company',expense_day:String(x.transaction_date||x.created_at||'').slice(0,10),display_details:x.description||x.reason||'—'}));const driverRows=(driverData.data||[]).map(x=>({...x,source_kind:'driver',expense_day:String(x.expense_date||x.created_at||'').slice(0,10),display_details:x.details||x.notes||x.expense_type||'—'}));let rows=[...companyRows,...driverRows];const kind=$('coExpCategory')?.value||'all';if(kind==='expense')rows=rows.filter(x=>x.source_kind==='company');else if(kind==='driver_expense')rows=rows.filter(x=>x.source_kind==='driver');const q=($('coExpSearch')?.value||'').trim().toLowerCase();if(q)rows=rows.filter(x=>[x.display_details,x.reason,x.reference,x.amount,x.type,x.driver_name,x.driver_no,x.expense_type,x.category].some(v=>String(v??'').toLowerCase().includes(q)));rows.sort((a,b)=>String(b.expense_day||'').localeCompare(String(a.expense_day||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));COMPANY_EXPENSE_ROWS=rows;const total=rows.reduce((sum,x)=>sum+Number(x.amount||0),0);const k=$('coExpKpis');if(k)k.innerHTML=`<div class="pnl-kpi cost"><span>${L('Expense records','عدد المصروفات')}</span><strong>${rows.length}</strong></div><div class="pnl-kpi cost"><span>${L('Total expenses','إجمالي المصروفات')}</span><strong>${money(total)}</strong></div><div class="pnl-kpi cost"><span>${L('Company expenses','مصروفات الشركة')}</span><strong>${money(rows.filter(x=>x.source_kind==='company').reduce((s,x)=>s+Number(x.amount||0),0))}</strong></div><div class="pnl-kpi cost"><span>${L('Driver expenses','مصروفات المناديب')}</span><strong>${money(rows.filter(x=>x.source_kind==='driver').reduce((s,x)=>s+Number(x.amount||0),0))}</strong></div>`;box.innerHTML=`<div class="section-title-row"><h3>${L('Company and driver expense records','سجلات مصروفات الشركة والمناديب')}</h3><span class="pnl-count">${rows.length} ${L('records','سجل')}</span></div><div class="table-wrap"><table class="pnl-table"><thead><tr><th>${L('Date','التاريخ')}</th><th>${L('Category','التصنيف')}</th><th>${L('Details','التفاصيل')}</th><th>${L('Amount','المبلغ')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(x.expense_day||'—')}</td><td>${x.source_kind==='driver'?esc(L('Driver expense','مصروف مندوب')+' — '+(x.driver_name||x.driver_no||'—')):L('Company expense','مصروف شركة')}</td><td>${esc(x.display_details||'—')}</td><td class="verify-negative pnl-amount">− ${money(x.amount||0)}</td><td><button type="button" class="mini-btn danger" onclick="${x.source_kind==='driver'?`deleteDriverExpensesPage('${esc(x.id)}')`:`deleteCompanyExpense('${esc(x.id)}')`}">${L('Delete','حذف')}</button></td></tr>`).join(''):`<tr><td colspan="5" class="muted">${L('No company or driver expenses found in this period.','لا توجد مصروفات للشركة أو المناديب في الفترة المحددة.')}</td></tr>`}</tbody></table></div>`;}catch(e){box.innerHTML=`<div class="msg error">${esc(e.message||'تعذر تحميل المصروفات')}</div>`;}}
async function saveCompanyExpense(){try{const amount=baseAmount($('coExpAmount')?.value||0);if(amount<=0)return msg('coExpMsg',L('Enter a valid amount','أدخل مبلغًا صحيحًا'),'error');const details=($('coExpDetails')?.value||'').trim();if(!details)return msg('coExpMsg',L('Enter expense details','اكتب تفاصيل المصروف'),'error');await api('/api/accounting/company-financial/adjustment',{method:'POST',body:JSON.stringify({type:'expense',amount,transaction_date:$('coExpDate')?.value||today(),description:details,reference:'COMPANY_EXPENSE'})});$('coExpAmount').value='';$('coExpDetails').value='';$('coExpDate').value=today();msg('coExpMsg',L('Company expense saved','تم حفظ مصروف الشركة'),'ok');await loadCompanyExpenses();}catch(e){msg('coExpMsg',e.message||L('Could not save expense','تعذر حفظ المصروف'),'error');}}
async function deleteCompanyExpense(id){if(!id||!await showConfirmModal(L('Delete this company expense?','هل تريد حذف مصروف الشركة؟')))return;try{await api('/api/accounting/company-financial/adjustment',{method:'DELETE',body:JSON.stringify({id})});await loadCompanyExpenses();}catch(e){alert(e.message||L('Could not delete expense','تعذر حذف المصروف'));}}
function printCompanyExpenses(){const box=$('coExpTable');if(!box)return;const w=window.open('','_blank','width=1000,height=800');if(!w)return;w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مصاريف الشركة</title><style>body{font-family:Tahoma,Arial;padding:20px;color:#172033}h1{margin-bottom:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd2dc;padding:8px;text-align:right}th{background:#17263c;color:white}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>مصاريف الشركة</h1>${box.innerHTML.replace(/<button[^>]*>[\s\S]*?<\/button>/gi,'')}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);w.document.close();}

async function companyFinancialPage(c){
  c.innerHTML=`<section class="pnl-page"><div class="pnl-heading"><div><h2>${L("Profit & Loss","الأرباح والخسائر")}</h2><p>${L("A clear view of company revenue, operating costs and net result.","نظرة واضحة على إيرادات الشركة وتكاليف التشغيل وصافي النتيجة.")}</p></div><div class="pnl-actions"><button class="ghost" onclick="printCompanyFinancial()">⎙ ${L("Print / PDF","طباعة / PDF")}</button><button onclick="exportCompanyFinancialExcel()">⇩ ${L("Excel","إكسل")}</button></div></div>
  <div class="panel pnl-filter"><div class="form-grid"><label>${L("From","من")}<input id="companyFinFrom" type="date" value="${today()}"></label><label>${L("To","إلى")}<input id="companyFinTo" type="date" value="${today()}"></label><label>${L("Transaction Type","نوع الحركة")}<select id="companyFinType"><option value="all">${L("All","الكل")}</option><option value="service_revenue">${L("Service Charges Revenue","إيرادات رسوم الخدمة")}</option><option value="driver_commission">${L("Driver Commissions","عمولات المندوبين")}</option><option value="company_expense">${L("Company Expenses","مصروفات الشركة")}</option><option value="adjustment">${L("Adjustments","التسويات")}</option></select></label><div class="pnl-search"><button onclick="loadCompanyFinancial()">${L("Apply filters","تطبيق الفلاتر")}</button></div></div></div>
  <div class="pnl-kpis" id="companyPnlKpis"></div><div class="pnl-charts panel"><div class="section-title-row"><h3>${L('Financial overview','نظرة مالية عامة')}</h3><span class="muted" id="companyPnlPeriod"></span></div><div id="companyAccountsOverview"></div></div>
  <div class="panel pnl-adjust"><div class="section-title-row"><h3>${L("Add Company Adjustment","إضافة تسوية للشركة")}</h3></div><div class="form-grid"><label>${L("Type","النوع")}<select id="companyAdjType"><option value="income">Income — إيراد إضافي</option><option value="expense">Expense — مصروف</option><option value="deduction">Deduction — خصم</option></select></label><label>${L("Amount","المبلغ")}<input id="companyAdjAmount" type="number" min="0" step="0.01"></label><label>${L("Date","التاريخ")}<input id="companyAdjDate" type="date" value="${today()}"></label><label>${L("Reference","المرجع")}<input id="companyAdjRef"></label><label class="pnl-description">${L("Description","الوصف")}<input id="companyAdjDesc"></label><div class="pnl-search"><button onclick="saveCompanyFinancialAdjustment()">${L("Save Transaction","حفظ الحركة")}</button></div></div><div id="companyFinMsg" class="msg"></div></div>
  <div class="panel pnl-transactions" id="companyFinancialBox"></div></section>`;
  await loadCompanyFinancial();
}
async function loadCompanyFinancial(){const box=$("companyFinancialBox");if(!box)return;try{const from=$("companyFinFrom")?.value||'',to=$("companyFinTo")?.value||'',type=$("companyFinType")?.value||'all';const d=await api(`/api/accounting/company-financial?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&type=${encodeURIComponent(type)}`);const x=d.data||{};const tx=d.transactions||[];window.__companyFinancialExport={from,to,data:x,transactions:tx};const cards=[[L('Service revenue','إيرادات رسوم الخدمة'),x.service_revenue,'revenue'],[L('Driver commissions paid','عمولات المندوبين'),x.driver_paid,'cost'],[L('Company expenses','مصروفات الشركة'),x.driver_expenses,'cost'],[L('Net profit / loss','صافي الربح / الخسارة'),x.company_net,Number(x.company_net||0)>=0?'profit':'loss']];const k=$("companyPnlKpis");if(k)k.innerHTML=cards.map(v=>`<div class="pnl-kpi ${v[2]}"><span>${v[0]}</span><strong>${money(v[1]||0)}</strong><small>${v[2]==='profit'?L('Net result','النتيجة الصافية'):v[2]==='loss'?L('Negative net result','صافي نتيجة سالبة'):v[2]==='cost'?L('Cash outflow','مصروف نقدي'):L('Recognized service fees','رسوم خدمة معتمدة')}</small></div>`).join('');const period=$("companyPnlPeriod");if(period)period.textContent=`${from||'—'} → ${to||'—'}`;const overview=$("companyAccountsOverview");if(overview){const vals=[[L('Service revenue','إيرادات الخدمة'),Number(x.service_revenue||0),'revenue'],[L('Driver commissions','عمولات المندوبين'),Number(x.driver_paid||0),'driver'],[L('Company expenses','مصروفات الشركة'),Number(x.driver_expenses||0),'expense'],[L('Other adjustments','تسويات أخرى'),Number(x.adjustment_net||0),'adjustment']];const max=Math.max(1,...vals.map(v=>Math.abs(v[1])));overview.innerHTML=`<div class="pnl-bars">${vals.map(v=>`<div class="pnl-bar-item"><div class="pnl-bar-number">${money(v[1])}</div><div class="pnl-bar-track"><div class="pnl-bar-fill ${v[2]}" style="height:${Math.max(3,Math.round(Math.abs(v[1])/max*100))}%"></div></div><b>${v[0]}</b></div>`).join('')}</div>`;}
box.innerHTML=`<div class="section-title-row"><div><h3>${L('Transaction details','تفاصيل الحركات المالية')}</h3><p class="muted">${L('COD and shipper settlement principal are excluded from company revenue.','مبالغ COD وأصل مستحقات التجار غير محسوبة كإيراد للشركة.')}</p></div><span class="pnl-count">${tx.length} ${L('records','حركة')}</span></div><div class="table-wrap"><table class="pnl-table"><thead><tr><th>${L('Date','التاريخ')}</th><th>${L('Type','النوع')}</th><th>${L('Description','الوصف')}</th><th>${L('Reference','المرجع')}</th><th>${L('Amount','المبلغ')}</th><th class="pnl-action-col">${L('Action','الإجراء')}</th></tr></thead><tbody>${tx.length?tx.map(t=>`<tr><td>${esc(String(t.date||'').slice(0,10))}</td><td><span class="pnl-type">${esc(t.type||'')}</span></td><td>${esc(t.description||'')}</td><td>${esc(t.reference||'')}</td><td class="${Number(t.amount)>=0?'verify-positive':'verify-negative'} pnl-amount">${Number(t.amount)>=0?'+':'−'} ${money(Math.abs(t.amount||0))}</td><td class="pnl-action-col">${t.type==='adjustment'?`<button class="mini-btn danger" onclick="deleteCompanyFinancialAdjustment('${esc(t.source_id||'')}')">${L('Delete','حذف')}</button>`:'—'}</td></tr>`).join(''):`<tr><td colspan="6" class="muted">${L('No financial transactions found.','لا توجد معاملات مالية.')}</td></tr>`}</tbody></table></div>`;
}catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}}
function printCompanyFinancial(){const d=window.__companyFinancialExport;if(!d)return msg('companyFinMsg',L('Search transactions first.','ابحث عن المعاملات أولاً.'),'error');const w=window.open('','_blank','width=1200,height=850');if(!w)return;const ar=LANG==='ar',title=L('Profit & Loss','الأرباح والخسائر'),x=d.data,tx=d.transactions,fmt=n=>money(Number(n||0));const kpis=[[L('Service revenue','إيرادات رسوم الخدمة'),x.service_revenue], [L('Driver commissions','عمولات المندوبين'),x.driver_paid],[L('Company expenses','مصروفات الشركة'),x.driver_expenses],[L('Net profit / loss','صافي الربح / الخسارة'),x.company_net]];const rows=tx.map(t=>`<tr><td>${esc(String(t.date||'').slice(0,10))}</td><td>${esc(t.type||'')}</td><td>${esc(t.description||'')}</td><td>${esc(t.reference||'')}</td><td class="${Number(t.amount)>=0?'pos':'neg'}">${Number(t.amount)>=0?'+':'−'} ${fmt(Math.abs(t.amount))}</td></tr>`).join('');w.document.write(`<!doctype html><html lang="${ar?'ar':'en'}" dir="${ar?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;color:#172033;font-family:Arial,Tahoma,sans-serif}body{padding:7mm;font-size:9pt}.brand{margin-bottom:3mm}h1{font-size:19pt;margin:0 0 2mm;color:#17365d}.sub{color:#5e6c80;font-size:9pt;margin-bottom:4mm}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:3mm 0 5mm}.kpi{border:1px solid #d8e0ea;border-top:3px solid #287bba;border-radius:3mm;padding:3mm;background:#f7f9fc}.kpi:nth-child(4){border-top-color:${Number(x.company_net||0)>=0?'#15956b':'#c53b4b'}}.kpi span{display:block;font-size:8pt;color:#536276}.kpi b{display:block;font-size:13pt;margin-top:2mm;overflow-wrap:anywhere}.section{font-size:12pt;margin:3mm 0 2mm;color:#17365d}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}thead{display:table-header-group}th{background:#17365d;color:#fff;font-weight:bold}th,td{border:1px solid #cbd5e1;padding:2.1mm 1.5mm;text-align:${ar?'right':'left'};overflow-wrap:anywhere;vertical-align:top}tbody tr:nth-child(even){background:#f3f6fa}th:nth-child(1){width:13%}th:nth-child(2){width:17%}th:nth-child(3){width:30%}th:nth-child(4){width:22%}th:nth-child(5){width:18%}.pos{color:#087f5b;font-weight:bold}.neg{color:#b42336;font-weight:bold}.note{font-size:8pt;color:#536276;margin-top:3mm}.footer{margin-top:4mm;border-top:1px solid #cbd5e1;padding-top:2mm;font-size:8pt;display:flex;justify-content:space-between}@page{size:A4 landscape;margin:5mm}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}table{break-inside:auto}.kpis{break-inside:avoid}}</style></head><body>${companyPrintBrandHeader()}<h1>${esc(title)}</h1><div class="sub">${esc(L('Period','الفترة'))}: ${esc(d.from||'—')} — ${esc(d.to||'—')} &nbsp; | &nbsp; ${esc(L('Generated from system financial records','تم الإنشاء من السجلات المالية بالنظام'))}</div><div class="kpis">${kpis.map(k=>`<div class="kpi"><span>${esc(k[0])}</span><b>${esc(fmt(k[1]))}</b></div>`).join('')}</div><h2 class="section">${esc(L('Transaction details','تفاصيل الحركات المالية'))}</h2><table><thead><tr><th>${esc(L('Date','التاريخ'))}</th><th>${esc(L('Type','النوع'))}</th><th>${esc(L('Description','الوصف'))}</th><th>${esc(L('Reference','المرجع'))}</th><th>${esc(L('Amount','المبلغ'))}</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${esc(L('No transactions','لا توجد حركات'))}</td></tr>`}</tbody></table><div class="note">${esc(L('COD and shipper settlement principal are not treated as company revenue. Printing is set to A4 landscape; fit to one page when the number of rows allows without making text unreadable.','مبالغ COD وأصل تسويات التجار ليست إيرادًا للشركة. الطباعة مضبوطة أفقيًا على A4، وقد تمتد التفاصيل لصفحة إضافية إذا كانت البيانات كثيرة حفاظًا على وضوح الخط.'))}</div><div class="footer"><span>Delivery</span><span>${esc(L('Page layout: A4 landscape','تخطيط الصفحة: A4 أفقي'))}</span></div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();}
async function exportCompanyFinancialExcel(){const d=window.__companyFinancialExport;if(!d)return msg('companyFinMsg',L('Search transactions first.','ابحث عن المعاملات أولاً.'),'error');try{const wb=await trendExcelWorkbook(),ws=wb.addWorksheet(trendExcelUniqueSheetName(wb,'Profit & Loss'));ws.views=[{state:'frozen',ySplit:6}];ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.2,right:.2,top:.3,bottom:.3,header:.1,footer:.1}};ws.columns=[{width:14},{width:22},{width:42},{width:26},{width:18}];ws.mergeCells('A1:E1');ws.getCell('A1').value=COMPANY_BRANDING.name||'Delivery';ws.getCell('A1').font={name:'Arial',size:17,bold:true,color:{argb:'FF17365D'}};ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'};ws.getRow(1).height=28;ws.mergeCells('A2:E2');ws.getCell('A2').value=LANG==='ar'?'الأرباح والخسائر':'PROFIT & LOSS';ws.getCell('A2').font={name:'Arial',size:14,bold:true,color:{argb:'FF17365D'}};ws.getCell('A2').alignment={horizontal:'center'};ws.mergeCells('A3:E3');ws.getCell('A3').value=`${LANG==='ar'?'الفترة':'Period'}: ${d.from||'—'} — ${d.to||'—'}`;ws.getCell('A3').alignment={horizontal:'center'};const x=d.data;ws.addRow([LANG==='ar'?'إيرادات رسوم الخدمة':'Service revenue',Number(x.service_revenue||0),LANG==='ar'?'عمولات المندوبين':'Driver commissions',Number(x.driver_paid||0),'']);ws.addRow([LANG==='ar'?'مصروفات الشركة':'Company expenses',Number(x.driver_expenses||0),LANG==='ar'?'صافي الربح / الخسارة':'Net profit / loss',Number(x.company_net||0),'']);ws.getRow(4).height=24;ws.getRow(5).height=24;for(let r=4;r<=5;r++)for(let c=1;c<=5;c++){const cell=ws.getRow(r).getCell(c);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:r===5?'FFEAF4EF':'FFF0F5FA'}};cell.font={name:'Arial',size:10,bold:c===1||c===3,color:{argb:'FF172033'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};}ws.addRow([]);ws.addRow([LANG==='ar'?'التاريخ':'Date',LANG==='ar'?'النوع':'Type',LANG==='ar'?'الوصف':'Description',LANG==='ar'?'المرجع':'Reference',LANG==='ar'?'المبلغ':'Amount']);const headerRow=7;trendExcelStyleHeader(ws,headerRow,1,5);d.transactions.forEach(t=>ws.addRow([String(t.date||'').slice(0,10),t.type||'',t.description||'',t.reference||'',Number(t.amount||0)]));trendExcelStyleBody(ws,8,7+d.transactions.length,1,5);ws.getColumn(5).numFmt='#,##0.00;[Red]-#,##0.00;–';ws.autoFilter={from:{row:7,column:1},to:{row:7+d.transactions.length,column:5}};ws.mergeCells(`A${8+d.transactions.length}:E${8+d.transactions.length}`);ws.getCell(`A${8+d.transactions.length}`).value=LANG==='ar'?'مبالغ COD وأصل مستحقات التجار غير محسوبة كإيراد للشركة.':'COD and shipper settlement principal are excluded from company revenue.';ws.getCell(`A${8+d.transactions.length}`).font={italic:true,size:9,color:{argb:'FF536276'}};ws.getCell(`A${8+d.transactions.length}`).alignment={wrapText:true};await trendExcelAddLogo(wb,ws);trendExcelDownload(await wb.xlsx.writeBuffer(),`profit-loss-${d.from||'from'}-${d.to||'to'}.xlsx`);}catch(e){msg('companyFinMsg',e.message||L('Excel export failed','فشل تصدير إكسل'),'error');}}

async function saveCompanyFinancialAdjustment(){try{const amount=baseAmount($("companyAdjAmount")?.value||0);if(amount<=0)return msg('companyFinMsg',L('Enter a valid amount','أدخل مبلغًا صحيحًا'),'error');await api('/api/accounting/company-financial/adjustment',{method:'POST',body:JSON.stringify({type:$("companyAdjType")?.value||'income',amount,transaction_date:$("companyAdjDate")?.value||today(),reference:$("companyAdjRef")?.value||'',description:$("companyAdjDesc")?.value||''})});msg('companyFinMsg',L('Transaction saved','تم حفظ الحركة'),'ok');await loadCompanyFinancial();}catch(e){msg('companyFinMsg',e.message,'error');}}
async function deleteCompanyFinancialAdjustment(id){if(!id||!await showConfirmModal(L('Delete this transaction?','هل تريد حذف هذه الحركة؟')))return;try{await api('/api/accounting/company-financial/adjustment',{method:'DELETE',body:JSON.stringify({id})});await loadCompanyFinancial();}catch(e){msg('companyFinMsg',e.message,'error');}}
function printCompanyFinancial(){const box=$("companyFinancialBox");if(!box)return;const w=window.open('','_blank','width=1200,height=850');if(!w)return;const title=L('Company Financial Statement','كشف حساب الشركة');w.document.write(`<!doctype html><html dir="${LANG==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:18px;color:#172033}h1{font-size:20px;margin:0 0 6px}h3{margin:12px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}th,td{border:1px solid #999;padding:6px;text-align:right}th{font-weight:700;background:#eee}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.stat{border:1px solid #aaa;padding:8px}.stat b{display:block;margin-top:4px;font-size:13px}.verify-negative{color:#b00020}.verify-positive{color:#087f23}.no-print{display:none!important}.sign{margin-top:35px;display:flex;justify-content:space-between}.sign span{width:40%;border-top:1px solid #333;padding-top:7px}@page{size:A4 landscape;margin:8mm}</style></head><body>${companyPrintBrandHeader()}<h1>${esc(title)}</h1>${box.innerHTML.replace(/<button[^>]*>[\s\S]*?<\/button>/gi,'').replace(/class="[^"]*no-print[^"]*"/gi,'') }<div class="sign"><span>${L('Employee Signature','توقيع الموظف')}: __________________</span><span>${L('Company Signature','توقيع الشركة')}: __________________</span></div><script>window.onload=()=>setTimeout(()=>window.print(),200);</script></body></html>`);w.document.close();}
function exportCompanyFinancialExcel(){const table=$("companyFinancialBox")?.querySelector('table');if(!table)return msg('companyFinMsg',L('Search transactions first.','ابحث عن المعاملات أولاً.'),'error');const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>td.innerText.trim()));const csv='\\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='company-financial-statement.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}

function accountingAccountsSelectedDate(){return $("accountingAccountsDate")?.value||today();}
async function reloadAccountingDate(){
  const date=accountingAccountsSelectedDate(),tz=new Date().getTimezoneOffset();
  const label=$("merchantAccountsDateLabel");if(label)label.textContent=date;
  try{
    const [summary,expenses,payroll,companyFinancial]=await Promise.all([
      api(`/api/accounting/summary?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}`),
      api(`/api/accounting/driver-expenses?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`).catch(()=>({data:[]})),
      api(`/api/payroll/period?month=${encodeURIComponent(date.slice(0,7))}`).catch(()=>({data:{items:[]}})),
      api(`/api/accounting/company-financial?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`).catch(()=>({data:{data:{driver_expenses:0}}}))
    ]);
    const x=summary.data||{},rows=expenses.data||[],payRows=payroll.data?.items||[],companyExpenseTotal=Number(companyFinancial.data?.driver_expenses||0);
    const counters=document.querySelectorAll('.accounting-top-counters .stat');
    const vals=[x.totalOrders||0,money(x.orderValue||0),money(x.deliveryFees||0),money(x.taxes||0),money(x.companyDue??(Number(x.deliveryFees||0)+Number(x.taxes||0)))];
    vals.forEach((v,i)=>{const b=counters[i]?.querySelector('b');if(b)b.textContent=String(v);});
    const cashCredit=document.querySelectorAll('#content .grid[style*="420px"] .stat b');if(cashCredit[0])cashCredit[0].textContent=String(x.cashOrders||0);if(cashCredit[1])cashCredit[1].textContent=String(x.creditOrders||0);
    const payrollTotal=payRows.reduce((n,r)=>n+Number(r.base_salary||0)+Number(r.additions||0)-Number(r.deductions||0),0);
    const payrollB=counters[5]?.querySelector('b');if(payrollB)payrollB.textContent=money(payrollTotal);
    const expenseRows=rows.filter(r=>String(r.category||'expense').toLowerCase()!=='shortage'),shortageRows=rows.filter(r=>String(r.category||'').toLowerCase()==='shortage');
    const shortageTotal=shortageRows.reduce((n,r)=>n+Number(r.amount||0),0),expenseTotal=Math.max(0,companyExpenseTotal-shortageTotal);
    window.__accountingExpenseTotals={expenseTotal,shortageTotal,expenseCount:expenseRows.length,shortageCount:shortageRows.length};
    setAccountingExpenseMode(document.querySelector('.accounting-expense-toggle button.active')?.dataset.expenseMode||'expense');
    await Promise.all([loadMerchantAccounts(),loadAccountingShipperBalanceOverview()]);
  }catch(e){alert(e.message||L('Could not load accounting for selected date.','تعذر تحميل الحسابات للتاريخ المحدد.'));}
}
function resetAccountingAccountsDate(){const input=$("accountingAccountsDate");if(input)input.value=today();reloadAccountingDate();}
async function loadMerchantAccounts(){
  const box=$("merchantAccountsBox"); if(!box)return;
  try{
    const date=accountingAccountsSelectedDate();const label=$("merchantAccountsDateLabel");if(label)label.textContent=date;
    const d=await api(`/api/accounting/merchant-accounts?date=${encodeURIComponent(date)}`); const rows=d.data||[];
    box.innerHTML=rows.length?`<div class="table-wrap"><table class="merchant-accounts-table"><thead><tr><th>${L("Shipper","التاجر")}</th><th>${L("Paid Orders","أوردرات Paid")}</th><th>${L("Paid Order Value","قيمة الأوردرات Paid")}</th><th>${L("Delivery Fees","رسوم التوصيل")}</th><th>${L("Taxes","الضرائب")}</th><th>${L("Shipper Net","صافي التاجر")}</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name||"")}</b><small class="muted"><br>${esc(r.merchant_no||r.code||"")}</small></td><td>${r.orders||0}</td><td>${money(r.order_value||0)}</td><td>${money(r.delivery_fees||0)}</td><td>${money(r.taxes||0)}</td><td><b>${money(r.merchant_net||0)}</b></td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">${L("No merchant accounts found.","لا توجد حسابات تجار.")}</p>`;
  }catch(e){box.innerHTML=`<span class="error">${esc(e.message)}</span>`;}
}

async function loadMerchantFinancial(){
  const box=$("merchantFinancialBox"); if(!box)return;
  try{
    const merchantId=$("merchantFinancialSelect")?.value||"", balance=$("merchantBalanceFilter")?.value||"all";
    const from=$("merchantFinFrom")?.value||daysAgo(7), to=$("merchantFinTo")?.value||today();
    if(from>to)throw new Error(L('From date cannot be after To date','تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'));
    // Load the full set once; the balance selector below filters only the lower financial table.
    const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(merchantId)}&balance=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const rows=d.data||[];
    const tableRows=rows.filter(r=>balance==='positive'?Number(r.balance)>0:balance==='negative'?Number(r.balance)<0:balance==='zero'?Math.abs(Number(r.balance||0))<=0.009:true);
    renderDailyShipperSummary(rows);
    // Only merchants with a non-zero payable/receivable balance appear in settlement generation.
    const eligible=new Set(rows.filter(r=>Math.abs(Number(r.balance||0))>0.009).map(r=>String(r.merchant_id)));
    const picker=$('merchantFinancialSelect');
    if(picker&&!merchantId){[...picker.options].forEach((opt,i)=>{if(i>0)opt.hidden=!eligible.has(String(opt.value));});}
    document.querySelectorAll('.merchantSettlementShipperCheck').forEach(ch=>{const label=ch.closest('label');if(label)label.hidden=!eligible.has(String(ch.value));if(!eligible.has(String(ch.value)))ch.checked=false;});
    const selectAll=$('merchantSettlementSelectAll');if(selectAll)selectAll.checked=false;
    const companyOwes=rows.filter(r=>Number(r.balance)>0).reduce((s,r)=>s+Number(r.balance||0),0), merchantOwes=rows.filter(r=>Number(r.balance)<0).reduce((s,r)=>s+Math.abs(Number(r.balance||0)),0), net=companyOwes-merchantOwes;
    const kpis=$('merchantFinancialKpis');if(kpis)kpis.innerHTML=`<div class="shipper-fin-kpi blue"><span>▣ ${L("Total Shippers","إجمالي التجار")}</span><b>${rows.length}</b><small>${L("In selected period","في الفترة المحددة")}</small></div><div class="shipper-fin-kpi green"><span>↗ ${L("Company owes shippers","مستحق للتجار")}</span><b>${money(companyOwes)}</b><small>${L("Positive shipper balance","رصيد موجب للتاجر")}</small></div><div class="shipper-fin-kpi orange"><span>↙ ${L("Shippers owe company","مستحق للشركة")}</span><b>${money(merchantOwes)}</b><small>${L("Negative shipper balance","رصيد سالب للتاجر")}</small></div><div class="shipper-fin-kpi purple"><span>∑ ${L("Net balance","صافي الرصيد")}</span><b>${net<0?'− ':''}${money(Math.abs(net))}</b><small>${L("Company payable less receivable","المستحق للتجار ناقص المستحق للشركة")}</small></div>`;
    const chart=$('merchantFinancialChart');if(chart){const top=[...rows].sort((a,b)=>Math.abs(Number(b.balance||0))-Math.abs(Number(a.balance||0))).slice(0,6),max=Math.max(1,...top.map(r=>Math.abs(Number(r.balance||0))));chart.innerHTML=top.length?top.map(r=>`<div class="shipper-fin-chart-row"><div class="shipper-fin-chart-label"><span>${esc(r.name||L('Unnamed shipper','تاجر بدون اسم'))}<small>${esc(r.merchant_no||r.code||'')}</small></span><b class="${Number(r.balance||0)>=0?'verify-positive':'verify-negative'}">${Number(r.balance||0)<0?'− ':''}${money(Math.abs(Number(r.balance||0)))}</b></div><div class="shipper-fin-chart-track"><span class="${Number(r.balance||0)>=0?'positive':'negative'}" style="width:${Math.max(2,Math.round(Math.abs(Number(r.balance||0))/max*100))}%"></span></div></div>`).join(''):`<p class="muted">${L('No chart data for this period.','لا توجد بيانات للرسم في هذه الفترة.')}</p>`;}
    let html='';
    if(!rows.length){box.innerHTML=`<div class="shipper-fin-empty"><span>▤</span><b>${L("No financial accounts found","لا توجد حسابات مالية")}</b><p>${L("Try changing the date range or shipper filter.","جرّب تغيير الفترة أو فلتر التاجر.")}</p></div>`;window.__merchantFinancialRows=[];await loadMerchantSettlementHistory();return;}
    html+=`<div class="table-wrap"><table class="merchant-financial-table shipper-financial-table"><thead><tr><th>${L("Shipper / Code","التاجر / الكود")}</th><th>${L("Orders","الطلبات")}</th><th>COD</th><th>${L("Delivery Fees","رسوم التوصيل")}</th><th>${L("Taxes","الضرائب")}</th><th>${L("Shipper Due","مستحق التاجر")}</th><th>${L("Adjustments","التسويات")}</th><th>${L("Settled","تمت التسوية")}</th><th>${L("Balance","الرصيد النهائي")}</th><th>${L("Action","الإجراء")}</th></tr></thead><tbody>`;
    html+=tableRows.map(r=>`<tr data-shipper-search="${esc(`${r.name||''} ${r.merchant_no||r.code||''}`.toLowerCase())}"><td><button type="button" class="shipper-fin-name merchant-statement-open-name" title="${L('Open shipper statement','فتح كشف حساب التاجر')}" onclick="openMerchantStatementModal('${esc(r.merchant_id)}')"><span class="shipper-fin-avatar">${esc(String(r.name||'?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(r.name||L('Unnamed shipper','تاجر بدون اسم'))}</b><small>${esc(r.merchant_no||r.code||'—')}</small></span><span class="merchant-statement-open-cue">عرض الكشف ↗</span></button></td><td>${Number(r.orders||0)}</td><td>${money(r.cod||0)}</td><td>${money(r.service_charges||0)}</td><td>${money(r.taxes||0)}</td><td>${money(r.merchant_due||0)}</td><td>${money(r.adjustments||0)}</td><td>${money(r.settled||0)}</td><td><span class="shipper-fin-balance ${Number(r.balance||0)>0?'positive':Number(r.balance||0)<0?'negative':'zero'}">${Number(r.balance||0)<0?'− ':''}${money(Math.abs(Number(r.balance||0)))}</span></td><td><button class="mini-btn shipper-fin-open" title="${L('Open statement','فتح الكشف')}" onclick="openMerchantFinancial('${esc(r.merchant_id)}')">${L('Details','التفاصيل')} →</button> <button class="mini-btn ghost" title="${L('Add adjustment / advance','إضافة تسوية / دفعة مقدمة')}" aria-label="${L('Add adjustment / advance','إضافة تسوية / دفعة مقدمة')}" onclick="openMerchantAdjustmentModal('${esc(r.merchant_id)}')">↔</button></td></tr>`).join('');
    if(!tableRows.length)html+=`<tr><td colspan="10" class="muted">${L('No shippers match this balance filter.','لا يوجد تجار مطابقون لفلتر الرصيد المحدد.')}</td></tr>`;
    html+=`</tbody></table></div>`;
    if(merchantId && (d.orders||[]).length){html+=`<div class="panel shipper-fin-detail-panel" style="margin-top:14px"><div class="section-title-row"><div><h3>${L("Shipper Order Financial Details","تفاصيل معاملات التاجر")}</h3><p class="muted">${L("Order-level charges and net amounts","الرسوم وصافي المبلغ لكل طلب")}</p></div><button class="ghost" onclick="printShipperStatement()">⎙ ${L("Print","طباعة")}</button></div><div class="table-wrap"><table><thead><tr><th>Tracking</th><th>${L("Order No.","رقم الطلب")}</th><th>COD</th><th>${L("Delivery Fees","رسوم التوصيل")}</th><th>${L("Shipper Due","مستحق التاجر")}</th><th>${L("Status","الحالة")}</th><th>${L("Save","حفظ")}</th></tr></thead><tbody>${(d.orders||[]).map(o=>`<tr><td>${esc(o.tracking_number||'—')}</td><td>${esc(o.merchant_order_no||'—')}</td><td>${money(o.cod||0)}</td><td><input id="mfFee_${esc(o.id)}" type="number" min="0" step="0.01" value="${Number(o.service_charges||0).toFixed(2)}" class="shipper-fin-fee-input"></td><td>${money(o.merchant_due||0)}</td><td>${esc(o.status||'')}</td><td><button class="mini-btn" onclick="updateMerchantOrderFee('${esc(o.id)}')">✓</button></td></tr>`).join('')}</tbody></table></div></div>`;}
    if(merchantId){html+=`<div class="panel shipper-fin-detail-panel" style="margin-top:14px"><div class="section-title-row"><div><h3>${L("Shipper Adjustments & Payouts","تسويات ودفعات التاجر")}</h3><p class="muted">${L("Every adjustment and payout requires supporting proof.","كل تسوية أو دفعة تحتاج إلى إثبات.")}</p></div></div><div class="form-grid"><label>${L("Type","النوع")}<select id="merchantAdjType"><option value="advance">Advance Payment — دفعة مقدمة</option><option value="deduction">Deduction — خصم</option><option value="credit">Credit — مبلغ مستحق للتاجر</option><option value="other">Other Adjustment — تسوية أخرى</option></select></label><label>${L("Amount","المبلغ")}<input id="merchantAdjAmount" type="number" min="0" step="0.01"></label><label>${L("Date","التاريخ")}<input id="merchantAdjDate" type="date" value="${today()}"></label><label>${L("Reference","المرجع")}<input id="merchantAdjRef"></label><label style="grid-column:1/-1">${L("Reason","السبب")}<input id="merchantAdjReason"></label><label style="grid-column:1/-1">${L("Adjustment Proof","إثبات التسوية")}<input id="merchantAdjProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small class="muted">${L("Required. JPG, PNG, WEBP or PDF, max 7MB.","مطلوب. JPG أو PNG أو WEBP أو PDF، بحد أقصى 7MB.")}</small></label></div><div class="actions"><button onclick="saveMerchantAdjustment('${esc(merchantId)}')">${L("Add Adjustment","إضافة التسوية")}</button></div><div id="merchantAdjMsg" class="msg"></div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>${L("Date","التاريخ")}</th><th>${L("Type","النوع")}</th><th>${L("Reason","السبب")}</th><th>${L("Amount","المبلغ")}</th><th>${L("Effect","التأثير")}</th><th>${L("Proof","الإثبات")}</th></tr></thead><tbody>${(d.adjustments||[]).map(a=>`<tr><td>${esc(a.adjustment_date||a.created_at||'')}</td><td>${esc(a.type||'')}</td><td>${esc(a.reason||'')}</td><td>${money(a.amount||0)}</td><td class="${Number(a.signed_amount||0)<0?'verify-negative':'verify-positive'}">${Number(a.signed_amount||0)<0?'−':'+'}${money(Math.abs(a.signed_amount||0))}</td><td>✓</td></tr>`).join('')||`<tr><td colspan="6" class="muted">${L("No adjustments yet.","لا توجد تسويات إضافية بعد.")}</td></tr>`}</tbody></table></div><div class="shipper-fin-payout"><h4>${L("Record Shipper Payout","تسجيل دفعة للتاجر")}</h4><div class="form-grid"><label>${L("Amount","المبلغ")}<input id="merchantSettleAmount" type="number" min="0" step="0.01"></label><label>${L("Payment Method","طريقة الدفع")}<select id="merchantSettleMethod" onchange="toggleShipperSettlementBank()"><option value="cash">Cash / نقدي</option><option value="bank">Bank Transfer / تحويل بنكي</option></select></label><label>${L("Date","التاريخ")}<input id="merchantSettleDate" type="date" value="${today()}"></label><label id="merchantBankWrap" style="display:none">${L("Bank Name","اسم البنك")}<input id="merchantSettleBank"></label><label>${L("Reference No.","رقم المرجع")}<input id="merchantSettleRef"></label><label style="grid-column:1/-1">${L("Settlement Proof","إثبات استلام المبلغ")}<input id="merchantSettleProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small class="muted">${L("Required. JPG, PNG, WEBP or PDF, max 7MB.","مطلوب. JPG أو PNG أو WEBP أو PDF، بحد أقصى 7MB.")}</small></label></div><div class="actions"><button onclick="saveMerchantSettlement('${esc(merchantId)}')">${L("Confirm Payout","تأكيد الدفعة")}</button></div><div id="merchantSettleMsg" class="msg"></div></div></div>`;}
    box.innerHTML=html;window.__merchantFinancialRows=tableRows;filterMerchantFinancialRows();await loadMerchantSettlementHistory();
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
async function settlementArchivePage(c){
  const now=new Date();now.setHours(12,0,0,0);now.setDate(now.getDate()-((now.getDay()+6)%7));
  const weekStart=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  c.innerHTML=`<h2 class="invoice-report-title">${L("Invoice Report","Invoice Report")}</h2><div class="panel invoice-report-panel"><div class="invoice-report-filters">
    <label>${L('From','من')}<input id="saFrom" type="date" value="${weekStart}"></label><label>${L('To','إلى')}<input id="saTo" type="date" value="${today()}"></label>
    <label>${L('Shipper','الشاحن')}<select id="saShipper"><option value="">${L('All Shippers','كل الشاحنين')}</option></select></label>
    <label>${L('State','الحالة')}<select id="saState"><option value="">${L('All','الكل')}</option><option value="Paid Shipper">Paid to Shipper</option><option value="Unpaid Shipper">Unpaid Shipper</option></select></label>
    <label class="invoice-report-search">${L('Search Tracking / Transaction / Shipment / Shipper Code','بحث Tracking / رقم التوليد / رقم الشحنة / كود التاجر')}<input id="saSearch" placeholder="Tracking / Transaction / Shipment / Shipper Code"></label>
    <div class="invoice-report-actions"><div class="invoice-bulk-actions-wrap"><button type="button" class="invoice-actions-trigger" onclick="toggleInvoiceReportActions()">Actions ▾</button><div id="invoiceReportActionsMenu" class="invoice-bulk-actions-menu" hidden><button type="button" onclick="bulkMarkSelectedOrdersPaid()">✓ تحويل الأوردرات المحددة إلى Paid to Shipper</button></div></div><button onclick="loadSettlementArchive()">${L('Search','بحث')}</button><button class="ghost" onclick="printSelectedSettlementArchive()">⎙ ${L('PDF Selected','PDF للمحدد')}</button><button class="ghost" onclick="exportSelectedSettlementArchive()">⇩ ${L('Excel Selected','Excel للمحدد')}</button><button class="ghost" onclick="printSelectedSettlementOrders()">PDF للأوردرات المحددة</button><button class="ghost" onclick="exportSelectedSettlementOrders()">Excel للأوردرات المحددة</button></div>
  </div><div id="settlementArchiveBox"></div></div>`;
  try{const m=await api('/api/merchants');$('saShipper').innerHTML+=((m.data||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name||'')} — ${esc(x.merchant_no||x.code||'')}</option>`).join(''));}catch(_){ }
  await loadSettlementArchive();
}
async function loadSettlementArchive(){
  const box=$("settlementArchiveBox");if(!box)return;
  try{
    const qs=new URLSearchParams({from:$('saFrom')?.value||'',to:$('saTo')?.value||'',merchant_id:$('saShipper')?.value||'',status:$('saState')?.value||'',q:$('saSearch')?.value||''});
    const d=await api('/api/accounting/shipper-settlements?'+qs.toString());const rows=(d.data||[]).filter(r=>Array.isArray(r.items)&&r.items.length>0);window.__settlementArchiveRows=rows;
    if(!rows.length){box.innerHTML=`<p class="muted">${L('No settlement records found.','لا توجد سجلات تسوية.')}</p>`;return;}
    // Group invoices by shipper and the original order/shipment creation date, not by settlement date.
    const grouped=new Map();
    for(const r of rows){
      const byDay=new Map();
      for(const item of (r.items||[])){
        const dt=String(r.generated_at||r.created_at||r.settlement_date||'').slice(0,10)||'غير محدد';
        if(!byDay.has(dt))byDay.set(dt,[]);byDay.get(dt).push(item);
      }
      if(!byDay.size)byDay.set(String(r.generated_at||r.created_at||r.settlement_date||'غير محدد').slice(0,10),[]);
      for(const [day,items] of byDay){
        const key=`${String(r.merchant_id||r.merchant?.id||'unknown')}|${day}`;
        if(!grouped.has(key))grouped.set(key,{id:key,merchantId:String(r.merchant_id||r.merchant?.id||'unknown'),day,merchant:r.merchant||{},records:[]});
        grouped.get(key).records.push({...r,items});
      }
    }
    const groups=[...grouped.values()].sort((a,b)=>b.day.localeCompare(a.day)||String(a.merchant?.name||'').localeCompare(String(b.merchant?.name||'')));
    const recordActions=(r)=>{const paid=r.status==='Paid Shipper',paidWithoutProof=paid&&!r.proof;return `<div class="invoice-inline-actions ${paidWithoutProof?'invoice-paid-no-proof':''}"><label class="mini-btn ghost invoice-proof-upload" title="إرفاق إثبات الدفع">📎 إرفاق<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange="uploadShipperSettlementProof('${esc(r.id)}',this.files[0])"></label>${r.proof?`<a class="mini-btn ghost" title="معاينة مرفق إثبات الدفع" href="/api/accounting/settlement-archive/${encodeURIComponent(r.proof.id)}/file" target="_blank" rel="noopener">معاينة</a>`:`<button class="mini-btn ghost" type="button" disabled title="لا يوجد إثبات مرفوع">لا يوجد إثبات</button>`}<select aria-label="تعديل حالة الفاتورة" onchange="changeShipperSettlementState('${esc(r.id)}',this.value)"><option value="Unpaid Shipper" ${!paid?'selected':''}>معلقة</option><option value="Paid Shipper" ${paid?'selected':''}>Paid to Shipper — مدفوعة</option></select>${paidWithoutProof?`<span class="invoice-proof-warning" title="الحالة مدفوعة ولكن لا يوجد إثبات مرفق">مدفوعة بدون إثبات</span>`:paid?`<span class="invoice-proof-confirmed">مدفوعة بإثبات</span>`:''}</div>`};
    box.innerHTML=`<div class="grid verify-stats"><div class="stat"><span>${L('Total Selected Orders','إجمالي الأوردرات المحددة')}</span><b id="saSelectedOrders">0</b></div><div class="stat verify-stat-green"><span>${L('Total Shipper Collection','إجمالي تحصيل الشاحن')}</span><b id="saSelectedCollection">${money(0)}</b></div><div class="stat"><span>${L('Daily shipper invoices','فواتير التجار اليومية')}</span><b>${groups.length}</b></div></div><div class="table-wrap"><table class="invoice-merchant-group-table"><thead><tr><th><input type="checkbox" aria-label="تحديد كل الفواتير" onchange="toggleAllInvoiceMerchantGroups(this)"></th><th>التاجر</th><th>التاريخ</th><th>رقم التوليد للفاتورة</th><th>عدد الأوردرات</th><th>إجمالي التحصيل</th><th>PDF</th><th>الدفع والحالة</th><th>التفاصيل</th></tr></thead><tbody>${groups.map(g=>{const orders=g.records.reduce((n,r)=>n+(r.items||[]).length,0),collection=g.records.reduce((n,r)=>n+Number(r.items?.reduce((sum,i)=>sum+Number(i.cod||0),0)??r.collection_amount??0),0),recordIds=g.records.map(r=>r.id).join(',');return `<tr class="invoice-merchant-group-row ${g.records.some(r=>r.status==='Paid Shipper'&&!r.proof)?'invoice-paid-no-proof-row':g.records.some(r=>r.status==='Paid Shipper'&&r.proof)?'invoice-paid-with-proof-row':''}"><td><input type="checkbox" class="invoice-merchant-group-check" value="${esc(g.id)}" onchange="toggleMerchantInvoiceRecords('${esc(g.id)}',this.checked)"></td><td><b>${esc(g.merchant?.name||'تاجر بدون اسم')}</b><small class="muted"><br>${esc(g.merchant?.merchant_no||g.merchant?.code||'')}</small></td><td>${esc(g.day)}</td><td><span class="invoice-generation-number">${g.records.map(r=>esc(r.transaction_number||'—')).join('<br>')}</span></td><td>${orders}</td><td>${money(collection)}</td><td><button class="mini-btn ghost" type="button" onclick="printMerchantInvoiceDay('${esc(g.id)}')">⎙ PDF</button></td><td>${g.records.map(recordActions).join('')}</td><td><button class="mini-btn ghost" type="button" onclick="toggleMerchantInvoiceDetails('${esc(g.id)}')">عرض الأوردرات ▾</button></td></tr><tr id="invoiceMerchantDetails-${esc(g.id)}" class="invoice-merchant-details-row" hidden><td colspan="9"><div class="invoice-merchant-details"><div class="section-title-row"><b>فواتير ${esc(g.merchant?.name||'التاجر')} — ${esc(g.day)}</b><button class="ghost" type="button" onclick="toggleMerchantInvoiceDetails('${esc(g.id)}')">إخفاء التفاصيل</button></div><div class="table-wrap"><table class="invoice-order-detail-table"><thead><tr><th><input type="checkbox" aria-label="تحديد أوردرات اليوم" onchange="toggleMerchantInvoiceRecords('${esc(g.id)}',this.checked)"></th><th>رقم التوليد</th><th>Tracking</th><th>رقم الأوردر</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th><th>حالة الفاتورة</th><th>الإجراء</th></tr></thead><tbody>${g.records.map(r=>(r.items||[]).map(i=>`<tr class="invoice-order-status-row ${r.status==='Paid Shipper'?(r.proof?'invoice-order-paid invoice-order-paid-proof':'invoice-order-paid invoice-order-paid-no-proof'):'invoice-order-unpaid'}"><td><input type="checkbox" class="settlement-archive-check settlement-archive-order-check" value="${esc(i.id)}" data-record-id="${esc(r.id)}" data-settlement-id="${esc(r.id)}" data-merchant-id="${esc(g.id)}" data-orders="1" data-collection="${Number(i.cod||0)}" onchange="updateSettlementArchiveSelection()"></td><td><span class="invoice-generation-number">${esc(r.transaction_number||'—')}</span></td><td>${esc(i.tracking_number||i.shipment_no||'—')}</td><td>${esc(i.merchant_order_no||i.order_id||'—')}</td><td>${money(i.cod||0)}</td><td>${money(i.service_charges||0)}</td><td>${money(i.merchant_net||0)}</td><td><span class="invoice-payment-badge ${r.status==='Paid Shipper'?(r.proof?'is-paid':'is-paid-no-proof'):'is-unpaid'}">${r.status==='Paid Shipper'?(r.proof?'Paid to Shipper · بإثبات':'Paid to Shipper · بدون إثبات'):'Unpaid Shipper'}</span></td><td>${String(r.status||'').toLowerCase()==='paid shipper'?`<span class="muted">مقفول — تم الدفع</span>`:`<button class="mini-btn danger" title="إخراج الأوردر من التوليد" onclick="removeShipperSettlementOrder('${esc(i.id)}')">×</button>`}</td></tr>`).join('')).join('')||`<tr><td colspan="9">لا توجد أوردرات مسجلة لهذا اليوم.</td></tr>`}</tbody></table></div></div></td></tr>`}).join('')}</tbody></table></div>`;
    updateSettlementArchiveSelection();
  }catch(e){box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function printMerchantInvoiceDay(groupId){
  const [merchantId,day]=String(groupId).split('|');
  const records=(window.__settlementArchiveRows||[]).filter(r=>String(r.merchant_id||r.merchant?.id||'unknown')===merchantId&&String(r.generated_at||r.created_at||r.settlement_date||'').slice(0,10)===day).map(r=>({...r,items:[...(r.items||[])]})).filter(r=>r.items.length);
  if(!records.length)return alert('لا توجد أوردرات لهذا التاجر في اليوم المحدد');
  const pairs=records.flatMap(r=>r.items.map(i=>({r,i})));const first=records[0];
  const merchant={...(first.merchant||{}),id:merchantId,name:first.merchant?.name||'التاجر',merchant_no:first.merchant?.merchant_no||first.merchant?.code||''};
  const items=pairs.map(({r,i})=>({...i,settlement_id:r.id,settlement_number:r.transaction_number||'',settlement_date:day,tracking_number:i.tracking_number||i.shipment_no||'',merchant_order_no:i.merchant_order_no||i.order_id||'',service_charges:Number(i.service_charges||0),merchant_net:Number(i.merchant_net||0),cod:Number(i.cod||0)}));
  printShipperSettlement({transaction_number:records.map(r=>r.transaction_number).filter(Boolean).join(' / ')||`INVOICE-${day}`,settlement_date:day,merchant,items,order_count:items.length,collection_amount:items.reduce((n,i)=>n+Number(i.cod||0),0),generated_by_name:first.generated_by_name||first.created_by_name||''});
}
function toggleMerchantInvoiceDetails(merchantId){const row=document.getElementById(`invoiceMerchantDetails-${merchantId}`);if(row)row.hidden=!row.hidden;}
function toggleMerchantInvoiceRecords(merchantId,checked){document.querySelectorAll(`.settlement-archive-check[data-merchant-id="${CSS.escape(String(merchantId))}"]`).forEach(x=>x.checked=!!checked);const group=document.querySelector(`.invoice-merchant-group-check[value="${CSS.escape(String(merchantId))}"]`);if(group)group.checked=!!checked;updateSettlementArchiveSelection();}
function toggleAllInvoiceMerchantGroups(el){document.querySelectorAll('.invoice-merchant-group-check').forEach(x=>{x.checked=!!el.checked;toggleMerchantInvoiceRecords(x.value,!!el.checked);});}
function printMerchantInvoiceOrders(merchantId){
  const records=(window.__settlementArchiveRows||[]).filter(r=>String(r.merchant_id||r.merchant?.id||'unknown')===String(merchantId));
  const pairs=records.flatMap(r=>(r.items||[]).map(i=>({r,i})));
  if(!pairs.length)return alert('لا توجد أوردرات مسجلة لهذا التاجر في الفترة المحددة');
  const merchant={...(records[0]?.merchant||{}),id:merchantId,name:records[0]?.merchant?.name||records[0]?.merchant_name||records[0]?.shipper_name||'التاجر',merchant_no:records[0]?.merchant?.merchant_no||records[0]?.merchant_no||records[0]?.merchant?.code||records[0]?.merchant_code||'',code:records[0]?.merchant?.code||records[0]?.merchant_code||'',address:records[0]?.merchant?.address||'',tax_rate:records[0]?.merchant?.tax_rate||0};
  // Use the exact same printable voucher template as the PDF action on an individual settlement.
  // Merge the merchant's recorded settlement items without losing their original order fields.
  const items=pairs.map(({r,i})=>{const nested=i.order&&typeof i.order==='object'?i.order:{};const areaValue=i.area||i.region||i.area_name||i.region_name||i.area_name_ar||i.area_name_en||nested.area_name||nested.region_name||nested.region||nested.area||'';const area=areaValue&&typeof areaValue==='object'?(areaValue.name_en||areaValue.name_ar||areaValue.name||''):areaValue;return {...i,settlement_id:r.id,settlement_number:r.transaction_number||'',settlement_date:r.settlement_date||'',tracking_number:i.tracking_number||i.shipment_no||nested.tracking_number||'',merchant_order_no:i.merchant_order_no||i.order_no||i.order_id||nested.merchant_order_no||nested.order_code||'',receiver_name:i.receiver_name||i.customer_name||nested.customer_name||nested.receiver_name||'',receiver_phone:i.receiver_phone||i.customer_phone||i.customer_phone_1||i.phone||i.phone1||i.receiver_mobile||nested.customer_phone||nested.customer_phone_1||nested.phone||nested.phone1||nested.receiver_phone||'',customer_phone_2:i.customer_phone_2||i.phone_2||i.phone2||i.alternate_phone||nested.customer_phone_2||nested.phone_2||nested.phone2||'',area,delivery_date:i.delivery_date||i.delivered_at||i.actual_delivery_date||nested.delivered_at||nested.delivery_date||r.settlement_date||'',service_charges:Number(i.service_charges??i.delivery_fee??0),merchant_net:Number(i.merchant_net??i.merchant_due??0),cod:Number(i.cod||0),status:i.status||nested.status||'Delivered',remarks:i.remarks||i.notes||nested.notes||''};});
  const transaction=records.length===1?(records[0].transaction_number||''): `INVOICE-${String(merchant.merchant_no||merchant.id||merchantId).replace(/[^A-Za-z0-9-]/g,'').slice(0,18)}-${today()}`;
  printShipperSettlement({transaction_number:transaction||`INVOICE-${today()}`,settlement_date:records.length===1?(records[0].settlement_date||today()):`${records.map(r=>r.settlement_date).filter(Boolean).sort()[0]||''} — ${records.map(r=>r.settlement_date).filter(Boolean).sort().slice(-1)[0]||today()}`,merchant,items,order_count:items.length,collection_amount:items.reduce((n,i)=>n+Number(i.cod||0),0),generated_by_name:records.find(r=>r.generated_by_name||r.created_by_name)?.generated_by_name||records.find(r=>r.created_by_name)?.created_by_name||''});
}
async function removeShipperSettlementOrder(itemId){
  if(!itemId)return;
  if(!await showConfirmModal(L('Remove this order from the generated settlement and return it to generation?','هل تريد إخراج هذا الأوردر من التوليد وإرجاعه لصفحة توليد التسوية؟')))return;
  try{const d=await api('/api/accounting/shipper-settlements/remove-item',{method:'POST',body:JSON.stringify({item_id:itemId})});if(!d.success)throw new Error(d.error||'تعذر إخراج الأوردر من التوليد');await loadSettlementArchive();if($('merchantGenerateMsg'))msg('merchantGenerateMsg',L('Order returned to settlement generation.','تم إرجاع الأوردر إلى توليد التسوية.'),'ok');}catch(e){alert(e.message);}
}
function toggleSettlementOrderChecks(el,settlementId){document.querySelectorAll('.settlement-archive-order-check').forEach(x=>{if(String(x.dataset.settlementId)===String(settlementId))x.checked=!!el.checked;});}
function printSelectedSettlementOrders(){const checks=[...document.querySelectorAll('.settlement-archive-order-check:checked')];if(!checks.length)return alert('حدد أوردرًا واحدًا على الأقل لعرض PDF');const chosen=new Set(checks.map(x=>String(x.value)));const items=[];for(const r of (window.__settlementArchiveRows||[])){for(const i of (r.items||[])){if(chosen.has(String(i.id)))items.push({r,i});}}if(!items.length)return alert('لم يتم العثور على تفاصيل الأوردرات المحددة');const w=window.open('','_blank','width=1000,height=800');if(!w)return;w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>الأوردرات المحددة في Invoice Report</title><style>body{font-family:Arial,Tahoma;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:center}th{background:#eef2f7}</style></head><body>${companyPrintBrandHeader()}<h2>الأوردرات المحددة في Invoice Report</h2><table><thead><tr><th>التاريخ</th><th>التاجر</th><th>رقم التوليد</th><th>Tracking</th><th>رقم الأوردر</th><th>COD</th><th>رسوم التوصيل</th><th>صافي التاجر</th></tr></thead><tbody>${items.map(({r,i})=>`<tr><td>${esc(r.settlement_date||'')}</td><td>${esc(r.merchant?.name||'')}</td><td>${esc(r.transaction_number||'')}</td><td>${esc(i.tracking_number||i.shipment_no||'')}</td><td>${esc(i.merchant_order_no||i.order_id||'')}</td><td>${money(i.cod||0)}</td><td>${money(i.service_charges||0)}</td><td>${money(i.merchant_net||0)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);w.document.close();}
function toggleAllSettlementArchive(el){document.querySelectorAll('.settlement-archive-check').forEach(x=>x.checked=!!el.checked);document.querySelectorAll('.invoice-merchant-group-check').forEach(x=>x.checked=!!el.checked);updateSettlementArchiveSelection();}
function updateSettlementArchiveSelection(){const rows=[...document.querySelectorAll('.settlement-archive-check:checked')];const orders=rows.reduce((s,x)=>s+Number(x.dataset.orders||0),0),collection=rows.reduce((s,x)=>s+Number(x.dataset.collection||0),0);if($('saSelectedOrders'))$('saSelectedOrders').textContent=orders;if($('saSelectedCollection'))$('saSelectedCollection').textContent=money(collection);}
function toggleInvoiceReportActions(){const menu=$('invoiceReportActionsMenu');if(menu)menu.hidden=!menu.hidden;}
async function bulkMarkSelectedOrdersPaid(){
  const menu=$('invoiceReportActionsMenu');if(menu)menu.hidden=true;
  const checks=[...document.querySelectorAll('.settlement-archive-order-check:checked')];
  if(!checks.length)return alert('حدد أوردرًا واحدًا على الأقل من تفاصيل الفاتورة أولًا.');
  const recordIds=[...new Set(checks.map(x=>String(x.dataset.recordId||x.dataset.settlementId||'')).filter(Boolean))];
  if(!recordIds.length)return alert('تعذر تحديد الفواتير المرتبطة بالأوردرات المحددة.');
  if(!await showConfirmModal(`سيتم تحويل ${recordIds.length} فاتورة مرتبطة بالأوردرات المحددة إلى Paid to Shipper. الحالة محفوظة على مستوى الفاتورة؛ لذلك لو اخترت أوردرًا من فاتورة متعددة الأوردرات ستتحول الفاتورة كلها إلى مدفوعة. هل تريد المتابعة؟`))return;
  let updated=0;
  try{
    for(const id of recordIds){await api('/api/accounting/shipper-settlements/status',{method:'POST',body:JSON.stringify({id,status:'Paid Shipper'})});updated++;}
    alert(`تم تحويل ${updated} فاتورة إلى Paid to Shipper.`);
    await loadSettlementArchive();
  }catch(e){alert(`تم تحديث ${updated} فاتورة قبل حدوث الخطأ: ${e.message}`);await loadSettlementArchive();}
}
async function changeShipperSettlementState(id,status){try{await api('/api/accounting/shipper-settlements/status',{method:'POST',body:JSON.stringify({id,status})});await loadSettlementArchive();}catch(e){alert(e.message);}}
async function uploadShipperSettlementProof(id,file){if(!file)return;if(file.size>7*1024*1024)return alert(L('File is larger than 7MB','حجم الملف أكبر من 7MB'));const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(file.type))return alert(L('Unsupported proof file type','نوع ملف الإثبات غير مدعوم'));try{const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});await api('/api/accounting/shipper-settlements/proof',{method:'POST',body:JSON.stringify({id,proof:{file_name:file.name,content_type:file.type,data_url:dataUrl}})});alert('تم إرفاق إثبات التسوية وتغيير الحالة إلى Paid to Shipper');await loadSettlementArchive();}catch(e){alert(e.message);}}
function printSelectedSettlementArchive(){
  // If whole shipper rows are selected, print a separate voucher window for each shipper.
  // Each voucher reuses the exact Invoice Report template and includes only that shipper's orders.
  const selectedMerchantIds=[...document.querySelectorAll('.invoice-merchant-group-check:checked')].map(x=>String(x.value)).filter(Boolean);
  if(selectedMerchantIds.length){
    const validIds=selectedMerchantIds.filter(id=>{const [merchantId,day]=id.split('|');return (window.__settlementArchiveRows||[]).some(r=>String(r.merchant_id||r.merchant?.id||'unknown')===merchantId&&String(r.generated_at||r.created_at||r.settlement_date||'').slice(0,10)===day&&(r.items||[]).length>0);});
    if(!validIds.length)return alert('لا توجد أوردرات مسجلة للتجار المحددين في الفترة الحالية');
    validIds.forEach(id=>printMerchantInvoiceDay(id));
    return;
  }
  const checks=[...document.querySelectorAll('.settlement-archive-check:checked')];const rows=(window.__settlementArchiveRows||[]).filter(r=>checks.some(c=>String(c.dataset.recordId||c.value)===String(r.id)));if(!rows.length)return alert(L('Select settlement records first','اختر سجلات التسوية أولاً'));
  printShipperSettlementBulk(rows);
}



function toggleMerchantSettlementBank(){const w=$("merchantBankWrap");if(w)w.style.display=$("merchantSettleMethod")?.value==='bank'?'block':'none';}
async function saveMerchantSettlement(merchantId){try{const amount=baseAmount($("merchantSettleAmount")?.value||0);if(amount<=0)return msg('merchantSettleMsg',L('Enter a valid amount','أدخل مبلغًا صحيحًا'),'error');const method=$("merchantSettleMethod")?.value||'cash';if(method==='bank'&&!$("merchantSettleBank")?.value.trim())return msg('merchantSettleMsg',L('Bank name is required','اسم البنك مطلوب'),'error');const file=$("merchantSettleProof")?.files?.[0];if(!file)return msg('merchantSettleMsg',L('Settlement proof is required','إثبات الاستلام مطلوب قبل اعتماد التسوية'),'error');if(file.size>7*1024*1024)return msg('merchantSettleMsg',L('File is larger than 7MB','حجم الملف أكبر من 7MB'),'error');const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(file.type))return msg('merchantSettleMsg',L('Unsupported proof file type','نوع ملف الإثبات غير مدعوم'),'error');const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('تعذر قراءة ملف الإثبات'));r.readAsDataURL(file);});await api('/api/accounting/merchant-financial/settle',{method:'POST',body:JSON.stringify({merchant_id:merchantId,amount,payment_method:method,paid_at:$("merchantSettleDate")?.value||today(),bank_name:$("merchantSettleBank")?.value||'',transfer_reference:$("merchantSettleRef")?.value||'',proof:{file_name:file.name,content_type:file.type,data_url:dataUrl}})});msg('merchantSettleMsg',L('Settlement recorded with proof','تم اعتماد التسوية وحفظ إثبات الاستلام'),'ok');await loadMerchantFinancial();}catch(e){msg('merchantSettleMsg',e.message,'error');}}
async function adjustmentPage(c){
  c.innerHTML=`<div class="shipper-fin-page"><div class="shipper-fin-heading"><div><h2>${L("Adjustment","التسويات المالية")}</h2><p class="muted">${L("Search for a shipper, then record an adjustment or advance payment.","ابحث عن التاجر ثم سجّل تسوية أو دفعة مقدمة.")}</p></div></div>
  <div class="panel"><label>${L("Search shipper by name or code","ابحث عن التاجر بالاسم أو الكود")}<input id="adjustmentShipperSearch" autocomplete="off" placeholder="${L("Type shipper name or code...","اكتب اسم التاجر أو الكود...")}" oninput="filterAdjustmentShippers()"></label>
  <div id="adjustmentShipperResults" class="adjustment-shipper-results"><p class="muted">${L("Loading shippers...","جارٍ تحميل التجار...")}</p></div><div id="adjustmentSelectedShipper" class="msg"></div></div>
  <div id="adjustmentFormPanel" class="panel" hidden><div class="section-title-row"><div><h3>${L("New Adjustment","تسوية جديدة")}</h3><p id="adjustmentSelectedName" class="muted"></p></div></div>
  <input id="merchantAdjShipperId" type="hidden"><div class="form-grid"><label>${L("Type","النوع")}<select id="merchantAdjType"><option value="advance">Advance Payment — دفعة مقدمة</option><option value="deduction">Deduction — خصم</option><option value="credit">Credit — مبلغ مستحق للتاجر</option><option value="other">Other Adjustment — تسوية أخرى</option></select></label><label>${L("Amount","المبلغ")}<input id="merchantAdjAmount" type="number" min="0.01" step="0.01"></label><label>${L("Date","التاريخ")}<input id="merchantAdjDate" type="date" value="${today()}"></label><label>${L("Reference","المرجع")}<input id="merchantAdjRef"></label><label style="grid-column:1/-1">${L("Reason","السبب")}<input id="merchantAdjReason"></label><label style="grid-column:1/-1">${L("Adjustment Proof","إثبات التسوية")}<input id="merchantAdjProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><div class="actions"><button type="button" onclick="saveAdjustmentPageForm()">${L("Save Adjustment","حفظ التسوية")}</button><button type="button" class="ghost" onclick="resetAdjustmentPageForm()">${L("Cancel","إلغاء")}</button></div><div id="merchantAdjMsg" class="msg"></div></div></div>`;
  try{const d=await api('/api/merchants');window.__adjustmentShippers=d.data||[];filterAdjustmentShippers();}catch(e){$('adjustmentShipperResults').innerHTML=`<p class="error">${esc(e.message)}</p>`;}
}
function filterAdjustmentShippers(){
 const input=$('adjustmentShipperSearch'),box=$('adjustmentShipperResults');if(!input||!box)return;
 const q=input.value.trim().toLowerCase(),rows=(window.__adjustmentShippers||[]).filter(m=>!q||[m.name,m.merchant_no,m.code,m.external_code].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,30);
 box.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>${L("Shipper","التاجر")}</th><th>${L("Code","الكود")}</th><th>${L("Action","الإجراء")}</th></tr></thead><tbody>${rows.map(m=>`<tr><td>${esc(m.name||'')}</td><td>${esc(m.merchant_no||m.code||m.external_code||'—')}</td><td><button class="mini-btn" onclick="selectAdjustmentShipper('${esc(m.id)}')">${L("Select","اختيار")}</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L("No matching shippers","لا يوجد تجار مطابقون")}</p>`;
}
async function selectAdjustmentShipper(id){
 const m=(window.__adjustmentShippers||[]).find(x=>String(x.id)===String(id));if(!m)return;
 $('merchantAdjShipperId').value=m.id;$('adjustmentSelectedName').textContent=`${m.name||''} — ${m.merchant_no||m.code||m.external_code||''}`;
 $('adjustmentFormPanel').hidden=false;$('merchantAdjAmount').value='';$('merchantAdjRef').value='';$('merchantAdjReason').value='';$('merchantAdjDate').value=today();$('merchantAdjProof').value='';$('merchantAdjMsg').innerHTML='';
 $('adjustmentSelectedShipper').textContent=`${L("Selected shipper","التاجر المختار")}: ${m.name||''} (${m.merchant_no||m.code||m.external_code||''})`;
 try{const d=await api('/api/accounting/merchant-financial?merchant_id='+encodeURIComponent(m.id));const r=(d.data||[]).find(x=>String(x.merchant_id||x.id)===String(m.id));if(r)$('adjustmentSelectedShipper').textContent+=` · ${L("Balance","الرصيد")}: ${money(r.balance||0)}`;}catch(e){}
}
function resetAdjustmentPageForm(){if($('adjustmentFormPanel'))$('adjustmentFormPanel').hidden=true;if($('adjustmentSelectedShipper'))$('adjustmentSelectedShipper').innerHTML='';}
async function saveAdjustmentPageForm(){
 const id=$('merchantAdjShipperId')?.value;if(!id)return msg('merchantAdjMsg',L('Select a shipper first','اختر التاجر أولاً'),'error');
 await saveMerchantAdjustment(id);
}
function openMerchantAdjustmentModal(merchantId){const modal=$("merchantAdjustmentModal");if(!modal)return;$("merchantAdjShipperId").value=merchantId||$("merchantFinancialSelect")?.value||'';$("merchantAdjAmount").value='';$("merchantAdjRef").value='';$("merchantAdjReason").value='';$("merchantAdjDate").value=today();$("merchantAdjProof").value='';const msg=$("merchantAdjMsg");if(msg)msg.innerHTML='';modal.hidden=false;}
function closeMerchantAdjustmentModal(){const modal=$("merchantAdjustmentModal");if(modal)modal.hidden=true;}
async function saveMerchantAdjustmentFromModal(){const id=$("merchantAdjShipperId")?.value||$("merchantFinancialSelect")?.value||'';if(!id)return msg('merchantAdjMsg',L('Select a shipper first','اختر التاجر أولاً'),'error');await saveMerchantAdjustment(id);if(!$("merchantAdjMsg")?.querySelector('.error'))closeMerchantAdjustmentModal();}
async function saveMerchantAdjustment(merchantId){try{const amount=baseAmount($("merchantAdjAmount")?.value||0);if(amount<=0)return msg('merchantAdjMsg',L('Enter a valid amount','أدخل مبلغًا صحيحًا'),'error');const file=$("merchantAdjProof")?.files?.[0];if(!file)return msg('merchantAdjMsg',L('Adjustment proof is required','إثبات التسوية مطلوب'),'error');if(file.size>7*1024*1024)return msg('merchantAdjMsg',L('File is larger than 7MB','حجم الملف أكبر من 7MB'),'error');const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(file.type))return msg('merchantAdjMsg',L('Unsupported proof file type','نوع ملف الإثبات غير مدعوم'),'error');const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('تعذر قراءة ملف الإثبات'));r.readAsDataURL(file);});await api('/api/accounting/merchant-financial/adjustment',{method:'POST',body:JSON.stringify({merchant_id:merchantId,type:$("merchantAdjType")?.value||'other',amount,adjustment_date:$("merchantAdjDate")?.value||today(),reference:$("merchantAdjRef")?.value||'',reason:$("merchantAdjReason")?.value||'',proof:{file_name:file.name,content_type:file.type,data_url:dataUrl}})});msg('merchantAdjMsg',L('Adjustment recorded with proof','تم تسجيل التسوية وحفظ إثباتها'),'ok');if($('merchantFinancialBox'))await loadMerchantFinancial();if($('adjustmentShipperResults')){const id=$('merchantAdjShipperId')?.value;const m=(window.__adjustmentShippers||[]).find(x=>String(x.id)===String(id));if(m)msg('adjustmentSelectedShipper',L('Adjustment saved for','تم حفظ التسوية للتاجر')+' '+(m.name||''),'ok');}}catch(e){msg('merchantAdjMsg',e.message,'error');}}

async function updateMerchantOrderFee(orderId){const el=$("mfFee_"+orderId);if(!el)return;try{await api('/api/accounting/merchant-financial/update-fee',{method:'POST',body:JSON.stringify({order_id:orderId,service_charges:Number(el.value||0)})});await loadMerchantFinancial();msg('merchantFinancialMsg',L('Service charges updated successfully.','تم تعديل رسوم التوصيل بنجاح.'),'ok');}catch(e){msg('merchantFinancialMsg',e.message,'error');}}
async function openMerchantFinancial(id){const s=$("merchantFinancialSelect");if(s){s.value=id;await loadMerchantFinancial();}else await loadMerchantFinancial();}
async function printMerchantStatement(){
  const id=$("merchantFinancialSelect")?.value||""; if(!id){return msg('merchantFinancialMsg',L('Select one shipper first.','اختر تاجرًا واحدًا أولاً.'),'error');}
  try{const d=await api(`/api/accounting/merchant-financial?merchant_id=${encodeURIComponent(id)}&balance=all`);const r=(d.data||[])[0];if(!r)return;
    const orders=d.orders||[], settlements=d.settlements||[], adjustments=d.adjustments||[];
    const w=window.open('','_blank','width=1000,height=800'); if(!w)return;
    w.document.write(`<html dir="rtl"><head><title>Shipper Financial Statement</title><style>body{font-family:Arial,Tahoma;margin:25px;color:#222}h1{font-size:22px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}.box{border:1px solid #ccc;padding:10px;border-radius:6px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:center}th{background:#f2f2f2}.pos{color:green}.neg{color:#c00}.sign{margin-top:40px;display:flex;justify-content:space-between}.sign div{width:40%;border-top:1px solid #333;padding-top:8px}</style></head><body>${companyPrintBrandHeader()}<h1>كشف مالي للتاجر</h1><div class="meta"><div class="box"><b>التاجر:</b> ${esc(r.name)}<br><b>الكود:</b> ${esc(r.merchant_no||r.code||'')}</div><div class="box"><b>إجمالي COD:</b> ${money(r.cod)}<br><b>رسوم التوصيل:</b> ${money(r.service_charges)}<br><b>الضرائب:</b> ${money(r.taxes)}</div></div><table><thead><tr><th>Tracking</th><th>Order No.</th><th>COD</th><th>رسوم التوصيل</th><th>مستحق التاجر</th><th>الحالة</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.tracking_number)}</td><td>${esc(o.merchant_order_no)}</td><td>${money(o.cod)}</td><td><input value="${Number(o.service_charges||0).toFixed(2)}" style="width:80px" readonly></td><td>${money(o.merchant_due)}</td><td>${esc(o.status)}</td></tr>`).join('')}</tbody></table><div class="box"><b>COD:</b> ${money(r.cod)}<br><b>رسوم الخدمة:</b> -${money(r.service_charges)}<br><b>الضرائب:</b> -${money(r.taxes)}<br><b>التسويات والدفعات:</b> ${money(r.adjustments||0)}<br><b>تمت التسوية:</b> -${money(r.settled)}<br><b>الرصيد النهائي:</b> <span class="${r.balance>=0?'pos':'neg'}">${money(r.balance)}</span></div><h3>الخصومات والدفعات والتسويات</h3><table><thead><tr><th>التاريخ</th><th>النوع</th><th>السبب</th><th>المبلغ</th><th>التأثير</th></tr></thead><tbody>${adjustments.map(a=>`<tr><td>${esc(a.adjustment_date||a.created_at||'')}</td><td>${esc(a.type||'')}</td><td>${esc(a.reason||'')}</td><td>${money(a.amount)}</td><td>${Number(a.signed_amount||0)<0?'−':'+'}${money(Math.abs(a.signed_amount||0))}</td></tr>`).join('')}</tbody></table><h3>التسويات السابقة</h3><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>البنك</th><th>المرجع</th></tr></thead><tbody>${settlements.map(x=>`<tr><td>${esc(x.paid_at||'')}</td><td>${money(x.amount)}</td><td>${esc(x.payment_method||'')}</td><td>${esc(x.bank_name||'')}</td><td>${esc(x.transfer_reference||'')}</td></tr>`).join('')}</tbody></table><div class="sign"><div>يجب التوقيع: __________________</div><div>الموظف: __________________</div></div><script>window.print();</script></body></html>`);w.document.close();
  }catch(e){msg('merchantFinancialMsg',e.message,'error');}
}
async function loadAccountingVerifyOrders(){
  try{
    const from=$("accVerifyFrom")?.value||"", to=$("accVerifyTo")?.value||"", driver=$("accVerifyDriver")?.value||"", q=$("accVerifySearch")?.value||"";
    const d=await api(`/api/accounting/verify-orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&driver_id=${encodeURIComponent(driver)}&q=${encodeURIComponent(q)}`);
    const rows=d.data||[];
    const eligible=rows.filter(r=>r.eligible), verified=rows.filter(r=>r.verify_status==='verified'||r.paid_status==='paid'), unverified=rows.filter(r=>r.eligible&&r.verify_status!=='verified'&&r.paid_status!=='paid');
    $("accVerifyOrders").innerHTML=`<div class="verify-legend"><span class="verify-dot verified-dot"></span> Verified <span class="verify-dot unverified-dot"></span> Unverified <span class="verify-note">${L("Only eligible orders can be Verified.","فقط الأوردرات المسموح بها يمكن اعتمادها.")}</span></div>
      <div class="grid verify-stats"><div class="stat"><span>${L("Orders","الأوردرات")}</span><b>${rows.length}</b></div><div class="stat"><span>${L("Eligible","مستحقة")}</span><b>${eligible.length}</b></div><div class="stat verify-stat-green"><span>Verified</span><b>${verified.length}</b></div><div class="stat verify-stat-red"><span>Unverified</span><b>${unverified.length}</b></div></div>
      ${rows.length?`<div class="table-wrap"><table class="accounting-verify-table unified-accounting-orders"><thead><tr><th><input type="checkbox" onclick="toggleAccountingVerify(this)"></th><th>${L("Job Code","كود المهمة")}</th><th>${L("Shipper","التاجر")}</th><th>${L("Shipper COD","COD التاجر")}</th><th>${L("Service charge","رسوم الخدمة")}</th><th>${L("Driver","المندوب")}</th><th>${t("Status")}</th><th>Verify</th><th>${L("Actions","الإجراءات")}</th></tr></thead><tbody>${rows.map(r=>{
        const verifiedState=r.verify_status==='verified'||r.paid_status==='paid';
        const eligibleState=!!r.eligible;
        const rowClass=verifiedState?'verify-row-verified':(eligibleState?'verify-row-unverified':'verify-row-ineligible');
        const badge=verifiedState?'<span class="verify-badge verified-badge">✓ Verified</span>':'<span class="verify-badge unverified-badge">✕ Unverified</span>';
        return `<tr class="${rowClass}"><td><input class="accounting-verify-check" type="checkbox" value="${esc(r.id)}" ${eligibleState&&!verifiedState?'':'disabled'}></td><td><b>${esc(r.job_code||r.shipment_no||r.tracking_number||'—')}</b></td><td>${esc(r.shipper_name||'—')}</td><td>${money(r.shipper_cod??r.cod??0)}</td><td>${money(r.service_charges||0)}</td><td>${esc(r.driver_name||'—')} ${r.driver_no?`<small class="muted">— ${esc(r.driver_no)}</small>`:''}</td><td>${esc(r.status||'')}</td><td>${badge}</td><td><div class="actions verification-actions"><button class="mini-btn ghost" title="${L("Edit","تعديل")}" onclick="openOrder('${esc(r.id)}','accounting')"></button>${r.paid_status==='paid'?`<span class="muted" title="${L('Paid orders cannot be removed','لا يمكن إخراج الأوردر المدفوع من الكشف')}">—</span>`:`<button class="mini-btn danger" title="${L("Remove from Statement","إخراج من الكشف")}" onclick="removeAccountingVerificationOrder('${esc(r.id)}')"></button>`}</div></td></tr>`;
      }).join('')}</tbody></table></div>`:`<p class="muted">${L("No orders found","لا توجد أوردرات")}</p>`}`;
  }catch(e){msg("accVerifyMsg",e.message,"error");}
}

async function removeAccountingVerificationOrder(id){
  if(!await showConfirmModal(`${L('Remove Order from Statement?','إخراج الأوردر من كشف المندوب؟')}`))return;
  try{await api('/api/orders-verification/remove',{method:'POST',body:JSON.stringify({id})});await loadAccountingVerifyOrders();await loadAccountingDriverExpenses();}
  catch(e){alert(e.message);}
}
async function verifySelectedAccountingOrders(){
  const ids=[...document.querySelectorAll('.accounting-verify-check:checked')].map(x=>x.value);
  if(!ids.length)return msg('accVerifyMsg',L('Select eligible orders first','اختر الأوردرات المسموح لها أولاً'),'error');
  try{await api('/api/orders-verification/verify',{method:'POST',body:JSON.stringify({order_ids:ids})});msg('accVerifyMsg',L('Verified successfully','تم الاعتماد بنجاح'),'ok');await loadAccountingVerifyOrders();await loadAccountingDriverExpenses();}
  catch(e){msg('accVerifyMsg',e.message,'error');}
}
function toggleAccountingVerify(el){document.querySelectorAll('.accounting-verify-check:not(:disabled)').forEach(x=>x.checked=el.checked);}

async function loadAccountingDriverExpenses(){
  try{
    const from=$("accVerifyFrom")?.value||"", to=$("accVerifyTo")?.value||"", driver=$("accVerifyDriver")?.value||"";
    const d=await api(`/api/accounting/driver-expenses-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&driver_id=${encodeURIComponent(driver)}`);
    const rows=d.data||[];
    const totalFuel=rows.reduce((s,r)=>s+Number(r.fuel_expense||0),0), totalOther=rows.reduce((s,r)=>s+Number(r.other_expenses||0),0), totalNet=rows.reduce((s,r)=>s+Number(r.net_commission||0),0), totalPaid=rows.reduce((s,r)=>s+Number(r.paid_amount||0),0), totalRemaining=rows.reduce((s,r)=>s+Number(r.remaining_amount||0),0);
    const box=$("accDriverExpenses"); if(!box)return;
    const selectedDriver=driver ? rows[0] : null;
    const paymentHtml = selectedDriver ? `<div class="panel driver-payment-panel" style="margin-top:14px"><div class="section-title-row"><div><h3>${L("Driver Payment / Cash","دفع مستحقات السائق / كاش")}</h3><p class="muted">${esc(selectedDriver.driver_name||'')} ${selectedDriver.driver_no?`— ${esc(selectedDriver.driver_no)}`:''}</p></div></div><div class="grid verify-stats"><div class="stat"><span>${L("Net due after expenses","المستحق بعد خصم المصروفات")}</span><b>${money(selectedDriver.net_commission||0)}</b></div><div class="stat"><span>${L("Paid","المدفوع")}</span><b>${money(selectedDriver.paid_amount||0)}</b></div><div class="stat verify-stat-green"><span>${L("Remaining","المتبقي")}</span><b>${money(Math.max(0,selectedDriver.remaining_amount||0))}</b></div></div><div class="form-grid" style="margin-top:12px"><label>${L("Payment Method","طريقة الدفع")}<select id="driverPayMethod" onchange="toggleDriverPaymentBank()"><option value="cash">Cash / كاش</option><option value="credit">Bank / Credit</option></select></label><label>${L("Paid Amount","المبلغ المدفوع")}<input id="driverPayAmount" type="number" min="0" max="${Math.max(0,Number(selectedDriver.remaining_amount||0))}" step="0.01" value="${Math.max(0,Number(selectedDriver.remaining_amount||0)).toFixed(2)}"></label><label>${L("Payment Date","تاريخ الدفع")}<input id="driverPayDate" type="date" value="${today()}"></label><label id="driverBankNameWrap" style="display:none">${L("Bank Name","اسم البنك")}<input id="driverBankName"></label><label id="driverTransferRefWrap" style="display:none">${L("Reference No.","رقم المرجع")}<input id="driverTransferRef"></label></div><div class="actions" style="margin-top:10px"><button type="button" onclick="saveAccountingDriverPayment('${esc(selectedDriver.driver_id)}')">✓ ${L("Confirm Payment","تأكيد الدفع")}</button></div><div id="driverPaymentMsg" class="msg"></div></div>` : `<div class="panel driver-payment-panel" style="margin-top:14px"><p class="muted">${L("Select one driver above to show the payment section and record Cash / Bank payment.","اختر سائقًا واحدًا من الأعلى لإظهار قسم الدفع وتسجيل الكاش أو البنك.")}</p></div>`;
    box.innerHTML=`<div class="grid verify-stats"><div class="stat"><span>${L("Drivers with activity","مندوبون لديهم حركة")}</span><b>${rows.length}</b></div><div class="stat"><span>${L("Fuel Expenses","مصروف البنزين")}</span><b>${money(totalFuel)}</b></div><div class="stat"><span>${L("Other Expenses","مصروفات أخرى")}</span><b>${money(totalOther)}</b></div><div class="stat verify-stat-green"><span>${L("Net Due","صافي المستحق")}</span><b>${money(totalNet)}</b></div><div class="stat"><span>${L("Paid","المدفوع")}</span><b>${money(totalPaid)}</b></div><div class="stat"><span>${L("Remaining","المتبقي")}</span><b>${money(totalRemaining)}</b></div></div>
      ${rows.length?`<div class="table-wrap"><table class="driver-expenses-linked-table"><thead><tr><th>${L("Driver","المندوب")}</th><th>${L("Verified Orders","الأوردرات المعتمدة")}</th><th>${L("Order Value","قيمة الأوردرات")}</th><th>${L("Expenses","المصروفات")}</th><th>${L("Net Due","المستحق بعد خصم المصروفات")}</th><th>${L("Paid","المدفوع")}</th><th>${L("Remaining","المتبقي")}</th><th>${L("Actions","الإجراءات")}</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.driver_name||'—')}</b>${r.driver_no?`<small class="muted"><br>${esc(r.driver_no)}</small>`:''}</td><td>${Number(r.verified_orders||0)}</td><td>${money(r.shipper_cod||0)}</td><td>− ${money(r.total_expenses||0)}</td><td><b>${money(r.net_commission||0)}</b></td><td>${money(r.paid_amount||0)}</td><td><b>${money(Math.max(0,r.remaining_amount||0))}</b></td><td><button class="mini-btn ghost" title="${L("Pay","دفع")}" onclick="selectAccountingDriverPayment('${esc(r.driver_id)}')">💵</button> <button class="mini-btn ghost" title="${L("Open Driver Expenses","فتح مصروفات المندوب")}" onclick="openDriverExpensesFromAccounting('${esc(r.driver_id)}')"></button></td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${L("No verified orders or expenses found for this period.","لا توجد أوردرات معتمدة أو مصروفات للمندوبين خلال الفترة المحددة.")}</p>`}${paymentHtml}`;
  }catch(e){const el=$("accDriverExpenses");if(el)el.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
function toggleDriverPaymentBank(){const bank=$("driverPayMethod")?.value==='credit'; if($("driverBankNameWrap"))$("driverBankNameWrap").style.display=bank?'block':'none'; if($("driverTransferRefWrap"))$("driverTransferRefWrap").style.display=bank?'block':'none';}
async function selectAccountingDriverPayment(driverId){const el=$("accVerifyDriver");if(el){el.value=driverId;await loadAccountingVerifyOrders();await loadAccountingDriverExpenses();document.getElementById("driverExpensesSection")?.scrollIntoView({behavior:"smooth",block:"start"});}}
async function saveAccountingDriverPayment(driverId){try{const amount=baseAmount($("driverPayAmount")?.value||0);const max=baseAmount($("driverPayAmount")?.max||0);if(amount<=0)return msg("driverPaymentMsg",L("Enter a valid payment amount","أدخل مبلغ دفع صحيح"),"error");if(max>0&&amount>max)return msg("driverPaymentMsg",L("Payment cannot exceed the remaining amount","لا يمكن أن يتجاوز الدفع المبلغ المتبقي"),"error");const method=$("driverPayMethod")?.value||'cash';await api('/api/driver-settlements',{method:'POST',body:JSON.stringify({driver_id:driverId,amount,payment_method:method,paid_at:$("driverPayDate")?.value||today(),bank_name:$("driverBankName")?.value||'',transfer_reference:$("driverTransferRef")?.value||''})});msg("driverPaymentMsg",L("Payment recorded successfully","تم تسجيل الدفع بنجاح"),"ok");await loadAccountingDriverExpenses();}catch(e){msg("driverPaymentMsg",e.message,"error");}}

async function openDriverExpensesFromAccounting(driverId){try{if(CURRENT_PAGE!=="accounting")await show("accounting");const el=$("accVerifyDriver");if(el){el.value=driverId;await loadAccountingVerifyOrders();await loadAccountingDriverExpenses();}document.getElementById("driverExpensesSection")?.scrollIntoView({behavior:"smooth",block:"start"});}catch(e){alert(e.message);}}


async function adminToolsPage(c){
  if(CURRENT_USER?.role!=="admin"){c.innerHTML=`<div class="panel"><span class="error">${esc(L("Admin only","للمدير فقط"))}</span></div>`;return;}
  const adminPassword=await showInputModal(L("Enter Admin Password/PIN to open Admin Tools","أدخل كلمة مرور/PIN المدير لفتح أدوات المدير"));
  if(adminPassword===null){c.innerHTML=`<div class="panel"><span class="muted">${esc(L("Admin Tools is locked.","أدوات المدير مقفولة."))}</span></div>`;return;}
  try{
    await api('/api/settings/verify-admin',{method:'POST',body:JSON.stringify({admin_password:adminPassword})});
  }catch(e){c.innerHTML=`<div class="panel"><span class="error">${esc(e.message||L("Incorrect admin password","كلمة مرور المدير غير صحيحة"))}</span></div>`;return;}
  const b=COMPANY_BRANDING;
  c.innerHTML=`<h2>${L("Admin Tools","أدوات المدير")}</h2>
  <div class="panel admin-tools-panel admin-menu-entry-panel">
    <div class="admin-menu-entry">
      <div><h3>⚙️ ${L("Customize Menu","تخصيص القائمة")}</h3><p class="muted">${L("Reorder pages, move pages between folders, create folders, rename pages/folders, change icons, and save open/closed state.","رتّب الصفحات، انقلها بين المجلدات، أنشئ مجلدات، غيّر الأسماء والأيقونات، واحفظ حالة الفتح والقفل.")}</p></div>
      <button type="button" class="primary" onclick="openCustomizeMenu()">${L("Customize Menu","تخصيص القائمة")}</button>
    </div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🖥️ ${L("Admin Device Usage","متابعة أجهزة حسابات المستخدمين")}</h3>
    <p class="muted">${L("View distinct browser/device fingerprints and last login time. Tracking begins after this feature is enabled.","عرض عدد بصمات الأجهزة/المتصفحات ووقت آخر دخول. يبدأ التسجيل من تفعيل الميزة.")}</p>
    <div class="actions"><button type="button" class="primary" onclick="loadAdminDeviceUsage()">${L("Refresh Device Usage","تحديث بيانات الأجهزة")}</button></div>
    <div id="adminDeviceUsageBox"><span class="muted">${L("Press Refresh to load device usage.","اضغط تحديث لعرض بيانات الأجهزة.")}</span></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🚨 ${L("Suspicious Activity Alerts","تنبيهات النشاط المشبوه")}</h3>
    <p class="muted">${L("New-device logins and repeated failed login attempts.","تسجيل الدخول من جهاز جديد ومحاولات الدخول الفاشلة المتكررة.")}</p>
    <div class="actions"><button type="button" class="primary" onclick="loadAdminSecurityMonitor()">${L("Refresh Alerts","تحديث التنبيهات")}</button></div>
    <div id="adminSuspiciousActivityBox"><span class="muted">${L("Press Refresh to load alerts.","اضغط تحديث لعرض التنبيهات.")}</span></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🛠️ ${L("System & Backup Monitor","مراقبة النظام والنسخ الاحتياطي")}</h3>
    <p class="muted">${L("Backup status, server process and recorded system errors.","حالة النسخ الاحتياطي وتشغيل النظام والأخطاء المسجلة.")}</p>
    <div class="actions"><button type="button" class="primary" onclick="loadAdminSecurityMonitor()">${L("Refresh System Monitor","تحديث مراقبة النظام")}</button></div>
    <div id="adminSystemMonitorBox"><span class="muted">${L("Press Refresh to load system status.","اضغط تحديث لعرض حالة النظام.")}</span></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🗑️ ${L("Delete Orders","حذف الأوردرات")}</h3>
    <p class="muted">${L("Permanent deletion is protected by Admin authentication and confirmation.","الحذف نهائي ومحمي بتأكيد وصلاحيات المدير.")}</p>
    <button class="danger" onclick="showOrderDeleteTool('admin')">🗑 ${L("Delete Orders","حذف الأوردرات")}</button>
    <div id="adminToolsDeleteBox"></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🗃 ${L("Order Archive","أرشفة الأوردرات")}</h3>
    <p class="muted">${L("Move orders out of the active system, or review and restore archived orders.","نقل الأوردرات خارج النظام النشط، أو مراجعة الأوردرات المؤرشفة واسترجاعها.")}</p>
    <div class="actions"><button type="button" class="danger" onclick="showOrderDeleteTool('admin')">🗃 ${L("Archive Orders","أرشفة الأوردرات")}</button><button type="button" class="ghost" onclick="showDeletedOrdersArchive()">📦 ${L("Deleted Orders","الأوردرات المحذوفة")}</button></div>
    <div id="adminToolsArchiveBox"></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🏢 ${L("Company Identity","هوية الشركة")}</h3>
    <label>${L("Company Name","اسم الشركة")}<input id="adminCompanyName" value="${esc(b.name||"")}"></label>
    <div class="actions"><button onclick="saveAdminCompanyName()">${L("Save Name","حفظ الاسم")}</button></div>
    <div class="admin-logo-row"><img id="adminLogoPreview" src="${esc(b.logo_url||"/trend-logo.jpeg")}" alt="Logo"><input id="adminLogoFile" type="file" accept="image/png,image/jpeg,image/webp"><button class="ghost" onclick="saveAdminCompanyLogo()">${L("Change Logo","تغيير اللوجو")}</button></div>
    <div id="adminBrandMsg" class="msg"></div>
  </div>
  <div class="panel admin-tools-panel">
    <h3>🔑 ${L("Change Password","تغيير كلمة المرور")}</h3>
    <div class="form-grid">
      <label>${L("Current Password","كلمة المرور الحالية")}<input id="adminCurrentPassword" type="password" autocomplete="current-password"></label>
      <label>${L("New Password","كلمة المرور الجديدة")}<input id="adminNewPassword" type="password" autocomplete="new-password"></label>
      <label>${L("Confirm New Password","تأكيد كلمة المرور الجديدة")}<input id="adminConfirmPassword" type="password" autocomplete="new-password"></label>
    </div>
    <button onclick="changeAdminPassword()">${L("Save Password","حفظ كلمة المرور")}</button><div id="adminPassMsg" class="msg"></div>
  </div>`;
}

async function saveAdminCompanyName(){
  try{
    const name=$("adminCompanyName")?.value.trim(); if(!name)return msg("adminBrandMsg",L("Company name is required","اسم الشركة مطلوب"),"error");
    const adminPassword=await showInputModal(L("Enter Admin Password/PIN","أدخل كلمة مرور/PIN المدير")); if(adminPassword===null)return;
    const saved=await api("/api/settings/company-name",{method:"PATCH",body:JSON.stringify({name,admin_password:adminPassword})});
    if(saved?.success!==true)throw new Error(saved?.error||L("Server did not confirm the save","السيرفر لم يؤكد الحفظ"));
    // Never show success based only on the PATCH response: read branding independently and compare it.
    const check=await api("/api/settings/branding",{method:"GET"});
    const actual=String(check?.data?.name||"").trim();
    if(actual!==name)throw new Error(L(`Save was reported, but a fresh read returned "${actual||"(empty)"}" instead of "${name}". Check the deployed server build and company record/RLS.`,`السيرفر أبلغ عن النجاح لكن إعادة القراءة رجّعت "${actual||"(فارغ)"}" بدلًا من "${name}". راجع نسخة السيرفر المنشورة وسجل الشركة وصلاحيات قاعدة البيانات.`));
    COMPANY_BRANDING={...COMPANY_BRANDING,...check.data};
    applyCompanyBrandingToPage(COMPANY_BRANDING);
    const title=$("adminCompanyName");if(title)title.value=actual;
    msg("adminBrandMsg",L("Company name saved and verified","تم حفظ اسم الشركة والتحقق منه"),"ok");
  }catch(e){msg("adminBrandMsg",e.message,"error");}
}
async function saveAdminCompanyLogo(){
  const file=$("adminLogoFile")?.files?.[0];if(!file)return msg("adminBrandMsg",L("Choose a logo first","اختر اللوجو أولاً"),"error");
  try{
    const adminPassword=await showInputModal(L("Enter Admin Password/PIN","أدخل كلمة مرور/PIN المدير")); if(adminPassword===null)return;
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const saved=await api("/api/settings/company-logo",{method:"POST",body:JSON.stringify({data,admin_password:adminPassword})});
    if(saved?.success!==true)throw new Error(saved?.error||L("Server did not confirm the save","السيرفر لم يؤكد الحفظ"));
    // Confirm the logo URL from a separate fresh read before updating the preview or showing success.
    const check=await api("/api/settings/branding",{method:"GET"});
    const actual=String(check?.data?.logo_url||"").trim();
    const reported=String(saved?.data?.logo_url||"").trim();
    if(!actual||!reported||actual!==reported)throw new Error(L(`Save was reported, but a fresh read did not match the saved logo URL. Check the deployed server build, storage bucket, and company record/RLS.`,`السيرفر أبلغ عن النجاح لكن رابط اللوجو في إعادة القراءة لا يطابق الرابط المحفوظ. راجع نسخة السيرفر المنشورة وBucket التخزين وسجل الشركة وصلاحيات قاعدة البيانات.`));
    COMPANY_BRANDING={...COMPANY_BRANDING,...check.data};
    applyCompanyBrandingToPage(COMPANY_BRANDING);
    const p=$("adminLogoPreview");if(p){p.onerror=()=>{p.onerror=null;p.src="/trend-logo.jpeg";};p.src=actual;}
    const f=$("adminLogoFile");if(f)f.value="";
    msg("adminBrandMsg",L("Logo saved and verified","تم حفظ اللوجو والتحقق منه"),"ok");
  }catch(e){msg("adminBrandMsg",e.message,"error");}
}
async function changeAdminPassword(){
  const body={current_password:$("adminCurrentPassword")?.value||"",new_password:$("adminNewPassword")?.value||"",confirm_password:$("adminConfirmPassword")?.value||""};
  try{await api("/api/settings/change-password",{method:"POST",body:JSON.stringify(body)});msg("adminPassMsg",L("Password changed. Please log in again.","تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى."),"ok");setTimeout(()=>logout(),900);}catch(e){msg("adminPassMsg",e.message,"error");}
}

let BACKUP_SCHEDULE_EMAIL = '';
async function backupRestorePage(c){
  if(!canAccessPage('backupRestore')){c.innerHTML=`<div class="panel"><h2>${L('Backup & Restore','نسخ احتياطي واستعادة')}</h2><p class="msg error">${L('Backup permission required.','تحتاج إلى تفعيل صلاحية النسخ الاحتياطي.')}</p></div>`;return;}
  c.innerHTML=`<div class="panel"><h2>${L('Backup & Restore','نسخ احتياطي واستعادة')}</h2><p class="muted">${L('Create a JSON backup of supported business data. Export stops and reports errors if a table cannot be read. Password hashes and secrets are excluded.','أنشئ نسخة JSON من بيانات التشغيل. يعرض التصدير أخطاء الجداول ولا يخفيها. يتم استبعاد كلمات المرور والأسرار.')}</p><div class="actions"><button id="createBackupBtn" type="button" onclick="downloadApplicationBackup()">⬇ ${L('Download Backup','تنزيل نسخة احتياطية')}</button></div><div class="accounting-section-divider"></div><h3>${L('Email a backup','إرسال النسخة إلى البريد')}</h3><label>${L('Recipient email','البريد الإلكتروني المستلم')}<input id="backupEmailRecipient" type="email" autocomplete="off" placeholder=""></label><p class="muted">${L('Requires SMTP mail settings on the hosting server. Backup is sent as a JSON attachment.','يتطلب ضبط SMTP في الاستضافة. يتم إرسال النسخة كمرفق JSON.')}</p><button id="emailBackupBtn" type="button" onclick="emailApplicationBackup()">${L('Send backup by email','إرسال النسخة بالبريد')}</button><div class="accounting-section-divider"></div><h3>${L('Automatic backup schedule','جدول النسخ الاحتياطي التلقائي')}</h3><label>${L('Frequency','التكرار')}<select id="backupFrequency" onchange="updateBackupScheduleDayOptions()"><option value="weekly">${L('Weekly','أسبوعي')}</option><option value="monthly">${L('Monthly','شهري')}</option></select></label><label>${L('Day','اليوم')}<select id="backupScheduleDay"></select></label><label>${L('Hour (server local time)','الساعة (توقيت الخادم)')}<select id="backupScheduleHour">${Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('')}</select></label><label class="inline-check"><input type="checkbox" id="backupScheduleEnabled"> ${L('Enable automatic email backup','تفعيل النسخ التلقائي بالبريد')}</label><button id="saveBackupScheduleBtn" type="button" onclick="saveBackupSchedule()">${L('Save schedule','حفظ الجدول')}</button><p class="muted">${L('Requires SMTP. The server must remain running; scheduled sending is checked hourly.','يتطلب SMTP وبقاء الخادم يعمل؛ يتم فحص موعد الإرسال كل ساعة.')}</p><div id="backupScheduleStatus" class="msg" aria-live="polite"></div><div class="accounting-section-divider"></div><h3>${L('Restore Backup','استعادة نسخة احتياطية')}</h3><label>${L('Select backup JSON file','اختر ملف النسخة الاحتياطية JSON')}<input id="restoreBackupFile" type="file" accept="application/json,.json"></label><p class="muted">${L('Restore merges matching records and does not delete records absent from the file. Download a fresh backup before restoring.','الاستعادة تدمج السجلات المطابقة ولا تحذف السجلات غير الموجودة بالملف. نزّل نسخة حديثة قبل الاستعادة.')}</p><button id="restoreBackupBtn" class="danger" type="button" onclick="restoreApplicationBackup()">${L('Restore Backup','استعادة النسخة')}</button><div id="backupRestoreMsg" class="msg" aria-live="polite"></div></div>`;
  if($('backupEmailRecipient'))$('backupEmailRecipient').value='';
  updateBackupScheduleDayOptions();try{const cfg=await api('/api/settings/backup-schedule');BACKUP_SCHEDULE_EMAIL=String(cfg.email||'');$('backupFrequency').value=cfg.frequency||'weekly';updateBackupScheduleDayOptions(cfg.day);$('backupScheduleHour').value=String(cfg.hour??2);$('backupScheduleEnabled').checked=!!cfg.enabled;const status=$('backupScheduleStatus');if(status){const smtp=cfg.smtp_configured?L('SMTP configured','SMTP مضبوط'):L('SMTP NOT configured — automatic email backups cannot run','SMTP غير مضبوط — النسخ التلقائي بالبريد لن يعمل');const enabled=cfg.enabled?L('Automatic backup: ON','النسخ التلقائي: مفعّل'):L('Automatic backup: OFF','النسخ التلقائي: متوقف');const last=cfg.last_run_at?`${L('Last successful backup','آخر نسخة ناجحة')}: ${esc(formatSystemDate(cfg.last_run_at))}`:L('No successful scheduled backup recorded yet','لا توجد نسخة تلقائية ناجحة مسجلة حتى الآن');status.className='msg '+(cfg.enabled&&cfg.smtp_configured&&cfg.last_run_at?'ok':'');status.innerHTML=`${esc(enabled)} · ${esc(smtp)}<br>${last}${cfg.last_error?`<br>${L('Last error','آخر خطأ')}: ${esc(cfg.last_error)}`:''}`;}}catch(e){msg('backupRestoreMsg',e.message,'error');}
}

function updateBackupScheduleDayOptions(selected){const f=$('backupFrequency')?.value||'weekly',el=$('backupScheduleDay');if(!el)return;const old=selected!==undefined?String(selected):el.value;const items=f==='weekly'?[['0','Sunday','الأحد'],['1','Monday','الإثنين'],['2','Tuesday','الثلاثاء'],['3','Wednesday','الأربعاء'],['4','Thursday','الخميس'],['5','Friday','الجمعة'],['6','Saturday','السبت']]:Array.from({length:28},(_,i)=>[String(i+1),String(i+1),String(i+1)]);el.innerHTML=items.map(x=>`<option value="${x[0]}">${LANG==='ar'?x[2]:x[1]}</option>`).join('');if(items.some(x=>x[0]===old))el.value=old;}
async function saveBackupSchedule(){const b=$('saveBackupScheduleBtn');if(b)b.disabled=true;try{const email=$('backupEmailRecipient')?.value?.trim()||BACKUP_SCHEDULE_EMAIL||'',frequency=$('backupFrequency')?.value||'weekly',day=Number($('backupScheduleDay')?.value||0),hour=Number($('backupScheduleHour')?.value||2),enabled=!!$('backupScheduleEnabled')?.checked;const d=await api('/api/settings/backup-schedule',{method:'POST',body:JSON.stringify({email,frequency,day,hour,enabled})});BACKUP_SCHEDULE_EMAIL=email;msg('backupRestoreMsg',d.message||L('Schedule saved','تم حفظ الجدول'),'ok');}catch(e){msg('backupRestoreMsg',e.message,'error');}finally{if(b)b.disabled=false;}}
async function downloadApplicationBackup(){const b=$('createBackupBtn');if(b)b.disabled=true;try{const d=await api('/api/settings/backup');if(!d||d.format!=='trend-delivery-backup-v2'||!d.success)throw new Error(d?.error||L('Backup incomplete; check table errors before using it.','النسخة غير مكتملة؛ راجع أخطاء الجداول قبل استخدامها.'));const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`trend-delivery-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);msg('backupRestoreMsg',L('Backup downloaded. Store it securely.','تم تنزيل النسخة الاحتياطية. احتفظ بها في مكان آمن.'),'ok');}catch(e){msg('backupRestoreMsg',e.message,'error');}finally{if(b)b.disabled=false;}}
async function emailApplicationBackup(){const b=$('emailBackupBtn'),email=$('backupEmailRecipient')?.value?.trim()||'';if(!email)return msg('backupRestoreMsg',L('Enter a recipient email address.','اكتب البريد الإلكتروني المستلم.'),'error');if(b)b.disabled=true;try{const d=await api('/api/settings/backup-email',{method:'POST',body:JSON.stringify({email})});msg('backupRestoreMsg',d.message||L('Backup email sent.','تم إرسال النسخة بالبريد.'),'ok');}catch(e){msg('backupRestoreMsg',e.message,'error');}finally{if(b)b.disabled=false;}}
async function restoreApplicationBackup(){const f=$('restoreBackupFile')?.files?.[0];if(!f)return msg('backupRestoreMsg',L('Choose a backup file first','اختر ملف النسخة الاحتياطية أولاً'),'error');if(f.size>100*1024*1024)return msg('backupRestoreMsg',L('Backup file exceeds the 100 MB upload limit.','حجم ملف النسخة يتجاوز حد الرفع 100 ميجابايت.'),'error');if(!await showConfirmModal(L('Restore this backup? Matching records may be overwritten. Download a fresh backup first.','هل تريد استعادة النسخة؟ قد يتم استبدال السجلات المطابقة. نزّل نسخة حديثة أولاً.')))return;const b=$('restoreBackupBtn');if(b)b.disabled=true;try{const backup=JSON.parse(await f.text()),d=await api('/api/settings/restore',{method:'POST',body:JSON.stringify(backup)}),results=d.results||[],ok=results.filter(x=>x.status==='restored').length,failed=results.filter(x=>['failed','skipped'].includes(x.status)),detail=failed.map(x=>`${x.table}: ${x.reason||x.status}`).join(' | ');msg('backupRestoreMsg',`${d.message||''} — ${L('tables restored','جداول تمت استعادتها')}: ${ok}${detail?' — '+detail:''}`,d.success?'ok':'error');}catch(e){msg('backupRestoreMsg',e.message,'error');}finally{if(b)b.disabled=false;}}async function liveDriversMapPage(c){
  c.innerHTML=`<div class="panel"><h2>${L('Drivers Map','خريطة المندوبين')}</h2><p class="muted">${L('This map shows only GPS coordinates that drivers have explicitly shared with the system. Location permission and HTTPS are required.','الخريطة تعرض فقط إحداثيات GPS التي شاركها المندوبون صراحةً مع النظام. يلزم HTTPS وموافقة الموقع.')}</p>${CURRENT_USER?.role==='driver'?`<div class="actions"><button type="button" id="startDriverGps" onclick="startDriverGpsSharing()">${L('Start sharing my GPS','بدء مشاركة موقعي')}</button><button class="ghost" type="button" onclick="stopDriverGpsSharing()">${L('Stop sharing','إيقاف مشاركة الموقع')}</button></div>`:''}<div id="driversMapNotice" class="msg">${L('Checking location data…','جارٍ فحص بيانات المواقع…')}</div>${CURRENT_USER?.role==='driver'?`<p class="muted" id="driverGpsLastSent">${L('Last GPS update: not sent yet','آخر تحديث GPS: لم يتم الإرسال بعد')}</p>`:''}<div id="driversMap" style="height:480px;min-height:320px;border-radius:12px;overflow:hidden;background:var(--panel);border:1px solid var(--border)"></div><div class="actions" style="margin-top:10px"><button type="button" class="ghost" onclick="refreshDriversMapLocations()">${L('Refresh locations','تحديث المواقع')}</button><span id="driversMapRefreshedAt" class="muted"></span></div><div id="driversMapRows" class="table-wrap" style="margin-top:12px"></div></div>`;
  ensureDriversMapAutoRefresh();
  try{await loadLeafletOnce();const d=await api('/api/drivers/locations');const rows=d.data||[];if(!rows.length){msg('driversMapNotice',L('No driver GPS locations have been shared yet. This page does not generate fake positions.','لم تتم مشاركة مواقع GPS للمندوبين حتى الآن. الصفحة لا تعرض مواقع وهمية.'),'');return;}const map=LMap.map('driversMap').setView([rows[0].latitude,rows[0].longitude],10);LMap.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);rows.forEach(r=>LMap.marker([r.latitude,r.longitude]).addTo(map).bindPopup(`${esc(r.driver_name||'Driver')} — ${esc(r.driver_no||'')}<br>${esc(r.recorded_at||'')}`));if(rows.length>1)map.fitBounds(rows.map(r=>[r.latitude,r.longitude]),{padding:[25,25]});$('driversMapRows').innerHTML=`<table><thead><tr><th>${L('Driver','المندوب')}</th><th>${L('Phone','الهاتف')}</th><th>${L('Last location update','آخر تحديث للموقع')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.driver_name||'')} — ${esc(r.driver_no||'')}</td><td>${esc(r.phone||'')}</td><td>${esc(formatSystemDate(r.recorded_at||''))}</td></tr>`).join('')}</tbody></table>`;msg('driversMapNotice',L('Showing actual recorded driver locations.','يتم عرض مواقع المندوبين المسجلة فعليًا.'),'ok');}catch(e){msg('driversMapNotice',e.message,'error');}
}
let driversMapRefreshTimer=null;function ensureDriversMapAutoRefresh(){if(driversMapRefreshTimer)return;driversMapRefreshTimer=setInterval(async()=>{const map=document.querySelector('#driversMap');const parent=map?.closest('.panel')?.parentElement;if(!parent){clearInterval(driversMapRefreshTimer);driversMapRefreshTimer=null;return;}await liveDriversMapPage(parent);const label=document.getElementById('driversMapRefreshedAt');if(label)label.textContent=L('Last refreshed: ','آخر تحديث: ')+new Date().toLocaleTimeString();},30000);}
async function refreshDriversMapLocations(){const current=document.querySelector('#driversMap')?.closest('.panel');const host=current?.parentElement;if(!host)return;await liveDriversMapPage(host);const stamp=document.getElementById('driversMapRefreshedAt');if(stamp)stamp.textContent=L('Last refreshed: ','آخر تحديث: ')+new Date().toLocaleTimeString();ensureDriversMapAutoRefresh();}
let driverGpsWatchId=null,driverGpsLastSentAt=0,driverGpsLastCoords=null,driverGpsPostInFlight=false;
async function sendDriverGpsPosition(position,{force=false}={}){const now=Date.now(),coords=position?.coords;if(!coords||!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude))return false;if(driverGpsPostInFlight)return false;const moved=driverGpsLastCoords?Math.hypot((coords.latitude-driverGpsLastCoords.latitude)*111000,(coords.longitude-driverGpsLastCoords.longitude)*111000*Math.cos(coords.latitude*Math.PI/180)):Infinity;if(!force&&now-driverGpsLastSentAt<30000&&moved<100)return false;driverGpsPostInFlight=true;try{const d=await api('/api/drivers/location',{method:'POST',body:JSON.stringify({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy})});driverGpsLastSentAt=Date.now();driverGpsLastCoords={latitude:coords.latitude,longitude:coords.longitude};const recordedAt=d.recorded_at||new Date(driverGpsLastSentAt).toISOString();const label=document.getElementById('driverGpsLastSent');if(label)label.textContent=L('Last GPS update: ','آخر تحديث GPS: ')+formatSystemDate(recordedAt);return true;}finally{driverGpsPostInFlight=false;}}
async function startDriverGpsSharing(){if(!navigator.geolocation)return msg('driversMapNotice',L('GPS is not supported by this browser','المتصفح لا يدعم GPS'),'error');if(!window.isSecureContext)return msg('driversMapNotice',L('GPS sharing requires HTTPS','مشاركة GPS تحتاج HTTPS'),'error');if(driverGpsWatchId!==null)return msg('driversMapNotice',L('GPS sharing is already active.','مشاركة GPS مفعلة بالفعل.'),'');try{const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:5000}));await sendDriverGpsPosition(pos,{force:true});driverGpsWatchId=navigator.geolocation.watchPosition(async p=>{try{await sendDriverGpsPosition(p);}catch(e){console.warn('GPS update failed',e.message);msg('driversMapNotice',L('GPS update failed. Check your connection.','فشل تحديث GPS. تحقق من الاتصال.'),'error');}},e=>msg('driversMapNotice',e.message,'error'),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});msg('driversMapNotice',L('GPS sharing is active while this page remains open. The app may pause updates when backgrounded.','مشاركة GPS مفعلة طالما الصفحة مفتوحة. قد يتوقف التحديث عند انتقالها للخلفية.'),'ok');}catch(e){msg('driversMapNotice',e.message||L('Location permission was denied','تم رفض إذن الموقع'),'error');}}
function stopDriverGpsSharing(){if(driverGpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(driverGpsWatchId);driverGpsWatchId=null;msg('driversMapNotice',L('GPS sharing stopped on this device.','تم إيقاف مشاركة GPS على هذا الجهاز.'),'');}
if(!window.__driverGpsVisibilityHook){window.__driverGpsVisibilityHook=true;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&driverGpsWatchId!==null&&navigator.geolocation){navigator.geolocation.getCurrentPosition(async p=>{try{await sendDriverGpsPosition(p,{force:true});const n=document.getElementById('driversMapNotice');if(n)msg('driversMapNotice',L('GPS refreshed after returning to the app.','تم تحديث GPS بعد الرجوع للتطبيق.'),'ok');}catch(e){console.warn('GPS resume update failed',e.message);}},e=>console.warn('GPS resume position unavailable',e.message),{enableHighAccuracy:true,timeout:15000,maximumAge:0});}});}
let LMap=null;let leafletPromise=null;function loadLeafletOnce(){if(window.L)return Promise.resolve().then(()=>{LMap=window.L;});if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{if(!document.querySelector('link[data-leaflet]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.leaflet='1';document.head.appendChild(l);}const sc=document.createElement('script');sc.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';sc.onload=()=>{LMap=window.L;resolve();};sc.onerror=()=>reject(new Error(L('Map library could not be loaded','تعذر تحميل مكتبة الخريطة')));document.head.appendChild(sc);});return leafletPromise;}

async function saveSystemTimezone(){
  const select=$('settingsSystemTimezone'),button=$('saveSystemTimezoneBtn');
  const timezone=select?.value||'Africa/Cairo';
  if(button)button.disabled=true;
  try{
    const result=await api('/api/settings/system-timezone',{method:'PATCH',body:JSON.stringify({timezone})});
    setSystemTimeZone(result.data?.timezone||timezone);
    const preview=$('systemTimezoneDatePreview');if(preview)preview.textContent=today();
    msg('systemTimezoneMsg',result.message||L('System time zone saved. New default dates will use this time zone.','تم حفظ المنطقة الزمنية. ستستخدم التواريخ الافتراضية الجديدة هذا التوقيت.'),'ok');
    const pill=document.querySelector('.settings-timezone-pill');if(pill)pill.textContent=SYSTEM_TIME_ZONE==='Asia/Dubai'?'🇦🇪 UAE':'🇪🇬 Egypt';
  }catch(error){msg('systemTimezoneMsg',error.message||String(error),'error');}
  finally{if(button)button.disabled=false;}
}

async function settingsPage(c){
  const options=Object.values(CURRENCIES).map(cur=>`<option value="${cur.code}" ${cur.code===CURRENCY?"selected":""}>${cur.code} — ${LANG==="ar"?cur.nameAr:cur.nameEn} (${cur.symbol})</option>`).join("");
  c.innerHTML=`<h2>${t("Settings")}</h2><div class="panel settings-panel">
    <h3>${L("Order Management Tools","أدوات إدارة الأوردرات")}</h3>
    <div class="settings-tool-grid"><button class="ghost" onclick="showShipperImportTool()">⬆ ${L("Import Shipper Data","استيراد بيانات الشاحن")}</button><button class="ghost" onclick="showShipperRatesTool()">💰 ${L("Shipper Rates","أسعار الشحن")}</button><button class="ghost" onclick="showExternalOrderImportTool()">⬆ ${L("Import Orders Data","استيراد بيانات الأوردرات")}</button></div>
    <div id="settingsToolsBox"></div>
    <div class="accounting-section-divider"></div>
    ${CURRENT_USER?.role==='admin'?`<div class="accounting-section-divider"></div>
    <div class="section-title-row"><div><h3>🌐 ${L("System Time Zone","المنطقة الزمنية للنظام")}</h3><p class="muted">${L("Choose the country whose local date the system should use for default dates, date filters, and scheduling.","اختر الدولة التي يعتمد النظام على توقيتها في التاريخ الافتراضي وفلاتر التاريخ والجدولة.")}</p></div><span class="settings-timezone-pill">${SYSTEM_TIME_ZONE==='Asia/Dubai'?'🇦🇪 UAE':'🇪🇬 Egypt'}</span></div>
    <div class="settings-timezone-card"><label>${L("System country / time zone","دولة النظام / المنطقة الزمنية")}<select id="settingsSystemTimezone"><option value="Africa/Cairo" ${SYSTEM_TIME_ZONE==='Africa/Cairo'?'selected':''}>🇪🇬 ${L("Egypt — Cairo","مصر — القاهرة")}</option><option value="Asia/Dubai" ${SYSTEM_TIME_ZONE==='Asia/Dubai'?'selected':''}>🇦🇪 ${L("United Arab Emirates — Dubai","الإمارات العربية المتحدة — دبي")}</option></select></label><div class="settings-timezone-preview"><span>${L("Current system date","تاريخ النظام الحالي")}</span><strong id="systemTimezoneDatePreview">${today()}</strong><small>${L("Applies to future date defaults after saving; existing stored dates are not changed.","يُطبّق على التواريخ الافتراضية الجديدة بعد الحفظ، ولا يغيّر التواريخ المحفوظة سابقًا.")}</small></div><div class="actions"><button type="button" id="saveSystemTimezoneBtn" onclick="saveSystemTimezone()">${L("Save system time zone","حفظ المنطقة الزمنية")}</button></div><div id="systemTimezoneMsg" class="msg" aria-live="polite"></div></div>`:''}
    ${CURRENT_USER?.role==='admin'?`<div class="accounting-section-divider"></div>
    <div class="section-title-row"><div><h3>🏢 ${L("Company Identity","هوية الشركة")}</h3><p class="muted">${L("Update the company name and logo shown across the system and printed reports.","تعديل اسم الشركة واللوجو الظاهرين في النظام والتقارير المطبوعة.")}</p></div></div>
    <div class="settings-company-identity"><label>${L("Company Name","اسم الشركة")}<input id="adminCompanyName" value="${esc(COMPANY_BRANDING.name||'Delivery')}"></label>
    <div class="admin-logo-row"><img id="adminLogoPreview" src="${esc(COMPANY_BRANDING.logo_url||'/trend-logo.jpeg')}" alt="Company logo"><input id="adminLogoFile" type="file" accept="image/png,image/jpeg,image/webp"><button type="button" class="ghost" onclick="saveAdminCompanyLogo()">${L("Change Logo","تغيير اللوجو")}</button></div>
    <div class="actions"><button type="button" onclick="saveAdminCompanyName()">${L("Save Name","حفظ الاسم")}</button></div><div id="adminBrandMsg" class="msg" aria-live="polite"></div></div>`:''}
    <div class="accounting-section-divider"></div>
    <h3>${t("Currency")}</h3>
    <p class="muted">${L("Choose the currency used across the whole program. Amounts are stored in AED and converted for display/input.","اختر العملة المستخدمة في البرنامج بالكامل. يتم حفظ القيم الأساسية بالدرهم الإماراتي وتحويلها عند العرض والإدخال.")}</p>
    <label>${t("Display currency")}<select id="settingsCurrency">${options}</select></label>
    <p class="muted settings-note">${t("Exchange rates are based on AED")}. 1 AED = ${Object.values(CURRENCIES).map(cur=>`${cur.code} ${cur.rate}`).join(" · ")}</p>
    <div id="settingsMsg" class="msg"></div>
  </div>`;
  $("settingsCurrency")?.addEventListener("change",e=>{setCurrency(e.target.value);});
}

async function showDeletedOrdersArchive(q=''){
  if(CURRENT_USER?.role!=='admin')return;
  const box=$('adminToolsArchiveBox')||$('settingsToolsBox');if(!box)return;
  box.innerHTML=`<div class="panel deleted-orders-panel"><div class="section-title-row"><div><h3>📦 ${L('Deleted Orders','الأوردرات المحذوفة')}</h3><p class="muted">${L('Archived orders are hidden from normal searches and accounting. Restore an order or permanently delete it.','الأوردرات المؤرشفة لا تظهر في البحث العادي أو الحسابات. يمكنك استرجاع الأوردر أو حذفه نهائيًا.')}</p></div><button type="button" class="ghost mini-btn" onclick="showDeletedOrdersArchive($('deletedOrdersQuery')?.value||'')">↻ ${L('Refresh','تحديث')}</button></div><div class="row"><input id="deletedOrdersQuery" value="${esc(q)}" placeholder="${L('Order No. / Tracking / Customer','رقم الأوردر / الشحنة / العميل')}" onkeydown="if(event.key==='Enter'){event.preventDefault();showDeletedOrdersArchive(this.value)}"><button type="button" onclick="showDeletedOrdersArchive($('deletedOrdersQuery')?.value||'')">${L('Search','بحث')}</button></div><div id="deletedOrdersResults" class="table-wrap">${L('Loading…','جارٍ التحميل…')}</div></div>`;
  try{
    const d=await api('/api/settings/deleted-orders?q='+encodeURIComponent(q.trim()));const rows=d.data||[];const target=$('deletedOrdersResults');if(!target)return;
    target.innerHTML=rows.length?`<table class="compact-table"><thead><tr><th>${L('Deleted At','تاريخ الحذف')}</th><th>${L('Order No.','رقم الأوردر')}</th><th>${L('Tracking No.','رقم الشحنة')}</th><th>${L('Shipper','التاجر')}</th><th>${L('Customer','العميل')}</th><th>${L('Status','الحالة')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(formatSystemDate(r.deleted_at||''))}</td><td><b>${esc(r.order_no||'—')}</b></td><td><b>${esc(r.tracking_number||'—')}</b></td><td>${esc(r.merchant_name||'—')}</td><td>${esc(r.customer_name||'')}<br><small>${esc(r.customer_phone||'')}</small></td><td>${esc(r.status||'—')}</td><td><div class="actions"><button type="button" class="mini-btn" onclick="restoreArchivedOrder('${esc(r.id)}')">↩ ${L('Restore','استرجاع')}</button><button type="button" class="danger mini-btn" title="${L('Permanently delete','حذف نهائي')}" aria-label="${L('Permanently delete','حذف نهائي')}" onclick="permanentlyDeleteArchivedOrder('${esc(r.id)}')">🗑</button></div></td></tr>`).join('')}</tbody></table>`:`<p class="muted">${L('No deleted orders found.','لا توجد أوردرات محذوفة مطابقة.')}</p>`;
  }catch(e){const target=$('deletedOrdersResults');if(target)target.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;}
}
async function restoreArchivedOrder(archiveId){if(!await showConfirmModal(L('Restore this order to the active system?','استرجاع الأوردر إلى النظام؟')))return;const admin_password=await showInputModal(L('Enter Admin Password/PIN','أدخل كلمة مرور/PIN المدير'));if(admin_password===null)return;try{await api('/api/settings/deleted-orders/restore',{method:'POST',body:JSON.stringify({archive_id:archiveId,admin_password})});msg('deletedOrdersResults',L('Order restored successfully.','تم استرجاع الأوردر بنجاح.'),'ok');await showDeletedOrdersArchive($('deletedOrdersQuery')?.value||'');}catch(e){alert(e.message);}}
async function permanentlyDeleteArchivedOrder(archiveId){if(!await showConfirmModal(L('Permanently delete this archived order? This cannot be undone.','حذف الأوردر نهائيًا؟ لا يمكن التراجع عن ذلك.')))return;const admin_password=await showInputModal(L('Enter Admin Password/PIN','أدخل كلمة مرور/PIN المدير'));if(admin_password===null)return;try{await api('/api/settings/deleted-orders/permanent',{method:'POST',body:JSON.stringify({archive_id:archiveId,admin_password})});await showDeletedOrdersArchive($('deletedOrdersQuery')?.value||'');}catch(e){alert(e.message);}}

async function showOrderDeleteTool(target='admin'){const boxId=target==='admin'?'adminToolsDeleteBox':'settingsToolsBox';const b=$(boxId);if(!b)return;window.__deleteToolReturnPage=target==='admin'?'adminTools':'settings';b.innerHTML=`<div class="panel"><div class="section-title-row"><h3>${L('Order Management','إدارة الأوردرات')}</h3><div class="actions"><button type="button" class="ghost" onclick="showActiveOrderDeleteSearch()">${L('Active Orders','الأوردرات الحالية')}</button><button type="button" class="ghost" onclick="loadDeletedOrders()">🗃 ${L('Deleted Orders','الأوردرات المحذوفة')}</button></div></div><div id="deleteOrderToolBody"></div></div>`;showActiveOrderDeleteSearch();}
function showActiveOrderDeleteSearch(){const b=$('deleteOrderToolBody');if(!b)return;b.innerHTML=`<p class="muted">${L('Search by exact Tracking Number or Order No. Then select one or more orders to archive.','ابحث برقم التتبع أو رقم الأوردر، ثم حدد الأوردرات لنقلها للأرشيف.')}</p><div class="row"><input id="deleteOrderQuery" placeholder="Tracking Number / Order No."><button type="button" onclick="searchOrderForDelete()">${L('Search','بحث')}</button></div><div id="deleteOrderResults"></div>`;$('deleteOrderQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchOrderForDelete();}});}
async function loadDeletedOrders(){const b=$('deleteOrderToolBody');if(!b)return;const q=$('deletedOrderQuery')?.value.trim()||'';b.innerHTML=`<div class="row"><input id="deletedOrderQuery" value="${esc(q)}" placeholder="Tracking Number / Order No."><button type="button" onclick="loadDeletedOrders()">${L('Search','بحث')}</button><button type="button" class="ghost" onclick="showActiveOrderDeleteSearch()">${L('Back','رجوع')}</button></div><p class="muted">${L('Archived orders are hidden from normal system search. Restore an order to return it to the system, or permanently delete it with the trash icon.','الأوردرات المؤرشفة لا تظهر في البحث العادي. استرجع الأوردر لإعادته للنظام، أو احذفه نهائيًا من علامة السلة.')}</p><div id="deletedOrdersResults"><span class="muted">${L('Loading...','جاري التحميل...')}</span></div>`;try{const d=await api(`/api/settings/deleted-orders${q?'?q='+encodeURIComponent(q):''}`);const rows=d.data||[];const box=$('deletedOrdersResults');if(!rows.length){box.innerHTML=`<div class="msg">${L('No deleted orders found','لا توجد أوردرات محذوفة مطابقة')}</div>`;return;}box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Tracking</th><th>Order No.</th><th>${L('Shipper','التاجر')}</th><th>${L('Customer','العميل')}</th><th>${L('Status','الحالة')}</th><th>${L('Deleted At','تاريخ الحذف')}</th><th>${L('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.tracking_number||'')}</td><td>${esc(r.order_no||'')}</td><td>${esc(r.merchant_name||'')}</td><td>${esc(r.customer_name||'')}<br>${esc(r.customer_phone||'')}</td><td>${esc(r.status||'')}</td><td>${esc(r.deleted_at?new Date(r.deleted_at).toLocaleString():'')}</td><td><div class="actions" style="display:flex;gap:6px;align-items:center"><button type="button" class="ghost" title="${L('Restore','استرجاع')}" aria-label="${L('Restore','استرجاع')}" onclick="restoreDeletedOrder('${esc(r.id)}')">↩️</button><button type="button" class="danger" title="${L('Permanently delete','حذف نهائي')}" aria-label="${L('Permanently delete','حذف نهائي')}" onclick="permanentlyDeleteArchivedOrder('${esc(r.id)}','${esc(r.order_no||r.tracking_number||r.id)}')">🗑️</button></div></td></tr>`).join('')}</tbody></table></div>`;}catch(e){$('deletedOrdersResults').innerHTML=`<div class="msg error">${esc(e.message||String(e))}</div>`;}}
async function restoreDeletedOrder(archiveId){if(!await showConfirmModal(L('Restore this order to the active system?','هل تريد استرجاع الأوردر إلى النظام؟')))return;const adminPassword=await showInputModal(L('Enter Admin Password/PIN','أدخل كلمة مرور/PIN المدير'));if(adminPassword===null)return;try{await api('/api/settings/deleted-orders/restore',{method:'POST',body:JSON.stringify({archive_id:archiveId,admin_password:adminPassword})});alert(L('Order restored successfully','تم استرجاع الأوردر بنجاح'));await loadDeletedOrders();}catch(e){alert(e.message||String(e));}}
async function permanentlyDeleteArchivedOrder(archiveId,label){if(!await showConfirmModal(L(`Permanently delete archived order ${label}? This cannot be undone.`,`حذف الأوردر ${label} نهائيًا؟ لا يمكن التراجع عن ذلك.`)))return;const adminPassword=await showInputModal(L('Enter Admin Password/PIN','أدخل كلمة مرور/PIN المدير'));if(adminPassword===null)return;try{await api('/api/settings/deleted-orders/permanent',{method:'POST',body:JSON.stringify({archive_id:archiveId,admin_password:adminPassword})});alert(L('Order permanently deleted','تم حذف الأوردر نهائيًا'));await loadDeletedOrders();}catch(e){alert(e.message||String(e));}}
async function searchOrderForDelete(){const q=$('deleteOrderQuery')?.value.trim();if(!q)return;try{const d=await api('/api/settings/delete-order',{method:'POST',body:JSON.stringify({query:q})});const rows=d.results||[];const box=$('deleteOrderResults');if(!rows.length){box.innerHTML=`<div class="msg error">${L('No exact order found','لم يتم العثور على أوردر مطابق بالضبط')}</div>`;return;}box.innerHTML=`<div class="panel delete-order-results-panel"><div class="section-title-row"><div><h3>${L('Search Results','نتيجة البحث')}</h3><p class="muted">${L('Select one or more orders to move to Deleted Orders.','حدد أوردرًا أو أكثر لنقلها إلى الأوردرات المحذوفة.')}</p></div><span class="history-count">${rows.length}</span></div><div class="actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="deleteOrderSelectAll" onchange="toggleDeleteOrderSelection(this)"> ${L('Select All','تحديد الكل')}</label><span id="deleteOrderSelectedCount" class="muted">0</span></div><div class="table-wrap"><table><thead><tr><th>${L('Select','اختيار')}</th><th>Tracking</th><th>Order No.</th><th>${L('Shipper','التاجر')}</th><th>${L('Customer','العميل')}</th><th>${L('Status','الحالة')}</th></tr></thead><tbody>${rows.map(r=>{const label=r.tracking_number||r.order_no||r.merchant_order_no||r.id;return `<tr><td><input class="delete-order-check" type="checkbox" value="${esc(r.id)}" data-label="${esc(label)}" onchange="updateDeleteOrderSelection()"></td><td>${esc(r.tracking_number||'')}</td><td>${esc(r.order_no||r.merchant_order_no||'')}</td><td>${esc(r.merchant_name?`${r.merchant_name}${r.merchant_no?` — ${r.merchant_no}`:''}`:r.merchant_id||'')}</td><td>${esc(r.customer_name||'')}<br>${esc(r.customer_phone||'')}</td><td>${esc(r.status||'')}</td></tr>`}).join('')}</tbody></table></div><div class="delete-order-action" style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="danger" type="button" onclick="deleteSelectedOrders()">🗃 ${L('Move Selected Orders to Archive','نقل الأوردرات المحددة للأرشيف')}</button></div></div>`;updateDeleteOrderSelection();}catch(e){$('deleteOrderResults').innerHTML=`<div class="msg error">${esc(e.message||String(e))}</div>`;}}
function getSelectedDeleteOrderChecks(){return [...document.querySelectorAll('.delete-order-check:checked')];}
function updateDeleteOrderSelection(){const checks=[...document.querySelectorAll('.delete-order-check')],selected=getSelectedDeleteOrderChecks(),all=$("deleteOrderSelectAll");if(all){all.checked=checks.length>0&&selected.length===checks.length;all.indeterminate=selected.length>0&&selected.length<checks.length;}const count=$("deleteOrderSelectedCount");if(count)count.textContent=`${L('Selected','المحدد')}: ${selected.length}`;}
function toggleDeleteOrderSelection(master){document.querySelectorAll('.delete-order-check').forEach(x=>x.checked=!!master.checked);updateDeleteOrderSelection();}
async function deleteSelectedOrders(){const picks=getSelectedDeleteOrderChecks();if(!picks.length){alert(L('Select at least one order first','حدد أوردرًا واحدًا على الأقل أولاً'));return;}await confirmDeleteOrders(picks.map(x=>({id:x.value,label:x.dataset.label||x.value})));}
async function deleteSelectedOrder(){return deleteSelectedOrders();}
async function confirmDeleteOrders(items){if(!items.length)return;if(!await showConfirmModal(L(`Move ${items.length} selected order(s) to Deleted Orders? They will disappear from the active system and can be restored later.`,`نقل ${items.length} أوردر إلى الأرشيف؟ ستختفي من النظام ويمكن استرجاعها لاحقًا.`)))return;const adminPassword=await showInputModal(L("Enter Admin Password/PIN","أدخل كلمة مرور/PIN المدير"));if(adminPassword===null)return;try{await api('/api/settings/delete-order',{method:'POST',body:JSON.stringify({order_ids:items.map(x=>x.id),query:items.map(x=>x.label).join(', '),confirm:true,admin_password:adminPassword})});alert(L(`${items.length} order(s) moved to Deleted Orders`,`تم نقل ${items.length} أوردر إلى الأرشيف`));await show(window.__deleteToolReturnPage||'adminTools');}catch(e){alert(e.message);}}
async function confirmDeleteOrder(id,label){return confirmDeleteOrders([{id,label}]);}
function showShipperImportTool(){const b=$("settingsToolsBox");if(!b)return;b.innerHTML=`<div class="panel"><h3>${L('Import Shipper Data','استيراد بيانات التجار')}</h3><p class="muted">${L('Excel columns: Shipper Name, Old Code, Phone, Address. New Trend code is generated automatically.','أعمدة Excel: اسم التاجر، الكود القديم، الهاتف، العنوان. يتم إنشاء كود Trend تلقائيًا.')}</p><input id="shipperImportFile" type="file" accept=".xlsx,.xls,.csv"><button onclick="importShipperData()">${L('Import','استيراد')}</button><div id="shipperImportMsg" class="msg"></div></div>`;}
async function importShipperData(){const f=$("shipperImportFile")?.files?.[0];if(!f)return;try{const rows=XLSX.utils.sheet_to_json(XLSX.read(await f.arrayBuffer(),{type:'array'}).Sheets[XLSX.read(await f.arrayBuffer(),{type:'array'}).SheetNames[0]],{defval:''});const d=await api('/api/settings/import-shippers',{method:'POST',body:JSON.stringify({rows})});msg('shipperImportMsg',L(`Imported ${d.imported||0} shippers`,`تم استيراد ${d.imported||0} تاجر`),'ok');}catch(e){msg('shipperImportMsg',e.message,'error');}}
async function showShipperRatesTool(targetId='settingsToolsBox'){
 const b=$(targetId);if(!b)return;
 const [m,g,a,h]=await Promise.all([api('/api/merchants'),api('/api/governorates'),api('/api/areas'),api('/api/shipper-rates/history')]); const merchants=m.data||[],govs=g.data||[],areas=a.data||[];
 b.innerHTML=`<div class="panel"><h3>💰 ${L('Shipper Rates','أسعار الشحن')}</h3><div class="form-grid">
 <label>${L('Shipper','الشاحن')}<select id="srShipper">${merchants.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.merchant_no||'')}</option>`).join('')}</select></label>
 <label>${L('Emirate','الإمارة')}<select id="srGov"><option value="">${L('Default Rate','السعر الافتراضي')}</option>${govs.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('')}</select></label>
 <label>${L('Area','المنطقة')}<select id="srArea"><option value="">${L('All Areas','كل المناطق')}</option></select></label>
 <label>${L('Delivery Rate','سعر التوصيل')}<input id="srDelivery" type="number" min="0" step="0.01"></label>
 <label>${L('COD Rate','سعر COD')}<input id="srCod" type="number" min="0" step="0.01"></label>
 <label>${L('Effective Date','تاريخ التطبيق')}<input id="srDate" type="date" value="${today()}"></label>
 <label>${L('Status','الحالة')}<select id="srStatus"><option>Active</option><option>Inactive</option></select></label>
 <label><span>${L('Default Rate','السعر الافتراضي')} <input id="srDefault" type="checkbox"></span></label></div>
 <div class="actions"><button onclick="saveShipperRate()">${L('Add Rate','إضافة سعر')}</button><input id="srFile" type="file" accept=".xlsx,.xls,.csv"><button class="ghost" onclick="importShipperRatesExcel()">⬆ ${L('Import Excel','استيراد Excel')}</button></div><div id="srMsg" class="msg"></div></div>
 <div class="panel"><div class="row"><h3>${L('Current Rates','الأسعار الحالية')}</h3><input id="srSearch" placeholder="${L('Search Shipper / Emirate / Area','بحث بالشاحن / الإمارة / المنطقة')}" oninput="filterShipperRates()"></div><div id="srTable"></div></div>
 <div class="panel"><h3>${L('Rate History','سجل تغييرات الأسعار')}</h3><div class="table-wrap"><table><thead><tr><th>Shipper</th><th>Old Rate</th><th>New Rate</th><th>Old COD</th><th>New COD</th><th>Effective</th><th>Changed By</th></tr></thead><tbody>${(h.data||[]).map(x=>`<tr><td>${esc(x.merchant_id||'')}</td><td>${money(x.old_rate||0)}</td><td>${money(x.new_rate||0)}</td><td>${money(x.old_cod_rate||0)}</td><td>${money(x.new_cod_rate||0)}</td><td>${esc(String(x.effective_date||'').slice(0,10))}</td><td>${esc(x.changed_by||'')}</td></tr>`).join('')}</tbody></table></div></div>`;
 window.__shipperRates=await api('/api/shipper-rates'); renderShipperRates();
 $('srGov').onchange=()=>{const gid=$('srGov').value;const opts=areas.filter(x=>!gid||String(x.governorate_id)===String(gid));$('srArea').innerHTML='<option value="">'+L('All Areas','كل المناطق')+'</option>'+opts.map(x=>`<option value="${esc(x.id)}">${esc(L(x.name_en,x.name_ar))}</option>`).join('');}; $('srGov').onchange();
}
function renderShipperRates(){const box=$('srTable'),rows=window.__shipperRates?.data||[],q=String($('srSearch')?.value||'').toLowerCase();const filtered=rows.filter(r=>[r.merchant?.name,r.governorate?.name_ar,r.governorate?.name_en,r.area?.name_ar,r.area?.name_en].some(v=>String(v||'').toLowerCase().includes(q)));box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Shipper</th><th>Emirate</th><th>Area</th><th>Delivery</th><th>COD</th><th>Status</th><th>Effective</th><th>Actions</th></tr></thead><tbody>${filtered.map(r=>`<tr><td>${esc(r.merchant?.name||r.merchant_id)}</td><td>${esc(r.governorate?L(r.governorate.name_en,r.governorate.name_ar):'Default')}</td><td>${esc(r.area?L(r.area.name_en,r.area.name_ar):'All')}</td><td>${money(r.delivery_rate)}</td><td>${money(r.cod_rate)}</td><td>${esc(r.status)}</td><td>${esc(String(r.effective_date||'').slice(0,10))}</td><td><button class="mini-btn ghost" onclick="editShipperRate('${esc(r.id)}')">✎</button> <button class="mini-btn danger" onclick="deleteShipperRate('${esc(r.id)}')">×</button></td></tr>`).join('')}</tbody></table></div>`;}
function filterShipperRates(){renderShipperRates();}
async function saveShipperRate(){try{const body={merchant_id:$('srShipper').value,governorate_id:$('srGov').value||null,area_id:$('srArea').value||null,delivery_rate:baseAmount($('srDelivery').value||0),cod_rate:baseAmount($('srCod').value||0),effective_date:$('srDate').value,status:$('srStatus').value,is_default:$('srDefault').checked};const d=await api('/api/shipper-rates',{method:'POST',body:JSON.stringify(body)});msg('srMsg',L('Rate saved','تم حفظ السعر'),'ok');window.__shipperRates=await api('/api/shipper-rates');renderShipperRates();}catch(e){msg('srMsg',e.message,'error');}}
async function editShipperRate(id){const r=(window.__shipperRates?.data||[]).find(x=>x.id===id);if(!r)return;const rate=await showInputModal(L('Delivery Rate','سعر التوصيل'),moneyInput(r.delivery_rate));if(rate===null)return;const cod=await showInputModal(L('COD Rate','سعر COD'),moneyInput(r.cod_rate));if(cod===null)return;try{await api('/api/shipper-rates',{method:'PATCH',body:JSON.stringify({id,delivery_rate:baseAmount(rate),cod_rate:baseAmount(cod),status:r.status,effective_date:r.effective_date,is_default:r.is_default})});window.__shipperRates=await api('/api/shipper-rates');renderShipperRates();}catch(e){alert(e.message);}}
async function deleteShipperRate(id){if(!await showConfirmModal(L('Delete this rate?','حذف هذا السعر؟')))return;try{await api('/api/shipper-rates',{method:'DELETE',body:JSON.stringify({id})});window.__shipperRates=await api('/api/shipper-rates');renderShipperRates();}catch(e){alert(e.message);}}
async function importShipperRatesExcel(){const f=$('srFile')?.files?.[0];if(!f)return msg('srMsg',L('Choose an Excel file','اختر ملف Excel'),'error');try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});const d=await api('/api/shipper-rates/import',{method:'POST',body:JSON.stringify({rows})});msg('srMsg',`${L('Imported','تم الاستيراد')}: ${d.imported} — ${L('Skipped','تم التخطي')}: ${d.skipped}`,'ok');window.__shipperRates=await api('/api/shipper-rates');renderShipperRates();if(d.errors?.length)console.warn(d.errors);}catch(e){msg('srMsg',e.message,'error');}}

function showExternalOrderImportTool(){const b=$("settingsToolsBox");if(!b)return;b.innerHTML=`<div class="panel"><h3>${L('Import Orders Data','استيراد بيانات الأوردرات')}</h3><p class="muted">${L('Upload Excel and map common external columns. The system validates rows before import.','ارفع ملف Excel وسيتم التحقق من البيانات قبل الاستيراد.')}</p><input id="externalOrdersFile" type="file" accept=".xlsx,.xls,.csv"><button onclick="importExternalOrders()">${L('Preview / Import','معاينة / استيراد')}</button><div id="externalOrdersMsg" class="msg"></div></div>`;}
async function importExternalOrders(){const f=$("externalOrdersFile")?.files?.[0];if(!f)return;try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});const d=await api('/api/orders/import',{method:'POST',body:JSON.stringify({rows})});msg('externalOrdersMsg',L(`Imported ${d.imported||0} orders`,`تم استيراد ${d.imported||0} أوردر`),'ok');}catch(e){msg('externalOrdersMsg',e.message,'error');}}
async function auditPage(c){const d=await api("/api/audit");c.innerHTML=`<h2>${t("Audit Log")}</h2><div class="panel">${table(d.data||[],["action","entity_type","entity_id","created_at"])}</div>`;}

async function loadAdminSecurityMonitor() {
  const securityBox=$("adminSuspiciousActivityBox"), systemBox=$("adminSystemMonitorBox");
  if(securityBox) securityBox.innerHTML=`<span class="muted">${L("Loading…","جاري التحميل…")}</span>`;
  if(systemBox) systemBox.innerHTML=`<span class="muted">${L("Loading…","جاري التحميل…")}</span>`;
  try {
    const d=await api("/api/admin/security-monitor");
    const events=[...(d.suspicious||[]).map(x=>({...x,kind:"suspicious"})),...(d.failed_logins||[]).map(x=>({...x,kind:"failed"}))].sort((x,y)=>String(y.created_at||"").localeCompare(String(x.created_at||""))).slice(0,100);
    if(securityBox) securityBox.innerHTML=`<div class="table-wrap"><table><thead><tr><th>${L("Time","الوقت")}</th><th>${L("Event","الحدث")}</th><th>${L("Account","الحساب")}</th><th>IP</th><th>${L("Details","التفاصيل")}</th></tr></thead><tbody>${events.map(x=>{const z=x.details||{};const label=x.kind==="failed"?L("Failed login","محاولة دخول فاشلة"):(z.reason==="new_device_login"?L("New device login","دخول من جهاز جديد"):L("Suspicious activity","نشاط مشبوه"));return `<tr><td>${esc(x.created_at?new Date(x.created_at).toLocaleString():"—")}</td><td>${esc(label)}</td><td>${esc(z.username||z.user_id||"—")}</td><td>${esc(z.ip_address||"—")}</td><td>${esc(z.reason||"")}${z.attempts_in_15m?` · ${esc(z.attempts_in_15m)} ${L("attempts","محاولات")}`:""}</td></tr>`}).join("")||`<tr><td colspan="5">${L("No alerts recorded yet.","لا توجد تنبيهات مسجلة حتى الآن.")}</td></tr>`}</tbody></table></div>`;
    if(systemBox) {
      const b=d.backup||{}, sv=d.server||{}, errors=d.errors||[];
      systemBox.innerHTML=`<div class="table-wrap"><table><thead><tr><th>${L("Check","الفحص")}</th><th>${L("Status","الحالة")}</th><th>${L("Time","الوقت")}</th><th>${L("Details","التفاصيل")}</th></tr></thead><tbody>
      <tr><td>${L("Automatic backup","النسخ الاحتياطي")}</td><td>${b.enabled?L("Enabled","مفعّل"):L("Disabled / not configured","متوقف / غير مضبوط")}</td><td>${esc(b.last_success_at?new Date(b.last_success_at).toLocaleString():"—")}</td><td>${esc(b.last_error||"—")}</td></tr>
      <tr><td>${L("Last backup attempt","آخر محاولة نسخ")}</td><td>${b.last_attempt_at?L("Recorded","مسجلة"):L("Not recorded","غير مسجلة")}</td><td>${esc(b.last_attempt_at?new Date(b.last_attempt_at).toLocaleString():"—")}</td><td>${esc(b.frequency||"—")}</td></tr>
      <tr><td>${L("Application process","تشغيل التطبيق")}</td><td>${L("Responding","يستجيب")}</td><td>${esc(sv.checked_at?new Date(sv.checked_at).toLocaleString():"—")}</td><td>${esc(sv.uptime_seconds||0)} ${L("seconds uptime","ثانية تشغيل")}</td></tr>
      <tr><td>${L("Recorded system errors","أخطاء النظام المسجلة")}</td><td>${esc(errors.length)}</td><td>—</td><td>${errors.map(x=>esc((x.details||{}).message||(x.details||{}).error||"system_error")).join(" · ")||"—"}</td></tr>
      </tbody></table></div>`;
    }
  } catch(e) {
    if(securityBox) securityBox.innerHTML=`<span class="error">${esc(e.message||"Error")}</span>`;
    if(systemBox) systemBox.innerHTML=`<span class="error">${esc(e.message||"Error")}</span>`;
  }
}

async function terminateAdminDeviceSession(userId, deviceId) {
  if (!await showConfirmModal(L("End this device session? The device will be signed out on its next request.","هل تريد إنهاء جلسة هذا الجهاز؟ سيتم تسجيل خروجه عند الطلب التالي."))) return;
  try {
    const d=await api("/api/admin/device-usage/revoke",{method:"POST",body:JSON.stringify({user_id:userId,device_id:deviceId})});
    alert(d.message||L("Session ended.","تم إنهاء الجلسة."));
    await loadAdminDeviceUsage();
  } catch(e) { alert(e.message||L("Could not end session.","تعذر إنهاء الجلسة.")); }
}
async function loadAdminDeviceUsage(){
  const box=$("adminDeviceUsageBox"); if(!box)return;
  box.innerHTML=`<span class="muted">${L("Loading device usage…","جاري تحميل بيانات الأجهزة…")}</span>`;
  try{
    const d=await api("/api/admin/device-usage");
    const rows=Array.isArray(d.data)?d.data:[];
    box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>${L("Username","اسم المستخدم")}</th><th>${L("Devices","عدد الأجهزة")}</th><th>${L("Last Login","آخر دخول")}</th><th>${L("Device / IP Details","تفاصيل الجهاز / عنوان IP")}</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.username||"—")}</td><td><b>${esc(row.device_count||0)}</b></td><td>${esc(row.last_login_at?new Date(row.last_login_at).toLocaleString():"—")}</td><td>${(row.devices||[]).map(device=>`<div class="admin-device-row"><b>${esc(device.device_label||"Browser/Unknown")}</b> <span class="muted">IP: ${esc(device.ip_address||L("Not recorded — shown after next login","غير مسجل — سيظهر بعد تسجيل الدخول القادم"))}</span> <span class="muted">${esc(device.last_login_at?new Date(device.last_login_at).toLocaleString():"")}</span><div><button type="button" class="danger small" onclick="terminateAdminDeviceSession('${esc(row.user_id)}','${esc(device.device_id)}')">${L("End Session","إنهاء الجلسة")}</button></div></div>`).join("")||"—"}</td></tr>`).join("")||`<tr><td colspan="4">${L("No device logins recorded yet.","لا توجد سجلات دخول للأجهزة حتى الآن.")}</td></tr>`}</tbody></table></div><p class="muted">${esc(d.note||"")}</p>`;
  }catch(e){box.innerHTML=`<span class="error">${esc(e.message||L("Could not load device usage.","تعذر تحميل بيانات الأجهزة."))}</span>`;}
}

function permissionCategory(permission){
  const code=String(permission.code||'').toLowerCase();
  const label=String(permission.name_ar||permission.name_en||code).toLowerCase();
  const groups=[
    {id:'ai',title:'المساعد الذكي',keys:['system_delivery_ai','systemdeliveryai','ai_assistant','aiassistant']},
    {id:'shipments',title:'الشحنات',keys:['shipment','order','scan','return','completed_without_proof','delivery_job','deliveryjob','driver_return','outscan','job','tracking']},
    {id:'drivers',title:'المندوبون',keys:['driver','commission','driver_account','driveraccount','wage','payroll','salary']},
    {id:'cashier',title:'الكاشير والحسابات',keys:['account','expense','shortage','cash','credit','settlement','merchant_financial','company_financial','invoice','finance']},
    {id:'merchants',title:'التجار',keys:['merchant','shipper','customer']},
    {id:'employees',title:'الموظفون والصلاحيات',keys:['user','employee','role','permission','staff']},
    {id:'communication',title:'التواصل',keys:['chat','message','notification']},
    {id:'settings',title:'الإعدادات والأدوات',keys:['setting','area','governorate','backup','audit','map','admin','system','report']}
  ];
  for(const g of groups) if(g.keys.some(k=>code.includes(k)||label.includes(k))) return g;
  return {id:'other',title:'صلاحيات أخرى',keys:[]};
}
function renderPermissionAccordion(perms,checkboxClass,selected=[]){
  const chosen=new Set((selected||[]).map(String));
  const groups=new Map();
  for(const p of perms){const g=permissionCategory(p);if(!groups.has(g.id))groups.set(g.id,{...g,items:[]});groups.get(g.id).items.push(p);}
  return `<div class="permission-accordion">${[...groups.values()].map((g,i)=>`<details class="permission-section" ${i===0?'open':''}><summary><span>${esc(g.title)}</span><span class="permission-section-count">${g.items.filter(p=>chosen.has(String(p.code))).length}/${g.items.length}</span></summary><div class="permission-section-actions"><button type="button" class="ghost mini-btn" onclick="togglePermissionGroup(this,true)">تحديد الكل</button><button type="button" class="ghost mini-btn" onclick="togglePermissionGroup(this,false)">إلغاء التحديد</button></div><div class="permission-items">${g.items.map(p=>`<label class="permission-item"><input type="checkbox" class="${esc(checkboxClass)}" value="${esc(p.code)}" ${chosen.has(String(p.code))?'checked':''} onchange="updatePermissionSectionCount(this)"><span>${esc(L(p.name_en||p.code,p.name_ar||p.code))}</span></label>`).join('')}</div></details>`).join('')}</div>`;
}
function togglePermissionGroup(button,checked){const section=button.closest('.permission-section');section?.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=checked;});updatePermissionSectionCount(section?.querySelector('input[type="checkbox"]'));}
function updatePermissionSectionCount(input){const section=input?.closest('.permission-section');if(!section)return;const all=[...section.querySelectorAll('input[type="checkbox"]')];const count=all.filter(x=>x.checked).length;const out=section.querySelector('.permission-section-count');if(out)out.textContent=`${count}/${all.length}`;}
async function editPermissionGroup(id){
  try{
    const [rr,pp]=await Promise.all([api('/api/roles'),api('/api/permissions')]);
    const role=(rr.data||[]).find(x=>String(x.id)===String(id));if(!role)throw new Error('مجموعة الصلاحيات غير موجودة');
    const perms=(pp.data||[]).filter(p=>String(p.code||'').toLowerCase()!=='admin_tools'),selected=(role.permission_codes||[]).filter(code=>String(code).toLowerCase()!=='admin_tools');
    document.getElementById('permissionGroupEditModal')?.remove();
    const modal=document.createElement('div');modal.id='permissionGroupEditModal';modal.className='td-modal-backdrop';
    modal.innerHTML=`<section class="td-modal permission-editor-modal" role="dialog" aria-modal="true"><header class="td-modal-head"><div><h3>تعديل مجموعة الصلاحيات</h3><small class="muted">${esc(role.name)}</small></div><button type="button" class="ghost" onclick="document.getElementById('permissionGroupEditModal')?.remove()">×</button></header><form id="permissionGroupEditForm" class="td-modal-body permission-editor-body"><label class="permission-group-name">اسم المجموعة<input name="name" required value="${esc(role.name)}"></label><div class="permission-editor-list"><div class="permission-editor-toolbar"><b>اختر القوائم والصلاحيات</b><button type="button" class="ghost mini-btn" onclick="document.querySelectorAll('#permissionGroupEditForm .permission-section input[type=checkbox]').forEach(x=>{x.checked=true;updatePermissionSectionCount(x)})">تحديد الكل</button><button type="button" class="ghost mini-btn" onclick="document.querySelectorAll('#permissionGroupEditForm .permission-section input[type=checkbox]').forEach(x=>{x.checked=false;updatePermissionSectionCount(x)})">إلغاء الكل</button></div>${renderPermissionAccordion(perms,'groupEditPerm',selected)}</div><div id="permissionGroupEditMsg" class="msg"></div><footer class="td-modal-actions"><button type="button" class="ghost" onclick="document.getElementById('permissionGroupEditModal')?.remove()">إلغاء</button><button type="submit">حفظ المجموعة</button></footer></form></section>`;
    document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
    modal.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type=submit]');const name=String(new FormData(form).get('name')||'').trim();const permissions=[...form.querySelectorAll('.groupEditPerm:checked')].map(x=>x.value);if(!name)return;btn.disabled=true;try{const result=await api(`/api/roles/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name,permissions})});if(result?.success===false)throw new Error(result.error||'تعذر حفظ المجموعة');modal.remove();await show('employees');}catch(err){msg('permissionGroupEditMsg',err.message||String(err),'error');btn.disabled=false;}});
  }catch(e){msg('roleMsg',e.message||String(e),'error');}
}

async function employeesPage(c){
  const [u,r,p]=await Promise.all([api("/api/users"),api("/api/roles"),api("/api/permissions")]);
  const perms=p.data||[];
  const rolesList=r.data||[];
  const employees=u.data||[];

  // Always show the built-in roles, even if the database currently
  // contains only the "employee" role. Custom roles are added too.
  // The system administrator account belongs to the owner only; never offer it as an employee role.
  const builtInRoles=[
    ["manager","مدير"],
    ["dispatcher","منسق التوصيل"],
    ["employee","موظف"],
    ["driver","سائق"]
  ];
  const seenRoles=new Set();
  const roleOptionParts=[];
  for(const [value,label] of builtInRoles){
    if(!seenRoles.has(value)){
      seenRoles.add(value);
      roleOptionParts.push(`<option value="${esc(value)}">${esc(label)}</option>`);
    }
  }
  for(const role of rolesList){
    const value=String(role.name||"").trim();
    if(["admin","مدير النظام","system admin","administrator"].includes(value.toLowerCase())) continue;
    if(value && !seenRoles.has(value)){
      seenRoles.add(value);
      roleOptionParts.push(`<option value="${esc(value)}">${esc(value)}</option>`);
    }
  }
  const roleOptions=roleOptionParts.join("");

  c.innerHTML=`<h2>${t("Employees & Permissions")}</h2>

  <div class="panel">
    <div class="section-title">
      <div>
        <h3>${t("Add Employee")}</h3>
      </div>
    </div>
    <div class="form-grid">
      <label>${t("Name")}<input id="un" autocomplete="name" placeholder="${esc(L("Employee name","اسم الموظف"))}"></label>
      <label>${t("Username")}<input id="uu" autocomplete="username" placeholder="${esc(L("Unique username","اسم مستخدم مميز"))}"></label>
      <label>${t("Password")}<input id="up" type="password" autocomplete="new-password" placeholder="${esc(L("Login password","كلمة مرور الدخول"))}"></label>
      <label>${t("Email")} <span class="muted">${L("(optional)","(اختياري)")}</span><input id="ue" type="email" autocomplete="email"></label>
      <label class="full">${t("Role")}<select id="ur">${roleOptions}</select></label>
    </div>
    <div class="employee-actions" style="margin-top:14px">
      <button onclick="addEmployee()">${t("Save")}</button>
      <button class="ghost" onclick="show('employees')">${L("Refresh","تحديث")}</button>
    </div>
    <div id="empMsg" class="msg"></div>
  </div>

  <div class="panel">
    <div class="section-title">
      <div>
        <h3>${L("Permission Groups","مجموعات الصلاحيات")}</h3>
        <div class="muted">${L("Create a group once, select the permissions, then assign it to employees.","أنشئ مجموعة مرة واحدة، اختر الصلاحيات، ثم عيّن المجموعة للموظفين.")}</div>
      </div>
    </div>
    <label>${L("Group name","اسم المجموعة")}<input id="roleName" placeholder="${esc(L("Example: Warehouse Manager","مثال: مشرف المخزن"))}"></label>
    <div class="permission-editor-toolbar"><b>${L("Choose permissions by system menu","اختر الصلاحيات حسب قوائم النظام")}</b><button type="button" class="ghost mini-btn" onclick="document.querySelectorAll('.rolePerm').forEach(x=>{x.checked=true;updatePermissionSectionCount(x)})">${L("Select all","تحديد الكل")}</button><button type="button" class="ghost mini-btn" onclick="document.querySelectorAll('.rolePerm').forEach(x=>{x.checked=false;updatePermissionSectionCount(x)})">${L("Clear all","إلغاء الكل")}</button></div>
    ${renderPermissionAccordion(perms,"rolePerm",[])}
    <button onclick="addRole()">${L("Create Permission Group","إنشاء مجموعة الصلاحيات")}</button>
    <div id="roleMsg" class="msg"></div>
    <div class="role-card-grid">
      ${rolesList.filter(x=>!["admin","مدير النظام","system admin","administrator"].includes(String(x.name||"").trim().toLowerCase())).map(x=>`<div class="role-card"><strong>${esc(x.name)}</strong><small>${(x.permission_codes||[]).length} ${L("permissions","صلاحية")}</small><div class="employee-actions"><button type="button" class="ghost" onclick="editPermissionGroup('${esc(x.id)}')">✎ ${L("Edit group","تعديل المجموعة")}</button></div></div>`).join("")}
    </div>
  </div>

  <div class="panel">
    <div class="section-title"><h3>${t("Employees & Permissions")}</h3><span class="badge">${employees.length}</span></div>
    ${employees.length?`<div class="table-wrap"><table><thead><tr><th>${L("Code","الكود")}</th><th>${t("Name")}</th><th>${t("Username")}</th><th>${t("Role")}</th><th>${L("Effective Permissions","الصلاحيات الفعلية")}</th><th>${t("Status")}</th><th>${L("Actions","الإجراءات")}</th></tr></thead><tbody>${employees.map(r=>{const ep=r.effective_permissions||{};const labels=Object.keys(ep).filter(k=>ep[k]);return `<tr><td><b>${esc(r.employee_code||"—")}</b></td><td>${esc(r.name||"")}</td><td>${esc(r.username||"")}</td><td>${esc(r.role||"")}</td><td><div class="actions" style="gap:4px;flex-wrap:wrap">${labels.length?labels.map(x=>`<span class="badge">${esc(x)}</span>`).join(""):`<span class="muted">${L("No permissions","بدون صلاحيات")}</span>`}</div></td><td>${r.active?`<span class="badge">${L("Active","نشط")}</span>`:`<span class="badge">${L("Inactive","متوقف")}</span>`}</td><td><div class="employee-actions"><button class="ghost" onclick="editEmployee('${esc(r.id)}')">✎ ${L("Edit","تعديل")}</button><button class="ghost" onclick="toggleEmployee('${esc(r.id)}',${r.active?'false':'true'})">${r.active?L("Disable","تعطيل"):L("Enable","تفعيل")}</button><button class="danger" onclick="deleteEmployee('${esc(r.id)}')">${L("Delete","حذف")}</button></div></td></tr>`}).join("")}</tbody></table></div>`:`<p class="muted">${t("No data")}</p>`}
  </div>`;
}
function tdConfirm(message){
  return new Promise(resolve=>{
    document.getElementById('tdConfirmModal')?.remove();
    const overlay=document.createElement('div');overlay.id='tdConfirmModal';overlay.className='td-modal-backdrop';
    overlay.innerHTML=`<section class="td-modal" role="dialog" aria-modal="true" style="width:min(420px,100%)"><header class="td-modal-head"><h3>${L('Confirm','تأكيد')}</h3><button type="button" class="ghost" data-choice="no" aria-label="${L('Close','إغلاق')}">×</button></header><div class="td-modal-body" style="display:block"><p>${esc(message)}</p><footer class="td-modal-actions"><button type="button" class="ghost" data-choice="no">${L('Cancel','إلغاء')}</button><button type="button" data-choice="yes">${L('Confirm','تأكيد')}</button></footer></div></section>`;
    const finish=value=>{overlay.remove();resolve(value)};
    overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false);});
    overlay.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>finish(b.dataset.choice==='yes')));
    document.addEventListener('keydown',function onKey(e){if(e.key==='Escape'){document.removeEventListener('keydown',onKey);finish(false);}});
    document.body.appendChild(overlay);
  });
}

async function addEmployee(){
  const name=$("un")?.value.trim();
  const username=$("uu")?.value.trim();
  const password=$("up")?.value||"";
  const email=$("ue")?.value.trim()||`${username.toLowerCase()}@username.trend.invalid`;
  const role=$("ur")?.value||"employee";
  if(!name||!username||!password)return msg("empMsg",L("Name, username and password are required","الاسم واسم المستخدم وكلمة المرور مطلوبة"),"error");
  if(password.length<6)return msg("empMsg",L("Password must be at least 6 characters","كلمة المرور يجب أن تكون 6 أحرف على الأقل"),"error");
  try{
    await api("/api/users",{method:"POST",body:JSON.stringify({name,username,email,password,role})});
    msg("empMsg",L("Employee created successfully. They can now log in with the username and password.","تم إنشاء الموظف بنجاح. يمكنه الآن الدخول باسم المستخدم وكلمة المرور."),"ok");
    ["un","uu","ue","up"].forEach(id=>{if($(id))$(id).value="";});
    setTimeout(()=>show("employees"),800);
  }catch(e){msg("empMsg",e.message,"error");}
}
async function editEmployee(id){
  try{
    const [usersResponse, rolesResponse] = await Promise.all([
      api('/api/users'), api('/api/roles')
    ]);
    const r=(usersResponse.data||[]).find(x=>String(x.id)===String(id));
    if(!r) throw new Error(L('Employee not found','الموظف غير موجود'));
    const roles=(rolesResponse.data||[]).filter(group=>!["admin","مدير النظام","system admin","administrator"].includes(String(group.name||'').trim().toLowerCase()));
    const currentRole=String(r.role||'employee');
    const currentRoleIsGroup=roles.some(group=>String(group.name)===currentRole);
    const isSystemAdminRole=["admin","مدير النظام","system admin","administrator"].includes(currentRole.trim().toLowerCase());
    const permissionGroupOptions=(isSystemAdminRole?`<option value="${esc(currentRole)}" selected disabled>مدير النظام — حساب المالك فقط</option>`:(currentRoleIsGroup?'':`<option value="${esc(currentRole)}" selected>${esc(currentRole)} (${L('current role','الدور الحالي')})</option>`))+roles.map(group=>`<option value="${esc(group.name)}" ${String(group.name)===currentRole?'selected':''}>${esc(group.name)}</option>`).join('');
    closeEmployeeModal();
    const modal=document.createElement('div');
    modal.id='employeeEditModal'; modal.className='td-modal-backdrop';
    modal.innerHTML=`<section class="td-modal" role="dialog" aria-modal="true" aria-labelledby="employeeEditTitle">
      <header class="td-modal-head"><h3 id="employeeEditTitle">${L('Edit employee','تعديل الموظف')}</h3><button type="button" class="ghost" onclick="closeEmployeeModal()" aria-label="${L('Close','إغلاق')}">×</button></header>
      <form id="employeeEditForm" class="td-modal-body">
        <label>${L('Employee code (fixed)','كود الموظف (ثابت)')}<input value="${esc(r.employee_code||'')}" disabled></label>
        <label>${L('Name','الاسم')}<input name="name" required value="${esc(r.name||'')}" autocomplete="name"></label>
        <label>${L('Username','اسم المستخدم')}<input name="username" required value="${esc(r.username||'')}" autocomplete="username"></label>
        <label>${L('Email','البريد الإلكتروني')}<input name="email" type="email" value="${esc(r.email||'')}"></label>
        <label>${L('Language','اللغة')}<select name="language"><option value="ar" ${r.language==='ar'?'selected':''}>العربية</option><option value="en" ${r.language==='en'?'selected':''}>English</option></select></label>
        <label>${L('Permission group','مجموعة الصلاحيات')}<select name="role" id="employeePermissionGroupSelect" required>${permissionGroupOptions}</select></label>
        <label>${L('New password (optional)','كلمة مرور جديدة (اختياري)')}<input name="password" type="password" autocomplete="new-password" placeholder="${L('Leave blank to keep current','اتركها فارغة للإبقاء على الحالية')}"></label>
        <small class="muted">${L('Employee permissions are assigned only through an existing permission group. To change individual permissions, edit the group itself.','صلاحيات الموظف تُحدد من خلال مجموعة موجودة فقط. لتعديل الصلاحيات الفردية، عدّل المجموعة نفسها.')}</small>
        <div id="employeeEditMsg" class="msg" role="status"></div>
        <footer class="td-modal-actions"><button type="button" class="ghost" onclick="closeEmployeeModal()">${L('Cancel','إلغاء')}</button><button type="submit">${L('Save changes','حفظ التعديلات')}</button></footer>
      </form></section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeEmployeeModal();});
    document.getElementById('employeeEditForm').addEventListener('submit',async e=>{ 
      e.preventDefault();
      const form=e.currentTarget, save=form.querySelector('button[type="submit"]');
      const fd=new FormData(form);
      const body={name:String(fd.get('name')||'').trim(),username:String(fd.get('username')||'').trim(),email:String(fd.get('email')||'').trim(),language:String(fd.get('language')||'ar'),role:String(fd.get('role')||currentRole)};
      const password=String(fd.get('password')||''); if(password)body.password=password;
      if(!body.name||!body.username){msg('employeeEditMsg',L('Name and username are required','الاسم واسم المستخدم مطلوبان'),'error');return;}
      if(password&&password.length<6){msg('employeeEditMsg',L('Password must be at least 6 characters','كلمة المرور يجب ألا تقل عن 6 أحرف'),'error');return;}
      save.disabled=true;
      try{
        const result=await api(`/api/users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});
        if(result?.success===false)throw new Error(result.error||L('Save failed','فشل الحفظ'));
        closeEmployeeModal(); await show('employees');
      }catch(err){msg('employeeEditMsg',err.message||String(err),'error');save.disabled=false;}
    });
  }catch(e){msg('empMsg',e.message||String(e),'error');}
}
function closeEmployeeModal(){document.getElementById('employeeEditModal')?.remove();}
async function toggleEmployee(id, active){
  const action=active?L("Enable this employee?","هل تريد تفعيل هذا الموظف؟"):L("Disable this employee?","هل تريد إيقاف هذا الموظف؟");
  if(!await tdConfirm(action))return;
  try{
    const result=await api(`/api/users/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({active})});
    if(result?.success===false)throw new Error(result.error||L('Update failed','فشل التحديث'));
    await show("employees");
  }catch(e){msg("empMsg",e.message||String(e),"error");}
}
async function deleteEmployee(id){
  if(!await tdConfirm(L("Delete this employee permanently?","حذف هذا الموظف نهائيًا؟")))return;
  try{
    const result=await api(`/api/users/${encodeURIComponent(id)}`,{method:"DELETE"});
    if(result?.success===false)throw new Error(result.error||L('Delete failed','فشل الحذف'));
    await show("employees");
  }catch(e){msg("empMsg",e.message||String(e),"error");}
}

async function addRole(){
  const name=$("roleName")?.value.trim();
  const permissions=[...document.querySelectorAll(".rolePerm:checked")].map(x=>x.value);
  if(!name)return msg("roleMsg",L("Enter a group name","اكتب اسم المجموعة"),"error");
  if(!permissions.length)return msg("roleMsg",L("Choose at least one permission","اختر صلاحية واحدة على الأقل"),"error");
  try{
    await api("/api/roles",{method:"POST",body:JSON.stringify({name,permissions})});
    msg("roleMsg",L("Permission group created successfully","تم إنشاء مجموعة الصلاحيات بنجاح"),"ok");
    setTimeout(()=>show("employees"),700);
  }catch(e){msg("roleMsg",e.message,"error");}
}

let CHAT_ATTACHMENT=null;
let CHAT_MEDIA_RECORDER=null;
let CHAT_AUDIO_CHUNKS=[];
let CHAT_ACTIVE_ID=null;
let CHAT_CONVERSATIONS=[];

function chatPlayNotification(){
  if(typeof NOTIFICATION_SOUND_ENABLED!=='undefined'&&!NOTIFICATION_SOUND_ENABLED)return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    const ctx=new Ctx();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(880,ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1320,ctx.currentTime+0.12);
    g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.12,ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.32);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.34);
    CHAT_SOUND_READY=true;
  }catch(_){ }
}
function chatPrimeSound(){ if(!CHAT_SOUND_READY) chatPlayNotification(); }
async function chatNotifyPoll(){
  if(!CURRENT_USER)return;
  try{
    const d=await api('/api/chat/unread'); const n=Number(d.data?.unread_count||0);
    const badge=document.getElementById('chatUnreadBadge');
    if(badge){badge.textContent=n>99?'99+':String(n);badge.hidden=n<=0;}
    const bell=document.getElementById('notificationBell');
    if(bell){bell.setAttribute('aria-label',n>0?`${L('Notifications','الإشعارات')} — ${n} ${L('unread chat messages','رسائل شات غير مقروءة')}`:L('Notifications','الإشعارات'));bell.title=n>0?`${L('Notifications','الإشعارات')} — ${n} ${L('unread chat messages','رسائل شات غير مقروءة')}`:L('Notifications','الإشعارات');}
    if(CHAT_LAST_UNREAD!==null && n>CHAT_LAST_UNREAD){
      chatPlayNotification();
      if(document.hidden && 'Notification' in window){
        if(Notification.permission==='granted') new Notification(L('New employee message','رسالة جديدة من الموظفين'),{body:L('You have a new chat message','لديك رسالة جديدة في شات الموظفين'),icon:'/trend-logo.jpeg'});
      }
      if(n>0 && CURRENT_PAGE!=='chat'){
        const old=document.getElementById('chatToast'); old?.remove();
        const toast=document.createElement('button'); toast.id='chatToast'; toast.className='chat-toast'; toast.type='button';
        toast.textContent=`${L('New message','رسالة جديدة')} (${n})`;
        toast.onclick=()=>{toast.remove();show('chat');}; document.body.appendChild(toast);
        setTimeout(()=>toast.remove(),5000);
      }
    }
    CHAT_LAST_UNREAD=n;
  }catch(_){ }
}
function startChatNotifications(){
  if(CHAT_NOTIFY_TIMER)clearInterval(CHAT_NOTIFY_TIMER);
  CHAT_LAST_UNREAD=null;
  chatNotifyPoll();
  CHAT_NOTIFY_TIMER=setInterval(chatNotifyPoll,3000);
  document.addEventListener('pointerdown',chatPrimeSound,{once:true});
  if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{});
}
function stopChatNotifications(){if(CHAT_NOTIFY_TIMER){clearInterval(CHAT_NOTIFY_TIMER);CHAT_NOTIFY_TIMER=null;}}

async function chatPage(c){
  const d=await api('/api/chat/conversations').catch(()=>({data:[]}));
  CHAT_CONVERSATIONS=d.data||[];
  c.innerHTML=`<div class="chat-app"><div class="chat-list panel"><div class="chat-list-head"><h2>${t('Employee Chat')}</h2><button type="button" onclick="openNewChat()">+ ${L('New','جديد')}</button></div><div id="chatConversationList">${renderChatConversationList()}</div></div><div class="chat-window panel"><div id="chatWindowHead" class="chat-window-head"><strong>${L('Select a conversation','اختر محادثة')}</strong></div><div id="chatMessages" class="chat-messages"><div class="muted chat-empty">${L('Start a new conversation or choose one from the list','ابدأ محادثة جديدة أو اختر محادثة من القائمة')}</div></div><div id="chatAttachmentPreview" class="chat-attachment-preview"></div><div class="row chat-compose"><input id="chatInput" placeholder="${esc(L('Write a message...','اكتب رسالة...'))}"><input id="chatImageInput" type="file" accept="image/*" hidden><button class="ghost" type="button" onclick="document.getElementById('chatImageInput')?.click()">${L('Photo','صورة')}</button><button class="ghost" type="button" id="chatRecordBtn" onclick="toggleChatRecording()">${L('Voice','صوت')}</button><button type="button" onclick="sendChat()">${t('Send')}</button></div></div></div>`;
  CHAT_ATTACHMENT=null;
  if(CHAT_CONVERSATIONS.length){await openChatConversation(CHAT_ACTIVE_ID&&CHAT_CONVERSATIONS.some(x=>x.id===CHAT_ACTIVE_ID)?CHAT_ACTIVE_ID:CHAT_CONVERSATIONS[0].id);}
  if(CHAT_TIMER)clearInterval(CHAT_TIMER); CHAT_TIMER=setInterval(()=>{if(CHAT_ACTIVE_ID)loadChatMessages(CHAT_ACTIVE_ID);},4000);
  $('chatInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
  $('chatImageInput')?.addEventListener('change',handleChatImage);
}
function renderChatConversationList(){
  if(!CHAT_CONVERSATIONS.length)return `<div class="chat-no-data">${L('No conversations yet','لا توجد محادثات حتى الآن')}</div>`;
  return CHAT_CONVERSATIONS.map(x=>{const title=x.type==='group'?(x.name||L('Group','مجموعة')):(x.member_names||[]).filter(n=>n!==CURRENT_USER?.name).join('، ')||L('Direct chat','محادثة مباشرة');const unread=Number(x.unread_count||0);return `<button type="button" class="chat-conversation ${x.id===CHAT_ACTIVE_ID?'active':''}" onclick="openChatConversation('${esc(x.id)}')"><span class="chat-conv-main"><b>${esc(title)}</b><small>${esc(x.last_message||'')}</small></span>${unread?`<span class="chat-conv-unread">${unread>99?'99+':unread}</span>`:''}</button>`;}).join('');
}
async function openChatConversation(id){
  CHAT_ACTIVE_ID=id; const c=CHAT_CONVERSATIONS.find(x=>String(x.id)===String(id));
  document.getElementById('chatConversationList')?.replaceChildren(); const list=document.getElementById('chatConversationList'); if(list)list.innerHTML=renderChatConversationList();
  if(!c)return;
  const title=c.type==='group'?(c.name||L('Group','مجموعة')):(c.member_names||[]).filter(n=>n!==CURRENT_USER?.name).join('، ')||L('Direct chat','محادثة مباشرة');
  const head=document.getElementById('chatWindowHead'); if(head)head.innerHTML=`<div><strong>${esc(title)}</strong><small>${c.type==='group'?`${c.member_count} ${L('members','أعضاء')}`:L('Direct conversation','محادثة مباشرة')}</small></div>${c.type==='group'?`<button type="button" class="ghost" onclick="openChatGroupMembers()">${L('Group members','أعضاء المجموعة')}</button>`:''}`;
  await loadChatMessages(id); await api(`/api/chat/conversations/${encodeURIComponent(id)}/read`,{method:'POST'}).catch(()=>{}); chatNotifyPoll();
}
function setChatAttachment(data,type,name=''){CHAT_ATTACHMENT={data,type,name};const box=$('chatAttachmentPreview');if(!box)return;box.innerHTML=type.startsWith('image/')?`<div class="chat-attachment-chip"><img src="${esc(data)}" alt="attachment"><span>${esc(name||L('Image','صورة'))}</span><button type="button" class="ghost" onclick="clearChatAttachment()">×</button></div>`:`<div class="chat-attachment-chip"><span>${esc(name||L('Voice message','رسالة صوتية'))}</span><button type="button" class="ghost" onclick="clearChatAttachment()">×</button></div>`;}
function clearChatAttachment(){CHAT_ATTACHMENT=null;const box=$('chatAttachmentPreview');if(box)box.innerHTML='';const input=$('chatImageInput');if(input)input.value='';}
async function handleChatImage(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return alert(L('Please choose an image file','اختر صورة فقط'));try{const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=source;});const scale=Math.min(1,1200/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);let data=canvas.toDataURL('image/jpeg',0.78);if(data.length>1.1*1024*1024)data=canvas.toDataURL('image/jpeg',0.62);if(data.length>1.8*1024*1024)return alert(L('Image is too large after compression','الصورة ما زالت كبيرة بعد الضغط'));setChatAttachment(data,'image/jpeg',file.name);}catch(_){alert(L('Could not read the image','تعذر قراءة الصورة'));}}
async function toggleChatRecording(){const btn=$('chatRecordBtn');if(CHAT_MEDIA_RECORDER&&CHAT_MEDIA_RECORDER.state!=='inactive'){CHAT_MEDIA_RECORDER.stop();if(btn)btn.textContent=L('Voice','صوت');return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return alert(L('Voice recording is not supported on this device/browser','تسجيل الصوت غير مدعوم على هذا الجهاز أو المتصفح'));try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});CHAT_AUDIO_CHUNKS=[];CHAT_MEDIA_RECORDER=new MediaRecorder(stream);CHAT_MEDIA_RECORDER.ondataavailable=e=>{if(e.data.size)CHAT_AUDIO_CHUNKS.push(e.data);};CHAT_MEDIA_RECORDER.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(CHAT_AUDIO_CHUNKS,{type:CHAT_MEDIA_RECORDER.mimeType||'audio/webm'});if(blob.size>850*1024){alert(L('Voice message is too large','الرسالة الصوتية كبيرة جدًا'));return;}const r=new FileReader();r.onload=()=>setChatAttachment(r.result,blob.type,'Voice message');r.readAsDataURL(blob);};CHAT_MEDIA_RECORDER.start();if(btn)btn.textContent=L('Stop','تعطيل');}catch(_){alert(L('Microphone permission was denied','تم رفض صلاحية الميكروفون'));}}
function parseChatMessage(x){const raw=String(x.message||'');if(x.deleted_at)return {...x,text:L('Message deleted','تم حذف الرسالة'),deleted:true};if(raw.startsWith('__ATTACHMENT__')){try{const a=JSON.parse(raw.slice('__ATTACHMENT__'.length));return {...x,attachment:a,text:a.text||''};}catch(_){} }return {...x,text:raw};}
async function loadChatMessages(id){if(CURRENT_PAGE!=='chat'||!id)return;try{const d=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`);const box=$('chatMessages');if(!box)return;box.innerHTML=(d.data||[]).map(raw=>{const x=parseChatMessage(raw);const mine=(CURRENT_USER?.id==='env-admin'&& !x.sender_id) || String(x.sender_id)===String(CURRENT_USER?.id);const media=x.attachment?.type?.startsWith('image/')?`<img class="chat-image" src="${esc(x.attachment.data)}" alt="chat image">`:x.attachment?.type?.startsWith('audio/')?`<audio class="chat-audio" controls src="${esc(x.attachment.data)}"></audio>`:'';return `<div class="chat-message ${mine?'mine':''} ${x.deleted?'deleted':''}"><div class="chat-message-meta"><b>${esc(x.sender_name||'Employee')}</b><small>${esc((x.created_at||'').slice(0,16).replace('T',' '))}</small>${!x.deleted&&(mine||CURRENT_USER?.role==='admin')?`<button type="button" class="chat-delete-btn" onclick="deleteChatMessage('${esc(x.id)}')">×</button>`:''}</div>${x.text?`<p>${esc(x.text)}</p>`:''}${media}</div>`;}).join('')||`<p class="muted">${t('No data')}</p>`;box.scrollTop=box.scrollHeight;}catch(e){console.warn(e.message);}}
async function sendChat(){if(!CHAT_ACTIVE_ID)return alert(L('Choose a conversation first','اختر محادثة أولاً'));const input=$('chatInput'),message=input?.value.trim()||'';if(!message&&!CHAT_ATTACHMENT)return;try{const attachment=CHAT_ATTACHMENT?{type:CHAT_ATTACHMENT.type,data:CHAT_ATTACHMENT.data,name:CHAT_ATTACHMENT.name,text:message}:null;const payload=attachment?`__ATTACHMENT__${JSON.stringify(attachment)}`:message;await api(`/api/chat/conversations/${encodeURIComponent(CHAT_ACTIVE_ID)}/messages`,{method:'POST',body:JSON.stringify({message:payload})});input.value='';clearChatAttachment();await loadChatMessages(CHAT_ACTIVE_ID);chatNotifyPoll();}catch(e){alert(e.message);}}
async function deleteChatMessage(id){if(!await showConfirmModal(L('Delete this message?','حذف هذه الرسالة؟')))return;try{await api(`/api/chat/messages/${encodeURIComponent(id)}`,{method:'DELETE'});await loadChatMessages(CHAT_ACTIVE_ID);await refreshChatConversations();}catch(e){alert(e.message);}}
async function refreshChatConversations(){try{const d=await api('/api/chat/conversations');CHAT_CONVERSATIONS=d.data||[];const list=document.getElementById('chatConversationList');if(list)list.innerHTML=renderChatConversationList();}catch(_){} }
async function openNewChat(){
  const users=(await api('/api/chat/users')).data||[];
  const choices=users.filter(x=>String(x.id)!==String(CURRENT_USER?.id));
  const initials=(x)=>String(x.name||x.username||x.email||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase();
  const employeeName=(x)=>x.name||x.username||x.email||L('Employee','موظف');
  const html=`<div class="chat-modal-backdrop" id="chatModal"><section class="chat-modal chat-new-modal" role="dialog" aria-modal="true" aria-labelledby="newChatTitle">
    <header class="chat-new-head"><div class="chat-new-heading"><span class="chat-new-icon">✉</span><div><h3 id="newChatTitle">${L('New conversation','محادثة جديدة')}</h3><p>${L('Choose a person to start chatting','اختر موظفًا لبدء المحادثة')}</p></div></div><button class="chat-new-close" type="button" aria-label="${L('Close','إغلاق')}" onclick="closeChatModal()">×</button></header>
    <div class="chat-new-type" role="group" aria-label="${L('Conversation type','نوع المحادثة')}"><button type="button" class="chat-type-option active" data-chat-type="direct"><span>◉</span><span><b>${L('Direct message','محادثة مباشرة')}</b><small>${L('Chat with one employee','محادثة مع موظف واحد')}</small></span></button><button type="button" class="chat-type-option" data-chat-type="group"><span>◎</span><span><b>${L('Group chat','محادثة جماعية')}</b><small>${L('Bring the team together','اجمع فريق العمل')}</small></span></button></div>
    <label id="newChatNameWrap" class="chat-group-name hidden"><span>${L('Group name','اسم المجموعة')}</span><input id="newChatName" maxlength="80" placeholder="${L('e.g. Operations team','مثال: فريق العمليات')}"></label>
    <div class="chat-employee-tools"><label class="chat-employee-search"><span>⌕</span><input id="newChatSearch" type="search" autocomplete="off" placeholder="${L('Search employees by name or code...','ابحث باسم الموظف أو الكود...')}"></label><span id="newChatSelectedCount" class="chat-selected-count">${L('0 selected','0 محدد')}</span></div>
    <div id="newChatMembersList" class="chat-employee-choices">${choices.map((x,i)=>{const name=employeeName(x);return `<label class="chat-employee-option" data-search="${esc([name,x.username,x.email,x.employee_code].filter(Boolean).join(' ').toLowerCase())}"><input type="checkbox" name="newChatMember" value="${esc(x.id)}"><span class="chat-employee-avatar chat-avatar-${i%6}">${esc(initials(x))}</span><span class="chat-employee-details"><b>${esc(name)}</b><small>${x.employee_code?esc(x.employee_code)+' · ':''}${esc(x.email||x.username||'')}</small></span><span class="chat-employee-check">✓</span></label>`}).join('')||`<div class="chat-no-employees">${L('No other employees found','لم يتم العثور على موظفين آخرين')}</div>`}</div>
    <footer class="chat-new-footer"><span id="newChatHint">${L('Select one employee to continue','اختر موظفًا واحدًا للمتابعة')}</span><div><button type="button" class="ghost" onclick="closeChatModal()">${L('Cancel','إلغاء')}</button><button type="button" id="startNewChatBtn" onclick="createChatConversation()" disabled>${L('Start chat','بدء المحادثة')} <span>←</span></button></div></footer>
  </section></div>`;
  document.body.insertAdjacentHTML('beforeend',html);
  const modal=$('chatModal'), typeButtons=[...modal.querySelectorAll('[data-chat-type]')], memberInputs=[...modal.querySelectorAll('input[name="newChatMember"]')];
  const refreshSelection=()=>{const selected=memberInputs.filter(x=>x.checked);const group=$('newChatType')?.value==='group';$('newChatSelectedCount').textContent=group?L(selected.length+' selected',String(selected.length)+' محدد'):L((selected.length?'1 selected':'0 selected'),(selected.length?'1 محدد':'0 محدد'));$('startNewChatBtn').disabled=group?selected.length<2:selected.length!==1;$('newChatHint').textContent=group?L('Select at least two employees','اختر موظفين على الأقل'):L('Select one employee to continue','اختر موظفًا واحدًا للمتابعة');};
  const setType=(type)=>{$('newChatType')?.remove();const hidden=document.createElement('input');hidden.type='hidden';hidden.id='newChatType';hidden.value=type;modal.appendChild(hidden);typeButtons.forEach(b=>b.classList.toggle('active',b.dataset.chatType===type));$('newChatNameWrap')?.classList.toggle('hidden',type!=='group');if(type==='direct'){const selected=memberInputs.filter(x=>x.checked);selected.slice(1).forEach(x=>x.checked=false);}refreshSelection();};
  typeButtons.forEach(b=>b.addEventListener('click',()=>setType(b.dataset.chatType)));
  memberInputs.forEach(input=>input.addEventListener('change',()=>{if($('newChatType').value==='direct'&&input.checked)memberInputs.forEach(other=>{if(other!==input)other.checked=false;});refreshSelection();}));
  $('newChatSearch').addEventListener('input',()=>{const q=$('newChatSearch').value.trim().toLowerCase();modal.querySelectorAll('.chat-employee-option').forEach(row=>{row.hidden=!row.dataset.search.includes(q);});});
  setType('direct');$('newChatSearch').focus();
}
function closeChatModal(){$('chatModal')?.remove();}
async function createChatConversation(){const type=$('newChatType')?.value||'direct';const ids=[...document.querySelectorAll('#chatModal input[name="newChatMember"]:checked')].map(x=>x.value);if(type==='direct'&&ids.length!==1)return alert(L('Choose one employee','اختر موظفًا واحدًا'));if(type==='group'&&ids.length<2)return alert(L('Choose at least two employees for a group','اختر موظفين على الأقل للمجموعة'));try{const d=await api('/api/chat/conversations',{method:'POST',body:JSON.stringify({type,name:$('newChatName')?.value||'',member_ids:ids})});closeChatModal();await refreshChatConversations();await openChatConversation(d.data.id);}catch(e){alert(e.message);}}
async function openChatGroupMembers(){if(!CHAT_ACTIVE_ID)return;const info=await api(`/api/chat/conversations/${encodeURIComponent(CHAT_ACTIVE_ID)}`).catch(e=>null);if(!info?.data)return;const conv=info.data.conversation,members=info.data.members||[];const canManage=members.find(x=>String(x.user_id)===String(CURRENT_USER?.id))?.is_admin||CURRENT_USER?.role==='admin';const users=(await api('/api/chat/users')).data||[];const existing=new Set(members.map(x=>String(x.user_id)));const available=users.filter(x=>!existing.has(String(x.id)));const html=`<div class="chat-modal-backdrop" id="chatModal"><div class="chat-modal"><h3>${esc(conv.name||L('Group','مجموعة'))}</h3><div class="chat-member-list">${members.map(m=>`<div><span>${esc(m.user?.name||m.user?.username||m.user_id)}${m.user?.employee_code?` — ${esc(m.user.employee_code)}`:''}</span>${canManage?`<button type="button" class="ghost" onclick="removeChatMember('${esc(m.user_id)}')">${L('Remove','إزالة')}</button>`:''}</div>`).join('')}</div>${canManage?`<label>${L('Add employees','إضافة موظفين')}<select id="addChatMembers" multiple size="6">${available.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.username||x.email||'')}${x.employee_code?` — ${esc(x.employee_code)}`:''}</option>`).join('')}</select></label><button type="button" onclick="addChatMembers()">${L('Add','إضافة')}</button>`:''}<button type="button" class="ghost" onclick="closeChatModal()">${L('Close','إغلاق')}</button></div></div>`;document.body.insertAdjacentHTML('beforeend',html);}
async function addChatMembers(){const ids=[...($('addChatMembers')?.selectedOptions||[])].map(x=>x.value);if(!ids.length)return;try{await api(`/api/chat/conversations/${encodeURIComponent(CHAT_ACTIVE_ID)}/members`,{method:'POST',body:JSON.stringify({user_ids:ids})});closeChatModal();await refreshChatConversations();await openChatGroupMembers();}catch(e){alert(e.message);}}
async function removeChatMember(userId){if(!await showConfirmModal(L('Remove this employee from the group?','إزالة الموظف من المجموعة؟')))return;try{await api(`/api/chat/conversations/${encodeURIComponent(CHAT_ACTIVE_ID)}/members`,{method:'DELETE',body:JSON.stringify({user_id:userId})});closeChatModal();await refreshChatConversations();await openChatGroupMembers();}catch(e){alert(e.message);}}

function printArea(id,title){const el=$(id);if(!el)return;const w=window.open('','_blank','width=1200,height=850');if(!w)return;const isDriver=id==='printDriverStatement';const compact=isDriver?'@page{size:A4 landscape;margin:6mm}body{font-family:Tahoma,Arial,sans-serif;padding:0;color:#172033;font-size:8px}h2{font-size:14px;margin:0 0 6px}h3{font-size:11px;margin:3px 0 5px}table{width:100%;border-collapse:collapse;margin:4px 0;font-size:7px}th,td{border:1px solid #bbb;padding:3px 4px;text-align:right}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.stat{border:1px solid #ddd;padding:4px}.badge{border:1px solid #ccc;padding:2px 5px;border-radius:10px}.driver-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.print-signatures{display:flex;justify-content:space-between;margin-top:8px}.site-credit{font-size:7px;margin-top:4px}button,input,select,.no-print{display:none!important}.print-brand{display:flex;align-items:center;gap:10px;border-bottom:1px solid #ddd;padding-bottom:5px;margin-bottom:6px}.print-brand img{width:70px;height:34px;object-fit:contain}' : 'body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#172033}h2,h3{margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:8px;text-align:right}button,input,select,.no-print{display:none!important}.panel{margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{border:1px solid #ddd;padding:10px}.badge{border:1px solid #ccc;padding:3px 7px;border-radius:12px}.print-brand{display:flex;align-items:center;gap:12px;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:14px}.print-brand img{width:90px;height:44px;object-fit:contain}@media print{body{padding:0}}';const brandName=COMPANY_BRANDING.name||"Delivery";const brandLogo=COMPANY_BRANDING.logo_url||"/trend-logo.jpeg";w.document.write(`<!doctype html><html dir="${LANG==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${compact}</style></head><body><div class="print-brand"><img src="${esc(brandLogo)}" alt=""><strong>${esc(brandName)}</strong></div><h2>${esc(title)}</h2>${el.innerHTML}</body></html>`);w.document.close();w.focus();setTimeout(()=>{w.print();w.close();},350);}
function table(rows,cols){if(!rows||!rows.length)return `<p class="muted">${t("No data")}</p>`;return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;}

function dashboardShipmentExportRow(r){
  const orderNo=r.order?.merchant_order_no||r.order?.order_code||"";
  const merchantName=r.merchant?.name||"";
  const merchantCode=r.merchant?.merchant_no||r.merchant?.code||"";
  const status=displayShipmentStatus(r);
  const specialDate=['future_delivery','return_by_driver','location_change','schedule_for_tomorrow'].includes(String(status).toLowerCase().replace(/\s+/g,'_')) ? (r.order?.driver_scheduled_date||r.special_scheduled_date||'') : '';
  const date=String(r.display_date||specialDate||r.last_status_at||r.order?.created_at||'');
  const exitDate=String(r.delivery_job_date||specialDate||'').slice(0,10);
  const todayISO=localDateISO();
  const daysOut=exitDate ? Math.max(0,Math.floor((new Date(todayISO+'T12:00:00').getTime()-new Date(exitDate+'T12:00:00').getTime())/86400000)) : 0;
  return {
    "Tracking Number":r.tracking_number||'',
    "Order / Shipment":`${orderNo}${r.shipment_no?' / '+r.shipment_no:''}`,
    "Shipper":`${merchantName}${merchantCode?' — '+merchantCode:''}`,
    "Price":Number(r.order?.value||0),
    "Driver":r.driver?.name||'NA',
    "Job Code":r.job_code||r.delivery_job_code||'',
    "Status":status,
    "Last Status Date":date.slice(0,19).replace('T',' '),
    "Days Out":daysOut,
    created_by_name:r.order?.created_by_name||r.created_by_name||""
  };
}
function exportRowsExcel(rows,name="export"){
  if(typeof XLSX==="undefined")return alert(L("Excel library did not load","مكتبة Excel لم تعمل"));
  const moneyKeys=new Set(["value","delivery_fee","service_charges","amount","tax_amount","merchant_net_value","orderValue","deliveryFees","taxes","merchantNet","fuel_expense","other_expenses","net_commission","expenseTotal","shortageTotal","required","base_delivery_fee"]);
  const prepared=(rows||[]).map(row=>Object.fromEntries(Object.entries(row||{}).map(([k,v])=>[k,moneyKeys.has(k)&&typeof v==="number"?money(v):v])));
  const ws=XLSX.utils.json_to_sheet(prepared),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data");XLSX.writeFile(wb,`${name}-${today()}.xlsx`);
}
function companyPrintBrandHeader(){
  const name=String(COMPANY_BRANDING.name||"Delivery");
  const logo=String(COMPANY_BRANDING.logo_url||"/trend-logo.jpeg");
  return `<div class="company-print-brand" style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #d6dbe4;padding:0 0 8px;margin:0 0 12px"><img src="${esc(logo)}" alt="" style="width:64px;height:38px;object-fit:contain"><strong style="font-size:15px">${esc(name)}</strong></div>`;
}

function printShippingLabels(rows,targetWindow=null){
  const data=Array.isArray(rows)?rows:[];if(!data.length)return alert('No orders to print.');
  const escLabel=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const field=(label,value)=>`<div class="label-field"><span>${label}</span><b>${escLabel(value||'—')}</b></div>`;
  const cards=data.map((o,index)=>{
    const order=o.order||{},shipment=o.shipment||{};
    const tracking=o.tracking_number||o.tracking_no||shipment.tracking_number||order.tracking_number||'';
    const shipperName=o.merchant_label||o.merchant?.name||o.merchant_name||'—';
    const shipperCode=o.merchant?.merchant_no||o.merchant?.code||o.merchant_no||o.merchant_code||'';
    const shipmentNo=o.shipment_no||o.shipment_number||o.serial_no||shipment.shipment_no||shipment.shipment_number||'—';
    const jobCode=o.job_code||o.jop_cod||o.jobCode||shipment.job_code||'—';
    const barcode=tracking?code39BarcodeSVG(String(tracking).replace(/[^A-Za-z0-9 .$/+%-]/g,'')):'<div class="barcode-missing">NO TRACKING NUMBER</div>';
    const region=o.region||o.area?.name_en||o.area?.name_ar||o.area_name||order.area_name||o.customer?.area_name||'—';
    const emirate=o.governorate?.name_en||o.emirate||o.governorate_name||order.governorate_name||'';
    const address=o.address||o.customer_address||order.address||'—';
    const price=o.value??o.cod??o.price??order.value??order.cod??'—';
    return `<article class="ship-label"><header><div class="brand"><img src="${escLabel(COMPANY_BRANDING.logo_url||'/trend-logo.jpeg')}" alt=""><b>${escLabel(COMPANY_BRANDING.name||'Delivery')}</b></div><span class="label-status">TO BE PICKUP</span></header>
      <div class="label-job-code">JOB CODE: ${escLabel(jobCode)}</div><div class="label-barcode">${barcode}<strong>${escLabel(tracking||'—')}</strong></div>
      <div class="ship-label-grid">${field('ORDER NUMBER',o.merchant_order_no||o.order_code||order.merchant_order_no||'—')}${field('SHIPMENT NUMBER',shipmentNo)}${field('SHIPPER / CODE',`${shipperName}${shipperCode?' — '+shipperCode:''}`)}${field('CUSTOMER',o.customer_name||order.customer_name||o.customer?.name||'—')}${field('PHONE 1',o.customer_phone||o.phone||order.customer_phone||'—')}${field('PHONE 2',o.customer_phone_2||order.customer_phone_2||'—')}${field('EMIRATE',emirate||'—')}${field('REGION',region)}${field('ADDRESS',address)}${field('COD AMOUNT',price)}${field('NOTES',o.notes||order.notes||'—')}</div><footer>LABEL ${index+1} OF ${data.length}</footer></article>`;
  }).join('');
  const w=targetWindow||window.open('','_blank');if(!w)return alert('Allow popups to print shipping labels.');
  w.document.open();
  w.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shipping Labels</title><style>
    @page{size:100mm 150mm;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .ship-label{width:96mm;height:146mm;padding:3mm;border:0.35mm solid #111;overflow:hidden;display:flex;flex-direction:column;gap:2.2mm;page-break-after:always;break-after:page;break-inside:avoid}
    .ship-label:last-child{page-break-after:auto;break-after:auto}.ship-label header{display:flex;align-items:center;justify-content:space-between;gap:2mm;border-bottom:1mm solid #111;padding-bottom:2mm;min-height:12mm}.brand{display:flex;align-items:center;gap:2mm;min-width:0}.brand img{width:17mm;height:10mm;object-fit:contain}.brand b{font-size:9pt;line-height:1.1;overflow-wrap:anywhere}.label-status{font-size:7pt;font-weight:900;border:0.5mm solid #111;padding:1.2mm;text-align:center;max-width:29mm}.label-job-code{text-align:center;font-size:14pt;font-weight:900;line-height:1.1;overflow-wrap:anywhere;padding:1mm 0}.label-barcode{min-height:25mm;max-height:27mm;text-align:center;overflow:hidden;border-bottom:.3mm solid #555;padding-bottom:1mm}.label-barcode svg{display:block;margin:0 auto;width:85mm;max-width:100%;height:17mm}.label-barcode strong{display:block;font-family:monospace;font-size:11pt;letter-spacing:.6mm;line-height:1.2;overflow-wrap:anywhere}.barcode-missing{font-size:9pt;font-weight:800;padding:5mm}.ship-label-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 2mm;align-content:start;min-height:0}.label-field{min-width:0;border-bottom:.25mm solid #aaa;padding:0 0 1mm;overflow:hidden}.label-field span{display:block;font-size:6.5pt;font-weight:800;color:#333;line-height:1.05;margin-bottom:.7mm}.label-field b{display:block;font-size:8.5pt;font-weight:800;line-height:1.1;overflow-wrap:anywhere;word-break:break-word;max-height:12mm;overflow:hidden}.label-field:nth-child(9),.label-field:nth-child(11){grid-column:1/-1}.ship-label footer{margin-top:auto;border-top:.3mm solid #777;padding-top:1mm;text-align:center;font-size:6pt;font-weight:700;color:#555}
    @media screen{body{background:#e8ebf0}.ship-label{background:#fff;margin:5mm auto;box-shadow:0 1mm 4mm #0002}}@media print{html,body{width:100mm}.ship-label{margin:0}}
  </style></head><body>${cards}<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  w.document.close();
}
function printRowsPDF(rows,title){
  const data=Array.isArray(rows)?rows:[];
  const isDashboardShipments=String(title||"").toLowerCase().includes("dashboard-shipments");
  const dashboardColumns=[
    ["tracking_number",L("Tracking Number","رقم التتبع")],
    ["order_number",L("Order Number","رقم الاوردر")],
    ["shipment_number",L("Shipment Number","رقم الشحنه")],
    ["merchant",L("Shipper","اسم التاجر وكوده")],
    ["price",L("Price","السعر")],
    ["driver",L("Driver","السائق")],
    ["status",L("Status","حالة الاوردر")],
    ["last_status_date",L("Last Status Date","التاريخ")]
  ];
  // Dashboard Shipments PDF always receives the exact visible dashboard columns.
  // Normalize nested shipment rows as well, so row-actions and bulk-actions can never
  // produce a table with empty cells.
  const normalizedData=isDashboardShipments
    ? data.map(r=>{
        if(r?.order || r?.merchant || r?.driver){
          return dashboardShipmentExportRow(r);
        }
        return {
          tracking_number:r?.tracking_number??"",
          order_number:r?.order_number??"",
          shipment_number:r?.shipment_number??r?.shipment_no??"",
          merchant:r?.merchant??"",
          price:Number(r?.price??0),
          driver:r?.driver??"NA",
          status:r?.status??"",
          last_status_date:r?.last_status_date??"",
          created_by_name:r?.created_by_name??""
        };
      })
    : data;
  const keys=isDashboardShipments
    ? [...dashboardColumns, ...(normalizedData.some(r=>r?.created_by_name)?[["created_by_name",L("Order Created By","الموظف منشئ الأوردر")]]:[])]
    : [...new Set(normalizedData.flatMap(x=>Object.keys(x||{})))].map(k=>[k,k==='created_by_name'?L('Order Created By','الموظف منشئ الأوردر'):k]);
  const moneyKeys=new Set(["value","delivery_fee","service_charges","amount","tax_amount","merchant_net_value","orderValue","deliveryFees","taxes","merchantNet","fuel_expense","other_expenses","net_commission","expenseTotal","shortageTotal","required","base_delivery_fee","price"]);

  const header=keys.map(([,label])=>`<th>${esc(label)}</th>`).join("");
  const body=normalizedData.length
    ? normalizedData.map(r=>`<tr>${keys.map(([key])=>{
        let value=r?.[key]??"";
        if(moneyKeys.has(key)&&typeof value==="number") value=money(value);
        return `<td>${esc(value)}</td>`;
      }).join("")}</tr>`).join("")
    : `<tr><td colspan="${keys.length}" class="empty">${esc(L("No data","لا توجد بيانات"))}</td></tr>`;

  const dir=LANG==="ar"?"rtl":"ltr";
  const generatedAt=new Date().toLocaleString(LANG==="ar"?"ar-EG":"en-US");
  const html=`<!doctype html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4 landscape;margin:12mm}
  html{background:#e9edf3}body{font-family:Arial,Tahoma,sans-serif;margin:0;padding:0;color:#111;background:#e9edf3;direction:${dir}}
  .print-wrap{width:297mm;min-height:210mm;margin:20px auto;padding:12mm;background:#fff;box-shadow:0 3px 18px #0002}
  @media screen{.print-wrap{width:min(297mm,calc(100vw - 24px));min-height:auto;min-height:210mm;padding:clamp(10px,3vw,12mm)}}
  .print-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px}
  h1{font-size:20px;margin:0 0 6px}
  .meta{font-size:11px;color:#666}
  table{width:100%;border-collapse:collapse;table-layout:auto;font-size:10px}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  th,td{border:1px solid #555;padding:6px 5px;vertical-align:middle;text-align:${LANG==="ar"?"right":"left"};word-break:break-word}
  th{font-weight:700;background:#eee;color:#111}
  tbody tr:nth-child(even){background:#fafafa}
  .empty{text-align:center;padding:18px;color:#777}
  .footer{margin-top:10px;font-size:9px;color:#777;text-align:${LANG==="ar"?"right":"left"}}
  @media print{
    html,body{background:#fff;margin:0;padding:0}
    .print-wrap{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
    .no-print{display:none!important}
  }
</style>
</head>
<body>
<div class="print-wrap">
  <div class="print-head">
    <div class="print-brand"><img src="${esc(COMPANY_BRANDING.logo_url||"/trend-logo.jpeg")}" alt=""><strong>${esc(COMPANY_BRANDING.name||"Delivery")}</strong></div>
    <div>
      <h1>${esc(isDashboardShipments?L("Dashboard Shipments","Dashboard Shipments"):title)}</h1>
      <div class="meta">${esc(L("Generated","تم الإنشاء"))}: ${esc(generatedAt)} — ${esc(L("Records","عدد السجلات"))}: ${normalizedData.length}</div>
    </div>
  </div>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="footer">${esc(COMPANY_BRANDING.name||L("Delivery","Delivery"))}</div>
</div>
<script>
  window.addEventListener("load",()=>setTimeout(()=>window.print(),150));
</script>
</body>
</html>`;

  const w=window.open("","_blank");
  if(!w)return alert(L("Allow popups to print/save PDF","اسمح بالنوافذ المنبثقة للطباعة وحفظ PDF"));
  w.document.open();
  w.document.write(html);
  w.document.close();
} 

async function showReturnTimeline(id){
  try{
    const d=await api(`/api/returns/${encodeURIComponent(id)}`);
    const x=d.data||{};
    const rows=[
      [L('Return Transaction','عملية المرتجع'),x.return_transaction_no||x.return_operation_no||'—'],
      [L('Tracking','التتبع'),x.tracking_number||'—'],
      [L('Order','الأوردر'),x.order_number||'—'],
      [L('Current Status','الحالة الحالية'),x.return_status||x.status||'—']
    ];
    let searchItem=null;
    const searchKey=x.tracking_number||x.order_number||'';
    if(searchKey){
      const result=await api(`/api/search?q=${encodeURIComponent(searchKey)}`).catch(()=>null);
      const results=Array.isArray(result?.results)?result.results:(result?.data?[result.data]:[]);
      searchItem=results.find(item=>{
        const orderId=String(item?.order?.id||item?.order_id||(item?.order?null:item?.id)||'');
        const shipmentId=String(item?.shipment?.id||item?.shipment_id||'');
        return (x.order_id&&orderId===String(x.order_id))||(x.shipment_id&&shipmentId===String(x.shipment_id));
      })||results[0]||null;
    }
    document.getElementById('returnTimelineDialog')?.remove();
    const box=document.createElement('div');box.id='returnTimelineDialog';box.className='modal-backdrop';
    const timelineId=`returnSearchTimeline_${String(id).replace(/[^a-zA-Z0-9_-]/g,'')}`;
    box.innerHTML=`<div class="modal-card" style="max-width:900px;width:min(96vw,900px)">
      <div class="section-title-row"><div><h3>${L('Return Timeline','الخط الزمني للمرتجع')}</h3><p class="muted">${esc(x.tracking_number||x.return_transaction_no||'')}</p></div><button class="ghost" type="button" onclick="this.closest('.modal-backdrop')?.remove()">✕</button></div>
      <div class="table-wrap"><table><tbody>${rows.map(r=>`<tr><th style="width:35%">${esc(r[0])}</th><td>${esc(String(r[1]??'—'))}</td></tr>`).join('')}</tbody></table></div>
      <div class="search-section-heading"><span class="search-section-icon violet">◷</span><b>${L('Movement Timeline','الخط الزمني للحركات')}</b></div>
      <div id="${timelineId}" class="quick-search-timeline-empty"><span class="muted">${L('Loading timeline…','جارٍ تحميل سجل الحركات...')}</span></div>
    </div>`;
    document.body.appendChild(box);
    if(searchItem) renderSearchMovementTimeline(searchItem,timelineId);
    else {const timeline=$(timelineId);if(timeline)timeline.innerHTML=`<p class="muted">${L('No timeline history found.','لا يوجد سجل حركات مسجل لهذا الأوردر.')}</p>`;}
  }catch(e){alert(e.message);}
}

// Compatibility alias: the existing Delivery Job UI still calls createJob.
const createJob = createDeliveryJobFromSelection;

Object.assign(window,{loadShipperFinancial,resetShipperFinancialFilters,filterShipperFinancialRows});
Object.assign(window,{setAccountingExpenseMode,printShipperStatement,printPreSettlementShipperOrders,toggleMerchantStatementOrderSelection,updateMerchantStatementOrderSelection,runMerchantStatementOrderAction,showAccountingPayrollOnly,employeeWagesPage,togglePayrollDriverFields,savePayrollEmployee,loadPayrollPeriod,generatePayrollPeriod,openPayrollAdjustmentModal,closePayrollModal,savePayrollAdjustmentModal,openPayrollPaymentModal,savePayrollPaymentModal,printPayrollReceipt,openDriverCommissionModal,closeDriverCommissionModal,loadDriverCommissionModal,toggleSidebar,toggleMobileSidebar,closeMobileSidebar,toggleReturnSelection,toggleAllReturns,clearReturnSelection,openReturnsBulkActions,confirmReturnsReturnToOrigin,printSelectedReturnsBeforeArchive,printSingleReturnBeforeArchive,printReturnMerchantPDF,printReturnOrderPDF,showReturnTimeline,printReturnOperationPDF,exportReturnOrderExcel,showReturnDetails,editReturnNote,uploadReturnProof,returnToOrigin,returnActions,returnArchiveActions,printReturnArchivePDF,previewReturnProof,generateMerchantFinancial,deleteArea,deleteAllAreas,deleteAllGovernorates,editArea,loadCompanyFinancial,saveCompanyFinancialAdjustment,deleteCompanyFinancialAdjustment,printCompanyFinancial,exportCompanyFinancialExcel,saveMerchantSettlement,toggleMerchantSettlementBank,showOrderDeleteTool,showActiveOrderDeleteSearch,searchOrderForDelete,loadDeletedOrders,restoreDeletedOrder,permanentlyDeleteArchivedOrder,confirmDeleteOrder,confirmDeleteOrders,deleteSelectedOrders,deleteSelectedOrder,toggleDeleteOrderSelection,updateDeleteOrderSelection,adminToolsPage,openCustomizeMenu,saveCustomizeMenu,resetCustomizeMenu,addCustomizeFolder,printShipperSettlement,exportShipperSettlementExcel,generateMerchantFinancial,editEligibleOrderFee,editSelectedEligibleOrderFees,editAllEligibleOrderFees,toggleAllSettlementShippers,syncMerchantSettlementCheck,toggleDailyShipperChecks,toggleDailyShipperOrderChecks,printSelectedDailyShipperOrders,printSelectedDailyShippers,exportSelectedDailyShippersExcel,exportSelectedDailyShipperOrdersExcel,exportSelectedSettlementOrders,toggleSettlementOrderChecks,printSelectedSettlementOrders,toggleInvoiceReportActions,bulkMarkSelectedOrdersPaid,changeShipperSettlementState,uploadShipperSettlementProof,removeShipperSettlementOrder,exportSelectedSettlementArchive,toggleAllSettlementArchive,updateSettlementArchiveSelection,printSelectedSettlementArchive,saveAdminCompanyName,saveAdminCompanyLogo,changeAdminPassword,showShipperImportTool,importShipperData,showShipperRatesTool,saveShipperRate,editShipperRate,deleteShipperRate,importShipperRatesExcel,filterShipperRates,showExternalOrderImportTool,importExternalOrders,login,logout,toggleLang,show,quickSearch,checkOrderNumberDuplicate,wireOrderDuplicateCheck,saveAccountingDriverPayment,selectAccountingDriverPayment,toggleDriverPaymentBank,doSearch,openOrder,saveOrder,updateOrderFromForm,editOrderPage,searchOrdersForEdit,loadShipments,setStatus,createJob,loadDeliveryJobBoard,createDeliveryJobFromSelection,removeDeliveryJobOrder,openDeliveryJobActions,openDeliveryJobTransfer,confirmDeliveryJobTransfer,openSingleDeliveryJobStatus,applySingleDeliveryJobStatus,openDeliveryJobStatusPicker,chooseDeliveryJobStatus,confirmDeliveryJobLocationChange,saveJobCode,scanDriverPage,saveScanDriver,loadScanDriverRows,deleteScanDriverOrder,transferSelectedScanDriver,addMerchant,addShipper:addMerchant,editMerchant,editMerchantAccount,saveMerchantAccount,setMerchantAccountEnabled,loadMerchantAccounts,addGovernorate,addArea,importAreasExcel,saveExpense:saveOrdersVerificationExpense,addEmployee,editEmployee,toggleEmployee,deleteEmployee,addRole,importOrdersExcel,downloadOrderExcelTemplate,orderExcelPage,sendChat,clearChatAttachment,toggleChatRecording,exportRowsExcel,exportOrderRowsExcel,clearAreaFile,printRowsPDF,exportShipmentsExcel,exportShipmentsPDF,exportDeliveryJobStatementExcel,exportDeliveryJobStatementPDF,selectDriverOrders,driverOptions,driverOrderOptions,changeDriverOrderStatus,removeDriverOrderToOps,transferDriverOrder,showDriverReturn,exportDriverStatementExcel,refreshDriversMapLocations,testWoo,importWoo,addWooIntegration,toggleShipmentRowActions,shipmentRowAction,ordersVerificationPage,loadOrdersVerification,editOrdersVerificationOrder,verifyOneOrdersVerification,verifyAllOrdersVerification,removeVerificationOrder,loadOrdersVerificationExpenses,loadOrdersVerificationSettlement,saveOrdersVerificationSettlement,updateOrdersVerificationSettlementBalance,saveOrdersVerificationExpense,editOrdersVerificationExpense,deleteOrdersVerificationExpense,resetOrdersVerificationExpenseForm,openOperationsActionMenu,operationsChangeStatus,openShipmentNumberMenu,copyShipmentNumber,patchOutscanShipment,openOrderByShipment,openNewChat,createChatConversation,openChatConversation,sendChat,deleteChatMessage,openChatGroupMembers,addChatMembers,removeChatMember,closeChatModal,chatPrimeSound,openOperationsBulkActions,operationsBulkChangeStatus,chooseOperationsDriverAndAssign,confirmOperationsBatchOutscan,openFutureDeliveryDialog,printSelectedOperationsLabels});
// Compatibility aliases for older cached/legacy handlers.
window.loadOrdersVerification = loadOrdersVerification;
window.loadOrdersVerfiction = loadOrdersVerification;
window.loadOrdersVerfication = loadOrdersVerification;
window.ordersVerificationPage = ordersVerificationPage;

// System-wide keyboard navigation for every custom search/autocomplete list.
document.addEventListener("keydown",e=>{
  if(e.defaultPrevented || (e.key!=="ArrowDown" && e.key!=="ArrowUp")) return;
  const input=e.target?.closest?.(".search-select-input,.autocomplete-input,[role=combobox]");
  if(!input) return;
  const menu=input.closest?.('.search-select')?.querySelector?.('.search-select-menu') || input.closest?.('.autocomplete')?.querySelector?.('.autocomplete-menu');
  if(!menu) return;
  const buttons=[...menu.querySelectorAll(".search-select-option,.autocomplete-option,[role=option]")];
  if(!buttons.length) return;
  e.preventDefault();
  let idx=buttons.findIndex(b=>b.classList.contains("active") || b.getAttribute("aria-selected")==="true");
  idx=e.key==="ArrowDown" ? (idx<0?0:Math.min(idx+1,buttons.length-1)) : (idx<0?buttons.length-1:Math.max(idx-1,0));
  buttons.forEach((b,i)=>{b.classList.toggle("active",i===idx);b.setAttribute("aria-selected",i===idx?"true":"false");});
  buttons[idx]?.scrollIntoView?.({block:"nearest"});
},true);

// Login must submit from Enter in either credential field, even though the
// visual login button is intentionally type="button" (not a form submitter).
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter" || e.defaultPrevented) return;
  const target=e.target;
  if(target?.id==="username" || target?.id==="password"){
    e.preventDefault();
    if(!document.getElementById("loginBtn")?.disabled) login();
    return;
  }
},true);

// System-wide Enter support: focused buttons/actions behave like a click,
// while existing field-specific handlers (search, autocomplete, login, etc.)
// keep priority so Enter never triggers an unrelated action.
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter" || e.defaultPrevented) return;
  const target=e.target;
  if(!target || target.disabled) return;
  if(target.closest?.(".search-select-menu,.autocomplete-menu,[role=combobox]")) return;
  if(target.tagName!=="BUTTON" && target.getAttribute?.("role")==="button"){
    e.preventDefault();
    target.click();
    return;
  }
  if(target.tagName==="INPUT" || target.tagName==="SELECT"){
    const form=target.form || target.closest?.("form");
    const submit=form?.querySelector?.('button[type="submit"],input[type="submit"]');
    if(submit && !submit.disabled){ e.preventDefault(); submit.click(); return; }
    const action=target.closest?.(".panel,.card,.modal,.form-section")?.querySelector?.("button.primary,button[type=submit],.actions button:not(.ghost)");
    if(action && !action.disabled){ e.preventDefault(); action.click(); }
  }
});

window.addEventListener("pageshow",async e=>{if(!e.persisted)return;});

document.addEventListener("click",e=>{
  // mobileSidebarToggle already has an inline handler in index.html.
  // Do not toggle it a second time here, or the sidebar opens and closes
  // during the same tap and appears to do nothing.
  if(e.target?.id==="mobileSidebarScrim"){closeMobileSidebar();return;}
});
window.addEventListener("resize",()=>{if(window.innerWidth>800)closeMobileSidebar();});

document.addEventListener("DOMContentLoaded",async()=>{
  // Load the public company display name/logo before presenting the login form.
  const publicBrandingPromise=loadPublicCompanyBranding();
  // Do not restore a saved session after a full hour of inactivity, including
  // when the browser suspended JavaScript timers in the background.
  const savedActivity = Number(safeStorageGet(sessionStorage, TREND_IDLE_KEY, "0")) || 0;
  if (savedActivity > 0 && Date.now() - savedActivity >= TREND_IDLE_TIMEOUT_MS) {
    await logout(true);
    return;
  }
  // Authenticate independently from loading the menu/dashboard. A 401 from
  // any later page API must not be mistaken for an expired login session.
  let me=null, lastAuthError=null;
  for(let attempt=0; attempt<3; attempt++){
    try{
      me=await api("/api/me");
      if(me?.user) break;
      me=null;
      lastAuthError=new Error("AUTH_REQUIRED");
    }catch(authError){
      lastAuthError=authError;
      // Retry /api/me using only the browser's HttpOnly cookie after ANY
      // failure from the shared API wrapper. Fetch/network/redirect failures
      // do not necessarily mean the session is invalid.
      if(attempt===0){
        try{
          const r=await fetch("/api/me",{method:"GET",credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
          const d=await r.json().catch(()=>({}));
          if(r.ok && d?.user){me=d;break;}
          const cookieError=new Error(d?.error||`HTTP ${r.status}`);
          cookieError.status=r.status;
          lastAuthError=cookieError;
        }catch(cookieFetchError){lastAuthError=cookieFetchError;}
      }
    }
    if(attempt<2) await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }

  if(!me?.user){
    await publicBrandingPromise;
    // Distinguish an actually invalid session from a temporary API/server failure.
    // Never clear the cookie or stored session here. If the server confirms a
    // valid signed session, recover the UI from the last verified user profile
    // and offer retry; all protected API requests remain server-authenticated.
    let diagnostic=null;
    try{
      const dr=await fetch("/api/session-diagnostic",{method:"GET",credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
      diagnostic=await dr.json().catch(()=>null);
    }catch(_){}
    let cachedUser=null;
    try{cachedUser=JSON.parse(sessionStorage.getItem("trend_cached_user_v7")||"null");}catch(_){}
    // Recover directly from the signed server session if localStorage is empty
    // or unavailable. The diagnostic endpoint only returns this user from a
    // cryptographically valid cookie/bearer token.
    if(!cachedUser?.id && diagnostic?.user?.id) cachedUser=diagnostic.user;
    const serverConfirmsSession=Boolean(diagnostic?.cookieValid||diagnostic?.bearerValid);
    const temporaryFailure=lastAuthError?.status!==401;

    if(cachedUser?.id && (serverConfirmsSession || temporaryFailure)){
      CURRENT_USER=cachedUser;
      await loadCompanyBranding();
      applyLanguage();
      updateCurrentUserUI();
      $("login")?.classList.add("hidden");
      $("login")?.setAttribute("style","display:none!important");
      $("app")?.classList.remove("hidden");
      $("app")?.setAttribute("style","display:block!important");
      const c=$("content");
      if(c)c.innerHTML=`<div class="panel"><h2>${esc(L("Session is being restored","جاري استعادة جلسة الدخول"))}</h2><p class="muted">${esc(L("The server has not returned your profile yet. Your saved session was kept; retry without signing in again.","السيرفر لم يُرجع بيانات المستخدم بعد. احتفظنا بالجلسة المحفوظة؛ أعد المحاولة دون تسجيل الدخول من جديد."))}</p><button class="primary" type="button" onclick="location.reload()">${esc(L("Retry","إعادة المحاولة"))}</button></div>`;
      return;
    }

    CURRENT_USER=null;
    applyLanguage();
    $("app")?.classList.add("hidden");
    $("app")?.setAttribute("style","display:none!important");
    $("login")?.classList.remove("hidden");
    $("login")?.setAttribute("style","display:flex!important");
    const lm=$("loginMsg");
    if(lm) lm.textContent=temporaryFailure
      ? L("The server is temporarily unavailable. Your saved login was kept; refresh or retry shortly.","السيرفر غير متاح مؤقتًا. احتفظنا بتسجيل الدخول المحفوظ؛ حدّث الصفحة أو أعد المحاولة بعد قليل.")
      : (lastAuthError?.message||L("Your session could not be verified. Please sign in again.","تعذر التحقق من الجلسة. سجل الدخول مرة أخرى."));
    return;
  }

  CURRENT_USER=me.user;
  if (!Number(safeStorageGet(sessionStorage, TREND_IDLE_KEY, "0"))) safeStorageSet(sessionStorage, TREND_IDLE_KEY, String(Date.now()));
  trendLastActivityWrite = Number(safeStorageGet(sessionStorage, TREND_IDLE_KEY, "0")) || Date.now();
  trendLastActivityAt = trendLastActivityWrite;
  startIdleTimer();
  // Branding and menu preferences are independent requests; fetch them in
  // parallel so initial navigation waits for one network round trip, not two.
  const initialUiLoads = Promise.all([loadCompanyBranding(), loadMenuConfig()]);
  try{sessionStorage.setItem("trend_cached_user_v7",JSON.stringify(CURRENT_USER));}catch(_){}
  applyLanguage();
  updateCurrentUserUI();
  $("login")?.classList.add("hidden");
  $("login")?.setAttribute("style","display:none!important");
  $("app")?.classList.remove("hidden");
  $("app")?.setAttribute("style","display:block!important");

  // A failure in menu/page APIs must not turn a valid session into a logout.
  try{
    await initialUiLoads;
    renderSidebar();
    const requestedPage=new URLSearchParams(location.search).get("page")||"dashboard";
    await show(requestedPage);
    startNotificationPolling();
    startChatNotifications();
  }catch(pageError){
    console.error("Initial page load failed; authenticated session preserved.",pageError);
    const c=$("content");
    if(c)c.innerHTML=`<div class="panel"><h2>${esc(L("Could not load the page","تعذر تحميل الصفحة"))}</h2><p class="muted">${esc(pageError?.message||L("Your login is still active. Please retry.","تسجيل دخولك ما زال فعالًا. حاول مرة أخرى."))}</p><button class="primary" type="button" onclick="location.reload()">${esc(L("Retry","إعادة المحاولة"))}</button></div>`;
  }
});

window.addEventListener("popstate",async()=>{
  if(!CURRENT_USER) return;
  const page=new URLSearchParams(location.search).get("page")||"dashboard";
  await show(page);
});


