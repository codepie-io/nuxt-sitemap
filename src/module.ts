import {
  addPrerenderRoutes,
  addServerHandler,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  extendPages,
  findPath,
  getNuxtModuleVersion,
  hasNuxtModule,
  hasNuxtModuleCompatibility,
  useLogger,
} from '@nuxt/kit'
import { withBase, withoutLeadingSlash } from 'ufo'
import { installNuxtSiteConfig, updateSiteConfig } from 'nuxt-site-config-kit'
import { addCustomTab } from '@nuxt/devtools-kit'
import type { NuxtPage } from 'nuxt/schema'
import type { NuxtI18nOptions } from '@nuxtjs/i18n/dist/module'
import { version } from '../package.json'
import { extendTypes } from './kit'
import type {
  AutoI18nConfig,
  ModuleComputedOptions,
  ModuleRuntimeConfig,
  MultiSitemapsInput,
  NormalisedLocales,
  SitemapEntry,
  SitemapEntryInput,
  SitemapOutputHookCtx,
  SitemapRenderCtx,
  SitemapRoot,
} from './runtime/types'
import {
  convertNuxtPagesToSitemapEntries,
  generateExtraRoutesFromNuxtConfig,
  getNuxtModuleOptions,
} from './utils'
import { setupPrerenderHandler } from './prerender'
import { mergeOnKey } from './runtime/util/pageUtils'

export interface ModuleOptions extends SitemapRoot {
  /**
   * Whether the sitemap.xml should be generated.
   *
   * @default true
   */
  enabled: boolean
  /**
   * Enables debug logs and a debug endpoint.
   *
   * @default false
   */
  debug: boolean
  /**
   * Should lastmod be automatically added to the sitemap.
   *
   * @default true
   */
  autoLastmod: boolean
  /**
   * Should pages be automatically added to the sitemap.
   *
   * @default true
   */
  inferStaticPagesAsRoutes: boolean
  /**
   * Multiple sitemap support for large sites.
   *
   * @default false
   */
  sitemaps?: boolean | MultiSitemapsInput
  /**
   * Path to the xsl that styles sitemap.xml.
   *
   * Set to `false` to disable styling.
   *
   * @default /__sitemap__/style.xsl
   */
  xsl: string | false
  /**
   * Toggle the tips displayed in the xsl.
   *
   * @default true
   */
  xslTips: boolean
  /**
   * Customised the columns displayed in the xsl.
   *
   * @default [{ label: 'URL', width: '50%', select: 'string' }, { label: 'Last Modified', width: '25%', select: 'lastmod' }, { label: 'Change Frequency', width: '25%', select: 'changefreq' }]
   */
  xslColumns?: { label: string; width: `${string}%`; select?: string }[]
  /**
   * When prerendering, should images be automatically be discovered and added to the sitemap.
   *
   * @default true
   */
  discoverImages: boolean
  /**
   * When chunking the sitemaps into multiple files, how many entries should each file contain.
   *
   * Set to `false` to disabling chunking completely.
   *
   * @default 1000
   */
  defaultSitemapsChunkSize: number | false
  /**
   * Modify the cache behavior.
   *
   * Passing a boolean will enable or disable the runtime cache with the default options.
   *
   * Providing a record will allow you to configure the runtime cache fully.
   *
   * @default true
   * @see https://nitro.unjs.io/guide/storage#mountpoints
   * @example { driver: 'redis', host: 'localhost', port: 6379, password: 'password' }
   */
  runtimeCacheStorage: boolean | (Record<string, any> & {
    driver: string
  })
  /**
   * Automatically add alternative links to the sitemap based on a prefix list.
   * Is used by @nuxtjs/i18n to automatically add alternative links to the sitemap.
   *
   * @default `[]`
   *
   * @deprecated Use `autoI18n`
   */
  autoAlternativeLangPrefixes?: boolean | string[]
  /**
   * Automatically add alternative links to the sitemap based on a prefix list.
   * Is used by @nuxtjs/i18n to automatically add alternative links to the sitemap.
   */
  autoI18n?: boolean | AutoI18nConfig
  /**
   * Enable when your nuxt/content files match your pages. This will automatically add sitemap content to the sitemap.
   *
   * This is similar behavior to using `nuxt/content` with `documentDriven: true`.
   */
  strictNuxtContentPaths: boolean
  /**
   * Should the sitemap.xml display credits for the module.
   *
   * @default true
   */
  credits: boolean
  /**
   * How long, in milliseconds, should the sitemap be cached for.
   *
   * @default 1 hour
   */
  cacheTtl: number | false
  /**
   * Should the entries be sorted by loc.
   *
   * @default true
   */
  sortEntries: boolean
  // deprecated
  /**
   * Should the URLs be inserted with a trailing slash.
   *
   * @deprecated Provide `trailingSlash` through site config instead: `{ site: { trailingSlash: <boolean> }}`.
   * This is powered by the `nuxt-site-config` module.
   * @see https://github.com/harlan-zw/nuxt-site-config
   */
  trailingSlash?: boolean

  /**
   * The url of your site.
   * Used to generate absolute URLs for the sitemap paths.
   *
   * Note: This is only required when prerendering your site or when using a canonical host.
   *
   * @deprecated Provide `url` through site config instead: `{ site: { url: <value> }}`.
   * This is powered by the `nuxt-site-config` module.
   * @see https://github.com/harlan-zw/nuxt-site-config
   */
  siteUrl?: string
}

export interface ModuleHooks {
  /**
   * @deprecated use `sitemap:resolved` or `sitemap:output`
   */
  'sitemap:prerender': (ctx: SitemapRenderCtx) => Promise<void> | void
  'sitemap:resolved': (ctx: SitemapRenderCtx) => Promise<void> | void
  'sitemap:output': (ctx: SitemapOutputHookCtx) => Promise<void> | void
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-sitemap',
    compatibility: {
      nuxt: '^3.7.0',
      bridge: false,
    },
    configKey: 'sitemap',
  },
  defaults: {
    enabled: true,
    credits: true,
    cacheTtl: 1000 * 60 * 60, // cache for 60 minutes
    debug: false,
    defaultSitemapsChunkSize: 1000,
    autoLastmod: true,
    inferStaticPagesAsRoutes: true,
    discoverImages: true,
    dynamicUrlsApiEndpoint: '/api/_sitemap-urls',
    urls: [],
    sortEntries: true,
    xsl: '/__sitemap__/style.xsl',
    xslTips: true,
    strictNuxtContentPaths: false,
    runtimeCacheStorage: true,
    sitemapName: 'sitemap.xml',
    // cacheControlHeader: 'max-age=600, must-revalidate',
    defaults: {},
    // index sitemap options filtering
    include: [],
    exclude: [],
  },
  async setup(config, nuxt) {
    const logger = useLogger('nuxt-sitemap')
    logger.level = (config.debug || nuxt.options.debug) ? 4 : 3
    if (config.enabled === false) {
      logger.debug('The module is disabled, skipping setup.')
      return
    }
    config.xslColumns = config.xslColumns || [
      { label: 'URL', width: '50%' },
      { label: 'Images', width: '25%', select: 'count(image:image)' },
      {
        label: 'Last Updated',
        width: '25%',
        select: 'concat(substring(sitemap:lastmod,0,11),concat(\' \', substring(sitemap:lastmod,12,5)),concat(\' \', substring(sitemap:lastmod,20,6)))',
      },
    ]

    const { resolve } = createResolver(import.meta.url)
    // for trailing slashes / absolute urls
    await installNuxtSiteConfig()
    // support deprecated keys
    updateSiteConfig({
      _context: 'nuxt-sitemap:config',
      trailingSlash: config.trailingSlash,
      url: config.siteUrl,
    })

    nuxt.options.nitro.storage = nuxt.options.nitro.storage || {}
    // provide cache storage for prerendering
    if (nuxt.options._generate) {
      nuxt.options.nitro.storage['nuxt-sitemap'] = {
        driver: 'memory',
      }
    }
    else if (config.runtimeCacheStorage && !nuxt.options.dev && typeof config.runtimeCacheStorage === 'object') {
      nuxt.options.nitro.storage['nuxt-sitemap'] = config.runtimeCacheStorage
    }

    if (!config.sitemapName.endsWith('xml')) {
      const newName = `${config.sitemapName.split('.')[0]}.xml`
      logger.warn(`You have provided a \`sitemapName\` that does not end with \`.xml\`. This is not supported by search engines, renaming to \`${newName}\`.`)
      config.sitemapName = newName
    }
    config.sitemapName = withoutLeadingSlash(config.sitemapName)

    if (hasNuxtModule('nuxt-simple-robots')) {
      const robotsVersion = await getNuxtModuleVersion('nuxt-simple-robots')
      // we want to keep versions in sync
      if (!await hasNuxtModuleCompatibility('nuxt-simple-robots', '>=3'))
        logger.warn(`You are using nuxt-simple-robots v${robotsVersion}. For the best compatibility, please upgrade to nuxt-simple-robots v3.0.0 or higher.`)
      // @ts-expect-error untyped
      nuxt.hooks.hook('robots:config', (robotsConfig) => {
        robotsConfig.sitemap.push(config.sitemaps ? '/sitemap_index.xml' : `/${config.sitemapName}`)
      })
    }

    if (typeof config.urls === 'function')
      config.urls = [...await config.urls()]
    else if (Array.isArray(config.urls))
      config.urls = [...await config.urls]

    let isI18nMap = false

    let nuxtI18nConfig: NuxtI18nOptions = {}
    let resolvedAutoI18n: false | AutoI18nConfig = typeof config.autoI18n === 'boolean' ? false : config.autoI18n || false
    const hasDisabledAutoI18n = typeof config.autoI18n === 'boolean' && !config.autoI18n
    let normalisedLocales: NormalisedLocales = []
    if (hasNuxtModule('@nuxtjs/i18n')) {
      const i18nVersion = await getNuxtModuleVersion('@nuxtjs/i18n')
      if (!await hasNuxtModuleCompatibility('@nuxtjs/i18n', '>=8'))
        logger.warn(`You are using @nuxtjs/i18n v${i18nVersion}. For the best compatibility, please upgrade to @nuxtjs/i18n v8.0.0 or higher.`)
      nuxtI18nConfig = (await getNuxtModuleOptions('@nuxtjs/i18n') || {}) as NuxtI18nOptions
      normalisedLocales = mergeOnKey((nuxtI18nConfig.locales || []).map(locale => typeof locale === 'string' ? { code: locale } : locale), 'code')
      const usingI18nPages = Object.keys(nuxtI18nConfig.pages || {}).length
      if (usingI18nPages && !hasDisabledAutoI18n) {
        for (const pageLocales of Object.values(nuxtI18nConfig?.pages as Record<string, Record<string, string>>)) {
          for (const locale in pageLocales) {
            // add root entry for default locale and ignore dynamic routes
            if (!pageLocales[locale] || pageLocales[locale].includes('['))
              continue

            const hreflang = normalisedLocales.find(l => l.code === locale)?.iso || locale
            // add to sitemap
            const alternatives = Object.keys(pageLocales)
              .map(l => ({
                hreflang,
                href: pageLocales[l],
              }))
            if (nuxtI18nConfig.defaultLocale && pageLocales[nuxtI18nConfig.defaultLocale])
              alternatives.push({ hreflang: 'x-default', href: pageLocales[nuxtI18nConfig.defaultLocale] })
            if (Array.isArray(config.urls)) {
              config.urls.push({
                loc: pageLocales[locale],
                alternatives,
              })
            }
          }
        }
      }
      const hasDisabledAlternativePrefixes = typeof config.autoAlternativeLangPrefixes === 'boolean' && !config.autoAlternativeLangPrefixes
      const hasSetAlternativePrefixes = (Array.isArray(config.autoAlternativeLangPrefixes) && config.autoAlternativeLangPrefixes.length) || Object.keys(config.autoAlternativeLangPrefixes || {}).length
      const hasSetAutoI18n = typeof config.autoI18n === 'object' && Object.keys(config.autoI18n).length
      const hasI18nConfigForAlternatives = nuxtI18nConfig.strategy !== 'no_prefix' && nuxtI18nConfig.locales
      if (!hasSetAutoI18n && !hasDisabledAutoI18n && !hasDisabledAlternativePrefixes && hasI18nConfigForAlternatives) {
        if (!hasSetAlternativePrefixes) {
          resolvedAutoI18n = {
            defaultLocale: nuxtI18nConfig.defaultLocale!,
            locales: normalisedLocales,
            strategy: nuxtI18nConfig.strategy as 'prefix' | 'prefix_except_default' | 'prefix_and_default',
          }
        }
        // Array support for backwards compatibility, it's not recommended to use this
        else if (Array.isArray(config.autoAlternativeLangPrefixes)) {
          // convert to object
          resolvedAutoI18n = {
            defaultLocale: nuxtI18nConfig.defaultLocale!,
            locales: config.autoAlternativeLangPrefixes.map(l => ({ code: l })),
            strategy: (nuxtI18nConfig.strategy || 'prefix') as 'prefix' | 'prefix_except_default' | 'prefix_and_default',
          }
        }
      }
      // if they haven't set `sitemaps` explicitly then we can set it up automatically for them
      if (typeof config.sitemaps === 'undefined' && !!resolvedAutoI18n && nuxtI18nConfig.strategy !== 'no_prefix') {
        isI18nMap = true
        config.sitemaps = {}
        for (const locale of resolvedAutoI18n.locales) {
          // if the locale is the default locale and the strategy is prefix_except_default, then we exclude all other locales
          config.sitemaps[locale.iso || locale.code] = {}
        }
      }
    }
    // we may not have pages
    let pages: NuxtPage[] = []
    nuxt.hooks.hook('modules:done', () => {
      extendPages((_pages) => {
        pages = _pages
      })
    })

    const pagesPromise = new Promise<SitemapEntryInput[]>((resolve) => {
      // hook in after the other modules are done
      nuxt.hooks.hook('nitro:config', (nitroConfig) => {
        // @ts-expect-error runtime types
        nitroConfig.virtual['#nuxt-sitemap/pages.mjs'] = async () => {
          const payload = config.inferStaticPagesAsRoutes
            ? convertNuxtPagesToSitemapEntries(pages, {
              autoLastmod: config.autoLastmod,
              defaultLocale: nuxtI18nConfig.defaultLocale || 'en',
              strategy: nuxtI18nConfig.strategy || 'no_prefix',
              routeNameSeperator: nuxtI18nConfig.routesNameSeparator,
              normalisedLocales,
            })
            : []
          resolve(payload)
          return `export default ${JSON.stringify(payload, null, 2)}`
        }
      })
    })

    extendTypes('nuxt-sitemap', async ({ typesPath }) => {
      return `
declare module 'nitropack' {
  interface NitroRouteRules {
    index?: boolean
    sitemap?: import('${typesPath}').SitemapItemDefaults
  }
  interface NitroRouteConfig {
    index?: boolean
    sitemap?: import('${typesPath}').SitemapItemDefaults
  }
  interface NitroRuntimeHooks {
    'sitemap:resolved': (ctx: import('${typesPath}').SitemapRenderCtx) => void | Promise<void>
    'sitemap:output': (ctx: import('${typesPath}').SitemapOutputHookCtx) => void | Promise<void>
  }
}
`
    })
    // check if the user provided route /api/_sitemap-urls exists
    const prerenderedRoutes = (nuxt.options.nitro.prerender?.routes || []) as string[]
    const prerenderSitemap = nuxt.options._generate || prerenderedRoutes.includes(`/${config.sitemapName}`) || prerenderedRoutes.includes('/sitemap_index.xml')
    if (prerenderSitemap) {
      // add route rules for sitemap xmls so they're rendered properly
      const routeRules = {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'Cache-Control': 'max-age=600, must-revalidate',
        },
      }
      nuxt.options.routeRules = nuxt.options.routeRules || {}
      if (config.sitemaps) {
        nuxt.options.routeRules['/sitemap_index.xml'] = routeRules
        if (typeof config.sitemaps === 'object') {
          for (const k in config.sitemaps)
            nuxt.options.routeRules[`/${k}-sitemap.xml`] = routeRules
        }
        else {
          nuxt.options.routeRules[`/${config.sitemapName}`] = routeRules
        }
      }
      else {
        nuxt.options.routeRules[`/${config.sitemapName}`] = routeRules
      }
    }
    const isPrerenderingRoutes = false ;//prerenderedRoutes.length > 0 || !!nuxt.options.nitro.prerender?.crawlLinks
    const buildTimeMeta: ModuleComputedOptions = {
      // @ts-expect-error runtime types
      isNuxtContentDocumentDriven: hasNuxtModule('@nuxt/content') && (!!nuxt.options.content?.documentDriven || config.strictNuxtContentPaths),
      hasApiRoutesUrl: !!(await findPath(resolve(nuxt.options.serverDir, 'api/_sitemap-urls'))) || config.dynamicUrlsApiEndpoint !== '/api/_sitemap-urls',
      hasPrerenderedRoutesPayload: !nuxt.options.dev && !prerenderSitemap && isPrerenderingRoutes,
      prerenderSitemap,
      version,
    }

    const moduleConfig: ModuleRuntimeConfig['moduleConfig'] = {
      isI18nMap,
      autoLastmod: config.autoLastmod,
      xsl: config.xsl,
      xslTips: config.xslTips,
      cacheTtl: config.cacheTtl,
      defaultSitemapsChunkSize: config.defaultSitemapsChunkSize,
      // @ts-expect-error runtime types
      runtimeCacheStorage: typeof config.runtimeCacheStorage === 'boolean' ? 'default' : config.runtimeCacheStorage.driver,
      autoAlternativeLangPrefixes: config.autoAlternativeLangPrefixes,
      credits: config.credits,
      defaults: config.defaults,
      xslColumns: config.xslColumns,
      include: config.include,
      exclude: config.exclude,
      sitemaps: config.sitemaps,
      sitemapName: config.sitemapName,
      sortEntries: config.sortEntries,
      dynamicUrlsApiEndpoint: config.dynamicUrlsApiEndpoint,
      urls: config.urls as SitemapEntry[],
      debug: config.debug,
      // needed for nuxt/content integration
      discoverImages: config.discoverImages,
    }
    if (resolvedAutoI18n)
      moduleConfig.autoI18n = resolvedAutoI18n
    nuxt.options.runtimeConfig['nuxt-sitemap'] = {
      version,
      // @ts-ignore runtime type untyped
      moduleConfig,
      buildTimeMeta,
    }

    if (config.debug || nuxt.options.dev) {
      addServerHandler({
        route: '/api/__sitemap__/debug',
        handler: resolve('./runtime/routes/debug'),
      })
      // pretty hacky but works for now
      addCustomTab({
        // unique identifier
        name: 'nuxt-sitemap',
        // title to display in the tab
        title: 'Sitemap',
        // any icon from Iconify, or a URL to an image
        icon: 'carbon:tree-view',
        // iframe view
        view: {
          type: 'iframe',
          src: '/api/__sitemap__/debug',
        },
      })
    }

    nuxt.hooks.hook('nitro:config', (nitroConfig) => {
      // @ts-expect-error runtime types
      nitroConfig.virtual['#nuxt-sitemap/extra-routes.mjs'] = () => {
        const { prerenderUrls, routeRules } = generateExtraRoutesFromNuxtConfig()
        return [
          // no wild cards supported
          `const routeRules = ${JSON.stringify(routeRules)}`,
          `const prerenderUrls = ${JSON.stringify(prerenderUrls)}`,
          'export default { routeRules, prerenderUrls }',
        ].join('\n')
      }
    })

    // always add the styles
    if (config.xsl === '/__sitemap__/style.xsl') {
      addServerHandler({
        route: config.xsl,
        handler: resolve('./runtime/routes/sitemap.xsl'),
      })
      config.xsl = withBase(config.xsl, nuxt.options.app.baseURL)

      // if (prerenderSitemap)
      //   addPrerenderRoutes(config.xsl)
    }

    // multi sitemap support
    if (config.sitemaps) {
      addServerHandler({
        route: '/sitemap_index.xml',
        handler: resolve('./runtime/routes/sitemap_index.xml'),
      })
      addServerHandler({
        handler: resolve('./runtime/middleware/[sitemap]-sitemap.xml'),
      })
    }

    // either this will redirect to sitemap_index or will render the main sitemap.xml
    addServerHandler({
      route: `/${config.sitemapName}`,
      handler: resolve('./runtime/routes/sitemap.xml'),
    })

    if (buildTimeMeta.isNuxtContentDocumentDriven) {
      addServerPlugin(resolve('./runtime/plugins/nuxt-content'))

      addServerHandler({
        route: '/api/__sitemap__/document-driven-urls',
        handler: resolve('./runtime/routes/document-driven-urls'),
      })
    }

    setupPrerenderHandler(moduleConfig, buildTimeMeta, pagesPromise)
  },
})
