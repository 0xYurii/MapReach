/**
 * MapReach — multilingual outreach template engine.
 *
 * Templates carry a body per supported language (en / fr / ar). Variables use
 * the ${var} syntax and are replaced with plain values — template strings are
 * NEVER executed as code. Missing variables collapse to an empty string and the
 * result is tidied so no awkward punctuation or double spaces remain.
 */

import { LANGUAGES, WEBSITE_TYPES } from './constants.js';
import {
  containsArabic,
  deriveCity,
  formatRating,
  formatReviewCount,
} from './formatters.js';

/** Supported template variables. */
export const TEMPLATE_VARIABLES = Object.freeze([
  'name',
  'category',
  'address',
  'city',
  'website',
  'rating',
  'reviewCount',
]);

/**
 * Build a template object with fresh timestamps.
 * @returns {object}
 */
function makeTemplate(id, name, categoryKeywords, bodies, flags = {}) {
  const now = new Date().toISOString();
  return {
    id,
    name,
    categoryKeywords: Array.isArray(categoryKeywords) ? categoryKeywords : [],
    bodies: { en: bodies.en || '', fr: bodies.fr || '', ar: bodies.ar || '' },
    isDefault: Boolean(flags.isDefault),
    isNoWebsite: Boolean(flags.isNoWebsite),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The five editable seed templates, translated into English, French and Arabic.
 * @returns {object[]}
 */
export function getDefaultTemplates() {
  return [
    makeTemplate(
      'tpl-general',
      'General / Default',
      [],
      {
        en: "Hello ${name}, I came across your business on Google Maps. I noticed you may have an opportunity to improve your online presence. I build modern websites that help local businesses look more professional and get more customer inquiries. Would you be open to a quick chat?",
        fr: "Bonjour ${name}, j'ai découvert votre entreprise sur Google Maps. J'ai remarqué que vous pourriez avoir l'opportunité d'améliorer votre présence en ligne. Je crée des sites web modernes qui aident les entreprises locales à paraître plus professionnelles et à recevoir plus de demandes de clients. Seriez-vous ouvert à un court échange ?",
        ar: "مرحباً ${name}، لقد اطّلعت على نشاطكم التجاري على خرائط Google. لاحظت أن لديكم فرصة لتحسين حضوركم على الإنترنت. أنا أصمّم مواقع إلكترونية حديثة تساعد الأنشطة المحلية على الظهور بمظهر أكثر احترافية والحصول على استفسارات أكثر من العملاء. هل تسمحون لي بمحادثة قصيرة؟",
      },
      { isDefault: true },
    ),
    makeTemplate(
      'tpl-no-website',
      'No website',
      [],
      {
        en: "Hello ${name}, I found your business on Google Maps and noticed that you may not have a website listed. I build simple, modern websites for local businesses that make it easier for customers to find services, contact you, and build trust. Would you be interested in seeing a quick idea for your business?",
        fr: "Bonjour ${name}, j'ai trouvé votre entreprise sur Google Maps et j'ai remarqué que vous n'avez peut-être pas de site web indiqué. Je crée des sites web simples et modernes pour les entreprises locales, qui permettent aux clients de trouver plus facilement vos services, de vous contacter et de vous faire confiance. Seriez-vous intéressé de voir une idée rapide pour votre entreprise ?",
        ar: "مرحباً ${name}، وجدت نشاطكم التجاري على خرائط Google ولاحظت أنه قد لا يوجد لديكم موقع إلكتروني مُدرَج. أنا أصمّم مواقع إلكترونية بسيطة وحديثة للأنشطة المحلية تسهّل على العملاء العثور على خدماتكم والتواصل معكم وبناء الثقة. هل ترغبون في رؤية فكرة سريعة لنشاطكم؟",
      },
      { isNoWebsite: true },
    ),
    makeTemplate(
      'tpl-restaurant',
      'Restaurant',
      ['restaurant', 'cafe', 'café', 'coffee', 'food', 'diner', 'bistro', 'pizzeria', 'bakery', 'brunch', 'fast food', 'grill', 'restaurant', 'مطعم', 'مقهى', 'كافيه'],
      {
        en: "Hello ${name}, I came across your restaurant on Google Maps. A clear mobile-friendly website can make it easier for customers to view your menu, location, hours, and contact details. I build modern websites for local businesses. Would you be open to a quick chat?",
        fr: "Bonjour ${name}, j'ai découvert votre restaurant sur Google Maps. Un site web clair et adapté au mobile peut permettre à vos clients de consulter plus facilement votre menu, votre emplacement, vos horaires et vos coordonnées. Je crée des sites web modernes pour les entreprises locales. Seriez-vous ouvert à un court échange ?",
        ar: "مرحباً ${name}، اطّلعت على مطعمكم على خرائط Google. وجود موقع إلكتروني واضح ومتوافق مع الهواتف يسهّل على العملاء الاطّلاع على قائمة الطعام والموقع وساعات العمل وبيانات التواصل. أنا أصمّم مواقع إلكترونية حديثة للأنشطة المحلية. هل تسمحون لي بمحادثة قصيرة؟",
      },
    ),
    makeTemplate(
      'tpl-dentist',
      'Dentist',
      ['dentist', 'dental', 'orthodont', 'clinic', 'doctor', 'medical', 'dentiste', 'cabinet dentaire', 'clinique', 'طبيب', 'أسنان', 'عيادة'],
      {
        en: "Hello ${name}, I found your clinic on Google Maps. A professional website can help new patients quickly understand your services, location, hours, and how to book an appointment. I build clean websites for local businesses. Would you be open to a quick chat?",
        fr: "Bonjour ${name}, j'ai trouvé votre cabinet sur Google Maps. Un site web professionnel peut aider les nouveaux patients à comprendre rapidement vos services, votre emplacement, vos horaires et la façon de prendre rendez-vous. Je crée des sites web soignés pour les entreprises locales. Seriez-vous ouvert à un court échange ?",
        ar: "مرحباً ${name}، وجدت عيادتكم على خرائط Google. وجود موقع إلكتروني احترافي يساعد المرضى الجدد على فهم خدماتكم وموقعكم وساعات العمل وكيفية حجز موعد بسرعة. أنا أصمّم مواقع إلكترونية أنيقة للأنشطة المحلية. هل تسمحون لي بمحادثة قصيرة؟",
      },
    ),
    makeTemplate(
      'tpl-salon',
      'Salon',
      ['salon', 'hair', 'beauty', 'barber', 'spa', 'nails', 'coiffure', 'esthétique', 'صالون', 'حلاق', 'تجميل'],
      {
        en: "Hello ${name}, I came across your salon on Google Maps. A simple website can showcase your services, prices, gallery, location, and contact information so customers can reach you more easily. Would you be open to a quick chat?",
        fr: "Bonjour ${name}, j'ai découvert votre salon sur Google Maps. Un site web simple peut mettre en valeur vos services, vos tarifs, votre galerie, votre emplacement et vos coordonnées afin que les clients puissent vous joindre plus facilement. Seriez-vous ouvert à un court échange ?",
        ar: "مرحباً ${name}، اطّلعت على صالونكم على خرائط Google. وجود موقع إلكتروني بسيط يمكن أن يُبرز خدماتكم وأسعاركم ومعرض أعمالكم وموقعكم وبيانات التواصل حتى يتمكن العملاء من الوصول إليكم بسهولة أكبر. هل تسمحون لي بمحادثة قصيرة؟",
      },
    ),
  ];
}

/**
 * Value for a single template variable, given a lead. Always a string.
 * @param {string} key
 * @param {object} lead
 * @returns {string}
 */
function valueForVariable(key, lead) {
  const l = lead || {};
  switch (key) {
    case 'name':
      return typeof l.name === 'string' ? l.name : '';
    case 'category':
      return typeof l.category === 'string' ? l.category : '';
    case 'address':
      return typeof l.address === 'string' ? l.address : '';
    case 'city':
      return (typeof l.city === 'string' && l.city) || deriveCity(l.address);
    case 'website':
      return typeof l.website === 'string' ? l.website : '';
    case 'rating':
      return formatRating(l.rating);
    case 'reviewCount':
      return formatReviewCount(l.reviewCount);
    default:
      return '';
  }
}

/**
 * Tidy a rendered message: collapse spaces, drop spaces before commas/periods,
 * remove empty brackets/quotes, and normalize blank lines. Deliberately leaves
 * spaces before ? ! : ; intact for correct French typography.
 * @param {string} text
 * @returns {string}
 */
function cleanupMessage(text) {
  return String(text)
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/"\s*"/g, '')
    .replace(/([,.])\1+/g, '$1')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

/**
 * Render a raw template body against a lead.
 * @param {string} body
 * @param {object} lead
 * @returns {string}
 */
export function renderTemplateBody(body, lead) {
  let out = typeof body === 'string' ? body : '';
  for (const key of TEMPLATE_VARIABLES) {
    out = out.split('${' + key + '}').join(valueForVariable(key, lead));
  }
  // Strip any unknown ${...} tokens so they never surface as literal text.
  out = out.replace(/\$\{[^}]*\}/g, '');
  return cleanupMessage(out);
}

/**
 * Generate a message from a template in a given language, falling back to
 * English then any populated body if the requested language is empty.
 * @param {object} template
 * @param {object} lead
 * @param {('en'|'fr'|'ar')} lang
 * @returns {string}
 */
export function generateMessage(template, lead, lang) {
  if (!template || !template.bodies) return '';
  const order = [lang, 'en', ...LANGUAGES];
  let body = '';
  for (const code of order) {
    if (typeof template.bodies[code] === 'string' && template.bodies[code].trim()) {
      body = template.bodies[code];
      break;
    }
  }
  return renderTemplateBody(body, lead);
}

/**
 * Choose the best template for a lead:
 *   1. No real website  -> the "No website" template (strongest pitch).
 *   2. Category keyword  -> first template whose keywords match the category.
 *   3. Fallback          -> the default template (or the first template).
 * @param {object[]} templates
 * @param {object} lead
 * @returns {{ template: object, reason: string }|null}
 */
export function pickTemplate(templates, lead) {
  if (!Array.isArray(templates) || templates.length === 0) return null;
  const l = lead || {};

  const noRealWebsite =
    l.websiteType === WEBSITE_TYPES.NONE ||
    l.websiteType === WEBSITE_TYPES.SOCIAL ||
    l.hasWebsite === false;

  if (noRealWebsite) {
    const noSite = templates.find((t) => t.isNoWebsite) || templates.find((t) => t.id === 'tpl-no-website');
    if (noSite) {
      const why = l.websiteType === WEBSITE_TYPES.SOCIAL ? 'only a social media link was found' : 'no website was found';
      return { template: noSite, reason: `Auto-selected because ${why}` };
    }
  }

  const normCat = typeof l.category === 'string' ? l.category.toLowerCase() : '';
  if (normCat) {
    const match = templates.find(
      (t) =>
        !t.isDefault &&
        !t.isNoWebsite &&
        Array.isArray(t.categoryKeywords) &&
        t.categoryKeywords.some((kw) => typeof kw === 'string' && kw && normCat.includes(kw.toLowerCase())),
    );
    if (match) return { template: match, reason: `Matched category “${l.category}”` };
  }

  const fallback = templates.find((t) => t.isDefault) || templates[0];
  return { template: fallback, reason: 'Default template' };
}

/**
 * Normalize an arbitrary language tag (e.g. "fr-FR", "AR") to a supported code.
 * @param {unknown} tag
 * @returns {('en'|'fr'|'ar'|null)}
 */
export function normalizeLangCode(tag) {
  if (typeof tag !== 'string') return null;
  const code = tag.trim().slice(0, 2).toLowerCase();
  return LANGUAGES.includes(code) ? code : null;
}

/**
 * Smartly suggest a message language for a lead.
 *   - If auto-detect is off, use the user's default language.
 *   - Arabic script in the name/address  -> 'ar'.
 *   - Else the Google Maps page language (when supported).
 *   - Else the user's default language (falling back to English).
 * @param {object} lead
 * @param {string|null} pageLanguage
 * @param {object} settings
 * @returns {('en'|'fr'|'ar')}
 */
export function suggestLanguage(lead, pageLanguage, settings) {
  const def = normalizeLangCode(settings && settings.defaultLanguage) || 'en';
  if (settings && settings.autoDetectLanguage === false) return def;

  const l = lead || {};
  if (containsArabic(l.name) || containsArabic(l.address)) return 'ar';

  const page = normalizeLangCode(pageLanguage);
  if (page) return page;

  return def;
}
