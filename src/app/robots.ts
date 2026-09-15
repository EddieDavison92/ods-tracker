import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Pages without a query string only: filters, tabs and pagination multiply into millions of URLs,
// and each crawl of one renders a page and queries the database.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/*?', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
