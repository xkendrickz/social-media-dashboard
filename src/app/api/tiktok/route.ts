import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/api-cache';
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter';
import { quotaTracker, QUOTA_CONFIGS } from '@/lib/quota-tracker';
import { fetchSafe, AuthError, TimeoutError } from '@/lib/fetch-safe';

const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;
const PLATFORM = 'tiktok';
const CACHE_TTL_MINUTES = 30;

function getHeaders(): HeadersInit {
  const key = process.env.RAPIDAPI_KEY_TIKTOK;
  if (!key) throw new Error('RAPIDAPI_KEY_TIKTOK is not configured');
  return {
    'x-rapidapi-key': key,
    'x-rapidapi-host': RAPIDAPI_HOST,
  };
}

interface TikTokUser {
  nickname?: string;
  avatarThumb?: string;
  avatarMedium?: string;
}

interface TikTokStats {
  heartCount?: number;
  heart?: number;
}

interface TikTokVideo {
  video_id?: string;
  aweme_id?: string;
  title?: string;
  desc?: string;
  play_count?: number;
  statistics?: { play_count?: number };
  cover?: string;
  origin_cover?: string;
  create_time?: number;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('username');

  if (!raw?.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const username = raw.trim().replace('@', '');

  const cacheKey = `${PLATFORM}:${username.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
  }

  const rateResult = rateLimiter.check(PLATFORM, RATE_LIMITS[PLATFORM]);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rateResult.retryAfterSeconds}s` },
      { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } }
    );
  }

  const quotaResult = quotaTracker.check(PLATFORM, QUOTA_CONFIGS[PLATFORM]);
  if (!quotaResult.allowed) {
    return NextResponse.json(
      {
        error: 'Daily API quota reached',
        detail: `Resets at ${quotaResult.resetsAt.toISOString()}`,
      },
      { status: 503 }
    );
  }

  try {
    const headers = getHeaders();

    const profileRes = await fetchSafe(
      `${RAPIDAPI_BASE}/user/info?unique_id=${username}`,
      PLATFORM,
      { method: 'GET', headers }
    );

    if (!profileRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch profile (${profileRes.status})` },
        { status: 502 }
      );
    }

    const profileData = await profileRes.json();

    if (profileData.code !== 0) {
      return NextResponse.json(
        { error: profileData.msg ?? 'Failed to fetch profile' },
        { status: 404 }
      );
    }

    const user: TikTokUser = profileData.data?.user;
    const stats: TikTokStats = profileData.data?.stats;

    const videosRes = await fetchSafe(
      `${RAPIDAPI_BASE}/user/posts?unique_id=${username}&count=5&cursor=0`,
      PLATFORM,
      { method: 'GET', headers }
    );

    if (!videosRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch videos (${videosRes.status})` },
        { status: 502 }
      );
    }

    const videosData = await videosRes.json();
    const videos: TikTokVideo[] = videosData.data?.videos ?? [];

    quotaTracker.increment(PLATFORM, QUOTA_CONFIGS[PLATFORM]);

    const response = {
      platform: PLATFORM,
      accountName: user?.nickname ?? username,
      profilePhoto: user?.avatarThumb ?? user?.avatarMedium ?? '',
      totalViews: stats?.heartCount ?? stats?.heart ?? 0,
      contents: videos.map((v) => ({
        id: v.video_id ?? v.aweme_id ?? '',
        title: (v.title ?? v.desc ?? 'TikTok Video').slice(0, 60),
        views: v.play_count ?? v.statistics?.play_count ?? 0,
        thumbnail: v.cover ?? v.origin_cover ?? '',
        url: `https://tiktok.com/@${username}/video/${v.video_id ?? v.aweme_id}`,
        publishedAt: v.create_time
          ? new Date(v.create_time * 1000).toISOString()
          : new Date().toISOString(),
      })),
      ...(quotaResult.warning ? { quotaWarning: `${quotaResult.usedPercent}% of daily quota used` } : {}),
    };

    cache.set(cacheKey, response, CACHE_TTL_MINUTES);
    return NextResponse.json(response, { headers: { 'x-cache': 'MISS' } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: 'TikTok API took too long to respond' }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json(
      { error: 'Failed to fetch TikTok data', detail: message },
      { status: 500 }
    );
  }
}