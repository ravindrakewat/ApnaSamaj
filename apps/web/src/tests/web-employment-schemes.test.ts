import assert from 'assert';
import { isEmploymentPost, parseJobListing } from '../services/employment.service';
import {
  isGovernmentSchemePost,
  parseSchemeListing,
  validateOfficialUrl,
  SCHEME_CATEGORIES,
} from '../services/government-schemes.service';
import { PostItem, PostType } from '../../../../packages/shared-types/src/post.ts';

function assertTest(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runEmploymentSchemesTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 11.3: Web Employment & Schemes Tests      ');
  console.log('================================================================\n');

  console.log('--- Test Suite 1: Employment Post Detection & Parsing ---');

  const mockJobPost: PostItem = {
    id: 'job-uuid-1234',
    communityId: 'comm-1',
    authorId: 'user-author-999',
    type: PostType.GENERAL,
    title: '[रोजगार / Employment] Senior Accountant & Tax Advisor',
    content:
      '🏢 Company: Sharma & Associates CA\n📍 Location: Indore\n💰 Salary: ₹35,000 - ₹45,000 / माह\n💼 Experience: 3+ Years in GST & Tally\n⏱️ Type: Full-time\n📞 Contact: 9876543210 / jobs@sharma.in\n\nLooking for an experienced accountant to lead taxation and audit division.',
    media: [
      {
        id: 'med-1',
        postId: 'job-uuid-1234',
        url: 'https://images.example.com/job-flyer.png',
        mediaType: 'IMAGE',
        order: 0,
        createdAt: '2026-11-18T00:00:00Z',
      },
    ],
    likesCount: 12,
    commentsCount: 3,
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T00:00:00Z',
    author: {
      id: 'user-author-999',
      fullName: 'Ramesh Sharma',
      avatarUrl: null,
      role: 'MEMBER' as any,
    },
  };

  assertTest(isEmploymentPost(mockJobPost), 'Identifies employment post by title and structured tags');

  const parsedJob = parseJobListing(mockJobPost);
  assertTest(parsedJob.title === 'Senior Accountant & Tax Advisor', 'Strips prefix from title cleanly');
  assertTest(parsedJob.company === 'Sharma & Associates CA', 'Extracts company name');
  assertTest(parsedJob.location === 'Indore', 'Extracts location');
  assertTest(parsedJob.salary === '₹35,000 - ₹45,000 / माह', 'Extracts salary');
  assertTest(parsedJob.employmentType === 'Full-time', 'Extracts employment type');
  assertTest(parsedJob.contactInfo === '9876543210 / jobs@sharma.in', 'Extracts contact details');
  assertTest(parsedJob.mediaUrls.length === 1, 'Preserves media attachments');

  console.log('\n--- Test Suite 2: Government Scheme Detection & Parsing ---');

  const mockSchemePost: PostItem = {
    id: 'scheme-uuid-5678',
    communityId: 'comm-1',
    authorId: 'admin-author-111',
    type: PostType.GENERAL,
    title: '[सरकारी योजना / Govt Scheme] मुख्यमंत्री मेधावी विद्यार्थी योजना',
    content:
      '🏛️ विभाग / Department: उच्च शिक्षा विभाग, म.प्र.\n📁 श्रेणी / Category: Education\n🎯 लक्षित लाभार्थी / Target: 12वीं उत्तीर्ण मेधावी छात्र\n📋 पात्रता / Eligibility: एमपी बोर्ड में 70%+ या सीबीएसई में 85%+\n🎂 आयु सीमा / Age: 18 - 25 वर्ष\n💰 आय सीमा / Income: परिवार की वार्षिक आय ₹6 लाख से कम\n✨ मिलने वाले लाभ / Benefits: इंजीनियरिंग, मेडिकल एवं उच्च शिक्षा की संपूर्ण फीस शासन वहन करेगा\n📄 आवश्यक दस्तावेज / Required Documents: आधार कार्ड, 12वीं अंकसूची, मूल निवासी प्रमाण पत्र, आय प्रमाण पत्र\n📝 आवेदन प्रक्रिया / How to Apply: एमपी छात्रवृत्ति पोर्टल 2.0 पर ऑनलाइन पंजीकरण करें\n📅 अंतिम तिथि / Deadline: 31 दिसंबर 2026\n🌐 आधिकारिक वेबसाइट / Website: https://scholarshipportal.mp.nic.in\n📞 हेल्पलाइन / Helpline: 0755-2660064\n📍 राज्य / State: Madhya Pradesh\n\nयोजना का संपूर्ण विवरण एवं दिशानिर्देश आधिकारिक पोर्टल पर उपलब्ध हैं।',
    media: [],
    likesCount: 45,
    commentsCount: 9,
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T00:00:00Z',
    author: {
      id: 'admin-author-111',
      fullName: 'Samaj Kalyan Samiti',
      avatarUrl: null,
      role: 'COMMUNITY_ADMIN' as any,
    },
  };

  assertTest(isGovernmentSchemePost(mockSchemePost), 'Identifies government scheme post by title');

  const parsedScheme = parseSchemeListing(mockSchemePost);
  assertTest(parsedScheme.title === 'मुख्यमंत्री मेधावी विद्यार्थी योजना', 'Strips prefix from scheme title');
  assertTest(parsedScheme.category === 'EDUCATION', 'Categorizes scheme as EDUCATION');
  assertTest(parsedScheme.department === 'उच्च शिक्षा विभाग, म.प्र.', 'Extracts department');
  assertTest(parsedScheme.requiredDocuments.length === 4, 'Parses comma-separated document list into array');
  assertTest(parsedScheme.locationState === 'Madhya Pradesh', 'Extracts state location');

  console.log('\n--- Test Suite 3: Official URL Validation Security ---');

  const validHttps = validateOfficialUrl('https://scholarshipportal.mp.nic.in/index.html');
  assertTest(validHttps.isValid && validHttps.normalizedUrl.startsWith('https://'), 'Accepts valid HTTPS portal URL');

  const noProtocol = validateOfficialUrl('myscheme.gov.in');
  assertTest(noProtocol.isValid && noProtocol.normalizedUrl === 'https://myscheme.gov.in', 'Prepends https:// to naked domains');

  const invalidJavascript = validateOfficialUrl('javascript:alert(1)');
  assertTest(!invalidJavascript.isValid, 'Rejects javascript: pseudo-protocols');

  const emptyUrl = validateOfficialUrl(null);
  assertTest(!emptyUrl.isValid, 'Handles null safely');

  console.log('\n================================================================');
  console.log('   All Batch 11.3 Web Employment & Schemes tests passed cleanly!');
  console.log('================================================================\n');
}

runEmploymentSchemesTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
