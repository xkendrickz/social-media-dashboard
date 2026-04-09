'use client';
import { useState } from 'react';
import PlatformCard from '@/components/PlatformCard';
import { PlatformData } from '@/types';

export default function Home() {
  type Platform = 'youtube' | 'tiktok' | 'instagram';
  const [inputs, setInputs] = useState<Record<Platform, string>>({
    youtube: '',
    tiktok: '',
    instagram: '',
  });
  const [data, setData] = useState<Record<Platform, PlatformData | null>>({
    youtube: null,
    tiktok: null,
    instagram: null,
  });
  const [loading, setLoading] = useState<Record<Platform, boolean>>({
    youtube: false,
    tiktok: false,
    instagram: false,
  });

  const fetchPlatform = async (platform: Platform) => {
    setLoading(prev => ({ ...prev, [platform]: true }));
    try {
      const param = platform === 'youtube' ? 'channel' : 'username';
      const res = await fetch(
        `/api/${platform}?${param}=${inputs[platform]}`
      );
      const json = await res.json();
      setData(prev => ({ ...prev, [platform]: json }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(prev => ({ ...prev, [platform]: false }));
    }
  };

  const platforms: Platform[] = ['youtube', 'tiktok', 'instagram'];

  const fetchAll = () => {
    platforms.forEach(fetchPlatform);
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-center mb-8">
        📊 Social Media Dashboard
      </h1>

      <div className="bg-white rounded-xl p-6 mb-8 shadow grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['youtube', 'tiktok', 'instagram'] as const).map((p) => (
          <div key={p}>
            <label className="text-sm font-medium capitalize">{p}</label>
            <input
              className="w-full border rounded-lg p-2 mt-1"
              placeholder={p === 'youtube' ? 'Channel name' : '@username'}
              value={inputs[p]}
              onChange={(e) => setInputs(prev => ({ ...prev, [p]: e.target.value }))}
            />
          </div>
        ))}
        <div className="md:col-span-3 flex justify-center">
          <button
            onClick={fetchAll}
            className="bg-blue-600 text-white px-8 py-2 rounded-lg hover:bg-blue-700 font-semibold"
          >
            Fetch All Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['youtube', 'tiktok', 'instagram'] as const).map((p) => (
          <PlatformCard
            key={p}
            data={data[p]}
            loading={loading[p]}
            onRefresh={() => fetchPlatform(p)}
          />
        ))}
      </div>
    </main>
  );
}