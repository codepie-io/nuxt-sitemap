import { defineEventHandler, getQuery, setHeader } from 'h3'
import { parseURL } from 'ufo'
import type { ModuleRuntimeConfig, SitemapRenderCtx } from '../types'
import { buildSitemap } from '../sitemap/builder'
import { setupCache } from '../util/cache'
import { createSitePathResolver, useNitroApp, useRuntimeConfig } from '#imports'
import { getRouteRulesForPath } from '#internal/nitro/route-rules'

// @ts-expect-error untyped
import pages from '#nuxt-sitemap/pages.mjs'

// @ts-expect-error untyped
import extraRoutes from '#nuxt-sitemap/extra-routes.mjs'

export default defineEventHandler(async (e) => {
  const path = parseURL(e.path).pathname
  if (!path.endsWith('-sitemap.xml'))
    return

  const { moduleConfig, buildTimeMeta } = useRuntimeConfig()['nuxt-sitemap'] as any as ModuleRuntimeConfig
  if (!moduleConfig.sitemaps) {
    /// maybe the user is handling their own sitemap?
    return
  }

  const sitemapName = path.replace('-sitemap.xml', '').replace('/', '')
  if (moduleConfig.sitemaps !== true && !moduleConfig.sitemaps[sitemapName])
    return

  const { cachedSitemap, cache } = await setupCache(e, sitemapName)
  let sitemap = cachedSitemap

  if (!sitemap) {
    const nitro = useNitroApp()
    const callHook = async (ctx: SitemapRenderCtx) => {
      await nitro.hooks.callHook('sitemap:resolved', ctx)
    }
    const canonicalQuery = getQuery(e).canonical
    const isShowingCanonical = typeof canonicalQuery !== 'undefined' && canonicalQuery !== 'false'

    // merge urls
    sitemap = await buildSitemap({
      sitemap: {
        sitemapName,
        ...moduleConfig.sitemaps[sitemapName],
      },
      extraRoutes,
      canonicalUrlResolver: createSitePathResolver(e, { canonical: isShowingCanonical || !process.dev, absolute: true, withBase: true }),
      relativeBaseUrlResolver: createSitePathResolver(e, { absolute: false, withBase: true }),
      moduleConfig,
      buildTimeMeta,
      getRouteRulesForPath,
      callHook,
      pages,
    })

    const ctx = { sitemap, sitemapName }
    await nitro.hooks.callHook('sitemap:output', ctx)
    sitemap = ctx.sitemap

    await cache(sitemap)
  }

  // need to clone the config object to make it writable
  setHeader(e, 'Content-Type', 'text/xml; charset=UTF-8')
  if (!process.dev)
    setHeader(e, 'Cache-Control', 'max-age=600, must-revalidate')
  return sitemap
})
