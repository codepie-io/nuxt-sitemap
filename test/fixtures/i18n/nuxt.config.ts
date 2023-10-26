import NuxtSimpleSitemap from '../../../src/module'

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  modules: [
    NuxtSimpleSitemap,
    '@nuxtjs/i18n',
  ],
  site: {
    url: 'https://nuxtseo.com',
  },
  sitemap: {
    dynamicUrlsApiEndpoint: '/__sitemap',
    autoAlternativeLangPrefixes: true,
    autoLastmod: false,
    credits: false,
    debug: true,
  },
  i18n: {
    baseUrl: '',
    detectBrowserLanguage: false,
    defaultLocale: 'en',
    vueI18n: './nuxt-i18n.ts',
    strategy: 'prefix',
    locales: [
      'en',
      'fr',
    ],
  },
})
