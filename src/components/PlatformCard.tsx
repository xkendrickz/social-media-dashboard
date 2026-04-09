import { PlatformData } from '@/types';
import { Eye, RefreshCw } from 'lucide-react';

const PLATFORM_COLORS = {
  youtube: 'border-red-500 bg-red-50',
  tiktok: 'border-gray-800 bg-gray-50',
  instagram: 'border-pink-500 bg-pink-50',
};

export default function PlatformCard({
  data,
  loading,
  onRefresh,
}: {
  data: PlatformData | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) return <div className="animate-pulse bg-gray-200 rounded-xl h-64" />;
  if (!data) return null;

  return (
    <div className={`rounded-xl border-2 p-5 ${PLATFORM_COLORS[data.platform]}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img
            src={data.profilePhoto}
            className="w-12 h-12 rounded-full object-cover"
            alt={data.accountName}
          />
          <div>
            <p className="font-bold text-lg">{data.accountName}</p>
            <p className="text-sm text-gray-500 capitalize">{data.platform}</p>
          </div>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-full hover:bg-white/50">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="bg-white rounded-lg p-3 mb-4 flex items-center gap-2">
        <Eye size={20} className="text-blue-500" />
        <span className="font-semibold">
          Total: {(data.totalViews ?? 0).toLocaleString()} views
        </span>
      </div>

      <div className="space-y-2">
        {(data.contents ?? []).map((content) => (
          <a
            key={content.id}
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white rounded-lg p-2 hover:shadow-md transition"
          >
            <img
              src={content.thumbnail}
              className="w-16 h-10 object-cover rounded"
              alt={content.title}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{content.title}</p>
              <p className="text-xs text-gray-500">
                {content.views.toLocaleString()} views
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}