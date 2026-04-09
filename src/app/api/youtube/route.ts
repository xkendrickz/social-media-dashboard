import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/api-cache';
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter';
import { quotaTracker, QUOTA_CONFIGS } from '@/lib/quota-tracker';
import { fetchSafe, AuthError, TimeoutError } from '@/lib/fetch-safe';

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';
const PLATFORM = 'youtube';
const CACHE_TTL_MINUTES = 30;

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');
  return key;
}

interface YouTubeChannel {
  snippet: {
    title: string;
    thumbnails: { default: { url: string } };
  };
  statistics: {
    viewCount?: string;
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    publishedAt: string;
    thumbnails: { medium: { url: string } };
  };
  statistics: {
    viewCount?: string;
  };
}

async function findChannelId(query: string, apiKey: string): Promise<string> {
  const res = await fetchSafe(
    `${YOUTUBE_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${apiKey}`,
    PLATFORM
  );

  if (!res.ok) throw new Error(`Channel search failed (${res.status})`);

  const data = await res.json();
  const channelId = data.items?.[0]?.id?.channelId;

  if (!channelId) throw new Error(`Channel "${query}" not found`);

  return channelId;
}

async function fetchChannelDetails(channelId: string, apiKey: string): Promise<YouTubeChannel> {
  const res = await fetchSafe(
    `${YOUTUBE_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`,
    PLATFORM
  );

  if (!res.ok) throw new Error(`Failed to fetch channel details (${res.status})`);

  const data = await res.json();
  const channel = data.items?.[0];

  if (!channel) throw new Error('Channel data not found');

  return channel;
}

async function fetchLatestVideoIds(channelId: string, apiKey: string): Promise<string> {
  const res = await fetchSafe(
    `${YOUTUBE_BASE}/search?part=snippet&channelId=${channelId}&maxResults=5&order=date&type=video&key=${apiKey}`,
    PLATFORM
  );

  if (!res.ok) throw new Error(`Failed to fetch videos (${res.status})`);

  const data = await res.json();
  const ids = data.items
    ?.map((v: { id: { videoId?: string } }) => v.id.videoId)
    .filter(Boolean)
    .join(',');

  if (!ids) throw new Error('No videos found for this channel');

  return ids;
}

async function fetchVideoStats(videoIds: string, apiKey: string): Promise<YouTubeVideoItem[]> {
  const res = await fetchSafe(
    `${YOUTUBE_BASE}/videos?part=statistics,snippet&id=${videoIds}&key=${apiKey}`,
    PLATFORM
  );

  if (!res.ok) throw new Error(`Failed to fetch video stats (${res.status})`);

  const data = await res.json();
  return data.items ?? [];
}

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel')?.trim();

  if (!channel) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const cacheKey = `${PLATFORM}:${channel.toLowerCase()}`;
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
    const apiKey = getApiKey();

    const channelId = await findChannelId(channel, apiKey);
    const channelDetails = await fetchChannelDetails(channelId, apiKey);
    const videoIds = await fetchLatestVideoIds(channelId, apiKey);
    const videos = await fetchVideoStats(videoIds, apiKey);

    quotaTracker.increment(PLATFORM, QUOTA_CONFIGS[PLATFORM]);

    const response = {
      platform: PLATFORM,
      accountName: channelDetails.snippet.title,
      profilePhoto: channelDetails.snippet.thumbnails.default.url,
      totalViews: parseInt(channelDetails.statistics.viewCount ?? '0'),
      contents: videos.map((v) => ({
        id: v.id,
        title: v.snippet.title,
        views: parseInt(v.statistics.viewCount ?? '0'),
        thumbnail: v.snippet.thumbnails.medium.url,
        url: `https://youtube.com/watch?v=${v.id}`,
        publishedAt: v.snippet.publishedAt,
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
      return NextResponse.json({ error: 'YouTube API took too long to respond' }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json(
      { error: 'Failed to fetch YouTube data', detail: message },
      { status: 500 }
    );
  }
}