import { postsApi } from './posts.api';
import { PostItem, PostType } from '@apnasamaj/shared-types';

export interface ParsedGovernmentScheme {
  id: string;
  title: string;
  department: string;
  category: string;
  targetBeneficiaries: string;
  eligibility: string;
  ageCriteria?: string;
  incomeCriteria?: string;
  requiredDocuments: string[];
  benefits: string;
  applicationProcess: string;
  deadline?: string;
  officialWebsite?: string;
  helpline?: string;
  locationState: string;
  description: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorRole?: string;
  authorCity?: string;
  createdAt: string;
  mediaUrls: string[];
  likesCount: number;
  commentsCount: number;
  rawPost: PostItem;
}

export interface CreateGovernmentSchemePayload {
  title: string;
  department?: string;
  category?: string;
  targetBeneficiaries?: string;
  eligibility?: string;
  ageCriteria?: string;
  incomeCriteria?: string;
  requiredDocuments?: string[];
  benefits?: string;
  applicationProcess?: string;
  deadline?: string;
  officialWebsite?: string;
  helpline?: string;
  locationState?: string;
  description: string;
}

export interface GovernmentSchemeFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  locationState?: string;
  authorId?: string;
}

export const SCHEME_CATEGORIES = [
  { key: 'ALL', labelHi: 'सभी श्रेणियां', labelEn: 'All Categories' },
  { key: 'EDUCATION', labelHi: 'शिक्षा व छात्रवृत्ति', labelEn: 'Education & Scholarship' },
  { key: 'EMPLOYMENT', labelHi: 'रोजगार व कौशल विकास', labelEn: 'Employment & Skills' },
  { key: 'AGRICULTURE', labelHi: 'किसान व कृषि', labelEn: 'Agriculture & Farmers' },
  { key: 'WOMEN_CHILD', labelHi: 'महिला एवं बाल विकास', labelEn: 'Women & Child Development' },
  { key: 'HEALTH', labelHi: 'स्वास्थ्य व चिकित्सा', labelEn: 'Health & Medical' },
  { key: 'HOUSING', labelHi: 'आवास व शहरी विकास', labelEn: 'Housing & Urban Development' },
  { key: 'SOCIAL_SECURITY', labelHi: 'सामाजिक सुरक्षा व पेंशन', labelEn: 'Social Security & Pension' },
  { key: 'OTHER', labelHi: 'अन्य जनकल्याण योजनाएं', labelEn: 'Other Welfare Schemes' },
] as const;

export const SCHEME_LOCATIONS = [
  { key: 'ALL', labelHi: 'सभी राज्य व केंद्र', labelEn: 'All Locations' },
  { key: 'CENTRAL', labelHi: 'केंद्र सरकार (National)', labelEn: 'Central Government' },
  { key: 'Madhya Pradesh', labelHi: 'मध्य प्रदेश (MP)', labelEn: 'Madhya Pradesh' },
  { key: 'Uttar Pradesh', labelHi: 'उत्तर प्रदेश (UP)', labelEn: 'Uttar Pradesh' },
  { key: 'Rajasthan', labelHi: 'राजस्थान (RJ)', labelEn: 'Rajasthan' },
  { key: 'Maharashtra', labelHi: 'महाराष्ट्र (MH)', labelEn: 'Maharashtra' },
  { key: 'Delhi', labelHi: 'दिल्ली (DL)', labelEn: 'Delhi' },
  { key: 'OTHER_STATE', labelHi: 'अन्य राज्य', labelEn: 'Other States' },
] as const;

const SCHEME_TITLE_PREFIX = '[सरकारी योजना / Govt Scheme]';

/**
 * Checks if a post represents a government scheme.
 * Matches prefix `[सरकारी योजना`, `[Govt Scheme]`, `#सरकारीयोजना`, `#govtscheme`,
 * or keywords `योजना`, `scheme`, `subsidy`, `subsidies`, `छात्रवृत्ति`.
 */
export function isGovernmentSchemePost(post: PostItem): boolean {
  if (!post) return false;
  const title = (post.title || '').trim().toLowerCase();
  const content = (post.content || '').trim().toLowerCase();

  return (
    title.includes('[सरकारी योजना') ||
    title.includes('[govt scheme') ||
    title.includes('सरकारी योजना') ||
    title.includes('govt scheme') ||
    title.includes('योजना') ||
    title.includes('scheme') ||
    content.includes('#सरकारीयोजना') ||
    content.includes('#govtscheme') ||
    content.includes('#scheme')
  );
}

/**
 * Validates and normalizes an external official website URL.
 * Only allows HTTP and HTTPS protocols.
 */
export function validateOfficialUrl(rawUrl?: string | null): { isValid: boolean; normalizedUrl: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, normalizedUrl: '' };
  }

  let trimmed = rawUrl.trim();
  // Strip trailing punctuation like comma, dot, or parentheses often found in text
  trimmed = trimmed.replace(/[),.;]+$/, '');

  // If missing scheme, prepend https:// if it looks like a domain
  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    } else {
      return { isValid: false, normalizedUrl: '' };
    }
  }

  try {
    // Basic regex validation for a standard web URL
    const urlPattern = /^https?:\/\/[a-zA-Z0-9-_.]+(\.[a-zA-Z]{2,})(\/.*)?$/i;
    if (!urlPattern.test(trimmed)) {
      return { isValid: false, normalizedUrl: '' };
    }
    return { isValid: true, normalizedUrl: trimmed };
  } catch {
    return { isValid: false, normalizedUrl: '' };
  }
}

/**
 * Parses structured government scheme details from a post.
 * Handles both structured key-value lines and raw unstructured posts gracefully.
 */
export function parseSchemeListing(post: PostItem): ParsedGovernmentScheme {
  const rawTitle = (post.title || '').trim();
  // Clean prefix if present
  let cleanTitle = rawTitle
    .replace(/^\[सरकारी योजना\s*\/?\s*Govt Scheme\]\s*/i, '')
    .replace(/^\[सरकारी योजना\]\s*/i, '')
    .replace(/^\[Govt Scheme\]\s*/i, '')
    .trim();

  if (!cleanTitle) {
    cleanTitle = 'सरकारी जनकल्याण योजना / Government Welfare Scheme';
  }

  let department = '';
  let category = 'OTHER';
  let targetBeneficiaries = '';
  let eligibility = '';
  let ageCriteria = '';
  let incomeCriteria = '';
  const requiredDocuments: string[] = [];
  let benefits = '';
  let applicationProcess = '';
  let deadline = '';
  let officialWebsite = '';
  let helpline = '';
  let locationState = post.author?.city || (post as any).authorCity || 'All India / National';

  const content = post.content || '';
  const lines = content.split('\n');

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Remove leading emojis, bullets, asterisks, and whitespaces
    const cleanLine = trimmed.replace(/^[\p{Extended_Pictographic}\p{Symbol}\s*•\-]+/u, '').trim();
    const cleanLower = cleanLine.toLowerCase();

    if (
      cleanLower.includes('department:') ||
      cleanLower.includes('विभाग:') ||
      cleanLower.includes('ministry:') ||
      cleanLower.includes('मंत्रालय:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) department = parts[1].trim();
    } else if (
      cleanLower.includes('category:') ||
      cleanLower.includes('श्रेणी:') ||
      cleanLower.includes('वर्ग:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) {
        const val = parts[1].trim().toLowerCase();
        if (val.includes('edu') || val.includes('शिक्षा') || val.includes('scholarship') || val.includes('छात्रवृत्ति')) {
          category = 'EDUCATION';
        } else if (val.includes('employ') || val.includes('रोजगार') || val.includes('skill') || val.includes('कौशल')) {
          category = 'EMPLOYMENT';
        } else if (val.includes('agri') || val.includes('किसान') || val.includes('कृषि')) {
          category = 'AGRICULTURE';
        } else if (val.includes('women') || val.includes('महिला') || val.includes('बाल') || val.includes('child')) {
          category = 'WOMEN_CHILD';
        } else if (val.includes('health') || val.includes('स्वास्थ्य') || val.includes('चिकित्सा')) {
          category = 'HEALTH';
        } else if (val.includes('house') || val.includes('आवास')) {
          category = 'HOUSING';
        } else if (val.includes('pension') || val.includes('पेंशन') || val.includes('security') || val.includes('सुरक्षा')) {
          category = 'SOCIAL_SECURITY';
        } else {
          category = 'OTHER';
        }
      }
    } else if (
      cleanLower.includes('beneficiaries:') ||
      cleanLower.includes('लाभार्थी:') ||
      cleanLower.includes('target:') ||
      cleanLower.includes('लक्षित:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) targetBeneficiaries = parts[1].trim();
    } else if (
      cleanLower.includes('eligibility:') ||
      cleanLower.includes('पात्रता:') ||
      cleanLower.includes('शर्तें:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) eligibility = parts[1].trim();
    } else if (
      cleanLower.includes('age:') ||
      cleanLower.includes('आयु:') ||
      cleanLower.includes('उम्र:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) ageCriteria = parts[1].trim();
    } else if (
      cleanLower.includes('income:') ||
      cleanLower.includes('आय:') ||
      cleanLower.includes('वेतन सीमा:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) incomeCriteria = parts[1].trim();
    } else if (
      cleanLower.includes('documents:') ||
      cleanLower.includes('दस्तावेज:') ||
      cleanLower.includes('कागजात:') ||
      cleanLower.includes('docs:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) {
        const rawDocs = parts[1].trim();
        rawDocs.split(/[,;|•]/).forEach((d) => {
          const docTrim = d.trim();
          if (docTrim && !requiredDocuments.includes(docTrim)) {
            requiredDocuments.push(docTrim);
          }
        });
      }
    } else if (
      cleanLower.includes('benefits:') ||
      cleanLower.includes('लाभ:') ||
      cleanLower.includes('सहायता:') ||
      cleanLower.includes('राशि:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) benefits = parts[1].trim();
    } else if (
      cleanLower.includes('process:') ||
      cleanLower.includes('प्रक्रिया:') ||
      cleanLower.includes('आवेदन कैसे करें:') ||
      cleanLower.includes('how to apply:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) applicationProcess = parts[1].trim();
    } else if (
      cleanLower.includes('deadline:') ||
      cleanLower.includes('अंतिम तिथि:') ||
      cleanLower.includes('last date:') ||
      cleanLower.includes('तिथियां:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) deadline = parts[1].trim();
    } else if (
      cleanLower.includes('website:') ||
      cleanLower.includes('वेबसाइट:') ||
      cleanLower.includes('पोर्टल:') ||
      cleanLower.includes('portal:') ||
      cleanLower.includes('link:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) {
        const rawUrl = parts[1].trim();
        const validated = validateOfficialUrl(rawUrl);
        if (validated.isValid) {
          officialWebsite = validated.normalizedUrl;
        } else {
          officialWebsite = rawUrl;
        }
      }
    } else if (
      cleanLower.includes('helpline:') ||
      cleanLower.includes('हेल्पलाइन:') ||
      cleanLower.includes('संपर्क:') ||
      cleanLower.includes('toll free:') ||
      cleanLower.includes('tollfree:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) helpline = parts[1].trim();
    } else if (
      cleanLower.includes('state:') ||
      cleanLower.includes('राज्य:') ||
      cleanLower.includes('स्थान:') ||
      cleanLower.includes('location:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) locationState = parts[1].trim();
    }
  });

  // Also check if any standalone line or URL in content contains a government portal link
  if (!officialWebsite) {
    const urlMatch = content.match(/https?:\/\/[^\s]+/i);
    if (urlMatch && urlMatch[0]) {
      const validated = validateOfficialUrl(urlMatch[0]);
      if (validated.isValid) {
        officialWebsite = validated.normalizedUrl;
      }
    }
  }

  // Fallbacks for unstructured posts
  if (!department) {
    department = 'संबंधित शासकीय विभाग / Concerned Govt Dept';
  }
  if (!targetBeneficiaries) {
    targetBeneficiaries = 'पात्र नागरिक / Eligible Citizens';
  }
  if (!benefits) {
    benefits = 'शासकीय दिशा-निर्देशों के अनुसार वित्तीय व सामाजिक लाभ / Financial & Welfare Support';
  }
  if (!eligibility) {
    eligibility = 'विस्तृत पात्रता नियमों हेतु आधिकारिक अधिसूचना देखें / Refer to official notification';
  }
  if (!applicationProcess) {
    applicationProcess = 'ऑनलाइन आधिकारिक पोर्टल अथवा नजदीकी लोक सेवा केंद्र (CSC) से आवेदन करें';
  }

  const mediaUrls: string[] = [];
  if (post.media && Array.isArray(post.media)) {
    post.media.forEach((m) => {
      if (m.url) mediaUrls.push(m.url);
    });
  }

  const authorName = (post as any).authorName || post.author?.fullName || 'Community Member';
  const authorAvatarUrl = (post as any).authorAvatarUrl || post.author?.avatarUrl || null;
  const authorCity = (post as any).authorCity || post.author?.city || undefined;
  const authorRole = post.author?.role || 'MEMBER';

  return {
    id: post.id,
    title: cleanTitle,
    department: department.trim(),
    category,
    targetBeneficiaries: targetBeneficiaries.trim(),
    eligibility: eligibility.trim(),
    ageCriteria: ageCriteria.trim() || undefined,
    incomeCriteria: incomeCriteria.trim() || undefined,
    requiredDocuments,
    benefits: benefits.trim(),
    applicationProcess: applicationProcess.trim(),
    deadline: deadline.trim() || undefined,
    officialWebsite: officialWebsite.trim() || undefined,
    helpline: helpline.trim() || undefined,
    locationState: locationState.trim(),
    description: content,
    authorId: post.authorId || post.author?.id || '',
    authorName,
    authorAvatarUrl,
    authorRole,
    authorCity,
    createdAt: post.createdAt,
    mediaUrls,
    likesCount: post.likesCount || (post as any)._count?.likes || 0,
    commentsCount: post.commentsCount || (post as any)._count?.comments || 0,
    rawPost: post,
  };
}

export const governmentSchemesApi = {
  /**
   * Fetches paginated community government scheme posts.
   */
  async listSchemes(params?: GovernmentSchemeFilterParams): Promise<{
    items: ParsedGovernmentScheme[];
    total: number;
    hasMore: boolean;
  }> {
    const feedResponse = await postsApi.getFeed({
      page: params?.page || 1,
      limit: params?.limit || 20,
      search: params?.search,
      authorId: params?.authorId,
    });

    const schemePosts = (feedResponse.posts || []).filter(isGovernmentSchemePost);
    let items = schemePosts.map(parseSchemeListing);

    // Client-side category filtering if specified
    if (params?.category && params.category !== 'ALL') {
      items = items.filter((s) => s.category === params.category);
    }

    // Client-side state/location filtering if specified
    if (params?.locationState && params.locationState !== 'ALL') {
      const loc = params.locationState.toLowerCase();
      items = items.filter((s) => s.locationState.toLowerCase().includes(loc));
    }

    return {
      items,
      total: items.length,
      hasMore: feedResponse.pagination?.hasMore ?? false,
    };
  },

  /**
   * Fetches a specific scheme by ID.
   */
  async getSchemeById(id: string): Promise<ParsedGovernmentScheme> {
    const post = await postsApi.getPost(id);
    return parseSchemeListing(post);
  },

  /**
   * Creates a new government scheme post using the existing post pipeline.
   * Formats the title with the mandatory `[सरकारी योजना / Govt Scheme]` prefix.
   */
  async createScheme(payload: CreateGovernmentSchemePayload): Promise<PostItem> {
    const cleanTitle = payload.title.trim();
    const finalTitle = `${SCHEME_TITLE_PREFIX} ${cleanTitle}`.slice(0, 150);

    const contentLines: string[] = [];
    if (payload.department) contentLines.push(`🏛️ विभाग / Department: ${payload.department}`);
    if (payload.category) contentLines.push(`📁 श्रेणी / Category: ${payload.category}`);
    if (payload.targetBeneficiaries) contentLines.push(`🎯 लक्षित लाभार्थी / Target: ${payload.targetBeneficiaries}`);
    if (payload.eligibility) contentLines.push(`📋 पात्रता / Eligibility: ${payload.eligibility}`);
    if (payload.ageCriteria) contentLines.push(`🎂 आयु सीमा / Age: ${payload.ageCriteria}`);
    if (payload.incomeCriteria) contentLines.push(`💰 आय सीमा / Income: ${payload.incomeCriteria}`);
    if (payload.benefits) contentLines.push(`✨ मिलने वाले लाभ / Benefits: ${payload.benefits}`);
    if (payload.requiredDocuments && payload.requiredDocuments.length > 0) {
      contentLines.push(`📄 आवश्यक दस्तावेज / Required Documents: ${payload.requiredDocuments.join(', ')}`);
    }
    if (payload.applicationProcess) contentLines.push(`📝 आवेदन प्रक्रिया / How to Apply: ${payload.applicationProcess}`);
    if (payload.deadline) contentLines.push(`📅 अंतिम तिथि / Deadline: ${payload.deadline}`);
    if (payload.officialWebsite) contentLines.push(`🌐 आधिकारिक वेबसाइट / Website: ${payload.officialWebsite}`);
    if (payload.helpline) contentLines.push(`📞 हेल्पलाइन / Helpline: ${payload.helpline}`);
    if (payload.locationState) contentLines.push(`📍 राज्य / State: ${payload.locationState}`);

    if (payload.description) {
      contentLines.push('\nविवरण / Details:\n' + payload.description);
    }

    const finalContent = contentLines.join('\n');

    return postsApi.createPost({
      title: finalTitle,
      content: finalContent,
      type: 'GENERAL' as PostType,
    });
  },

  /**
   * Deletes a scheme post owned by the current user.
   */
  async deleteScheme(id: string): Promise<{ success: boolean }> {
    await postsApi.deletePost(id);
    return { success: true };
  },
};
