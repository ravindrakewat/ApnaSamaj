import { postsApi } from './posts.api';
import { PostItem } from '@apnasamaj/shared-types';

export interface ParsedJobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  employmentType: string;
  description: string;
  contactInfo: string;
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

export interface CreateJobPayload {
  title: string;
  company?: string;
  location?: string;
  salary?: string;
  experience?: string;
  employmentType?: string;
  description: string;
  contactInfo?: string;
}

export interface JobFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
  authorId?: string;
}

export const EMPLOYMENT_LOCATIONS = [
  'ALL',
  'Indore',
  'Bhopal',
  'Jabalpur',
  'Rewa',
  'Ujjain',
  'Gwalior',
  'Remote',
] as const;

export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
] as const;

/**
 * Checks if a post represents an employment / job opportunity
 */
export function isEmploymentPost(post: PostItem): boolean {
  const title = (post.title || '').toLowerCase();
  const content = (post.content || '').toLowerCase();

  return (
    title.includes('[रोजगार') ||
    title.includes('[employment') ||
    title.includes('रोजगार') ||
    title.includes('employment') ||
    title.includes('hiring') ||
    title.includes('नौकरी') ||
    title.includes('job opening') ||
    title.includes('vacancy') ||
    content.includes('job title:') ||
    content.includes('पद:') ||
    content.includes('वेतन:') ||
    content.includes('salary:')
  );
}

/**
 * Parses a PostItem into a structured ParsedJobListing
 */
export function parseJobListing(post: PostItem): ParsedJobListing {
  let cleanTitle = post.title || 'Job Opportunity';
  cleanTitle = cleanTitle
    .replace(/^\[रोजगार\s*\/\s*Employment\]\s*/i, '')
    .replace(/^\[Employment\]\s*/i, '')
    .replace(/^\[रोजगार\]\s*/i, '')
    .trim();

  let company = '';
  let location = post.author?.city || (post as any).authorCity || '';
  let salary = '';
  let experience = '';
  let employmentType = 'Full-time';
  let contactInfo = '';

  const content = post.content || '';
  const lines = content.split('\n');

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Remove leading emojis, bullets, asterisks, and whitespaces
    const cleanLine = trimmed.replace(/^[\p{Extended_Pictographic}\p{Symbol}\s*•\-]+/u, '').trim();
    const cleanLower = cleanLine.toLowerCase();

    if (
      cleanLower.includes('company:') ||
      cleanLower.includes('कंपनी:') ||
      cleanLower.includes('organization:') ||
      cleanLower.includes('employer:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) company = parts[1].trim();
    } else if (
      cleanLower.includes('location:') ||
      cleanLower.includes('स्थान:') ||
      cleanLower.includes('city:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) location = parts[1].trim();
    } else if (
      cleanLower.includes('salary:') ||
      cleanLower.includes('वेतन:') ||
      cleanLower.includes('ctc:') ||
      cleanLower.includes('पैकेज:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) salary = parts[1].trim();
    } else if (
      cleanLower.includes('experience:') ||
      cleanLower.includes('अनुभव:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) experience = parts[1].trim();
    } else if (
      cleanLower.includes('type:') ||
      cleanLower.includes('प्रकार:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) {
        const val = parts[1].trim();
        if (val.toLowerCase().includes('part') || val.includes('अंशकालिक')) {
          employmentType = 'Part-time';
        } else if (val.toLowerCase().includes('intern') || val.includes('इंटर्नशिप')) {
          employmentType = 'Internship';
        } else if (val.toLowerCase().includes('contract') || val.includes('अनुबंध')) {
          employmentType = 'Contract';
        } else {
          employmentType = 'Full-time';
        }
      }
    } else if (
      cleanLower.includes('contact:') ||
      cleanLower.includes('संपर्क:') ||
      cleanLower.includes('apply:')
    ) {
      const parts = cleanLine.split(/:\s*(.+)/);
      if (parts[1]) contactInfo = parts[1].trim();
    }
  });

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
    company: company.trim() || authorName || 'Community Employer',
    location: location.trim() || authorCity || 'Not specified',
    salary: salary.trim() || 'वेतन वार्ता अनुसार / Negotiable',
    experience: experience.trim() || 'Fresher / Experienced',
    employmentType: employmentType.trim() || 'Full-time',
    description: content,
    contactInfo: contactInfo.trim(),
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

export const employmentApi = {
  /**
   * Fetches paginated community employment job listings.
   */
  async listJobs(params: JobFilterParams = {}): Promise<{
    jobs: ParsedJobListing[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const feed = await postsApi.getFeed({
      page: params.page || 1,
      limit: Math.min(params.limit || 20, 50),
      search: params.search?.trim() || undefined,
      authorId: params.authorId,
    });

    const parsedJobs: ParsedJobListing[] = [];

    (feed.posts || []).forEach((post) => {
      if (isEmploymentPost(post)) {
        const job = parseJobListing(post);

        // Client-side location filtering if specified
        if (params.location && params.location.trim()) {
          const locQuery = params.location.toLowerCase().trim();
          if (
            !job.location.toLowerCase().includes(locQuery) &&
            !(job.authorCity && job.authorCity.toLowerCase().includes(locQuery))
          ) {
            return;
          }
        }

        parsedJobs.push(job);
      }
    });

    return {
      jobs: parsedJobs,
      total: parsedJobs.length,
      page: feed.pagination?.page || 1,
      totalPages: feed.pagination?.totalPages || 1,
    };
  },

  /**
   * Retrieves single job details by post ID.
   */
  async getJobById(jobId: string): Promise<ParsedJobListing> {
    const post = await postsApi.getPost(jobId);
    return parseJobListing(post);
  },

  /**
   * Creates a new employment opportunity post.
   */
  async createJob(payload: CreateJobPayload): Promise<ParsedJobListing> {
    const title = payload.title.trim();
    const formattedTitle = title.startsWith('[रोजगार') || title.startsWith('[Employment')
      ? title
      : `[रोजगार / Employment] ${title}`.slice(0, 150);

    const contentLines: string[] = [];
    if (payload.company?.trim()) {
      contentLines.push(`🏢 Company: ${payload.company.trim()}`);
    }
    if (payload.location?.trim()) {
      contentLines.push(`📍 Location: ${payload.location.trim()}`);
    }
    if (payload.salary?.trim()) {
      contentLines.push(`💰 Salary: ${payload.salary.trim()}`);
    }
    if (payload.experience?.trim()) {
      contentLines.push(`💼 Experience: ${payload.experience.trim()}`);
    }
    if (payload.employmentType?.trim()) {
      contentLines.push(`⏱️ Type: ${payload.employmentType.trim()}`);
    }
    if (payload.contactInfo?.trim()) {
      contentLines.push(`📞 Contact: ${payload.contactInfo.trim()}`);
    }

    contentLines.push('\n' + payload.description.trim());

    const createdPost = await postsApi.createPost({
      title: formattedTitle,
      content: contentLines.join('\n'),
      type: 'GENERAL',
    });

    return parseJobListing(createdPost);
  },

  /**
   * Deletes a posted job listing.
   */
  async deleteJob(jobId: string): Promise<void> {
    await postsApi.deletePost(jobId);
  },
};
