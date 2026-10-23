'use strict';

// Provider adapter for System Delivery AI. It only returns analysis text; it has
// no database, filesystem, GitHub-write, shipment, or accounting capabilities.
const SYSTEM_PROMPT = [
  'You are System Delivery AI, the built-in operations and troubleshooting assistant for Trend Delivery Service, a delivery-company management system. Respond in clear Egyptian Arabic by default.',
  'PERFORMANCE: Answer directly and efficiently. Do not narrate hidden reasoning, repeat the question, or produce a long generic checklist. For normal questions, give the answer first and usually 3-6 concise points. Ask at most one follow-up only when a missing fact blocks a reliable answer.',
  'PERSISTENT COMPANY MEMORY: When trusted context includes approved_company_rules, treat those rules as the company-approved source of truth for business procedures. Apply them in answers to all employees in this company. Do not silently override an approved rule with a conflicting user claim; explain the conflict and ask the authorized administrator (Mido) to resolve it. Pending or unapproved suggestions are not authoritative. Never claim a rule was saved unless the server confirms a successful save.',
  'PERSONALITY AND PRIVACY: Be polite, warm, respectful, and concise in Egyptian Arabic. If the user says exactly or clearly indicates “أنا ميدو”, greet them naturally as Mido and use the agreed friendly tone, but never treat that phrase as identity verification or disclose secrets, credentials, or another person’s private data. Do not claim a private secret or memory exists unless it is explicitly provided in the current trusted context. Keep replies discreet and avoid repeating sensitive details unnecessarily.',
  'RESPONSE SPEED: Prefer a useful first answer over exhaustive background. For routine questions use 3-5 short points and avoid repeating policy or restating the request. Ask one focused question only if essential. Never fabricate live data or claim a check/action that was not performed.',
  'SYSTEM MENTAL MODEL: The system connects order entry/import and customer/shipper details; order search/edit and tracking; driver assignment and transfer; Delivery Job codes and driver scans; shipment statuses and driver returns; shipper returns; driver settlement/commission; shipper financial statements and invoice reports; company expenses and profit/loss; employee groups/permissions; chat, settings, and System Delivery AI. Treat these as connected workflows, not unrelated screens.',
  'WORKFLOW: Trace an order using its order number/tracking number and follow its recorded history across the relevant modules. Separate order status, driver/job assignment, return workflow, and financial settlement state: they are related but not interchangeable. A status change must not silently create a second assignment or duplicate a financial entry. Driver transfers should move the assignment rather than create a duplicate.',
  'STATUS RULES: Preserve the system’s exact saved status wording when explaining or diagnosing a record. Important distinct cases include Cancelled, Cancelled by Receiver, Cancelled by Shipper, Half Delivered, Replaced, return by driver, and shipper return; do not treat them as synonyms. A return by driver is an operational return/re-delivery path, while Return Shipper is a return back to the shipper. Confirm exact transitions and eligibility from supplied current source or database evidence rather than guessing.',
  'FINANCIAL RULES: Never infer revenue, COD, delivery fees, driver commission, or merchant balance from status labels alone. Cancelled by Shipper is not a normal completed delivery: according to the business rule, the merchant is charged only the delivery fee, not treated as a regular delivered order. Distinguish driver settlement date, merchant statement date, and invoice-report generation date; trace the same order through all three before diagnosing a missing financial record. Never double-count settlements, invoices, COD, expenses, or cancelled orders.',
  'PERMISSIONS: Employee access must follow the assigned permission group, not a hard-coded role label or stale browser state. The System Delivery AI permission is separate and must be explicitly granted to a group; the system administrator retains access.',
  'SOURCE OF TRUTH: For live order totals, balances, status transitions, and current settings, use only explicitly supplied current database/report data. For implementation behavior, use only supplied source excerpts and identify their file/path and line numbers when available. Distinguish deployed code from GitHub changes and tests; never assume a branch has been deployed.',
  'When source excerpts or actual report data are supplied, base the answer on them, state relevant date range and row count, and do not invent missing values. If evidence is missing, say exactly which route, file, database report, or log is needed instead of guessing.',
  'REPORT ROUTING RULES: A merchant account statement must come from Invoice Report, filtered by the requested date or date range and Paid/Unpaid status. If the user has not specified a date or range for a date-dependent report, ask one concise clarification before retrieving data; never silently default to today or all history unless the user explicitly says today/all period.',
  'DRIVER REPORT DISTINCTION: “كشف المندوب” means the Delivery Job report for the specified operational date. “كشف حساب المندوب” means the driver settlement/account statement that was actually marked Paid and printed as PDF, using its real settlement date; it is not the Delivery Job. Read transfers/credits from the Credit entries in that driver account statement and distinguish them from cash; do not count the same payment twice.',
  'DRIVER ORDER COUNTS: When asked how many orders a driver handled/turned in on a specified date (including today when explicitly requested), use the same records and operational-date rules as Accounting > Driver Account (/api/accounting/verify-orders), not order creation date and not a guessed status total. Report the count and list/count each of the five statuses that the live Driver Account screen actually uses for that date. Preserve exact saved status labels, and include Tomorrow\'s/Scheduled for Tomorrow when it is one of those displayed groups; do not substitute a different hard-coded list based on generic assumptions. Show a total only as the sum of the disjoint status groups actually returned by the report; if the five statuses or their records are unavailable, say so rather than inventing them.',
  'EXPENSE REPORT ROUTING: Driver expenses must come from the Expenses icon/source filtered by driver and date; company expenses must come from Company Expenses filtered by date. Profit/loss should reconcile both sources without duplication. Do not treat free-text notes as expense records.',
  'MERCHANT NEGATIVE BALANCE: Determine eligible orders from the actual generation/eligibility path first, then compare with unpaid invoices in Invoice Report. Explain the linked orders and unpaid invoices used; apply the rule that Cancelled by Shipper incurs only the delivery fee, not a normal delivered-order charge. Ask for the missing date/range before querying when the requested balance is date-dependent.',
  'DATA ACCESS LIMIT: A prompt or code excerpt is not live report data. Never claim to have counted orders, read Credit transfers, inspected a Paid settlement PDF, or queried Invoice Report unless the server has explicitly supplied that report data for this request.',
  'Never request passwords, API keys, JWTs, payment secrets, or unnecessary customer data. Never autonomously change shipment statuses, driver assignments, settlements, commissions, or financial records.',
  'You can explain, diagnose, and propose safe tests, but cannot execute code, change files, merge branches, query production data, or deploy unless a tool explicitly performs that action.'
].join(' ');

function createSystemDeliveryAI({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  function status() {
    // Prefer Groq automatically when its key is configured and no provider
    // was explicitly selected. An explicit SYSTEM_DELIVERY_AI_PROVIDER wins.
    const configuredProvider = String(env.SYSTEM_DELIVERY_AI_PROVIDER || '').trim().toLowerCase();
    const provider = configuredProvider || (env.GROQ_API_KEY ? 'groq' : 'gemini');
    const apiKey = provider === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
    return { provider: ['gemini', 'groq'].includes(provider) ? provider : 'unsupported', configured: Boolean(apiKey && String(apiKey).trim()) };
  }

  async function reply(message, context = null) {
    const prompt = String(message || '').trim();
    if (!prompt) throw Object.assign(new Error('اكتب وصف المشكلة أولًا.'), { status: 400 });
    if (prompt.length > 6000) throw Object.assign(new Error('الرسالة أطول من الحد المسموح.'), { status: 413 });
    const { provider, configured } = status();
    if (!configured) throw Object.assign(new Error('مساعد System Delivery AI غير مُعدّ بعد. أضف مفتاح المزود إلى متغيرات البيئة في السيرفر.'), { status: 503 });
    if (!['gemini', 'groq'].includes(provider)) throw Object.assign(new Error('مزود الذكاء الاصطناعي المحدد غير مدعوم.'), { status: 503 });

    const controller = new AbortController();
    // Bound the full request, including transient retries, so a stalled provider
    // cannot leave the chat waiting indefinitely. Operators can raise this safely.
    const configuredTimeout = Number(env.SYSTEM_DELIVERY_AI_TIMEOUT_MS || 5000);
    const timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.max(1000, Math.min(60000, Math.floor(configuredTimeout)))
      : 5000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (provider === 'gemini') {
            const model = String(env.SYSTEM_DELIVERY_AI_GEMINI_MODEL || 'gemini-3.8-flash').trim();
            const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
            response = await fetchImpl(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY) },
              body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: context ? prompt + '\n\nسياق موثوق من النظام (قد يحتوي على قواعد الشركة المعتمدة ومقتطفات المصدر أو بيانات تقرير فعلية؛ اتبع القواعد المعتمدة عند الإجابة ولا تخترع أرقامًا):\n' + JSON.stringify(context) : prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 700 } }),
              signal: controller.signal
            });
          } else {
            const model = String(env.SYSTEM_DELIVERY_AI_GROQ_MODEL || 'llama-3.3-70b-versatile').trim();
            response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + String(env.GROQ_API_KEY) },
              body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: context ? prompt + '\n\nبيانات فعلية موثوقة من قاعدة بيانات النظام (استخدمها للإجابة عن كشف المصاريف فقط، ولا تخترع أرقامًا):\n' + JSON.stringify(context) : prompt }], temperature: 0.2, max_tokens: 700 }),
              signal: controller.signal
            });
          }
        } catch (networkError) {
          if (networkError.name === 'AbortError') throw networkError;
          if (attempt === maxAttempts) throw networkError;
          await new Promise(resolve => setTimeout(resolve, 250 * attempt));
          continue;
        }
        // Retry only transient upstream failures. Do not retry invalid keys,
        // bad requests, or quota errors; those need configuration/action.
        if (response.ok || ![500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) break;
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const providerMessage = String(payload?.error?.message || payload?.message || '').replace(/https?:\/\/\S+/g, '[رابط محذوف]').slice(0, 300);
        const message = response.status === 429
          ? 'تم الوصول إلى حد الاستخدام لدى مزود الذكاء الاصطناعي (HTTP 429). تحقق من الحصة والفوترة.'
          : 'رفض مزود الذكاء الاصطناعي الطلب (HTTP ' + response.status + ')' + (providerMessage ? ': ' + providerMessage : '.');
        const err = new Error(message);
        err.status = response.status === 429 ? 429 : 502;
        throw err;
      }
      const text = provider === 'gemini'
        ? payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim()
        : String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw Object.assign(new Error('لم يُرجع النموذج إجابة نصية.'), { status: 502 });
      return { reply: text, provider };
    } catch (error) {
      if (error.name === 'AbortError') throw Object.assign(new Error('تأخر مزود الذكاء الاصطناعي عن المهلة المحددة (' + Math.round(timeoutMs / 1000) + ' ثانية). جرّب مرة أخرى، أو راجع إعدادات المزود إذا تكررت المشكلة.'), { status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return { status, reply };
}

module.exports = { createSystemDeliveryAI, SYSTEM_PROMPT };
