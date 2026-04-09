import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/api-cache';
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter';
import { quotaTracker, QUOTA_CONFIGS } from '@/lib/quota-tracker';
import { fetchSafe, AuthError, TimeoutError } from '@/lib/fetch-safe';

const BASE = 'https://graph.instagram.com/v25.0';
const PLATFORM = 'instagram';
const CACHE_TTL_MINUTES = 30;

function getToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN is not configured');
  return token;
}

interface InstagramProfile {
  id: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  error?: { message: string };
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
}

interface ContentItem {
  id: string;
  title: string;
  mediaType: string;
  views: number;
  thumbnail: string;
  url: string;
  publishedAt: string;
}

async function fetchProfile(token: string): Promise<InstagramProfile> {
  const res = await fetchSafe(
    `${BASE}/me?fields=id,name,username,profile_picture_url,followers_count,media_count&access_token=${token}`,
    PLATFORM
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch Instagram profile (${res.status}): ${body}`);
  }

  const data: InstagramProfile = await res.json();
  if (data.error) throw new Error(`Instagram API error: ${data.error.message}`);

  return data;
}

async function fetchMediaItems(userId: string, token: string): Promise<InstagramMediaItem[]> {
  const res = await fetchSafe(
    `${BASE}/${userId}/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink,timestamp,like_count&limit=5&access_token=${token}`,
    PLATFORM
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch media (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data?.data ?? [];
}

async function fetchMediaViews(mediaId: string, token: string, fallback: number): Promise<number> {
  try {
    const res = await fetchSafe(
      `${BASE}/${mediaId}/insights?metric=views,reach,saved,shares&period=lifetime&access_token=${token}`,
      PLATFORM
    );

    const data = await res.json();
    if (data?.error) return fallback;

    const insightList: { name: string; total_value?: { value: number }; values?: { value: number }[] }[] =
      data?.data ?? [];

    const getMetricValue = (name: string): number => {
      const metric = insightList.find((m) => m.name === name);
      return metric?.total_value?.value ?? metric?.values?.[0]?.value ?? 0;
    };

    const views = getMetricValue('views');
    return views > 0 ? views : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username')?.trim();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

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
    const token = getToken();

    const profile = await fetchProfile(token);
    const mediaItems = await fetchMediaItems(profile.id, token);

    const contents: ContentItem[] = await Promise.all(
      mediaItems.map(async (item) => {
        const views = await fetchMediaViews(item.id, token, item.like_count ?? 0);
        return {
          id: item.id,
          title: item.caption?.slice(0, 60) ?? 'Instagram Post',
          mediaType: item.media_type,
          views,
          thumbnail: item.thumbnail_url ?? item.media_url ?? '',
          url: item.permalink,
          publishedAt: item.timestamp,
        };
      })
    );

    const totalViews = contents.reduce((sum, c) => sum + c.views, 0);

    quotaTracker.increment(PLATFORM, QUOTA_CONFIGS[PLATFORM]);

    const response = {
      platform: PLATFORM,
      accountName: profile.name ?? profile.username ?? username,
      profilePhoto: profile.profile_picture_url ?? '',
      followerCount: profile.followers_count ?? 0,
      mediaCount: profile.media_count ?? 0,
      totalViews,
      contents,
      ...(quotaResult.warning ? { quotaWarning: `${quotaResult.usedPercent}% of daily quota used` } : {}),
    };

    cache.set(cacheKey, response, CACHE_TTL_MINUTES);
    return NextResponse.json(response, { headers: { 'x-cache': 'MISS' } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: 'Instagram API took too long to respond' }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json(
      { error: 'Failed to fetch Instagram data', detail: message },
      { status: 500 }
    );
  }
}