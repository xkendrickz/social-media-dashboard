export interface ContentItem {
  id: string;
  title: string;
  views: number;
  thumbnail: string;
  url: string;
  publishedAt: string;
}

export interface PlatformData {
  platform: 'youtube' | 'tiktok' | 'instagram';
  accountName: string;
  profilePhoto: string;
  totalViews: number;
  contents: ContentItem[];
  error?: string;
}