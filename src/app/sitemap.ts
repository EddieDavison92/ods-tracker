import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Top-level pages only; organisation pages are reached through search and links.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { path: '', changeFrequency: 'daily', priority: 1 },
    { path: '/explore', changeFrequency: 'daily', priority: 0.8 },
    { path: '/changes', changeFrequency: 'daily', priority: 0.8 },
    { path: '/areas', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/export', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/docs', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/about', changeFrequency: 'yearly', priority: 0.4 },
  ].map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: changeFrequency as MetadataRoute.Sitemap[number]['changeFrequency'],
    priority,
  }))
}
